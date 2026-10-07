-- Hardening incremental de índices após leitura do advisor de performance.
-- Preserva um índice equivalente já existente e cobre FKs do módulo Compras.
-- Não altera registros de negócio nem dados legados.

-- Criado também na migração 001 com a mesma definição de
-- compras_processos_tenant_unidade_idx; mantém-se somente a primeira.
DROP INDEX IF EXISTS public.compras_processos_unit_tenant_idx;

CREATE INDEX IF NOT EXISTS app_tenant_memberships_orgao_id_idx ON public.app_tenant_memberships(orgao_id);
CREATE INDEX IF NOT EXISTS app_tenant_units_legacy_orgao_id_idx ON public.app_tenant_units(legacy_orgao_id);

CREATE INDEX IF NOT EXISTS compras_contrato_eventos_registrado_por_idx ON public.compras_contrato_eventos(registrado_por);
CREATE INDEX IF NOT EXISTS compras_contratos_created_by_idx ON public.compras_contratos(created_by);
CREATE INDEX IF NOT EXISTS compras_contratos_fiscal_id_idx ON public.compras_contratos(fiscal_id);
CREATE INDEX IF NOT EXISTS compras_contratos_gestor_id_idx ON public.compras_contratos(gestor_id);
CREATE INDEX IF NOT EXISTS compras_demandas_criado_por_idx ON public.compras_demandas(criado_por);
CREATE INDEX IF NOT EXISTS compras_demandas_responsavel_id_idx ON public.compras_demandas(responsavel_id);
CREATE INDEX IF NOT EXISTS compras_documentos_criado_por_idx ON public.compras_documentos(criado_por);
CREATE INDEX IF NOT EXISTS compras_eventos_auditoria_ator_id_idx ON public.compras_eventos_auditoria(ator_id);
CREATE INDEX IF NOT EXISTS compras_fluxo_versoes_publicada_por_idx ON public.compras_fluxo_versoes(publicada_por);
CREATE INDEX IF NOT EXISTS compras_fluxos_created_by_idx ON public.compras_fluxos(created_by);
CREATE INDEX IF NOT EXISTS compras_obrigacoes_responsavel_id_idx ON public.compras_obrigacoes(responsavel_id);
CREATE INDEX IF NOT EXISTS compras_pca_itens_created_by_idx ON public.compras_pca_itens(created_by);
CREATE INDEX IF NOT EXISTS compras_pesquisa_precos_coletado_por_idx ON public.compras_pesquisa_precos(coletado_por);
CREATE INDEX IF NOT EXISTS compras_processos_criado_por_idx ON public.compras_processos(criado_por);
CREATE INDEX IF NOT EXISTS compras_processos_responsavel_id_idx ON public.compras_processos(responsavel_id);
CREATE INDEX IF NOT EXISTS compras_processos_etapas_concluida_por_idx ON public.compras_processos_etapas(concluida_por);
CREATE INDEX IF NOT EXISTS compras_processos_etapas_responsavel_id_idx ON public.compras_processos_etapas(responsavel_id);
CREATE INDEX IF NOT EXISTS compras_publicacoes_responsavel_id_idx ON public.compras_publicacoes(responsavel_id);
CREATE INDEX IF NOT EXISTS compras_tarefas_criado_por_idx ON public.compras_tarefas(criado_por);
CREATE INDEX IF NOT EXISTS compras_tarefas_responsavel_id_idx ON public.compras_tarefas(responsavel_id);
