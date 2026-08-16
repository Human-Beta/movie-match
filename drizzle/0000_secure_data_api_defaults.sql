-- Keep the Data API opt-in. Server-side Drizzle access uses the database role
-- from DATABASE_URL and is not affected by these browser-facing role grants.
revoke select, insert, update, delete
on all tables in schema public
from anon, authenticated, service_role;

revoke usage, select
on all sequences in schema public
from anon, authenticated, service_role;

revoke execute
on all functions in schema public
from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from public;
