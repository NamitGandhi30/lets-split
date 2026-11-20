-- Let's Split: multi-table writes as Postgres functions, so each one is a single transaction.
-- They run as the caller (security invoker), so row level security still applies inside them.

-- Create a group and add the caller as its owner. Replaying the same id returns the same group.
create or replace function public.create_group(
  p_id uuid,
  p_name text,
  p_emoji text default null,
  p_accent text default null,
  p_type public.group_type default 'trip',
  p_location text default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_currency char(3) default 'INR'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_name text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.groups g where g.id = p_id and g.created_by = me) then
    return p_id; -- idempotent replay
  end if;

  select p.display_name into my_name from public.profiles p where p.id = me;

  insert into public.groups (id, name, emoji, accent, type, location, starts_on, ends_on, currency, created_by)
  values (p_id, p_name, p_emoji, p_accent, p_type, p_location, p_starts_on, p_ends_on, p_currency, me);

  insert into public.group_members (group_id, user_id, display_name, role, joined_at)
  values (p_id, me, coalesce(my_name, 'Me'), 'owner', now());

  return p_id;
end;
$$;

-- Create an expense with its payers and shares (computed and validated by the API with
-- packages/core; the totals trigger re-checks them). Replaying the same id returns the
-- existing expense instead of creating a duplicate.
create or replace function public.create_expense(
  p_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_split_type public.split_type,
  p_payers jsonb,  -- [{ "member_id": uuid, "amount_paise": int }]
  p_shares jsonb,  -- [{ "member_id": uuid, "amount_paise": int }]
  p_split_meta jsonb default '{}'::jsonb,
  p_category text default null,
  p_spent_at timestamptz default now(),
  p_notes text default null,
  p_currency char(3) default 'INR'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  existing public.expenses%rowtype;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into existing from public.expenses e where e.id = p_id;
  if found then
    if existing.group_id <> p_group_id then
      raise exception 'expense id already used' using errcode = '23505';
    end if;
    return jsonb_build_object('id', existing.id, 'replayed', true);
  end if;

  insert into public.expenses (id, group_id, description, category, amount_paise, currency, split_type,
                               split_meta, spent_at, notes, created_by)
  values (p_id, p_group_id, p_description, p_category, p_amount_paise, p_currency, p_split_type,
          coalesce(p_split_meta, '{}'::jsonb), coalesce(p_spent_at, now()), p_notes, me);

  insert into public.expense_payers (expense_id, group_id, member_id, amount_paise)
  select p_id, p_group_id, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint
  from jsonb_array_elements(p_payers) x;

  insert into public.expense_shares (expense_id, group_id, member_id, amount_paise)
  select p_id, p_group_id, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint
  from jsonb_array_elements(p_shares) x;

  return jsonb_build_object('id', p_id, 'replayed', false);
end;
$$;

revoke all on function public.create_group(uuid, text, text, text, public.group_type, text, date, date, char) from public, anon;
grant execute on function public.create_group(uuid, text, text, text, public.group_type, text, date, date, char) to authenticated;

revoke all on function public.create_expense(uuid, uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, char) from public, anon;
grant execute on function public.create_expense(uuid, uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, char) to authenticated;
