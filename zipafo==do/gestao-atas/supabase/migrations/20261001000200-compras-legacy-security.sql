-- Repositório privado: nomes no formato <tenant-uuid>/<processo-uuid>/<arquivo>.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('compras-documentos','compras-documentos',false,52428800,ARRAY[
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png','image/jpeg'
])
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION app_private.tenant_from_storage_path(p_path text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    THEN split_part(p_path,'/',1)::uuid
    ELSE NULL
  END
$$;
REVOKE ALL ON FUNCTION app_private.tenant_from_storage_path(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.tenant_from_storage_path(text) TO authenticated;

DROP POLICY IF EXISTS compras_storage_read_scope ON storage.objects;
CREATE POLICY compras_storage_read_scope ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (bucket_id <> 'compras-documentos' OR (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND EXISTS (SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name) AND d.storage_path=storage.objects.name)
));
DROP POLICY IF EXISTS compras_storage_insert_scope ON storage.objects;
CREATE POLICY compras_storage_insert_scope ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'compras-documentos' OR (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND app_private.has_tenant_role(app_private.tenant_from_storage_path(name),ARRAY['tenant_admin','compras_manager'])
));
DROP POLICY IF EXISTS compras_storage_update_scope ON storage.objects;
CREATE POLICY compras_storage_update_scope ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (bucket_id <> 'compras-documentos' OR (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND EXISTS (SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name) AND d.storage_path=storage.objects.name)
))
WITH CHECK (bucket_id <> 'compras-documentos' OR (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
));
DROP POLICY IF EXISTS compras_storage_delete_scope ON storage.objects;
CREATE POLICY compras_storage_delete_scope ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (bucket_id <> 'compras-documentos' OR (
  bucket_id='compras-documentos'
  AND app_private.has_tenant_access(app_private.tenant_from_storage_path(name))
  AND EXISTS (SELECT 1 FROM public.compras_documentos d
    WHERE d.tenant_id=app_private.tenant_from_storage_path(storage.objects.name) AND d.storage_path=storage.objects.name)
));
DROP POLICY IF EXISTS compras_storage_anon_deny ON storage.objects;
CREATE POLICY compras_storage_anon_deny ON storage.objects AS RESTRICTIVE FOR ALL TO anon
USING (bucket_id <> 'compras-documentos') WITH CHECK (bucket_id <> 'compras-documentos');

-- Isolamento inicial dos dados usados pela conversão de atas e pela Biblioteca.
-- O banco auditado pertence a um único Município; registros atuais recebem esse tenant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categorias','fornecedores','atas','itens_ata','atas_favoritas','atas_historico',
    'aditivos_ata','aditivos_itens_historico','historico_precos','consumos','entregas_fracionadas',
    'itens_pedido','pedidos','gestores_orgaos','representantes','logs_operacoes',
    'bib_autores','bib_categorias','bib_configuracoes','bib_editoras','bib_emprestimo_itens',
    'bib_emprestimos','bib_estantes','bib_exemplares','bib_leitores','bib_livro_autores',
    'bib_livro_categorias','bib_livros','bib_prateleiras','bib_reservas'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid',t);
    EXECUTE format('UPDATE public.%I SET tenant_id=(SELECT id FROM public.app_tenants WHERE slug=%L) WHERE tenant_id IS NULL',t,'pitangueiras-pr');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT app_private.current_tenant_id()',t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=t||'_tenant_id_fkey' AND conrelid=format('public.%I',t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.app_tenants(id)',t,t||'_tenant_id_fkey');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',t||'_tenant_idx',t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_tenant_scope',t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (app_private.has_tenant_access(tenant_id)) WITH CHECK (app_private.has_tenant_access(tenant_id))',t||'_tenant_scope',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_deny_anon',t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',t||'_deny_anon',t);
  END LOOP;
END $$;

-- Chaves naturais passam a ser únicas dentro do tenant, não globalmente.
ALTER TABLE public.fornecedores DROP CONSTRAINT IF EXISTS fornecedores_cnpj_key;
CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_tenant_cnpj_key ON public.fornecedores(tenant_id,cnpj);
ALTER TABLE public.categorias DROP CONSTRAINT IF EXISTS categorias_nome_key;
CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_nome_key ON public.categorias(tenant_id,nome);
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_numero_pedido_key;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_tenant_numero_key ON public.pedidos(tenant_id,numero_pedido);

