# Auditoria de maturidade — Intranet Municipal para SaaS contratável

**Data da auditoria:** 1º de outubro de 2026
**Objetivo:** orientar qualquer agente de IA que continue o projeto e registrar o estado comparativo entre os módulos, os Termos de Referência (TR), os Estudos Técnicos Preliminares (ETP) e a maturidade necessária para uma contratação SaaS municipal.

> **Conclusão executiva:** a Intranet possui seis módulos cadastrados no catálogo do Supabase. Cinco possuem alguma estrutura ou rota real; o módulo Estoque está apenas cadastrado, com rota `#`. Foram encontrados três Termos de Referência na pasta `documentos-compartilhados`, mas nenhum ETP identificado. Portanto, nenhum módulo pode ser declarado, neste momento, como SaaS municipal plenamente contratável, homologado e pronto para aceite.

---

## 1. Prompt para o próximo agente de IA

Copie e execute o prompt abaixo como instrução inicial de continuidade:

```text
Você é o agente responsável por auditar e evoluir uma Intranet Municipal para uma solução SaaS que possa ser especificada, contratada, implantada, operada, auditada e aceita por uma Prefeitura Municipal.

ANTES DE ALTERAR CÓDIGO OU BANCO:

1. Leia integralmente este readme.md.
2. Leia todos os arquivos da pasta "documentos-compartilhados" na raiz da Intranet.
3. Leia todos os Termos de Referência (TR) e todos os Estudos Técnicos Preliminares (ETP) encontrados nessa pasta, inclusive DOCX, PDF, MD, TXT e planilhas quando existirem.
4. Não presuma que um documento cujo nome não contenha "TR" ou "ETP" seja irrelevante. Classifique também notas, planos, relatórios, modelos, legislações, políticas e documentos de apoio.
5. Faça uma lista de todos os documentos lidos, informando nome, tipo, data, finalidade, módulo relacionado e se é fonte normativa, requisito funcional, decisão de produto ou evidência de implementação.
6. Consulte o Google Drive para conferir a árvore atual e não trabalhe com cópia antiga sem verificar os arquivos mais recentes.
7. Consulte o Supabase antes de qualquer DDL. Use o projeto principal somente para leitura até haver autorização expressa para promover uma entrega. Use o projeto de homologação para fixtures, concorrência, testes destrutivos e rollback.
8. Consulte o histórico de migrations. Nunca reaplique uma migration já registrada.
9. Não use dados reais para testes destrutivos. Não inclua credenciais, senhas, service_role ou tokens no código, Drive, documentação, ZIP ou frontend.
10. Trate os dados existentes como reais, mesmo que o sistema ainda não tenha usuários regulares.

AUDITORIA DOCUMENTAL:

11. Para cada módulo, compare o que o TR e o ETP exigem com o que existe no banco, frontend, RPCs, triggers, policies, RLS, Storage, Auth, relatórios, testes e documentação.
12. Diferencie claramente:
    - requisito previsto no TR/ETP;
    - requisito implementado e persistente;
    - requisito parcialmente implementado;
    - requisito apenas visual ou prototípico;
    - requisito não encontrado;
    - requisito dependente de decisão municipal, parametrização, integração externa ou norma local.
13. Não trate a existência de tabelas, uma rota HTML ou uma migration como prova de implementação completa.
14. Não trate uma validação SQL sintética como substituta de E2E browser autenticado.
15. Não trate RLS habilitado como prova de autorização correta. Examine policies, funções, grants, Storage e testes positivos/negativos.
16. Não trate uma tabela de auditoria como certificação jurídica, assinatura qualificada, cadeia de custódia ou conformidade automática.
17. Não invente regra jurídica. Toda regra legal deve ter fonte normativa, vigência, autoridade responsável e possibilidade de revisão.

AVALIAÇÃO DE SAAS:

18. Avalie se cada módulo possui escopo contratável, fluxos completos, atores, permissões, regras, critérios de aceite, SLA, suporte, backup, restauração, portabilidade, plano de implantação, treinamento e saída contratual.
19. Verifique multi-tenancy: tenant_id, RLS, memberships, unidades, isolamento cross-tenant real e segregação de administradores.
20. Verifique LGPD: inventário de dados pessoais, finalidade, base legal aplicável ao Poder Público, minimização, transparência, retenção, descarte, direitos dos titulares, incidentes, operador/suboperadores e encarregado.
21. Verifique governo digital: linguagem clara, acessibilidade, serviços digitais, interoperabilidade, formatos abertos, transparência, LAI e adoção por ato normativo municipal quando necessário.
22. Verifique contratação pública: necessidade, alternativas, dimensionamento, custos, riscos, resultados, critérios de aceite, níveis mínimos de serviço, portabilidade e transição.
23. Verifique segurança: Auth, MFA quando disponível, menor privilégio, revisão de acesso, logs, Storage privado, criptografia, vulnerabilidades, backups e restauração.
24. Verifique operação: monitoramento, suporte, incidentes, manutenção, atualização, disponibilidade, desempenho e continuidade.

ENTREGÁVEIS OBRIGATÓRIOS:

25. Produza um relatório comparativo por módulo com as colunas:
    módulo | TR encontrado | ETP encontrado | requisitos cobertos | requisitos parciais | requisitos ausentes | evidências | riscos | maturidade | próxima ação.
26. Produza uma matriz rastreável no formato requisito → tela/rota → tabela/RPC/policy → teste → evidência → situação.
27. Classifique cada módulo em uma destas categorias:
    - pronto para homologação;
    - fundação operacional;
    - protótipo operacional;
    - legado a auditar;
    - apenas cadastrado;
    - não encontrado.
28. Informe separadamente o que é fato observado, inferência técnica, pendência e decisão que precisa do Município.
29. Não declare conformidade integral, prontidão SaaS ou aceite de produção sem evidência repetível e aceite formal.
30. Atualize o handoff somente depois de registrar arquivos criados, migrations, policies, testes, riscos, limitações e próximos passos.
31. Ao finalizar, sincronize a documentação aprovada ao Google Drive, preservando hashes e informando exatamente o que foi publicado.

PRIORIDADE ATUAL:

32. Priorize Atas, Saldos e Pedidos.
33. Feche o ciclo ata → item → saldo → reserva → pedido → aprovação → consumo → entrega parcial/final → cancelamento/estorno autorizado → encerramento → relatório → auditoria.
34. Teste saldo insuficiente, idempotência, concorrência com duas conexões, perfis distintos e bloqueio cross-tenant.
35. Só depois amplie a Gestão de Trabalho, Compras Públicas e Biblioteca.
36. Não publique uma integração externa como concluída sem API, recibo, autenticação, reenvio, falha e auditoria demonstrados.

FORMATO DO RESULTADO:

- Escreva em português do Brasil.
- Seja objetivo, mas registre evidências e limitações.
- Cite o caminho exato dos arquivos e o ID/versão da migration quando possível.
- Não exponha credenciais.
- Separe claramente "publicado", "validado em homologação" e "pendente".
```

