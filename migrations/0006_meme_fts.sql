-- Search used to scan every row with like '%term%'. This index answers the same
-- query in one lookup. It carries the meme id rather than relying on rowid, which
-- SQLite may renumber on VACUUM for tables without an integer primary key.
--
-- No triggers: wrangler's remote migration runner splits statements on
-- semicolons, which breaks trigger bodies, so application code keeps the index
-- in step (lib/fts.ts). Idempotent, so a database that ran the earlier
-- trigger-based version of this file ends up identical.
create virtual table if not exists meme_fts using fts5(id unindexed, title, tags);

drop trigger if exists meme_fts_insert;
drop trigger if exists meme_fts_delete;
drop trigger if exists meme_fts_update;

delete from meme_fts;

insert into meme_fts (id, title, tags) select id, title, tags from meme;
