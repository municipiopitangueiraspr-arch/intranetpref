-- Corrige o registro de eventos disparado por triggers de pedidos.
-- A função precisa ser SECURITY DEFINER para que o RLS de pedidos_eventos
-- não bloqueie a criação de itens por usuários autenticados.
create or replace function app_private.registrar_evento_pedido(
  p_pedido_id integer,
  p_evento text,
  p_status_anterior text default null,
  p_status_novo text default null,
  p_justificativa text default null,
  p_metadados jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path to pg_catalog, public, app_private
as $$
begin
  insert into public.pedidos_eventos(
    pedido_id, tenant_id, evento, status_anterior, status_novo,
    ator_id, justificativa, metadados
  ) values (
    p_pedido_id, app_private.current_tenant_id(), p_evento,
    p_status_anterior, p_status_novo, app_private.current_user_id(),
    p_justificativa, coalesce(p_metadados, '{}')
  );
end;
$$;
