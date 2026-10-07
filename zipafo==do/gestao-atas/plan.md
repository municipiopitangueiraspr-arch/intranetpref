# Plano de evolução da Intranet para Compras Públicas e SaaS

## Objetivo e resultado esperado

Evoluir a **Intranet Municipal existente**, não substituí-la, mantendo a identidade visual e os módulos que os usuários já conhecem: Biblioteca Municipal, Gestão de Atas/Controle de Saldos, pedidos e demais páginas atuais. Integrar ao mesmo produto um módulo operacional de **Gestão de Compras Públicas, Licitações, Contratações, Atas e Contratos**, reaproveitando fornecedores, processos, itens e saldos onde isso for seguro.

O produto final deve atender os Termos de Referência da Biblioteca e de Compras Públicas, além do fluxo de consulta de saldo e pedidos fracionados já valorizado pelos secretários. Não declarar conformidade integral, validade jurídica, prontidão SaaS ou atendimento completo ao edital antes de implementar e verificar os requisitos correspondentes.

## Decisões confirmadas

1. **Aplicação**: manter HTML/CSS/JavaScript modular da Intranet, sem introduzir outro framework nem reescrever a Biblioteca ou Gestão de Atas.
2. **Backend**: manter Supabase Auth, PostgreSQL, políticas RLS e serviços já utilizados pela aplicação. O navegador usa somente o cliente e a chave pública existente; nunca colocar `service_role` ou credencial privada no frontend.
3. **Hospedagem futura**: frontend estático no GitHub Pages; chamadas de dados continuam autenticadas para as APIs Supabase. Usar caminhos relativos/case-correct para compatibilidade com domínio de projeto e não presumir que o site estará na raiz do domínio. HTML deve buscar versões novas; arquivos estáticos podem usar parâmetros de versão/cache-busting.
4. **Preservação**: manter as pastas e fluxos existentes; mudanças na raiz da Intranet limitam-se a navegação/compatibilidade necessária para abrir os módulos no GitHub Pages. Não alterar dados de saldos ou os seis casos financeiros já reservados para revisão.
5. **Unidade SaaS**: um `tenant` representa a entidade/município cliente; `órgão` continua representando secretaria/unidade dentro dela. A base nova deve gravar `tenant_id` e RLS em todo dado do novo módulo.
6. **Integração com atas**: processo e item da licitação são a fonte para uma ação controlada de criação de ata. Uma função SQL transacional cria a ata e os itens em `public.atas`/`public.itens_ata`, inicia saldos com quantidades/valores adjudicados e registra o vínculo ao processo. Nenhuma linha antiga é sobrescrita por essa integração.
7. **Modalidade e procedimento**: campos separados e editáveis. “Registro de Preços” não é inferido como modalidade; a aplicação preserva a classificação oficial informada no edital e não inventa fundamento ou conclusão jurídica.
8. **Uso pelos secretários**: habilitar o módulo novo ao papel `SECRETARIO` para criar/acompanhar demandas; a gestão do procedimento, homologação e criação de atas exige papel de gestão de compras ou administrador.

## Diagnóstico verificado

- A intranet já possui um shell com navegação por `modulos_sistema`, autenticação Supabase e componentes compartilhados (`intranet-base.css`, `componentes.css`, `faq-theme.css`, `layout.js`).
- A Biblioteca existente contém páginas de catálogo, leitores e circulação ligadas a tabelas/vistas `bib_*`; as tabelas `bib_*` auditadas estão vazias. A gravação das tabelas da Biblioteca está restrita a ADMIN, enquanto policies `SELECT USING (true)` permitem leitura a qualquer usuário autenticado — risco de privacidade, especialmente para dados de leitores.
- Gestão de Atas já tem dados reais. A auditoria anterior contou 159 atas, 928 itens e 137 fornecedores; 521 saldos e 96 modalidades foram corrigidos na tarefa anterior. Seis exceções financeiras foram preservadas para revisão posterior e ficam fora desta alteração.
- A tela atual de processos licitatórios usa dados de demonstração; esse conteúdo não pode ser apresentado como registro real. O novo módulo deve mostrar estados vazios informativos e persistir somente dados de usuários.
- Há um erro de caixa na rota registrada da Biblioteca (`biblioteca/dashboard.html`) versus a pasta (`biblioteca/`), e múltiplos caminhos absolutos `/...` em páginas existentes. Ambos podem falhar em um GitHub Pages publicado em subdiretório.
- A maioria das tabelas existentes tem RLS, mas isso não equivale a isolamento por município. O esquema legado `usuarios`/`orgaos` pressupõe uma única intranet/município e ainda não foi migrado para tenants.
- Existem buckets públicos para documentos de atos e capas da Biblioteca. Não serão reaproveitados para arquivos de compras sem auditar antes suas políticas.
- A inspeção estática encontrou cinco CSS sem referência literal: três em Controle de Saldos, um em Gestão de Atos Oficiais e um em core. Nenhum será removido apenas por esse indício; a exclusão exige prova adicional de que não há carregamento dinâmico nem necessidade de recuperação.

