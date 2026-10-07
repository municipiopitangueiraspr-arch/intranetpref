# Compras Públicas — Intranet Municipal

**Rotas:** `compras/index.html` (painel/processos), `compras/artefatos.html`, `compras/decisoes.html`, `compras/governanca.html`, `compras/auditoria.html` e `compras/processo.html`, `compras/operacao.html` (central operacional SaaS). Todas reutilizam o shell, a sessão Supabase, `shared/js/supabase.js`, `shared/js/layout.js` e o design system da Intranet. Para escolher Biblioteca ou Gestão de Atas/Controle de Saldos, o usuário retorna à Intranet.

## O que já é possível fazer

- Registrar e acompanhar necessidades; abrir processos com modalidade/procedimento separados, itens e fornecedores.
- Acompanhar tarefas, prazos e etapas copiadas de um fluxo publicado; concluir tarefas como responsável/gestor e concluir etapas somente após dependências e documentos obrigatórios.
- Registrar fontes de pesquisa de preços por item, condições, fornecedor, link/documento e nota da memória de cálculo; consultar min/média/máx descritivos sem escolha automática do preço de referência.
- Planejar itens do PCA por ano e unidade.
- Registrar manualmente publicações/canais e obrigações; visualizar obrigações e tarefas na Agenda.
- Registrar documentos e contratos, acompanhar eventos de execução (fiscalização, medição, recebimento, pagamento, aditivo etc.), concluir obrigações e baixar relatório CSV; após revisão do resultado homologado, criar ata/saldos pela RPC transacional.
- Voltar à página da Intranet para escolher Gestão de Atas/Controle de Saldos ou Biblioteca; esses módulos permanecem preservados e independentes.

As opções de modalidade/procedimento são classificações editáveis, não uma conclusão jurídica. O painel de Publicações é manual e não envia dados ao PNCP ou a outro portal.

## Áreas independentes

- **Artefatos:** estrutura minutas de ETP, TR, edital e outros documentos; cada nova revisão é salva como rascunho/em revisão sem sobrescrever versões anteriores.
- **Decisões:** histórico append-only de atos, autoridade, motivação e fundamentos informados; correções devem apontar para o ato anterior.
- **Regras e fontes:** versões identificadas de norma legal, procedimento interno e parâmetro de sistema, sem interpretação jurídica automática.
- **Auditoria:** consulta do histórico de mudanças do módulo por usuários autorizados.
- **Ficha do processo:** rota dedicada que agrega etapas, documentos, tarefas, decisões, artefatos e contratos do processo.

## Integrações

- `public.compras_*`: tabelas tenant-scoped para demandas, planejamento, processos, itens, fluxos, tarefas, documentos, publicações, obrigações e contratos.
- `public.atas` / `public.itens_ata`: integração controlada processo→ata, sem sobrescrever o saldo antigo.
- `controle-de-saldos/gestao-atas.html`: consulta operacional existente de atas e saldos, incluindo fluxos de pedidos já valorizados pelos secretários.
- `biblioteca/dashboard.html`: módulo existente, preservado; integração de aquisição de acervo com Compras ainda é uma etapa futura.

## Segurança e implantação

O navegador usa apenas a sessão Supabase autenticada e a chave pública já configurada. RLS no banco é a autoridade final; não inserir chave `service_role` em frontend estático. Dez migrações incrementais de Compras estão aplicadas, mas a Intranet completa ainda requer teste de isolamento por dois tenants, revisão independente e regressão dos módulos legados.

Na migration 010, o banco passou a exigir vínculos de mesmo tenant/processo entre etapas, documentos, artefatos, decisões e atas; nove constraints foram validadas no catálogo live. O roteiro [`rollback-20261001001000-compras-same-process-integrity.sql`](../supabase/rollbacks/rollback-20261001001000-compras-same-process-integrity.sql) é apenas um procedimento de contingência, não foi executado e pressupõe backup verificado.

## Central operacional SaaS

A central `operacao.html` cobre as operações estruturadas de propostas, recursos, execução contratual (medição, atesto, entrega, empenho, pagamento e ocorrências), assinaturas, delegações, escalonamentos, conectores municipais e fila idempotente de transmissões. A fila não simula integrações externas: um worker seguro deve ser configurado com as credenciais oficiais do município para processá-la.

## Limite de prontidão

Esta entrega é um **protótipo operacional incremental**. Não declarar cobertura integral dos Termos de Referência nem SaaS pronto para produção. Integrações reais PNCP/TCE-PR, medição e pagamento estruturados, modelagem de fluxos, notificações, artefatos formais/versionados, integração de aquisição da Biblioteca e homologação de perfis ainda estão pendentes. Consulte [`docs/implantacao-compras.md`](../docs/implantacao-compras.md) e [`docs/matriz-atendimento-compras.md`](../docs/matriz-atendimento-compras.md) para a cobertura e próximos passos.
