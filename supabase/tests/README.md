# Database tests

`rls_two_accounts.sql` checks row level security with two real accounts (alice@lets-split.test and
bob@lets-split.test). Run it in the SQL editor or through the Supabase MCP `execute_sql` tool.
It impersonates each user as the `authenticated` role, prints every check, and always ends with
`RAISE EXCEPTION`, so nothing it writes is kept. Every line should end in `t` or `true`.

Last run (2026-11-20): all 23 checks passed.
