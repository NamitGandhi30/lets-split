-- Let's Split, phase 2 ("Core"): invites and joining, placeholder claiming, editing expenses,
-- the alerts feed's read marker, and Realtime "changed" pings on the activity table.

-- ---------- invites ----------

-- What someone sees on an invite link before joining. Row level security hides the group until
-- you're a member, so this reads it as the definer, and only ever returns the group behind a
-- valid code: its name, look, active members and the placeholders you could claim.
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  g public.groups%rowtype;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into g from public.groups where invite_code = p_code;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'group_id', g.id,
    'name', g.name,
    'accent', g.accent,
    'emoji', g.emoji,
    'location', g.location,
    'starts_on', g.starts_on,
    'ends_on', g.ends_on,
    'archived', g.archived_at is not null,
    'already_member', exists (
      select 1 from public.group_members m where m.group_id = g.id and m.user_id = me and m.removed_at is null
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'display_name', m.display_name,
               'avatar_key', coalesce(m.avatar_key, p.avatar_key),
               'placeholder', m.user_id is null
             ) order by m.created_at)
      from public.group_members m
      left join public.profiles p on p.id = m.user_id
      where m.group_id = g.id and m.removed_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- Join the group behind an invite code, optionally claiming a placeholder member so everything
-- already recorded against that placeholder becomes yours. Safe to call twice.
create or replace function public.join_group(p_code text, p_claim_member uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gid uuid;
  mine public.group_members%rowtype;
  my_name text;
  my_avatar text;
  claimed uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select g.id into gid from public.groups g where g.invite_code = p_code and g.archived_at is null;
  if gid is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  -- Serialise joins per group so two people can't claim the same placeholder at once.
  perform 1 from public.groups g where g.id = gid for update;

  select * into mine from public.group_members m where m.group_id = gid and m.user_id = me;
  if found and mine.removed_at is null then
    return jsonb_build_object('group_id', gid, 'member_id', mine.id, 'already_member', true);
  end if;

  if p_claim_member is not null then
    if mine.id is not null then
      -- A removed member re-joining can't also take someone else's placeholder.
      raise exception 'you were in this group before; rejoin without claiming' using errcode = '22023';
    end if;
    update public.group_members m
       set user_id = me, joined_at = now()
     where m.id = p_claim_member and m.group_id = gid and m.user_id is null and m.removed_at is null
    returning m.id into claimed;
    if claimed is null then
      raise exception 'that spot was already claimed' using errcode = '23505';
    end if;
    return jsonb_build_object('group_id', gid, 'member_id', claimed, 'already_member', false);
  end if;

  if mine.id is not null then
    update public.group_members m set removed_at = null, joined_at = now() where m.id = mine.id;
    return jsonb_build_object('group_id', gid, 'member_id', mine.id, 'already_member', false);
  end if;

  select p.display_name, p.avatar_key into my_name, my_avatar from public.profiles p where p.id = me;
  insert into public.group_members (group_id, user_id, display_name, avatar_key, role, joined_at, added_by)
  values (gid, me, coalesce(my_name, 'Friend'), my_avatar, 'member', now(), me)
  returning id into claimed;
  return jsonb_build_object('group_id', gid, 'member_id', claimed, 'already_member', false);
end;
$$;

-- New invite code; the old link stops working. Any current member may rotate it.
create or replace function public.rotate_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if not private.is_group_member(p_group) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

revoke all on function public.invite_preview(text), public.join_group(text, uuid), public.rotate_invite(uuid) from public, anon;
grant execute on function public.invite_preview(text), public.join_group(text, uuid), public.rotate_invite(uuid) to authenticated;

-- ---------- editing expenses ----------

-- Amount and split may change, but only through update_expense, which rewrites payers and shares
-- in the same transaction (the deferred totals trigger still checks they add up).
grant update (amount_paise, split_type, split_meta) on public.expenses to authenticated;

create or replace function public.update_expense(
  p_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_split_type public.split_type,
  p_payers jsonb,
  p_shares jsonb,
  p_split_meta jsonb default '{}'::jsonb,
  p_category text default null,
  p_spent_at timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  gid uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select e.group_id into gid from public.expenses e where e.id = p_id and e.deleted_at is null;
  if gid is null then
    raise exception 'expense not found' using errcode = 'P0002';
  end if;

  update public.expenses e
     set description = p_description,
         amount_paise = p_amount_paise,
         split_type = p_split_type,
         split_meta = coalesce(p_split_meta, '{}'::jsonb),
         category = p_category,
         spent_at = coalesce(p_spent_at, e.spent_at),
         notes = p_notes
   where e.id = p_id;

  delete from public.expense_payers where expense_id = p_id;
  delete from public.expense_shares where expense_id = p_id;

  insert into public.expense_payers (expense_id, group_id, member_id, amount_paise)
  select p_id, gid, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint from jsonb_array_elements(p_payers) x;
  insert into public.expense_shares (expense_id, group_id, member_id, amount_paise)
  select p_id, gid, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint from jsonb_array_elements(p_shares) x;

  return p_id;
end;
$$;

revoke all on function public.update_expense(uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text) from public, anon;
grant execute on function public.update_expense(uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text) to authenticated;

-- ---------- comments in the feed ----------

create or replace function private.log_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity (group_id, actor_id, kind, entity_id, data)
  select new.group_id, (select auth.uid()), 'comment.added', new.expense_id,
         jsonb_build_object('description', e.description, 'body', left(new.body, 120))
  from public.expenses e where e.id = new.expense_id;
  return null;
end;
$$;
revoke all on function private.log_comment() from public, anon, authenticated;

create trigger comments_log after insert on public.comments
  for each row execute function private.log_comment();

-- ---------- alerts read marker ----------

alter table public.profiles add column activity_seen_at timestamptz not null default now();
grant update (activity_seen_at) on public.profiles to authenticated;

-- ---------- Realtime ----------
-- The app listens for inserts on activity (row level security applies) only as a "something
-- changed" ping, then refetches through the REST API.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity;
  end if;
end $$;