---

## 2. Fonte documental encontrada

A pasta **documentos-compartilhados**, criada na raiz da Intranet, contém cinco arquivos:

1. `termo-de-referencia-de-gestao-de-trabalho-tarefas-demandas-projetos-e-agenda.docx`;
2. `termo-de-referencia-modulo-gestao-compras-publicas.docx`;
3. `termo-de-referencia-modulo-gestao-biblioteca-municipal.docx`;
4. `melhorias-e-implementacoes.txt`;
5. `vamos-tentar-fazer-mais-algumas-mel.txt`.

Uma busca no Google Drive por arquivos com `ETP` no nome não encontrou nenhum resultado. Até esta auditoria, portanto, **não há ETP identificado na pasta ou no Drive pesquisado**. Isso não prova que não exista ETP em outro local ou com outro nome; o próximo agente deve procurar por conteúdo, extensão e pastas relacionadas antes de concluir definitivamente.

Os três TRs são especificações funcionais amplas. Eles não substituem o ETP da contratação da plataforma SaaS, nem contêm sozinhos dimensionamento, estudo de alternativas, estimativa de custos, análise de riscos, SLA, plano de implantação, suporte, portabilidade e encerramento contratual.

---

## 3. Módulos cadastrados no Supabase

Consulta realizada no projeto principal `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`), tabela `public.modulos_sistema`.

