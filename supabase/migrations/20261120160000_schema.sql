-- Let's Split: core schema.
-- Money is always bigint paise. Every child row carries group_id, and composite foreign keys make
-- sure a payer, share, settlement or claim can only point at members of the same group.

create schema if not exists private;

create type public.group_type as enum ('trip', 'home', 'couple', 'other');
create type public.member_role as enum ('owner', 'member');
create type public.split_type as enum ('equal', 'exact', 'percent', 'shares', 'adjustment', 'itemized');
create type public.settle_method as enum ('upi', 'cash', 'other');
create type public.receipt_status as enum ('uploaded', 'scanning', 'parsed', 'failed', 'finalized');

-- People with an account. Filled by a trigger when someone signs up.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_key text,                         -- one of the doodle avatars, e.g. 'you', 'diya'
  avatar_url text,                         -- uploaded photo (Storage path) instead of a doodle
  upi_id text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$'),
  no_upi boolean not null default false,   -- "I don't have a UPI ID"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),       -- client-generated, doubles as idempotency key
  name text not null check (char_length(name) between 1 and 60),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  accent text check (accent is null or accent ~ '^#[0-9A-Fa-f]{6}$'),
  type public.group_type not null default 'trip',
  currency char(3) not null default 'INR',
  location text check (location is null or char_length(location) <= 80),
  starts_on date,
  ends_on date,
  simplify_debts boolean not null default true,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- Members of a group. user_id is null for placeholder members (cousins who haven't joined yet);
-- they claim the row when they join, and their history stays attached.
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_key text,
  role public.member_role not null default 'member',
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, user_id),
  unique (id, group_id)
);
create index group_members_user_idx on public.group_members (user_id) where user_id is not null;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  storage_path text,
  status public.receipt_status not null default 'uploaded',
  merchant text,
  parsed jsonb,
  printed_total_paise bigint check (printed_total_paise is null or printed_total_paise >= 0),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);
create index receipts_group_idx on public.receipts (group_id);

create table public.expenses (
  id uuid primary key,                                 -- client-generated, doubles as idempotency key
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  category text check (category is null or char_length(category) <= 32),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 10000000000),
  currency char(3) not null default 'INR',
  fx_rate numeric(18, 8) not null default 1 check (fx_rate > 0),
  split_type public.split_type not null,
  split_meta jsonb not null default '{}'::jsonb,       -- the original input (percents, weights, adjustments)
  spent_at timestamptz not null default now(),
  notes text check (notes is null or char_length(notes) <= 1000),
  receipt_id uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, group_id),
  foreign key (receipt_id, group_id) references public.receipts (id, group_id)
);
create index expenses_group_spent_idx on public.expenses (group_id, spent_at desc) where deleted_at is null;
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_receipt_idx on public.expenses (receipt_id) where receipt_id is not null;

create table public.expense_payers (
  expense_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0),
  primary key (expense_id, member_id),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade,
  foreign key (member_id, group_id) references public.group_members (id, group_id)
);
create index expense_payers_group_idx on public.expense_payers (group_id);
create index expense_payers_member_idx on public.expense_payers (member_id, group_id);

create table public.expense_shares (
  expense_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  amount_paise bigint not null check (amount_paise >= 0),
  primary key (expense_id, member_id),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade,
  foreign key (member_id, group_id) references public.group_members (id, group_id)
);
create index expense_shares_group_idx on public.expense_shares (group_id);
create index expense_shares_member_idx on public.expense_shares (member_id, group_id);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  group_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  quantity numeric(10, 3) not null default 1 check (quantity > 0),
  amount_paise bigint not null check (amount_paise >= 0),
  position int not null default 0,
  unique (id, group_id),
  foreign key (receipt_id, group_id) references public.receipts (id, group_id) on delete cascade
);
create index receipt_items_receipt_idx on public.receipt_items (receipt_id, group_id);

-- Live dish claiming: who ate what. Shared dishes have several claims.
create table public.item_claims (
  item_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  weight numeric(8, 3) not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  primary key (item_id, member_id),
  foreign key (item_id, group_id) references public.receipt_items (id, group_id) on delete cascade,
  foreign key (member_id, group_id) references public.group_members (id, group_id)
);
create index item_claims_group_idx on public.item_claims (group_id);
create index item_claims_member_idx on public.item_claims (member_id, group_id);

create table public.settlements (
  id uuid primary key,                                 -- client-generated, doubles as idempotency key
  group_id uuid not null references public.groups (id) on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 10000000000),
  method public.settle_method not null default 'upi',
  note text check (note is null or char_length(note) <= 200),
  settled_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_member <> to_member),
  foreign key (from_member, group_id) references public.group_members (id, group_id),
  foreign key (to_member, group_id) references public.group_members (id, group_id)
);
create index settlements_group_idx on public.settlements (group_id) where deleted_at is null;
create index settlements_from_idx on public.settlements (from_member, group_id);
create index settlements_to_idx on public.settlements (to_member, group_id);
create index settlements_created_by_idx on public.settlements (created_by);

-- One-tap split presets: "Everyone", "Food only", "Drinks", or custom weights.
create table public.split_presets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  member_weights jsonb not null default '{}'::jsonb,   -- { member_id: weight }
  position int not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index split_presets_group_idx on public.split_presets (group_id);
create index split_presets_created_by_idx on public.split_presets (created_by);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id uuid not null,
  author_id uuid not null default auth.uid() references public.profiles (id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade
);
create index comments_expense_idx on public.comments (expense_id, group_id);
create index comments_group_idx on public.comments (group_id);
create index comments_author_idx on public.comments (author_id);

-- Written only by triggers.
create table public.activity (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,                                  -- expense.added, expense.deleted, settlement.added, member.added ...
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_group_idx on public.activity (group_id, created_at desc);
create index activity_actor_idx on public.activity (actor_id);

-- Written only by triggers: who changed what on an expense.
create table public.expense_history (
  id bigint generated always as identity primary key,
  expense_id uuid not null,
  group_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  op text not null check (op in ('insert', 'update', 'delete', 'restore')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade
);
create index expense_history_expense_idx on public.expense_history (expense_id, group_id);
create index expense_history_group_idx on public.expense_history (group_id);
create index expense_history_actor_idx on public.expense_history (actor_id);

-- Replays of the same Idempotency-Key return the stored response instead of writing twice.
create table public.idempotency_keys (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key uuid not null,
  method text not null,
  path text not null,
  status int not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
