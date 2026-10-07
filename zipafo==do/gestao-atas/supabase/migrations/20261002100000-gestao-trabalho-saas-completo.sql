-- Gestão de Trabalho — complementação SaaS completa
-- Migration aditiva e idempotente. Aplicar primeiro em homologação e promover após aceite.

ALTER TABLE public.gestao_trabalho_tarefas
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.gestao_trabalho_categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflito_decisao text CHECK (conflito_decisao IS NULL OR conflito_decisao IN ('alterar','continuar')),
  ADD COLUMN IF NOT EXISTS conflito_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS exige_subtarefas boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_configuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chave)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_automacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  evento text NOT NULL,
  condicoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  acao jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_integracao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  origem_modulo text NOT NULL,
  origem_entidade text NOT NULL,
  origem_id text NOT NULL,
  evento text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','processado','erro','ignorado')),
  processado_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, origem_modulo, origem_entidade, origem_id, evento)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  severidade text NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','atencao','critico')),
  titulo text NOT NULL,
  mensagem text NOT NULL,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_relatorios_salvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  tipo text NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  compartilhado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gtw_subtarefas_task_idx ON public.gestao_trabalho_subtarefas(tenant_id,tarefa_id,ordem);
CREATE INDEX IF NOT EXISTS gtw_dependencias_task_idx ON public.gestao_trabalho_dependencias(tenant_id,tarefa_id);
CREATE INDEX IF NOT EXISTS gtw_capacidade_user_idx ON public.gestao_trabalho_capacidades(tenant_id,usuario_id,dia_semana);
CREATE INDEX IF NOT EXISTS gtw_indisponibilidade_user_idx ON public.gestao_trabalho_indisponibilidades(tenant_id,usuario_id,inicio,fim);
CREATE INDEX IF NOT EXISTS gtw_comentarios_entity_idx ON public.gestao_trabalho_comentarios(tenant_id,tarefa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_documentos_entity_idx ON public.gestao_trabalho_documentos(tenant_id,tarefa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_integracao_status_idx ON public.gestao_trabalho_integracao_eventos(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_alertas_user_idx ON public.gestao_trabalho_alertas(tenant_id,usuario_id,resolvido_em,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_automacoes_event_idx ON public.gestao_trabalho_automacoes(tenant_id,evento,ativa);

ALTER TABLE public.gestao_trabalho_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_automacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_integracao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_relatorios_salvos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestao_trabalho_configuracoes','gestao_trabalho_automacoes','gestao_trabalho_integracao_eventos','gestao_trabalho_alertas','gestao_trabalho_relatorios_salvos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I',t,t);
    EXECUTE format('DROP POLICY IF EXISTS %I_manage ON public.%I',t,t);
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id))',t,t);
    EXECUTE format('CREATE POLICY %I_manage ON public.%I FOR ALL TO authenticated USING (app_private.has_tenant_access(tenant_id)) WITH CHECK (app_private.has_tenant_access(tenant_id))',t,t);
  END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.gestao_trabalho_configuracoes,public.gestao_trabalho_automacoes,public.gestao_trabalho_integracao_eventos,public.gestao_trabalho_alertas,public.gestao_trabalho_relatorios_salvos TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_registrar_decisao_conflito(
  p_tenant_id uuid, p_tarefa_id uuid, p_decisao text, p_dados jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, app_private AS $$
DECLARE r jsonb;
BEGIN
  IF p_decisao NOT IN ('alterar','continuar') THEN RAISE EXCEPTION 'Decisão de conflito inválida'; END IF;
  UPDATE public.gestao_trabalho_tarefas SET conflito_decisao=p_decisao, conflito_dados=p_dados, updated_at=now()
   WHERE id=p_tarefa_id AND tenant_id=p_tenant_id;
  PERFORM public.gestao_trabalho_registrar_evento(p_tenant_id,'conflito_decisao','Decisão de conflito: '||p_decisao,p_tarefa_id,NULL,NULL,NULL,p_dados);
  SELECT jsonb_build_object('tarefa_id',id,'decisao',conflito_decisao,'dados',conflito_dados) INTO r
    FROM public.gestao_trabalho_tarefas WHERE id=p_tarefa_id AND tenant_id=p_tenant_id;
  RETURN COALESCE(r,'{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_registrar_decisao_conflito(uuid,uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_pesquisa_global(
  p_tenant_id uuid, p_busca text, p_limite integer DEFAULT 50
) RETURNS TABLE(tipo text,id uuid,titulo text,subtitulo text,updated_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT 'tarefa',t.id,t.titulo,coalesce(t.descricao,''),t.updated_at FROM public.gestao_trabalho_tarefas t
   WHERE t.tenant_id=p_tenant_id AND (t.titulo ILIKE '%'||p_busca||'%' OR coalesce(t.descricao,'') ILIKE '%'||p_busca||'%')
  UNION ALL SELECT 'demanda',d.id,d.titulo,coalesce(d.descricao,''),d.updated_at FROM public.gestao_trabalho_demandas d
   WHERE d.tenant_id=p_tenant_id AND (d.titulo ILIKE '%'||p_busca||'%' OR coalesce(d.descricao,'') ILIKE '%'||p_busca||'%')
  UNION ALL SELECT 'projeto',p.id,p.titulo,coalesce(p.objetivo,''),p.updated_at FROM public.gestao_trabalho_projetos p
   WHERE p.tenant_id=p_tenant_id AND (p.titulo ILIKE '%'||p_busca||'%' OR coalesce(p.descricao,'') ILIKE '%'||p_busca||'%')
  UNION ALL SELECT 'solicitação',s.id,s.assunto,s.descricao,s.updated_at FROM public.gestao_trabalho_solicitacoes s
   WHERE s.tenant_id=p_tenant_id AND (s.assunto ILIKE '%'||p_busca||'%' OR s.descricao ILIKE '%'||p_busca||'%')
  ORDER BY updated_at DESC LIMIT greatest(1,least(p_limite,200));
$$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_pesquisa_global(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_resumo(
  p_tenant_id uuid, p_usuario_id integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, app_private AS $$
DECLARE r jsonb;
BEGIN
 SELECT jsonb_build_object(
  'tarefas_abertas',count(*) FILTER (WHERE status NOT IN ('concluida','cancelada','rejeitada')),
  'tarefas_hoje',count(*) FILTER (WHERE prazo=current_date AND status NOT IN ('concluida','cancelada','rejeitada')),
  'atrasadas',count(*) FILTER (WHERE prazo<current_date AND status NOT IN ('concluida','cancelada','rejeitada')),
  'sem_responsavel',count(*) FILTER (WHERE responsavel_id IS NULL AND status NOT IN ('concluida','cancelada','rejeitada')),
  'em_execucao',count(*) FILTER (WHERE status='em_execucao'),
  'delegadas',count(*) FILTER (WHERE criado_por=coalesce(p_usuario_id,criado_por) AND responsavel_id IS NOT NULL AND responsavel_id<>criado_por)
 ) INTO r FROM public.gestao_trabalho_tarefas WHERE tenant_id=p_tenant_id AND (p_usuario_id IS NULL OR responsavel_id=p_usuario_id OR criado_por=p_usuario_id OR supervisor_id=p_usuario_id);
 RETURN coalesce(r,'{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_resumo(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_gerar_ocorrencias(
  p_tenant_id uuid, p_inicio date, p_fim date
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, app_private AS $$
DECLARE r record; d date; freq text; dias jsonb; n integer := 0; ok boolean;
BEGIN
 FOR r IN SELECT * FROM public.gestao_trabalho_rotinas WHERE tenant_id=p_tenant_id AND ativa=true AND vigencia_inicio<=p_fim AND (vigencia_fim IS NULL OR vigencia_fim>=p_inicio) LOOP
  freq := coalesce(r.recorrencia->>'frequencia','diaria'); dias := coalesce(r.recorrencia->'dias_semana','[]'::jsonb);
  FOR d IN SELECT gs::date FROM generate_series(greatest(p_inicio,r.vigencia_inicio),least(p_fim,coalesce(r.vigencia_fim,p_fim)),'1 day') gs LOOP
   ok := CASE WHEN freq='dias_uteis' THEN extract(isodow from d) BETWEEN 1 AND 5 WHEN freq='semanal' THEN extract(isodow from d)=coalesce((r.recorrencia->>'dia_semana')::int,1) WHEN freq='mensal' THEN extract(day from d)=coalesce((r.recorrencia->>'dia_mes')::int,1) ELSE true END;
   IF ok THEN INSERT INTO public.gestao_trabalho_rotina_ocorrencias(tenant_id,rotina_id,data_ocorrencia) VALUES(p_tenant_id,r.id,d) ON CONFLICT DO NOTHING; n:=n+1; END IF;
  END LOOP;
 END LOOP; RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_gerar_ocorrencias(uuid,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_atualizar_progresso_projeto()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE total integer; concluidas integer;
BEGIN
 IF NEW.projeto_id IS NOT NULL THEN
  SELECT count(*),count(*) FILTER (WHERE status='concluida') INTO total,concluidas FROM public.gestao_trabalho_tarefas WHERE projeto_id=NEW.projeto_id;
  UPDATE public.gestao_trabalho_projetos SET percentual_execucao=CASE WHEN total=0 THEN 0 ELSE round(concluidas*100.0/total,2) END,updated_at=now() WHERE id=NEW.projeto_id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gtw_project_progress ON public.gestao_trabalho_tarefas;
CREATE TRIGGER gtw_project_progress AFTER INSERT OR UPDATE OF status,projeto_id ON public.gestao_trabalho_tarefas FOR EACH ROW EXECUTE FUNCTION public.gestao_trabalho_atualizar_progresso_projeto();

INSERT INTO public.gestao_trabalho_configuracoes(tenant_id,chave,valor)
SELECT id,'padrao_alertas','{"antecedencia_dias":3,"sobrecarga_alerta":true,"conflito_alerta":true}'::jsonb FROM public.app_tenants
ON CONFLICT (tenant_id,chave) DO NOTHING;
