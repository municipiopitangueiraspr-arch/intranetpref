-- Serializa a criação de versões da mesma chave de regra/fonte.
-- Não altera linhas existentes; SECURITY INVOKER preserva as policies RLS.
CREATE OR REPLACE FUNCTION public.compras_registrar_regra_versao(
  p_tenant_id uuid,
  p_chave text,
  p_tipo_registro text,
  p_titulo text,
  p_fonte_identificacao text,
  p_localizador text,
  p_fonte_url text,
  p_resumo text,
  p_vigencia_inicio date,
  p_vigencia_fim date,
  p_situacao text,
  p_substitui_id uuid
)
RETURNS TABLE(regra_id uuid, numero_versao integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_chave text;
  v_versao integer;
  v_id uuid;
  v_chave_anterior text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória' USING ERRCODE='42501';
  END IF;

  v_chave := nullif(btrim(p_chave), '');
  IF p_tenant_id IS NULL OR v_chave IS NULL THEN
    RAISE EXCEPTION 'Organização e chave são obrigatórias' USING ERRCODE='22023';
  END IF;
  IF NOT app_private.has_tenant_role(p_tenant_id, ARRAY['tenant_admin','compras_manager']) THEN
    RAISE EXCEPTION 'Apenas Compras ou administrador pode versionar fontes' USING ERRCODE='42501';
  END IF;
  IF p_tipo_registro NOT IN ('norma_legal','procedimento_interno','parametro_sistema') THEN
    RAISE EXCEPTION 'Tipo de registro inválido' USING ERRCODE='22023';
  END IF;
  IF p_situacao NOT IN ('rascunho','em_revisao') THEN
    RAISE EXCEPTION 'A versão deve iniciar como rascunho ou em revisão' USING ERRCODE='22023';
  END IF;
  IF nullif(btrim(p_titulo), '') IS NULL OR nullif(btrim(p_resumo), '') IS NULL THEN
    RAISE EXCEPTION 'Título e resumo são obrigatórios' USING ERRCODE='22023';
  END IF;
  IF p_vigencia_fim IS NOT NULL AND p_vigencia_inicio IS NOT NULL AND p_vigencia_fim < p_vigencia_inicio THEN
    RAISE EXCEPTION 'O fim da vigência não pode preceder o início' USING ERRCODE='22023';
  END IF;
  IF p_fonte_url IS NOT NULL AND p_fonte_url !~* '^https?://' THEN
    RAISE EXCEPTION 'A URL da fonte deve usar http ou https' USING ERRCODE='22023';
  END IF;

  -- A chave de advisory é calculada dentro do tenant e bloqueia somente
  -- versões concorrentes do mesmo registro lógico.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_tenant_id::text || ':' || v_chave, 0)
  );

  IF p_substitui_id IS NOT NULL THEN
    SELECT r.chave INTO v_chave_anterior
    FROM public.compras_regras_versoes AS r
    WHERE r.tenant_id = p_tenant_id AND r.id = p_substitui_id
    FOR UPDATE;
    IF NOT FOUND OR v_chave_anterior <> v_chave THEN
      RAISE EXCEPTION 'A versão substituída precisa pertencer à mesma chave e organização' USING ERRCODE='22023';
    END IF;
  END IF;

  SELECT coalesce(max(r.versao), 0) + 1 INTO v_versao
  FROM public.compras_regras_versoes AS r
  WHERE r.tenant_id = p_tenant_id AND r.chave = v_chave;

  INSERT INTO public.compras_regras_versoes(
    tenant_id, chave, versao, tipo_registro, titulo, fonte_identificacao,
    localizador, fonte_url, resumo, vigencia_inicio, vigencia_fim,
    situacao, substitui_id, created_by
  ) VALUES (
    p_tenant_id, v_chave, v_versao, p_tipo_registro, btrim(p_titulo),
    nullif(btrim(p_fonte_identificacao), ''), nullif(btrim(p_localizador), ''),
    nullif(btrim(p_fonte_url), ''), btrim(p_resumo), p_vigencia_inicio,
    p_vigencia_fim, p_situacao, p_substitui_id, app_private.current_user_id()
  ) RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_registrar_regra_versao(
  uuid,text,text,text,text,text,text,text,date,date,text,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_registrar_regra_versao(
  uuid,text,text,text,text,text,text,text,date,date,text,uuid
) TO authenticated;
