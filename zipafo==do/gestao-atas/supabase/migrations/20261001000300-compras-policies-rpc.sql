-- Todas as tabelas novas usam RLS; o acesso depende do vínculo ativo ao tenant.
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

CREATE POLICY app_tenants_read_member ON public.app_tenants FOR SELECT TO authenticated USING (app_private.has_tenant_access(id));
CREATE POLICY app_tenant_units_read_member ON public.app_tenant_units FOR SELECT TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR EXISTS (
  SELECT 1 FROM public.app_tenant_memberships AS m
  WHERE m.tenant_id=app_tenant_units.tenant_id AND m.user_id=app_private.current_user_id()
    AND m.unidade_id=app_tenant_units.id AND m.ativo IS TRUE
));
CREATE POLICY app_tenant_units_admin_manage ON public.app_tenant_units FOR ALL TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin']))
WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin']));
CREATE POLICY app_membership_read_self_or_admin ON public.app_tenant_memberships FOR SELECT TO authenticated
USING (user_id=app_private.current_user_id() OR app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin']));
CREATE POLICY app_membership_admin_manage ON public.app_tenant_memberships FOR ALL TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin']))
WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin']));

CREATE POLICY compras_classificacoes_read ON public.compras_classificacoes FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_classificacoes_manage ON public.compras_classificacoes FOR ALL TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']))
WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

CREATE POLICY compras_demandas_read ON public.compras_demandas FOR SELECT TO authenticated USING (app_private.can_access_unit(tenant_id,unidade_id));
CREATE POLICY compras_demandas_create ON public.compras_demandas FOR INSERT TO authenticated
WITH CHECK (app_private.can_create_demand(tenant_id,unidade_id) AND criado_por=app_private.current_user_id());
CREATE POLICY compras_demandas_update ON public.compras_demandas FOR UPDATE TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR (criado_por=app_private.current_user_id() AND status='rascunho' AND app_private.can_access_unit(tenant_id,unidade_id)))
WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR (criado_por=app_private.current_user_id() AND status IN ('rascunho','enviada') AND app_private.can_access_unit(tenant_id,unidade_id)));
CREATE POLICY compras_demandas_delete ON public.compras_demandas FOR DELETE TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR (criado_por=app_private.current_user_id() AND status='rascunho' AND app_private.can_access_unit(tenant_id,unidade_id)));

CREATE POLICY compras_fluxos_read ON public.compras_fluxos FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_fluxos_manage ON public.compras_fluxos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_fluxo_versoes_read ON public.compras_fluxo_versoes FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_fluxo_versoes_manage ON public.compras_fluxo_versoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_fluxo_etapas_read ON public.compras_fluxo_etapas FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_fluxo_etapas_manage ON public.compras_fluxo_etapas FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

CREATE POLICY compras_processos_read ON public.compras_processos FOR SELECT TO authenticated USING (app_private.can_access_unit(tenant_id,unidade_id));
CREATE POLICY compras_processos_manage ON public.compras_processos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_pca_read ON public.compras_pca_itens FOR SELECT TO authenticated USING (app_private.can_access_unit(tenant_id,unidade_id));
CREATE POLICY compras_pca_manage ON public.compras_pca_itens FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_processos_etapas_read ON public.compras_processos_etapas FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_processos_etapas.tenant_id)
);
CREATE POLICY compras_processos_etapas_manage ON public.compras_processos_etapas FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_processos_itens_read ON public.compras_processos_itens FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_processos_itens.tenant_id)
);
CREATE POLICY compras_processos_itens_manage ON public.compras_processos_itens FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_processos_fornecedores_read ON public.compras_processos_fornecedores FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_processos_fornecedores.tenant_id)
);
CREATE POLICY compras_processos_fornecedores_manage ON public.compras_processos_fornecedores FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

