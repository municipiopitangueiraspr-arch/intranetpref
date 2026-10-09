# Painel de segurança e auditoria administrativa

## Escopo

O Painel Executivo mostra autenticações confirmadas, tentativas malsucedidas, IPs distintos e transações recentes. A página **Auditoria e logs** acrescenta busca, filtros por categoria e período, paginação e campos de IP/agente do navegador. A navegação administrativa compartilhada inclui a nova página. O cache PWA e os cache-busters dos scripts alterados foram atualizados.

Os logins por e-mail/senha da página principal, do helper compartilhado, da tela NKP, do script legado de Atas e a reautenticação da troca de senha no onboarding passam pela Edge Function `security-login`. A reautenticação substitui a sessão da mesma conta, como já ocorria com o sign-in direto. Antes de devolver uma sessão, o backend:

1. reserva um evento de auditoria e verifica limites de tentativas dentro de uma transação com locks advisory;
2. valida credenciais no Supabase Auth;
3. exige perfil existente e `ativo = true` em `public.usuarios`;
4. grava o resultado final e atualiza `usuarios.ultimo_acesso`;
5. só então devolve os tokens.

Contas sem perfil ou inativas não recebem a sessão. As mensagens de falha de credencial/perfil são indistinguíveis para não facilitar enumeração; os motivos específicos ficam somente no log administrativo. Sessões criadas pelo Auth e rejeitadas pelo perfil têm tentativa de revogação.

O rate limit implementado é de **8 falhas/pendências por identificador HMAC e 30 por IP confiável em 15 minutos**. O IP só é lido do cabeçalho `cf-connecting-ip` injetado pelo edge; `x-real-ip` e `x-forwarded-for` não são confiados. Se o edge não fornecer esse cabeçalho, o IP fica nulo e permanece ativo o limite por identificador, além dos controles nativos do Supabase Auth. O rate limit não substitui os limites nativos da Auth.

O sucesso OAuth é registrado somente com uma sessão validada, um marcador temporal criado pelo botão, conta com Google vinculado e confirmação server-side de `last_sign_in_at` recente pelo Auth Admin API e compatível com o início daquele fluxo. A claim AMR é conferida quando presente (e um método `password` explícito não passa como OAuth); se ausente, o timestamp verificado pelo Admin API continua obrigatório. Não se presume `auth_time`, pois a referência JWT oficial o trata como não obrigatório. Se a confirmação ou a gravação falhar, o fluxo fecha e encerra a sessão. Os eventos nativos de autenticação são lidos de `auth.audit_log_entries` pela RPC administrativa; a gravação Postgres dos Auth Audit Logs foi habilitada no projeto Supabase. A exibição de uma tentativa OAuth rejeitada como falha depende dos campos/eventos que o próprio Supabase emitir; a consulta não infere resultado quando os metadados não o distinguem. Consulte [Auth Audit Logs do Supabase](https://supabase.com/docs/guides/auth/audit-logs).

As transações vêm da trilha canônica `public.auditoria_eventos`. A página mostra operação, entidade, responsável, IP, agente e nomes dos campos alterados, nunca os snapshots com valores anteriores ou novos.

## Autorização e escopo multi-tenant

A central administrativa é **global**: o perfil `ADMIN` ativo da plataforma, validado por `app_private.current_user_is_admin()`, consulta registros de qualquer tenant no projeto Supabase. Isso é intencional para o Painel Central existente, que já agrega tenants. As RPCs `SECURITY DEFINER` bypassam a RLS tenant-level da trilha canônica, mas fazem explicitamente esse check global antes de retornar dados. Não são apropriadas para uma tela de `tenant_admin`; uma futura superfície tenant-scoped deverá incluir `tenant_id` nos eventos e aplicar membership/escopo em cada RPC.

A migration cria `public.fn_is_admin()` como compatibilidade para RPCs antigas **somente se o objeto estiver ausente**; as RPCs novas chamam diretamente o helper versionado. Acesso direto à tabela de log customizada é revogado para `PUBLIC`, `anon` e `authenticated`; as RPCs administrativas concedem execução apenas a `authenticated`, com check interno.

## Retenção e privacidade

Os eventos customizados de autenticação são limitados à janela administrativa de **180 dias** e removidos fisicamente de hora em hora. A migration falha se `pg_cron` não estiver instalado, em vez de deixar a retenção silenciosamente sem execução. O job `security-login-pending-cleanup` converte eventos `pending` abandonados há mais de cinco minutos em falha técnica. A trilha transacional append-only tem retenção independente e não é alterada.

Os eventos armazenam identificador mascarado, etiqueta HMAC com chave backend-only, resultado/código fechado, IP confiável, user-agent e UUID autenticado quando disponível. Senhas, tokens e respostas brutas da Auth não são persistidos. IP e agente são dados potencialmente identificáveis e ficam visíveis apenas ao ADMIN global.

## Alertas internos

A RPC `public.admin_security_alerts()` calcula os alertas no momento da consulta, exige ADMIN ativo e não persiste cópias dos eventos. A interface atualiza a trilha e os alertas a cada 60 segundos enquanto a página está visível. Alertas não são enviados a e-mail, chat ou serviço externo; se uma consulta falhar, os dados anteriores são ocultados no navegador.

- **Volume de autenticação (15 min):** conta `failure` e `pending`, iguais ao rate limit. Há aviso a partir de 5 tentativas por identificador HMAC e 15 por IP; a severidade crítica começa em 8 e 30, respectivamente. O resumo nunca retorna o IP bruto. Na trilha, IP e agente continuam visíveis somente ao ADMIN ativo, conforme requisito operacional.
- **Disponibilidade do Auth (15 min):** aviso a partir de 5 `auth_service_error`; crítico a partir de 10.
- **OAuth (15 min):** apenas eventos nativos `action=login` com provedor não vazio/não e-mail e campo explícito `error` ou `error_code`; aviso em 3 e crítico em 5. Não são inferidas falhas a partir de tentativas sem resultado explícito. A classificação precisa ser confirmada com um evento OAuth real em homologação.
- **Operações transacionais (24 h):** alterações em `app_tenant_memberships` e exclusões físicas registradas na trilha geram sinal de revisão; o detalhe deve ser conferido nos logs transacionais, sem exibir snapshots.

Os alertas são estado derivado, não um histórico de incidentes durável. Para notificações fora do painel, é necessário definir destino e mecanismo próprios; esta entrega não habilita exportação nem encaminha dados identificáveis.

## Ordem obrigatória de implantação

1. Aplicar `supabase/migrations/20261009130000-admin-security-audit.sql` no projeto `qgkjnzcqjhhqdgxmvtew`. Confirmar os jobs `security-login-retention-180d` e `security-login-pending-cleanup`.
2. Aplicar `supabase/migrations/20261009143000-admin-security-alerts.sql`; confirmar o índice `auditoria_eventos_security_alerts_idx`, a função `admin_security_alerts()` como `SECURITY DEFINER` e execução somente para `authenticated`, com check de ADMIN interno.
3. Implantar `supabase/functions/security-login/index.ts` com `verify_jwt = false` de `supabase/config.toml`: o endpoint precisa aceitar o primeiro login sem sessão. Conferir CORS/origens e o cabeçalho confiável de IP no ambiente real. A extensão dos alertas não altera nem exige novo deploy da Edge Function.
4. Confirmar as variáveis backend `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Se `SECURITY_LOGIN_ALLOWED_ORIGINS` estiver configurada, incluir `https://municipiopitangueiraspr-arch.github.io`.
5. Em homologação, validar login ativo, senha inválida, perfil ausente, usuário inativo, burst concorrente acima do limite, IP/agente, logout de sessão rejeitada, ausência de credenciais nos eventos e jobs de retenção/pendências. Para sucesso OAuth, confirmar `last_sign_in_at` no Admin API e o comportamento da AMR quando presente; para falhas OAuth, conferir se o retorno rejeitado gera evento nativo com metadados suficientes para identificar o resultado.
6. **Somente após migrations, jobs e Edge Function validados, publicar o frontend no GitHub Pages.** O login fecha com segurança se o backend ainda não estiver implantado; publicar a interface primeiro interromperia novos logins.
7. Sincronizar no Google Drive a mesma revisão publicada no GitHub.

## Estado e validação desta branch

No projeto Supabase `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`), a migration foi aplicada e conferida: tabela de eventos, RPCs administrativas e os jobs `security-login-pending-cleanup` (`*/5 * * * *`) e `security-login-retention-180d` (`0 * * * *`) estão presentes. A Edge Function `security-login` foi implantada na versão 2 com `verify_jwt = false`.

