-- Gerenciador administrativo de modelos: uma única versão publicada por modelo.
CREATE UNIQUE INDEX compras_modelos_uma_publicada_idx
  ON public.compras_modelos_artefato_versoes(tenant_id, modelo_id)
  WHERE situacao = 'publicada';

CREATE OR REPLACE FUNCTION public.compras_salvar_modelo_artefato(
  p_modelo_id uuid,
  p_chave text,
  p_nome text,
  p_tipo text,
  p_descricao text,
  p_estrutura jsonb,
  p_publicar boolean DEFAULT false
)
RETURNS TABLE(modelo_id uuid, versao_id uuid, numero_versao integer, situacao text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $f$
DECLARE
  t uuid;
  m uuid;
  v uuid;
  n integer;
  s text;
BEGIN
  IF auth.uid() IS NULL OR p_estrutura IS NULL OR jsonb_typeof(p_estrutura) <> 'object' THEN
    RAISE EXCEPTION 'Sessão ou estrutura inválida' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('etp','termo_referencia','projeto_basico','edital','outro') THEN
    RAISE EXCEPTION 'Tipo de modelo inválido' USING ERRCODE = '22023';
  END IF;
  SELECT tenant_id INTO t
  FROM public.app_tenant_memberships
  WHERE user_id = app_private.current_user_id()
    AND ativo = true
    AND role IN ('tenant_admin','compras_manager')
  LIMIT 1;
  IF t IS NULL THEN
    RAISE EXCEPTION 'Perfil sem permissão para gerenciar modelos' USING ERRCODE = '42501';
  END IF;
  IF p_modelo_id IS NULL THEN
    INSERT INTO public.compras_modelos_artefato(tenant_id,chave,nome,tipo,descricao,created_by)
    VALUES(t,trim(p_chave),trim(p_nome),p_tipo,nullif(trim(p_descricao),''),app_private.current_user_id())
    RETURNING id INTO m;
  ELSE
    SELECT id INTO m FROM public.compras_modelos_artefato
    WHERE id = p_modelo_id AND tenant_id = t FOR UPDATE;
    IF m IS NULL THEN RAISE EXCEPTION 'Modelo não encontrado' USING ERRCODE = '42501'; END IF;
    UPDATE public.compras_modelos_artefato
    SET chave=trim(p_chave), nome=trim(p_nome), tipo=p_tipo, descricao=nullif(trim(p_descricao),'')
    WHERE id=m AND tenant_id=t;
  END IF;
  SELECT coalesce(max(versao),0)+1 INTO n
  FROM public.compras_modelos_artefato_versoes WHERE tenant_id=t AND modelo_id=m;
  s := CASE WHEN p_publicar THEN 'publicada' ELSE 'rascunho' END;
  IF p_publicar THEN
    UPDATE public.compras_modelos_artefato_versoes
    SET situacao='arquivada' WHERE tenant_id=t AND modelo_id=m AND situacao='publicada';
  END IF;
  INSERT INTO public.compras_modelos_artefato_versoes(tenant_id,modelo_id,versao,situacao,estrutura,publicada_em,publicada_por,created_by)
  VALUES(t,m,n,s,p_estrutura,CASE WHEN p_publicar THEN now() ELSE NULL END,CASE WHEN p_publicar THEN app_private.current_user_id() ELSE NULL END,app_private.current_user_id())
  RETURNING id INTO v;
  RETURN QUERY SELECT m,v,n,s;
END;
$f$;

REVOKE ALL ON FUNCTION public.compras_salvar_modelo_artefato(uuid,text,text,text,text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compras_salvar_modelo_artefato(uuid,text,text,text,text,jsonb,boolean) TO authenticated;