CREATE POLICY compras_documentos_read ON public.compras_documentos FOR SELECT TO authenticated USING (
  (processo_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_documentos.tenant_id))
  OR (demanda_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_demandas d WHERE d.id=demanda_id AND d.tenant_id=compras_documentos.tenant_id))
);
CREATE POLICY compras_documentos_manage ON public.compras_documentos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_pesquisa_read ON public.compras_pesquisa_precos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_pesquisa_precos.tenant_id)
);
CREATE POLICY compras_pesquisa_manage ON public.compras_pesquisa_precos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_tarefas_read ON public.compras_tarefas FOR SELECT TO authenticated USING (
  app_private.has_tenant_access(tenant_id) AND (
    responsavel_id=app_private.current_user_id()
    OR (processo_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_tarefas.tenant_id))
    OR (demanda_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_demandas d WHERE d.id=demanda_id AND d.tenant_id=compras_tarefas.tenant_id))
  )
);
CREATE POLICY compras_tarefas_create_manage ON public.compras_tarefas FOR INSERT TO authenticated WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) AND criado_por=app_private.current_user_id());
CREATE POLICY compras_tarefas_update_manage_or_assignee ON public.compras_tarefas FOR UPDATE TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR (responsavel_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id)))
WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']) OR (responsavel_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id)));
CREATE POLICY compras_tarefas_delete_manage ON public.compras_tarefas FOR DELETE TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

CREATE POLICY compras_publicacoes_read ON public.compras_publicacoes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_publicacoes.tenant_id)
);
CREATE POLICY compras_publicacoes_manage ON public.compras_publicacoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_contratos_read ON public.compras_contratos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_contratos.tenant_id)
);
CREATE POLICY compras_contratos_manage ON public.compras_contratos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_contrato_eventos_read ON public.compras_contrato_eventos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.compras_contratos c WHERE c.id=contrato_id AND c.tenant_id=compras_contrato_eventos.tenant_id)
);
CREATE POLICY compras_contrato_eventos_manage ON public.compras_contrato_eventos FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_obrigacoes_read ON public.compras_obrigacoes FOR SELECT TO authenticated USING (
  (processo_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_processos p WHERE p.id=processo_id AND p.tenant_id=compras_obrigacoes.tenant_id))
  OR (contrato_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.compras_contratos c WHERE c.id=contrato_id AND c.tenant_id=compras_obrigacoes.tenant_id))
);
CREATE POLICY compras_obrigacoes_manage ON public.compras_obrigacoes FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_feriados_read ON public.compras_feriados FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id));
CREATE POLICY compras_feriados_manage ON public.compras_feriados FOR ALL TO authenticated USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager'])) WITH CHECK (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));
CREATE POLICY compras_auditoria_read ON public.compras_eventos_auditoria FOR SELECT TO authenticated
USING (app_private.has_tenant_role(tenant_id,ARRAY['tenant_admin','compras_manager']));

GRANT SELECT ON public.app_tenants TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.app_tenant_units TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.app_tenant_memberships TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
  public.compras_classificacoes,public.compras_demandas,public.compras_fluxos,public.compras_fluxo_versoes,
  public.compras_fluxo_etapas,public.compras_processos,public.compras_pca_itens,public.compras_processos_etapas,
  public.compras_processos_itens,public.compras_processos_fornecedores,public.compras_documentos,
  public.compras_pesquisa_precos,public.compras_tarefas,public.compras_publicacoes,public.compras_contratos,
  public.compras_contrato_eventos,public.compras_obrigacoes,public.compras_feriados TO authenticated;
GRANT SELECT ON public.compras_eventos_auditoria TO authenticated;

-- Classificações são sugestões configuráveis, não parecer jurídico nem validação automática.
INSERT INTO public.compras_classificacoes(tenant_id,tipo,nome,descricao,sugestao,ordem)
SELECT t.id,v.tipo,v.nome,'Sugestão editável; confirme a nomenclatura e a regra vigente no edital/regulamento municipal.',true,v.ordem
FROM public.app_tenants AS t
CROSS JOIN (VALUES
 ('tipo_contratacao','Licitação',10),
 ('tipo_contratacao','Contratação direta',20),
 ('tipo_contratacao','Procedimento auxiliar',30),
 ('modalidade','Pregão eletrônico',10),
 ('modalidade','Concorrência',20),
 ('modalidade','Leilão',30),
 ('modalidade','Concurso',40),
 ('modalidade','Diálogo competitivo',50),
 ('procedimento','Dispensa de licitação',10),
 ('procedimento','Inexigibilidade',20),
 ('procedimento','Sistema de Registro de Preços (SRP)',30),
 ('procedimento','Credenciamento',40)
) AS v(tipo,nome,ordem)
WHERE t.slug='pitangueiras-pr'
ON CONFLICT (tenant_id,tipo,nome) DO NOTHING;