| Módulo cadastrado | Rota | Situação observada | TR | ETP | Maturidade atual |
|---|---|---|---|---|---|
| Atas, Saldos e Pedidos (`atas`) | `controle-de-saldos/gestao-atas.html` | Existe e possui 12 tabelas, triggers e RPC de aprovação atômica | Coberto parcialmente pelo TR de Compras; não há TR próprio | Não encontrado | **Operacional evoluído, mas ainda não contratável** |
| Estoque e Almoxarifado (`estoque`) | `#` | Card ativo, sem rota funcional | Não encontrado | Não encontrado | **Apenas cadastrado** |
| Gestão de Trabalho (`tarefas`) | `gestao-de-trabalho/index.html` | 17 tabelas, RLS, RPCs e interface; promoção de banco feita | Sim | Não encontrado | **Fundação operacional** |
| Atos Oficiais (`atosoficiais`) | `gestao-de-atos-oficiais/painel-adm-atos-oficiais.html` | Módulo legado com 9 tabelas; 3 tabelas com RLS sem policy declarada | Não encontrado | Não encontrado | **Legado a auditar** |
| Biblioteca Municipal (`biblioteca`) | `biblioteca/dashboard.html` | Módulo com 14 tabelas e rota funcional | Sim | Não encontrado | **Implementação parcial a comparar com o TR** |
| Compras Públicas (`compras`) | `compras/index.html` | Módulo avançado com 30 tabelas, fluxos, etapas, contratos e auditoria; requisitos ainda parciais | Sim | Não encontrado | **Protótipo operacional avançado** |

### Contagem correta

- **6 módulos cadastrados e ativos/visíveis no catálogo.**
- **5 módulos com alguma estrutura ou rota real.**
- **1 módulo sem implementação funcional comprovada:** Estoque e Almoxarifado.
- **3 módulos com TR localizado:** Compras Públicas, Biblioteca e Gestão de Trabalho.
- **0 ETP localizado.**
- **0 módulos plenamente comprovados como SaaS municipal contratável.**

---

## 4. Avaliação por módulo

### 4.1 Atas, Saldos e Pedidos

É o melhor candidato para a primeira entrega, pois possui dados operacionais reais e fluxo de negócio mais concreto. O banco contém atas, itens, fornecedores, pedidos, itens de pedido, consumos, entregas fracionadas e histórico relacionado. A aprovação atômica foi migrada para uma RPC com bloqueio transacional, idempotência e validação de saldo.

A melhoria visual e funcional registrada em `melhorias-atas-saldos-pedidos-2026-10-01.md` ajustou nomenclatura, dashboard por perfil, saldo físico/reservado/utilizável e fila de aprovação. Contudo, o próprio documento informa que ainda falta fixture autenticada no staging e E2E browser completo.

**O que falta para o nível SaaS:** TR específico; ETP; ciclo completo de entrega, cancelamento, estorno e encerramento; teste concorrente com duas conexões; perfis reais de homologação; prova cross-tenant; relatórios; backup/restauração; Storage/documentos; SLA; suporte; portabilidade; plano de implantação e saída.

**Classificação:** módulo operacional evoluído, porém ainda não pronto para contratação.

### 4.2 Gestão de Trabalho

O TR é amplo e descreve dashboard, agenda, tarefas, demandas, backlog, solicitações, projetos, subtarefas, rotinas, capacidade, conflitos, notificações, documentos, comentários, dependências, relatórios, indicadores, pesquisa, configurações e auditoria.

A implementação possui 17 tabelas tenant-scoped, RLS, duas RPCs, notificações e referências de origem para futuras integrações. O banco foi promovido ao ambiente principal, mas isso não equivale ao aceite do módulo.

