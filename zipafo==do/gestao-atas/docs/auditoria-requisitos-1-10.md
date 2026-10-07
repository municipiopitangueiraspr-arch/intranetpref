# Auditoria de base — requisitos 1–10 de Compras Públicas

**Data/hora da coleta:** 1º de outubro de 2026, 12:12 UTC (09:12 UTC−03).
**Ambiente:** cópia local `/home/ubuntu/intranet-audit/intranet-source`; Supabase `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`); Google Drive, raiz autorizada `Intranet` (`1TrYuFmqXf1avrGcKHdIq6Gvj3S72lDLy`).
**Uso:** evidência reexecutável para itens 1–10 do Termo; auditoria estática/live de catálogo não equivale a teste autenticado nem a aceite do Município.

## Fontes institucionais do Drive

A listagem do Drive (`files.list`, `trashed=false`, raiz `Intranet`) retornou os seguintes itens diretamente relacionados ao escopo, entre outros arquivos da Intranet:

| Arquivo | Drive ID | Tipo/tamanho informado | Relação com o produto |
|---|---|---|---|
| `termo-de-referencia-modulo-gestao-compras-publicas.docx` | `1CZTNztuYKMINfk203I2Jmva05Pi5kkyr` | DOCX, 46.574 bytes; modificado 2026-10-01T00:10:55Z | Escopo institucional de Compras e critérios de aceite; não é norma jurídica. |
| `termo-de-referencia-modulo-gestao-biblioteca-municipal.docx` | `1Kfil4BpBP4uakDN5vIbZUXIwpIxF5ucd` | DOCX, 46.081 bytes; modificado 2026-10-01T00:10:37Z | Requisitos da Biblioteca e fronteira de integração/regressão; esta tarefa não reescreve Biblioteca. |
| `vamos-tentar-fazer-mais-algumas-mel.txt` | `1O2j_ByZNGnw7Muj5LR8Ov2_X3Zgaa-aS` | text/plain, 1.099 bytes; modificado 2026-09-30T11:30:48Z | Instrução/prompt de trabalho; classificar como orientação do usuário, não como norma nem como requisito autônomo sem cotejo com os Termos. |
| `melhorias-e-implementacoes.txt` | `1oSv53zOFFuG0-bGdyzQNi4nDNlgTFe5C` | text/plain, 4.679 bytes; modificado 2026-09-30T11:30:48Z | Histórico/notas do protótipo; evidência contextual, a validar contra código e Termos, não regra jurídica. |
| Pasta `compras` | `1_MC2zo_rNu-oP2rHJV5DioVlqG7NLusE` | pasta | Código e documentação do módulo. |
| Pasta `docs` | `1XLMLSFHftzjpzlH6Fz_KL2SdHZUapKQG` | pasta | Matrizes e documentos de implantação. |
| Pasta `supabase` | `1Pc6IDOBw0c1X7iuk1IY-THg1WTycKq8f` | pasta | Migrations do backend. |
| Pasta `controle-de-saldos` | `1h5n-8EvvFAIOhnPMjySmp608AhSTOqLH` | pasta | Módulo legado e arquivos autorizados; dados financeiros privados não são incluídos nesta auditoria nem em release público. |

Os quatro arquivos foram baixados novamente do Drive em `files.get(alt=media)`, lidos/extraídos localmente e tiveram os seguintes hashes SHA-256 confirmados; as cópias temporárias foram removidas após a auditoria:

