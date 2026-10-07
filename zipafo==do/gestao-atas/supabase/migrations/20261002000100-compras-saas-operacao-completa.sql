-- Compras Públicas — camada SaaS operacional completa (aditiva)
-- Não altera saldos/atas legados. Integrações externas usam fila auditável; nenhum segredo é armazenado no browser.

CREATE TABLE IF NOT EXISTS public.compras_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  fornecedor_id integer NOT NULL,
  situacao text NOT NULL DEFAULT 'recebida' CHECK (situacao IN ('convite','recebida','em_analise','classificada','desclassificada','vencedora','recusada')),
  valor_global numeric(14,2) CHECK (valor_global IS NULL OR valor_global >= 0),
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  validade_proposta date,
  documento_id uuid,
  observacoes text,
  recebida_em timestamptz NOT NULL DEFAULT now(),
  analisada_em timestamptz,
  analisada_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,processo_id) REFERENCES public.compras_processos(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,fornecedor_id) REFERENCES public.fornecedores(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE (tenant_id,processo_id,fornecedor_id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS compras_propostas_processo_idx ON public.compras_propostas(tenant_id,processo_id,situacao,created_at DESC);

CREATE TABLE IF NOT EXISTS public.compras_recursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  proposta_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('impugnacao','recurso','contrarrazao','pedido_esclarecimento','manifestacao')),
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','em_analise','deferido','indeferido','parcialmente_deferido','encerrado')),
  recorrente text NOT NULL,
  protocolo text,
  fundamentacao text NOT NULL,
  decisao text,
  prazo date,
  protocolado_em timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  documento_id uuid,
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,processo_id) REFERENCES public.compras_processos(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,proposta_id) REFERENCES public.compras_propostas(tenant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS compras_recursos_processo_idx ON public.compras_recursos(tenant_id,processo_id,situacao,prazo);

CREATE TABLE IF NOT EXISTS public.compras_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  entidade text NOT NULL CHECK (entidade IN ('documento','contrato','ata','decisao','artefato')),
  entidade_id uuid NOT NULL,
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','solicitada','assinada','recusada','cancelada')),
  assinante_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  nome_assinante text,
  cargo_assinante text,
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  assinado_em timestamptz,
  referencia_externa text,
  observacao text,
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compras_assinaturas_entidade_idx ON public.compras_assinaturas(tenant_id,entidade,entidade_id,situacao);

CREATE TABLE IF NOT EXISTS public.compras_delegacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  origem_usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  destino_usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  escopo jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text NOT NULL,
  inicio date NOT NULL,
  fim date,
  ativo boolean NOT NULL DEFAULT true,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR fim >= inicio),
  CHECK (origem_usuario_id <> destino_usuario_id)
);
CREATE INDEX IF NOT EXISTS compras_delegacoes_ativas_idx ON public.compras_delegacoes(tenant_id,origem_usuario_id,ativo,inicio,fim);

CREATE TABLE IF NOT EXISTS public.compras_escalonamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  entidade text NOT NULL CHECK (entidade IN ('processo','etapa','tarefa','obrigacao','contrato')),
  entidade_id uuid NOT NULL,
  nivel integer NOT NULL DEFAULT 1 CHECK (nivel > 0),
  responsavel_origem_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  responsavel_destino_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  situacao text NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto','reconhecido','resolvido','cancelado')),
  escalonado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz,
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compras_escalonamentos_abertos_idx ON public.compras_escalonamentos(tenant_id,situacao,escalonado_em DESC);

CREATE TABLE IF NOT EXISTS public.compras_integracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  provedor text NOT NULL CHECK (provedor IN ('pncp','tce_pr_sim_am','diario_oficial','portal_municipal','biblioteca')),
  ativo boolean NOT NULL DEFAULT false,
  ambiente text NOT NULL DEFAULT 'sandbox' CHECK (ambiente IN ('sandbox','producao')),
  configuracao_publica jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'nao_configurada' CHECK (status IN ('nao_configurada','configurada','validada','erro','suspensa')),
  ultima_validacao_em timestamptz,
  validado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provedor)
);