**Pendências documentadas:** E2E browser com Auth real; policies refinadas por papel/objeto; recorrência e ocorrências automáticas; Storage; comentários e timeline visual; relatórios exportáveis; indicadores institucionais; integrações; teste de carga; publicação dos arquivos de interface; aceite municipal.

**Classificação:** fundação operacional, não SaaS completo.

### 4.3 Compras Públicas

É o TR mais completo. Abrange planejamento, demandas, PCA, contratação direta, licitação, ETP, TR, pesquisa de preços, fornecedores, propostas, julgamento, recursos, adjudicação, homologação, publicações, PNCP, TCE-PR/SIM-AM, contratos, execução, atas, saldos, pedidos, documentos, Storage, auditoria, RLS e relatórios.

A implementação já possui 30 tabelas e seis rotas, além de fluxos versionados, etapas, subetapas, contratos, obrigações, documentos, decisões, notificações e auditoria. Mesmo assim, o handoff registra que os requisitos 1–10 continuam parciais.

**Pendências principais:** formulários completos e aprovação de ETP/TR/edital/pareceres/atas; propostas e recursos; execução contratual completa; medições, atestos, pagamentos, aditivos, reajustes, sanções e encerramento; relatórios; integrações externas; E2E; auditoria completa de Auth/Storage/grants; backup físico/restore; regressão; CI/deploy; acessibilidade e aceite municipal.

**Classificação:** protótipo operacional avançado/fundação de produto, não módulo contratável completo.

### 4.4 Biblioteca Municipal

O TR cobre catálogo, obras, exemplares, circulação, empréstimos, devoluções, reservas, renovações, atrasos, inventário, aquisições, doações, descarte, transferências, documentos, eventos, indicadores, relatórios e LGPD.

A produção possui 14 tabelas de Biblioteca e uma rota funcional, mas a existência das tabelas não comprova cobertura integral do TR. Ainda é necessário validar inventário, importação/exportação, documentos, Storage, múltiplas unidades, atividades culturais, relatórios, alertas, retenção de dados de leitores e critérios de aceite.

**Classificação:** implementação parcial a ser auditada; TR aproveitável, sem ETP.

### 4.5 Atos Oficiais

O catálogo registra uma rota funcional e nove tabelas. Não foi encontrado TR nem ETP específico. Há três tabelas com RLS sem policy declarada: `anexos_atos`, `configuracoes_atos` e `versoes_atos`.

**Classificação:** legado a auditar. Não apresentar como módulo SaaS contratável antes de documentação, revisão de segurança, fluxos, critérios de aceite e validação funcional.

### 4.6 Estoque e Almoxarifado

Está ativo e visível no catálogo, mas a rota é `#` e não há implementação funcional comprovada.

**Classificação:** apenas cadastrado. Deve ser ocultado/desativado ou receber escopo, TR, ETP e implementação próprios.

---

## 5. Avaliação dos TRs e ETPs para contratação SaaS

### Termo de Referência de Compras Públicas

É uma boa base de requisitos funcionais, mas não é suficiente como pacote de contratação SaaS. Deve receber ETP da própria contratação, estudo de alternativas, dimensionamento, custo, riscos, SLA, suporte, segurança, LGPD, implantação, migração, treinamento, portabilidade, transição e critérios objetivos de aceite.

### Termo de Referência de Gestão de Trabalho

É uma boa base funcional para o módulo, mas não contém por si só os elementos necessários para contratar e operar um SaaS. Precisa ser complementado por requisitos de serviço, segurança, privacidade, implantação, operação, suporte, integração, desempenho, retenção e saída.

### Termo de Referência da Biblioteca

É funcionalmente abrangente e aproveitável, porém precisa ser confrontado com a implementação real e complementado com ETP, dimensionamento, LGPD de leitores, operação multiunidade, Storage, relatórios, suporte, implantação e aceite.

### Atas, Saldos e Pedidos

Não possui TR próprio. Está parcialmente coberto pelo TR de Compras. Deve receber um TR específico, pois seu fluxo é importante e tem regras próprias de saldo, reserva, aprovação, consumo, entrega, cancelamento, estorno e auditoria.

