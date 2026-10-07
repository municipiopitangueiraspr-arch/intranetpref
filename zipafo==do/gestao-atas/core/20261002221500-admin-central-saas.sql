-- Painel Administrativo SaaS · visão central de governança
-- Migration aditiva: somente leitura agregada, protegida por ADMIN.
create or replace function public.admin_central_resumo()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.fn_is_admin() then
    raise exception using errcode = '42501', message = 'Apenas administradores podem consultar a governança central.';
  end if;

  select jsonb_build_object(
    'gerado_em', now(),
    'visao', jsonb_build_object(
      'tenant_total', (select count(*) from public.app_tenants where ativo is true),
      'unidades_total', (select count(*) from public.app_tenant_units where ativo is true),
      'integridade', jsonb_build_object(
        'usuarios_sem_primeiro_acesso', (select count(*) from public.usuarios where ativo is true and coalesce(primeiro_acesso, false) is true),
        'usuarios_inativos', (select count(*) from public.usuarios where coalesce(ativo, false) is false),
        'modulos_inativos', (select count(*) from public.modulos_sistema where coalesce(ativo, false) is false),
        'solicitacoes_pendentes', (select count(*) from public.solicitacoes_acesso where status = 'PENDENTE')
      )
    ),
    'usuarios', jsonb_build_object(
      'total', (select count(*) from public.usuarios),
      'ativos', (select count(*) from public.usuarios where ativo is true),
      'inativos', (select count(*) from public.usuarios where coalesce(ativo, false) is false),
      'com_acesso_30d', (select count(*) from public.usuarios where ultimo_acesso >= now() - interval '30 days'),
      'perfis', coalesce((select jsonb_agg(to_jsonb(p) order by p.perfil) from (select coalesce(perfil, 'SEM PERFIL') as perfil, count(*) as total, count(*) filter (where ativo is true) as ativos from public.usuarios group by coalesce(perfil, 'SEM PERFIL')) p), '[]'::jsonb)
    ),
    'modulos', jsonb_build_object(
      'total', (select count(*) from public.modulos_sistema),
      'ativos', (select count(*) from public.modulos_sistema where ativo is true),
      'visiveis', (select count(*) from public.modulos_sistema where ativo is true and visivel_intranet is true),
      'catalogo', coalesce((select jsonb_agg(to_jsonb(m) order by m.ordem nulls last, m.nome) from (select id, nome, descricao, icone, rota, ativo, ordem, cor, visivel_intranet from public.modulos_sistema) m), '[]'::jsonb)
    ),
    'acessos', jsonb_build_object(
      'concessoes', (select count(*) from public.usuarios_modulos where permitido is true),
      'perfis_configurados', (select count(*) from public.perfis where ativo is true),
      'regras_configuradas', (select count(*) from public.permissoes),
      'regras_modulares', (select count(*) from public.permissoes_modulos),
      'solicitacoes_pendentes', (select count(*) from public.solicitacoes_acesso where status = 'PENDENTE')
    ),
    'auditoria', jsonb_build_object(
      'eventos_24h', (select count(*) from public.auditoria_eventos where ocorrido_em >= now() - interval '24 hours'),
      'eventos_7d', (select count(*) from public.auditoria_eventos where ocorrido_em >= now() - interval '7 days'),
      'operacoes_24h', (select count(*) from public.logs_operacoes where created_at >= now() - interval '24 hours'),
      'ultimo_evento_em', (select max(ocorrido_em) from public.auditoria_eventos),
      'eventos_recentes', coalesce((select jsonb_agg(to_jsonb(e) order by e.ocorrido_em desc) from (select ae.id, ae.entidade, ae.entidade_id, ae.operacao, ae.origem, ae.ocorrido_em, ae.ip_address, coalesce(u.nome, 'Sistema') as ator_nome from public.auditoria_eventos ae left join public.usuarios u on u.id = ae.ator_id order by ae.ocorrido_em desc limit 16) e), '[]'::jsonb)
    ),
    'acessos_recentes', coalesce((select jsonb_agg(to_jsonb(a) order by a.ultimo_acesso desc) from (select id, nome, email, perfil, ultimo_acesso, ativo from public.usuarios where ultimo_acesso is not null order by ultimo_acesso desc limit 10) a), '[]'::jsonb),
    'solicitacoes', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from (select id, nome, email, provider, status, perfil_solicitado, modulos_solicitados, justificativa, created_at from public.solicitacoes_acesso where status = 'PENDENTE' order by created_at desc limit 10) s), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_central_resumo() from public;
revoke all on function public.admin_central_resumo() from anon;
grant execute on function public.admin_central_resumo() to authenticated;
comment on function public.admin_central_resumo() is 'Visão central SaaS de governança, módulos, permissões, auditoria e acessos; somente ADMIN.';
