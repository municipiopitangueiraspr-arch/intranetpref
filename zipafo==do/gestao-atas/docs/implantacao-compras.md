# Compras Públicas — implantação incremental e rastreabilidade

**Atualizado em:** 1º de outubro de 2026
**Status:** protótipo operacional integrado em desenvolvimento; **não é ainda produto SaaS pronto para produção nem comprovação de atendimento integral ao Termo de Referência**.

## Escopo protegido

- Preservar a Intranet, a Biblioteca existente e os fluxos de Gestão de Atas/Controle de Saldos, carrinho e entregas fracionadas.
- Manter as novas rotas sob `compras/` e as migrações do módulo em `supabase/migrations/`.
- Não alterar dados dos seis casos de saldo deixados para revisão na tarefa anterior. A cópia privada de trabalho fica fora da árvore destinada ao GitHub Pages, em `private-review-saldos/`, e é arquivada na subpasta `controle-de-saldos/revisao-de-saldos-privado` do Drive.
- Não remover arquivos CSS com base apenas em ausência de referência literal; carregamento dinâmico, rotas ou possibilidade de recuperação ainda precisam ser descartados.

## Capacidades implementadas no módulo

| Capacidade | Estado atual | Observação de aceite |
|---|---|---|
| Painel e necessidades de compra | Implementado no protótipo | Formulário e listagem ligados ao Supabase; perfis não gestores acompanham sua unidade conforme RLS. |
| Cadastro e acompanhamento de processos | Implementado no protótipo | Número/ano, objeto, unidade, tipo, modalidade, procedimento, fundamento informado, valor, situação e vínculo opcional à demanda/fluxo. |
| Itens e fornecedores do processo | Implementado no protótipo | Reaproveita o cadastro de fornecedores; exige conferência de itens e preços pelo usuário. |
| Fluxos versionados e tarefas | Implementado parcialmente | Criação de processo copia etapas publicadas; tarefas podem ser concluídas pelo responsável ou gestão. A RPC transacional de conclusão de etapa bloqueia dependências/documentos obrigatórios faltantes. Modelagem, subetapas, prazos automáticos e testes autenticados ainda faltam. |
| PCA — previsão anual | Implementado nesta etapa | Cadastro por ano/unidade, descrição, quantidade, unidade, valor, mês e prioridade. A previsão não autoriza contratação. |
| Publicações | Implementado nesta etapa como registro manual | Canal, tipo, data, status, protocolo e link/comprovante. **Não transmite nem integra automaticamente com PNCP, Diário Oficial ou portal municipal.** |
| Obrigações e Agenda | Implementado parcialmente | Cadastro e conclusão de obrigações pela gestão; tarefas podem ser concluídas pelo responsável. Agenda continua em lista, sem calendário, alertas persistentes ou cálculo de dias úteis/feriados. |
| Documentos/anexos | Upload privado e metadados implementados anteriormente | Bucket e políticas foram preparados; validar permissão real de upload/download com contas representativas antes de produção. |
| Relatório CSV | Implementado nesta etapa | Exporta linhas no escopo que o usuário consegue carregar. Testes de Excel/LibreOffice e revisão de conteúdo ainda necessários. |
| Contratos | Cadastro e histórico básico implementados | Vigência, valores, fornecedor, gestor/fiscal e log de eventos com data, descrição, valor e documento vinculado. Medições/atestos estruturados, fluxo financeiro, aditivos, reajustes, sanções e encerramento continuam parciais. |
| Processo → Ata/Saldo | Implementado por RPC transacional | Disponível somente depois de homologação, vencedor e item adjudicado; não criar ata automaticamente. Testar ponta a ponta em ambiente de ensaio com valores não financeiros antes de uso real. |
| Biblioteca Municipal | Preservada e linkada | Não reescrita; integração de aquisições e fluxo de compra de acervo ainda não implementados. |
| Atas, consulta de saldo, carrinho e entregas fracionadas | Preservados; usuário escolhe outros módulos pela Intranet | A sidebar de Compras não oferece atalhos a outros módulos. As seis exceções financeiras permanecem sem alteração. Validar regressão operacional antes de publicar novas versões. |

## Migrações já aplicadas

A auditoria live registrou dez migrações incrementais do módulo no Supabase (além da migração legada de modalidade de atas):

