create table user (
  id           text primary key,
  name         text not null,
  role         text not null check (role in ('owner', 'admin')),
  avatar_key   text,
  color        text not null,
  created_at   text not null,
  revoked_at   text
) strict;

create table session (
  token_hash   text primary key,
  user_id      text not null references user(id) on delete cascade,
  created_at   text not null,
  expires_at   text not null,
  last_seen_at text not null,
  user_agent   text
) strict;

create table invite (
  token_hash   text primary key,
  created_by   text not null references user(id),
  created_at   text not null,
  expires_at   text not null,
  used_at      text,
  used_by      text references user(id)
) strict;

create table meme (
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
  uploader_id  text not null references user(id),
  created_at   text not null,
  copies       integer not null default 0,
  views        integer not null default 0
) strict;

create index meme_created_idx on meme(created_at desc, id desc);
create index meme_copies_idx on meme(copies desc, id desc);
create index session_user_idx on session(user_id);
create index invite_expires_idx on invite(expires_at);