-- Fluxo interno sugerido. Não representa prazo/fase legal obrigatória; o tenant deve revisar e versionar.
DO $$
DECLARE v_tenant uuid; v_fluxo uuid; v_versao uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.app_tenants WHERE slug='pitangueiras-pr';
  INSERT INTO public.compras_fluxos(tenant_id,nome,tipo_contratacao,descricao,ativo)
  VALUES(v_tenant,'Roteiro interno de compras — revisar antes de usar','Geral',
    'Modelo operacional configurável. Confirme etapas, responsáveis, documentos e prazos conforme os atos e regras vigentes do Município.',true)
  ON CONFLICT (tenant_id,nome) DO UPDATE SET ativo=true
  RETURNING id INTO v_fluxo;
  INSERT INTO public.compras_fluxo_versoes(tenant_id,fluxo_id,versao,situacao,publicada_em)
  VALUES(v_tenant,v_fluxo,1,'publicada',now())
  ON CONFLICT (fluxo_id,versao) DO UPDATE SET situacao='publicada',publicada_em=coalesce(compras_fluxo_versoes.publicada_em,now())
  RETURNING id INTO v_versao;
  INSERT INTO public.compras_fluxo_etapas(tenant_id,fluxo_versao_id,ordem,codigo,nome,descricao)
  VALUES
    (v_tenant,v_versao,1,'necessidade','Definir necessidade e escopo','Registrar unidade, problema a resolver, resultados esperados e itens necessários.'),
    (v_tenant,v_versao,2,'instrucao','Preparar instrução e estimativas','Organizar documentos e informações de mercado conforme as regras aplicáveis.'),
    (v_tenant,v_versao,3,'revisao','Revisar e obter autorizações','Registrar as revisões e aprovações das áreas competentes, conforme fluxo municipal.'),
    (v_tenant,v_versao,4,'selecao','Registrar seleção e resultado','Documentar as etapas de seleção, decisões e fornecedor(es) resultantes.'),
    (v_tenant,v_versao,5,'formalizacao_execucao','Formalizar e acompanhar execução','Registrar instrumento, publicação, responsáveis e eventos de execução/encerramento.')
  ON CONFLICT (fluxo_versao_id,ordem) DO NOTHING;
END $$;

-- Atualiza rota histórica da Biblioteca para a grafia/case real da pasta do Drive/GitHub Pages.
UPDATE public.modulos_sistema
SET rota='biblioteca/dashboard.html',updated_at=now()
WHERE nome='biblioteca' AND rota='biblioteca/dashboard.html';

INSERT INTO public.modulos_sistema(nome,descricao,icone,rota,ativo,ordem,cor,visivel_intranet,updated_at)
VALUES ('compras','Gestão de Compras Públicas, Processos, Atas e Contratos','fa-cart-shopping','compras/index.html',true,60,'#0d5e3a',true,now())
ON CONFLICT (nome) DO UPDATE SET
  descricao=EXCLUDED.descricao,icone=EXCLUDED.icone,rota=EXCLUDED.rota,ativo=true,
  ordem=EXCLUDED.ordem,cor=EXCLUDED.cor,visivel_intranet=true,updated_at=now();

INSERT INTO public.usuarios_modulos(usuario_id,modulo,permitido,concedido_por)
SELECT u.id,'compras',true,
       (SELECT a.id FROM public.usuarios AS a WHERE a.perfil='ADMIN' AND a.ativo IS TRUE ORDER BY a.id LIMIT 1)
FROM public.usuarios AS u
WHERE u.ativo IS TRUE AND u.perfil IN ('ADMIN','SECRETARIO')
ON CONFLICT (usuario_id,modulo) DO UPDATE SET permitido=true,updated_at=now();

