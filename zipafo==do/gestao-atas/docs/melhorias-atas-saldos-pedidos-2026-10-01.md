# Evolução do módulo — Atas, Saldos e Pedidos

**Data:** 1º de outubro de 2026
**Escopo:** melhoria visual e funcional interna, sem integrações externas.

## Decisões de produto

- O nome recomendado para a área passou a ser **Atas, Saldos e Pedidos**. Ele descreve o trabalho real dos secretários e demais usuários, sem reduzir o módulo à gestão administrativa de atas.
- A navegação foi ajustada para destacar três tarefas: consultar atas, acompanhar saldos/consumo e controlar pedidos/aprovações.
- O dashboard passou a comunicar a prioridade por perfil, em vez de apresentar a mesma orientação para todos.

## Entregas

### 1. Nomenclatura e navegação

- Marca da sidebar, título da página, subtítulo, opção de dashboard e opção de pedidos atualizados.
- FAQ e catálogo de módulos atualizados para o novo nome.

### 2. Saldo utilizável

O indicador de saldo agora diferencia:

- **Saldo físico:** saldo calculado a partir dos itens ativos e dos consumos registrados.
- **Reservado:** valor agregado dos pedidos ainda aguardando aprovação.
- **Saldo utilizável:** saldo físico menos o valor reservado, limitado a zero.

Pedidos aprovados não são contados novamente como reserva, pois já são convertidos em consumo no fluxo de aprovação.

### 3. Dashboard orientado por perfil

- ADMIN: visão administrativa completa.
- SECRETARIO: prioridade para aprovações, riscos de saldo e vencimentos do órgão.
- SOLICITANTE: prioridade para seus pedidos e saldo disponível.
- ESTAGIARIO: monitoramento sem ações críticas.

### 4. Fila de decisões pendentes

A fila de aprovação ganhou leitura rápida de:

- número do pedido;
- órgão solicitante;
- fornecedor;
- valor agregado;
- idade do pedido em dias.

A fila continua usando os mesmos controles de aprovação e rejeição, com justificativa obrigatória para rejeição.

## Arquivos alterados

- `controle-de-saldos/js/main.js`
- `controle-de-saldos/js/modules/consulta.js`
- `controle-de-saldos/js/modules/dashboard.js`
- `controle-de-saldos/js/modules/pedidos.js`
- `controle-de-saldos/templates/dashboard.html`
- `controle-de-saldos/templates/faq.html`
- `controle-de-saldos/gestao-atas.html`
- `controle-de-saldos/css/dashboard.css`
- `shared/js/services/usuarios-service.js`

## Validação

- `node --check` executado com sucesso em `main.js`, `consulta.js`, `dashboard.js` e `pedidos.js`.
- Não houve migration nem alteração de dados no Supabase nesta melhoria: a entrega utiliza campos já existentes em `pedidos`, `consumos` e `itens_ata`.
- O próximo ensaio recomendado é abrir o módulo com um usuário de cada perfil no staging e confirmar a leitura dos cards e da fila com dados representativos.

## Pendências conhecidas

- E2E browser autenticado completo continua dependente da sessão Auth disponível no staging.
- A aprovação agora usa a RPC atômica `compras_aprovar_pedido(integer)`, que encapsula desconto de saldo, criação do consumo e mudança de status em uma única transação. O teste com fixture autenticada em staging continua sendo a próxima evidência necessária.
- Integrações externas permanecem fora do escopo, conforme orientação do projeto.
