# painel-estrategico-do-prefeito — Biblioteca e Compras

## Objetivo

O Painel Estratégico é uma camada executiva, somente leitura, para consolidar os primeiros dois módulos da intranet: Biblioteca Municipal e Gestão de Compras, Atas, Pedidos e Saldos.

Ele não replica telas operacionais e não concede ao prefeito acesso direto às tabelas de cidadãos, leitores, pedidos ou fornecedores. O backend produz indicadores agregados, tendências e alertas de gestão por exceção.

## Indicadores entregues

### Biblioteca

O painel exibe livros, exemplares, disponibilidade, exemplares emprestados, leitores ativos em quantidade, empréstimos no período, devoluções no período, atrasos, reservas ativas e inventários em execução.

### Compras

O painel exibe atas vigentes, valor global das atas, saldo financeiro agregado, pedidos do período, pedidos pendentes, pedidos aprovados, pedidos rejeitados ou cancelados, valor agregado dos pedidos, entregas parciais, ocorrências abertas e atas com vencimento nos próximos 30 dias.

### Visão temporal

A área de tendência apresenta os seis últimos meses disponíveis, comparando volume de empréstimos e volume de pedidos. O usuário pode consultar um período de até 366 dias.

### Alertas

O backend produz alertas agregados para atrasos da Biblioteca, baixo saldo de itens de atas, ocorrências de compras abertas e atas próximas do vencimento.

## Segurança e LGPD

A RPC `prefeito_painel_dados` exige sessão autenticada, valida o tenant pelo contexto da sessão e valida o perfil executivo. A lista inicial de perfis autorizados é `ADMIN`, `PREFEITO`, `VICE_PREFEITO`, `CHEFE_GABINETE`, `CONTROLADOR` e `CONTROLADORIA`.

O retorno inclui apenas agregações. Não são retornados nomes de leitores, CPF, endereço, telefone, histórico individual de leitura, número de usuário, prontuário, dados sensíveis ou identificadores pessoais.

O escopo máximo de consulta é de 366 dias. A camada é somente leitura e não executa mutações nos módulos setoriais.

## Critérios de aceitação

1. Usuário sem sessão não acessa os indicadores.
2. Usuário autenticado sem perfil executivo recebe erro de autorização.
3. Indicadores sempre filtram o `tenant_id` da sessão.
4. O frontend apresenta visão geral, Biblioteca, Compras, tendências e alertas.
5. O frontend não realiza consultas diretas de registros pessoais.
6. O frontend permite escolher período e atualizar os dados.
7. O painel mantém links de retorno para os módulos operacionais, sem misturar suas permissões.
8. A estrutura permite incluir Saúde, Educação, Assistência, Esporte e Cultura posteriormente usando o mesmo padrão de fatos agregados e alertas.

## Próxima expansão

Os próximos módulos deverão publicar indicadores próprios em RPCs de escopo executivo, mantendo a mesma separação entre operação setorial, gestão da secretaria e visão consolidada do prefeito.
