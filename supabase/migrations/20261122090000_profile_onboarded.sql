-- Let's Split: first-run onboarding marker.
alter table public.profiles add column onboarded_at timestamptz;
-- Everyone who already has a group has effectively onboarded.
update public.profiles p set onboarded_at = now()
 where exists (select 1 from public.group_members m where m.user_id = p.id);
grant update (onboarded_at) on public.profiles to authenticated;
