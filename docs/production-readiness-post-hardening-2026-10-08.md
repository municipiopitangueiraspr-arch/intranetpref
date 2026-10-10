# Estado pós-hardening — preparação para homologação

**Data:** 08/10/2026  
**Commit base:** `c985753cf6d49975311b3c7edb378318048d572e`

## Correções aplicadas

- Removido o trigger legado `public.trigger_atualizar_saldo` da tabela `public.consumos`.
- Mantida a redução explícita e atômica na RPC `public.compras_aprovar_pedido`.
- Revogado `EXECUTE` de `anon` e `public` nas RPCs sensíveis de pedidos e devoluções.
- Criados índices críticos para consumos, itens de pedido, reservas, estornos e entregas.
- Nenhum saldo, pedido, consumo, reserva ou histórico oficial foi alterado.
- Rollback reversível criado no repositório.

## Verificações concluídas

- Trigger duplicador ausente.
- RPCs sensíveis sem execução para `anon`/`public`.
- Índices críticos existentes.
- Migration aplicada com sucesso no Supabase oficial.
- Build frontend e sintaxe JavaScript aprovados.
- GitHub Pages publicado e verificado.
- Testes de aprovação, idempotência, rejeição e estorno passaram no projeto de staging isolado.
- Fixtures do staging foram revertidos e confirmados como removidos.
- Reconciliação dos 516 itens históricos concluída; posição aprovada para abertura da homologação, sem alteração de saldos.

## Pendências que não devem ser declaradas como concluídas

1. Teste de concorrência real com duas sessões PostgreSQL independentes.
2. Backup completo do projeto oficial.
3. Restauração de prova em projeto separado.
4. Comparação de estrutura, dados financeiros, Auth e Storage após restauração.
5. Matriz formal de RLS por perfil, unidade e tenant.
6. Auditoria equivalente para reservas e estornos, se exigida pelo critério de produção.
7. Identificação e assinatura do responsável municipal competente no termo financeiro.

## Classificação atual

O sistema está **preparado para homologação controlada e piloto supervisionado**. Não está certificado como produção definitiva enquanto backup, restauração e concorrência real permanecerem pendentes.

A aprovação operacional registrada aceita os saldos atuais como base de abertura da homologação. Ela não substitui a validação de backup/restauração nem uma aprovação financeira oficial assinada.
