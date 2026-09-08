create table login_lock_ip (
  ip_hash      text primary key,
  failures     integer not null default 0,
  locked_until text
) strict;
