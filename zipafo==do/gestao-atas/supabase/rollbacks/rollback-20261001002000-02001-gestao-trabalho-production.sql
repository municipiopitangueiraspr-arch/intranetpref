-- Rollback da promoção de Gestão de Trabalho em produção.
-- Executar somente em janela autorizada, após backup/verificação e plano de comunicação.
-- Este script remove o schema do módulo e o registro de catálogo correspondente;
-- não remove dados de outros módulos.
BEGIN;
DROP FUNCTION IF EXISTS public.gestao_trabalho_analisar_planejamento(uuid,integer,timestamptz,timestamptz,integer,uuid);
DROP FUNCTION IF EXISTS public.gestao_trabalho_registrar_evento(uuid,text,text,uuid,uuid,uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS app_private.gestao_trabalho_notificar_responsavel();
DROP TRIGGER IF EXISTS gtw_tarefas_notify ON public.gestao_trabalho_tarefas;
DROP TRIGGER IF EXISTS gtw_solicitacoes_notify ON public.gestao_trabalho_solicitacoes;
DROP TABLE IF EXISTS public.gestao_trabalho_notificacoes;
DROP TABLE IF EXISTS public.gestao_trabalho_eventos;
DROP TABLE IF EXISTS public.gestao_trabalho_documentos;
DROP TABLE IF EXISTS public.gestao_trabalho_comentarios;
DROP TABLE IF EXISTS public.gestao_trabalho_indisponibilidades;
DROP TABLE IF EXISTS public.gestao_trabalho_capacidades;
DROP TABLE IF EXISTS public.gestao_trabalho_agenda;
DROP TABLE IF EXISTS public.gestao_trabalho_rotina_ocorrencias;
DROP TABLE IF EXISTS public.gestao_trabalho_rotinas;
DROP TABLE IF EXISTS public.gestao_trabalho_dependencias;
DROP TABLE IF EXISTS public.gestao_trabalho_subtarefas;
DROP TABLE IF EXISTS public.gestao_trabalho_tarefas;
DROP TABLE IF EXISTS public.gestao_trabalho_solicitacoes;
DROP TABLE IF EXISTS public.gestao_trabalho_demandas;
DROP TABLE IF EXISTS public.gestao_trabalho_projetos;
DROP TABLE IF EXISTS public.gestao_trabalho_statuses;
DROP TABLE IF EXISTS public.gestao_trabalho_categorias;
DELETE FROM public.modulos_sistema WHERE lower(nome)='gestão de trabalho' AND rota='gestao-de-trabalho/index.html';
COMMIT;
