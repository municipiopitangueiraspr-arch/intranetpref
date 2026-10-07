-- Rollback da fase 7.
-- Remove somente a função criada pela migration 20261001001600.
-- Não desfaz aprovações já realizadas nem remove consumos.

DROP FUNCTION IF EXISTS public.compras_aprovar_pedido(integer);
