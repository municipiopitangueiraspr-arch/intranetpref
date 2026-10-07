-- Intranet Municipal · Compras Públicas
-- Aditiva: preserva todos os registros legados e não altera saldos existentes.
-- Backout guidance: ver docs/implantacao-compras.md; não remover colunas/tabelas após gravação sem export e plano de migração.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE TABLE IF NOT EXISTS public.app_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_tenant_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  legacy_orgao_id integer REFERENCES public.orgaos(id) ON DELETE SET NULL,
  nome text NOT NULL,
  sigla text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,legacy_orgao_id),
  UNIQUE (tenant_id,id)
);

CREATE TABLE IF NOT EXISTS public.app_tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  orgao_id integer REFERENCES public.orgaos(id) ON DELETE SET NULL,
  unidade_id uuid,
  role text NOT NULL CHECK (role IN ('tenant_admin','compras_manager','solicitante','leitor','bibliotecario')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS app_tenant_memberships_user_idx ON public.app_tenant_memberships(user_id,ativo);
CREATE INDEX IF NOT EXISTS app_tenant_memberships_orgao_idx ON public.app_tenant_memberships(tenant_id,orgao_id);

CREATE OR REPLACE FUNCTION app_private.current_user_id()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT u.id FROM public.usuarios AS u
  WHERE u.uuid = auth.uid() AND u.ativo IS TRUE
  ORDER BY u.id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_tenant_memberships AS m
    JOIN public.app_tenants AS t ON t.id = m.tenant_id AND t.ativo IS TRUE
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = app_private.current_user_id()
      AND m.ativo IS TRUE
  )
$$;

CREATE OR REPLACE FUNCTION app_private.has_tenant_role(p_tenant_id uuid,p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = app_private.current_user_id()
      AND m.ativo IS TRUE
      AND m.role = ANY(p_roles)
  )
$$;

CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN count(*)=1 THEN (array_agg(m.tenant_id))[1] ELSE NULL END
  FROM public.app_tenant_memberships AS m
  WHERE m.user_id=app_private.current_user_id() AND m.ativo IS TRUE
$$;

