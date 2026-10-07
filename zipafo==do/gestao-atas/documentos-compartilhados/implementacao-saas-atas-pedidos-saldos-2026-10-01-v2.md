# Implementação SaaS — Atas, Pedidos e Saldos — rodada de fechamento

**Data:** 01/10/2026
**Escopo:** controles de encerramento, estorno segregado, relatórios operacionais protegidos e integração visual no frontend.

## Entregas no Supabase

Aplicada em staging e produção a migration `atas_pedidos_saldos_controles_operacionais_v2`, seguida da migration `atas_pedidos_saldos_controles_operacionais_grants`.

### Estorno segregado

- `pedidos_estornos` registra solicitação, decisão, justificativa, solicitante, aprovador, datas e observação;
- `pedidos_estornos_itens` registra itens e quantidades sem apagar consumos históricos;
- justificativa mínima de 10 caracteres;
- solicitação limitada ao tenant e ao pedido aprovado;
- quantidade cumulativa não pode exceder a quantidade do item;
- pedido com entrega registrada não pode usar este fluxo simplificado de estorno;
- solicitante não pode aprovar o próprio estorno;
- aprovação devolve saldo e valor de forma transacional;
- eventos `ESTORNO_SOLICITADO`, `ESTORNO_APROVADO` e `ESTORNO_REJEITADO` são registrados na timeline;
- tabelas ficaram somente para leitura do cliente; mutações são realizadas por RPC `SECURITY DEFINER` com `search_path` fixado.

### Encerramento

A RPC `compras_encerrar_pedido`:

- exige usuário autenticado e papel de gestão;
- exige pedido aprovado;
- verifica que todos os itens foram entregues integralmente;
- muda o pedido para `ENCERRADO`;
- registra o evento `PEDIDO_ENCERRADO`;
- não remove dados e não permite encerramento parcial.

### Relatórios operacionais

Foram criadas as views tenant-scoped:

- `compras_vw_pedidos_entregas`: solicitado, entregue, pendente e número de entregas;
- `compras_vw_saldos_operacionais`: contratado, saldo, reservado e utilizável.

As views usam `security_invoker=true` e foram concedidas somente para leitura ao papel `authenticated`.

## Entregas no frontend

- botão **Encerrar Pedido** para os perfis administrativos da interface;
- confirmação antes da operação;
- observação opcional;
- chamada à RPC `compras_encerrar_pedido`;
- atualização da lista após sucesso;
- feedback de erro sem expor detalhes desnecessários;
- estilo visual específico para diferenciar encerramento de aprovação e recebimento.

A tela de recebimento e a timeline já publicadas continuam conectadas às RPCs de entrega e aos eventos persistidos.

## Validações executadas

- migration aplicada com sucesso em staging;
- migration aplicada com sucesso em produção;
- migration de grants aplicada nos dois projetos;
- tabelas, views, RPCs e policies verificadas por catálogo PostgreSQL;
- `node --check` executado em todos os JavaScript do módulo;
- arquivos locais verificados como não vazios.

## Limitações honestamente registradas

O E2E autenticado ainda depende de uma conta de homologação válida com papel autorizado. A credencial anteriormente fornecida retornou `Invalid login credentials` em staging e produção; portanto, nenhum teste de negócio autenticado foi falsamente marcado como aprovado.

Também permanece necessário completar, em rodada própria, o fluxo de devolução de item já entregue, anexos privados de documentos, teste de concorrência com duas sessões reais, backup/restore e aceite formal municipal.

## Estado

- **Publicado:** migration, RPCs, tabelas, policies, views, grants e frontend de encerramento.
- **Validado tecnicamente:** DDL, catálogo de objetos, grants, policies e sintaxe JavaScript.
- **Pendente:** E2E com credencial válida, concorrência real, restore e homologação formal.