1. `20261001000100-compras-foundation.sql` — tenants/unidades, memberships e tabelas base de Compras.
2. `20261001000200-compras-legacy-security.sql` — isolamento aditivo dos dados legados considerados, Storage privado e vínculo de integração.
3. `20261001000300-compras-policies-rpc.sql` — RLS/policies, classificações, fluxo sugerido, módulo da intranet e RPC de criação da ata.
4. `20261001000400-compras-rpc-storage-indexes.sql` — ajustes de índices, Storage e contexto de tenant do RPC.
5. `20261001000500-compras-fk-indexes.sql` — cobertura de índices para FKs do módulo e remoção de índice duplicado de processos, identificados pelo advisor.
6. `20261001000600-compras-stage-completion.sql` — RPC `SECURITY INVOKER` para conclusão autenticada de etapa com validação de dependências e documentos obrigatórios.
7. `20261001000700-compras-artifacts-decisions-governance.sql` — artefatos e versões, decisões append-only e fontes/regras classificadas, com RLS e auditoria.
8. `20261001000800-compras-governance-fk-indexes.sql` — índices para as FKs das tabelas novas de governança.
9. `20261001000900-compras-rule-version-rpc.sql` — RPC `SECURITY INVOKER` com serialização atômica da numeração de versões por tenant/chave.
10. `20261001001000-compras-same-process-integrity.sql` — FKs/constraints de mesmo tenant e processo entre etapas, documentos, artefatos, decisões e atas; deriva `processo_id` nas versões de artefato e valida as constraints existentes.

Essas migrações **não tornam automaticamente toda a Intranet compatível com múltiplos municípios**. Não reaplicar arquivos agregados de referência sem comparar o histórico do banco; usar a tabela de migrações do Supabase como fonte de verdade.

## Requisitos importantes ainda pendentes do Termo de Referência

- Formulários/artefatos completos para ETP, Termo de Referência, edital, pareceres, atas de sessão e decisões; controle de revisão, versão e aprovação.
- Pesquisa de preços: já permite registrar fontes, condições, documento e método/observação da memória, com mapa descritivo por item; ainda faltam fluxo formal de análise/aprovação, regras justificadas de seleção da referência e validação completa de cálculos/documentos.
- Modelagem/teste do fluxo completo por fase e subetapas, aprovação, responsáveis e prazos configuráveis. A conclusão de etapa já valida dependências/documentos obrigatórios no banco, mas falta editor de fluxo e calendário para prazos.
- Integrações reais (autenticadas e testadas) com PNCP, TCE-PR/SIM-AM e publicação municipal; mapeamento de campos, recibos de transmissão, falha/reenvio e auditoria. O painel atual é apenas registro manual.
- Execução contratual: já existe log de eventos e conclusão de obrigações; faltam medições/atestos estruturados, entregas, liquidações/pagamentos, aditivos, reajustes, ocorrências com workflow, alertas e encerramento.
- Notificações, rotinas de calendário/dias úteis/feriados parametrizadas e relatórios completos com filtros, assinatura/identificação de fonte e exportações testadas.
- Integração definida entre Biblioteca e Compras para aquisição de acervo, preservando os dados e regras de circulação.
- Autotestes unitários/e2e e teste manual com contas de diferentes perfis, unidades e tenants; teste negativo que demonstre ausência de leitura cruzada.
- Hardening SaaS dos módulos legados: Biblioteca, Gestão de Atas, pedidos/carrinho, Atos Oficiais, usuários, Storage e demais módulos. A RLS atual foi auditada, mas as correções aditivas precisam de testes de isolamento e regressão específicos.
- GitHub Pages: validar publicação em subdiretório, todos os caminhos relativos, maiúsculas/minúsculas, cache-busting e URLs de retorno; instalar/confirmar CI de validação e plano de rollback.
- Segurança e operação: revisão independente das policies e funções privilegiadas, cópia de segurança/restauração, monitoramento, logs, retenção, privacidade, recuperação de conta e documentação do operador.
- Homologação do layout e vocabulário com usuários de secretaria/Compras, acessibilidade por teclado/leitor de tela e experiência móvel.

## Verificações e hardening executados nesta etapa