-- Pedidos e consumos legados continuam aceitando o orgao_id do frontend atual;
-- este gatilho o traduz para a unidade do tenant, usada por RLS e FKs compostas.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS unidade_id uuid;
ALTER TABLE public.consumos ADD COLUMN IF NOT EXISTS unidade_id uuid;
ALTER TABLE public.gestores_orgaos ADD COLUMN IF NOT EXISTS unidade_id uuid;
UPDATE public.pedidos AS p SET unidade_id=u.id
FROM public.app_tenant_units AS u
WHERE p.unidade_id IS NULL AND u.tenant_id=p.tenant_id AND u.legacy_orgao_id=p.orgao_solicitante_id;
UPDATE public.consumos AS c SET unidade_id=u.id
FROM public.app_tenant_units AS u
WHERE c.unidade_id IS NULL AND u.tenant_id=c.tenant_id AND u.legacy_orgao_id=c.orgao_solicitante_id;
UPDATE public.gestores_orgaos AS g SET unidade_id=u.id
FROM public.app_tenant_units AS u
WHERE g.unidade_id IS NULL AND u.tenant_id=g.tenant_id AND u.legacy_orgao_id=g.orgao_id;
ALTER TABLE public.pedidos ALTER COLUMN unidade_id SET NOT NULL;
ALTER TABLE public.consumos ALTER COLUMN unidade_id SET NOT NULL;

CREATE OR REPLACE FUNCTION app_private.map_legacy_orgao_to_unit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_unit uuid;
BEGIN
  SELECT u.id INTO v_unit FROM public.app_tenant_units AS u
  WHERE u.tenant_id=NEW.tenant_id AND u.legacy_orgao_id=NEW.orgao_solicitante_id AND u.ativo IS TRUE
  LIMIT 1;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'A unidade informada não pertence ao tenant ativo'; END IF;
  NEW.unidade_id:=v_unit;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.map_legacy_orgao_to_unit() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.map_legacy_orgao_to_unit() TO authenticated;
DROP TRIGGER IF EXISTS pedidos_map_tenant_unit ON public.pedidos;
CREATE TRIGGER pedidos_map_tenant_unit BEFORE INSERT OR UPDATE OF orgao_solicitante_id,tenant_id ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION app_private.map_legacy_orgao_to_unit();
DROP TRIGGER IF EXISTS consumos_map_tenant_unit ON public.consumos;
CREATE TRIGGER consumos_map_tenant_unit BEFORE INSERT OR UPDATE OF orgao_solicitante_id,tenant_id ON public.consumos
FOR EACH ROW EXECUTE FUNCTION app_private.map_legacy_orgao_to_unit();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_unidade_tenant_fkey' AND conrelid='public.pedidos'::regclass) THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_unidade_tenant_fkey FOREIGN KEY (tenant_id,unidade_id) REFERENCES public.app_tenant_units(tenant_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='consumos_unidade_tenant_fkey' AND conrelid='public.consumos'::regclass) THEN
    ALTER TABLE public.consumos ADD CONSTRAINT consumos_unidade_tenant_fkey FOREIGN KEY (tenant_id,unidade_id) REFERENCES public.app_tenant_units(tenant_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gestores_orgaos_unidade_tenant_fkey' AND conrelid='public.gestores_orgaos'::regclass) THEN
    ALTER TABLE public.gestores_orgaos ADD CONSTRAINT gestores_orgaos_unidade_tenant_fkey FOREIGN KEY (tenant_id,unidade_id) REFERENCES public.app_tenant_units(tenant_id,id) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  CREATE POLICY pedidos_unidade_scope ON public.pedidos AS RESTRICTIVE FOR ALL TO authenticated
    USING (app_private.can_access_unit(tenant_id,unidade_id)) WITH CHECK (app_private.can_access_unit(tenant_id,unidade_id));
  CREATE POLICY consumos_unidade_scope ON public.consumos AS RESTRICTIVE FOR ALL TO authenticated
    USING (app_private.can_access_unit(tenant_id,unidade_id)) WITH CHECK (app_private.can_access_unit(tenant_id,unidade_id));
  CREATE POLICY itens_pedido_unidade_scope ON public.itens_pedido AS RESTRICTIVE FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.tenant_id=itens_pedido.tenant_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.tenant_id=itens_pedido.tenant_id));
  CREATE POLICY entregas_fracionadas_unidade_scope ON public.entregas_fracionadas AS RESTRICTIVE FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.tenant_id=entregas_fracionadas.tenant_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id=pedido_id AND p.tenant_id=entregas_fracionadas.tenant_id));
END $$;

ALTER VIEW public.vw_bib_dashboard SET (security_invoker=true);
ALTER VIEW public.vw_bib_emprestimos_detalhados SET (security_invoker=true);
ALTER VIEW public.vw_consumos_autarquia SET (security_invoker=true);

