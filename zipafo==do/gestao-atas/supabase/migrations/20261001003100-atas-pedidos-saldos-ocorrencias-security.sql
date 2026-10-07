create or replace function public.compras_registrar_ocorrencia(p_pedido_id integer,p_tipo text,p_descricao text,p_severidade text default 'NORMAL',p_entrega_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$
declare uid integer:=app_private.current_user_id(); tid uuid:=app_private.current_tenant_id(); p public.pedidos; o public.pedidos_ocorrencias;
begin
  if uid is null or tid is null then raise exception 'Usuário ou tenant não identificado' using errcode='42501'; end if;
  if p_tipo not in('DIVERGENCIA','AVARIA','ATRASO','RECUSA','DEVOLUCAO','OUTRA') then raise exception 'Tipo de ocorrência inválido' using errcode='22023'; end if;
  if p_severidade not in('NORMAL','ALTA','CRITICA') then raise exception 'Severidade inválida' using errcode='22023'; end if;
  if length(btrim(coalesce(p_descricao,'')))<5 then raise exception 'Descrição da ocorrência deve possuir ao menos 5 caracteres' using errcode='22023'; end if;
  select * into p from public.pedidos where id=p_pedido_id and tenant_id=tid for update;
  if not found then raise exception 'Pedido não encontrado no tenant corrente' using errcode='P0002'; end if;
  if not app_private.has_tenant_role(tid,array['tenant_admin','compras_manager']) then raise exception 'Sem permissão para registrar ocorrência' using errcode='42501'; end if;
  insert into public.pedidos_ocorrencias(tenant_id,pedido_id,entrega_id,tipo,severidade,descricao,registrada_por) values(tid,p_pedido_id,p_entrega_id,p_tipo,p_severidade,btrim(p_descricao),uid) returning * into o;
  perform app_private.registrar_evento_pedido(p_pedido_id,'OCORRENCIA_REGISTRADA',p.status_aprovacao,p.status_aprovacao,btrim(p_descricao),jsonb_build_object('ocorrencia_id',o.id,'tipo',p_tipo,'severidade',p_severidade));
  return jsonb_build_object('ocorrencia_id',o.id,'pedido_id',p_pedido_id,'tipo',p_tipo,'severidade',p_severidade);
end;
$$;
revoke execute on function public.compras_registrar_ocorrencia(integer,text,text,text,uuid) from public,anon;
grant execute on function public.compras_registrar_ocorrencia(integer,text,text,text,uuid) to authenticated;
