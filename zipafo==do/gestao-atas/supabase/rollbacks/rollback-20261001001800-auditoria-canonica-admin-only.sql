-- Rollback técnico da auditoria canônica.
-- Executar somente em janela autorizada e após exportação/verificação do histórico.
-- Não remove as tabelas legadas compras_eventos_auditoria, atas_historico ou logs_operacoes.

BEGIN;
DROP VIEW IF EXISTS public.auditoria_eventos_relatorio;
DROP TRIGGER IF EXISTS auditoria_eventos_append_only ON public.auditoria_eventos;
DROP TABLE IF EXISTS public.auditoria_eventos;
DROP FUNCTION IF EXISTS app_private.registrar_auditoria_canonica();
DROP FUNCTION IF EXISTS app_private.bloquear_auditoria_mutacao();
COMMIT;
