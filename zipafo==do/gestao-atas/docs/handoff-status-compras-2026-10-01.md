# Handoff técnico — Intranet / Gestão de Compras Públicas

**Data do estado:** 1º de outubro de 2026
**Finalidade:** permitir que outro agente continue a implementação e a validação sem reaplicar migrations, presumir aceite ou alterar módulos fora do escopo.

> **Estado geral:** há um protótipo operacional incremental de Compras conectado ao Supabase. A base de Compras está tenant-scoped e as dez migrations do módulo estão aplicadas, mas **os requisitos 1–10 continuam parciais**. Não declarar 100% de conformidade com o Termo, prontidão SaaS ou aceite de produção.

## 1. Projeto, escopo e fontes

- Cópia de trabalho atual: `/home/ubuntu/intranet-audit/intranet-source`. Se o agente estiver em outro dispositivo/ambiente, redescobrir o workspace e usar a pasta autorizada do Google Drive em vez de presumir que este caminho existe.
- Google Drive: pasta raiz [Intranet](https://drive.google.com/drive/folders/1TrYuFmqXf1avrGcKHdIq6Gvj3S72lDLy); nela estão `compras/`, `docs/`, `supabase/migrations/`, `supabase/rollbacks/` e `scripts/`.
- Termo de Compras: `termo-de-referencia-modulo-gestao-compras-publicas.docx`; Termo da Biblioteca: `termo-de-referencia-modulo-gestao-biblioteca-municipal.docx`. Os documentos foram baixados, extraídos e tiveram SHA-256 verificado. Os IDs, hashes e contagens de extração estão em `docs/auditoria-requisitos-1-10.md` e a proveniência em `docs/auditoria-termos-drive.md`.
- Projeto Supabase observado: `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`). O histórico live deve ser consultado antes de qualquer DDL; não reaplicar migrations já registradas.
- Restrições do usuário: manter identidade slate/moss; UX direta para servidores não técnicos; preservar Biblioteca e os benefícios dos secretários (consulta de saldos/atas, carrinho, pedidos e entregas fracionadas); não alterar outros módulos sem necessidade/autorização específica; não expor os seis casos financeiros de revisão em build público ou pacote.

## 2. O que já foi implementado

### Compras — interface e fluxo atual

Existem dez arquivos no diretório `compras/` e seis rotas HTML autenticadas, usando o shell/sessão existentes:

1. `compras/index.html` — painel/processos e navegação interna;
2. `compras/artefatos.html` — artefatos e versões;
3. `compras/decisoes.html` — decisões/atos append-only;
4. `compras/governanca.html` — fontes/regras e parâmetros versionados;
5. `compras/auditoria.html` — trilha de auditoria;
6. `compras/processo.html` — ficha dedicada do processo.

O usuário volta à Intranet para escolher Biblioteca ou Controle de Saldos; a sidebar de Compras não oferece atalhos diretos para outros módulos. Foram acrescentadas guards de perfil na interface e proteção contra respostas assíncronas antigas substituírem o processo selecionado. Ocultar botões **não** substitui autorização/RLS no servidor.

Funcionalidades existentes no protótipo incluem demandas, PCA, cadastro/acompanhamento de processos, itens/fornecedores, tarefas/etapas, registro manual de publicações, documentos privados/metadados, contratos com histórico básico, obrigações/agenda simples, pesquisa de preços descritiva e exportação CSV. A RPC transacional de processo homologado para ata também existe. A publicação manual **não** transmite para PNCP/TCE-PR.

### Supabase

- Dez migrations de Compras, `20261001000100` a `20261001001000`, estão aplicadas e versionadas localmente; o histórico live registrou 11 entradas no total incluindo a migration legada `add_modalidade_to_atas`.
- A migration 010 (`20261001001000-compras-same-process-integrity.sql`) está aplicada como `compras_same_process_integrity` no histórico live. Nove constraints/checks aparecem validadas no catálogo; relações entre processos, etapas, documentos, artefatos, decisões e atas recebem checagens de tenant/processo. O trigger derivador usa `SECURITY INVOKER` e `search_path=pg_catalog`.
- A RPC de conclusão de etapa e as RPCs de registro de artefatos/regras foram inspecionadas como `SECURITY INVOKER`, grants para `authenticated` e sem execução para `anon` (conforme registrado na auditoria). `compras_gerar_ata` é `SECURITY DEFINER`, com `search_path=pg_catalog`; seu teste E2E de autorização continua pendente.
- RLS foi observada habilitada em 22 tabelas de Compras/núcleo multi-tenant. Quatro tabelas novas de artefatos/versões/decisões/regras têm grants/policies examinadas. Foi confirmado **um único tenant ativo**, portanto não há prova de isolamento entre dois tenants.
- Roteiro de contingência criado em `supabase/rollbacks/rollback-20261001001000-compras-same-process-integrity.sql`; **não executar/ensaiar sem backup verificado e janela aprovada**.

### Preservação de legado e auditorias

