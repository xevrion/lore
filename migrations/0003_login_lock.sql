create table login_lock (
  id           integer primary key check (id = 1),
  failures     integer not null default 0,
  locked_until text
) strict;

insert into login_lock (id, failures, locked_until) values (1, 0, null);
