-- Critical hardening for the intranet production project.
-- Scope: public acts attachments/version/configuration, audit RPC exposure,
-- mutable function search_path, and high-traffic acts indexes.

-- 1) Public portal configuration: read-only public access; writes restricted to ADMIN.
drop policy if exists configuracoes_atos_public_read on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_insert on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_update on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_delete on public.configuracoes_atos;
create policy configuracoes_atos_public_read
  on public.configuracoes_atos for select to anon, authenticated
  using (true);
create policy configuracoes_atos_admin_insert
  on public.configuracoes_atos for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy configuracoes_atos_admin_update
  on public.configuracoes_atos for update to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'))
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy configuracoes_atos_admin_delete
  on public.configuracoes_atos for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));

-- 2) Attachments and version history: authenticated read; ADMIN-only mutations.
drop policy if exists anexos_atos_authenticated_read on public.anexos_atos;
drop policy if exists anexos_atos_admin_insert on public.anexos_atos;
drop policy if exists anexos_atos_admin_update on public.anexos_atos;
drop policy if exists anexos_atos_admin_delete on public.anexos_atos;
create policy anexos_atos_authenticated_read
  on public.anexos_atos for select to authenticated
  using (true);
create policy anexos_atos_admin_insert
  on public.anexos_atos for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy anexos_atos_admin_update
  on public.anexos_atos for update to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'))
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy anexos_atos_admin_delete
  on public.anexos_atos for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));

drop policy if exists versoes_atos_authenticated_read on public.versoes_atos;
drop policy if exists versoes_atos_admin_insert on public.versoes_atos;
drop policy if exists versoes_atos_admin_update on public.versoes_atos;
drop policy if exists versoes_atos_admin_delete on public.versoes_atos;
create policy versoes_atos_authenticated_read
  on public.versoes_atos for select to authenticated
  using (true);
create policy versoes_atos_admin_insert
  on public.versoes_atos for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy versoes_atos_admin_update
  on public.versoes_atos for update to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'))
  with check (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));
create policy versoes_atos_admin_delete
  on public.versoes_atos for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.uuid = auth.uid() and u.perfil = 'ADMIN'));

-- 3) Audit RPC must never be callable by anonymous clients.
revoke execute on function public.bib_registrar_auditoria(text, text, text, jsonb) from anon;
grant execute on function public.bib_registrar_auditoria(text, text, text, jsonb) to authenticated;

-- 4) Pin search_path on flagged public functions to prevent search-path hijacking.
alter function public.get_my_profile() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.calcular_status_ata(date) set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.atualizar_status_ata_trigger() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.atualizar_status_todas_atas() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.registrar_historico_item_aditivo() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.handle_new_user() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.update_updated_at_column() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.atualizar_saldo_apos_consumo() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.gerar_lote_item() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.sp_registrar_consumo(integer, integer, integer, integer, numeric, text) set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_gerar_codigo_emprestimo() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_marcar_exemplar_emprestado() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_processar_devolucao() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_atualizar_status_emprestimo() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_gerar_codigo_leitor() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_bib_gerar_codigo_exemplar() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_touch_updated_at() set search_path = pg_catalog, public, app_private, auth, storage;
alter function public.fn_auditar_desativacao_usuario() set search_path = pg_catalog, public, app_private, auth, storage;

-- 5) Indexes for the high-traffic acts/attachments/version paths.
create index if not exists idx_anexos_atos_ato_id on public.anexos_atos (ato_id);
create index if not exists idx_anexos_atos_usuario_upload_id on public.anexos_atos (usuario_upload_id);
create index if not exists idx_versoes_atos_ato_created_at on public.versoes_atos (ato_id, created_at desc);
create index if not exists idx_versoes_atos_usuario_id on public.versoes_atos (usuario_id);
create index if not exists idx_atos_oficiais_orgao_publicacao on public.atos_oficiais (orgao_id, data_publicacao desc);
create index if not exists idx_atos_oficiais_tipo_id on public.atos_oficiais (tipo_id);
create index if not exists idx_atos_oficiais_usuario_cadastro_id on public.atos_oficiais (usuario_cadastro_id);
create index if not exists idx_atos_oficiais_usuario_atualizacao_id on public.atos_oficiais (usuario_atualizacao_id);
