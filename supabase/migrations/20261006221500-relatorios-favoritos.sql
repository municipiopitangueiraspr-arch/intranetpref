-- Favoritos pessoais da Central de Análises (controle-de-saldos).
-- As políticas RLS restringem cada registro ao usuário e tenant da sessão.
CREATE TABLE IF NOT EXISTS public.relatorios_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT app_private.current_tenant_id()
    REFERENCES public.app_tenants(id),
  usuario_id integer NOT NULL DEFAULT app_private.current_user_id()
    REFERENCES public.usuarios(id) ON DELETE CASCADE,
  relatorio_id text NOT NULL CHECK (btrim(relatorio_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relatorios_favoritos_tenant_usuario_relatorio_key
    UNIQUE (tenant_id, usuario_id, relatorio_id)
);

ALTER TABLE public.relatorios_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorios_favoritos_usuario ON public.relatorios_favoritos;
CREATE POLICY relatorios_favoritos_usuario
  ON public.relatorios_favoritos
  FOR ALL
  TO authenticated
  USING (
    usuario_id = app_private.current_user_id()
    AND app_private.has_tenant_access(tenant_id)
  )
  WITH CHECK (
    usuario_id = app_private.current_user_id()
    AND app_private.has_tenant_access(tenant_id)
  );

REVOKE ALL ON TABLE public.relatorios_favoritos FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.relatorios_favoritos TO authenticated;
GRANT ALL ON TABLE public.relatorios_favoritos TO service_role;

COMMENT ON TABLE public.relatorios_favoritos IS
  'Relatórios marcados como favoritos por usuários da Central de Análises.';
