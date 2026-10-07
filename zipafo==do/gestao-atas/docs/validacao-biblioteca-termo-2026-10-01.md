# Validação do módulo Biblioteca Municipal contra o Termo de Referência

**Data:** 1º de outubro de 2026
**Fonte:** `termo-de-referencia-modulo-gestao-biblioteca-municipal.docx` no Drive
**Módulo auditado:** `biblioteca/`
**Projeto Supabase:** `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`)

## 1. Conclusão executiva

O módulo existente **não atende integralmente ao Termo de Referência**. Ele possui uma base funcional consistente para:

- catálogo bibliográfico;
- autores, editoras e categorias;
- livros e exemplares;
- estantes e prateleiras;
- leitores;
- empréstimos, devoluções e renovações;
- dashboard operacional;
- relatórios de acervo, empréstimos, atrasos, leitores e mais emprestados;
- configuração de regras básicas de circulação;
- autenticação e RLS tenant-scoped.

A cobertura atual é, portanto, de **catálogo + circulação básica**, e não de gestão integral de biblioteca conforme o escopo do Termo.

> **Resultado:** não recomendar aceite integral nem publicação como atendimento completo do Termo. Recomenda-se tratar o módulo atual como **MVP operacional de catálogo e circulação** e implementar as fases faltantes antes do aceite final.

## 2. Evidências verificadas

### Frontend existente

Foram encontradas 14 telas HTML funcionais:

`dashboard`, `livros`, `autores`, `editoras`, `categorias`, `exemplares`, `prateleiras`, `leitores`, `emprestimos`, `devolucoes`, `relatorios`, `config`, `comprovante` e `ajuda`.

As telas usam Supabase diretamente, verificam sessão com `auth.getSession()`, consultam o perfil em `usuarios` e executam operações CRUD em tabelas `bib_*`.

### Banco verificado

Tabelas existentes:

- `bib_autores`;
- `bib_categorias`;
- `bib_configuracoes`;
- `bib_editoras`;
- `bib_emprestimo_itens`;
- `bib_emprestimos`;
- `bib_estantes`;
- `bib_exemplares`;
- `bib_leitores`;
- `bib_livro_autores`;
- `bib_livro_categorias`;
- `bib_livros`;
- `bib_prateleiras`;
- `bib_reservas`.

Views existentes:

- `vw_bib_dashboard`;
- `vw_bib_emprestimos_detalhados`.

Funções existentes:

- `fn_bib_atualizar_status_emprestimo`;
- `fn_bib_gerar_codigo_emprestimo`;
- `fn_bib_gerar_codigo_exemplar`;
- `fn_bib_gerar_codigo_leitor`;
- `fn_bib_marcar_exemplar_emprestado`;
- `fn_bib_processar_devolucao`.

As 14 tabelas `bib_*` verificadas possuem RLS habilitado e quatro policies cada, cobrindo leitura e operações de escrita. Isso é evidência de isolamento tenant-scoped, mas não substitui testes autenticados de cada perfil.

## 3. Matriz de atendimento por requisito

Legenda:

- **Atendido:** existe tela/fluxo e persistência compatível observável.
- **Parcial:** existe parte do modelo ou fluxo, mas falta cobertura importante, parametrização, histórico ou validação E2E.
- **Não evidenciado:** não foi encontrada tela, entidade, função ou operação correspondente no módulo auditado.
- **Dependência institucional:** requer regra, documento, aceite ou configuração do Município.