- Biblioteca e fluxos de Gestão de Atas/Controle de Saldos não foram reescritos nesta rodada. As correções financeiras anteriores (521 saldos e 96 modalidades) permanecem; seis exceções continuam reservadas para revisão manual.
- Auditor reproduzível criado em `scripts/audit-intranet-static.py`, com snapshot `docs/auditoria-intranet-local.json`: 61 páginas HTML ativas, 21 CSS, 60 JS, dez arquivos de migration e 443 referências estáticas.
- Scan: zero divergências de maiúsculas/minúsculas e zero referências estáticas quebradas dentro de `compras/`; 27 referências quebradas fora de Compras e 24 caminhos root-relative ainda são achados. O auditor retorna exit code 1 por causa desses achados legados. Não alterar esses módulos sem considerar o limite de escopo e os testes de regressão.
- Cinco CSS sem referência literal foram identificados como candidatos; **nenhum foi apagado**, pois isso não prova ausência de carregamento dinâmico.

## 3. Verificações já executadas

- `node --input-type=module --check` passou para `compras/compras.js` e `compras/area.js`; `py_compile` passou para o auditor Python.
- Smoke test final no servidor estático local retornou HTTP 200 para 11 rotas/assets: seis HTML de Compras, CSS/JS de Compras e `shared/js/layout.js` + `shared/js/supabase.js`.
- O pacote ZIP foi validado, contém 30 entradas, dez migrations e o rollback; não contém `private-review-saldos/` nem outros módulos legados.
- Foram sincronizados 29 arquivos ao Drive (Compras completa, migrations, rollback, auditoria/docs, script, plano e ZIP). Os 29 foram verificados por SHA-256, exceto o JSON, comparado estruturalmente porque a CLI o reserializa; o relatório de auditoria e o ZIP foram atualizados depois e ambos tiveram SHA-256 conferido novamente.
- Isso **não** prova autenticação funcional, isolamento RLS em requests, integração externa, deploy GitHub Pages, backup/restauração, rollback ou ausência de regressões de negócio.

## 4. Estado exato dos requisitos solicitados (1–10)

| Requisito | Estado | Falta para aceite |
|---|---|---|
| **1–3 — ciclo, integração, telas/áreas** | Parcial. Demandas/processos, rotas de artefatos/decisões/governança/auditoria e ficha de processo foram implementados; há integração controlada processo→ata. | Completar e testar o ciclo licitação/contratação direta até decisão, adjudicação/homologação, execução, encerramento e relatórios. Propostas/recursos, publicação externa, busca global, notificações persistentes e execução contratual estruturada faltam ou são parciais. |
| **4 — compatibilidade, publicação, rollback e regressão** | Parcial. Smoke local HTTP e scan estático realizados; pacote verificável. | Deploy de teste no GitHub Pages sob subdiretório real, CI, revisão completa de caminhos, plano e ensaio de rollback, backup/restauração e regressão representativa. Não consertar os 27 erros fora de Compras sem autorização e plano de regressão. |
| **5 — configuração, versionamento, decisões, regra legal x interna** | Parcial. Artefatos/revisões e decisões append-only; fonte é classificada como norma, procedimento interno ou parâmetro; versionamento atômico de regras. | Validar conteúdo municipal, fontes oficiais, autoridades/aprovadores e fluxo de revisão. Não inferir regra jurídica nem tratar configuração como parecer legal. |
| **6 — auditoria reproduzível da Intranet** | Parcial, com script e snapshot. | Revisão manual de findings, rotas dinâmicas, dependências/runtime e ambiente publicado; documentar resolução ou exceções. |
| **7 — documentos do Drive e fundamentação** | Proveniência/hash de quatro fontes selecionadas concluída; Termos e notas classificados corretamente. | Mapear as 104 seções/itens do Termo de Compras aos 103 requisitos numerados, telas, tabelas, policies e testes; inventariar outras fontes normativas citadas e validar legislação com responsáveis. Não alegar auditoria de todo Drive. |
| **8 — Supabase, permissões e isolamento** | Parcial. Histórico/migrations, RLS, grants selecionados, RPCs e advisors inspecionados; um tenant ativo. | Inventário completo de grants de tabelas/views/functions, Storage/Auth; requests positivos/negativos autenticados, perfis diferentes e teste cross-tenant com fixture/tenant de homologação. Revisar findings do advisor antes de remediar. |
| **9 — regressão, backup e rollback dos módulos** | Não aceito. Roteiro de rollback da migration 010 preparado; nenhuma regressão de dados legados feita nesta rodada. | Backup e restauração verificados; rollback ensaiado em staging; regressão de Biblioteca, Atas/saldos, carrinho e entregas fracionadas com resultado registrado. Não tocar os seis casos financeiros reservados. |
| **10 — separar telas/áreas operacionais** | Parcial, com seis rotas e ficha dedicada. | Separar ainda editor de fluxo, pesquisa/aprovação, fornecedores/propostas, execução, relatórios e configurações; testar experiência responsiva/acessibilidade com servidores municipais. |

## 5. Pendências funcionais do Termo de Compras

Priorizar em ambiente de homologação, não com processos municipais reais:

1. Formulários/modelos completos e revisáveis de ETP, TR, edital, pareceres, atas de sessão e decisões, com aprovação e histórico.
2. Pesquisa de preços com metodologia, cálculos, memória, critérios explicáveis e aprovação; manter decisão de referência sob autoridade humana.
3. Fluxos configuráveis por fases/subetapas, responsáveis, aprovações, calendário, dias úteis/feriados, alertas e notificações persistentes.
4. Participantes, propostas, julgamento, recursos e respectivos prazos/registros.
5. Adaptadores PNCP, TCE-PR/SIM-AM e publicação municipal, com autenticação, validação de campos, recibos, falhas/reenvio e auditoria. Até lá, a publicação continua manual.
6. Execução de contratos: medições/atestos estruturados, entregas, liquidação/pagamento, aditivos, reajustes, ocorrências, sanções e encerramento.
7. Relatórios completos e filtros rastreáveis; testar CSV no Excel/LibreOffice.
8. Fluxo de aquisição de acervo da Biblioteca conectado a Compras, somente após definir identificadores/perfis e plano de regressão da Biblioteca.

