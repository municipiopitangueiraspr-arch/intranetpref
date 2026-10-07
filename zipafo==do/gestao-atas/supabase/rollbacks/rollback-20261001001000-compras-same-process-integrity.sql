-- ROLLBACK OPERACIONAL — migration 20261001001000-compras-same-process-integrity.sql
-- Não executar como migration normal. Exige janela de manutenção e backup verificado.
-- A migration adicionou somente constraints/índices, trigger/função e processo_id
-- derivado em compras_artefato_versoes. Não reverte a migration 009 ou anteriores.
-- Ao executar este rollback, processo_id derivado será removido e poderá ser
-- reconstruído por JOIN com compras_artefatos caso a migration 010 seja reaplicada.

BEGIN;

ALTER TABLE public.compras_artefatos DROP CONSTRAINT IF EXISTS compras_artefatos_etapa_process_fk;
ALTER TABLE public.compras_artefato_versoes DROP CONSTRAINT IF EXISTS compras_artefato_versoes_process_artifact_fk;
ALTER TABLE public.compras_documentos DROP CONSTRAINT IF EXISTS compras_documentos_etapa_process_fk;
ALTER TABLE public.compras_documentos DROP CONSTRAINT IF EXISTS compras_documentos_etapa_requires_process_ck;
ALTER TABLE public.compras_decisoes DROP CONSTRAINT IF EXISTS compras_decisoes_artifact_process_fk;
ALTER TABLE public.compras_decisoes DROP CONSTRAINT IF EXISTS compras_decisoes_document_process_fk;
ALTER TABLE public.compras_decisoes DROP CONSTRAINT IF EXISTS compras_decisoes_previous_process_fk;
ALTER TABLE public.compras_processos DROP CONSTRAINT IF EXISTS compras_processos_ata_same_process_fk;
ALTER TABLE public.compras_processos DROP CONSTRAINT IF EXISTS compras_processos_ata_gerada_requires_link_ck;

DROP TRIGGER IF EXISTS compras_artefato_versao_set_processo ON public.compras_artefato_versoes;
DROP FUNCTION IF EXISTS app_private.compras_set_artefato_versao_processo();

DROP INDEX IF EXISTS public.compras_proc_etapas_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_docs_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_artefatos_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_decisoes_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_atas_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_artefato_versoes_tenant_processo_id_uq;
DROP INDEX IF EXISTS public.compras_artefato_versoes_process_artifact_idx;
DROP INDEX IF EXISTS public.compras_artefatos_stage_process_idx;
DROP INDEX IF EXISTS public.compras_documentos_stage_process_idx;
DROP INDEX IF EXISTS public.compras_decisoes_artifact_process_idx;
DROP INDEX IF EXISTS public.compras_decisoes_document_process_idx;
DROP INDEX IF EXISTS public.compras_decisoes_previous_process_idx;
DROP INDEX IF EXISTS public.compras_processos_ata_same_process_idx;

ALTER TABLE public.compras_artefato_versoes DROP COLUMN IF EXISTS processo_id;

COMMIT;