| Requisitos do Termo | Status | Evidência / lacuna |
|---|---|---|
| 1–8 — objeto, finalidade, escopo, multibiblioteca, unidades, perfis, leitores e LGPD | **Parcial** | Existe tenant_id, leitores, autenticação e RLS. Não foi encontrada entidade explícita `Biblioteca/Unidade` com endereço, horários, responsável e regras próprias. Perfis usam o modelo geral de usuários; falta matriz específica de perfis da Biblioteca. LGPD exige revisão de retenção, minimização e exposição. |
| 9–11 — autores, editoras e classificações | **Atendido** | Telas CRUD e tabelas `bib_autores`, `bib_editoras` e `bib_categorias`. |
| 12 — catálogo bibliográfico | **Atendido** | `bib_livros` possui título, subtítulo, ISBN, editora, ano, edição, idioma, páginas, sinopse, capa e relações com autores/categorias. |
| 13–16 — exemplares, identificação, situação e localização | **Atendido/Parcial** | `bib_exemplares` possui código, situação, conservação, prateleira e aquisição; estantes/prateleiras existem. Falta comprovação de QR Code, código patrimonial formal e localização por biblioteca/unidade. |
| 17–18 — etiquetas e códigos de barras | **Parcial** | Há códigos de exemplar e entrada compatível com leitor de código como teclado, mas não foi encontrada geração/impressão de etiquetas nem QR Code. |
| 19–21 — acervo digital, importação e exportação | **Não evidenciado/Parcial** | Há `capa_url` e upload de capa no frontend, mas não módulo de recursos digitais/documentos. Não há importação validada de acervo. Relatórios possuem exportação CSV, mas não exportação administrativa abrangente do acervo. |
| 22–26 — busca, catálogo, filtros e detalhes | **Atendido/Parcial** | Busca e filtros existem em livros, exemplares, leitores e empréstimos. Não foi encontrada publicação de catálogo público separado nem uma ficha pública sem dados pessoais. |
| 27–31 — empréstimo, devolução, renovação, limites e prazos | **Atendido** | Fluxos de empréstimo/devolução/renovação existem e regras básicas são parametrizadas em `bib_configuracoes`. Falta E2E autenticado por perfil e validação de todas as regras de bloqueio. |
| 32–34 — reservas, fila e avisos | **Parcial** | Existe tabela `bib_reservas` e configuração `permite_reserva`, mas não foi encontrada tela/fluxo completo de reserva, fila, prazo de retirada ou aviso. |
| 35–39 — atrasos, bloqueios, multas, perdas, danos e regularização | **Parcial/Não evidenciado** | Dashboard/relatórios identificam atrasos e exemplares têm situações. Não foram encontradas entidades/fluxos completos para bloqueios de leitores, multas/encargos parametrizados, perdas/danos com providências e regularização administrativa. |
| 40–42 — histórico de usuário, exemplar e obra | **Parcial** | Existe histórico do leitor e dados de empréstimo/devolução, mas não foi encontrada trilha integral de alterações bibliográficas, transferências, aquisições, descartes e movimentações do exemplar. |
| 43–47 — inventário periódico, leitura, divergências, parcial e geral | **Não evidenciado** | Não há tela, tabela, view ou função de inventário identificada. |
| 48–55 — aquisição, doação, incorporação, triagem, descarte, transferência, circulação entre unidades e patrimônio | **Não evidenciado** | Não há entidades ou telas correspondentes. `data_aquisicao` e `valor_aquisicao` no exemplar não substituem o módulo de aquisição/doação/patrimônio. |
| 56–57 — documentos e Google Drive | **Não evidenciado/Parcial** | Há upload de capa, mas não gestão de documentos administrativos anexados nem vínculo com Drive. Integrações externas permanecem fora do escopo atual. |
| 58–62 — atividades, eventos, participantes, calendário e campanhas | **Não evidenciado** | Não há módulo de atividades culturais, eventos, inscrições ou campanhas. |
| 63–71 — indicadores, circulação, rankings, acervo sem circulação, relatórios, dashboard e alertas | **Parcial** | Dashboard e relatórios cobrem acervo, empréstimos, atrasos, leitores e mais emprestados. Não há evidência de acervo sem circulação, reservas expirando, inventário, aquisições/doações/baixas ou alertas completos. |
| 72–78 — notificações, auditoria, permissões, logs, integridade e continuidade | **Parcial** | Há centro visual de notificações e autenticação/RLS. Não foi comprovada auditoria append-only específica da Biblioteca, matriz de permissões por operação, monitoramento, backup/restore ou plano de continuidade do módulo. |
| 79–90 — usabilidade, acessibilidade, responsividade, desempenho, segurança, dados e documentação | **Parcial** | Layout responsivo e ajuda existem; há dependência de CDN para Supabase. Ainda faltam testes formais de acessibilidade, performance, console, CSP, retenção LGPD, documentação técnica completa e teste em dispositivos móveis. |
| 91–100 — responsividade, leitores, comprovantes, balcão, reservas/cadastro/renovação e inventário móvel | **Parcial** | Comprovante de empréstimo existe e busca de balcão é funcional. Falta reserva no balcão, cadastro no fluxo de atendimento e inventário móvel. |
| 101–104 — importação, validação, deduplicação e qualidade do catálogo | **Não evidenciado** | Não há fluxo de importação, pré-validação, deduplicação assistida ou relatório de inconsistências. |
| 105–112 — configuração inicial, treinamento, documentação, testes, regressão, aceite, implantação e evolução | **Parcial** | Configuração básica e ajuda existem. Faltam plano de implantação da Biblioteca, treinamento, matriz de testes completa, aceite municipal, regressão formal e evidência de evolução multibiblioteca. |