## 6. Achados Supabase que precisam de decisão/revisão

Advisor de segurança (coleta 2026-10-01): seis tabelas legadas com RLS sem policy (`anexos_atos`, `configuracoes_atos`, `perfis`, `permissoes`, `permissoes_modulos`, `versoes_atos`); 18 funções legadas com `search_path` mutável; duas `SECURITY DEFINER` acessíveis a `authenticated` (`compras_gerar_ata(...)` e `fn_is_admin()`); proteção de senha vazada desativada. Advisor de performance: 16 pares de policies permissivas de SELECT em Compras e findings legados; zero FK sem índice em tabelas `compras_*` após migration 010.

Não remover policies nem reescrever funções em lote só para limpar o advisor. Primeiro ler definição/grants, estabelecer comportamento esperado, testar em staging e confirmar impactos com o responsável. A auditoria completa de permissões, Auth e Storage segue pendente.

## 7. Próxima sequência recomendada para o agente sucessor

1. **Redescobrir o workspace e conferir baseline:** verificar que está na cópia correta; ler este handoff, `docs/matriz-atendimento-compras.md`, `docs/implantacao-compras.md`, `docs/auditoria-requisitos-1-10.md` e `compras/readme.md`. Consultar `list_migrations`; não reaplicar 001–010.
2. **Preparar staging de forma autorizada:** obter contas de teste para ADMIN/gestão/SECRETARIO e dois tenants sem dados reais. Não reutilizar ou expor credenciais de produção. Se staging/usuários não existirem, documentar como bloqueio e solicitar os dados/autoridade necessários.
3. **Construir plano e executar E2E:** login, navegação direta, RLS positivo/negativo, edição por papel, upload/download privado, demanda→processo→artefato/decisão→homologação→RPC de ata em fixture, falhas e concorrência. Remover fixture depois de validação segura.
4. **Completar primeiro os gaps funcionais de maior risco:** templates/versões/aprovação, propostas/recursos, execução contratual e adaptadores externos em sandbox. Não afirmar integração real enquanto não houver recibo/API testada.
5. **Fechar auditoria de banco:** grants completos, Storage/Auth, policies/functions findings; corrigir apenas após teste. Criar prova cross-tenant com duas contas/tenants autorizados.
6. **Executar backup, restore e rollback em staging**, depois regressão de Biblioteca/Atas/saldos/carrinho/entregas e assinatura do resultado. Não ensaiar rollback na produção.
7. **Publicação:** testar build/path/case no subdiretório que será usado no GitHub Pages, incorporar CI e plano de reversão; não publicar publicamente antes de autorização e aceite.
8. **Atualizar matriz/handoff e sincronizar Drive** com hashes após cada entrega; marcar cada requisito como concluído somente com evidência repetível e aceite pertinente.

## 8. Guardrails

- Nenhuma chave `service_role`, senha ou token no frontend, documentação, ZIP ou Drive público. Não incluir credenciais desta conversa no handoff.
- Não rodar processos financeiros reais para testar. Não alterar atas/saldos legados nem os seis casos de revisão.
- Não copiar `private-review-saldos/` para GitHub Pages, ZIP público ou pasta pública.
- Não eliminar CSS/arquivos por falta de referência literal apenas.
- Não tratar `SECRETARIO` como autorizado a homologar/criar ata; backend/RLS e RPC são autoridade final.
- Respeitar o escopo de Compras e as alterações autorizadas de Intranet/Controle de Saldos; preservar Biblioteca e outros módulos até plano específico de integração/regressão.

## 9. Arquivos-chave

- Implementação: `compras/index.html`, `compras/compras.js`, `compras/area.js`, `compras/compras.css` e as cinco rotas auxiliares em `compras/`.
- Banco: `supabase/migrations/20261001000100-compras-foundation.sql` até `20261001001000-compras-same-process-integrity.sql`.
- Rollback não ensaiado: `supabase/rollbacks/rollback-20261001001000-compras-same-process-integrity.sql`.
- Matriz: `docs/matriz-atendimento-compras.md` (o adendo final supersede apenas os requisitos 1–10; outros requisitos da matriz ainda precisam de auditoria).
- Auditoria/implantação: `docs/auditoria-requisitos-1-10.md`, `docs/auditoria-termos-drive.md`, `docs/auditoria-intranet-local.json`, `docs/implantacao-compras.md`.
- Auditor estático: `scripts/audit-intranet-static.py`.
- Pacote incremental: `/home/ubuntu/intranet-audit/compras-publicas-intranet-release.zip`; ZIP para atualizar uma cópia existente, não é site autônomo nem dump/backup.


## 10. Atualização consolidada — continuação em 1º de outubro de 2026

Esta seção supersede as contagens e afirmações anteriores deste handoff quando houver conflito.

### Estado live atual

