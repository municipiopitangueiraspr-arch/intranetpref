-- Compras Públicas — materialização operacional de subetapas.
-- Novos processos recebem um snapshot; processos existentes não são reescritos.

ALTER TABLE public.compras_fluxo_subetapas
  ADD CONSTRAINT compras_fluxo_subetapas_tenant_id_unique UNIQUE (tenant_id,id);

CREATE TABLE IF NOT EXISTS public.compras_processos_subetapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL REFERENCES public.compras_processos(id) ON DELETE CASCADE,
  processo_etapa_id uuid NOT NULL,
  fluxo_subetapa_id uuid,
  ordem integer NOT NULL CHECK (ordem > 0),
  codigo text,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida','bloqueada','cancelada')),
  prazo date,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  dependencias_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  concluida_em timestamptz,
  concluida_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_etapa_id,ordem),
  FOREIGN KEY (tenant_id,processo_etapa_id) REFERENCES public.compras_processos_etapas(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,processo_id) REFERENCES public.compras_processos(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,fluxo_subetapa_id) REFERENCES public.compras_fluxo_subetapas(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS compras_processos_subetapas_processo_idx ON public.compras_processos_subetapas(tenant_id,processo_id,processo_etapa_id,ordem);
ALTER TABLE public.compras_processos_subetapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY compras_processos_subetapas_read ON public.compras_processos_subetapas FOR SELECT TO authenticated
  USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_processos_subetapas_manage ON public.compras_processos_subetapas FOR ALL TO authenticated
  USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']))
  WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
REVOKE ALL ON public.compras_processos_subetapas FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compras_processos_subetapas TO authenticated;
