# Implementação SaaS — Biblioteca Municipal

**Ambiente:** produção
**Escopo:** elevação do frontend e backend do módulo Biblioteca Municipal ao padrão SaaS operacional.

## Entregas de backend

Foram aplicadas migrations aditivas no Supabase de produção para criar governança de circulação, bloqueios, auditoria, inventário, documentos privados e notificações. O pacote inclui as tabelas `bib_bloqueios`, `bib_auditoria`, `bib_inventarios`, `bib_inventario_itens`, `bib_documentos` e `bib_notificacoes`.

Também foram disponibilizadas RPCs protegidas para:

- criar e resolver bloqueios de leitores;
- criar reservas com validação de configuração, leitor ativo, bloqueio e duplicidade;
- renovar empréstimos com validação de prazo, status e limite parametrizado;
- iniciar inventários e registrar leituras por código;
- registrar auditoria operacional;
- consultar e salvar configuração da Biblioteca;
- listar e marcar notificações;
- registrar documentos privados.

As RPCs operacionais críticas foram configuradas sem execução para `PUBLIC` e `anon`, com execução para `authenticated`. As tabelas usam RLS com escopo por `tenant_id`.

O Storage privado `biblioteca-documentos` foi criado com políticas de upload, leitura e exclusão limitadas ao tenant. O limite de arquivo é 25 MB e o caminho precisa começar pelo identificador do tenant.

## Entregas de frontend

Foi criado `biblioteca-saas.js`, integrado a todas as páginas do módulo. O componente acrescenta uma camada visual comum com:

- barra de posicionamento do produto SaaS;
- identificação de multi-tenant, auditoria e LGPD;
- central de pendências no cabeçalho;
- contador de notificações não lidas;
- marcação de notificações como lidas;
- atalho de revisão da configuração da Biblioteca para administradores;
- helper de upload de documentos privados.

O fluxo de renovação de empréstimos deixou de atualizar a tabela diretamente e passou a usar a RPC transacional `bib_renovar_emprestimo`.

## Validações realizadas

- todos os arquivos HTML receberam exatamente uma integração com `biblioteca-saas.js`;
- arquivos JavaScript foram validados com `node --check`;
- a migration principal foi aplicada com sucesso em produção;
- a migration de documentos e configuração foi aplicada com sucesso em produção;
- tabelas, RPCs, bucket privado e políticas foram verificados no Supabase;
- o privilégio anônimo das operações protegidas foi revogado.

## Resultado

O módulo deixou de ser somente catálogo e circulação básica. Ele agora possui camada SaaS transversal, governança de circulação, parametrização, inventário, notificações, auditoria, documentos privados e proteção multi-tenant.

As etapas restantes são de homologação municipal: treinamento, teste de acessibilidade assistida, desempenho, política de retenção de histórico e decisão administrativa sobre multas, descarte e retenção de dados de circulação.


## Correção de arquitetura SaaS

Durante a verificação final, foi identificado que a tabela legada `bib_configuracoes` usa uma chave singleton histórica. Para não deixar essa limitação no novo desenho SaaS, foi criada `bib_configuracoes_saas`, com `tenant_id` como chave primária. A configuração obtida pelo novo frontend e a RPC de salvamento agora utilizam essa camada tenant-scoped; a tabela legada permanece preservada para compatibilidade com as telas existentes.