As migrations de Compras aplicadas ao projeto `gestao-atas-pitangueiras` são as entradas até `compras_notificacoes_automaticas` e, nesta continuação, `compras_calendario_prazos`. Em termos de arquivos locais, o conjunto inclui as migrations `20261001000100` até `20261001001300`, além da migration legada `add_modalidade_to_atas`. Não reaplicar nenhuma migration já registrada; consultar `list_migrations` antes de DDL.

A migration 011 criou favoritos, acessos recentes, notificações, versões de documentos e execução contratual estruturada. A migration 012 criou a função protegida de notificação por atribuição e triggers de inserção em tarefas/obrigações. A migration 013 criou `compras_calcular_prazo_dias_uteis(uuid,date,integer)`, `SECURITY INVOKER`, com `search_path` fixo, execução apenas por `authenticated` e consulta aos feriados do tenant.

### Interface atualizada

`compras/compras.js` carrega notificações não lidas do usuário, exibe-as no painel de atenção e permite marcar como lidas. Cada documento novo cria a versão 1 em `compras_documento_versoes`. A ficha de contrato combina o histórico legado com `compras_execucoes_contratuais`, e novos eventos usam tipos estruturados. Ao criar um processo a partir de um fluxo, os `prazo_dias` configurados são convertidos em datas úteis pela RPC, pulando finais de semana e registros de `compras_feriados`.

### Fases ainda pendentes

As pendências continuam relevantes e não há declaração de conformidade integral. Permanecem: editor de fluxos/subetapas e CRUD de feriados; formulários completos e aprovação de ETP/TR/edital/pareceres/atas de sessão; propostas, julgamento e recursos; medições/atestos/entregas/liquidação/pagamento/aditivos/reajustes/sanções/encerramento completos; relatórios rastreáveis e filtros; integrações PNCP/TCE-PR/publicação externa; integração Biblioteca→Compras; E2E autenticado e isolamento cross-tenant; auditoria completa de grants/Storage/Auth; backup/restore e rollback ensaiados em staging; regressão dos módulos legados; publicação GitHub Pages/CI; acessibilidade, revisão municipal e operação.

As integrações externas permanecem deliberadamente fora do escopo desta autorização. Nenhuma credencial, dado real financeiro ou material de `private-review-saldos/` deve ser incluído no build/ZIP público.

### Sequência autorizada para o próximo agente

1. Revalidar histórico live e árvore do Drive antes de DDL.
2. Continuar com editor de calendário/feriados e editor de fluxos somente em dados tenant-scoped, preferindo migrations aditivas e rollback local.
3. Completar execução contratual interna antes de qualquer adaptador externo.
4. Criar fixtures e testes autenticados somente em staging autorizado; não usar processos, contas ou saldos municipais reais para teste destrutivo.
5. Atualizar este handoff, a matriz e a documentação de implantação após cada pacote e sincronizar a pasta `INTRANET` do Drive.


## 11. Atualização consolidada — fase 4: calendário e subetapas

A migration `20261001001400-compras-subetapas.sql` foi aplicada ao projeto `gestao-atas-pitangueiras`. Ela criou `compras_fluxo_subetapas`, com tenant, etapa-pai, ordem, código, descrição, prazo em dias úteis, responsável padrão, dependências e documentos obrigatórios. A tabela possui RLS habilitada, leitura para usuários com acesso ao tenant e gestão somente para `tenant_admin`/`compras_manager`. Não altera processos já iniciados.

A aba **Configuração** de `compras/index.html` e `compras/compras.js` agora permite, para gestores, cadastrar/remover feriados em `compras_feriados` e adicionar subetapas às etapas de versões publicadas. O cálculo de prazos da fase anterior já considera os feriados cadastrados. O editor ainda é incremental: não possui edição/exclusão de subetapas, publicação de novas versões de fluxo, transições condicionais, CRUD completo de etapas ou materialização de subetapas em processos já existentes.

Validações da fase 4: `node --check compras/compras.js`, checks estruturais, smoke HTTP das rotas principais e confirmação live de `compras_fluxo_subetapas` com RLS habilitada. A migration 014 foi registrada no histórico live e o arquivo foi sincronizado na pasta `INTRANET` do Drive.

As integrações externas permanecem fora do escopo. Continuam pendentes E2E autenticado, isolamento cross-tenant, editor completo de fluxos, execução contratual completa, backup/restore/rollback em staging, regressão dos módulos legados, CI/publicação e aceite municipal.


## 12. Atualização consolidada — fase 5: editor completo e materialização

A migration `20261001001500-compras-subetapas-operacionais.sql` foi aplicada e registrada no Supabase (`compras_subetapas_operacionais`). Ela criou `compras_processos_subetapas`, com snapshot tenant-scoped das subetapas, vínculo à etapa/processo, ordem, prazo, dependências, documentos, responsável e status operacional. A tabela possui RLS, índices e políticas de leitura/gestão. Processos existentes não são reescritos.

O editor de fluxos agora permite, para gestores:

- criar um fluxo e sua primeira versão em rascunho;
- criar uma nova versão a partir de uma versão existente;
- editar e excluir etapas de rascunhos;
- adicionar, editar e excluir subetapas de rascunhos;
- informar ordem, código, descrição, prazo em dias úteis e responsável padrão;
- publicar uma versão com etapas;
- arquivar a versão publicada anterior do mesmo fluxo;
- iniciar processos futuros usando somente a versão publicada;
- materializar as subetapas como registros operacionais ao criar o processo;
- visualizar e concluir subetapas na ficha do processo.