CREATE OR REPLACE FUNCTION app_private.can_create_demand(p_tenant_id uuid,p_unidade_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_tenant_memberships AS m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = app_private.current_user_id()
      AND m.ativo IS TRUE
      AND (
        m.role IN ('tenant_admin','compras_manager')
        OR (m.role = 'solicitante' AND m.unidade_id = p_unidade_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_unit(p_tenant_id uuid,p_unidade_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_tenant_memberships AS m
    WHERE m.tenant_id=p_tenant_id
      AND m.user_id=app_private.current_user_id()
      AND m.ativo IS TRUE
      AND (m.role IN ('tenant_admin','compras_manager') OR m.unidade_id=p_unidade_id)
  )
$$;

REVOKE ALL ON FUNCTION app_private.current_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_tenant_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.has_tenant_role(uuid,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_create_demand(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_access_unit(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_role(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_create_demand(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_access_unit(uuid,uuid) TO authenticated;

INSERT INTO public.app_tenants(slug,nome,ativo)
VALUES ('pitangueiras-pr','Município de Pitangueiras - PR',true)
ON CONFLICT (slug) DO UPDATE SET nome=EXCLUDED.nome,ativo=true;

INSERT INTO public.app_tenant_units(tenant_id,legacy_orgao_id,nome,sigla,ativo)
SELECT t.id,o.id,o.nome,o.sigla,coalesce(o.ativo,true)
FROM public.app_tenants AS t
CROSS JOIN public.orgaos AS o
WHERE t.slug='pitangueiras-pr'
ON CONFLICT (tenant_id,legacy_orgao_id) DO UPDATE
SET nome=EXCLUDED.nome,sigla=EXCLUDED.sigla,ativo=EXCLUDED.ativo;

INSERT INTO public.app_tenant_memberships(tenant_id,user_id,orgao_id,unidade_id,role,ativo)
SELECT t.id,u.id,u.orgao_id,tu.id,
       CASE WHEN u.perfil='ADMIN' THEN 'tenant_admin' ELSE 'solicitante' END,
       true
FROM public.app_tenants AS t
CROSS JOIN public.usuarios AS u
LEFT JOIN public.app_tenant_units AS tu ON tu.tenant_id=t.id AND tu.legacy_orgao_id=u.orgao_id
WHERE t.slug='pitangueiras-pr'
  AND u.ativo IS TRUE
  AND u.uuid IS NOT NULL
  AND u.perfil IN ('ADMIN','SECRETARIO')
ON CONFLICT (tenant_id,user_id) DO UPDATE
SET orgao_id=EXCLUDED.orgao_id,unidade_id=EXCLUDED.unidade_id,role=EXCLUDED.role,ativo=true;

CREATE TABLE IF NOT EXISTS public.compras_classificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('tipo_contratacao','modalidade','procedimento','status_processo','documento')),
  nome text NOT NULL,
  descricao text,
  referencia_normativa text,
  vigencia_inicio date,
  vigencia_fim date,
  sugestao boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,tipo,nome)
);

CREATE TABLE IF NOT EXISTS public.compras_demandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  unidade_id uuid NOT NULL,
  numero text,
  objeto text NOT NULL,
  justificativa text NOT NULL,
  prioridade text NOT NULL DEFAULT 'normal',
  valor_estimado numeric(14,2) CHECK (valor_estimado IS NULL OR valor_estimado >= 0),
  data_necessidade date,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'rascunho',
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compras_demandas_tenant_status_idx ON public.compras_demandas(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS compras_demandas_tenant_unidade_idx ON public.compras_demandas(tenant_id,unidade_id);

CREATE TABLE IF NOT EXISTS public.compras_fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo_contratacao text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,nome)
);

CREATE TABLE IF NOT EXISTS public.compras_fluxo_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  fluxo_id uuid NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  situacao text NOT NULL DEFAULT 'rascunho',
  publicada_em timestamptz,
  publicada_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo_id,versao)
);

CREATE TABLE IF NOT EXISTS public.compras_fluxo_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  fluxo_versao_id uuid NOT NULL,
  ordem integer NOT NULL,
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  prazo_dias integer CHECK (prazo_dias IS NULL OR prazo_dias >= 0),
  responsavel_padrao text,
  dependencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_obrigatorios jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_opcionais jsonb NOT NULL DEFAULT '[]'::jsonb,
  condicoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  UNIQUE (fluxo_versao_id,ordem),
  UNIQUE (fluxo_versao_id,codigo)
);

CREATE TABLE IF NOT EXISTS public.compras_processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  demanda_id uuid,
  unidade_id uuid NOT NULL,
  fluxo_versao_id uuid,
  numero_processo text NOT NULL,
  ano integer NOT NULL CHECK (ano BETWEEN 2000 AND 2200),
  numero_edital text,
  objeto text NOT NULL,
  descricao text,
  tipo_contratacao text NOT NULL DEFAULT 'licitacao',
  modalidade text,
  procedimento text,
  fundamento_legal text,
  valor_estimado numeric(14,2) CHECK (valor_estimado IS NULL OR valor_estimado >= 0),
  valor_homologado numeric(14,2) CHECK (valor_homologado IS NULL OR valor_homologado >= 0),
  status text NOT NULL DEFAULT 'planejamento',
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ata_id integer,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  data_abertura date,
  data_homologacao date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,ano,numero_processo)
);
CREATE INDEX IF NOT EXISTS compras_processos_tenant_status_idx ON public.compras_processos(tenant_id,status,ano DESC);
CREATE INDEX IF NOT EXISTS compras_processos_tenant_unidade_idx ON public.compras_processos(tenant_id,unidade_id);

CREATE TABLE IF NOT EXISTS public.compras_pca_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  ano_plano integer NOT NULL CHECK (ano_plano BETWEEN 2000 AND 2200),
  unidade_id uuid NOT NULL,
  processo_id uuid,
  descricao text NOT NULL,
  quantidade numeric(14,3) CHECK (quantidade IS NULL OR quantidade > 0),
  unidade_medida text,
  valor_estimado numeric(14,2) CHECK (valor_estimado IS NULL OR valor_estimado >= 0),
  prioridade text NOT NULL DEFAULT 'normal',
  mes_previsto integer CHECK (mes_previsto IS NULL OR mes_previsto BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'planejado',
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_processos_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  fluxo_etapa_id uuid,
  ordem integer NOT NULL,
  codigo text,
  nome text NOT NULL,
  descricao text,
  dependencias_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  documentos_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  prazo date,
  concluida_em timestamptz,
  concluida_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id,ordem)
);