## 4. Gaps prioritários

### Prioridade 1 — circulação e integridade operacional

1. Implementar reserva completa: criação, fila, expiração, retirada e status.
2. Implementar bloqueios parametrizados e motivos.
3. Implementar perdas/danos e regularização.
4. Garantir histórico auditável de empréstimos, devoluções, renovações e alterações críticas.
5. Validar permissões por perfil com sessões autenticadas.

### Prioridade 2 — inventário e patrimônio

1. Criar inventário geral/parcial.
2. Permitir leitura por código de barras/QR como entrada de teclado/câmera quando disponível.
3. Registrar divergências e localização encontrada.
4. Implementar movimentações, transferências e baixa/descarte.
5. Separar aquisição, doação, triagem e incorporação.

### Prioridade 3 — catálogo e migração

1. Importação CSV com pré-validação, duplicidades e relatório de erros.
2. Deduplicação assistida sem exclusão automática.
3. Relatório de qualidade do catálogo.
4. Etiquetas e impressão de códigos.
5. Exportação administrativa completa.

### Prioridade 4 — cultura, indicadores e governança

1. Eventos, atividades, participantes e campanhas.
2. Indicadores de circulação e acervo sem movimentação.
3. Documentos administrativos e vínculo com Drive, se autorizado.
4. Auditoria específica e retenção LGPD.
5. Plano de implantação, treinamento e aceite.

## 5. Recomendações

1. **Não declarar atendimento integral ao Termo** com a implementação atual.
2. Manter o módulo atual como base operacional de catálogo e circulação.
3. Criar migrations aditivas por pacote, começando por reservas, bloqueios, inventário e auditoria.
4. Não inventar multas, prazos legais ou regras de descarte; manter tudo parametrizável e exigir decisão municipal.
5. Criar staging próprio da Biblioteca antes das migrations estruturais, separado do staging de Compras.
6. Executar E2E autenticado por perfil, persistência e RLS antes de qualquer aceite.
7. Tratar integrações externas, inclusive Google Drive, somente com autorização e desenho de segurança específico.

## 6. Limitações da validação

Esta é uma auditoria de cobertura baseada no Termo do Drive, no código HTML/JavaScript local da pasta `BIBLIOTECA` e no catálogo do Supabase. Ela não comprova aceite municipal, conformidade jurídica, teste manual de cada tela, backup físico, restore, performance em produção ou adequação biblioteconômica. Também não foram consultados dados de leitores ou registros pessoais.
