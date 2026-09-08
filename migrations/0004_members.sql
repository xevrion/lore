-- SQLite cannot widen a check constraint in place, so user is rebuilt to admit
-- the member role. Dropping a parent table cascades into its children even with
-- deferred foreign keys, which would wipe every session, so the children are
-- rebuilt first to point at the new table and the old parent is dropped last.
pragma defer_foreign_keys = true;

create table user_new (
  id           text primary key,
  name         text not null,
  role         text not null check (role in ('owner', 'admin', 'member')),
  avatar_key   text,
  color        text not null,
  created_at   text not null,
  revoked_at   text,
  discord_id   text,
  trusted      integer not null default 1,
  banned_at    text
) strict;

insert into user_new (id, name, role, avatar_key, color, created_at, revoked_at, discord_id)
  select id, name, role, avatar_key, color, created_at, revoked_at, discord_id from user;

create table session_new (
  token_hash   text primary key,
  user_id      text not null references user_new(id) on delete cascade,
  created_at   text not null,
  expires_at   text not null,
  last_seen_at text not null,
  user_agent   text
) strict;

insert into session_new select token_hash, user_id, created_at, expires_at, last_seen_at, user_agent
  from session;

drop table session;
alter table session_new rename to session;
create index session_user_idx on session(user_id);

create table invite_new (
  token_hash   text primary key,
  created_by   text not null references user_new(id),
  created_at   text not null,
  expires_at   text not null,
  used_at      text,
  used_by      text references user_new(id)
) strict;

insert into invite_new select token_hash, created_by, created_at, expires_at, used_at, used_by
  from invite;

drop table invite;
alter table invite_new rename to invite;
create index invite_expires_idx on invite(expires_at);

-- Memes gain a review status, a report count and the thumbnail's size so the
-- storage sums are honest.
create table meme_new (
  id           text primary key,
  key          text not null,
  thumb_key    text,
  ext          text not null check (ext in ('png', 'jpg', 'gif', 'webp')),
  mime         text not null,
  width        integer not null,
  height       integer not null,
  size         integer not null,
  title        text not null default '',
  tags         text not null default '',
  uploader_id  text not null references user_new(id),
  created_at   text not null,
  copies       integer not null default 0,
  views        integer not null default 0,
  status       text not null default 'live' check (status in ('live', 'pending', 'hidden')),
  reports      integer not null default 0,
  thumb_size   integer not null default 0
) strict;

insert into meme_new (id, key, thumb_key, ext, mime, width, height, size, title, tags,
    uploader_id, created_at, copies, views)
  select id, key, thumb_key, ext, mime, width, height, size, title, tags,
    uploader_id, created_at, copies, views from meme;

drop table meme;
alter table meme_new rename to meme;
create index meme_created_idx on meme(created_at desc, id desc);
create index meme_copies_idx on meme(copies desc, id desc);
create index meme_status_idx on meme(status, created_at desc);

drop table user;
alter table user_new rename to user;
create unique index user_discord_idx on user(discord_id) where discord_id is not null;

-- One report per address per meme. The address is stored hashed, never raw.
create table report (
  meme_id    text not null references meme(id) on delete cascade,
  ip_hash    text not null,
  created_at text not null,
  primary key (meme_id, ip_hash)
) strict;