- O histórico live confirma dez migrações de Compras (onze entradas no total contando a migration anterior de modalidade); uma contagem confirmou um único tenant ativo. A migration 010 apenas deriva `processo_id` das versões a partir do artefato pai e adiciona índices/constraints; as nove novas constraints aparecem `convalidated=true`. Nenhum saldo nem registro legado de ata/pedido foi alterado nesta rodada. A ausência de tenant de homologação impede demonstrar isolamento cross-tenant.
- A função `compras_concluir_etapa(uuid)` existe no projeto Supabase, é `SECURITY INVOKER` e tem `EXECUTE` concedido ao papel `authenticated`; sua execução real com perfis e dados de teste ainda precisa ser validada.
- `compras_registrar_regra_versao(...)` foi aplicada e verificada como `SECURITY INVOKER`, com `search_path` fixo, `EXECUTE` para `authenticated` e sem `EXECUTE` para `anon`. A gravação segue as policies RLS e usa trava transacional por tenant/chave.
- Nas quatro tabelas de artefatos/versões/decisões/regras, o catálogo live confirma RLS ligada, duas policies por tabela (SELECT/INSERT) e grants somente SELECT/INSERT para `authenticated`, sem grants para `anon`/`PUBLIC`. Essa checagem é estática e não substitui testes de requisição real.
- Catálogo live confirma RLS habilitado nas 22 tabelas do schema de Compras e do núcleo multi-tenant.
- `app_tenant_memberships.user_id` é `integer`, coerente com o `id` legado retornado por `initLayout` (o módulo não compara o UUID bruto do Supabase Auth).
- O banco tem **um tenant ativo**; a ausência de um segundo tenant impede demonstrar o isolamento cross-tenant, embora as tabelas novas estejam tenant-scoped.
- Advisor de performance pós-migration 010 reporta 36 FKs sem índice, mas zero em tabelas `compras_*`; as novas relações compostas estão cobertas. Reporta também 16 pares de policies permissivas de SELECT no módulo e vários índices sem tráfego observado; não removi policies nem índices sem teste de autorização ou carga representativa. Guia: [advisor de FKs sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Advisor de segurança reporta seis tabelas legadas com RLS sem policy, 18 funções legadas com `search_path` mutável, duas funções `SECURITY DEFINER` acessíveis a `authenticated` e proteção de senha vazada desativada. `compras_gerar_ata` permanece `SECURITY DEFINER`, com `search_path=pg_catalog`, sessão, tenant, papel de gestão, processo homologado, fornecedor vencedor e itens/preços conferidos; o finding foi mantido para revisão porque não houve teste E2E de autorização e a RPC pode criar registros financeiros. `fn_is_admin()` e as demais funções/policies legadas não foram alteradas. Guias: [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path mutável](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [SECURITY DEFINER exposta](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [proteção de senha](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- `node --check` passou para `compras.js` e `area.js`; `py_compile` passou para `scripts/audit-intranet-static.py`. Smoke HTTP local retornou 200 para as seis páginas de Compras, CSS e scripts.
- O script reproduzível `scripts/audit-intranet-static.py` varreu 61 páginas HTML ativas, 21 CSS, 60 JS, 10 migrations e 443 referências estáticas; identificou 27 referências quebradas em páginas antigas/legadas (7 em Controle de Saldos, 17 em Atos Oficiais e 3 em core); a imagem `brasao-pref.png` foi restaurada da raiz do Drive e a home não tem mais esse erro, 24 paths absolutos root-relative e nenhuma divergência de maiúsculas/minúsculas. Compras não apresentou referência quebrada nem atalho direto para outro módulo. O auditor sai com status 1 devido aos achados legados; veja `docs/auditoria-intranet-local.json`. O scan de CSS encontrou cinco candidatos sem referência literal em HTML; nenhum foi removido, pois isso não prova ausência de carregamento dinâmico.
- Os dois Termos e as duas notas da raiz do Drive foram baixados temporariamente, extraídos e conferidos por SHA-256; os hashes, contagens e a distinção entre termo institucional, prompt e notas de protótipo estão em `docs/auditoria-requisitos-1-10.md`.
- Não foi executado e2e autenticado contra o app nem teste negativo entre dois tenants; portanto, não afirmar que o uso real ou o isolamento cross-tenant foram homologados.
- O roteiro de rollback da migration 010 foi criado em `supabase/rollbacks/`; não foi ensaiado. Executá-lo exige janela de manutenção e backup/restauração previamente verificados.

## Limpeza de arquivos

A inspeção anterior encontrou CSS sem referências literais, mas isso sozinho não prova obsolescência. Nesta etapa nenhum arquivo CSS, HTML, JS ou dado de negócio foi removido. A remoção só deve ocorrer com rastreamento de rotas, imports dinâmicos e cópia recuperável.

## Arquivo privado de revisão financeira

Os seis casos não devem ser incluídos em commit público, build do GitHub Pages ou pacote de código. O CSV e a auditoria original foram isolados em `private-review-saldos/` no workspace e armazenados separadamente no Drive, dentro de `controle-de-saldos/revisao-de-saldos-privado`. Nenhum valor desses casos foi gravado novamente no banco.

## Migration 011 — operação interna incremental

A migration `20261001001100-compras-operacao-interna.sql` foi aplicada ao projeto Supabase `gestao-atas-pitangueiras` em 1º de outubro de 2026, após validação local. Ela é aditiva e cria as estruturas `compras_favoritos`, `compras_acessos_recentes`, `compras_notificacoes`, `compras_documento_versoes` e `compras_execucoes_contratuais`, com índices, RLS, grants restritos e auditoria para versões de documentos e execução contratual. O rollback correspondente está em `supabase/rollbacks/rollback-20261001001100-compras-operacao-interna.sql` e não foi executado.

A interface ainda precisa ser ligada a essas estruturas. A migration não cria integrações externas, não altera saldos/atas legados e não copia dados privados.


## Fase 2 — operação assistida

A migration `20261001001200-compras-notificacoes-automaticas.sql` foi aplicada ao projeto Supabase principal após validação local. Ela cria a função protegida `public.compras_notificar_atribuicao()` e triggers de inserção para `compras_tarefas` e `compras_obrigacoes`, gerando notificações internas para o responsável atribuído. A função usa `SECURITY DEFINER`, `search_path` fixo e não realiza comunicação externa.

O frontend de `compras/compras.js` agora carrega e marca notificações do próprio usuário como lidas, cria a versão 1 de documentos novos em `compras_documento_versoes` e grava novos registros de execução em `compras_execucoes_contratuais`, preservando a leitura dos eventos legados em `compras_contrato_eventos`. A validação ainda é estática/local; E2E autenticado, cross-tenant, upload real e aceite institucional permanecem pendentes.


## Fase 3 — calendário e prazos úteis

A migration `20261001001300-compras-calendario-prazos.sql` foi aplicada ao Supabase principal. A função `compras_calcular_prazo_dias_uteis(uuid,date,integer)` consulta os feriados do tenant e ignora finais de semana. Ao materializar etapas de um novo processo a partir de um fluxo, o frontend usa essa RPC para preencher `compras_processos_etapas.prazo`. Processos e etapas existentes não são recalculados retroativamente. Ainda falta CRUD visual de feriados e editor completo de fluxos/subetapas.


## Fase 4 — calendário municipal e subetapas de fluxo

A migration `20261001001400-compras-subetapas.sql` foi aplicada. A aba Configuração do módulo permite a gestores adicionar/remover feriados do tenant e cadastrar subetapas em etapas de versões publicadas. A tabela `compras_fluxo_subetapas` tem RLS e políticas separadas de leitura e gestão. A entrega não reescreve processos existentes e não declara que o editor de fluxos esteja completo: ainda faltam edição/exclusão, transições, publicação de versões, subetapas materializadas no processo e testes E2E.


## Fase 5 — editor completo de fluxos e materialização

A migration `20261001001500-compras-subetapas-operacionais.sql` criou a tabela operacional `compras_processos_subetapas`, protegida por RLS. O editor de configuração permite criar fluxos, criar/clonar versões, editar ou excluir etapas e subetapas de rascunhos e publicar versões. Ao abrir um novo processo com uma versão publicada, o frontend copia etapas e subetapas para o processo e calcula seus prazos usando a RPC de dias úteis. Versões publicadas não são editadas e processos existentes não são reescritos. O pacote ainda requer E2E autenticado, testes de rollback e validação municipal antes de produção.


## Fase 6 — contrato de testes e preparação E2E

Foi criado `scripts/test-compras-flow-editor.py` para validação local e somente leitura do editor de fluxos e da materialização de subetapas. O contrato passou e o JavaScript passou no parser do Node. O smoke browser com Chromium confirmou resposta HTTP e carregamento da página base. O E2E autenticado, o teste negativo cross-tenant e backup/rollback permanecem condicionados à disponibilidade de staging autorizado; não foram usados dados de produção para fixtures.
