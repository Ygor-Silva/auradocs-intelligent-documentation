
-- =========================================================
-- WORKSPACES
-- =========================================================
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Workspace',
  slug text UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 10),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid,
  invited_email text,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')) DEFAULT 'editor',
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (workspace_id, user_id),
  UNIQUE (workspace_id, invited_email)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_email ON public.workspace_members(invited_email);

-- =========================================================
-- SECURITY DEFINER HELPERS (avoid RLS recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND accepted_at IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.workspace_role(_workspace_id uuid, _user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = _workspace_id AND user_id = _user_id AND accepted_at IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_default_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members
  WHERE user_id = _user_id AND accepted_at IS NOT NULL
  ORDER BY invited_at ASC LIMIT 1
$$;

-- =========================================================
-- WORKSPACES RLS
-- =========================================================
CREATE POLICY "Members view their workspaces" ON public.workspaces
FOR SELECT TO authenticated
USING (public.is_workspace_member(id, auth.uid()) OR owner_id = auth.uid());

CREATE POLICY "Authenticated create workspaces" ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Admins update workspace" ON public.workspaces
FOR UPDATE TO authenticated
USING (public.workspace_role(id, auth.uid()) = 'admin' OR owner_id = auth.uid());

CREATE POLICY "Owner deletes workspace" ON public.workspaces
FOR DELETE TO authenticated
USING (owner_id = auth.uid());

-- WORKSPACE_MEMBERS RLS
CREATE POLICY "Members view roster" ON public.workspace_members
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Admins manage members" ON public.workspace_members
FOR ALL TO authenticated
USING (public.workspace_role(workspace_id, auth.uid()) = 'admin')
WITH CHECK (public.workspace_role(workspace_id, auth.uid()) = 'admin');

CREATE POLICY "User accepts own invite" ON public.workspace_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR (invited_email IS NOT NULL AND invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())));

-- =========================================================
-- DOCUMENTS: add workspace, folder, tags, favorite
-- =========================================================
ALTER TABLE public.documents
  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN folder_name text NOT NULL DEFAULT 'Geral',
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX idx_documents_workspace ON public.documents(workspace_id);
CREATE INDEX idx_documents_folder ON public.documents(workspace_id, folder_name);
CREATE INDEX idx_documents_tags ON public.documents USING GIN(tags);

-- Backfill: create personal workspace per existing owner
DO $$
DECLARE
  rec record;
  new_ws uuid;
BEGIN
  FOR rec IN SELECT DISTINCT owner_id FROM public.documents WHERE workspace_id IS NULL LOOP
    INSERT INTO public.workspaces (name, owner_id)
    VALUES ('My Workspace', rec.owner_id)
    RETURNING id INTO new_ws;

    INSERT INTO public.workspace_members (workspace_id, user_id, role, accepted_at)
    VALUES (new_ws, rec.owner_id, 'admin', now());

    UPDATE public.documents SET workspace_id = new_ws WHERE owner_id = rec.owner_id AND workspace_id IS NULL;
  END LOOP;
END $$;

-- Update documents RLS to use workspace membership
DROP POLICY IF EXISTS "Users view own docs" ON public.documents;
DROP POLICY IF EXISTS "Users create own docs" ON public.documents;
DROP POLICY IF EXISTS "Users update own docs" ON public.documents;
DROP POLICY IF EXISTS "Users delete own docs" ON public.documents;

CREATE POLICY "Workspace members view docs" ON public.documents
FOR SELECT TO authenticated
USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace editors create docs" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND public.workspace_role(workspace_id, auth.uid()) IN ('admin','editor')
);

CREATE POLICY "Workspace editors update docs" ON public.documents
FOR UPDATE TO authenticated
USING (public.workspace_role(workspace_id, auth.uid()) IN ('admin','editor'));

CREATE POLICY "Workspace admins delete docs" ON public.documents
FOR DELETE TO authenticated
USING (public.workspace_role(workspace_id, auth.uid()) = 'admin' OR owner_id = auth.uid());

-- =========================================================
-- PUBLIC SHARES
-- =========================================================
CREATE TABLE public.public_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  share_token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view shares" ON public.public_shares
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.is_workspace_member(d.workspace_id, auth.uid())
));

CREATE POLICY "Editors create shares" ON public.public_shares
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND public.workspace_role(d.workspace_id, auth.uid()) IN ('admin','editor')
  )
);

CREATE POLICY "Editors revoke shares" ON public.public_shares
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.workspace_role(d.workspace_id, auth.uid()) IN ('admin','editor')
));

-- Public read function (no auth) for share resolution
CREATE OR REPLACE FUNCTION public.get_shared_document(_token text)
RETURNS TABLE (id uuid, title text, content text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id, d.title, d.content, d.updated_at
  FROM public.public_shares ps
  JOIN public.documents d ON d.id = ps.document_id
  WHERE ps.share_token = _token
    AND (ps.expires_at IS NULL OR ps.expires_at > now())
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_document(text) TO anon, authenticated;

-- =========================================================
-- DOC VERSIONS (Visual Diff)
-- =========================================================
CREATE TABLE public.doc_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  title text,
  author_id uuid,
  author_kind text NOT NULL CHECK (author_kind IN ('user','aura_ai')) DEFAULT 'user',
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_versions_doc ON public.doc_versions(document_id, created_at DESC);

CREATE POLICY "Workspace members view versions" ON public.doc_versions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.is_workspace_member(d.workspace_id, auth.uid())
));

CREATE POLICY "Workspace editors insert versions" ON public.doc_versions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.workspace_role(d.workspace_id, auth.uid()) IN ('admin','editor')
));

-- =========================================================
-- doc_contributions RLS update (workspace based)
-- =========================================================
DROP POLICY IF EXISTS "Users view own contributions" ON public.doc_contributions;
DROP POLICY IF EXISTS "Users insert contributions on own docs" ON public.doc_contributions;

CREATE POLICY "Workspace members view contributions" ON public.doc_contributions
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.is_workspace_member(d.workspace_id, auth.uid())
));

CREATE POLICY "Workspace editors insert contributions" ON public.doc_contributions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.workspace_role(d.workspace_id, auth.uid()) IN ('admin','editor')
));

-- =========================================================
-- New user trigger: auto-create personal workspace
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_ws uuid;
  pending record;
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'editor');

  -- Personal workspace
  INSERT INTO public.workspaces (name, owner_id)
  VALUES ('My Workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, accepted_at)
  VALUES (new_ws, NEW.id, 'admin', now());

  -- Auto-accept pending invites by email
  FOR pending IN
    SELECT id, workspace_id FROM public.workspace_members
    WHERE invited_email = NEW.email AND user_id IS NULL
  LOOP
    UPDATE public.workspace_members
    SET user_id = NEW.id, accepted_at = now()
    WHERE id = pending.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at triggers
CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.doc_contributions;
