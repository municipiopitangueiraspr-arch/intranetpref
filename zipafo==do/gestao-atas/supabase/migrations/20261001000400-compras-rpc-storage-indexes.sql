-- Complemento corretivo após auditoria dos advisors e das policies do Storage.
-- O tenant deriva do processo; anexos privados precisam de policies permissivas e restritivas.

-- Policies permissivas específicas; as policies RESTRICTIVE do estágio anterior continuam sendo a barreira adicional.
DROP POLICY IF EXISTS compras_bucket_select ON storage.objects;
CREATE POLICY compras_bucket_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND EXISTS (
    SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name)
      AND d.storage_path=storage.objects.name
  )
);
DROP POLICY IF EXISTS compras_bucket_insert ON storage.objects;
CREATE POLICY compras_bucket_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND app_private.has_tenant_role(app_private.tenant_from_storage_path(name),ARRAY['tenant_admin','compras_manager'])
);
DROP POLICY IF EXISTS compras_bucket_update ON storage.objects;
CREATE POLICY compras_bucket_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND app_private.has_tenant_role(app_private.tenant_from_storage_path(name),ARRAY['tenant_admin','compras_manager'])
  AND EXISTS (
    SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name)
      AND d.storage_path=storage.objects.name
  )
)
WITH CHECK (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND app_private.has_tenant_role(app_private.tenant_from_storage_path(name),ARRAY['tenant_admin','compras_manager'])
);
DROP POLICY IF EXISTS compras_bucket_delete ON storage.objects;
CREATE POLICY compras_bucket_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND app_private.has_tenant_role(app_private.tenant_from_storage_path(name),ARRAY['tenant_admin','compras_manager'])
  AND EXISTS (
    SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name)
      AND d.storage_path=storage.objects.name
  )
);