| Arquivo baixado | SHA-256 | Extração verificada |
|---|---|---|
| Termo Compras (`Termo_Compras.docx`) | `733770abece7f8f5b2ff518f69c651a20fc006957f757baca26f29b5c8a0525f` | 286 parágrafos; 104 seções/itens, com seções 6–9 de auditoria/preservação, 11–25 de planejamento/fluxos, 26–63 do ciclo de compra/atas/contratos, 64–91 de documentos, segurança, governança e relatórios, e 92–104 de dados/testes/aceite. |
| Termo Biblioteca (`Termo_Biblioteca.docx`) | `5e4f53e1fd0b6be9700d52ff9e940b457bcd29a1bcd1ab3fcea0b172ffc93060` | 331 parágrafos; 112 seções, inclusive catálogo/circulação/aquisições, segurança, LGPD, backup, regressão e aceite; usado aqui para limitar regressão/integração, não para declarar cobertura da Biblioteca. |
| Orientação curta (`vamos-tentar-fazer-mais-algumas-mel.txt`) | `bd4d2fc00410ea7cb3b40da89bb1c295b0111e8d9d92ef7c000029dd84a0d134` | 1 linha; orientação de UX do usuário. |
| Notas do protótipo (`melhorias-e-implementacoes.txt`) | `01fd30953a549651ada184ad26d87a21244195736c3b522ba74e9e268e20a970` | 94 linhas; backlog contextual sobre navegação, confirmações e módulos legados. Uma linha potencialmente sensível foi omitida da saída e não é usada como fonte normativa. |

O Termo de Compras contém também um “Prompt Mestre” com instruções para auditar/reutilizar o projeto, preservar funcionalidades e não mascarar lacunas com dados fictícios; isso é diretriz de implementação, não norma jurídica. Os Termos são especificações institucionais/critério de contratação, não legislação. Notas e prompts apenas contextualizam as decisões; cada regra jurídica precisa de fonte oficial validada pela equipe municipal.

## Supabase — evidência live

### Histórico confirmado

`list_migrations` para o projeto `qgkjnzcqjhhqdgxmvtew` retornou onze entradas (uma anterior a Compras e dez migrations incrementais do módulo):

- `20260930152825` — `add_modalidade_to_atas`
- `20261001013617` — `compras_foundation`
- `20261001013709` — `compras_legacy_security`
- `20261001013806` — `compras_policies_rpc`
- `20261001014141` — `20261001000400_compras_rpc_storage_indexes`
- `20261001015624` — `compras_fk_indexes`
- `20261001112252` — `compras_stage_completion_20261001000600`
- `20261001120218` — `compras_artifacts_decisions_governance_20261001000700`
- `20261001120501` — `compras_governance_fk_indexes_20261001000800`
- `20261001121411` — `compras_rule_version_rpc`
- `20261001130813` — `compras_same_process_integrity` (arquivo local `20261001001000-compras-same-process-integrity.sql`)

O tenant ativo único foi confirmado por contagem sem ler nomes de municípios: `active_tenant_count=1`. Isso permite verificar uma tenant ativa, mas não demonstra isolamento entre tenants.

### Advisors (execução live em 2026-10-01T13:08Z)

**Segurança** — a ferramenta `get_advisors(type=security)` registrou:

| Achado | Contagem | Detalhe útil |
|---|---:|---|
| RLS habilitada sem policy | 6 | `public.anexos_atos`, `configuracoes_atos`, `perfis`, `permissoes`, `permissoes_modulos`, `versoes_atos`. Exigem revisão de grants, pois uma tabela sem policy pode estar fechada para o cliente, mas não comprova o acesso pretendido. |
| `search_path` mutável | 18 | Funções legadas publicadas: `get_my_profile`, `calcular_status_ata`, `atualizar_status_ata_trigger`, `atualizar_status_todas_atas`, `registrar_historico_item_aditivo`, `handle_new_user`, `update_updated_at_column`, `atualizar_saldo_apos_consumo`, `gerar_lote_item`, `sp_registrar_consumo`, `fn_bib_gerar_codigo_emprestimo`, `fn_bib_marcar_exemplar_emprestado`, `fn_bib_processar_devolucao`, `fn_bib_atualizar_status_emprestimo`, `fn_bib_gerar_codigo_leitor`, `fn_bib_gerar_codigo_exemplar`, `fn_touch_updated_at` e `fn_auditar_desativacao_usuario`. As definições/grants completos ainda precisam de revisão por função antes de remediar. |
| Função `SECURITY DEFINER` executável por authenticated | 2 | `compras_gerar_ata(...)` e `fn_is_admin()`. A primeira tem `search_path=pg_catalog`, sessão/tenant/papel e validações de processo; o finding segue aberto até teste positivo/negativo autenticado, pois a RPC pode criar ata e itens de saldo. `fn_is_admin()` demanda revisão própria. |
| Proteção contra senha vazada desativada | 1 | Configuração Auth; requer decisão e habilitação administrativa pelo operador do projeto. |