### Atos Oficiais e Estoque

Não possuem TR ou ETP localizado. Não podem ser incluídos como módulos contratáveis sem nova especificação.

---

## 6. O que deve ser criado antes de afirmar “SaaS contratável”

1. **ETP geral da plataforma SaaS**, com problema público, alternativas, solução escolhida, dimensionamento, estimativa, resultados, riscos e conclusão.
2. **TR específico de Atas, Saldos e Pedidos**, com ciclo completo, perfis, regras, dados, integrações e critérios de aceite.
3. **Matriz de rastreabilidade**: requisito → tela/rota → tabela/RPC/policy → teste → evidência.
4. **Plano de segurança e LGPD**, com inventário de dados, finalidade, base legal, retenção, incidentes, acessos e suboperadores.
5. **Modelo de operação SaaS**, com ambientes, atualizações, suporte, monitoramento, disponibilidade e manutenção.
6. **Plano de backup, restauração e continuidade**.
7. **Plano de portabilidade e saída contratual**, com formato, prazo, custos e responsabilidades.
8. **SLA e critérios de medição**, vinculados a resultados.
9. **Plano de implantação, migração, treinamento e suporte**.
10. **Critérios de aceite por módulo**, incluindo E2E, concorrência, cross-tenant, acessibilidade e desempenho.
11. **Mapa de decisões municipais**, separando configuração, procedimento interno, norma local e regra legal.
12. **Revisão jurídica e institucional**, especialmente para LGPD, governo digital, LAI, assinatura, retenção e contratação pública.

---

## 7. Regra de classificação para futuras auditorias

Um módulo só pode ser classificado como **pronto para homologação** quando houver implementação persistente, testes de fluxo completo, permissões, isolamento tenant, auditoria, backup/restauração, documentação, critérios de aceite e validação browser.

Um módulo com telas, tabelas e algumas operações persistentes, mas com lacunas relevantes, deve ser classificado como **fundação operacional** ou **protótipo operacional**.

Um módulo cadastrado no catálogo sem rota real deve ser classificado como **apenas cadastrado**, mesmo que exista uma descrição no Supabase.

Um TR amplo deve ser chamado de **base funcional aproveitável**, não de ETP nem de pacote de contratação completo.

---

## 8. Guardrails para o próximo agente

- Não expor senhas, tokens ou service keys.
- Não usar a conta compartilhada do administrador como única conta de teste.
- Não executar testes destrutivos no ambiente publicado com dados reais.
- Não inserir dados reais para mascarar ausência de implementação.
- Não executar migrations já registradas.
- Não declarar integração PNCP, TCE-PR ou outra integração externa sem prova da API, autenticação, recibo, falha, reenvio e auditoria.
- Não tratar RLS habilitado como prova de autorização correta.
- Não tratar auditoria técnica como certificação jurídica.
- Não publicar `private-review-saldos/` ou dados pessoais em ZIP/site/Drive público.
- Não alterar Biblioteca, Atos Oficiais ou outros módulos fora do escopo da entrega sem plano de regressão.
- Ao promover uma entrega, registrar migration, rollback, arquivos, testes, evidências, limitações e destino publicado.

---

## 9. Referências de trabalho

- Handoff principal: `docs/handoff-status-compras-2026-10-01.md`.
- Inventário da produção: `docs/relatorio-consolidado-producao-2026-10-01.md`.
- Gestão de Trabalho: `docs/gestao-trabalho-2026-10-01.md`.
- Atas, Saldos e Pedidos: `docs/melhorias-atas-saldos-pedidos-2026-10-01.md` e `docs/aprovacao-atomica-atas-2026-10-01.md`.
- TRs: pasta `documentos-compartilhados/`.
- Projeto principal: `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`).
- Projeto de homologação: `homologacao-compras-2026-10-01` (`xnktywrdoqlacwmdemfp`).

**Este README é um diagnóstico técnico e um prompt de continuidade. Não constitui parecer jurídico, certificação de conformidade, ETP oficial ou aceite municipal.**