A publicação é versionada: versões publicadas não são editadas diretamente e processos já existentes continuam com seus snapshots. A criação de processo calcula prazos de etapas e subetapas pela RPC de dias úteis, respeitando os feriados do tenant.

Validações da fase 5: `node --check compras/compras.js`, checks estruturais, smoke HTTP das rotas principais, confirmação live das migrations e confirmação live de RLS habilitada em `compras_fluxo_subetapas` e `compras_processos_subetapas`.

Limitações remanescentes: transições condicionais ainda são apenas configuração, não há editor visual de dependências avançadas; a materialização ocorre para novos processos e não migra processos antigos; ainda faltam testes E2E autenticados/cross-tenant, staging com backup/restore/rollback, regressão dos módulos legados, execução contratual completa, integrações externas, CI/publicação e aceite municipal.


## 13. Atualização consolidada — fase 6: contrato de testes e preparação E2E

Foi criado `scripts/test-compras-flow-editor.py`, um teste local e somente leitura que verifica o contrato do editor: criação de fluxos, clonagem de versões, edição/publicação, materialização de subetapas, RPC de dias úteis, ações da interface, RLS e integridade das migrations. O teste passou (`compras_flow_editor_contract=passed`). Também foi executado `node --check compras/compras.js` com sucesso.

O smoke browser local com Chromium confirmou que a rota HTML responde e que o documento base carrega. O E2E autenticado não foi executado porque ele exige uma sessão autenticada e um staging autorizado; não foram criados fixtures nem inseridos dados em produção.

O auditor estático geral continua retornando exit 1 por 25 referências quebradas fora do módulo de Compras, concentradas em páginas legadas de Controle de Saldos, Gestão de Atos Oficiais e CSS legado. Não há referências quebradas apontadas dentro das páginas de Compras nesta execução e `direct_cross_module_links_in_compras_pages` permaneceu vazio. Esses achados foram registrados como pendência de regressão legada, não como falha introduzida pelo editor.

Próximo passo condicionado: executar E2E autenticado e testes negativos cross-tenant em staging autorizado, com backup, rollback e fixtures descartáveis. Sem staging, a evidência atual é de contrato estático, smoke browser e validação live de catálogo/RLS, não de aceite funcional completo.


## 14. Ambiente de homologação criado — 1º de outubro de 2026

A criação de uma branch no projeto principal foi recusada pelo provedor porque branching exige plano Pro ou superior. Como alternativa autorizada, foi criado o projeto Supabase separado `homologacao-compras-2026-10-01`, ref `xnktywrdoqlacwmdemfp`, na região `sa-east-1`. O custo estimado informado pelo provedor é **US$ 0/mês**.

O staging não recebeu dados de produção. Foram instalados somente um bootstrap legado mínimo, um schema de teste autocontido de Compras, o cálculo de dias úteis, a tabela de subetapas configuráveis, a tabela operacional de subetapas e policies/RLS para o editor e processos. As tabelas centrais `compras_fluxos`, `compras_fluxo_versoes`, `compras_fluxo_etapas`, `compras_fluxo_subetapas`, `compras_processos`, `compras_processos_subetapas` e `compras_feriados` foram confirmadas com RLS habilitada.

O ambiente ainda não possui usuário autenticado de teste nem fixtures funcionais. O E2E autenticado e o teste cross-tenant continuam pendentes até a criação segura de usuários Auth de teste no próprio staging. Nenhuma senha, chave privada ou credencial foi registrada no Drive ou neste handoff.

Migrations do staging: `staging_legacy_bootstrap`, `staging_compras_schema`, `compras_calendario_prazos`, `compras_subetapas`, `compras_subetapas_operacionais` e `staging_compras_rls`.


## 15. Resultados de staging e próxima fase — 1º de outubro de 2026

O staging recebeu fixtures descartáveis para o tenant `fixture-tenant-a`, com um fluxo publicado, uma etapa, uma subetapa e um processo `FIXTURE-001`. A consulta live confirmou a cadeia `versão publicada → etapa → subetapa operacional`, com status inicial `pendente`. A RPC de dias úteis também foi validada: para 3 dias úteis a partir de 01/10/2026, retornou 06/10/2026.

Foi tentada a criação de contas Auth sintéticas no próprio staging, sem credenciais reais. O provedor recusou o signup com `email rate limit exceeded`; nenhuma conta foi criada e nenhum token foi registrado. Por isso, os resultados atuais comprovam schema, RLS, fixture, publicação, materialização e cálculo de prazo, mas ainda não comprovam uma sessão autenticada no navegador nem o teste negativo cross-tenant via Auth.

A fixture é exclusiva do staging e pode ser removida por migration de limpeza quando o E2E autenticado estiver concluído. O próximo passo é repetir a criação de usuários quando o limite de email for liberado ou usar um mecanismo administrativo autorizado do próprio projeto, sem inserir credenciais no Drive.


## 16. Validação de isolamento no staging — 1º de outubro de 2026

Como o signup Auth permaneceu temporariamente limitado por email, foram criadas duas identidades sintéticas apenas no banco de homologação, com UUIDs fixos de fixture e memberships separadas: gestor A no `fixture-tenant-a` e gestor B no `fixture-tenant-b`. Não foram criados usuários reais nem credenciais reutilizáveis.