CREATE OR REPLACE VIEW public.vw_modulos_por_usuario WITH (security_invoker=true) AS
SELECT u.id AS usuario_id,u.uuid AS auth_uuid,u.nome AS usuario_nome,u.email AS usuario_email,u.perfil,
       m.nome AS modulo,m.descricao AS modulo_descricao,m.icone AS modulo_icone,m.rota AS modulo_rota,
       m.ordem AS modulo_ordem,m.cor AS modulo_cor,coalesce(um.permitido,false) AS permitido,um.concedido_em
FROM public.usuarios AS u
CROSS JOIN public.modulos_sistema AS m
LEFT JOIN public.usuarios_modulos AS um ON um.usuario_id=u.id AND um.modulo::text=m.nome::text
WHERE m.ativo IS TRUE AND m.visivel_intranet IS TRUE AND u.ativo IS TRUE AND u.uuid=auth.uid();

REVOKE ALL ON public.vw_modulos_por_usuario,public.vw_consumos_autarquia,
  public.vw_bib_dashboard,public.vw_bib_emprestimos_detalhados FROM PUBLIC,anon;
GRANT SELECT ON public.vw_modulos_por_usuario,public.vw_consumos_autarquia,
  public.vw_bib_dashboard,public.vw_bib_emprestimos_detalhados TO authenticated;

-- Reduzir a superfície RPC sem interromper o gatilho de criação de perfil no Auth.
ALTER FUNCTION public.fn_is_admin() SET search_path=pg_catalog;
REVOKE ALL ON FUNCTION public.fn_is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;

-- Ligação opcional; todos os registros legados permanecem NULL.
ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS processo_compras_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='atas_processo_compras_id_fkey' AND conrelid='public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_processo_compras_id_fkey
      FOREIGN KEY (processo_compras_id) REFERENCES public.compras_processos(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='atas_processo_compras_id_key' AND conrelid='public.atas'::regclass) THEN
    ALTER TABLE public.atas ADD CONSTRAINT atas_processo_compras_id_key UNIQUE (processo_compras_id);
  END IF;
END $$;

