-- painel-estrategico-do-prefeito: somente indicadores agregados e alertas executivos.
-- Não expõe nomes, CPF, endereços, prontuários ou histórico individual de cidadãos.

create or replace function public.prefeito_painel_autorizado()
returns boolean
language sql
security invoker
set search_path=pg_catalog,public,app_private
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = app_private.current_user_id()
      and coalesce(u.ativo,true)
      and upper(coalesce(u.perfil,'')) in ('ADMIN','PREFEITO','VICE_PREFEITO','CHEFE_GABINETE','CONTROLADOR','CONTROLADORIA')
  );
$$;
revoke all on function public.prefeito_painel_autorizado() from public,anon;
grant execute on function public.prefeito_painel_autorizado() to authenticated;

create or replace function public.prefeito_painel_dados(p_inicio date default (current_date-29),p_fim date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,app_private
as $$
declare
  v_inicio date := least(coalesce(p_inicio,current_date-29),coalesce(p_fim,current_date));
  v_fim date := greatest(coalesce(p_inicio,current_date-29),coalesce(p_fim,current_date));
  v_tenant uuid := app_private.current_tenant_id();
  v_bib jsonb;
  v_compras jsonb;
  v_tendencias jsonb;
  v_alertas jsonb;
  v_total_emprestimos bigint;
  v_total_pedidos bigint;
begin
  if not public.prefeito_painel_autorizado() then
    raise exception 'Acesso restrito ao painel-estrategico-do-prefeito' using errcode='42501';
  end if;
  if v_fim-v_inicio > 366 then
    raise exception 'O período máximo do painel é de 366 dias' using errcode='22023';
  end if;

  select jsonb_build_object(
    'livros', (select count(*) from public.bib_livros x where x.tenant_id=v_tenant and coalesce(x.ativo,true)),
    'exemplares', (select count(*) from public.bib_exemplares x where x.tenant_id=v_tenant and coalesce(x.ativo,true)),
    'exemplares_disponiveis', (select count(*) from public.bib_exemplares x where x.tenant_id=v_tenant and coalesce(x.ativo,true) and x.situacao='DISPONIVEL'),
    'exemplares_emprestados', (select count(*) from public.bib_exemplares x where x.tenant_id=v_tenant and coalesce(x.ativo,true) and x.situacao='EMPRESTADO'),
    'leitores_ativos', (select count(*) from public.bib_leitores x where x.tenant_id=v_tenant and x.status='ATIVO'),
    'emprestimos_periodo', (select count(*) from public.bib_emprestimos x where x.tenant_id=v_tenant and x.data_retirada::date between v_inicio and v_fim),
    'devolucoes_periodo', (select count(*) from public.bib_emprestimo_itens x where x.tenant_id=v_tenant and x.data_devolucao::date between v_inicio and v_fim),
    'emprestimos_atrasados', (select count(*) from public.bib_emprestimos x where x.tenant_id=v_tenant and x.status in('ABERTO','PARCIAL') and x.prazo_devolucao<current_date),
    'reservas_ativas', (select count(*) from public.bib_reservas x where x.tenant_id=v_tenant and x.status in('ATIVA','AGUARDANDO_RETIRADA')),
    'inventarios_em_execucao', (select count(*) from public.bib_inventarios x where x.tenant_id=v_tenant and x.status='EM_EXECUCAO')
  ) into v_bib;

  select count(*) into v_total_emprestimos from public.bib_emprestimos x where x.tenant_id=v_tenant and x.data_retirada::date between v_inicio and v_fim;

  select jsonb_build_object(
    'atas_ativas', (select count(*) from public.atas x where x.tenant_id=v_tenant and upper(coalesce(x.situacao,'')) in('ATIVA','VIGENTE')),
    'valor_global_atas', coalesce((select sum(x.valor_global) from public.atas x where x.tenant_id=v_tenant and upper(coalesce(x.situacao,'')) in('ATIVA','VIGENTE')),0),
    'saldo_valor', coalesce((select sum(i.saldo_valor) from public.itens_ata i where i.tenant_id=v_tenant and coalesce(i.situacao,'') not in('CANCELADO','INATIVO')),0),
    'pedidos_periodo', (select count(*) from public.pedidos x where x.tenant_id=v_tenant and x.data_solicitacao between v_inicio and v_fim),
    'pedidos_pendentes', (select count(*) from public.pedidos x where x.tenant_id=v_tenant and upper(coalesce(x.status_aprovacao,x.status,'')) in('PENDENTE','AGUARDANDO_APROVACAO','EM_ANALISE')),
    'pedidos_aprovados', (select count(*) from public.pedidos x where x.tenant_id=v_tenant and upper(coalesce(x.status_aprovacao,x.status,'')) in('APROVADO','AUTORIZADO')),
    'pedidos_rejeitados', (select count(*) from public.pedidos x where x.tenant_id=v_tenant and upper(coalesce(x.status_aprovacao,x.status,'')) in('REJEITADO','REPROVADO','CANCELADO')),
    'valor_pedidos_periodo', coalesce((select sum(x.valor_total) from public.pedidos x where x.tenant_id=v_tenant and x.data_solicitacao between v_inicio and v_fim),0),
    'entregas_parciais', (select count(*) from public.pedidos_entregas x where x.tenant_id=v_tenant and x.data_entrega between v_inicio and v_fim and upper(coalesce(x.tipo,''))='PARCIAL'),
    'ocorrencias_abertas', (select count(*) from public.pedidos_ocorrencias x where x.tenant_id=v_tenant and not coalesce(x.resolvida,false)),
    'atas_a_vencer_30_dias', (select count(*) from public.atas x where x.tenant_id=v_tenant and x.data_fim_vigencia between current_date and current_date+30 and upper(coalesce(x.situacao,'')) in('ATIVA','VIGENTE'))
  ) into v_compras;
  select count(*) into v_total_pedidos from public.pedidos x where x.tenant_id=v_tenant and x.data_solicitacao between v_inicio and v_fim;

  select coalesce(jsonb_agg(jsonb_build_object('mes',to_char(m.mes,'YYYY-MM'),'emprestimos',coalesce(b.emprestimos,0),'pedidos',coalesce(c.pedidos,0),'valor_pedidos',coalesce(c.valor_pedidos,0)) order by m.mes),'[]'::jsonb)
  into v_tendencias
  from generate_series(date_trunc('month',v_fim-interval '5 months')::date,date_trunc('month',v_fim)::date,interval '1 month') m(mes)
  left join lateral (select count(*) emprestimos from public.bib_emprestimos x where x.tenant_id=v_tenant and date_trunc('month',x.data_retirada)::date=m.mes) b on true
  left join lateral (select count(*) pedidos,coalesce(sum(x.valor_total),0) valor_pedidos from public.pedidos x where x.tenant_id=v_tenant and date_trunc('month',x.data_solicitacao)::date=m.mes) c on true;

  select coalesce(jsonb_agg(a.item order by a.prioridade desc),'[]'::jsonb) into v_alertas
  from (select jsonb_build_object('codigo','BIB_ATRASOS','prioridade',case when count(*)>=20 then 3 else 2 end,'titulo','Empréstimos em atraso','mensagem',count(*)||' empréstimo(s) em atraso na Biblioteca.','modulo','biblioteca') item,case when count(*)>=20 then 3 else 2 end prioridade from public.bib_emprestimos x where x.tenant_id=v_tenant and x.status in('ABERTO','PARCIAL') and x.prazo_devolucao<current_date having count(*)>0
        union all select jsonb_build_object('codigo','COMPRAS_SALDO','prioridade',3,'titulo','Saldo de atas em atenção','mensagem','Existem itens de atas com saldo financeiro reduzido.','modulo','compras') item,3 prioridade from public.itens_ata i where i.tenant_id=v_tenant and coalesce(i.saldo_valor,0)>0 and coalesce(i.saldo_valor,0)<=coalesce(i.valor_total,0)*0.1 having count(*)>0
        union all select jsonb_build_object('codigo','COMPRAS_OCORRENCIAS','prioridade',3,'titulo','Ocorrências de compras abertas','mensagem',count(*)||' ocorrência(s) operacional(is) aguardam tratamento.','modulo','compras') item,3 prioridade from public.pedidos_ocorrencias o where o.tenant_id=v_tenant and not coalesce(o.resolvida,false) having count(*)>0
        union all select jsonb_build_object('codigo','COMPRAS_VENCIMENTO','prioridade',2,'titulo','Atas próximas do vencimento','mensagem',count(*)||' ata(s) vencem nos próximos 30 dias.','modulo','compras') item,2 prioridade from public.atas a where a.tenant_id=v_tenant and a.data_fim_vigencia between current_date and current_date+30 and upper(coalesce(a.situacao,'')) in('ATIVA','VIGENTE') having count(*)>0) a;

  return jsonb_build_object('periodo',jsonb_build_object('inicio',v_inicio,'fim',v_fim),'biblioteca',v_bib,'compras',v_compras,'tendencias',v_tendencias,'alertas',v_alertas,'metadados',jsonb_build_object('gerado_em',now(),'escopo','agregado','dados_pessoais_expostos',false,'tenant_id',v_tenant));
end;
$$;
revoke all on function public.prefeito_painel_dados(date,date) from public,anon;
grant execute on function public.prefeito_painel_dados(date,date) to authenticated;
