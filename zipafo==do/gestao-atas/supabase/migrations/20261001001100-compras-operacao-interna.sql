-- Compras Públicas — operação interna incremental.
-- Pacote aditivo: favoritos, acessos recentes, notificações internas,
-- versões de documentos e eventos estruturados de execução contratual.
-- Não integra portais externos, não altera dados existentes e não remove colunas.

CREATE TABLE IF NOT EXISTS public.compras_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  entidade text NOT NULL CHECK (entidade IN ('processo','demanda','contrato','pca','publicacao','tarefa','obrigacao')),
  entidade_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,usuario_id,entidade,entidade_id)
);
CREATE INDEX IF NOT EXISTS compras_favoritos_usuario_idx
  ON public.compras_favoritos(tenant_id,usuario_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.compras_acessos_recentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  entidade text NOT NULL CHECK (entidade IN ('processo','demanda','contrato','pca','publicacao','tarefa','obrigacao')),
  entidade_id uuid NOT NULL,
  acessado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,usuario_id,entidade,entidade_id)
);
CREATE INDEX IF NOT EXISTS compras_acessos_recentes_usuario_idx
  ON public.compras_acessos_recentes(tenant_id,usuario_id,acessado_em DESC);

CREATE TABLE IF NOT EXISTS public.compras_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('prazo','tarefa','obrigacao','designacao','sistema')),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  mensagem text NOT NULL CHECK (length(trim(mensagem)) > 0),
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  entidade text CHECK (entidade IS NULL OR entidade IN ('processo','demanda','contrato','pca','publicacao','tarefa','obrigacao')),
  entidade_id uuid,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compras_notificacoes_usuario_idx
  ON public.compras_notificacoes(tenant_id,usuario_id,lida_em,created_at DESC);

CREATE TABLE IF NOT EXISTS public.compras_documento_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  documento_id uuid NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  nome text NOT NULL,
  descricao text,
  referencia_url text,
  storage_path text,
  mime_type text,
  tamanho_bytes bigint CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0),
  hash_sha256 text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','vigente','substituida','cancelada')),
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,documento_id,versao),
  FOREIGN KEY (tenant_id,documento_id)
    REFERENCES public.compras_documentos(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS compras_documento_versoes_documento_idx
  ON public.compras_documento_versoes(tenant_id,documento_id,versao DESC);

CREATE TABLE IF NOT EXISTS public.compras_execucoes_contratuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  contrato_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('medicao','atesto','entrega','aditivo','reajuste','ocorrencia','sancao','encerramento')),
  status text NOT NULL DEFAULT 'registrado' CHECK (status IN ('rascunho','pendente','em_analise','aprovado','rejeitado','registrado','encerrado')),
  ocorrido_em date NOT NULL DEFAULT current_date,
  descricao text NOT NULL CHECK (length(trim(descricao)) > 0),
  valor_anterior numeric(14,2) CHECK (valor_anterior IS NULL OR valor_anterior >= 0),
  valor_novo numeric(14,2) CHECK (valor_novo IS NULL OR valor_novo >= 0),
  vigencia_inicio_anterior date,
  vigencia_fim_anterior date,
  vigencia_inicio_nova date,
  vigencia_fim_nova date,
  documento_id uuid,
  registrado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,contrato_id)
    REFERENCES public.compras_contratos(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,documento_id)
    REFERENCES public.compras_documentos(tenant_id,id) ON DELETE RESTRICT,
  CHECK (vigencia_fim_nova IS NULL OR vigencia_inicio_nova IS NULL OR vigencia_fim_nova >= vigencia_inicio_nova)
);
CREATE INDEX IF NOT EXISTS compras_execucoes_contrato_data_idx
  ON public.compras_execucoes_contratuais(tenant_id,contrato_id,ocorrido_em DESC,created_at DESC);

ALTER TABLE public.compras_favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_acessos_recentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_documento_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_execucoes_contratuais ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_favoritos_self ON public.compras_favoritos FOR ALL TO authenticated
  USING (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id))
  WITH CHECK (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_acessos_recentes_self ON public.compras_acessos_recentes FOR ALL TO authenticated
  USING (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id))
  WITH CHECK (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_notificacoes_self ON public.compras_notificacoes FOR SELECT TO authenticated
  USING (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_notificacoes_mark_read ON public.compras_notificacoes FOR UPDATE TO authenticated
  USING (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id))
  WITH CHECK (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_documento_versoes_read ON public.compras_documento_versoes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=compras_documento_versoes.tenant_id AND d.id=compras_documento_versoes.documento_id
      AND app_private.has_tenant_access(d.tenant_id)
  ));
CREATE POLICY compras_documento_versoes_manage ON public.compras_documento_versoes FOR INSERT TO authenticated
  WITH CHECK (criado_por=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_execucoes_contratuais_read ON public.compras_execucoes_contratuais FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.compras_contratos c
    WHERE c.tenant_id=compras_execucoes_contratuais.tenant_id AND c.id=compras_execucoes_contratuais.contrato_id
      AND app_private.has_tenant_access(c.tenant_id)
  ));
CREATE POLICY compras_execucoes_contratuais_manage ON public.compras_execucoes_contratuais FOR ALL TO authenticated
  USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']))
  WITH CHECK (registrado_por=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

REVOKE ALL ON public.compras_favoritos,public.compras_acessos_recentes,public.compras_notificacoes,
  public.compras_documento_versoes,public.compras_execucoes_contratuais FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compras_favoritos,public.compras_acessos_recentes TO authenticated;
GRANT SELECT,UPDATE ON public.compras_notificacoes TO authenticated;
GRANT SELECT,INSERT ON public.compras_documento_versoes TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compras_execucoes_contratuais TO authenticated;

CREATE TRIGGER compras_documento_versoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_documento_versoes
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_execucoes_contratuais_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_execucoes_contratuais
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
