-- Autoriza a presença do hall apenas a contas autenticadas e ativas.
-- O canal é privado e o escopo é limitado ao tópico da intranet.
create policy "intranet_online_presence_select"
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and "private" is true
  and (select realtime.topic()) = 'intranet:servidores-online'
  and exists (
    select 1
    from public.usuarios as u
    where u.uuid = (select auth.uid())
      and u.ativo is distinct from false
      and u.perfil_completo is true
  )
);

create policy "intranet_online_presence_insert"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and "private" is true
  and (select realtime.topic()) = 'intranet:servidores-online'
  and exists (
    select 1
    from public.usuarios as u
    where u.uuid = (select auth.uid())
      and u.ativo is distinct from false
      and u.perfil_completo is true
  )
);
