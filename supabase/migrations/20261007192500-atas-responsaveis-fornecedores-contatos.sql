BEGIN;

ALTER TABLE public.atas
  ADD COLUMN IF NOT EXISTS gestor_id integer,
  ADD COLUMN IF NOT EXISTS fiscal_id integer,
  ADD COLUMN IF NOT EXISTS fiscal_substituto_id integer,
  ADD COLUMN IF NOT EXISTS orgao_responsavel_id integer,
  ADD COLUMN IF NOT EXISTS ato_designacao varchar,
  ADD COLUMN IF NOT EXISTS data_designacao date,
  ADD COLUMN IF NOT EXISTS responsaveis_observacoes text,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_nome varchar,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_email varchar,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_telefone varchar;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atas_gestor_id_fkey' AND conrelid = 'public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atas_fiscal_id_fkey' AND conrelid = 'public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_fiscal_id_fkey FOREIGN KEY (fiscal_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atas_fiscal_substituto_id_fkey' AND conrelid = 'public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_fiscal_substituto_id_fkey FOREIGN KEY (fiscal_substituto_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atas_orgao_responsavel_id_fkey' AND conrelid = 'public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_orgao_responsavel_id_fkey FOREIGN KEY (orgao_responsavel_id) REFERENCES public.orgaos(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.representantes
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE INDEX IF NOT EXISTS atas_gestor_id_idx ON public.atas (gestor_id);
CREATE INDEX IF NOT EXISTS atas_fiscal_id_idx ON public.atas (fiscal_id);
CREATE INDEX IF NOT EXISTS atas_fiscal_substituto_id_idx ON public.atas (fiscal_substituto_id);
CREATE INDEX IF NOT EXISTS atas_orgao_responsavel_id_idx ON public.atas (orgao_responsavel_id);
CREATE INDEX IF NOT EXISTS representantes_fornecedor_principal_idx ON public.representantes (fornecedor_id, principal) WHERE ativo = true;

COMMENT ON COLUMN public.atas.gestor_id IS 'Usuário identificado como gestor da ata; informativo nesta fase, sem regra automática de aprovação.';
COMMENT ON COLUMN public.atas.fiscal_id IS 'Usuário identificado como fiscal da ata; informativo nesta fase, sem regra automática de aprovação.';
COMMENT ON COLUMN public.atas.fiscal_substituto_id IS 'Fiscal substituto identificado para a ata; informativo nesta fase.';
COMMENT ON COLUMN public.atas.orgao_responsavel_id IS 'Órgão/secretaria responsável pelo acompanhamento da ata.';
COMMENT ON COLUMN public.atas.ato_designacao IS 'Portaria, decreto ou outro ato de designação dos responsáveis.';
COMMENT ON COLUMN public.atas.data_designacao IS 'Data do ato de designação dos responsáveis.';
COMMENT ON COLUMN public.atas.fornecedor_contato_nome IS 'Snapshot do contato utilizado na contratação/ata.';
COMMENT ON COLUMN public.atas.fornecedor_contato_email IS 'Snapshot do e-mail utilizado na contratação/ata.';
COMMENT ON COLUMN public.atas.fornecedor_contato_telefone IS 'Snapshot do telefone utilizado na contratação/ata.';

COMMIT;
