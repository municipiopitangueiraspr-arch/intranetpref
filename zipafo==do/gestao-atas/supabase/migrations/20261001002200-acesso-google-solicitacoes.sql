-- Solicitações de acesso após autenticação Google.
-- Migração aditiva: não altera usuários existentes nem concede acesso automaticamente.
create table if not exists public.solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  email text not null,
  nome text,
  provider text not null default 'google',
  status text not null default 'PENDENTE' check (status in ('PENDENTE','APROVADA','REJEITADA','CANCELADA')),
  tenant_id uuid references public.app_tenants(id),
  orgao_id integer references public.orgaos(id),
  unidade_id uuid,
  perfil_solicitado text,
  modulos_solicitados text[] not null default '{}',
  justificativa text,
  revisado_por integer references public.usuarios(id),
  revisado_em timestamptz,
  decisao_observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists solicitacoes_acesso_pendente_user_uidx on public.solicitacoes_acesso(auth_user_id) where status='PENDENTE';
create index if not exists solicitacoes_acesso_status_idx on public.solicitacoes_acesso(status, created_at desc);
create index if not exists solicitacoes_acesso_email_idx on public.solicitacoes_acesso(lower(email));

create table if not exists public.notificacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes_acesso(id) on delete cascade,
  admin_usuario_id integer not null references public.usuarios(id) on delete cascade,
  tipo text not null default 'NOVA_SOLICITACAO',
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists notificacoes_acesso_admin_request_uidx on public.notificacoes_acesso(solicitacao_id, admin_usuario_id);

alter table public.solicitacoes_acesso enable row level security;
alter table public.notificacoes_acesso enable row level security;

drop policy if exists solicitacoes_acesso_insert_own on public.solicitacoes_acesso;
create policy solicitacoes_acesso_insert_own on public.solicitacoes_acesso for insert to authenticated with check (auth_user_id=auth.uid() and status='PENDENTE');
drop policy if exists solicitacoes_acesso_select_own_or_admin on public.solicitacoes_acesso;
create policy solicitacoes_acesso_select_own_or_admin on public.solicitacoes_acesso for select to authenticated using (auth_user_id=auth.uid() or exists (select 1 from public.usuarios u where u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true));
drop policy if exists solicitacoes_acesso_update_admin on public.solicitacoes_acesso;
create policy solicitacoes_acesso_update_admin on public.solicitacoes_acesso for update to authenticated using (exists (select 1 from public.usuarios u where u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true)) with check (exists (select 1 from public.usuarios u where u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true));
drop policy if exists notificacoes_acesso_admin_select on public.notificacoes_acesso;
create policy notificacoes_acesso_admin_select on public.notificacoes_acesso for select to authenticated using (exists (select 1 from public.usuarios u where u.id=admin_usuario_id and u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true));
drop policy if exists notificacoes_acesso_admin_update on public.notificacoes_acesso;
create policy notificacoes_acesso_admin_update on public.notificacoes_acesso for update to authenticated using (exists (select 1 from public.usuarios u where u.id=admin_usuario_id and u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true)) with check (exists (select 1 from public.usuarios u where u.id=admin_usuario_id and u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true));

create or replace function app_private.notificar_solicitacao_acesso() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into public.notificacoes_acesso(solicitacao_id, admin_usuario_id)
  select new.id,u.id from public.usuarios u where u.perfil='ADMIN' and u.ativo=true on conflict (solicitacao_id,admin_usuario_id) do nothing;
  return new;
end; $$;
revoke all on function app_private.notificar_solicitacao_acesso() from public;
drop trigger if exists trg_notificar_solicitacao_acesso on public.solicitacoes_acesso;
create trigger trg_notificar_solicitacao_acesso after insert on public.solicitacoes_acesso for each row execute function app_private.notificar_solicitacao_acesso();

create or replace function app_private.atualizar_solicitacao_acesso_updated_at() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_solicitacoes_acesso_updated_at on public.solicitacoes_acesso;
create trigger trg_solicitacoes_acesso_updated_at before update on public.solicitacoes_acesso for each row execute function app_private.atualizar_solicitacao_acesso_updated_at();

create or replace function public.aprovar_solicitacao_acesso(p_solicitacao_id uuid,p_perfil text,p_modulos text[] default '{}',p_orgao_id integer default null,p_unidade_id uuid default null,p_tenant_id uuid default null,p_observacao text default null)
returns public.solicitacoes_acesso language plpgsql security definer set search_path=pg_catalog as $$
declare r public.solicitacoes_acesso; admin_id integer;
begin
  select u.id into admin_id from public.usuarios u where u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true;
  if admin_id is null then raise exception 'Apenas ADMIN pode aprovar solicitações'; end if;
  if p_perfil not in ('ADMIN','SECRETARIO','SOLICITANTE','ESTAGIARIO') then raise exception 'Perfil inválido'; end if;
  select * into r from public.solicitacoes_acesso where id=p_solicitacao_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if r.status<>'PENDENTE' then raise exception 'Solicitação já decidida'; end if;
  insert into public.usuarios(uuid,nome,email,orgao_id,perfil,ativo,primeiro_acesso,perfil_completo)
  values(r.auth_user_id,coalesce(nullif(r.nome,''),split_part(r.email,'@',1)),lower(r.email),p_orgao_id,p_perfil,true,true,false)
  on conflict(uuid) do update set nome=excluded.nome,email=excluded.email,orgao_id=excluded.orgao_id,perfil=excluded.perfil,ativo=true,updated_at=current_timestamp
  returning * into r;
  insert into public.usuarios_modulos(usuario_id,modulo,permitido,concedido_por)
  select r.id,m,true,admin_id from unnest(coalesce(p_modulos,'{}')) m
  on conflict(usuario_id,modulo) do update set permitido=true,concedido_por=admin_id,updated_at=current_timestamp;
  update public.solicitacoes_acesso set status='APROVADA',tenant_id=p_tenant_id,orgao_id=p_orgao_id,unidade_id=p_unidade_id,perfil_solicitado=p_perfil,modulos_solicitados=coalesce(p_modulos,'{}'),revisado_por=admin_id,revisado_em=clock_timestamp(),decisao_observacao=p_observacao where id=p_solicitacao_id returning * into r;
  return r;
end; $$;

create or replace function public.rejeitar_solicitacao_acesso(p_solicitacao_id uuid,p_observacao text default null)
returns public.solicitacoes_acesso language plpgsql security definer set search_path=pg_catalog as $$
declare r public.solicitacoes_acesso; admin_id integer;
begin
  select u.id into admin_id from public.usuarios u where u.uuid=auth.uid() and u.perfil='ADMIN' and u.ativo=true;
  if admin_id is null then raise exception 'Apenas ADMIN pode rejeitar solicitações'; end if;
  update public.solicitacoes_acesso set status='REJEITADA',revisado_por=admin_id,revisado_em=clock_timestamp(),decisao_observacao=p_observacao where id=p_solicitacao_id and status='PENDENTE' returning * into r;
  if not found then raise exception 'Solicitação não encontrada ou já decidida'; end if;
  return r;
end; $$;

grant execute on function public.aprovar_solicitacao_acesso(uuid,text,text[],integer,uuid,uuid,text) to authenticated;
grant execute on function public.rejeitar_solicitacao_acesso(uuid,text) to authenticated;
comment on table public.solicitacoes_acesso is 'Pedidos de acesso iniciados após autenticação externa; não concedem acesso automaticamente.';
comment on table public.notificacoes_acesso is 'Notificações privadas para administradores sobre pedidos de acesso.';
