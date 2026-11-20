-- Let's Split: helpers, triggers, row level security and grants.
-- Helpers live in the unexposed `private` schema. Policies call private.is_group_member().

grant usage on schema private to authenticated;

-- ---------- helpers ----------

create or replace function private.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.removed_at is null
  );
$$;

create or replace function private.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.removed_at is null and m.role = 'owner'
  );
$$;

-- The creator may add themselves as the first (owner) member of a group they just created.
create or replace function private.can_bootstrap_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.id = gid and g.created_by = (select auth.uid()))
     and not exists (select 1 from public.group_members m where m.group_id = gid and m.user_id is not null);
$$;

-- Can the current user see this profile? Yes for themselves and anyone they share a group with.
create or replace function private.shares_group_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select other = (select auth.uid()) or exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = (select auth.uid()) and me.removed_at is null
      and them.user_id = other and them.removed_at is null
  );
$$;

revoke all on function private.is_group_member(uuid), private.is_group_owner(uuid),
  private.can_bootstrap_group(uuid), private.shares_group_with(uuid) from public, anon;
grant execute on function private.is_group_member(uuid), private.is_group_owner(uuid),
  private.can_bootstrap_group(uuid), private.shares_group_with(uuid) to authenticated;

-- ---------- triggers ----------

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger groups_touch before update on public.groups for each row execute function private.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function private.touch_updated_at();
create trigger receipts_touch before update on public.receipts for each row execute function private.touch_updated_at();

-- New account -> profile, named after the email until they pick a name.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(split_part(new.email, '@', 1), ''), 'Friend'), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- An expense's payers and shares must each add up to its amount. Checked at commit time, so the
-- expense and its rows can be written in any order inside one transaction, by any code path.
create or replace function private.check_expense_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
  amt bigint;
  paid bigint;
  owed bigint;
begin
  if tg_table_name = 'expenses' then
    eid := coalesce(new.id, old.id);
  elsif tg_op = 'DELETE' then
    eid := old.expense_id;
  else
    eid := new.expense_id;
  end if;

  select e.amount_paise into amt from public.expenses e where e.id = eid;
  if not found then
    return null; -- the expense itself is gone (cascade)
  end if;
  select coalesce(sum(p.amount_paise), 0) into paid from public.expense_payers p where p.expense_id = eid;
  select coalesce(sum(s.amount_paise), 0) into owed from public.expense_shares s where s.expense_id = eid;
  if paid <> amt or owed <> amt then
    raise exception 'expense % does not add up: amount %, paid %, shares %', eid, amt, paid, owed
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_totals after insert or update of amount_paise on public.expenses
  deferrable initially deferred for each row execute function private.check_expense_totals();
create constraint trigger expense_payers_totals after insert or update or delete on public.expense_payers
  deferrable initially deferred for each row execute function private.check_expense_totals();
create constraint trigger expense_shares_totals after insert or update or delete on public.expense_shares
  deferrable initially deferred for each row execute function private.check_expense_totals();

-- Activity feed + expense history.
create or replace function private.log_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  op text;
  kind text;
begin
  if tg_op = 'INSERT' then
    op := 'insert'; kind := 'expense.added';
  elsif new.deleted_at is not null and old.deleted_at is null then
    op := 'delete'; kind := 'expense.deleted';
  elsif new.deleted_at is null and old.deleted_at is not null then
    op := 'restore'; kind := 'expense.restored';
  else
    op := 'update'; kind := 'expense.edited';
  end if;

  insert into public.expense_history (expense_id, group_id, actor_id, op, before, after)
  values (new.id, new.group_id, (select auth.uid()), op,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));

  insert into public.activity (group_id, actor_id, kind, entity_id, data)
  values (new.group_id, (select auth.uid()), kind, new.id,
          jsonb_build_object('description', new.description, 'amount_paise', new.amount_paise));
  return null;
end;
$$;

create trigger expenses_log after insert or update on public.expenses
  for each row execute function private.log_expense();

create or replace function private.log_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity (group_id, actor_id, kind, entity_id, data)
  values (new.group_id, (select auth.uid()),
          case when tg_op = 'INSERT' then 'settlement.added' else 'settlement.deleted' end, new.id,
          jsonb_build_object('from_member', new.from_member, 'to_member', new.to_member,
                             'amount_paise', new.amount_paise, 'method', new.method));
  return null;
end;
$$;

create trigger settlements_log after insert or update of deleted_at on public.settlements
  for each row execute function private.log_settlement();

create or replace function private.log_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text;
begin
  if tg_op = 'INSERT' then
    kind := 'member.added';
  elsif new.removed_at is not null and old.removed_at is null then
    kind := 'member.removed';
  elsif new.user_id is not null and old.user_id is null then
    kind := 'member.claimed';
  else
    return null;
  end if;
  insert into public.activity (group_id, actor_id, kind, entity_id, data)
  values (new.group_id, (select auth.uid()), kind, new.id,
          jsonb_build_object('display_name', new.display_name, 'placeholder', new.user_id is null));
  return null;
end;
$$;

create trigger group_members_log after insert or update on public.group_members
  for each row execute function private.log_member();

revoke all on function private.touch_updated_at(), private.handle_new_user(), private.check_expense_totals(),
  private.log_expense(), private.log_settlement(), private.log_member() from public, anon, authenticated;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_shares enable row level security;
