-- Alinha a autorização do canal de presença à regra do layout:
-- somente usuários autenticados com perfil existente e não inativo.
-- Mantém leitura/escrita limitadas ao Presence privado do tópico da intranet.

drop policy if exists "intranet_online_presence_select" on realtime.messages;
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
  )
);

drop policy if exists "intranet_online_presence_insert" on realtime.messages;
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
  )
);
