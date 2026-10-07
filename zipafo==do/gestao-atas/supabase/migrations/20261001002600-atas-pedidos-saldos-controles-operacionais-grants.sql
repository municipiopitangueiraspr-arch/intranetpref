-- Grants mínimos: clientes consultam dados; mutações passam pelas RPCs SECURITY DEFINER.
alter function public.compras_solicitar_estorno(integer,jsonb,text) security definer;
alter function public.compras_aprovar_estorno(bigint,boolean,text) security definer;
alter function public.compras_encerrar_pedido(integer,text) security definer;
revoke all on public.pedidos_estornos, public.pedidos_estornos_itens, public.compras_vw_pedidos_entregas, public.compras_vw_saldos_operacionais from authenticated;
grant select on public.pedidos_estornos, public.pedidos_estornos_itens, public.compras_vw_pedidos_entregas, public.compras_vw_saldos_operacionais to authenticated;
grant execute on function public.compras_solicitar_estorno(integer,jsonb,text), public.compras_aprovar_estorno(bigint,boolean,text), public.compras_encerrar_pedido(integer,text) to authenticated;
