# Continuidade local — Compras Públicas

**Data:** 1º de outubro de 2026
**Ambiente:** cópia local reconstruída da pasta `INTRANET` do Google Drive
**Branch Supabase:** não criada; desenvolvimento e validação desta rodada são locais.

## Entrega desta rodada

Foi adicionada uma **busca unificada local** ao atalho “Localizar um processo” em `compras/index.html`/`compras/compras.js`.

A busca pesquisa somente os registros que o módulo já carregou para o tenant e perfil atual:

- Processos;
- Necessidades;
- Contratos e fornecedores associados;
- Itens do PCA;
- Publicações;
- Tarefas;
- Obrigações.

Cada resultado informa o tipo, identificação, contexto e situação. Quando há ação segura disponível, o resultado abre a ficha ou leva à aba correspondente. Não houve criação de tabela, migration, consulta adicional, alteração no Supabase ou mudança nos módulos Biblioteca/Atas/Controle de Saldos.

## Validação

- `node --check compras/compras.js`: aprovado.
- `node --check compras/area.js`: aprovado.
- `python3 -m py_compile scripts/audit-intranet-static.py`: aprovado.
- Smoke HTTP local das seis rotas de Compras, CSS e JS: HTTP 200.
- Auditor estático: mantém o resultado conhecido da linha de base, com achados legados fora de `compras/`; esses arquivos não foram alterados nesta rodada.

## Limitações conhecidas

- A busca não é server-side nem pagina os resultados; ela trabalha sobre o conjunto já carregado pelo perfil atual.
- Ela não transforma o requisito 70 em atendimento integral: ainda faltam busca cross-entidade no banco, paginação, filtros completos para contratos/documentos/atas e validação de escopo RLS em ambiente autenticado.
- Não foram executados E2E autenticado, teste cross-tenant, upload/download real, backup/restore, rollback ou publicação.
- A branch de homologação não foi criada. O Supabase estimou anteriormente `0,01344 por hora`, sem especificar moeda; nenhum custo foi incorrido pela branch nesta rodada.

## Próximo passo seguro

Continuar com melhorias de interface e testes locais determinísticos. Para testar RLS, persistência, perfis e integração processo→ata, será necessário posteriormente um ambiente de homologação autorizado com contas de teste e dois tenants fictícios.

## Atualização — migration 011

A migration aditiva `20261001001100-compras-operacao-interna.sql` foi aplicada ao Supabase principal após validação local. Ela prepara favoritos, acessos recentes, notificações internas, versões de documentos e execução contratual estruturada. A ligação desses recursos à interface será feita na próxima fase; o rollback está documentado e não foi executado.

## Atualização — fase 2: operação assistida

A fase 2 foi concluída em 1º de outubro de 2026. O frontend passou a carregar notificações internas não lidas por usuário/tenant, exibi-las no painel de atenção e permitir a marcação como lida. Cada novo documento registrado cria uma versão 1 append-only em `compras_documento_versoes`, com metadados do arquivo ou referência. A ficha de contrato agora lê o histórico legado e a execução estruturada; novos registros são gravados em `compras_execucoes_contratuais` com tipos controlados.

A migration `20261001001200-compras-notificacoes-automaticas.sql` foi aplicada ao Supabase principal. Ela cria triggers para notificar o responsável quando uma tarefa ou obrigação é criada. Não há envio de e-mail, webhook ou integração externa. A migration 011 e seu rollback permanecem registrados localmente; nenhum rollback foi executado.

Validações da fase: `node --check compras/compras.js`, `node --check compras/area.js` e checks estruturais da migration passaram. Ainda permanecem pendentes E2E autenticado, teste cross-tenant, validação real de upload/versão e aceite municipal.
