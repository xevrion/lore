# Migrations

Forward-only SQL, applied in order by `wrangler d1 migrations apply lore`. Wrangler
records which files have run in the `d1_migrations` table, so never edit a file
after it has been applied anywhere; add a new one instead.

| File | What it does |
| --- | --- |
| `0001_init.sql` | Users, sessions, invites and memes. |
| `0002_discord.sql` | Optional Discord account link on users. |
| `0003_login_lock.sql` | Single row tracking failed owner logins for the lockout. |
| `0004_members.sql` | Member role, trust and ban on users; review status, report count and thumbnail size on memes; report dedupe table. |
| `0005_login_lock_ip.sql` | Per-address lockout rows for the owner login. |
| `0006_meme_fts.sql` | Full-text index over titles and tags, kept in step by triggers. |

To add one: create `NNNN_short_name.sql` with the next number, add a row to this
table (CI fails if you forget), then run `pnpm migrate` locally.
