-- Search used to scan every row with like '%term%'. This index answers the same
-- query in one lookup. It carries the meme id rather than relying on rowid, which
-- SQLite may renumber on VACUUM for tables without an integer primary key.
create virtual table meme_fts using fts5(id unindexed, title, tags);

insert into meme_fts (id, title, tags) select id, title, tags from meme;

create trigger meme_fts_insert after insert on meme begin
  insert into meme_fts (id, title, tags) values (new.id, new.title, new.tags);
end;

create trigger meme_fts_delete after delete on meme begin
  delete from meme_fts where id = old.id;
end;

create trigger meme_fts_update after update of title, tags on meme begin
  delete from meme_fts where id = old.id;
  insert into meme_fts (id, title, tags) values (new.id, new.title, new.tags);
end;