## Organização proposta

- `compras/index.html`: entrada do módulo, layout compartilhado, navegação e estados vazios reais.
- `compras/compras.css`, `compras/compras.js`, `compras/area.js`: estilos e módulos operacionais do painel, das rotas de artefatos/decisões/governança/auditoria e da ficha dedicada de processo.
- `compras/index.html`, `compras/artefatos.html`, `compras/decisoes.html`, `compras/governanca.html`, `compras/auditoria.html`, `compras/processo.html`: entradas estáticas compatíveis com navegação relativa e a sessão compartilhada.
- `supabase/migrations/`: migrations SQL aditivas e versionadas para tenant/membership, cadastros, RLS, auditoria, RPCs e integração processo→ata.
- `docs/`: matriz de rastreabilidade dos requisitos, riscos, passos de implantação e tarefas pendentes para tornar também os módulos legados seguros para SaaS.
- `ideas.md`: direção visual do novo módulo no idioma da solicitação.

## Cobertura funcional a implementar

### Núcleo de Compras Públicas

- Painel sem números simulados: demandas, processos, tarefas e prazos carregados do banco, com estados vazios explícitos.
- Demandas de compra com unidade solicitante, objeto, justificativa, prioridade, estimativa, responsável, status e histórico.
- Processos com identificador/ano, vínculo de demanda, unidade, objeto, modalidade, procedimento, fundamento somente quando informado, datas, responsáveis e status.
- Itens do processo e participantes/fornecedores reutilizando o cadastro existente, sem duplicar fornecedor.
- Tarefas e etapas com responsável, prazo, prioridade e status; visão das pendências e próximos vencimentos.
- Documentos vinculados ao processo/demanda com tipo, nome, referência e metadados; anexos privados reais dependem de configuração Storage/policies revisada.
- Fluxos configuráveis e versionados, com etapas/subetapas congeladas para processos iniciados. Calendário, dias úteis e feriados configuráveis.
- Pesquisa de preços com fontes e memória de cálculo; propostas, julgamento e recursos; publicações e obrigações com registro de link, data, comprovante e responsável.
- Contratos, vigência, gestores/fiscais, execução, medições/entregas, aditivos, reajustes, ocorrências e encerramento.
- Relatórios rastreáveis; adaptadores PNCP e TCE-PR/SIM-AM independentes, usando dados oficiais e regras municipais configuráveis, nunca conclusões jurídicas automáticas.

### Integração com os módulos atuais

- Cadastro de fornecedor referencia `public.fornecedores`.
- Processo e itens adjudicados podem ser convertidos em ata e `itens_ata` por RPC atômica, com revisão dos valores/quantidades antes da confirmação. A ação preenche os campos existentes (número de processo, modalidade, fornecedor, itens, saldo inicial) e grava relação reversível pelo `processo_compras_id`.
- Os fluxos já usados por secretários para consultar atas, carrinho, pedidos e entregas fracionadas permanecem como estão; mudanças neles ficam isoladas a correções de compatibilidade necessárias.
- A Biblioteca continua como módulo próprio, preservando seu catálogo/circulação. Aquisições de livros e outros itens podem futuramente gerar demanda/compra; primeiro deve ser definida a integração de identificadores e o acesso dos perfis de biblioteca.

## Segurança e dados

- Auditoria antes e depois das migrações; `tenant_id` obrigatório para dados novos; políticas RLS por membership e papel; operações privilegiadas só por RPC restrita ou usuário administrativo.
- Tabelas de histórico/auditoria são append-only para o usuário comum.
- Não presumir permissões apenas porque um botão foi ocultado; RLS valida cada operação.
- Dados financeiros e de processos já existentes ficam intactos, exceto adição nullable da chave de integração; correções de saldos anteriores e seus seis casos pendentes não são reexecutados.
- A RLS da Biblioteca e os demais módulos não se tornam multi-tenant automaticamente por existir uma tabela de tenants. O retrofit de `usuarios`, `orgaos`, atas/pedidos, Biblioteca, atos e Storage requer migração e testes próprios antes de oferecer SaaS a outro município.

## Implementação em etapas

1. **Base e protótipo operacional real**: publicar o módulo no menu, corrigir caminhos necessários, preparar tenancy/membership e tabelas RLS, cadastrar demanda, processo, itens e tarefas com dados reais; criar a integração transacional de processo homologado para ata/itens; testar sintaxe e permissões.
2. **Cobertura funcional do Termo de Compras**: motor de fluxos e versões, PCA, contratação direta, ETP/TR, pesquisa e mapa de preços, participantes/propostas/recursos, publicações, PNCP/TCE-PR e relatórios.
3. **Contratos e execução**: obrigações, agenda/feriados, gestores/fiscais, vigência, entregas/medições/pagamentos, aditivos/reajustes, ocorrências e encerramento.
4. **SaaS completo dos módulos existentes**: desenhar a migração multi-tenant de usuários/unidades, Biblioteca, Gestão de Atas/pedidos, Atos Oficiais, Storage, permissões e dados; corrigir leitura ampla de dados de leitores com perfis expressamente designados; executar testes de isolamento entre dois tenants de teste antes de produção.
5. **Prontidão para publicação/licitação**: completar matriz de cobertura dos Termos, validar fluxos com os usuários municipais, compatibilidade por caminho/case no GitHub Pages, acessibilidade, cópias de segurança, recuperação, logs e documentação de implantação. Não publicar publicamente nem afirmar atendimento integral antes dessa etapa.

