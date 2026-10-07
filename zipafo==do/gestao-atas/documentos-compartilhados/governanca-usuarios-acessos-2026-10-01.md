# Governança de usuários e acessos

## Entrega

O painel de administração foi substituído por uma central de governança com três áreas: solicitações de acesso, usuários e auditoria.

Na área de solicitações, o administrador visualiza identidade Google, justificativa, tenant, órgão, perfil e módulos solicitados. A aprovação agora passa por `admin_revisar_solicitacao_acesso`, com parâmetros completos de tenant e unidade, evitando a chamada incompleta que existia na versão anterior. A decisão registra evento de auditoria.

Na área de usuários, o administrador pode pesquisar por nome/e-mail, filtrar por status e perfil, alterar nome, cargo, telefone, órgão, perfil, status e módulos permitidos. Toda alteração passa por `admin_atualizar_usuario`, é transacional e registra o antes/depois no histórico.

A área de auditoria apresenta os eventos de alteração e decisão, com data, usuário afetado, ator e detalhes JSON.

## Supabase

Foi criado `usuarios_acesso_eventos`, com índices por usuário e solicitação. Foram criadas as RPCs:

- `admin_listar_usuarios`;
- `admin_listar_solicitacoes_acesso`;
- `admin_atualizar_usuario`;
- `admin_revisar_solicitacao_acesso`.

As RPCs verificam administrador ativo, usam `SECURITY DEFINER` com `search_path` fixo e não têm execução pública. A execução está disponível somente para `authenticated`.

RLS foi habilitado em `usuarios`, `usuarios_modulos` e `usuarios_acesso_eventos`. Usuários podem consultar seu próprio cadastro e permissões; administradores podem administrar o conjunto. A função de atualização do usuário impede elevação de privilégio por alteração direta do próprio perfil, status ou órgão.

Também foi aplicada a correção de herança de privilégios: revogação de `EXECUTE` de `PUBLIC` e `anon` para as funções administrativas e operacionais relevantes.

## Validação

- Página validada com `node --check` no JavaScript modular embutido;
- arquivos locais conferidos e publicados no Drive;
- produção com objetos, funções, grants e RLS verificados;
- staging restaurado fisicamente pelo fluxo de pausa/restauração e voltou para `ACTIVE_HEALTHY`;
- migration de governança reaplicada em staging após a restauração;
- validação autenticada final depende de uma conta administrativa de homologação com credencial válida.

## Observação de segurança

O advisor do Supabase ainda aponta achados históricos em outros módulos: tabelas públicas sem RLS, funções antigas com `search_path` mutável e proteção contra senhas vazadas desabilitada. Esses achados não foram mascarados como resolvidos por esta entrega e devem compor o backlog de segurança transversal do SaaS.
