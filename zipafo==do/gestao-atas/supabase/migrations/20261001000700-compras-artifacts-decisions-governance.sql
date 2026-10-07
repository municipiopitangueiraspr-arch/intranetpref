-- Requisitos 1-5: artefatos estruturados/versionados, decisões e governança.
-- Somente estruturas novas; não reescreve processos, atas, saldos nem dados legados.
-- Publicação/aprovação jurídica continua sendo decisão humana formal.

CREATE TABLE public.compras_artefatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  etapa_id uuid,
  tipo text NOT NULL CHECK (tipo IN (
    'etp','termo_referencia','projeto_basico','edital','parecer_tecnico',
    'mapa_pesquisa_precos','nota_autorizacao','ata_sessao','outro'
  )),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,processo_id)
    REFERENCES public.compras_processos(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,etapa_id)
    REFERENCES public.compras_processos_etapas(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.compras_artefato_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  artefato_id uuid NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  situacao text NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','em_revisao')),
  conteudo jsonb NOT NULL CHECK (jsonb_typeof(conteudo) = 'object'),
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,artefato_id,versao),
  FOREIGN KEY (tenant_id,artefato_id)
    REFERENCES public.compras_artefatos(tenant_id,id) ON DELETE RESTRICT
);

-- Cada registro é uma revisão imutável.
CREATE TABLE public.compras_regras_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  chave text NOT NULL CHECK (length(trim(chave)) > 0),
  versao integer NOT NULL CHECK (versao > 0),
  tipo_registro text NOT NULL CHECK (tipo_registro IN ('norma_legal','procedimento_interno','parametro_sistema')),
  titulo text NOT NULL CHECK (length(trim(titulo)) > 0),
  fonte_identificacao text,
  localizador text,
  fonte_url text,
  resumo text NOT NULL CHECK (length(trim(resumo)) > 0),
  vigencia_inicio date,
  vigencia_fim date,
  situacao text NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','em_revisao')),
  substitui_id uuid,
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,chave,versao),
  CHECK (vigencia_fim IS NULL OR vigencia_inicio IS NULL OR vigencia_fim >= vigencia_inicio),
  FOREIGN KEY (tenant_id,substitui_id)
    REFERENCES public.compras_regras_versoes(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.compras_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  processo_id uuid NOT NULL,
  tipo_decisao text NOT NULL CHECK (tipo_decisao IN (
    'analise','parecer_tecnico','parecer_juridico','habilitacao','julgamento',
    'recurso','adjudicacao','homologacao','autorizacao_direta','aprovacao_etp',
    'aprovacao_tr','formalizacao','encerramento','outra'
  )),
  resultado text NOT NULL CHECK (length(trim(resultado)) > 0),
  autoridade_ato text NOT NULL CHECK (length(trim(autoridade_ato)) > 0),
  fundamento_informado text,
  motivacao text NOT NULL CHECK (length(trim(motivacao)) > 0),
  decidido_em date NOT NULL DEFAULT current_date,
  artefato_versao_id uuid,
  regra_versao_id uuid,
  documento_id uuid,
  substitui_id uuid,
  registrado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,processo_id)
    REFERENCES public.compras_processos(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,artefato_versao_id)
    REFERENCES public.compras_artefato_versoes(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,regra_versao_id)
    REFERENCES public.compras_regras_versoes(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,documento_id)
    REFERENCES public.compras_documentos(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,substitui_id)
    REFERENCES public.compras_decisoes(tenant_id,id) ON DELETE RESTRICT,
  CHECK (substitui_id IS NULL OR substitui_id <> id)
);

CREATE INDEX compras_artefatos_processo_idx
  ON public.compras_artefatos(tenant_id,processo_id,created_at DESC);
CREATE INDEX compras_artefato_versoes_artefato_idx
  ON public.compras_artefato_versoes(tenant_id,artefato_id,versao DESC);
CREATE INDEX compras_regras_tipo_chave_idx
  ON public.compras_regras_versoes(tenant_id,tipo_registro,chave,versao DESC);
CREATE INDEX compras_decisoes_processo_data_idx
  ON public.compras_decisoes(tenant_id,processo_id,decidido_em DESC,created_at DESC);
CREATE INDEX compras_decisoes_artefato_idx
  ON public.compras_decisoes(tenant_id,artefato_versao_id);

ALTER TABLE public.compras_artefatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_artefato_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_regras_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_decisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_artefatos_read ON public.compras_artefatos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.compras_processos p
      WHERE p.tenant_id=compras_artefatos.tenant_id AND p.id=compras_artefatos.processo_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );
CREATE POLICY compras_artefatos_create ON public.compras_artefatos
  FOR INSERT TO authenticated WITH CHECK (
    created_by=app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])
    AND EXISTS (SELECT 1 FROM public.compras_processos p
      WHERE p.tenant_id=compras_artefatos.tenant_id AND p.id=compras_artefatos.processo_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );

