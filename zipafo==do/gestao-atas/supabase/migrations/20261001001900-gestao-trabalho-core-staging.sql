-- Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda
-- Primeira entrega operacional: homologação somente.
-- Não aplicar em produção sem autorização expressa do responsável.

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  cor text NOT NULL DEFAULT '#718b75',
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  terminal boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_projetos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  unidade_id uuid REFERENCES public.app_tenant_units(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  objetivo text,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  supervisor_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status text NOT NULL DEFAULT 'planejamento' CHECK (status IN ('planejamento','em_andamento','pausado','concluido','cancelado','arquivado')),
  inicio date,
  prazo date,
  percentual_execucao numeric(5,2) NOT NULL DEFAULT 0 CHECK (percentual_execucao BETWEEN 0 AND 100),
  origem_modulo text,
  origem_entidade text,
  origem_id text,
  arquivado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_demandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  unidade_id uuid REFERENCES public.app_tenant_units(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  categoria_id uuid REFERENCES public.gestao_trabalho_categorias(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','em_analise','convertida','arquivada','cancelada')),
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  solicitante_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  prazo date,
  converted_task_id uuid,
  converted_project_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  unidade_id uuid REFERENCES public.app_tenant_units(id) ON DELETE SET NULL,
  assunto text NOT NULL,
  descricao text NOT NULL,
  categoria_id uuid REFERENCES public.gestao_trabalho_categorias(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status text NOT NULL DEFAULT 'recebida' CHECK (status IN ('recebida','analisada','aceita','encaminhada','convertida','recusada','concluida','arquivada')),
  solicitante_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tarefa_id uuid,
  projeto_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  unidade_id uuid REFERENCES public.app_tenant_units(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.gestao_trabalho_projetos(id) ON DELETE SET NULL,
  demanda_id uuid REFERENCES public.gestao_trabalho_demandas(id) ON DELETE SET NULL,
  solicitacao_id uuid REFERENCES public.gestao_trabalho_solicitacoes(id) ON DELETE SET NULL,
  tarefa_pai_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE SET NULL,
  categoria_id uuid REFERENCES public.gestao_trabalho_categorias(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  status text NOT NULL DEFAULT 'caixa_entrada' CHECK (status IN ('caixa_entrada','nao_iniciada','planejada','agendada','em_execucao','pausada','aguardando_terceiro','aguardando_informacao','aguardando_aprovacao','concluida','cancelada','rejeitada','em_atraso')),
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  supervisor_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  solicitante_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  estimativa_minutos integer CHECK (estimativa_minutos IS NULL OR estimativa_minutos >= 0),
  tempo_real_minutos integer NOT NULL DEFAULT 0 CHECK (tempo_real_minutos >= 0),
  inicio_execucao timestamptz,
  fim_execucao timestamptz,
  pausada_em timestamptz,
  data_inicio date,
  prazo date,
  data_planejada date,
  horario_inicio timestamptz,
  horario_fim timestamptz,
  recorrencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  observacoes text,
  origem_modulo text,
  origem_entidade text,
  origem_id text,
  arquivada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (horario_fim IS NULL OR horario_inicio IS NULL OR horario_fim > horario_inicio)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_subtarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid NOT NULL REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ordem integer NOT NULL DEFAULT 0,
  concluida boolean NOT NULL DEFAULT false,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_dependencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid NOT NULL REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  depende_de_tarefa_id uuid NOT NULL REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'conclusao' CHECK (tipo IN ('conclusao','inicio','informacao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (tarefa_id <> depende_de_tarefa_id),
  UNIQUE (tarefa_id, depende_de_tarefa_id)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_rotinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  responsavel_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  supervisor_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  recorrencia jsonb NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  ativa boolean NOT NULL DEFAULT true,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_rotina_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  rotina_id uuid NOT NULL REFERENCES public.gestao_trabalho_rotinas(id) ON DELETE CASCADE,
  tarefa_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE SET NULL,
  data_ocorrencia date NOT NULL,
  status text NOT NULL DEFAULT 'gerada' CHECK (status IN ('gerada','executada','ignorada','cancelada')),
  UNIQUE (rotina_id, data_ocorrencia)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  tipo text NOT NULL DEFAULT 'tarefa' CHECK (tipo IN ('tarefa','compromisso','indisponibilidade','reuniao','treinamento','ferias','outro')),
  recorrencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim > inicio)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_capacidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  minutos_disponiveis integer NOT NULL DEFAULT 480 CHECK (minutos_disponiveis >= 0),
  UNIQUE (tenant_id, usuario_id, dia_semana)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_indisponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  motivo text NOT NULL,
  CHECK (fim > inicio)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  demanda_id uuid REFERENCES public.gestao_trabalho_demandas(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.gestao_trabalho_projetos(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES public.gestao_trabalho_solicitacoes(id) ON DELETE CASCADE,
  autor_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tarefa_id IS NOT NULL)::integer + (demanda_id IS NOT NULL)::integer + (projeto_id IS NOT NULL)::integer + (solicitacao_id IS NOT NULL)::integer = 1)
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  demanda_id uuid REFERENCES public.gestao_trabalho_demandas(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.gestao_trabalho_projetos(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES public.gestao_trabalho_solicitacoes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  storage_path text,
  referencia_url text,
  tipo_mime text,
  criado_por integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE RESTRICT,
  tarefa_id uuid REFERENCES public.gestao_trabalho_tarefas(id) ON DELETE CASCADE,
  demanda_id uuid REFERENCES public.gestao_trabalho_demandas(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.gestao_trabalho_projetos(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES public.gestao_trabalho_solicitacoes(id) ON DELETE CASCADE,
  ator_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  descricao text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gestao_trabalho_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.app_tenants(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  entidade text,
  entidade_id uuid,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gtw_tarefas_user_status_idx ON public.gestao_trabalho_tarefas(tenant_id,responsavel_id,status,prazo);
CREATE INDEX IF NOT EXISTS gtw_tarefas_plan_idx ON public.gestao_trabalho_tarefas(tenant_id,data_planejada,horario_inicio,horario_fim);
CREATE INDEX IF NOT EXISTS gtw_tarefas_project_idx ON public.gestao_trabalho_tarefas(tenant_id,projeto_id,status);
CREATE INDEX IF NOT EXISTS gtw_demandas_status_idx ON public.gestao_trabalho_demandas(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_projects_status_idx ON public.gestao_trabalho_projetos(tenant_id,status,prazo);
CREATE INDEX IF NOT EXISTS gtw_agenda_user_time_idx ON public.gestao_trabalho_agenda(tenant_id,usuario_id,inicio,fim);
CREATE INDEX IF NOT EXISTS gtw_eventos_timeline_idx ON public.gestao_trabalho_eventos(tenant_id,tarefa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gtw_notificacoes_user_idx ON public.gestao_trabalho_notificacoes(tenant_id,usuario_id,lida_em,created_at DESC);

ALTER TABLE public.gestao_trabalho_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_subtarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_dependencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_rotinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_rotina_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_capacidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_indisponibilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gestao_trabalho_notificacoes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['gestao_trabalho_categorias','gestao_trabalho_statuses','gestao_trabalho_projetos','gestao_trabalho_demandas','gestao_trabalho_solicitacoes','gestao_trabalho_tarefas','gestao_trabalho_subtarefas','gestao_trabalho_dependencias','gestao_trabalho_rotinas','gestao_trabalho_rotina_ocorrencias','gestao_trabalho_agenda','gestao_trabalho_capacidades','gestao_trabalho_indisponibilidades','gestao_trabalho_comentarios','gestao_trabalho_documentos','gestao_trabalho_eventos','gestao_trabalho_notificacoes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I',t,t);
    EXECUTE format('CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated USING (app_private.has_tenant_access(tenant_id))',t,t);
    EXECUTE format('DROP POLICY IF EXISTS %I_manage ON public.%I',t,t);
    EXECUTE format('CREATE POLICY %I_manage ON public.%I FOR ALL TO authenticated USING (app_private.has_tenant_access(tenant_id)) WITH CHECK (app_private.has_tenant_access(tenant_id))',t,t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS gestao_trabalho_notificacoes_read ON public.gestao_trabalho_notificacoes;
CREATE POLICY gestao_trabalho_notificacoes_read ON public.gestao_trabalho_notificacoes FOR SELECT TO authenticated USING (usuario_id=app_private.current_user_id() AND app_private.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS gestao_trabalho_notificacoes_manage ON public.gestao_trabalho_notificacoes;
CREATE POLICY gestao_trabalho_notificacoes_manage ON public.gestao_trabalho_notificacoes FOR UPDATE TO authenticated USING (usuario_id=app_private.current_user_id()) WITH CHECK (usuario_id=app_private.current_user_id());

GRANT SELECT,INSERT,UPDATE,DELETE ON public.gestao_trabalho_categorias,public.gestao_trabalho_statuses,public.gestao_trabalho_projetos,public.gestao_trabalho_demandas,public.gestao_trabalho_solicitacoes,public.gestao_trabalho_tarefas,public.gestao_trabalho_subtarefas,public.gestao_trabalho_dependencias,public.gestao_trabalho_rotinas,public.gestao_trabalho_rotina_ocorrencias,public.gestao_trabalho_agenda,public.gestao_trabalho_capacidades,public.gestao_trabalho_indisponibilidades,public.gestao_trabalho_comentarios,public.gestao_trabalho_documentos,public.gestao_trabalho_eventos,public.gestao_trabalho_notificacoes TO authenticated;

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
DECLARE v_conflicts jsonb; v_planned integer; v_capacity integer; v_day integer; v_overload integer;
BEGIN
  IF NOT app_private.has_tenant_access(p_tenant_id) THEN RAISE EXCEPTION 'Tenant não autorizado' USING ERRCODE='42501'; END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim <= p_inicio THEN
    RETURN jsonb_build_object('conflitos','[]'::jsonb,'carga_minutos',0,'capacidade_minutos',0,'sobrecarga_minutos',0,'pode_continuar',true);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','agenda','id',a.id,'titulo',a.titulo,'inicio',a.inicio,'fim',a.fim) ORDER BY a.inicio),'[]'::jsonb)
    INTO v_conflicts
  FROM public.gestao_trabalho_agenda a
  WHERE a.tenant_id=p_tenant_id AND a.usuario_id=p_responsavel_id AND a.inicio < p_fim AND a.fim > p_inicio;
  SELECT coalesce(sum(greatest(0,extract(epoch FROM (coalesce(t.horario_fim,t.horario_inicio + make_interval(mins=>coalesce(t.estimativa_minutos,0))) - t.horario_inicio))/60)::integer),0)
    INTO v_planned
  FROM public.gestao_trabalho_tarefas t
  WHERE t.tenant_id=p_tenant_id AND t.responsavel_id=p_responsavel_id AND t.id IS DISTINCT FROM p_excluir_tarefa_id AND t.horario_inicio IS NOT NULL AND t.horario_inicio::date=p_inicio::date AND t.status NOT IN ('concluida','cancelada','rejeitada');
  v_planned := v_planned + coalesce(p_estimativa_minutos,extract(epoch FROM (p_fim-p_inicio))/60);
  v_day := extract(dow FROM p_inicio)::integer;
  SELECT coalesce(min(c.minutos_disponiveis),480) INTO v_capacity FROM public.gestao_trabalho_capacidades c WHERE c.tenant_id=p_tenant_id AND c.usuario_id=p_responsavel_id AND c.dia_semana=v_day;
  v_overload := greatest(0,v_planned-v_capacity);
  RETURN jsonb_build_object('conflitos',v_conflicts,'carga_minutos',v_planned,'capacidade_minutos',v_capacity,'sobrecarga_minutos',v_overload,'pode_continuar',true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_analisar_planejamento(uuid,integer,timestamptz,timestamptz,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.gestao_trabalho_registrar_evento(
  p_tenant_id uuid, p_tipo text, p_descricao text, p_tarefa_id uuid DEFAULT NULL, p_demanda_id uuid DEFAULT NULL, p_projeto_id uuid DEFAULT NULL, p_solicitacao_id uuid DEFAULT NULL, p_dados jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT app_private.has_tenant_access(p_tenant_id) THEN RAISE EXCEPTION 'Tenant não autorizado' USING ERRCODE='42501'; END IF;
  INSERT INTO public.gestao_trabalho_eventos(tenant_id,tarefa_id,demanda_id,projeto_id,solicitacao_id,ator_id,tipo,descricao,dados)
  VALUES(p_tenant_id,p_tarefa_id,p_demanda_id,p_projeto_id,p_solicitacao_id,app_private.current_user_id(),p_tipo,p_descricao,coalesce(p_dados,'{}'::jsonb)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gestao_trabalho_registrar_evento(uuid,text,text,uuid,uuid,uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.gestao_trabalho_notificar_responsavel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app_private AS $$
BEGIN
  IF TG_TABLE_NAME='gestao_trabalho_tarefas' AND NEW.responsavel_id IS NOT NULL AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id)) THEN
    INSERT INTO public.gestao_trabalho_notificacoes(tenant_id,usuario_id,tipo,titulo,mensagem,entidade,entidade_id)
    VALUES(NEW.tenant_id,NEW.responsavel_id,'tarefa','Nova tarefa atribuída',NEW.titulo,'tarefa',NEW.id);
  END IF;
  IF TG_TABLE_NAME='gestao_trabalho_solicitacoes' AND NEW.responsavel_id IS NOT NULL AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id)) THEN
    INSERT INTO public.gestao_trabalho_notificacoes(tenant_id,usuario_id,tipo,titulo,mensagem,entidade,entidade_id)
    VALUES(NEW.tenant_id,NEW.responsavel_id,'solicitacao','Nova solicitação recebida',NEW.assunto,'solicitacao',NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gtw_tarefas_notify AFTER INSERT OR UPDATE OF responsavel_id ON public.gestao_trabalho_tarefas FOR EACH ROW EXECUTE FUNCTION app_private.gestao_trabalho_notificar_responsavel();
CREATE TRIGGER gtw_solicitacoes_notify AFTER INSERT OR UPDATE OF responsavel_id ON public.gestao_trabalho_solicitacoes FOR EACH ROW EXECUTE FUNCTION app_private.gestao_trabalho_notificar_responsavel();

-- Auditoria canônica já instalada pelo pacote anterior; os triggers abaixo são
-- adicionados apenas se a função existir no ambiente.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('app_private.registrar_auditoria_canonica()') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['gestao_trabalho_categorias','gestao_trabalho_statuses','gestao_trabalho_projetos','gestao_trabalho_demandas','gestao_trabalho_solicitacoes','gestao_trabalho_tarefas','gestao_trabalho_subtarefas','gestao_trabalho_dependencias','gestao_trabalho_rotinas','gestao_trabalho_rotina_ocorrencias','gestao_trabalho_agenda','gestao_trabalho_capacidades','gestao_trabalho_indisponibilidades','gestao_trabalho_comentarios','gestao_trabalho_documentos','gestao_trabalho_eventos','gestao_trabalho_notificacoes'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE tr.tgname='gtw_auditoria' AND n.nspname='public' AND c.relname=t AND NOT tr.tgisinternal) THEN
        EXECUTE format('CREATE TRIGGER gtw_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.registrar_auditoria_canonica()',t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- Configurações iniciais são criadas somente nos tenants já existentes no staging.
INSERT INTO public.gestao_trabalho_statuses(tenant_id,codigo,nome,ordem,terminal)
SELECT t.id,v.codigo,v.nome,v.ordem,v.terminal FROM public.app_tenants t CROSS JOIN (VALUES
 ('caixa_entrada','Caixa de entrada',10,false),('nao_iniciada','Não iniciada',20,false),('planejada','Planejada',30,false),('agendada','Agendada',40,false),('em_execucao','Em execução',50,false),('pausada','Pausada',60,false),('aguardando_terceiro','Aguardando terceiro',70,false),('aguardando_informacao','Aguardando informação',80,false),('concluida','Concluída',90,true),('cancelada','Cancelada',100,true)
) v(codigo,nome,ordem,terminal) ON CONFLICT (tenant_id,codigo) DO NOTHING;
INSERT INTO public.gestao_trabalho_categorias(tenant_id,nome,descricao,cor)
SELECT t.id,v.nome,v.descricao,v.cor FROM public.app_tenants t CROSS JOIN (VALUES
 ('Administrativo','Atividades administrativas','#718b75'),('Atendimento','Demandas e solicitações internas','#1a3a6b'),('Projeto','Atividades de projeto','#8b5cf6'),('Rotina','Atividades recorrentes','#a65c05'),('Reunião','Compromissos e reuniões','#567065')
) v(nome,descricao,cor) ON CONFLICT (tenant_id,nome) DO NOTHING;

UPDATE public.modulos_sistema SET descricao='Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda', icone='fa-list-check', rota='gestao-de-trabalho/index.html', ativo=true, visivel_intranet=true, cor='#718b75' WHERE lower(nome) IN ('gestão de trabalho','gestao de trabalho','tarefas');
INSERT INTO public.modulos_sistema(nome,descricao,icone,rota,ordem,cor,ativo,visivel_intranet)
SELECT 'Gestão de Trabalho','Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda','fa-list-check','gestao-de-trabalho/index.html',40,'#718b75',true,true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos_sistema WHERE lower(nome) IN ('gestão de trabalho','gestao de trabalho','tarefas'));

REVOKE ALL ON FUNCTION app_private.gestao_trabalho_notificar_responsavel() FROM PUBLIC,anon,authenticated;
