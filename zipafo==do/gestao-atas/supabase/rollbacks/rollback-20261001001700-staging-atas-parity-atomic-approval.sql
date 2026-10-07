-- Rollback exclusivo do staging xnktywrdoqlacwmdemfp.
-- Não executar no projeto de produção.

BEGIN;
DROP FUNCTION IF EXISTS public.compras_aprovar_pedido(integer);
DROP TABLE IF EXISTS public.consumos;
DROP TABLE IF EXISTS public.itens_pedido;
DROP TABLE IF EXISTS public.pedidos;
DROP TABLE IF EXISTS public.itens_ata;
COMMIT;