CREATE TABLE IF NOT EXISTS public.compras_transmissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  integracao_id uuid NOT NULL REFERENCES public.compras_integracoes(id) ON DELETE RESTRICT,
  entidade text NOT NULL CHECK (entidade IN ('processo','contrato','publicacao','documento')),
  entidade_id uuid NOT NULL,
  operacao text NOT NULL CHECK (operacao IN ('validar','enviar','retificar','consultar','cancelar')),
  situacao text NOT NULL DEFAULT 'fila' CHECK (situacao IN ('fila','processando','enviada','confirmada','falhou','cancelada')),
  idempotency_key text NOT NULL,
  protocolo_externo text,
  request_resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_resumo jsonb,
  erro text,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS compras_transmissoes_fila_idx ON public.compras_transmissoes(tenant_id,situacao,criado_em);

ALTER TABLE public.compras_execucoes_contratuais
  ADD COLUMN IF NOT EXISTS quantidade numeric(14,4) CHECK (quantidade IS NULL OR quantidade >= 0),
  ADD COLUMN IF NOT EXISTS unidade_medida text,
  ADD COLUMN IF NOT EXISTS atestado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atestado_em timestamptz,
  ADD COLUMN IF NOT EXISTS empenho_numero text,
  ADD COLUMN IF NOT EXISTS pagamento_status text CHECK (pagamento_status IS NULL OR pagamento_status IN ('nao_informado','empenhado','liquidado','pago','glosado')),
  ADD COLUMN IF NOT EXISTS aditivo_numero text,
  ADD COLUMN IF NOT EXISTS reajuste_percentual numeric(9,4),
  ADD COLUMN IF NOT EXISTS sancao_tipo text;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['compras_propostas','compras_recursos','compras_assinaturas','compras_delegacoes','compras_escalonamentos','compras_integracoes','compras_transmissoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

CREATE POLICY compras_propostas_read ON public.compras_propostas FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_propostas_manage ON public.compras_propostas FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (created_by=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_recursos_read ON public.compras_recursos FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_recursos_manage ON public.compras_recursos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (created_by=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_assinaturas_read ON public.compras_assinaturas FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_assinaturas_manage ON public.compras_assinaturas FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (created_by=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_delegacoes_read ON public.compras_delegacoes FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_delegacoes_manage ON public.compras_delegacoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (criado_por=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_escalonamentos_read ON public.compras_escalonamentos FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_escalonamentos_manage ON public.compras_escalonamentos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_integracoes_read ON public.compras_integracoes FOR SELECT TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_integracoes_manage ON public.compras_integracoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_transmissoes_read ON public.compras_transmissoes FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_transmissoes_manage ON public.compras_transmissoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (criado_por=app_private.current_user_id() AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

REVOKE ALL ON public.compras_propostas,public.compras_recursos,public.compras_assinaturas,public.compras_delegacoes,public.compras_escalonamentos,public.compras_integracoes,public.compras_transmissoes FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.compras_propostas,public.compras_recursos,public.compras_assinaturas,public.compras_delegacoes,public.compras_escalonamentos,public.compras_integracoes,public.compras_transmissoes TO authenticated;

CREATE OR REPLACE FUNCTION public.compras_enfileirar_transmissao(p_integracao_id uuid,p_entidade text,p_entidade_id uuid,p_operacao text,p_request_resumo jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,app_private AS $$
DECLARE v_id uuid; v_tenant uuid := app_private.current_tenant_id(); v_key text := concat(p_integracao_id,':',p_entidade,':',p_entidade_id,':',p_operacao);
BEGIN
  IF NOT app_private.has_tenant_role(v_tenant,ARRAY['tenant_admin','compras_manager']) THEN RAISE EXCEPTION 'Sem permissão para enfileirar transmissão'; END IF;
  INSERT INTO public.compras_transmissoes(tenant_id,integracao_id,entidade,entidade_id,operacao,idempotency_key,request_resumo,criado_por)
  VALUES(v_tenant,p_integracao_id,p_entidade,p_entidade_id,p_operacao,v_key,coalesce(p_request_resumo,'{}'::jsonb),app_private.current_user_id())
  ON CONFLICT (tenant_id,idempotency_key) DO UPDATE SET atualizado_em=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.compras_enfileirar_transmissao(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compras_enfileirar_transmissao(uuid,text,uuid,text,jsonb) TO authenticated;

CREATE TRIGGER compras_propostas_audit AFTER INSERT OR UPDATE OR DELETE ON public.compras_propostas FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_recursos_audit AFTER INSERT OR UPDATE OR DELETE ON public.compras_recursos FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_transmissoes_audit AFTER INSERT OR UPDATE OR DELETE ON public.compras_transmissoes FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