Remediações oficiais: [RLS habilitada sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path mutável](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [SECURITY DEFINER acessível](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [proteção de senha vazada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

**Performance** — `get_advisors(type=performance)` registrou 36 FKs sem índice e 75 usos de Auth/current_setting em policies com possível reavaliação por linha. Após a migration 010, foram filtrados zero findings de FK sem índice em tabelas `compras_*`; as novas constraints estão cobertas. O advisor também lista 16 pares de policies permissivas de SELECT em Compras e vários índices sem tráfego observado; isso precisa de análise com requests/perfil e carga representativa, não de remoção automática. Os demais findings são predominantemente legados (Biblioteca, Atas/Saldos, Atos e pedidos); não aplicar correções em massa sem regressão.

Referências: [FKs sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) e [RLS initplan](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

### RPCs do módulo

A leitura do catálogo live confirmou:

- `compras_concluir_etapa(uuid)`: `SECURITY INVOKER`, `search_path=pg_catalog, public, app_private`; EXECUTE para `authenticated`, não para `anon`.
- `compras_registrar_artefato_versao(...)`: `SECURITY INVOKER`, mesmo `search_path`; EXECUTE para `authenticated`, não para `anon`.
- `compras_gerar_ata(...)`: `SECURITY DEFINER`, `search_path=pg_catalog`; EXECUTE para `authenticated`, não para `anon`.
- `compras_registrar_regra_versao(...)`: migration 009 aplicada; `SECURITY INVOKER`, `search_path=pg_catalog, public, app_private`; EXECUTE para `authenticated`, não para `anon`. Serializa por tenant/chave e grava append-only.
- A migration 010 adiciona um trigger `SECURITY INVOKER` com `search_path=pg_catalog` para derivar o tenant/processo da revisão a partir do artefato pai; sem EXECUTE para `anon`.

Nas quatro tabelas de artefatos/versões/decisões/regras, catálogo live mostra RLS habilitada, duas policies por tabela (SELECT e INSERT) e grants somente SELECT/INSERT para `authenticated`; não há grant de tabela para `anon` ou `PUBLIC`. RLS não está `FORCE ROW LEVEL SECURITY`; o uso normal do PostgREST com roles `anon`/`authenticated` continua sujeito às policies, mas testes HTTP autenticados ainda são necessários.

Ainda falta coletar matriz completa de grants para todo o schema (tabelas/views/funções), objetos de Storage/Auth e um teste de requisições autenticadas permitidas/negadas. A consulta ao catálogo estática não prova isolamento em requests reais.

## Estado dos requisitos pedidos (1–10)

| Nº | Estado desta rodada | Evidência/entrega | O que segue necessário para aceite |
|---:|---|---|---|
| 1 | Parcial | Fluxo de demanda/processo existente; esta rodada separa ficha de processo, artefatos versionados e decisões auditáveis. | Cobrir com transações e teste o ciclo completo, inclusive contratação direta/licitação, integração de atas, execução, encerramento e relatórios. |
| 2 | Parcial | Ficha do processo reúne etapas, documentos, tarefas, decisões, artefatos e contratos; novos registros ficam ligados ao processo. | Pesquisa global, alertas/notificações persistentes e ciclo de execução completo ainda faltam. |
| 3 | Parcial | Criadas áreas específicas de artefatos, decisões, fontes e auditoria, além do painel/processos atuais. | Publicações externas e gestão completa de participantes/propostas/recursos e execução não concluídas. |
| 4 | Parcial | Script reproduzível: 61 páginas HTML ativas, 21 CSS, 60 JS, 10 migrations e 443 referências; zero mismatch de caixa. Smoke HTTP 200 em seis rotas e nos CSS/JS de Compras. | Ainda sem deployment em subdiretório GitHub Pages representativo, CI, backup/restauração ou rollback ensaiado; scan encontra 27 referências quebradas fora de Compras e 24 paths absolutos root-relative. |
| 5 | Parcial | Artefatos e decisões append-only; fontes são classificadas como norma/procedimento/parâmetro; migration 009 fornece incremento atômico de versão com lock por chave. | Conteúdo municipal, aprovação formal e revisão jurídica ainda dependem de servidores/autoridades; não são feitos por automação. |
| 6 | Parcial | `scripts/audit-intranet-static.py` e `docs/auditoria-intranet-local.json` registram as 61 páginas ativas, contagens de arquivos, referências, paths e caixa; oito HTML em diretórios históricos de backup foram contados e separados. | A análise estática não cobre rotas geradas em runtime, autenticação, integrações, app publicado ou dependências externas em execução. |
| 7 | Parcial, com proveniência verificada | Quatro arquivos Drive foram baixados, extraídos/hash SHA-256 e classificados; os Termos de Compras/Biblioteca informam critérios de produto, enquanto prompt/notas orientam o contexto. | Falta vincular as 104 seções/itens documentais às telas/testes, com rastreabilidade dos 103 requisitos da matriz e inventariar demais fontes oficiais/normativas referidas nos anexos. |
| 8 | Parcial | Onze entradas live (dez de Compras + modalidade anterior); advisors de segurança/performance; RLS/grants das tabelas novas e propriedades das RPCs conferidos; um tenant ativo; migration 010 com nove constraints validadas. | Grants completos, Auth/Storage e testes positivos/negativos em requests; não há segundo tenant de teste confirmado nesta coleta. |
| 9 | Parcial | Mudanças locais somente em Compras/docs/migrations; nenhum saldo nem registro legado de ata/pedido foi alterado; roteiro de rollback da migration 010 preparado. | Backup verificado/restauração e regressão funcional de Biblioteca, Atas, saldo, carrinho e entregas não executados; rollback não ensaiado. |
| 10 | Parcial, com avanço | Novas páginas independentes: artefatos, decisões, governança/fontes, auditoria e ficha de processo; menu interno sem atalhos diretos à Biblioteca/Controle de Saldos. | Pesquisa, fornecedores, pricing, fluxos configuráveis, configurações e execução ainda permanecem concentrados/incompletos; necessita validação UX responsiva e acessível. |

## Evidências e limites de execução

- `node --check` passou para `compras/compras.js` e `compras/area.js`; `py_compile` passou para o auditor Python. As seis páginas HTML de Compras, `compras.css`, `compras.js` e `area.js` retornaram HTTP 200 no servidor estático local. Nenhum destes checks equivale a E2E autenticado.
- O scan reportou 27 referências quebradas fora de `compras/`: 7 sob `controle-de-saldos`, 17 sob `GESTÃO DE ATOS OFICIAIS` e 3 em `core`. A imagem oficial `brasao-pref.png` foi restaurada da raiz do Drive; essa referência da home passou a existir. Parte das âncoras de Atos pode ser gerada em runtime. Os cinco arquivos CSS sem referência literal em HTML foram tratados como candidatos; nenhum foi removido. O script encerra com status 1 devido aos achados remanescentes fora de Compras, não por erro do novo módulo.
- Nenhuma referência estática quebrada, mismatch de caixa ou atalho direto para Biblioteca/Controle de Saldos foi encontrado nas páginas `compras/`.
- Não usar testes de escrita reais com processos/contratos municipais em produção. Casos de integração e testes de isolamento devem usar contas e fixture de homologação, em transação reversível.
- Uma só organização/tenant não demonstra que uma segunda organização é isolada; é necessária identidade de teste autorizada e um tenant de homologação com fixture não sensível.
- Não foi executado backup, restauração, GitHub Pages deploy ou migração reversa nesta rodada. Nenhum destes itens deve ser rotulado como aprovado.
- Antes da migration 010, a auditoria encontrou zero versão de artefato órfã; após aplicação, o catálogo mostra as nove constraints/checks novas como `convalidated=true`. A migration 010 acrescentou `processo_id` derivado nas versões e não alterou saldos nem atas existentes.
- Os seis casos financeiros de saldos reservados continuam fora da árvore pública e fora do pacote de código.
