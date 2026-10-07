-- Conclusão de etapa com validação transacional de dependências e documentos.
-- O chamador permanece sujeito a RLS; apenas gestores do tenant podem executar.
CREATE OR REPLACE FUNCTION public.compras_concluir_etapa(p_etapa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_stage public.compras_processos_etapas%ROWTYPE;
  v_dependency jsonb;
  v_required jsonb;
  v_reference text;
  v_document_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória' USING ERRCODE = '42501';
  END IF;

  SELECT e.* INTO v_stage
  FROM public.compras_processos_etapas AS e
  WHERE e.id = p_etapa_id
    AND app_private.has_tenant_role(e.tenant_id, ARRAY['tenant_admin','compras_manager'])
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa não encontrada ou acesso negado' USING ERRCODE = '42501';
  END IF;

  IF lower(coalesce(v_stage.status, '')) IN ('concluida','concluído','concluido') THEN
    RETURN;
  END IF;

  FOR v_dependency IN
    SELECT element.value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_stage.dependencias_snapshot) = 'array'
        THEN v_stage.dependencias_snapshot ELSE '[]'::jsonb END
    ) AS element(value)
  LOOP
    v_reference := CASE
      WHEN jsonb_typeof(v_dependency) IN ('string','number') THEN v_dependency #>> '{}'
      ELSE coalesce(v_dependency->>'codigo', v_dependency->>'code', v_dependency->>'etapa_codigo', v_dependency->>'ordem')
    END;

    IF v_reference IS NOT NULL AND v_reference <> '' AND NOT EXISTS (
      SELECT 1
      FROM public.compras_processos_etapas AS dependency
      WHERE dependency.tenant_id = v_stage.tenant_id
        AND dependency.processo_id = v_stage.processo_id
        AND (dependency.codigo = v_reference OR dependency.ordem::text = v_reference)
        AND lower(coalesce(dependency.status, '')) IN ('concluida','concluído','concluido')
    ) THEN
      RAISE EXCEPTION 'A etapa depende de outra etapa ainda não concluída: %', v_reference USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_required IN
    SELECT element.value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_stage.documentos_snapshot->'obrigatorios') = 'array'
        THEN v_stage.documentos_snapshot->'obrigatorios' ELSE '[]'::jsonb END
    ) AS element(value)
  LOOP
    v_document_label := CASE
      WHEN jsonb_typeof(v_required) = 'string' THEN v_required #>> '{}'
      ELSE coalesce(v_required->>'tipo_documento', v_required->>'tipo', v_required->>'nome')
    END;

    IF v_document_label IS NOT NULL AND v_document_label <> '' AND NOT EXISTS (
      SELECT 1
      FROM public.compras_documentos AS document
      WHERE document.tenant_id = v_stage.tenant_id
        AND document.processo_id = v_stage.processo_id
        AND document.status = 'registrado'
        AND (lower(document.tipo_documento) = lower(v_document_label) OR lower(document.nome) = lower(v_document_label))
    ) THEN
      RAISE EXCEPTION 'Documento obrigatório não registrado para a etapa: %', v_document_label USING ERRCODE = '23514';
    END IF;
  END LOOP;

  UPDATE public.compras_processos_etapas
  SET status = 'concluida',
      concluida_em = now(),
      concluida_por = app_private.current_user_id(),
      updated_at = now()
  WHERE id = v_stage.id;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_concluir_etapa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_concluir_etapa(uuid) TO authenticated;
