# Ambiente de homologação — Compras Públicas

**Criado em:** 1º de outubro de 2026
**Projeto:** `homologacao-compras-2026-10-01`
**Project ref:** `xnktywrdoqlacwmdemfp`
**Região:** `sa-east-1`
**Custo estimado:** US$ 0/mês

## Escopo

Este é um projeto Supabase separado do projeto principal `gestao-atas-pitangueiras`. Não foram copiados registros, saldos, documentos, usuários reais ou credenciais de produção.

O ambiente contém um schema autocontido de teste para Compras, incluindo fluxos, versões, etapas, subetapas configuráveis, processos, subetapas operacionais, calendário de feriados e policies/RLS centrais.

## Migrations instaladas

| Ordem | Migration |
|---:|---|
| 1 | `staging_legacy_bootstrap` |
| 2 | `staging_compras_schema` |
| 3 | `compras_calendario_prazos` |
| 4 | `compras_subetapas` |
| 5 | `compras_subetapas_operacionais` |
| 6 | `staging_compras_rls` |

## Critérios de teste

1. Criar fluxo em rascunho.
2. Criar e editar etapas e subetapas.
3. Publicar uma versão.
4. Criar processo a partir da versão publicada.
5. Confirmar a materialização das subetapas.
6. Confirmar prazos úteis e feriados.
7. Concluir etapa e subetapa.
8. Executar teste negativo entre tenants.
9. Validar backup, restauração e rollback.

## Limitação atual

O projeto ainda não possui usuários Auth de teste nem fixtures funcionais. Até essa preparação, o ambiente está pronto no nível de schema, RLS e migrations, mas o E2E autenticado não deve ser considerado executado.

Não colocar chaves privadas, senhas ou dados reais neste arquivo.


## Fixtures e resultados

Foi criada a fixture `FIXTURE-001` no tenant `fixture-tenant-a`, com versão publicada, etapa `Análise fixture` e subetapa operacional `Conferência fixture`. A consulta live confirmou a subetapa com status `pendente`. A função de dias úteis retornou `2026-10-06` para três dias úteis a partir de `2026-10-01`.

O signup Auth de contas sintéticas foi tentado no projeto, mas o provedor retornou `email rate limit exceeded`; não foram criadas contas nem armazenados tokens. A validação autenticada/cross-tenant permanece pendente.


## Validação RLS cross-tenant

Foram criadas duas identidades sintéticas somente no banco: gestor A no tenant A e gestor B no tenant B. Usando claims JWT sintéticas sob a role `authenticated`, o gestor A visualizou 1 fluxo e 1 processo; o gestor B visualizou 0 processos e não acessou o processo do tenant A. O teste foi feito por SQL com rollback e não substitui o E2E de login browser.


## Artefatos da próxima fase

O rollback `supabase/rollbacks/rollback-staging-compras-fixtures.sql` remove somente as fixtures sintéticas do staging e foi preparado, mas não foi executado para preservar a evidência atual. O roteiro `scripts/staging-rls-checks.sql` repete as verificações de RLS com rollback. O checklist E2E documenta o fluxo autenticado e o teste negativo cross-tenant. A execução browser permanece pendente apenas por falta de conta Auth válida após o limite de email do projeto.


## E2E autenticado transacional

Foi executado sob `authenticated` com claims sintéticas e rollback: criação de fluxo, versão, etapa, subetapa, publicação, processo, etapa operacional, materialização e conclusão da subetapa. Todas as sete fases retornaram um registro criado, e a conclusão registrou o ator. O navegador Auth real permanece pendente porque o signup está limitado por email.


## Backup lógico e rollback

O manifesto lógico registrou 1 fluxo, 1 versão, 1 etapa, 1 subetapa, 1 processo e 1 subetapa operacional. O rollback foi executado dentro de transação: os contadores zeraram durante o ensaio e, após `ROLLBACK`, retornaram para 2 tenants, 1 fluxo e 1 subetapa operacional. Backup físico gerenciado e restore integral permanecem pendentes por limitação do conector disponível.

## Tentativa de fixture de aprovação atômica — 1º de outubro de 2026
A execução da fixture recomendada para `compras_aprovar_pedido` foi iniciada no projeto `xnktywrdoqlacwmdemfp`, mas foi interrompida antes de qualquer DDL/DML. O catálogo confirmou que o staging possui `atas` e `usuarios`, porém não possui `itens_ata`, `pedidos`, `itens_pedido`, `consumos` nem a RPC `public.compras_aprovar_pedido(integer)`. Portanto, este staging ainda não tem paridade estrutural com o módulo Atas, Saldos e Pedidos.

Não foram criadas tabelas parciais nem executados pedidos sintéticos: isso produziria uma validação falsa da RPC aplicada em produção. Nenhum dado do staging foi alterado nesta tentativa. Para executar a fixture com validade, é necessário preparar uma migration aditiva de schema de Atas no staging, com RLS e funções auxiliares compatíveis, ou disponibilizar um projeto de homologação com a paridade já existente.

