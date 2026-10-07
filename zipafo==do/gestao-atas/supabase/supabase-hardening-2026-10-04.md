# Hardening Supabase — 04/10/2026

## Projeto aplicado

`gestao-atas-pitangueiras` — ref `qgkjnzcqjhhqdgxmvtew`.

O projeto de homologação `homologacao-compras-2026-10-01` não foi alterado.

## Migrations aplicadas

- `critical_hardening_20261004`
- `critical_hardening_revoke_public_audit_execute_20261004`

## Correções realizadas

### RLS sem políticas

Foram adicionadas políticas às tabelas `public.anexos_atos`, `public.configuracoes_atos` e `public.versoes_atos`.

- `configuracoes_atos`: leitura pública; inserção, alteração e exclusão apenas para ADMIN autenticado.
- `anexos_atos`: leitura para usuários autenticados; mutações apenas para ADMIN autenticado.
- `versoes_atos`: leitura para usuários autenticados; mutações apenas para ADMIN autenticado.

A verificação posterior confirmou quatro políticas em cada tabela.

### RPC de auditoria

A função `public.bib_registrar_auditoria(text,text,text,jsonb)` deixou de ser executável por `PUBLIC` e `anon`. A execução permanece disponível para `authenticated`, que é o papel usado pelos módulos autenticados.

Verificação: `public_execute = false`, `anon_execute = false`, `authenticated_execute = true`.

### Search path das funções

O `search_path` foi fixado para as 18 funções apontadas pelo advisor como mutáveis, usando `pg_catalog, public, app_private, auth, storage`.

### Índices críticos

Foram criados índices para os caminhos de atos, anexos, versões, órgão, tipo e usuários de cadastro/atualização. Os oito índices foram confirmados após a migration.

## Validação posterior

O advisor de segurança deixou de reportar:

- RLS habilitado sem políticas;
- função SECURITY DEFINER executável por `anon`;
- funções com `search_path` mutável.

Permanece uma recomendação de segurança do Supabase Auth: **proteção contra senhas vazadas desabilitada**. Essa configuração não é alterada por migration SQL; deve ser habilitada no painel de autenticação do projeto, após homologar impacto no fluxo de login.

Também permanecem alertas de funções `SECURITY DEFINER` executáveis por usuários autenticados. Eles são usados por RPCs administrativas e operacionais e precisam de revisão individual de autorização/escopo antes de revogar execução, pois uma revogação ampla quebraria os módulos.

## Rollback

O rollback correspondente foi salvo no Drive, mas sua execução restauraria riscos de segurança. Deve ser utilizado somente em incidente operacional com aprovação explícita.
