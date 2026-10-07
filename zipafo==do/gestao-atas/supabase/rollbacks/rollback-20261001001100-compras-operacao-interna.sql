-- Rollback da migration 20261001001100.
-- Executar somente com backup verificado e janela aprovada.
DROP TRIGGER IF EXISTS compras_execucoes_contratuais_audit ON public.compras_execucoes_contratuais;
DROP TRIGGER IF EXISTS compras_documento_versoes_audit ON public.compras_documento_versoes;
DROP TABLE IF EXISTS public.compras_execucoes_contratuais;
DROP TABLE IF EXISTS public.compras_documento_versoes;
DROP TABLE IF EXISTS public.compras_notificacoes;
DROP TABLE IF EXISTS public.compras_acessos_recentes;
DROP TABLE IF EXISTS public.compras_favoritos;
