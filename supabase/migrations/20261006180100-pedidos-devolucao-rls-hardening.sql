-- Restringe a leitura das devoluções ao solicitante do pedido e aos gestores autorizados.
begin;

drop policy if exists pedidos_devolucoes_tenant_select on public.pedidos_devolucoes;
create policy pedidos_devolucoes_tenant_select on public.pedidos_devolucoes for select to authenticated using (
  public.pedidos_devolucoes.tenant_id = app_private.current_tenant_id()
  and exists (
    select 1 from public.pedidos p
    where p.id = public.pedidos_devolucoes.pedido_id and p.tenant_id = public.pedidos_devolucoes.tenant_id
      and (p.usuario_id = app_private.current_user_id() or app_private.has_tenant_role(public.pedidos_devolucoes.tenant_id, array['tenant_admin','compras_manager']))
  )
);

drop policy if exists pedidos_devolucoes_itens_tenant_select on public.pedidos_devolucoes_itens;
create policy pedidos_devolucoes_itens_tenant_select on public.pedidos_devolucoes_itens for select to authenticated using (
  public.pedidos_devolucoes_itens.tenant_id = app_private.current_tenant_id()
  and exists (
    select 1 from public.pedidos_devolucoes d
    join public.pedidos p on p.id = d.pedido_id and p.tenant_id = d.tenant_id
    where d.id = public.pedidos_devolucoes_itens.devolucao_id and d.tenant_id = public.pedidos_devolucoes_itens.tenant_id
      and (p.usuario_id = app_private.current_user_id() or app_private.has_tenant_role(public.pedidos_devolucoes_itens.tenant_id, array['tenant_admin','compras_manager']))
  )
);

commit;
