-- Compras Públicas: modelos configuráveis e versionados de ETP/TR.
-- Aditiva: não altera artefatos, processos, atas, saldos ou documentos existentes.
-- O conteúdo inicial reproduz a estrutura oficial observada nos três ETPs do Drive.

CREATE TABLE public.compras_modelos_artefato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  chave text NOT NULL,
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  tipo text NOT NULL CHECK (tipo IN ('etp','termo_referencia','projeto_basico','edital','outro')),
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, chave)
);

CREATE TABLE public.compras_modelos_artefato_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  modelo_id uuid NOT NULL,
  versao integer NOT NULL CHECK (versao > 0),
  situacao text NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','em_revisao','publicada','arquivada')),
  estrutura jsonb NOT NULL CHECK (jsonb_typeof(estrutura) = 'object'),
  publicada_em timestamptz,
  publicada_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_by integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, modelo_id, versao),
  FOREIGN KEY (tenant_id, modelo_id) REFERENCES public.compras_modelos_artefato(tenant_id, id) ON DELETE RESTRICT,
  CHECK (situacao <> 'publicada' OR publicada_em IS NOT NULL)
);

ALTER TABLE public.compras_artefato_versoes
  ADD COLUMN IF NOT EXISTS modelo_versao_id uuid,
  ADD COLUMN IF NOT EXISTS respostas jsonb;

ALTER TABLE public.compras_artefato_versoes
  ADD CONSTRAINT compras_artefato_versoes_modelo_fk
  FOREIGN KEY (tenant_id, modelo_versao_id)
  REFERENCES public.compras_modelos_artefato_versoes(tenant_id, id)
  ON DELETE RESTRICT;

ALTER TABLE public.compras_artefato_versoes
  ADD CONSTRAINT compras_artefato_versoes_respostas_object_ck
  CHECK (respostas IS NULL OR jsonb_typeof(respostas) = 'object');

CREATE INDEX compras_modelos_artefato_tipo_idx
  ON public.compras_modelos_artefato(tenant_id, tipo, ativo, nome);
CREATE INDEX compras_modelos_artefato_versoes_modelo_idx
  ON public.compras_modelos_artefato_versoes(tenant_id, modelo_id, versao DESC);
CREATE INDEX compras_artefato_versoes_modelo_idx
  ON public.compras_artefato_versoes(tenant_id, modelo_versao_id);

ALTER TABLE public.compras_modelos_artefato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_modelos_artefato_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY compras_modelos_artefato_read ON public.compras_modelos_artefato
  FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_modelos_artefato_create ON public.compras_modelos_artefato
  FOR INSERT TO authenticated WITH CHECK (
    created_by = app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id, ARRAY['tenant_admin','compras_manager'])
  );
CREATE POLICY compras_modelos_artefato_versoes_read ON public.compras_modelos_artefato_versoes
  FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_modelos_artefato_versoes_create ON public.compras_modelos_artefato_versoes
  FOR INSERT TO authenticated WITH CHECK (
    created_by = app_private.current_user_id()
    AND app_private.has_tenant_role(tenant_id, ARRAY['tenant_admin','compras_manager'])
  );

REVOKE ALL ON public.compras_modelos_artefato, public.compras_modelos_artefato_versoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.compras_modelos_artefato, public.compras_modelos_artefato_versoes TO authenticated;

CREATE TRIGGER compras_modelos_artefato_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_modelos_artefato
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();
CREATE TRIGGER compras_modelos_artefato_versoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.compras_modelos_artefato_versoes
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change();

