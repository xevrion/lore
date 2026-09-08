# Migrations

Forward-only SQL, applied in order by `wrangler d1 migrations apply lore`. Wrangler
records which files have run in the `d1_migrations` table, so never edit a file
after it has been applied anywhere; add a new one instead.

| File | What it does |
| --- | --- |
| `0001_init.sql` | Users, sessions, invites and memes. |

To add one: create `NNNN_short_name.sql` with the next number, add a row to this
table (CI fails if you forget), then run `pnpm migrate` locally.
