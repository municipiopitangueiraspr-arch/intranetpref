-- Hardening de integridade referencial de Compras.
-- Auditoria live anterior à aplicação encontrou zero referências cruzadas inválidas.
-- Não altera estados/atas de negócio; processo_id em versões é metadado derivado do artefato.

-- Chaves únicas compostas usadas pelas FKs de mesmo tenant e mesmo processo.
CREATE UNIQUE INDEX IF NOT EXISTS compras_proc_etapas_tenant_processo_id_uq
  ON public.compras_processos_etapas(tenant_id,processo_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS compras_docs_tenant_processo_id_uq
  ON public.compras_documentos(tenant_id,processo_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS compras_artefatos_tenant_processo_id_uq
  ON public.compras_artefatos(tenant_id,processo_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS compras_decisoes_tenant_processo_id_uq
  ON public.compras_decisoes(tenant_id,processo_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS compras_atas_tenant_processo_id_uq
  ON public.atas(tenant_id,processo_compras_id,id);

-- Cada revisão recebe o processo derivado do artefato que a contém.
ALTER TABLE public.compras_artefato_versoes
  ADD COLUMN IF NOT EXISTS processo_id uuid;
UPDATE public.compras_artefato_versoes v
SET processo_id=a.processo_id
FROM public.compras_artefatos a
WHERE a.tenant_id=v.tenant_id AND a.id=v.artefato_id
  AND v.processo_id IS DISTINCT FROM a.processo_id;
ALTER TABLE public.compras_artefato_versoes
  ALTER COLUMN processo_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS compras_artefato_versoes_tenant_processo_id_uq
  ON public.compras_artefato_versoes(tenant_id,processo_id,id);
CREATE INDEX IF NOT EXISTS compras_artefato_versoes_process_artifact_idx
  ON public.compras_artefato_versoes(tenant_id,processo_id,artefato_id);

CREATE OR REPLACE FUNCTION app_private.compras_set_artefato_versao_processo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  SELECT a.processo_id INTO NEW.processo_id
  FROM public.compras_artefatos a
  WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.artefato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artefato inexistente ou indisponível neste tenant';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.compras_set_artefato_versao_processo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.compras_set_artefato_versao_processo() TO authenticated;
DROP TRIGGER IF EXISTS compras_artefato_versao_set_processo ON public.compras_artefato_versoes;
CREATE TRIGGER compras_artefato_versao_set_processo
BEFORE INSERT OR UPDATE OF tenant_id,artefato_id ON public.compras_artefato_versoes
FOR EACH ROW EXECUTE FUNCTION app_private.compras_set_artefato_versao_processo();

-- Rejeita etapa vinculada a outro processo (inclui documentos e artefatos).
CREATE INDEX IF NOT EXISTS compras_artefatos_stage_process_idx
  ON public.compras_artefatos(tenant_id,processo_id,etapa_id) WHERE etapa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_documentos_stage_process_idx
  ON public.compras_documentos(tenant_id,processo_id,etapa_id) WHERE etapa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_decisoes_artifact_process_idx
  ON public.compras_decisoes(tenant_id,processo_id,artefato_versao_id) WHERE artefato_versao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_decisoes_document_process_idx
  ON public.compras_decisoes(tenant_id,processo_id,documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_decisoes_previous_process_idx
  ON public.compras_decisoes(tenant_id,processo_id,substitui_id) WHERE substitui_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_processos_ata_same_process_idx
  ON public.compras_processos(tenant_id,id,ata_id) WHERE ata_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_artefatos_etapa_process_fk' AND conrelid='public.compras_artefatos'::regclass) THEN
    ALTER TABLE public.compras_artefatos ADD CONSTRAINT compras_artefatos_etapa_process_fk
      FOREIGN KEY (tenant_id,processo_id,etapa_id)
      REFERENCES public.compras_processos_etapas(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_artefato_versoes_process_artifact_fk' AND conrelid='public.compras_artefato_versoes'::regclass) THEN
    ALTER TABLE public.compras_artefato_versoes ADD CONSTRAINT compras_artefato_versoes_process_artifact_fk
      FOREIGN KEY (tenant_id,processo_id,artefato_id)
      REFERENCES public.compras_artefatos(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_documentos_etapa_process_fk' AND conrelid='public.compras_documentos'::regclass) THEN
    ALTER TABLE public.compras_documentos ADD CONSTRAINT compras_documentos_etapa_process_fk
      FOREIGN KEY (tenant_id,processo_id,etapa_id)
      REFERENCES public.compras_processos_etapas(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_documentos_etapa_requires_process_ck' AND conrelid='public.compras_documentos'::regclass) THEN
    ALTER TABLE public.compras_documentos ADD CONSTRAINT compras_documentos_etapa_requires_process_ck
      CHECK (etapa_id IS NULL OR processo_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_decisoes_artifact_process_fk' AND conrelid='public.compras_decisoes'::regclass) THEN
    ALTER TABLE public.compras_decisoes ADD CONSTRAINT compras_decisoes_artifact_process_fk
      FOREIGN KEY (tenant_id,processo_id,artefato_versao_id)
      REFERENCES public.compras_artefato_versoes(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_decisoes_document_process_fk' AND conrelid='public.compras_decisoes'::regclass) THEN
    ALTER TABLE public.compras_decisoes ADD CONSTRAINT compras_decisoes_document_process_fk
      FOREIGN KEY (tenant_id,processo_id,documento_id)
      REFERENCES public.compras_documentos(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_decisoes_previous_process_fk' AND conrelid='public.compras_decisoes'::regclass) THEN
    ALTER TABLE public.compras_decisoes ADD CONSTRAINT compras_decisoes_previous_process_fk
      FOREIGN KEY (tenant_id,processo_id,substitui_id)
      REFERENCES public.compras_decisoes(tenant_id,processo_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_processos_ata_same_process_fk' AND conrelid='public.compras_processos'::regclass) THEN
    ALTER TABLE public.compras_processos ADD CONSTRAINT compras_processos_ata_same_process_fk
      FOREIGN KEY (tenant_id,id,ata_id)
      REFERENCES public.atas(tenant_id,processo_compras_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_processos_ata_gerada_requires_link_ck' AND conrelid='public.compras_processos'::regclass) THEN
    ALTER TABLE public.compras_processos ADD CONSTRAINT compras_processos_ata_gerada_requires_link_ck
      CHECK (status <> 'ata_gerada' OR ata_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.compras_artefatos VALIDATE CONSTRAINT compras_artefatos_etapa_process_fk;
ALTER TABLE public.compras_artefato_versoes VALIDATE CONSTRAINT compras_artefato_versoes_process_artifact_fk;
ALTER TABLE public.compras_documentos VALIDATE CONSTRAINT compras_documentos_etapa_process_fk;
ALTER TABLE public.compras_documentos VALIDATE CONSTRAINT compras_documentos_etapa_requires_process_ck;
ALTER TABLE public.compras_decisoes VALIDATE CONSTRAINT compras_decisoes_artifact_process_fk;
ALTER TABLE public.compras_decisoes VALIDATE CONSTRAINT compras_decisoes_document_process_fk;
ALTER TABLE public.compras_decisoes VALIDATE CONSTRAINT compras_decisoes_previous_process_fk;
ALTER TABLE public.compras_processos VALIDATE CONSTRAINT compras_processos_ata_same_process_fk;
ALTER TABLE public.compras_processos VALIDATE CONSTRAINT compras_processos_ata_gerada_requires_link_ck;
