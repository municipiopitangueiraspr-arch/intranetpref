-- Painel Administrativo SaaS — resumo operacional protegido para ADMIN
-- Migration aditiva: não remove nem altera dados existentes.

create or replace function public.admin_dashboard_resumo()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.fn_is_admin() then
    raise exception using errcode = '42501', message = 'Apenas administradores podem consultar o painel administrativo.';
  end if;

  select jsonb_build_object(
    'gerado_em', now(),
    'usuarios', jsonb_build_object(
      'total', (select count(*) from public.usuarios),
      'ativos', (select count(*) from public.usuarios where ativo is true),
      'inativos', (select count(*) from public.usuarios where coalesce(ativo, false) is false),
      'com_acesso_recente', (select count(*) from public.usuarios where ultimo_acesso >= now() - interval '30 days'),
      'sem_primeiro_acesso', (select count(*) from public.usuarios where coalesce(primeiro_acesso, false) is true)
    ),
    'orgaos', jsonb_build_object(
      'total', (select count(*) from public.orgaos),
      'ativos', (select count(*) from public.orgaos where ativo is true),
      'inativos', (select count(*) from public.orgaos where coalesce(ativo, false) is false)
    ),
    'acessos', jsonb_build_object(
      'concessoes', (select count(*) from public.usuarios_modulos where permitido is true),
      'perfis', (select count(*) from public.perfis where ativo is true),
      'regras', (select count(*) from public.permissoes_modulos),
      'solicitacoes_pendentes', (select count(*) from public.solicitacoes_acesso where status = 'PENDENTE')
    ),
    'atividade', jsonb_build_object(
      'auditoria_24h', (select count(*) from public.auditoria_eventos where ocorrido_em >= now() - interval '24 hours'),
      'operacoes_24h', (select count(*) from public.logs_operacoes where created_at >= now() - interval '24 hours'),
      'ultimo_evento_em', (select max(ocorrido_em) from public.auditoria_eventos)
    ),
    'eventos_recentes', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.ocorrido_em desc)
      from (
        select
          ae.id,
          ae.entidade,
          ae.entidade_id,
          ae.operacao,
          ae.origem,
          ae.ocorrido_em,
          coalesce(u.nome, 'Sistema') as ator_nome
        from public.auditoria_eventos ae
        left join public.usuarios u on u.id = ae.ator_id
        order by ae.ocorrido_em desc
        limit 12
      ) e
    ), '[]'::jsonb),
    'ultimos_acessos', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.ultimo_acesso desc)
      from (
        select id, nome, email, perfil, ultimo_acesso, ativo
        from public.usuarios
        where ultimo_acesso is not null
        order by ultimo_acesso desc
        limit 8
      ) a
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_resumo() from public;
revoke all on function public.admin_dashboard_resumo() from anon;
grant execute on function public.admin_dashboard_resumo() to authenticated;

comment on function public.admin_dashboard_resumo() is 'Resumo centralizado do painel SaaS administrativo; somente ADMIN.';
