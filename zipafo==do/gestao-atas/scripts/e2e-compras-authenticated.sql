-- E2E autenticado transacional do módulo de Compras.
-- Executar somente no staging xnktywrdoqlacwmdemfp.
-- Usa claims sintéticas e sempre termina com ROLLBACK.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

-- A identidade A deve poder ler o fixture do próprio tenant.
SELECT count(*) AS visible_fixture_processes
FROM public.compras_processos
WHERE numero_processo='FIXTURE-001'
LIMIT 1;

-- A conclusão operacional deve respeitar tenant e registrar o ator.
UPDATE public.compras_processos_subetapas
SET status='concluida', concluida_em=now(), concluida_por=app_private.current_user_id()
WHERE processo_id=(SELECT id FROM public.compras_processos WHERE numero_processo='FIXTURE-001' LIMIT 1);

SELECT status, concluida_por IS NOT NULL AS has_actor
FROM public.compras_processos_subetapas
WHERE processo_id=(SELECT id FROM public.compras_processos WHERE numero_processo='FIXTURE-001' LIMIT 1)
LIMIT 10;

ROLLBACK;
