-- Acabamento de produto SaaS: notificações, onboarding e documentos privados.

create table if not exists public.compras_configuracoes_tenant (
  tenant_id uuid primary key,
  configuracao jsonb not null default '{}'::jsonb,
  concluida boolean not null default false,
  concluida_em timestamptz,
  atualizado_por integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.compras_configuracoes_tenant enable row level security;
drop policy if exists compras_config_tenant_select on public.compras_configuracoes_tenant;
create policy compras_config_tenant_select on public.compras_configuracoes_tenant for select to authenticated using(tenant_id=app_private.current_tenant_id());
grant select on public.compras_configuracoes_tenant to authenticated;

create table if not exists public.compras_documentos_modulo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entidade text not null check(entidade in ('ATA','ADITIVO','PEDIDO','ENTREGA','OCORRENCIA','ESTORNO')),
  entidade_id text not null,
  nome_arquivo text not null,
  storage_path text not null unique,
  mime_type text not null,
  tamanho_bytes bigint not null check(tamanho_bytes>0 and tamanho_bytes<=26214400),
  enviado_por integer not null,
  created_at timestamptz not null default now()
);
create index if not exists compras_documentos_modulo_entidade_idx on public.compras_documentos_modulo(tenant_id,entidade,entidade_id,created_at desc);
alter table public.compras_documentos_modulo enable row level security;
drop policy if exists compras_documentos_modulo_tenant_select on public.compras_documentos_modulo;
create policy compras_documentos_modulo_tenant_select on public.compras_documentos_modulo for select to authenticated using(tenant_id=app_private.current_tenant_id());
grant select on public.compras_documentos_modulo to authenticated;

create or replace function public.compras_listar_notificacoes(p_apenas_nao_lidas boolean default false) returns setof jsonb
language sql security invoker set search_path=pg_catalog,public,app_private
as $$
  select to_jsonb(n) from public.compras_notificacoes n
   where n.tenant_id=app_private.current_tenant_id()
     and n.usuario_id=app_private.current_user_id()
     and (not p_apenas_nao_lidas or n.lida_em is null)
   order by n.created_at desc limit 50;
$$;
grant execute on function public.compras_listar_notificacoes(boolean) to authenticated;

create or replace function public.compras_marcar_notificacao_lida(p_id uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public,app_private
as $$
begin
  update public.compras_notificacoes set lida_em=coalesce(lida_em,now()) where id=p_id and tenant_id=app_private.current_tenant_id() and usuario_id=app_private.current_user_id();
  return found;
end;
$$;
grant execute on function public.compras_marcar_notificacao_lida(uuid) to authenticated;

create or replace function public.compras_obter_configuracao_tenant() returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$
declare tid uuid:=app_private.current_tenant_id(); c public.compras_configuracoes_tenant;
begin
  if tid is null then raise exception 'Tenant não identificado' using errcode='42501'; end if;
  select * into c from public.compras_configuracoes_tenant where tenant_id=tid;
  if not found then return jsonb_build_object('tenant_id',tid,'configuracao','{}'::jsonb,'concluida',false); end if;
  return jsonb_build_object('tenant_id',c.tenant_id,'configuracao',c.configuracao,'concluida',c.concluida,'concluida_em',c.concluida_em);
end;
$$;
grant execute on function public.compras_obter_configuracao_tenant() to authenticated;

create or replace function public.compras_salvar_configuracao_tenant(p_configuracao jsonb,p_concluida boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$
declare tid uuid:=app_private.current_tenant_id(); uid integer:=app_private.current_user_id(); c public.compras_configuracoes_tenant;
begin
  if tid is null or uid is null then raise exception 'Tenant ou usuário não identificado' using errcode='42501'; end if;
  if not app_private.has_tenant_role(tid,array['tenant_admin']) then raise exception 'Somente administrador do tenant pode configurar o módulo' using errcode='42501'; end if;
  insert into public.compras_configuracoes_tenant(tenant_id,configuracao,concluida,concluida_em,atualizado_por,updated_at) values(tid,coalesce(p_configuracao,'{}'::jsonb),p_concluida,case when p_concluida then now() else null end,uid,now()) on conflict(tenant_id) do update set configuracao=excluded.configuracao,concluida=excluded.concluida,concluida_em=excluded.concluida_em,atualizado_por=excluded.atualizado_por,updated_at=now() returning * into c;
  return jsonb_build_object('tenant_id',c.tenant_id,'configuracao',c.configuracao,'concluida',c.concluida,'concluida_em',c.concluida_em);
end;
$$;
revoke execute on function public.compras_obter_configuracao_tenant(),public.compras_salvar_configuracao_tenant(jsonb,boolean) from public,anon;
grant execute on function public.compras_obter_configuracao_tenant(),public.compras_salvar_configuracao_tenant(jsonb,boolean) to authenticated;

create or replace function public.compras_registrar_documento(p_entidade text,p_entidade_id text,p_nome_arquivo text,p_storage_path text,p_mime_type text,p_tamanho_bytes bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$
declare tid uuid:=app_private.current_tenant_id(); uid integer:=app_private.current_user_id(); d public.compras_documentos_modulo;
begin
  if tid is null or uid is null then raise exception 'Tenant ou usuário não identificado' using errcode='42501'; end if;
  if p_entidade not in('ATA','ADITIVO','PEDIDO','ENTREGA','OCORRENCIA','ESTORNO') then raise exception 'Entidade inválida' using errcode='22023'; end if;
  if p_nome_arquivo is null or length(btrim(p_nome_arquivo))=0 or p_storage_path is null or p_storage_path not like tid::text||'/%' then raise exception 'Caminho de documento inválido' using errcode='22023'; end if;
  if p_tamanho_bytes is null or p_tamanho_bytes<=0 or p_tamanho_bytes>26214400 then raise exception 'Documento excede o limite de 25 MB' using errcode='22023'; end if;
  insert into public.compras_documentos_modulo(tenant_id,entidade,entidade_id,nome_arquivo,storage_path,mime_type,tamanho_bytes,enviado_por) values(tid,p_entidade,p_entidade_id,btrim(p_nome_arquivo),p_storage_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_tamanho_bytes,uid) returning * into d;
  return to_jsonb(d);
end;
$$;
revoke execute on function public.compras_registrar_documento(text,text,text,text,text,bigint) from public,anon;
grant execute on function public.compras_registrar_documento(text,text,text,text,text,bigint) to authenticated;

-- Bucket privado para documentos municipais. Se o schema Storage estiver disponível, cria o bucket sem torná-lo público.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public) values('compras-documentos','compras-documentos',false) on conflict(id) do update set public=false;
  end if;
end $$;