CREATE OR REPLACE FUNCTION public.compras_registrar_artefato_configurado(
  p_processo_id uuid,
  p_tipo text,
  p_titulo text,
  p_modelo_versao_id uuid,
  p_respostas jsonb,
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
  v_modelo_tipo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória' USING ERRCODE='42501';
  END IF;
  IF p_respostas IS NULL OR jsonb_typeof(p_respostas) <> 'object' THEN
    RAISE EXCEPTION 'As respostas devem ser um objeto estruturado' USING ERRCODE='22023';
  END IF;
  IF p_situacao NOT IN ('rascunho','em_revisao') THEN
    RAISE EXCEPTION 'A versão deve iniciar como rascunho ou em revisão' USING ERRCODE='22023';
  END IF;
  SELECT p.tenant_id INTO v_tenant_id
  FROM public.compras_processos p
  WHERE p.id = p_processo_id
    AND app_private.has_tenant_role(p.tenant_id, ARRAY['tenant_admin','compras_manager'])
    AND app_private.can_access_unit(p.tenant_id, p.unidade_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado' USING ERRCODE='42501';
  END IF;
  SELECT m.tipo INTO v_modelo_tipo
  FROM public.compras_modelos_artefato_versoes mv
  JOIN public.compras_modelos_artefato m ON m.tenant_id = mv.tenant_id AND m.id = mv.modelo_id
  WHERE mv.tenant_id = v_tenant_id AND mv.id = p_modelo_versao_id AND mv.situacao = 'publicada';
  IF NOT FOUND OR v_modelo_tipo <> p_tipo THEN
    RAISE EXCEPTION 'Modelo publicado não encontrado ou incompatível com o tipo do artefato' USING ERRCODE='22023';
  END IF;
  IF p_artefato_id IS NULL THEN
    INSERT INTO public.compras_artefatos(tenant_id, processo_id, tipo, titulo, created_by)
    VALUES (v_tenant_id, p_processo_id, p_tipo, trim(p_titulo), app_private.current_user_id())
    RETURNING id INTO v_artefato_id;
  ELSE
    SELECT a.id INTO v_artefato_id
    FROM public.compras_artefatos a
    WHERE a.tenant_id = v_tenant_id AND a.id = p_artefato_id AND a.processo_id = p_processo_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Artefato não encontrado neste processo/tenant' USING ERRCODE='42501';
    END IF;
  END IF;
  SELECT coalesce(max(v.versao), 0) + 1 INTO v_numero_versao
  FROM public.compras_artefato_versoes v
  WHERE v.tenant_id = v_tenant_id AND v.artefato_id = v_artefato_id;
  INSERT INTO public.compras_artefato_versoes(tenant_id, artefato_id, versao, situacao, conteudo, respostas, modelo_versao_id, created_by)
  VALUES (v_tenant_id, v_artefato_id, v_numero_versao, p_situacao,
          jsonb_build_object('modelo_versao_id', p_modelo_versao_id, 'respostas', p_respostas),
          p_respostas, p_modelo_versao_id, app_private.current_user_id())
  RETURNING id INTO v_versao_id;
  RETURN QUERY SELECT v_artefato_id, v_versao_id, v_numero_versao;
END;
$$;
REVOKE ALL ON FUNCTION public.compras_registrar_artefato_configurado(uuid,text,text,uuid,jsonb,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_registrar_artefato_configurado(uuid,text,text,uuid,jsonb,uuid,text) TO authenticated;

-- Modelo oficial inicial: estrutura comum aos três ETPs analisados no Drive.
WITH t AS (SELECT id FROM public.app_tenants WHERE slug='pitangueiras-pr' LIMIT 1), m AS (
  INSERT INTO public.compras_modelos_artefato(tenant_id,chave,nome,tipo,descricao)
  SELECT id,'etp-municipal-oficial','ETP Municipal — Modelo oficial','etp','Modelo inicial baseado nos ETPs de site/e-mail, VOIP e estágios.' FROM t
  ON CONFLICT (tenant_id,chave) DO UPDATE SET ativo=true
  RETURNING id,tenant_id
)
INSERT INTO public.compras_modelos_artefato_versoes(tenant_id,modelo_id,versao,situacao,estrutura,publicada_em)
SELECT m.tenant_id,m.id,1,'publicada', $json$
{
  "codigo":"etp-municipal-oficial-v1",
  "titulo":"Estudo Técnico Preliminar — Modelo oficial",
  "orientacao":"Preencha as respostas com base na necessidade real. O sistema organiza o documento, mas não substitui análise técnica, jurídica ou decisão da autoridade competente.",
  "secoes":[
    {"codigo":"I","titulo":"INFORMAÇÕES GERAIS","campos":[
      {"chave":"identificacao_processo_solicitante","rotulo":"Identificação do processo e solicitante","tipo":"textarea","obrigatorio":true},
      {"chave":"area_solicitante","rotulo":"Área solicitante","tipo":"textarea","obrigatorio":true},
      {"chave":"equipe_planejamento","rotulo":"Equipe de Planejamento da Contratação","tipo":"textarea"},
      {"chave":"documento_designacao","rotulo":"Documento(s) de designação","tipo":"textarea"}]},
    {"codigo":"II","titulo":"DIAGNÓSTICO DA SITUAÇÃO ATUAL","campos":[
      {"chave":"descricao_necessidade","rotulo":"Descrição do problema a ser resolvido ou da necessidade apresentada","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, I e IV"},
      {"chave":"estimativas_quantidades","rotulo":"Estimativas das quantidades a serem potencialmente contratadas","tipo":"textarea","obrigatorio":true},
      {"chave":"alinhamento_planejamento","rotulo":"Alinhamento entre a contratação e o planejamento da Administração","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, II"},
      {"chave":"requisitos_contratacao","rotulo":"Descrição dos requisitos da potencial contratação","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, III"},
      {"chave":"padroes_qualidade","rotulo":"Padrões mínimos de qualidade relativos ao objeto","tipo":"textarea","obrigatorio":true},
      {"chave":"disponibilidade_solucao","rotulo":"Por quanto tempo a solução deverá ficar disponível à Administração?","tipo":"textarea","obrigatorio":true}]},
    {"codigo":"III","titulo":"PROSPECÇÃO DE SOLUÇÕES","campos":[
      {"chave":"levantamento_mercado","rotulo":"Levantamento de Mercado","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, V"},
      {"chave":"estimativa_valor","rotulo":"Estimativa do valor da contratação","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, VI"},
      {"chave":"escolha_solucao","rotulo":"Escolha da solução","tipo":"textarea","obrigatorio":true}]},
    {"codigo":"IV","titulo":"DETALHAMENTO DA SOLUÇÃO ESCOLHIDA","campos":[
      {"chave":"descricao_solucao","rotulo":"Descrição da solução como um todo","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, VII"},
      {"chave":"parcelamento","rotulo":"Justificativas para o parcelamento ou não da contratação","tipo":"textarea","obrigatorio":true},
      {"chave":"contratacoes_correlatas","rotulo":"Contratações correlatas e/ou interdependentes","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, XI"},
      {"chave":"resultados_pretendidos","rotulo":"Resultados pretendidos","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, IX"},
      {"chave":"providencias","rotulo":"Providências a serem adotadas","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, X"},
      {"chave":"impactos_ambientais","rotulo":"Possíveis impactos ambientais","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, XII"}]},
    {"codigo":"V","titulo":"POSICIONAMENTO CONCLUSIVO","campos":[
      {"chave":"posicionamento_conclusivo","rotulo":"Posicionamento conclusivo sobre a viabilidade da contratação","tipo":"textarea","obrigatorio":true,"fundamento":"art. 6º, XIII"},
      {"chave":"assinaturas","rotulo":"Assinaturas da Equipe de Planejamento da Contratação e Autoridade Competente","tipo":"textarea","obrigatorio":true}]},
    {"codigo":"especializados","titulo":"BLOCOS ESPECIALIZADOS (CONFIGURÁVEIS)","campos":[
      {"chave":"requisitos_tecnicos_especificos","rotulo":"Requisitos técnicos específicos, obrigações, critérios de execução e fiscalização","tipo":"textarea","ajuda":"Use este bloco para tecnologia, VOIP, estágios, serviços contínuos ou objetos que exijam requisitos adicionais."},
      {"chave":"observacoes_complementares","rotulo":"Observações complementares e pendências","tipo":"textarea"}]}
  ]
}
$json$::jsonb,now() FROM m
ON CONFLICT (tenant_id,modelo_id,versao) DO NOTHING;
