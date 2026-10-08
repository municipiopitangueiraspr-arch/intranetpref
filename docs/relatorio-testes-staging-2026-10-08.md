# Relatório de testes controlados — staging

**Data:** 08/10/2026  
**Projeto:** `homologacao-compras-2026-10-01`  
**Project ID:** `xnktywrdoqlacwmdemfp`  
**Projeto oficial não alterado:** `gestao-atas-pitangueiras` / `qgkjnzcqjhhqdgxmvtew`

## Resultado

| Teste | Resultado |
|---|---|
| Aprovação de pedido | PASSOU |
| Idempotência da aprovação | PASSOU |
| Rejeição de pedido | PASSOU |
| Estorno aprovado por segundo administrador | PASSOU |
| Concorrência real entre duas sessões | PENDENTE |
| Backup completo | PENDENTE |
| Restauração validada | PENDENTE |

## Evidências

- Uma aprovação gerou exatamente um consumo.
- A segunda chamada da mesma aprovação não gerou consumo adicional.
- A rejeição não gerou consumo e preservou o saldo.
- O estorno foi aprovado por um segundo administrador do mesmo tenant.
- O cenário de estorno concluiu com status `APROVADO`.
- Os fixtures `900001` a `900003` foram executados em transação e revertidos com `ROLLBACK`.
- A verificação posterior confirmou zero fixtures de teste pendentes.

## Monitoramento

O staging possui auditoria canônica em `pedidos`, `itens_pedido`, `itens_ata` e `consumos`. Reservas e estornos permanecem como ponto de revisão da matriz de auditoria.

## Conclusão

Os fluxos funcionais principais estão aprovados para homologação controlada. Isso não certifica backup, restauração ou concorrência real. A produção definitiva continua condicionada a essas validações.
