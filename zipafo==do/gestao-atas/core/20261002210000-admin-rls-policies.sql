-- RLS administrativo: leitura somente para ADMIN.
-- Escritas continuam encapsuladas nas RPCs de governança existentes.

create policy perfis_admin_select
on public.perfis
for select
to authenticated
using (public.fn_is_admin());

create policy permissoes_admin_select
on public.permissoes
for select
to authenticated
using (public.fn_is_admin());

create policy permissoes_modulos_admin_select
on public.permissoes_modulos
for select
to authenticated
using (public.fn_is_admin());