Os testes HTTP sem credenciais confirmaram preflight permitido (`OPTIONS 200`), rejeição de origem não autorizada (`403`) e resposta de requisição inválida para a origem oficial (`400`), sem executar login. Em 2026-10-09, habilitei **Authentication → Audit Logs → Write audit logs to the database** no Dashboard do projeto `gestao-atas-pitangueiras`; após recarregar a tela, o controle permaneceu ativo. A consulta à tabela mostrou zero linhas no momento da verificação. Não foram criadas tentativas artificiais; a captura será confirmada com eventos reais de autenticação. A validação de como o Supabase classifica uma falha OAuth específica continua pendente, pois a aplicação não infere resultado se o evento nativo não o informar.

O commit `ef54c5f` foi publicado em `main` por fast-forward. O workflow do GitHub Pages (`37939720888`) concluiu com sucesso; a [página de Auditoria e Logs](https://municipiopitangueiraspr-arch.github.io/intranetpref/core/auditoria/) e os dois CSS administrativos responderam `200`.

A sincronização reversa no Google Drive concluiu para os 24 arquivos alterados: 18 atualizados e 6 criados, incluindo a estrutura `supabase/functions/security-login`. Os hashes MD5 foram conferidos após o upload; nenhum arquivo foi excluído.

As verificações locais cobriram build e sintaxe JS, parsing PostgreSQL, compilação/bundle TypeScript, auditoria de HTML/assets/âncoras e `git diff --check`. A auditoria informativa continua listando 30 folhas CSS sem referência; nenhuma foi removida.

## Referências oficiais

- [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields) — `amr` é opcional; inclui os métodos `oauth` e `password` quando emitido.
- [Supabase user object](https://supabase.com/docs/guides/auth/users) — documenta `last_sign_in_at`.
- [Supabase Auth Admin getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid) — operação server-side que exige chave secreta.
- [Supabase Log Drains](https://supabase.com/docs/guides/observability/log-drains) — referência para encaminhamento externo, caso um canal de notificação venha a ser definido.