## Paridade do módulo Atas aplicada — 1º de outubro de 2026
Foi aplicada somente no projeto `xnktywrdoqlacwmdemfp` a migration `20261001001700-staging-atas-parity-atomic-approval.sql`. Ela criou as tabelas tenant-scoped `itens_ata`, `pedidos`, `itens_pedido` e `consumos`, índices, RLS, grants para `authenticated` e a RPC `public.compras_aprovar_pedido(integer)` como `SECURITY INVOKER`. O catálogo confirmou RLS habilitada nas quatro tabelas, execução concedida a `authenticated` e negada a `anon`.

A fixture transacional foi executada sob `authenticated` com o gestor sintético do tenant A e rollback ao final. Todos os checks passaram: leitura do próprio tenant, bloqueio cross-tenant, aprovação inicial, segunda aprovação idempotente, saldo insuficiente rejeitado com SQLSTATE `23514`, decremento único de saldo e um único consumo. O tenant B foi usado para confirmar que a aprovação cross-tenant não é localizada pela RLS. Nenhuma fixture permaneceu persistida.

Artefatos: `supabase/migrations/20261001001700-staging-atas-parity-atomic-approval.sql` e `supabase/rollbacks/rollback-20261001001700-staging-atas-parity-atomic-approval.sql`. O teste de corrida real entre duas sessões ainda requer dois clientes/conexões simultâneas; a função já usa `FOR UPDATE` no pedido e no item da ata.

## Auditoria canônica Admin-only — 1º de outubro de 2026
Foi aplicada no staging a migration `20261001001800-auditoria-canonica-admin-only.sql`. Ela criou `auditoria_eventos` e `auditoria_eventos_relatorio`, com RLS tenant-scoped, escrita somente por triggers `SECURITY DEFINER`, bloqueio append-only, contexto de requisição, campos alterados e hash SHA-256 encadeado por tenant. A política de leitura permite somente o papel `tenant_admin`; `compras_manager` e demais perfis não visualizam registros nem relatórios.

Triggers foram instalados condicionalmente nas entidades críticas disponíveis: memberships, fluxos, processos, documentos, artefatos, regras, decisões, itens de ata, pedidos, itens de pedido e consumos. As tabelas legadas de auditoria existentes continuam preservadas, mas sua leitura foi restringida a `tenant_admin`.

A fixture transacional gerou dois eventos, confirmou hashes de 64 caracteres, registrou `saldo_quantidade` em `campos_alterados`, confirmou grants de UPDATE/DELETE ausentes para `authenticated` e retornou zero eventos tanto na tabela quanto no relatório quando o mesmo usuário foi temporariamente tratado como `compras_manager`. A transação foi revertida.

A trilha é evidência técnica e não certificação jurídica automática. Permanecem pendentes concorrência com duas conexões simultâneas, E2E browser autenticado, política municipal de retenção/cadeia de custódia, integração com logs do provedor Auth/Storage e backup físico/restauração.

## Gestão de Trabalho — 1º de outubro de 2026
Foi aplicada somente no staging `xnktywrdoqlacwmdemfp` a migration `20261001001900-gestao-trabalho-core-staging.sql`, seguida da correção `20261001001901-gestao-trabalho-conflicts.sql`. O pacote criou o núcleo persistente de tarefas, demandas, projetos, solicitações, rotinas, agenda, capacidade, comentários, documentos, eventos, notificações, RLS e RPCs. O catálogo de módulos foi atualizado para `gestao-de-trabalho/index.html`.

A fixture autenticada sintética foi executada sob `authenticated` e revertida. Passaram: inserção de tarefa agendada, notificação de atribuição, conflito contra tarefa existente, cálculo de carga e isolamento tenant-scoped. A fixture de sobrecarga retornou 540 minutos planejados contra 480 de capacidade, 60 minutos de sobrecarga e `pode_continuar=true`; o cadastro não é bloqueado. O usuário do tenant A não teve acesso ao tenant B (`tenant_a_access=true`, `tenant_b_access=false`, `tenant_b_visible_tasks=0`). Nenhuma linha de fixture permaneceu (`fixture_rows_persisted=0`).

A interface foi validada por HTTP local: página, CSS, JS e layout responderam 200; `node --check` foi aprovado. E2E visual autenticado ainda depende de sessão Auth real. Rollback: `supabase/rollbacks/rollback-20261001001900-01901-gestao-trabalho-core-staging.sql`.

## Promoção para produção — 1º de outubro de 2026
O núcleo validado no staging foi promovido, mediante autorização expressa, ao projeto `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`) pelas migrations `gestao_trabalho_core_production` e `gestao_trabalho_conflicts_production`. A produção confirmou 17 tabelas com RLS, 10 statuses, 5 categorias, catálogo ativo/visível, RPCs e triggers esperados, sem fixtures ou notificações persistidas. O rollback de produção preparado é `supabase/rollbacks/rollback-20261001002000-02001-gestao-trabalho-production.sql` e não foi executado. A publicação da interface permanece uma etapa separada do deploy do banco.