-- Índices para as relações compostas do módulo novo; a auditoria marcou FKs sem cobertura.
CREATE INDEX IF NOT EXISTS app_membership_unit_tenant_idx ON public.app_tenant_memberships(tenant_id,unidade_id);
CREATE INDEX IF NOT EXISTS compras_fluxo_versoes_fluxo_tenant_idx ON public.compras_fluxo_versoes(tenant_id,fluxo_id);
CREATE INDEX IF NOT EXISTS compras_fluxo_etapas_versao_tenant_idx ON public.compras_fluxo_etapas(tenant_id,fluxo_versao_id);
CREATE INDEX IF NOT EXISTS compras_processos_unit_tenant_idx ON public.compras_processos(tenant_id,unidade_id);
CREATE INDEX IF NOT EXISTS compras_processos_demanda_tenant_idx ON public.compras_processos(tenant_id,demanda_id);
CREATE INDEX IF NOT EXISTS compras_processos_versao_tenant_idx ON public.compras_processos(tenant_id,fluxo_versao_id);
CREATE INDEX IF NOT EXISTS compras_processos_ata_tenant_idx ON public.compras_processos(tenant_id,ata_id);
CREATE INDEX IF NOT EXISTS compras_pca_unit_tenant_idx ON public.compras_pca_itens(tenant_id,unidade_id);
CREATE INDEX IF NOT EXISTS compras_pca_processo_tenant_idx ON public.compras_pca_itens(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_proc_etapas_processo_tenant_idx ON public.compras_processos_etapas(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_proc_etapas_modelo_tenant_idx ON public.compras_processos_etapas(tenant_id,fluxo_etapa_id);
CREATE INDEX IF NOT EXISTS compras_proc_itens_processo_tenant_idx ON public.compras_processos_itens(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_proc_itens_ata_tenant_idx ON public.compras_processos_itens(tenant_id,item_ata_id);
CREATE INDEX IF NOT EXISTS compras_proc_forn_processo_tenant_idx ON public.compras_processos_fornecedores(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_proc_forn_fornecedor_tenant_idx ON public.compras_processos_fornecedores(tenant_id,fornecedor_id);
CREATE INDEX IF NOT EXISTS compras_docs_demanda_tenant_idx ON public.compras_documentos(tenant_id,demanda_id);
CREATE INDEX IF NOT EXISTS compras_docs_processo_tenant_idx ON public.compras_documentos(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_docs_etapa_tenant_idx ON public.compras_documentos(tenant_id,etapa_id);
CREATE INDEX IF NOT EXISTS compras_pesquisa_processo_tenant_idx ON public.compras_pesquisa_precos(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_pesquisa_item_tenant_idx ON public.compras_pesquisa_precos(tenant_id,item_id);
CREATE INDEX IF NOT EXISTS compras_pesquisa_doc_tenant_idx ON public.compras_pesquisa_precos(tenant_id,documento_id);
CREATE INDEX IF NOT EXISTS compras_pesquisa_fornecedor_tenant_idx ON public.compras_pesquisa_precos(tenant_id,fornecedor_id);
CREATE INDEX IF NOT EXISTS compras_tarefas_demanda_tenant_idx ON public.compras_tarefas(tenant_id,demanda_id);
CREATE INDEX IF NOT EXISTS compras_tarefas_processo_tenant_idx ON public.compras_tarefas(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_tarefas_etapa_tenant_idx ON public.compras_tarefas(tenant_id,etapa_id);
CREATE INDEX IF NOT EXISTS compras_publicacoes_processo_tenant_idx ON public.compras_publicacoes(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_publicacoes_doc_tenant_idx ON public.compras_publicacoes(tenant_id,documento_id);
CREATE INDEX IF NOT EXISTS compras_contratos_processo_tenant_idx ON public.compras_contratos(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_contratos_ata_tenant_idx ON public.compras_contratos(tenant_id,ata_id);
CREATE INDEX IF NOT EXISTS compras_contratos_fornecedor_tenant_idx ON public.compras_contratos(tenant_id,fornecedor_id);
CREATE INDEX IF NOT EXISTS compras_contrato_eventos_contrato_tenant_idx ON public.compras_contrato_eventos(tenant_id,contrato_id);
CREATE INDEX IF NOT EXISTS compras_contrato_eventos_doc_tenant_idx ON public.compras_contrato_eventos(tenant_id,documento_id);
CREATE INDEX IF NOT EXISTS compras_obrigacoes_processo_tenant_idx ON public.compras_obrigacoes(tenant_id,processo_id);
CREATE INDEX IF NOT EXISTS compras_obrigacoes_contrato_tenant_idx ON public.compras_obrigacoes(tenant_id,contrato_id);

-- Tenant explícito da ata e dos itens: correto mesmo se um operador pertencer a vários tenants.
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
    WHERE f.tenant_id=v_processo.tenant_id AND f.processo_id=v_processo.id
      AND f.fornecedor_id=p_fornecedor_id AND f.situacao='vencedor'
  ) THEN RAISE EXCEPTION 'Marque o fornecedor adjudicado como vencedor antes de gerar a ata'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.compras_processos_itens AS i
    WHERE i.tenant_id=v_processo.tenant_id AND i.processo_id=v_processo.id AND i.status='adjudicado'
      AND (i.quantidade_adjudicada IS NULL OR i.quantidade_adjudicada<=0 OR i.preco_unitario_adjudicado IS NULL OR i.preco_unitario_adjudicado<0)
  ) THEN RAISE EXCEPTION 'Há item adjudicado sem quantidade ou preço unitário conferido'; END IF;
  SELECT count(*)::integer,coalesce(sum(round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2)),0)::numeric(14,2)
  INTO v_count,v_total
  FROM public.compras_processos_itens AS i
  WHERE i.tenant_id=v_processo.tenant_id AND i.processo_id=v_processo.id AND i.status='adjudicado'
    AND i.quantidade_adjudicada>0 AND i.preco_unitario_adjudicado>=0;
  IF v_count=0 THEN RAISE EXCEPTION 'Inclua ao menos um item adjudicado com quantidade e preço conferidos'; END IF;
  INSERT INTO public.atas(
    tenant_id,numero_ata,processo_administrativo,numero_pregao,objeto,data_assinatura,
    data_inicio_vigencia,data_fim_vigencia,valor_global,fornecedor_id,situacao,modalidade,processo_compras_id
  ) VALUES (
    v_processo.tenant_id,trim(p_numero_ata),v_processo.numero_processo||'/'||v_processo.ano::text,
    CASE WHEN v_processo.modalidade ILIKE '%pregão%' THEN v_processo.numero_edital ELSE NULL END,
    v_processo.objeto,p_data_assinatura,p_data_inicio_vigencia,p_data_fim_vigencia,v_total,
    p_fornecedor_id,'ATIVA',v_processo.modalidade,v_processo.id
  ) RETURNING id INTO v_ata_id;
  INSERT INTO public.itens_ata(
    tenant_id,ata_id,item_numero,codigo_material,descricao,descricao_detalhada,especificacao_tecnica,
    unidade_medida,categoria,quantidade_contratada,quantidade_estimada,valor_unitario,valor_total,
    saldo_quantidade,saldo_valor,situacao,lote_numero
  )
  SELECT v_processo.tenant_id,v_ata_id,i.item_numero,i.codigo_catalogo,i.descricao,i.descricao_detalhada,i.especificacao_tecnica,
         i.unidade_medida,i.categoria,i.quantidade_adjudicada,i.quantidade_adjudicada,
         i.preco_unitario_adjudicado,round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2),
         i.quantidade_adjudicada,round(i.quantidade_adjudicada*i.preco_unitario_adjudicado,2),
         'DISPONIVEL',i.lote_numero
  FROM public.compras_processos_itens AS i
  WHERE i.tenant_id=v_processo.tenant_id AND i.processo_id=v_processo.id AND i.status='adjudicado';
  UPDATE public.compras_processos_itens AS i
  SET item_ata_id=ia.id,updated_at=now()
  FROM public.itens_ata AS ia
  WHERE ia.tenant_id=v_processo.tenant_id AND ia.ata_id=v_ata_id
    AND i.tenant_id=v_processo.tenant_id AND ia.item_numero=i.item_numero AND i.processo_id=v_processo.id;
  UPDATE public.compras_processos AS p
  SET ata_id=v_ata_id,status='ata_gerada',updated_at=now()
  WHERE p.id=v_processo.id AND p.tenant_id=v_processo.tenant_id;
  RETURN QUERY SELECT v_ata_id,v_count,v_total;
END $$;
REVOKE ALL ON FUNCTION public.compras_gerar_ata(uuid,text,integer,date,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compras_gerar_ata(uuid,text,integer,date,date,date) TO authenticated;
