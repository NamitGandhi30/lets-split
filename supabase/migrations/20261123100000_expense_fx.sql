-- Let's Split: expenses paid in another currency.
-- The ledger stays in INR (amount_paise, payers, shares), so balances and UPI settle-up are
-- unchanged. fx keeps what was actually on the bill and the rate used to convert it:
--   { "currency": "USD", "amount": 20.5, "rate": 84.12, "at": "2026-11-23T10:00:00Z" }
-- where rate is rupees per one unit of the currency. Null means the expense was entered in INR.

alter table public.expenses add column fx jsonb;
alter table public.expenses add constraint expenses_fx_shape check (
  fx is null or (
    jsonb_typeof(fx) = 'object'
    and fx ? 'currency' and fx ? 'amount' and fx ? 'rate'
    and jsonb_typeof(fx -> 'amount') = 'number'
    and jsonb_typeof(fx -> 'rate') = 'number'
  )
);
grant update (fx) on public.expenses to authenticated;

-- Both RPCs gain p_fx with a default, so an API that doesn't send it keeps working.
drop function public.create_expense(uuid, uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, char);

create function public.create_expense(
  p_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_split_type public.split_type,
  p_payers jsonb,
  p_shares jsonb,
  p_split_meta jsonb default '{}'::jsonb,
  p_category text default null,
  p_spent_at timestamptz default now(),
  p_notes text default null,
  p_currency char(3) default 'INR',
  p_fx jsonb default null
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
                               split_meta, spent_at, notes, created_by, fx)
  values (p_id, p_group_id, p_description, p_category, p_amount_paise, p_currency, p_split_type,
          coalesce(p_split_meta, '{}'::jsonb), coalesce(p_spent_at, now()), p_notes, me, p_fx);

  insert into public.expense_payers (expense_id, group_id, member_id, amount_paise)
  select p_id, p_group_id, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint
  from jsonb_array_elements(p_payers) x;

  insert into public.expense_shares (expense_id, group_id, member_id, amount_paise)
  select p_id, p_group_id, (x ->> 'member_id')::uuid, (x ->> 'amount_paise')::bigint
  from jsonb_array_elements(p_shares) x;

  return jsonb_build_object('id', p_id, 'replayed', false);
end;
$$;

revoke all on function public.create_expense(uuid, uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, char, jsonb) from public, anon;
grant execute on function public.create_expense(uuid, uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, char, jsonb) to authenticated;

drop function public.update_expense(uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text);

create function public.update_expense(
  p_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_split_type public.split_type,
  p_payers jsonb,
  p_shares jsonb,
  p_split_meta jsonb default '{}'::jsonb,
  p_category text default null,
  p_spent_at timestamptz default null,
  p_notes text default null,
  p_fx jsonb default null
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
         notes = p_notes,
         fx = p_fx
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

revoke all on function public.update_expense(uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, jsonb) from public, anon;
grant execute on function public.update_expense(uuid, text, bigint, public.split_type, jsonb, jsonb, jsonb, text, timestamptz, text, jsonb) to authenticated;
