-- Cobertura de índices para FKs introduzidas em migration 007.
-- Índices não alteram dados nem a semântica de autorização.
CREATE INDEX compras_artefatos_created_by_idx
  ON public.compras_artefatos(created_by);
CREATE INDEX compras_artefatos_etapa_tenant_idx
  ON public.compras_artefatos(tenant_id,etapa_id);
CREATE INDEX compras_artefato_versoes_created_by_idx
  ON public.compras_artefato_versoes(created_by);
CREATE INDEX compras_decisoes_registrado_por_idx
  ON public.compras_decisoes(registrado_por);
CREATE INDEX compras_decisoes_documento_tenant_idx
  ON public.compras_decisoes(tenant_id,documento_id);
CREATE INDEX compras_decisoes_regra_tenant_idx
  ON public.compras_decisoes(tenant_id,regra_versao_id);
CREATE INDEX compras_decisoes_substitui_tenant_idx
  ON public.compras_decisoes(tenant_id,substitui_id);
CREATE INDEX compras_regras_created_by_idx
  ON public.compras_regras_versoes(created_by);
CREATE INDEX compras_regras_substitui_tenant_idx
  ON public.compras_regras_versoes(tenant_id,substitui_id);
