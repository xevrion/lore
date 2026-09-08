-- Members now wait for a staff approval before they can upload. Anyone who was
-- already a member is grandfathered in; staff never use this column.
alter table user add column approved_at text;

update user set approved_at = created_at where role = 'member';
