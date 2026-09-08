alter table user add column discord_id text;

create unique index user_discord_idx on user(discord_id) where discord_id is not null;
