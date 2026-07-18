-- Local dev only: give the supabase service roles a known password so the
-- sibling containers (gotrue, postgrest, storage-api) can connect.
ALTER USER authenticator WITH PASSWORD 'postgres';
ALTER USER supabase_auth_admin WITH PASSWORD 'postgres';
ALTER USER supabase_storage_admin WITH PASSWORD 'postgres';
