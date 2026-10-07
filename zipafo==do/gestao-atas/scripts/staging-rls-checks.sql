-- Checks read-only de RLS para o staging de Compras.
-- Executar somente no projeto xnktywrdoqlacwmdemfp.
-- Cada bloco usa rollback e não altera dados.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT count(*) AS gestor_a_visible_processes
FROM public.compras_processos
LIMIT 1;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT count(*) AS gestor_b_visible_processes
FROM public.compras_processos
LIMIT 1;
ROLLBACK;
