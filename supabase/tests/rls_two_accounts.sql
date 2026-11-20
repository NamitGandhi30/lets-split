-- RLS check with two accounts. Always rolls back (ends with RAISE EXCEPTION carrying the results).
do $t$
declare
  alice uuid := (select id from auth.users where email = 'alice@lets-split.test');
  bob   uuid := (select id from auth.users where email = 'bob@lets-split.test');
  g uuid := gen_random_uuid();
  gb uuid := gen_random_uuid();
  m_alice uuid; m_ph uuid; m_bob uuid;
  e uuid := gen_random_uuid();
  n int; r jsonb; code text;
  out text[] := '{}';
begin
  if alice is null or bob is null then raise exception 'create the two test users first'; end if;
  execute 'set local role authenticated';

  -- ===== Alice =====
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.create_group(g, 'Goa ''26', null, '#F4D23C');
  perform public.create_group(g, 'Goa ''26', null, '#F4D23C'); -- replay
  select count(*) into n from public.groups where id = g; out := out || format('alice sees own group (replay ok): %s', n = 1);
  select id into m_alice from public.group_members where group_id = g and user_id = alice;
  out := out || format('alice is owner member: %s', m_alice is not null);
  insert into public.group_members (group_id, display_name) values (g, 'Rohan (placeholder)') returning id into m_ph;
  out := out || format('alice adds placeholder: %s', m_ph is not null);

  r := public.create_expense(e, g, 'Villa', 300000, 'equal',
        jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 300000)),
        jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 150000), jsonb_build_object('member_id', m_ph, 'amount_paise', 150000)));
  execute 'set constraints all immediate'; execute 'set constraints all deferred';
  out := out || format('alice creates expense: %s', r ->> 'replayed' = 'false');
  r := public.create_expense(e, g, 'Villa', 300000, 'equal', '[]', '[]');
  out := out || format('expense replay is idempotent: %s', r ->> 'replayed' = 'true');
  select count(*) into n from public.activity where group_id = g; out := out || format('activity rows written by triggers: %s', n);

  begin
    perform public.create_expense(gen_random_uuid(), g, 'Bad', 1000, 'equal',
        jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 1000)),
        jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 900)));
    execute 'set constraints all immediate';
    out := out || 'unbalanced expense rejected: false';
  exception when others then out := out || format('unbalanced expense rejected: true (%s)', sqlstate); end;
  execute 'set constraints all deferred';

  -- ===== Bob (not a member) =====
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.groups where id = g;              out := out || format('bob cannot see group: %s', n = 0);
  select count(*) into n from public.group_members where group_id = g; out := out || format('bob cannot see members: %s', n = 0);
  select count(*) into n from public.expenses where group_id = g;      out := out || format('bob cannot see expenses: %s', n = 0);
  select count(*) into n from public.expense_shares where group_id = g; out := out || format('bob cannot see shares: %s', n = 0);
  select count(*) into n from public.activity where group_id = g;      out := out || format('bob cannot see activity: %s', n = 0);
  select count(*) into n from public.profiles where id = alice;        out := out || format('bob cannot see alice profile: %s', n = 0);

  begin
    insert into public.group_members (group_id, user_id, display_name, role) values (g, bob, 'Bob', 'owner');
    out := out || 'bob cannot join as owner: false';
  exception when others then out := out || format('bob cannot join as owner: true (%s)', sqlstate); end;
  begin
    insert into public.group_members (group_id, display_name) values (g, 'sneaky');
    out := out || 'bob cannot add placeholder: false';
  exception when others then out := out || format('bob cannot add placeholder: true (%s)', sqlstate); end;
  begin
    perform public.create_expense(gen_random_uuid(), g, 'Hack', 1000, 'equal',
      jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 1000)),
      jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 1000)));
    out := out || 'bob cannot add expense: false';
  exception when others then out := out || format('bob cannot add expense: true (%s)', sqlstate); end;
  update public.expenses set description = 'pwned' where id = e; get diagnostics n = row_count;
  out := out || format('bob cannot edit expense: %s', n = 0);
  delete from public.groups where id = g; get diagnostics n = row_count;
  out := out || format('bob cannot delete group: %s', n = 0);
  begin
    perform public.create_expense(e, gb, 'Steal id', 1000, 'equal', '[]', '[]');
    out := out || 'bob cannot reuse an expense id: false';
  exception when others then out := out || format('bob cannot reuse an expense id: true (%s)', sqlstate); end;

  -- Bob's own group: cross-group member ids are rejected by the composite foreign keys.
  perform public.create_group(gb, 'Bob trip');
  select id into m_bob from public.group_members where group_id = gb and user_id = bob;
  begin
    perform public.create_expense(gen_random_uuid(), gb, 'Cross', 1000, 'equal',
      jsonb_build_array(jsonb_build_object('member_id', m_bob, 'amount_paise', 1000)),
      jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 1000)));
    out := out || 'cross-group member rejected: false';
  exception when others then out := out || format('cross-group member rejected: true (%s)', sqlstate); end;
  begin
    update public.groups set invite_code = 'x' where id = gb;
    out := out || 'invite_code not writable: false';
  exception when others then out := out || format('invite_code not writable: true (%s)', sqlstate); end;

  -- ===== Alice again =====
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.groups; out := out || format('alice sees only her group: %s', n = 1);
  update public.expenses set deleted_at = now() where id = e; get diagnostics n = row_count;
  out := out || format('alice can soft-delete her expense: %s', n = 1);

  -- ===== Phase 2: invites, claiming, edits =====
  begin
    perform public.update_expense(e, 'Villa', 300000, 'equal',
      jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 300000)),
      jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 300000)));
    out := out || 'update_expense refuses a deleted expense: false';
  exception when others then out := out || format('update_expense refuses a deleted expense: true (%s)', sqlstate); end;
  update public.expenses set deleted_at = null where id = e;
  perform public.update_expense(e, 'Villa 2', 400000, 'equal',
    jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 400000)),
    jsonb_build_array(jsonb_build_object('member_id', m_alice, 'amount_paise', 200000), jsonb_build_object('member_id', m_ph, 'amount_paise', 200000)));
  execute 'set constraints all immediate'; execute 'set constraints all deferred';
  select count(*) into n from public.expense_history where expense_id = e and op = 'update';
  out := out || format('alice edits via update_expense, history kept: %s', n >= 1);
  code := public.rotate_invite(g);
  out := out || format('alice rotates invite: %s', code is not null);

  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  begin
    perform public.rotate_invite(g);
    out := out || 'bob cannot rotate alice invite: false';
  exception when others then out := out || format('bob cannot rotate alice invite: true (%s)', sqlstate); end;
  out := out || format('bad code previews nothing: %s', public.invite_preview('000000000000') is null);
  r := public.invite_preview(code);
  out := out || format('bob previews via code: %s', (r ->> 'name') = 'Goa ''26' and jsonb_array_length(r -> 'members') = 2);
  select count(*) into n from public.groups where id = g; out := out || format('bob still cannot read group before joining: %s', n = 0);
  begin
    perform public.update_expense(e, 'Hack', 1, 'equal', '[]', '[]');
    out := out || 'bob cannot edit before joining: false';
  exception when others then out := out || format('bob cannot edit before joining: true (%s)', sqlstate); end;
  r := public.join_group(code, m_ph);
  out := out || format('bob claims placeholder: %s', (r ->> 'member_id')::uuid = m_ph);
  select count(*) into n from public.expense_shares where group_id = g and member_id = m_ph;
  out := out || format('bob sees history he inherited: %s', n = 1);
  begin
    perform public.join_group(code, m_alice);
    out := out || format('second join is a no-op: %s', true);
  exception when others then out := out || format('second join is a no-op: false (%s)', sqlstate); end;
  begin
    update public.group_members set user_id = bob where id = m_alice;
    out := out || 'bob cannot hijack member user_id: false';
  exception when others then out := out || format('bob cannot hijack member user_id: true (%s)', sqlstate); end;

  raise exception E'RLS RESULTS (rolled back)\n%', array_to_string(out, E'\n');
end $t$;
