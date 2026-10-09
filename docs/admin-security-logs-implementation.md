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

A migration cria `public.fn_is_admin()` como compatibilidade para RPCs antigas **somente se o objeto estiver ausente**; as RPCs novas chamam diretamente o helper versionado. O acesso direto à tabela de log customizada é revogado para `PUBLIC`, `anon` e `authenticated`; as RPCs são executáveis por `authenticated` com check interno de ADMIN. `service_role` conserva seu privilégio administrativo próprio.

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

## Estado e validação da revisão (2026-10-09)

No projeto Supabase `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`), as migrations de logs e alertas estão aplicadas. A função `admin_security_alerts()` foi conferida como `SECURITY DEFINER`; o catálogo confirma execução por `authenticated` e `service_role`, sem execução por `anon` nem `PUBLIC`. O índice parcial `auditoria_eventos_security_alerts_idx` existe. Também permanecem ativos os jobs `security-login-pending-cleanup` (`*/5 * * * *`) e `security-login-retention-180d` (`0 * * * *`), e a Edge Function `security-login` segue implantada com `verify_jwt = false`.

A gravação Postgres dos Auth Audit Logs nativos foi habilitada em **Authentication → Audit Logs → Write audit logs to the database**. Não foram criadas tentativas artificiais nem executado login contra contas reais. A classificação de uma falha OAuth depende de evento nativo com resultado explícito e ainda deve ser confirmada em homologação.

A revisão foi publicada em `main`; o workflow do GitHub Pages concluiu com sucesso e a [página de Auditoria e Logs](https://municipiopitangueiraspr-arch.github.io/intranetpref/core/auditoria/) foi atualizada. A pasta `INTRANET` no Google Drive espelha os seis caminhos desta etapa; os hashes MD5 foram conferidos após o envio e nenhum arquivo foi excluído.

As verificações locais passaram: sintaxe JavaScript, parsing da migration, `git diff --check`, referências/arquivos sem caminhos quebrados ou diferenças de capitalização e verificação específica da página no auditor de acessibilidade. O auditor de acessibilidade ainda relata 137 achados em outras páginas do repositório; não foram alteradas nesta etapa. Não foi feito teste autenticado da interface em sessão ADMIN real.

## Referências oficiais

- [Supabase JWT claims](https://supabase.com/docs/guides/auth/jwt-fields) — `amr` é opcional; inclui os métodos `oauth` e `password` quando emitido.
- [Supabase user object](https://supabase.com/docs/guides/auth/users) — documenta `last_sign_in_at`.
- [Supabase Auth Admin getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid) — operação server-side que exige chave secreta.
- [Supabase Log Drains](https://supabase.com/docs/guides/observability/log-drains) — referência para encaminhamento externo, caso um canal de notificação venha a ser definido.

## Reconstrução da interface administrativa

A rota canônica `/core/auditoria/` foi substituída por uma página independente, sem reutilizar o antigo `core/auditoria.js` nem `core/css/admin-security-logs.css`. Esses arquivos legados permanecem no repositório para referência/rollback, mas não são importados pela tela ativa. O novo `core/auditoria-panel.js` preserva o gate ADMIN e as RPCs existentes; o visual fica em `core/css/admin-audit-console.css`, com escopo por `data-intranet-page` e sem carregar `shared/css/intranet-global.css`, que contém regras globais legadas com `!important`.

A rota também não carrega `identidade-intranet.css` nem `acessibilidade-intranet.css`: ambas alteram globalmente geometria de `.app-layout`, `.sidebar` e conteúdo, o que sobreporia o shell independente. `acessibilidade-intranet.js` não é carregado porque o shell compartilhado já controla o avatar e a sidebar, e o script global pode adicionar handlers concorrentes ao menu montado dinamicamente. O painel implementa no próprio escopo link de salto, rótulos/nomes acessíveis, status ARIA, foco visível e movimento reduzido. Por isso, o auditor genérico que exige a presença desses três assets pode apontar exceções intencionais nesta rota.

O cabeçalho, avatar, menu de troca de módulos e navegação administrativa são montados pelo `shared/js/layout.js`, o mesmo shell usado por Gestão de Atas, Saldos e Pedidos. A página fornece o caminho explícito do brasão por ser uma rota aninhada. A folha própria estiliza o shell do módulo e o backdrop mobile; o script auxiliar `system-shell.js` não é carregado, pois o controlador compartilhado já implementa toggle, clique no backdrop e tecla Escape.

O cliente limita `p_page` a 200, com 25 linhas por página (até 5.025 eventos por consulta), conforme o contrato da RPC. Se a consulta exceder esse recorte, a interface informa que o usuário deve refinar período, categoria ou busca. Chamadas RPC têm timeout de 15 segundos; falhas ocultam os resultados anteriores e liberam nova tentativa. Se o total cair durante a atualização automática e a página atual deixar de existir, a tela reposiciona e consulta novamente o último intervalo válido. O link Ajuda aponta para `#faq`, hash tratado pelo roteador SPA da Gestão de Atas.

## Ajuste das permissões do Presence online

A investigação do erro `Unauthorized: You do not have permissions to read from this Channel topic` encontrou policies para o tópico privado, mas elas também exigiam `usuarios.perfil_completo = true`. O `shared/js/layout.js`, por sua vez, admite qualquer perfil existente cujo campo `ativo` não seja `false`; essa condição extra podia negar a presença a uma conta que o próprio shell aceita. A migration `20261009212300-fix-intranet-online-presence-policy.sql` substitui as duas policies e preserva os limites `authenticated`, Presence, canal privado, tópico exato e perfil ativo, removendo somente o requisito de perfil completo. Não altera grants nem outros tópicos. Após a aplicação, a autorização é reavaliada em uma nova conexão; recarregue a página para validar a assinatura.

O aviso do navegador sobre `__cf_bm` é separado: trata-se de cookie de proteção contra bots da Cloudflare e o navegador o rejeita quando o domínio informado não corresponde ao host da resposta. Esse aviso, por si só, não explica a negação RLS do canal Realtime; para rastrear sua origem exata seria necessário identificar no painel Network qual host enviou o `Set-Cookie`.