CREATE OR REPLACE FUNCTION public.compras_gerar_ata(
  p_processo_id uuid,
  p_numero_ata text,
  p_fornecedor_id integer,
  p_data_assinatura date,
  p_data_inicio_vigencia date,
  p_data_fim_vigencia date
)
RETURNS TABLE (ata_id integer,itens_criados integer,valor_global numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_processo public.compras_processos%ROWTYPE;
        v_ata_id integer;
        v_count integer;
        v_total numeric(14,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória'; END IF;
  IF nullif(trim(p_numero_ata),'') IS NULL THEN RAISE EXCEPTION 'Informe o número da ata'; END IF;
  IF p_data_assinatura IS NULL OR p_data_inicio_vigencia IS NULL OR p_data_fim_vigencia IS NULL THEN
    RAISE EXCEPTION 'Informe assinatura e início/fim de vigência antes de gerar a ata';
  END IF;
  IF p_data_fim_vigencia < p_data_inicio_vigencia THEN RAISE EXCEPTION 'Fim da vigência não pode anteceder o início'; END IF;

  SELECT p.* INTO v_processo FROM public.compras_processos AS p WHERE p.id=p_processo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processo não encontrado'; END IF;
  IF NOT app_private.has_tenant_access(v_processo.tenant_id)
     OR NOT app_private.has_tenant_role(v_processo.tenant_id,ARRAY['tenant_admin','compras_manager']) THEN
    RAISE EXCEPTION 'Sem permissão para gerar ata deste processo';
  END IF;
  IF v_processo.status <> 'homologado' THEN RAISE EXCEPTION 'Somente processo homologado pode gerar ata'; END IF;
  IF v_processo.ata_id IS NOT NULL THEN RAISE EXCEPTION 'Este processo já está vinculado a uma ata'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.compras_processos_fornecedores AS f
    WHERE f.processo_id=v_processo.id AND f.fornecedor_id=p_fornecedor_id AND f.situacao='vencedor'
  ) THEN RAISE EXCEPTION 'Marque o fornecedor adjudicado como vencedor antes de gerar a ata'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.compras_processos_itens AS i
    WHERE i.processo_id=v_processo.id AND i.status='adjudicado'
      AND (i.quantidade_adjudicada IS NULL OR i.quantidade_adjudicada<=0 OR i.preco_unitario_adjudicado IS NULL OR i.preco_unitario_adjudicado<0)
  ) THEN RAISE EXCEPTION 'Há item adjudicado sem quantidade ou preço unitário conferido'; END IF;

  SELECT count(*)::integer,coalesce(sum(round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2)),0)::numeric(14,2)
  INTO v_count,v_total
  FROM public.compras_processos_itens AS i
  WHERE i.processo_id=v_processo.id AND i.status='adjudicado'
    AND i.quantidade_adjudicada>0 AND i.preco_unitario_adjudicado>=0;
  IF v_count=0 THEN RAISE EXCEPTION 'Inclua ao menos um item adjudicado com quantidade e preço conferidos'; END IF;

  INSERT INTO public.atas(
    numero_ata,processo_administrativo,numero_pregao,objeto,data_assinatura,
    data_inicio_vigencia,data_fim_vigencia,valor_global,fornecedor_id,situacao,modalidade,processo_compras_id
  ) VALUES (
    trim(p_numero_ata),v_processo.numero_processo||'/'||v_processo.ano::text,
    CASE WHEN v_processo.modalidade ILIKE '%pregão%' THEN v_processo.numero_edital ELSE NULL END,
    v_processo.objeto,p_data_assinatura,p_data_inicio_vigencia,p_data_fim_vigencia,v_total,
    p_fornecedor_id,'ATIVA',v_processo.modalidade,v_processo.id
  ) RETURNING id INTO v_ata_id;

  INSERT INTO public.itens_ata(
    ata_id,item_numero,codigo_material,descricao,descricao_detalhada,especificacao_tecnica,
    unidade_medida,categoria,quantidade_contratada,quantidade_estimada,valor_unitario,valor_total,
    saldo_quantidade,saldo_valor,situacao,lote_numero
  )
  SELECT v_ata_id,i.item_numero,i.codigo_catalogo,i.descricao,i.descricao_detalhada,i.especificacao_tecnica,
         i.unidade_medida,i.categoria,i.quantidade_adjudicada,i.quantidade_adjudicada,
         i.preco_unitario_adjudicado,round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2),
         i.quantidade_adjudicada,round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2),
         'DISPONIVEL',i.lote_numero
  FROM public.compras_processos_itens AS i
  WHERE i.processo_id=v_processo.id AND i.status='adjudicado';

  UPDATE public.compras_processos_itens AS i
  SET item_ata_id=ia.id,updated_at=now()
  FROM public.itens_ata AS ia
  WHERE ia.ata_id=v_ata_id AND ia.item_numero=i.item_numero AND i.processo_id=v_processo.id;

  UPDATE public.compras_processos AS p
  SET ata_id=v_ata_id,status='ata_gerada',updated_at=now()
  WHERE p.id=v_processo.id;

  RETURN QUERY SELECT v_ata_id,v_count,v_total;
END $$;
REVOKE ALL ON FUNCTION public.compras_gerar_ata(uuid,text,integer,date,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compras_gerar_ata(uuid,text,integer,date,date,date) TO authenticated;

-- Atas, saldos, pedidos/entregas e dados da Biblioteca existentes são preservados e recebem tenant_id.
-- Isso não substitui auditoria funcional, de acesso e de operação antes de oferecer cada módulo como SaaS.