-- Índices únicos de destino para que uma FK confira também o tenant da linha referenciada.
CREATE UNIQUE INDEX IF NOT EXISTS fornecedores_tenant_id_uq ON public.fornecedores(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS atas_tenant_id_uq ON public.atas(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS itens_ata_tenant_id_uq ON public.itens_ata(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS categorias_tenant_id_uq ON public.categorias(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_tenant_id_uq ON public.pedidos(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS itens_pedido_tenant_id_uq ON public.itens_pedido(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS aditivos_ata_tenant_id_uq ON public.aditivos_ata(tenant_id,id);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compras_demandas','compras_fluxos','compras_fluxo_versoes','compras_fluxo_etapas',
    'compras_processos','compras_processos_etapas','compras_processos_itens','compras_documentos','compras_contratos'
  ] LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(tenant_id,id)',t||'_tenant_id_uq',t);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('app_tenant_memberships','app_membership_unit_tenant_fk','tenant_id,unidade_id','app_tenant_units','tenant_id,id'),
    ('compras_demandas','compras_demandas_unit_tenant_fk','tenant_id,unidade_id','app_tenant_units','tenant_id,id'),
    ('compras_processos','compras_processos_unit_tenant_fk','tenant_id,unidade_id','app_tenant_units','tenant_id,id'),
    ('compras_pca_itens','compras_pca_unit_tenant_fk','tenant_id,unidade_id','app_tenant_units','tenant_id,id'),
    ('compras_fluxo_versoes','compras_fluxo_versoes_fluxo_tenant_fk','tenant_id,fluxo_id','compras_fluxos','tenant_id,id'),
    ('compras_fluxo_etapas','compras_fluxo_etapas_versao_tenant_fk','tenant_id,fluxo_versao_id','compras_fluxo_versoes','tenant_id,id'),
    ('compras_processos','compras_processos_demanda_tenant_fk','tenant_id,demanda_id','compras_demandas','tenant_id,id'),
    ('compras_processos','compras_processos_versao_tenant_fk','tenant_id,fluxo_versao_id','compras_fluxo_versoes','tenant_id,id'),
    ('compras_processos','compras_processos_ata_tenant_fk','tenant_id,ata_id','atas','tenant_id,id'),
    ('compras_processos_etapas','compras_proc_etapas_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_processos_etapas','compras_proc_etapas_modelo_tenant_fk','tenant_id,fluxo_etapa_id','compras_fluxo_etapas','tenant_id,id'),
    ('compras_processos_itens','compras_proc_itens_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_processos_itens','compras_proc_itens_ata_tenant_fk','tenant_id,item_ata_id','itens_ata','tenant_id,id'),
    ('compras_processos_fornecedores','compras_proc_forn_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_processos_fornecedores','compras_proc_forn_fornecedor_tenant_fk','tenant_id,fornecedor_id','fornecedores','tenant_id,id'),
    ('compras_documentos','compras_docs_demanda_tenant_fk','tenant_id,demanda_id','compras_demandas','tenant_id,id'),
    ('compras_documentos','compras_docs_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_documentos','compras_docs_etapa_tenant_fk','tenant_id,etapa_id','compras_processos_etapas','tenant_id,id'),
    ('compras_pesquisa_precos','compras_pesquisa_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_pesquisa_precos','compras_pesquisa_item_tenant_fk','tenant_id,item_id','compras_processos_itens','tenant_id,id'),
    ('compras_pesquisa_precos','compras_pesquisa_doc_tenant_fk','tenant_id,documento_id','compras_documentos','tenant_id,id'),
    ('compras_pesquisa_precos','compras_pesquisa_fornecedor_tenant_fk','tenant_id,fornecedor_id','fornecedores','tenant_id,id'),
    ('compras_tarefas','compras_tarefas_demanda_tenant_fk','tenant_id,demanda_id','compras_demandas','tenant_id,id'),
    ('compras_tarefas','compras_tarefas_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_tarefas','compras_tarefas_etapa_tenant_fk','tenant_id,etapa_id','compras_processos_etapas','tenant_id,id'),
    ('compras_publicacoes','compras_publicacoes_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_publicacoes','compras_publicacoes_doc_tenant_fk','tenant_id,documento_id','compras_documentos','tenant_id,id'),
    ('compras_contratos','compras_contratos_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_contratos','compras_contratos_ata_tenant_fk','tenant_id,ata_id','atas','tenant_id,id'),
    ('compras_contratos','compras_contratos_fornecedor_tenant_fk','tenant_id,fornecedor_id','fornecedores','tenant_id,id'),
    ('compras_contrato_eventos','compras_contrato_eventos_contrato_tenant_fk','tenant_id,contrato_id','compras_contratos','tenant_id,id'),
    ('compras_contrato_eventos','compras_contrato_eventos_doc_tenant_fk','tenant_id,documento_id','compras_documentos','tenant_id,id'),
    ('compras_obrigacoes','compras_obrigacoes_processo_tenant_fk','tenant_id,processo_id','compras_processos','tenant_id,id'),
    ('compras_obrigacoes','compras_obrigacoes_contrato_tenant_fk','tenant_id,contrato_id','compras_contratos','tenant_id,id')
  ) AS f(child_table,constraint_name,child_columns,parent_table,parent_columns)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=r.constraint_name AND conrelid=format('public.%I',r.child_table)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s) NOT VALID',r.child_table,r.constraint_name,r.child_columns,r.parent_table,r.parent_columns);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compras_demandas','compras_fluxos','compras_processos','compras_pca_itens',
    'compras_processos_etapas','compras_processos_itens','compras_processos_fornecedores',
    'compras_documentos','compras_tarefas','compras_publicacoes','compras_contratos','compras_obrigacoes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',t||'_touch_updated_at',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.touch_updated_at()',t||'_touch_updated_at',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app_private.audit_compras_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_old jsonb; v_new jsonb; v_row jsonb; v_tenant uuid; v_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_old:=to_jsonb(OLD); v_row:=v_old;
  ELSIF TG_OP='UPDATE' THEN v_old:=to_jsonb(OLD); v_new:=to_jsonb(NEW); v_row:=v_new;
  ELSE v_new:=to_jsonb(NEW); v_row:=v_new;
  END IF;
  v_tenant := (v_row->>'tenant_id')::uuid;
  v_id := (v_row->>'id')::uuid;
  INSERT INTO public.compras_eventos_auditoria(tenant_id,entidade,entidade_id,operacao,ator_id,registro_anterior,registro_novo)
  VALUES(v_tenant,TG_TABLE_NAME,v_id,TG_OP,app_private.current_user_id(),v_old,v_new);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.audit_compras_change() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.audit_compras_change() TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'compras_classificacoes','compras_demandas','compras_fluxos','compras_fluxo_versoes','compras_fluxo_etapas',
    'compras_processos','compras_pca_itens','compras_processos_etapas','compras_processos_itens',
    'compras_processos_fornecedores','compras_tarefas','compras_documentos','compras_pesquisa_precos',
    'compras_publicacoes','compras_contratos','compras_contrato_eventos','compras_obrigacoes','compras_feriados'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',t||'_audit',t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.audit_compras_change()',t||'_audit',t);
  END LOOP;
END $$;

