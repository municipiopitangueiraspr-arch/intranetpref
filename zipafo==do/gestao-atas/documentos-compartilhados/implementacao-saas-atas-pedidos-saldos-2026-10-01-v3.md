# Implementação SaaS — Atas, Pedidos e Saldos — fechamento operacional

**Data:** 01/10/2026

## Entregas desta rodada

### Backend

- criação de `pedidos_ocorrencias`, com tenant, pedido, entrega opcional, tipo, severidade, descrição, responsável e estado de resolução;
- RPC `compras_registrar_ocorrencia`, com validação de tenant, perfil, tipo, severidade e descrição;
- registro automático de `OCORRENCIA_REGISTRADA` na timeline;
- validação server-side de entrega final: uma entrega `FINAL` somente é aceita quando todos os itens do pedido estão integralmente entregues;
- validação de pedido aprovado, tenant, perfil, data não futura, itens positivos e limite de quantidade;
- revogação de execução para `PUBLIC` e `anon` nas RPCs de entrega e ocorrência;
- execução autorizada somente para `authenticated`;
- função de ocorrência transformada em `SECURITY DEFINER` com `search_path` fixo para que o cliente não receba permissão de escrita direta na tabela.

### Frontend

- ação **Solicitar Estorno** no card do pedido aprovado;
- modal de estorno com seleção de itens, quantidade e justificativa mínima de 10 caracteres;
- integração com `compras_solicitar_estorno`;
- ação **Registrar Ocorrência** para operadores autorizados;
- tipos: divergência, avaria, atraso, recusa, devolução e outra;
- severidades: normal, alta e crítica;
- integração com `compras_registrar_ocorrencia`;
- timeline agora exibe entregas, eventos, estornos e ocorrências;
- mensagens de validação, feedback de sucesso/erro e escape de dados para evitar injeção de HTML;
- modais e estilos responsivos adicionados ao template e stylesheet de pedidos.

## Validações executadas

- todos os arquivos JavaScript do módulo passaram em `node --check`;
- presença das novas ações, RPCs e modais validada por teste estático;
- migration corrigida após identificar que `pedidos_entregas.id` é UUID, não bigint;
- migration aplicada com sucesso em staging;
- migration aplicada com sucesso em produção;
- privilégios verificados nos dois ambientes:
  - `anon` não executa entrega;
  - `anon` não executa ocorrência;
  - `authenticated` executa as RPCs autorizadas;
- staging permaneceu `ACTIVE_HEALTHY` após a rodada de restore anterior.

## Limitações ainda não mascaradas como concluídas

- teste E2E de negócio com duas sessões autenticadas depende de credenciais válidas de homologação;
- devolução formal de item já entregue ainda requer uma operação específica distinta do estorno pré-entrega;
- anexos binários privados ainda precisam ser ligados ao Storage privado com política de acesso por tenant;
- aceite formal municipal, acessibilidade assistida e teste de desempenho continuam etapas de homologação.
