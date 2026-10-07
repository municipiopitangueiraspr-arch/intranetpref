# Fase 7 — aprovação atômica de pedidos

**Data:** 1º de outubro de 2026
**Módulo:** Atas, Saldos e Pedidos
**Escopo:** consistência transacional interna, sem integrações externas.

## Motivo da fase

Antes desta fase, a aprovação era executada pelo navegador em várias chamadas: leitura do saldo, inserção de consumo, redução do saldo e atualização do pedido. Uma falha ou aprovação concorrente poderia deixar parte da operação persistida.

## Implementação

Foi criada a migration `20261001001600-atas-aprovacao-atomica.sql`, que instala a RPC `public.compras_aprovar_pedido(integer)`.

A RPC:

- exige usuário autenticado e papel de gestão no tenant;
- bloqueia o pedido e cada item da ata com `FOR UPDATE`;
- confirma que o pedido ainda está aguardando aprovação;
- valida quantidade e saldo disponível;
- insere os consumos e atualiza `saldo_quantidade` e `saldo_valor` na mesma transação;
- marca o pedido como aprovado somente após todos os itens serem processados;
- é idempotente quando recebe um pedido já aprovado;
- não concede execução para `anon` e mantém `SECURITY INVOKER`.

O rollback `rollback-20261001001600-atas-aprovacao-atomica.sql` remove somente a função. Ele não desfaz aprovações já concluídas nem remove consumos.

## Frontend

As aprovações individual e em lote em `controle-de-saldos/js/modules/pedidos.js` agora chamam a RPC. O navegador não realiza mais diretamente a sequência de inserção de consumo e atualização de saldo.

## Evidências

- Migration aplicada com sucesso ao projeto Supabase principal `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`).
- Catálogo live confirmou `compras_aprovar_pedido(p_pedido_id integer)`.
- `security_definer = false`.
- `authenticated` possui EXECUTE.
- `anon` não possui EXECUTE.
- Teste de contrato local: `atas_atomic_approval_contract=passed`.
- `node --check` do módulo de pedidos passou.

## Limites e próximo passo

Não foram aprovados pedidos reais durante a validação. O próximo ensaio deve usar fixture descartável em staging, com usuário de gestão autenticado, aprovação concorrente simulada, saldo insuficiente e rollback/limpeza. O E2E browser autenticado continua dependente de uma sessão Auth válida no staging.
