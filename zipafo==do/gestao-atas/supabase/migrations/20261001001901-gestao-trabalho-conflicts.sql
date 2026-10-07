-- Correção incremental da análise de planejamento — homologação.
-- Conflitos de tarefas e agenda são alertas; nunca bloqueiam o cadastro.
CREATE OR REPLACE FUNCTION public.gestao_trabalho_analisar_planejamento(
  p_tenant_id uuid,
  p_responsavel_id integer,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_estimativa_minutos integer DEFAULT NULL,
  p_excluir_tarefa_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_conflicts jsonb;
  v_planned integer;
  v_capacity integer;
  v_day integer;
  v_overload integer;
BEGIN
  IF NOT app_private.has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Tenant não autorizado' USING ERRCODE='42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio THEN
    RETURN jsonb_build_object('conflitos','[]'::jsonb,'carga_minutos',0,'capacidade_minutos',0,'sobrecarga_minutos',0,'pode_continuar',true);
  END IF;
  WITH conflicts AS (
    SELECT jsonb_build_object('tipo','agenda','id',a.id,'titulo',a.titulo,'inicio',a.inicio,'fim',a.fim) AS item, a.inicio AS ordem
    FROM public.gestao_trabalho_agenda a
    WHERE a.tenant_id=p_tenant_id AND a.usuario_id=p_responsavel_id AND a.inicio < p_fim AND a.fim > p_inicio
    UNION ALL
    SELECT jsonb_build_object('tipo','tarefa','id',t.id,'titulo',t.titulo,'inicio',t.horario_inicio,'fim',t.horario_fim) AS item, t.horario_inicio AS ordem
    FROM public.gestao_trabalho_tarefas t
    WHERE t.tenant_id=p_tenant_id AND t.responsavel_id=p_responsavel_id AND t.id IS DISTINCT FROM p_excluir_tarefa_id
      AND t.horario_inicio IS NOT NULL AND coalesce(t.horario_fim,t.horario_inicio + make_interval(mins=>coalesce(t.estimativa_minutos,0))) > p_inicio
      AND t.horario_inicio < p_fim AND t.status NOT IN ('concluida','cancelada','rejeitada')
  )
  SELECT coalesce(jsonb_agg(item ORDER BY ordem),'[]'::jsonb) INTO v_conflicts FROM conflicts;
  SELECT coalesce(sum(greatest(0,extract(epoch FROM (coalesce(t.horario_fim,t.horario_inicio + make_interval(mins=>coalesce(t.estimativa_minutos,0))) - t.horario_inicio))/60)::integer),0)
    INTO v_planned
  FROM public.gestao_trabalho_tarefas t
  WHERE t.tenant_id=p_tenant_id AND t.responsavel_id=p_responsavel_id AND t.id IS DISTINCT FROM p_excluir_tarefa_id
    AND t.horario_inicio IS NOT NULL AND t.horario_inicio::date=p_inicio::date AND t.status NOT IN ('concluida','cancelada','rejeitada');
  v_planned := v_planned + coalesce(p_estimativa_minutos,extract(epoch FROM (p_fim-p_inicio))/60);
  v_day := extract(dow FROM p_inicio)::integer;
  SELECT coalesce(min(c.minutos_disponiveis),480) INTO v_capacity
  FROM public.gestao_trabalho_capacidades c
  WHERE c.tenant_id=p_tenant_id AND c.usuario_id=p_responsavel_id AND c.dia_semana=v_day;
  v_overload := greatest(0,v_planned-v_capacity);
  RETURN jsonb_build_object('conflitos',v_conflicts,'carga_minutos',v_planned,'capacidade_minutos',v_capacity,'sobrecarga_minutos',v_overload,'pode_continuar',true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_analisar_planejamento(uuid,integer,timestamptz,timestamptz,integer,uuid) TO authenticated;
