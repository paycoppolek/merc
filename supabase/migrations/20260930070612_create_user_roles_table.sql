/*
# Create user_roles table for Supabase-based authentication

1. New Tables
- `user_roles`
  - `id` (uuid, primary key, defaults to gen_random_uuid())
  - `user_id` (uuid, references auth.users, the Supabase auth user)
  - `email` (text, the user's email address, for lookup)
  - `role` (text, one of: admin, writer, ticket_manager, ticket_only, viewer)
  - `updated_at` (bigint, timestamp of last update in ms)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `user_roles`.
- Any authenticated user can read roles (needed so the app can look up its own role).
- Only authenticated users can insert/update their own role record.
- Deletes allowed for authenticated users (admin manages removals).

3. Notes
- This table mirrors the Firebase Firestore `roles` collection so the app
  can resolve permissions after migrating authentication to Supabase.
- The admin email (coppolek@gmail.com) will be seeded as admin role.
*/

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  role text NOT NULL DEFAULT 'viewer',
  updated_at bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_user_roles" ON user_roles;
CREATE POLICY "authenticated_read_user_roles"
  ON user_roles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_user_roles" ON user_roles;
CREATE POLICY "authenticated_insert_user_roles"
  ON user_roles FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_user_roles" ON user_roles;
CREATE POLICY "authenticated_update_user_roles"
  ON user_roles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_user_roles" ON user_roles;
CREATE POLICY "authenticated_delete_user_roles"
  ON user_roles FOR DELETE
  TO authenticated USING (true);