Foi configurado um harness de claims JWT para executar consultas sob a role `authenticated`. O resultado foi positivo para isolamento: a identidade A visualizou 1 processo e 1 fluxo do staging; a identidade B visualizou 0 processos. A política não permitiu que B enxergasse o processo de A. A evidência é uma simulação SQL de RLS com claims sintéticas, não um login browser real; portanto o E2E completo ainda depende de uma conta Auth válida.

Também foi corrigido o harness de staging para expor as memberships de teste e validar a policy diretamente por tenant. A correção está restrita ao projeto separado de homologação e não altera o banco de produção.


## 17. Preparação da próxima fase — rollback e E2E reproduzível

Foram criados três artefatos locais e prontos para sincronização: `supabase/rollbacks/rollback-staging-compras-fixtures.sql`, `scripts/staging-rls-checks.sql` e `docs/e2e-compras-staging-checklist-2026-10-01.md`. O rollback remove somente tenants, usuários sintéticos, memberships, fluxos, versões, etapas, processos e subetapas identificados como fixtures; não deve ser executado na produção.

O roteiro SQL repete os checks de visibilidade sob claims sintéticas e role `authenticated`, sempre em transações com rollback. O checklist E2E detalha criação/publicação de fluxo, materialização, conclusão operacional, feriado, teste negativo cross-tenant e fechamento com limpeza.

A pendência técnica restante é a sessão Auth real no navegador. O signup continua bloqueado pelo limite de email do projeto; por isso não foram inventados resultados de E2E browser. O ambiente e os artefatos estão prontos para execução assim que houver uma conta Auth de teste válida.


## 18. E2E autenticado transacional — 1º de outubro de 2026

O E2E autenticado no nível do banco foi executado no staging sob a role `authenticated`, usando claims JWT sintéticas do gestor A e rollback integral. O fluxo passou por criação de fluxo, criação de versão em rascunho, criação de etapa, criação de subetapa, publicação da versão, criação de processo, criação da etapa operacional e materialização da subetapa operacional. O resultado foi 1 registro criado em cada fase. Em uma segunda transação, a subetapa `FIXTURE-001` foi marcada como `concluida` e registrou `concluida_por`, também com rollback.

Esse resultado valida o caminho autenticado das policies e do banco, mas não deve ser chamado de E2E browser: o signup Auth continua retornando `email rate limit exceeded`, portanto não houve login real nem interação de navegador. O roteiro reproduzível foi salvo em `scripts/e2e-compras-authenticated.sql`. A única pendência de execução imediata é repetir o mesmo fluxo pela interface com uma conta Auth válida.


## 19. Backup lógico e ensaio de rollback — 1º de outubro de 2026

Foi capturado um manifesto lógico do staging com 1 fluxo, 1 versão, 1 etapa, 1 subetapa configurável, 1 processo e 1 subetapa operacional nas fixtures. O rollback foi ensaiado em uma transação na ordem de dependências: durante a transação, tenants, fluxos e subetapas operacionais chegaram a zero; em seguida foi executado `ROLLBACK`. Uma consulta independente confirmou a restauração de 2 tenants, 1 fluxo e 1 subetapa operacional.

O resultado comprova o rollback lógico sem apagar as fixtures. O backup físico gerenciado e o restore integral do projeto ainda não foram executados porque o conector disponível não expõe uma operação de exportação/restauração física neste fluxo. O manifesto foi salvo em `docs/backup-restore-staging-2026-10-01.md`.


## 20. Evolução do módulo de Atas, Saldos e Pedidos — 1º de outubro de 2026

Foi aplicada uma melhoria interna de produto no módulo anteriormente apresentado como “Gestão de Atas”. A apresentação agora usa o nome **Atas, Saldos e Pedidos**, que representa melhor o uso pelos secretários e demais usuários.

O dashboard passou a orientar cada perfil com uma mensagem contextual. O KPI de saldo foi refinado para diferenciar saldo físico, valor reservado em pedidos aguardando aprovação e saldo utilizável. A fila de aprovação passou a exibir órgão solicitante, fornecedor, valor e idade do pedido, permitindo priorização mais clara.

A alteração não exigiu migration nem alteração de dados no Supabase: foram reutilizados os campos existentes de `pedidos`, `consumos` e `itens_ata`. A validação sintática dos quatro módulos JavaScript alterados foi concluída com sucesso. O próximo passo recomendado é a conferência browser por perfil no staging; integrações externas permanecem fora do escopo.

Documento detalhado: `docs/melhorias-atas-saldos-pedidos-2026-10-01.md`.

## 21. Aprovação atômica de pedidos no módulo Atas — 1º de outubro de 2026
Foi implementada e aplicada no projeto principal `gestao-atas-pitangueiras` a migration `20261001001600-atas-aprovacao-atomica.sql`, criando a RPC `public.compras_aprovar_pedido(integer)`. A RPC exige usuário autenticado com papel de gestão no tenant, bloqueia o pedido e os itens da ata com `FOR UPDATE`, valida saldo, cria os consumos, atualiza `saldo_quantidade`/`saldo_valor` e só então marca o pedido como aprovado. O fluxo é transacional e idempotente para pedido já aprovado; a função é `SECURITY INVOKER`, com execução para `authenticated` e sem execução para `anon`.

