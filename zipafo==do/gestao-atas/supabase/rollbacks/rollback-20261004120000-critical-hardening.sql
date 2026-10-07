-- Rollback for 20261004120000_critical_hardening.
-- WARNING: reversing this migration restores missing RLS policies,
-- anonymous audit execution, mutable search_path and missing indexes.
-- Use only for an incident rollback with explicit approval.

drop policy if exists configuracoes_atos_public_read on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_insert on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_update on public.configuracoes_atos;
drop policy if exists configuracoes_atos_admin_delete on public.configuracoes_atos;
drop policy if exists anexos_atos_authenticated_read on public.anexos_atos;
drop policy if exists anexos_atos_admin_insert on public.anexos_atos;
drop policy if exists anexos_atos_admin_update on public.anexos_atos;
drop policy if exists anexos_atos_admin_delete on public.anexos_atos;
drop policy if exists versoes_atos_authenticated_read on public.versoes_atos;
drop policy if exists versoes_atos_admin_insert on public.versoes_atos;
drop policy if exists versoes_atos_admin_update on public.versoes_atos;
drop policy if exists versoes_atos_admin_delete on public.versoes_atos;

grant execute on function public.bib_registrar_auditoria(text, text, text, jsonb) to anon;

alter function public.get_my_profile() reset search_path;
alter function public.calcular_status_ata(date) reset search_path;
alter function public.atualizar_status_ata_trigger() reset search_path;
alter function public.atualizar_status_todas_atas() reset search_path;
alter function public.registrar_historico_item_aditivo() reset search_path;
alter function public.handle_new_user() reset search_path;
alter function public.update_updated_at_column() reset search_path;
alter function public.atualizar_saldo_apos_consumo() reset search_path;
alter function public.gerar_lote_item() reset search_path;
alter function public.sp_registrar_consumo(integer, integer, integer, integer, numeric, text) reset search_path;
alter function public.fn_bib_gerar_codigo_emprestimo() reset search_path;
alter function public.fn_bib_marcar_exemplar_emprestado() reset search_path;
alter function public.fn_bib_processar_devolucao() reset search_path;
alter function public.fn_bib_atualizar_status_emprestimo() reset search_path;
alter function public.fn_bib_gerar_codigo_leitor() reset search_path;
alter function public.fn_bib_gerar_codigo_exemplar() reset search_path;
alter function public.fn_touch_updated_at() reset search_path;
alter function public.fn_auditar_desativacao_usuario() reset search_path;

 drop index if exists public.idx_anexos_atos_ato_id;
 drop index if exists public.idx_anexos_atos_usuario_upload_id;
 drop index if exists public.idx_versoes_atos_ato_created_at;
 drop index if exists public.idx_versoes_atos_usuario_id;
 drop index if exists public.idx_atos_oficiais_orgao_publicacao;
 drop index if exists public.idx_atos_oficiais_tipo_id;
 drop index if exists public.idx_atos_oficiais_usuario_cadastro_id;
 drop index if exists public.idx_atos_oficiais_usuario_atualizacao_id;
