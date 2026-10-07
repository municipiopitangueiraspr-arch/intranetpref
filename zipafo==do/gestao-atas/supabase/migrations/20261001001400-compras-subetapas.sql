-- Compras Públicas — subetapas configuráveis por versão de fluxo.
-- Não altera etapas/processos já materializados; subetapas passam a ser usadas em novas configurações.

CREATE TABLE IF NOT EXISTS public.compras_fluxo_subetapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  fluxo_etapa_id uuid NOT NULL REFERENCES public.compras_fluxo_etapas(id) ON DELETE CASCADE,
  ordem integer NOT NULL CHECK (ordem > 0),
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias >= 0),
  responsavel_padrao text,
  dependencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_obrigatorios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo_etapa_id,ordem),
  UNIQUE (fluxo_etapa_id,codigo)
);
CREATE INDEX IF NOT EXISTS compras_fluxo_subetapas_tenant_etapa_idx
  ON public.compras_fluxo_subetapas(tenant_id,fluxo_etapa_id,ordem);

ALTER TABLE public.compras_fluxo_subetapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_fluxo_subetapas_read ON public.compras_fluxo_subetapas FOR SELECT TO authenticated
  USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_fluxo_subetapas_manage ON public.compras_fluxo_subetapas FOR ALL TO authenticated
  USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']))
  WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
REVOKE ALL ON public.compras_fluxo_subetapas FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compras_fluxo_subetapas TO authenticated;
