create table if not exists public.bib_configuracoes_saas(
 tenant_id uuid primary key,
 nome_biblioteca text not null default 'Biblioteca Municipal',
 prazo_padrao_dias integer not null default 14 check(prazo_padrao_dias>0),
 prazo_maximo_dias integer not null default 30 check(prazo_maximo_dias>=prazo_padrao_dias),
 renovacoes_maximas integer not null default 1 check(renovacoes_maximas>=0),
 limite_livros_por_leitor integer not null default 3 check(limite_livros_por_leitor>0),
 dias_alerta_atraso integer not null default 1 check(dias_alerta_atraso>=0),
 permite_reserva boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by integer
);
alter table public.bib_configuracoes_saas enable row level security;
drop policy if exists bib_config_saas_anon on public.bib_configuracoes_saas;
create policy bib_config_saas_anon on public.bib_configuracoes_saas for all to anon using(false) with check(false);
drop policy if exists bib_config_saas_auth on public.bib_configuracoes_saas;
create policy bib_config_saas_auth on public.bib_configuracoes_saas for select to authenticated using(tenant_id=app_private.current_tenant_id());
grant select on public.bib_configuracoes_saas to authenticated;
insert into public.bib_configuracoes_saas(tenant_id,nome_biblioteca,prazo_padrao_dias,prazo_maximo_dias,renovacoes_maximas,limite_livros_por_leitor,dias_alerta_atraso,permite_reserva)
select tenant_id,nome_biblioteca,prazo_padrao_dias,prazo_maximo_dias,renovacoes_maximas,limite_livros_por_leitor,dias_alerta_atraso,permite_reserva from public.bib_configuracoes on conflict(tenant_id) do nothing;

create or replace function public.bib_obter_configuracao() returns jsonb language sql security invoker set search_path=pg_catalog,public,app_private as $$ select to_jsonb(c) from public.bib_configuracoes_saas c where c.tenant_id=app_private.current_tenant_id() limit 1; $$;
create or replace function public.bib_salvar_configuracao(p_nome_biblioteca text,p_prazo_padrao integer,p_prazo_maximo integer,p_renovacoes integer,p_limite integer,p_dias_alerta integer,p_permite_reserva boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,app_private as $$ declare x public.bib_configuracoes_saas; uid integer:=app_private.current_user_id(); tid uuid:=app_private.current_tenant_id(); begin if not exists(select 1 from public.usuarios u where u.id=uid and u.perfil in('ADMIN','BIBLIOTECARIO','BIBLIOTECARIO_RESPONSAVEL')) then raise exception 'Sem permissão para configurar a Biblioteca' using errcode='42501'; end if; insert into public.bib_configuracoes_saas(tenant_id,nome_biblioteca,prazo_padrao_dias,prazo_maximo_dias,renovacoes_maximas,limite_livros_por_leitor,dias_alerta_atraso,permite_reserva,updated_at,updated_by) values(tid,coalesce(nullif(btrim(p_nome_biblioteca),''),'Biblioteca Municipal'),greatest(1,p_prazo_padrao),greatest(p_prazo_padrao,p_prazo_maximo),greatest(0,p_renovacoes),greatest(1,p_limite),greatest(0,p_dias_alerta),coalesce(p_permite_reserva,false),now(),uid) on conflict(tenant_id) do update set nome_biblioteca=excluded.nome_biblioteca,prazo_padrao_dias=excluded.prazo_padrao_dias,prazo_maximo_dias=excluded.prazo_maximo_dias,renovacoes_maximas=excluded.renovacoes_maximas,limite_livros_por_leitor=excluded.limite_livros_por_leitor,dias_alerta_atraso=excluded.dias_alerta_atraso,permite_reserva=excluded.permite_reserva,updated_at=now(),updated_by=uid returning * into x; perform public.bib_registrar_auditoria('CONFIGURACAO_ATUALIZADA','CONFIGURACAO',tid::text,to_jsonb(x)); return to_jsonb(x); end; $$;
revoke execute on function public.bib_salvar_configuracao(text,integer,integer,integer,integer,integer,boolean),public.bib_obter_configuracao() from public,anon;
grant execute on function public.bib_salvar_configuracao(text,integer,integer,integer,integer,integer,boolean),public.bib_obter_configuracao() to authenticated;