As aprovações individual e em lote do frontend foram migradas para a RPC; o navegador deixou de executar diretamente a sequência de consumo e redução de saldo. O contrato local `scripts/test-atas-atomic-approval.py` passou, e o catálogo live confirmou a função e os grants esperados. Nenhum pedido real foi aprovado durante a validação.

Artefatos: `supabase/migrations/20261001001600-atas-aprovacao-atomica.sql`, `supabase/rollbacks/rollback-20261001001600-atas-aprovacao-atomica.sql`, `scripts/test-atas-atomic-approval.py` e `docs/aprovacao-atomica-atas-2026-10-01.md`. A migração foi sincronizada no Google Drive.

Próxima evidência: fixture descartável no staging com usuário de gestão, tentativa concorrente, cenário de saldo insuficiente e limpeza/rollback. O E2E browser autenticado continua pendente até haver sessão Auth válida. Integrações externas e `private-review-saldos/` permanecem fora do escopo.

## 22. Tentativa de fixture atômica no staging — 1º de outubro de 2026
A fixture descartável recomendada para a RPC `compras_aprovar_pedido` não pôde ser executada com validade no projeto `homologacao-compras-2026-10-01` (`xnktywrdoqlacwmdemfp`). A inspeção do catálogo encontrou somente o schema de Compras/fluxos e a tabela legada `atas`; estão ausentes `itens_ata`, `pedidos`, `itens_pedido`, `consumos` e a própria RPC. O staging, portanto, não tem paridade estrutural com o módulo Atas, Saldos e Pedidos.

A execução foi interrompida antes de qualquer alteração. Não foram criadas tabelas parciais, não foram inseridos pedidos sintéticos e nenhum dado do staging ou da produção foi alterado. Criar um harness incompleto mascararia os riscos da RPC real. Pendência: preparar schema aditivo de Atas/RLS/funções auxiliares no staging ou usar outro ambiente de homologação com paridade; somente depois executar concorrência, saldo insuficiente, idempotência e rollback.

## 23. Paridade de Atas no staging e fixture atômica — 1º de outubro de 2026
Para desbloquear a validação da RPC, foi aplicada somente no projeto de homologação `xnktywrdoqlacwmdemfp` a migration `20261001001700-staging-atas-parity-atomic-approval.sql`. A migration é aditiva e autocontida: cria `itens_ata`, `pedidos`, `itens_pedido` e `consumos` com `tenant_id`, índices, RLS, grants e a RPC `public.compras_aprovar_pedido(integer)` como `SECURITY INVOKER`. Foi criado o rollback exclusivo `supabase/rollbacks/rollback-20261001001700-staging-atas-parity-atomic-approval.sql`; nenhum objeto de produção foi alterado.

A fixture sintética foi executada em uma única transação sob `authenticated` e revertida ao final. Passaram: leitura do próprio tenant, bloqueio cross-tenant, aprovação inicial, idempotência na segunda chamada, rejeição de saldo insuficiente (`23514`), decremento de saldo uma única vez e criação de um único consumo. A tentativa de aprovar pedido do tenant B pelo gestor A retornou pedido não encontrado sob RLS. Nenhum dado da fixture permaneceu no staging.

Limitação restante: a corrida real entre duas sessões ainda não foi simulada por falta de um executor de duas conexões concorrentes no conector SQL atual. A RPC mantém `FOR UPDATE` no pedido e no item da ata, e deve ser validada posteriormente com dois clientes simultâneos.

## 24. Auditoria canônica e acesso Admin-only — 1º de outubro de 2026
Foi aplicada no staging e no projeto principal a migration `20261001001800-auditoria-canonica-admin-only.sql`. A nova tabela `public.auditoria_eventos` registra alterações tenant-scoped críticas com entidade, operação, tenant, ator, UUID autenticado, horário, request id, IP/user-agent quando disponíveis, estado anterior/novo, campos alterados, metadados e hash SHA-256 encadeado. A view `public.auditoria_eventos_relatorio` fornece a mesma trilha para relatórios.

A tabela é append-only para usuários autenticados: não há grants de INSERT/UPDATE/DELETE e há trigger que bloqueia mutações. A RLS da tabela e da view permite leitura somente a `tenant_admin`, tratado neste projeto como Admin municipal. `compras_manager` e demais perfis não veem registros ou relatórios. As tabelas legadas `compras_eventos_auditoria`, `atas_historico` e `logs_operacoes` foram preservadas, mas tiveram sua leitura restringida a Admin quando existentes.

A interface `compras/auditoria.html` foi migrada para `auditoria_eventos_relatorio`, exibe campos alterados/hash e oculta a navegação para perfis não Admin. A validação no staging confirmou dois eventos de fixture, hashes SHA-256, campo alterado, ausência de grants de mutação e zero linhas para `compras_manager`; a transação foi revertida.

Esta entrega implementa controles técnicos de rastreabilidade, não certificação jurídica automática, assinatura digital qualificada, retenção legal ou cadeia de custódia. Permanecem pendentes: teste concorrente com duas conexões reais, E2E browser Auth, política municipal de retenção/exportação/preservação, logs do provedor Auth/Storage e backup físico/restore. Documentação: `docs/auditoria-governanca-2026-10-01.md`.