## Verificação e critérios para declarar pronto

- SQL: migração aplicada em transação, esquema e FKs conferidos, RLS habilitada em cada tabela nova, grants/PERMITIDOS limitados, funções `SECURITY DEFINER` com `search_path` fixo e nenhuma chave privilegiada no frontend.
- Integridade: nenhuma alteração aos seis saldos pendentes; nenhum dado de demonstração exibido como real; processo/ata ligados por identificador UUID único; criação de ata e itens é atômica; quantidades, unidade, preço e saldo inicial coincidem com a revisão adjudicada.
- Frontend: autenticação existente, navegação direta, caminhos relativos e caixa de pasta corretos; mensagens claras para erros e listas vazias; labels e filtros compreensíveis; responsividade pelo CSS e controles acessíveis.
- Cobertura: todos os requisitos funcionais e critérios de aceite dos dois Termos ficam associados a tela/tabela/policy/teste, e toda dependência jurídica/externa fica identificada como configuração ou integração pendente.
- Regressão: nenhum módulo legado foi reescrito; alterações de shell/rota são pequenas e código JavaScript/CSS passa validação; itens não comprovados permanecem no ToDo como pendentes.

## Limitações desta etapa

A auditoria encontrou riscos de isolamento e uma rota incompatível com o GitHub Pages. A nova base pode ser tenant-aware, mas a Intranet inteira **não é ainda um SaaS multi-tenant pronto para produção**. A implementação deve avançar sem esconder essa lacuna e sem declarar que os dois Termos foram integralmente atendidos até que a matriz e os testes confirmem o contrário.


## Andamento — 1º de outubro de 2026

As dez migrations incrementais de Compras estão aplicadas e versionadas localmente (onze entradas live contando a migração anterior de modalidade). O módulo tem seis rotas autenticadas, inclusive artefatos/versões, decisões append-only, governança de fontes, auditoria e ficha de processo. A migration 009 adiciona versionamento atômico de regras/fontes; a migration 010 valida vínculos de mesmo tenant/processo entre documentos, etapas, artefatos, decisões e atas. A aprovação do conteúdo e os testes de produção continuam pendentes.

A validação live confirmou RLS habilitado nas 22 tabelas de Compras/núcleo multi-tenant e o contrato entre `initLayout` (ID legado inteiro) e `app_tenant_memberships.user_id`. A RPC `compras_concluir_etapa` foi confirmada como `SECURITY INVOKER`, com execução concedida a `authenticated`; ainda não foi testada com perfis/dados reais. A sintaxe JS e checks estruturais passaram; falta E2E autenticado e teste negativo entre tenants. A operação real com PNCP/TCE-PR, artefatos legais versionados, medição/pagamento estruturados, integração de acervo da Biblioteca e aceite municipal continuam pendentes. Os seis casos de saldo permanecem em arquivo privado fora da árvore publicável. Nenhum arquivo CSS foi apagado por mera ausência de referência.

### Auditoria 1–10 — rodada de 1º de outubro de 2026

Foi criado `scripts/audit-intranet-static.py`, com relatório `docs/auditoria-intranet-local.json`: 61 páginas HTML ativas, 21 CSS, 60 JS, 10 migrations locais e 443 referências estáticas. O scan detecta 27 links/assets quebrados fora de Compras e 24 caminhos absolutos root-relative; não encontra erro de caixa nem referência quebrada em `compras/`. Os seis caminhos de Compras retornaram HTTP 200 no servidor estático local e `node --check` passou para `compras.js` e `area.js`. Isso não cobre requisições Supabase autenticadas, execução dinâmica, publicação em subdiretório ou regressão funcional.

O relatório `docs/auditoria-requisitos-1-10.md` registra a coleta live do Supabase e proveniência/hash de quatro documentos do Drive. Foram confirmadas onze migrations no histórico (dez de Compras e a migration de modalidade anterior), RLS/grants das tabelas de governança, as propriedades das RPCs, nove constraints da migration 010 validadas e um único tenant ativo. O auditor de performance não encontra FK sem índice em tabela `compras_*`; seguem 16 pares de policies permissivas de SELECT a revisar/testar. Backup/restauração, rollback ensaiado, teste entre dois tenants e aceite institucional permanecem explicitamente pendentes. A matriz `docs/matriz-atendimento-compras.md` contém um adendo que substitui a linha de base somente para os requisitos 1–10.
