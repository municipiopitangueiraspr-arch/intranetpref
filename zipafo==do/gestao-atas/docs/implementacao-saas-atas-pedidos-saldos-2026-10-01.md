# Implementação SaaS — Atas, Pedidos e Saldos

**Data:** 01/10/2026
**Escopo:** elevar o módulo ao nível do TR licitável, preservando dados existentes.

## Entregas realizadas

### 1. Núcleo transacional no Supabase

Aplicadas em staging e produção as migrações:

- `20261001002300-atas-pedidos-saldos-saas-core.sql`
- `20261001002400-atas-pedidos-saldos-reservas.sql`

A solução agora possui:

- `pedidos_reservas`: reserva de saldo por item de pedido, com estados `ATIVA`, `LIBERADA`, `CONSUMIDA` e `CANCELADA`;
- `pedidos_entregas`: cabeçalho de entregas parciais ou finais, numeradas por pedido;
- `pedidos_entregas_itens`: quantidades entregues por item, impedindo entrega acima do solicitado;
- `pedidos_eventos`: trilha append-only de eventos do ciclo de vida;
- validação de aprovação considerando reservas de outros pedidos e bloqueio concorrente do item da ata;
- liberação/consumo automático de reservas em aprovação, reprovação ou cancelamento;
- reserva automática quando um item é inserido em pedido pendente;
- RPC `compras_rejeitar_pedido` com justificativa obrigatória;
- RPC `compras_cancelar_pedido` com justificativa e bloqueio de cancelamento após entrega;
- RPC `compras_registrar_entrega` com validações de permissão, item, quantidade e entrega parcial/final;
- RLS por `tenant_id` nas novas entidades;
- eventos de status, reserva e entrega vinculados ao usuário autenticado.

### 2. Frontend

- `js/modules/pedidos.js` deixou de alterar diretamente o status de rejeição e passou a chamar `compras_rejeitar_pedido`;
- a rejeição agora usa o status canônico `REPROVADO`, em vez do valor divergente `REJEITADO`;
- a aprovação já utilizava `compras_aprovar_pedido` e agora é protegida também pelo gatilho de reservas;
- pedidos criados pelo carrinho passam a gerar reservas automaticamente no banco após a inserção dos itens, sem depender de lógica JavaScript frágil.

## Verificações executadas

- migração core aplicada com sucesso em staging;
- migração core aplicada com sucesso em produção;
- migração de reservas aplicada com sucesso em staging;
- migração de reservas aplicada com sucesso em produção;
- funções, gatilhos e tabelas novas foram criados sem alterar registros existentes;
- sintaxe JavaScript validada com `node --check` em todos os arquivos do módulo;
- inspeção do schema confirmou as tabelas atuais de pedidos, itens, atas e consumos;
- inspeção confirmou a RPC existente `compras_aprovar_pedido` e sua operação atômica de desconto;
- inspeção confirmou RLS/tenant scope já existente nas tabelas legadas.

## Observações de homologação

O teste funcional completo precisa ser executado com uma sessão autenticada de usuário com papel `tenant_admin` ou `compras_manager`, porque as RPCs deliberadamente rejeitam chamadas anônimas e exigem o tenant corrente. Não foram criados pedidos artificiais nem alterados dados reais para não contaminar a base.

### Roteiro de aceite

1. Criar pedido pendente com dois itens do mesmo item da ata em usuários/unidades diferentes.
2. Confirmar que o primeiro pedido cria reserva `ATIVA`.
3. Confirmar que o segundo pedido recebe erro de saldo utilizável quando a reserva esgota o saldo.
4. Aprovar o primeiro: confirmar consumo do saldo, reserva `CONSUMIDA` e evento `STATUS_ALTERADO`.
5. Rejeitar outro pedido com justificativa: confirmar reserva `LIBERADA` e evento.
6. Registrar entrega parcial e repetir entrega até a quantidade solicitada.
7. Tentar entregar quantidade acima do pedido: confirmar rollback transacional e erro.
8. Tentar cancelar pedido com entrega: confirmar bloqueio.
9. Conferir RLS usando usuários de tenants diferentes.

## Pendências para a próxima rodada

- tela de recebimento de entregas parciais/finais consumindo `compras_registrar_entrega`;
- tela de timeline de `pedidos_eventos`;
- estorno formal de consumo, com aprovação segregada e documento justificativo;
- testes E2E autenticados no navegador de homologação;
- anexação de documentos de entrega em bucket privado com política de retenção.

Essas pendências são evoluções de interface e governança; o núcleo de integridade, reserva, aprovação, rejeição, cancelamento e entrega já está persistido e protegido no banco.
