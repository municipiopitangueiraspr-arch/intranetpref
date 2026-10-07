# Auditoria e governança técnica — 1º de outubro de 2026

## Escopo

Foi criada e aplicada a migration `20261001001800-auditoria-canonica-admin-only.sql` no staging `xnktywrdoqlacwmdemfp` e no projeto principal `gestao-atas-pitangueiras`.

A solução registra alterações de entidades tenant-scoped críticas por trigger de banco, preservando:

- entidade e identificador do registro;
- operação (`INSERT`, `UPDATE`, `DELETE`);
- tenant;
- ator interno e UUID autenticado, quando disponível;
- data/hora;
- origem, request id, IP encaminhado e user-agent, quando fornecidos pelo contexto do gateway;
- estado anterior e novo;
- campos alterados;
- metadados do trigger;
- hash anterior e hash SHA-256 do evento atual.

## Entidades cobertas por trigger canônico

A migration instala o trigger quando a tabela existe e contém `tenant_id`:

- memberships do tenant;
- fluxos, versões, etapas e subetapas;
- processos, etapas e subetapas operacionais;
- documentos, artefatos, versões de artefatos, regras e decisões;
- itens de ata, pedidos, itens de pedido e consumos.

O mecanismo é condicional para permitir paridade diferente entre staging e produção sem criar tabelas ausentes.

## Integridade e acesso

- `public.auditoria_eventos` é tenant-scoped e possui RLS.
- Somente `tenant_admin` pode consultar registros e o relatório `auditoria_eventos_relatorio`.
- `compras_manager` não possui acesso aos registros ou relatórios de auditoria.
- A tabela canônica não concede INSERT, UPDATE ou DELETE a `authenticated`.
- Trigger append-only rejeita UPDATE/DELETE na própria trilha.
- O hash é encadeado por tenant e a obtenção do hash anterior é serializada por advisory lock transacional.
- As tabelas legadas `compras_eventos_auditoria`, `atas_historico` e `logs_operacoes` não foram apagadas; sua leitura foi restringida a `tenant_admin` quando existentes.

## Evidências executadas no staging

- Migration registrada no histórico do projeto.
- RLS habilitada na tabela canônica.
- Eventos de INSERT e UPDATE gerados em fixture transacional.
- Hashes com 64 caracteres hexadecimais confirmados.
- Campo `campos_alterados` confirmou `saldo_quantidade` na alteração de teste.
- `authenticated` não possui grants de UPDATE/DELETE na tabela canônica.
- Consulta Admin retornou os eventos.
- Consulta com o mesmo usuário temporariamente no papel `compras_manager` retornou zero eventos e zero linhas no relatório.
- A fixture foi revertida; nenhum registro de teste permaneceu.

## Limites e próximas validações

Esta implementação é uma **trilha técnica de evidência**. Ela não constitui, sozinha, certificação jurídica, assinatura digital qualificada, prova de identidade civil, retenção legal, cadeia de custódia ou conformidade automática com qualquer legislação. Esses pontos exigem definição municipal, política de retenção, controles de acesso, relógio/infraestrutura confiáveis, gestão de documentos e validação jurídica competente.

Ainda pendente:

1. teste com duas conexões simultâneas para comprovar a corrida de aprovação em ambiente real;
2. E2E browser com sessão Auth válida;
3. política municipal de retenção, exportação, preservação e descarte;
4. integração com logs do provedor/Auth/Storage e monitoramento operacional;
5. revisão de todas as tabelas legadas fora do escopo tenant-scoped;
6. backup/restauração físico gerenciado e ensaio formal de continuidade.

## Rollback

O rollback `supabase/rollbacks/rollback-20261001001800-auditoria-canonica-admin-only.sql` remove somente a tabela/view/funções canônicas. Ele não apaga `compras_eventos_auditoria`, `atas_historico` ou `logs_operacoes`. Deve ser executado apenas após exportação/verificação do histórico e aprovação de uma janela de reversão.