CREATE POLICY compras_artefato_versoes_read ON public.compras_artefato_versoes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.compras_artefatos a
      JOIN public.compras_processos p ON p.tenant_id=a.tenant_id AND p.id=a.processo_id
      WHERE a.tenant_id=compras_artefato_versoes.tenant_id
        AND a.id=compras_artefato_versoes.artefato_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );
CREATE POLICY compras_artefato_versoes_create ON public.compras_artefato_versoes
  FOR INSERT TO authenticated WITH CHECK (
    created_by=app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])
    AND EXISTS (SELECT 1 FROM public.compras_artefatos a
      JOIN public.compras_processos p ON p.tenant_id=a.tenant_id AND p.id=a.processo_id
      WHERE a.tenant_id=compras_artefato_versoes.tenant_id
        AND a.id=compras_artefato_versoes.artefato_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );

CREATE POLICY compras_regras_versoes_read ON public.compras_regras_versoes
  FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_regras_versoes_create ON public.compras_regras_versoes
  FOR INSERT TO authenticated WITH CHECK (
    created_by=app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])
  );

CREATE POLICY compras_decisoes_read ON public.compras_decisoes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.compras_processos p
      WHERE p.tenant_id=compras_decisoes.tenant_id AND p.id=compras_decisoes.processo_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );
CREATE POLICY compras_decisoes_create ON public.compras_decisoes
  FOR INSERT TO authenticated WITH CHECK (
    registrado_por=app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])
    AND EXISTS (SELECT 1 FROM public.compras_processos p
      WHERE p.tenant_id=compras_decisoes.tenant_id AND p.id=compras_decisoes.processo_id
        AND app_private.can_access_unit(p.tenant_id,p.unidade_id))
  );

-- Sem policies/grants de UPDATE/DELETE: versões, regras e decisões são append-only.
REVOKE ALL ON public.compras_artefatos,public.compras_artefato_versoes,
  public.compras_regras_versoes,public.compras_decisoes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.compras_artefatos,public.compras_artefato_versoes,
  public.compras_regras_versoes,public.compras_decisoes TO authenticated;

CREATE TRIGGER compras_artefatos_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_artefatos
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_artefato_versoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_artefato_versoes
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_regras_versoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_regras_versoes
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_decisoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_decisoes
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();

-- Atomic version increment. All permissions are still checked under caller RLS;
-- only tenant_admin/compras_manager may create artefacts and versions.
CREATE OR REPLACE FUNCTION public.compras_registrar_artefato_versao(
  p_processo_id uuid,
  p_tipo text,
  p_titulo text,
  p_conteudo jsonb,
  p_artefato_id uuid DEFAULT NULL,
  p_situacao text DEFAULT 'rascunho'
)
RETURNS TABLE(artefato_id uuid, versao_id uuid, numero_versao integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_tenant_id uuid;
  v_artefato_id uuid;
  v_versao_id uuid;
  v_numero_versao integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória' USING ERRCODE='42501';
  END IF;
  IF p_conteudo IS NULL OR jsonb_typeof(p_conteudo) <> 'object' THEN
    RAISE EXCEPTION 'O conteúdo deve ser um objeto estruturado' USING ERRCODE='22023';
  END IF;
  IF p_situacao NOT IN ('rascunho','em_revisao') THEN
    RAISE EXCEPTION 'A versão deve iniciar como rascunho ou em revisão; aprovação exige registro de decisão' USING ERRCODE='22023';
  END IF;

  SELECT p.tenant_id INTO v_tenant_id
  FROM public.compras_processos p
  WHERE p.id=p_processo_id
    AND app_private.has_tenant_role(p.tenant_id,ARRAY['tenant_admin','compras_manager'])
    AND app_private.can_access_unit(p.tenant_id,p.unidade_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado' USING ERRCODE='42501';
  END IF;

  IF p_artefato_id IS NULL THEN
    INSERT INTO public.compras_artefatos(tenant_id,processo_id,tipo,titulo,created_by)
    VALUES(v_tenant_id,p_processo_id,p_tipo,trim(p_titulo),app_private.current_user_id())
    RETURNING id INTO v_artefato_id;
  ELSE
    SELECT a.id INTO v_artefato_id
    FROM public.compras_artefatos a
    WHERE a.id=p_artefato_id AND a.tenant_id=v_tenant_id AND a.processo_id=p_processo_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artefato não encontrado neste processo/tenant' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT coalesce(max(v.versao),0)+1 INTO v_numero_versao
  FROM public.compras_artefato_versoes v
  WHERE v.tenant_id=v_tenant_id AND v.artefato_id=v_artefato_id;

  INSERT INTO public.compras_artefato_versoes(
    tenant_id,artefato_id,versao,situacao,conteudo,created_by
  ) VALUES (
    v_tenant_id,v_artefato_id,v_numero_versao,p_situacao,p_conteudo,app_private.current_user_id()
  ) RETURNING id INTO v_versao_id;

  RETURN QUERY SELECT v_artefato_id,v_versao_id,v_numero_versao;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_registrar_artefato_versao(uuid,text,text,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compras_registrar_artefato_versao(uuid,text,text,jsonb,uuid,text) TO authenticated;