## 25. Gestão de Trabalho, Tarefas, Demandas, Projetos e Agenda — 1º de outubro de 2026
Foi analisado o novo Termo de Referência `termo-de-referencia-de-gestao-de-trabalho-tarefas-demandas-projetos-e-agenda.docx` e implementado o primeiro núcleo operacional persistente exclusivamente no staging `homologacao-compras-2026-10-01` (`xnktywrdoqlacwmdemfp`). Produção não foi alterada e nenhum dado fictício foi inserido em produção.

Criados: `gestao-de-trabalho/index.html`, `gestao-de-trabalho/gestao-trabalho.css`, `gestao-de-trabalho/gestao-trabalho.js`, `supabase/migrations/20261001001900-gestao-trabalho-core-staging.sql`, `supabase/migrations/20261001001901-gestao-trabalho-conflicts.sql`, `supabase/rollbacks/rollback-20261001001900-01901-gestao-trabalho-core-staging.sql` e `docs/gestao-trabalho-2026-10-01.md`.

O núcleo criou 17 tabelas `gestao_trabalho_*` com tenant_id, RLS, índices e grants: categorias, statuses, projetos, demandas, solicitações, tarefas, subtarefas, dependências, rotinas, ocorrências, agenda, capacidades, indisponibilidades, comentários, documentos, eventos e notificações. Foram criadas as RPCs `gestao_trabalho_analisar_planejamento` e `gestao_trabalho_registrar_evento`. A primeira identifica conflitos de agenda/tarefas, calcula carga, capacidade e sobrecarga e sempre retorna `pode_continuar=true`; a segunda registra timeline contextual. Triggers enviam notificações para responsáveis e conectam a auditoria canônica quando disponível. O catálogo `modulos_sistema` recebeu o card `Gestão de Trabalho` com rota `gestao-de-trabalho/index.html`.

A interface inclui dashboard, Minha Agenda — Hoje, Minhas tarefas, Caixa de entrada, Demandas/backlog, Projetos, Solicitações, Rotinas e Configurações de capacidade. As referências `origem_modulo`, `origem_entidade` e `origem_id` preparam integrações futuras sem duplicar registros de Compras, Atas, Biblioteca, Contratos e outros módulos. Integrações externas permanecem fora do escopo.

Validação: `node --check` aprovado; HTTP local retornou 200 para página, CSS, JS e layout; fixture autenticada sintética inseriu tarefa, gerou notificação, encontrou conflito e foi revertida; fixture de sobrecarga retornou carga 540 min, capacidade 480 min, sobrecarga 60 min e `pode_continuar=true`; isolamento retornou acesso ao tenant A, ausência de acesso ao tenant B e zero tarefas visíveis do tenant B; pós-rollback `fixture_rows_persisted=0`.

Limitações: E2E browser com Auth real continua pendente; refinamento das policies por papel/objeto, ocorrências automáticas de rotinas, anexos Storage, comentários/timeline visual, relatórios/exportação, indicadores institucionais, integrações internas e teste de carga serão fases seguintes. Não há autorização para produção.

## 26. Promoção do Gestão de Trabalho para produção — 1º de outubro de 2026
Após autorização expressa, o núcleo de Gestão de Trabalho foi promovido para o projeto de produção `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`). Foram aplicadas as migrations `gestao_trabalho_core_production` e `gestao_trabalho_conflicts_production`, correspondentes ao schema validado no staging e à correção da RPC de conflitos entre tarefas e agenda.

A validação pós-aplicação confirmou 17 tabelas `gestao_trabalho_*` e RLS habilitado nas 17, 10 statuses e 5 categorias semeados para o único tenant ativo existente, catálogo ativo/visível com rota `gestao-de-trabalho/index.html`, RPCs `SECURITY INVOKER`, função de notificação `SECURITY DEFINER`, zero tarefas de fixture e zero notificações persistidas. As migrations constam no histórico de produção como `gestao_trabalho_core_production` e `gestao_trabalho_conflicts_production`.

Nenhum dado de Compras, Atas, Biblioteca ou auditoria existente foi alterado além da criação do catálogo/estrutura própria do módulo. O rollback preparado é `supabase/rollbacks/rollback-20261001002000-02001-gestao-trabalho-production.sql` e não foi executado. Os arquivos HTML/CSS/JS e a documentação foram atualizados no Google Drive; a promoção do banco não equivale à publicação automática da interface em hospedagem.

Pendências permanecem: E2E browser com Auth real, refinamento das policies por papel/objeto, rotinas automáticas, Storage de anexos, relatórios/exportação, teste de carga e publicação da interface pelo mecanismo de deploy da Intranet.

## 27. Relatório consolidado de produção — 1º de outubro de 2026
Foi produzido o relatório `docs/relatorio-consolidado-producao-2026-10-01.md` a partir de consultas diretas ao projeto `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`). O inventário encontrou 97 tabelas públicas, RLS habilitado em todas, 6 módulos ativos/visíveis no catálogo, 98 triggers não internos e as migrations recentes de auditoria, aprovação atômica e Gestão de Trabalho registradas.

O relatório documenta todas as tabelas por área, rotas ativas, funções/RPCs, triggers, indicadores observados e pendências. Dois pontos foram destacados: o card `estoque` continua ativo com rota `#`, e seis tabelas possuem RLS sem policy declarada (`anexos_atos`, `configuracoes_atos`, `versoes_atos`, `perfis`, `permissoes`, `permissoes_modulos`), devendo ser confirmadas como configuração privilegiada ou receber policies explícitas. O relatório foi sincronizado no Google Drive.
