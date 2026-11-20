-- Covering indexes for foreign keys flagged by the performance advisor.
create index expense_payers_expense_group_idx on public.expense_payers (expense_id, group_id);
create index expense_shares_expense_group_idx on public.expense_shares (expense_id, group_id);
create index expenses_receipt_group_idx on public.expenses (receipt_id, group_id);
drop index if exists public.expenses_receipt_idx;
create index group_members_added_by_idx on public.group_members (added_by);
create index groups_created_by_idx on public.groups (created_by);
create index item_claims_item_group_idx on public.item_claims (item_id, group_id);
create index receipts_created_by_idx on public.receipts (created_by);
