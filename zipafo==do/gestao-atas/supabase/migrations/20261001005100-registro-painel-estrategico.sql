insert into public.modulos_sistema(nome,descricao,icone,rota,ativo,ordem,cor,visivel_intranet)
select 'painel_prefeito','Visão executiva agregada da Biblioteca e de Compras, Atas, Pedidos e Saldos.','fa-chart-line','painel-estrategico-do-prefeito/painel-prefeito.html',true,5,'#0d6b45',true
where not exists(select 1 from public.modulos_sistema where nome='painel_prefeito');