alter table public.receipt_items enable row level security;
alter table public.item_claims enable row level security;
alter table public.settlements enable row level security;
alter table public.split_presets enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;
alter table public.expense_history enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
create policy "profiles: read self and groupmates" on public.profiles
  for select to authenticated using (private.shares_group_with(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups
create policy "groups: members read" on public.groups
  for select to authenticated using (private.is_group_member(id) or created_by = (select auth.uid()));
create policy "groups: create as self" on public.groups
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "groups: members update" on public.groups
  for update to authenticated using (private.is_group_member(id)) with check (private.is_group_member(id));
create policy "groups: owner deletes" on public.groups
  for delete to authenticated using (private.is_group_owner(id));

-- group_members: members add placeholders; the creator adds themselves once as owner.
create policy "members: members read" on public.group_members
  for select to authenticated using (private.is_group_member(group_id));
create policy "members: add placeholder or bootstrap owner" on public.group_members
  for insert to authenticated with check (
    (user_id is null and role = 'member' and private.is_group_member(group_id))
    or (user_id = (select auth.uid()) and role = 'owner' and private.can_bootstrap_group(group_id))
  );
create policy "members: members update" on public.group_members
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));

-- money tables: any current member of the group
create policy "expenses: members read" on public.expenses
  for select to authenticated using (private.is_group_member(group_id));
create policy "expenses: members add" on public.expenses
  for insert to authenticated with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "expenses: members update" on public.expenses
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));

create policy "payers: members read" on public.expense_payers
  for select to authenticated using (private.is_group_member(group_id));
create policy "payers: members write" on public.expense_payers
  for insert to authenticated with check (private.is_group_member(group_id));
create policy "payers: members delete" on public.expense_payers
  for delete to authenticated using (private.is_group_member(group_id));

create policy "shares: members read" on public.expense_shares
  for select to authenticated using (private.is_group_member(group_id));
create policy "shares: members write" on public.expense_shares
  for insert to authenticated with check (private.is_group_member(group_id));
create policy "shares: members delete" on public.expense_shares
  for delete to authenticated using (private.is_group_member(group_id));

create policy "settlements: members read" on public.settlements
  for select to authenticated using (private.is_group_member(group_id));
create policy "settlements: members add" on public.settlements
  for insert to authenticated with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "settlements: members update" on public.settlements
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));

create policy "receipts: members read" on public.receipts
  for select to authenticated using (private.is_group_member(group_id));
create policy "receipts: members add" on public.receipts
  for insert to authenticated with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "receipts: members update" on public.receipts
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));

create policy "items: members read" on public.receipt_items
  for select to authenticated using (private.is_group_member(group_id));
create policy "items: members add" on public.receipt_items
  for insert to authenticated with check (private.is_group_member(group_id));
create policy "items: members update" on public.receipt_items
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy "items: members delete" on public.receipt_items
  for delete to authenticated using (private.is_group_member(group_id));

create policy "claims: members read" on public.item_claims
  for select to authenticated using (private.is_group_member(group_id));
create policy "claims: members add" on public.item_claims
  for insert to authenticated with check (private.is_group_member(group_id));
create policy "claims: members delete" on public.item_claims
  for delete to authenticated using (private.is_group_member(group_id));

create policy "presets: members read" on public.split_presets
  for select to authenticated using (private.is_group_member(group_id));
create policy "presets: members add" on public.split_presets
  for insert to authenticated with check (private.is_group_member(group_id) and created_by = (select auth.uid()));
create policy "presets: members update" on public.split_presets
  for update to authenticated using (private.is_group_member(group_id)) with check (private.is_group_member(group_id));
create policy "presets: members delete" on public.split_presets
  for delete to authenticated using (private.is_group_member(group_id));

create policy "comments: members read" on public.comments
  for select to authenticated using (private.is_group_member(group_id));
create policy "comments: members add as self" on public.comments
  for insert to authenticated with check (private.is_group_member(group_id) and author_id = (select auth.uid()));
create policy "comments: author updates" on public.comments
  for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

-- trigger-written tables are read-only for people
create policy "activity: members read" on public.activity
  for select to authenticated using (private.is_group_member(group_id));
create policy "history: members read" on public.expense_history
  for select to authenticated using (private.is_group_member(group_id));

create policy "idempotency: own keys read" on public.idempotency_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "idempotency: own keys add" on public.idempotency_keys
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "push: own read" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push: own add" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push: own delete" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- grants ----------
-- Nothing is reachable signed out. Signed-in users only get the columns they may change.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_key, avatar_url, upi_id, no_upi) on public.profiles to authenticated;

revoke update on public.groups from authenticated;
grant update (name, emoji, accent, type, location, starts_on, ends_on, simplify_debts, archived_at) on public.groups to authenticated;

revoke update on public.group_members from authenticated;
grant update (display_name, avatar_key, removed_at) on public.group_members to authenticated;

revoke update on public.expenses from authenticated;
grant update (description, category, notes, spent_at, deleted_at) on public.expenses to authenticated;

revoke update on public.settlements from authenticated;
grant update (note, deleted_at) on public.settlements to authenticated;

revoke update on public.receipts from authenticated;
grant update (status, merchant, parsed, printed_total_paise, storage_path) on public.receipts to authenticated;

revoke update on public.comments from authenticated;
grant update (body, deleted_at) on public.comments to authenticated;

revoke insert, update, delete on public.activity, public.expense_history from authenticated;
revoke update, delete on public.idempotency_keys from authenticated;
