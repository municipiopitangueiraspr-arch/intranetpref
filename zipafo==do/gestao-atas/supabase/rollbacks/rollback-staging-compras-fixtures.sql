-- Rollback somente do ambiente de homologação.
-- Não executar no projeto de produção.
-- Remove apenas as fixtures criadas por este projeto, em ordem de dependência.

BEGIN;

DELETE FROM public.compras_processos_subetapas
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.compras_processos_etapas
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.compras_processos
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'))
  AND numero_processo = 'FIXTURE-001';

DELETE FROM public.compras_fluxo_subetapas
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.compras_fluxo_etapas
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.compras_fluxo_versoes
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.compras_fluxos
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.app_tenant_memberships
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'))
   OR user_id IN (SELECT id FROM public.usuarios WHERE uuid IN ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'));

DELETE FROM public.app_tenant_units
WHERE tenant_id IN (SELECT id FROM public.app_tenants WHERE slug IN ('fixture-tenant-a','fixture-tenant-b'));

DELETE FROM public.usuarios
WHERE uuid IN ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');

DELETE FROM public.app_tenants
WHERE slug IN ('fixture-tenant-a','fixture-tenant-b');

COMMIT;