CREATE TABLE IF NOT EXISTS public.compras_processos_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  item_numero text NOT NULL,
  codigo_catalogo text,
  descricao text NOT NULL,
  descricao_detalhada text,
  especificacao_tecnica text,
  unidade_medida text NOT NULL,
  quantidade_solicitada numeric(14,3) NOT NULL CHECK (quantidade_solicitada > 0),
  valor_unitario_estimado numeric(14,4) CHECK (valor_unitario_estimado IS NULL OR valor_unitario_estimado >= 0),
  quantidade_adjudicada numeric(14,3) CHECK (quantidade_adjudicada IS NULL OR quantidade_adjudicada > 0),
  preco_unitario_adjudicado numeric(14,4) CHECK (preco_unitario_adjudicado IS NULL OR preco_unitario_adjudicado >= 0),
  categoria text,
  lote_numero text,
  status text NOT NULL DEFAULT 'planejado',
  item_ata_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id,item_numero)
);

CREATE TABLE IF NOT EXISTS public.compras_processos_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  fornecedor_id integer NOT NULL,
  situacao text NOT NULL DEFAULT 'participante',
  valor_proposta numeric(14,2) CHECK (valor_proposta IS NULL OR valor_proposta >= 0),
  habilitacao_status text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processo_id,fornecedor_id)
);

CREATE TABLE IF NOT EXISTS public.compras_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  demanda_id uuid,
  processo_id uuid,
  etapa_id uuid,
  tipo_documento text NOT NULL,
  nome text NOT NULL,
  descricao text,
  referencia_url text,
  storage_path text,
  obrigatorio boolean NOT NULL DEFAULT false,
  validade date,
  status text NOT NULL DEFAULT 'pendente',
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (demanda_id IS NOT NULL OR processo_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.compras_pesquisa_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  item_id uuid,
  fonte_tipo text NOT NULL,
  fornecedor_id integer,
  valor_unitario numeric(14,4) NOT NULL CHECK (valor_unitario >= 0),
  data_coleta date NOT NULL,
  condicoes text,
  fonte_url text,
  documento_id uuid,
  memoria_calculo jsonb NOT NULL DEFAULT '{}'::jsonb,
  coletado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  demanda_id uuid,
  processo_id uuid,
  etapa_id uuid,
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pendente',
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  prazo date,
  recorrencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (demanda_id IS NOT NULL OR processo_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS compras_tarefas_tenant_prazo_idx ON public.compras_tarefas(tenant_id,status,prazo);

CREATE TABLE IF NOT EXISTS public.compras_publicacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  canal text NOT NULL,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  data_publicacao date,
  protocolo_externo text,
  url_publica text,
  documento_id uuid,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  comprovante text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  ata_id integer,
  fornecedor_id integer NOT NULL,
  numero text NOT NULL,
  objeto text NOT NULL,
  valor_inicial numeric(14,2) NOT NULL CHECK (valor_inicial >= 0),
  valor_atual numeric(14,2) NOT NULL CHECK (valor_atual >= 0),
  vigencia_inicio date,
  vigencia_fim date,
  gestor_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  fiscal_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  situacao text NOT NULL DEFAULT 'em_formalizacao',
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,numero)
);

CREATE TABLE IF NOT EXISTS public.compras_contrato_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  contrato_id uuid NOT NULL,
  tipo text NOT NULL,
  ocorrido_em date NOT NULL DEFAULT current_date,
  descricao text NOT NULL,
  valor numeric(14,2),
  documento_id uuid,
  registrado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compras_obrigacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid,
  contrato_id uuid,
  origem text NOT NULL,
  descricao text NOT NULL,
  prazo date,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  comprovante_url text,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (processo_id IS NOT NULL OR contrato_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.compras_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  data date NOT NULL,
  nome text NOT NULL,
  abrangencia text NOT NULL DEFAULT 'municipal',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,data,nome)
);

CREATE TABLE IF NOT EXISTS public.compras_eventos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  operacao text NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  ator_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  registro_anterior jsonb,
  registro_novo jsonb
);
CREATE INDEX IF NOT EXISTS compras_eventos_tenant_data_idx ON public.compras_eventos_auditoria(tenant_id,ocorrido_em DESC);


-- Deny-by-default entre migrações; as policies são instaladas no estágio final.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_tenants','app_tenant_units','app_tenant_memberships','compras_classificacoes','compras_demandas','compras_fluxos',
    'compras_fluxo_versoes','compras_fluxo_etapas','compras_processos','compras_pca_itens',
    'compras_processos_etapas','compras_processos_itens','compras_processos_fornecedores',
    'compras_documentos','compras_pesquisa_precos','compras_tarefas','compras_publicacoes',
    'compras_contratos','compras_contrato_eventos','compras_obrigacoes','compras_feriados','compras_eventos_auditoria'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
