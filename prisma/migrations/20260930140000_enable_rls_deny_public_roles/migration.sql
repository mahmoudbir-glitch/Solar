-- Enable RLS on the two tables that hold inverter and site configuration.
--
-- Enabling RLS is the control that matters: with RLS on and no policy granting
-- access, every non-owner role is denied. The table owner (the role the app
-- connects as) is unaffected, so the application keeps working.
--
-- The deny-all policies below name the Supabase roles `anon` and
-- `authenticated`. Those roles exist on Supabase but NOT on a plain
-- PostgreSQL or Prisma Postgres database, where `CREATE POLICY ... TO anon`
-- aborts with `role "anon" does not exist` and takes the whole migration with
-- it. That is what failed in production on 2026-09-30, leaving the database
-- with a failed migration that blocked every later deploy (P3009).
--
-- Each policy is therefore created only when its role is actually present.
ALTER TABLE "InverterConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EnergySettings" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
  target_role text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['InverterConnection', 'EnergySettings'] LOOP
    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      policy_name := 'Deny all to ' || target_role;

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, target_table);

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I FOR ALL TO %I USING (false) WITH CHECK (false)',
          policy_name, target_table, target_role
        );
      ELSE
        RAISE NOTICE 'Role % not present; RLS alone denies it. Skipping policy on %.',
          target_role, target_table;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
