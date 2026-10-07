# Acabamento de produto SaaS — Atas, Pedidos e Saldos

**Ambiente desta rodada:** produção

## Resultado

O módulo recebeu uma camada de experiência SaaS transversal. O cabeçalho agora apresenta uma central de pendências com contador de não lidas, painel de notificações e marcação de leitura. A primeira entrada de administradores apresenta um onboarding para configuração do Município, órgão gestor, prazo de aprovação, expiração de reservas e canal de suporte.

A experiência de documentos foi iniciada de forma segura: o módulo possui bucket privado `compras-documentos`, metadados tenant-scoped, limite de 25 MB, caminho obrigatório com `tenant_id`, registro por RPC protegida e políticas de Storage para upload, leitura e exclusão dentro do próprio tenant. O recebimento e o registro de ocorrência permitem selecionar anexo privado.

## Backend aplicado

Foram criados `compras_configuracoes_tenant` e `compras_documentos_modulo`, além das RPCs `compras_listar_notificacoes`, `compras_marcar_notificacao_lida`, `compras_obter_configuracao_tenant`, `compras_salvar_configuracao_tenant` e `compras_registrar_documento`. As operações de configuração e registro de documentos usam `SECURITY DEFINER`, `search_path` fixo e grants sem execução anônima.

A implantação foi adaptada ao schema existente: já havia uma tabela `compras_documentos` pertencente a outro fluxo de compras. Em vez de sobrescrever ou alterar dados existentes, a nova funcionalidade usa `compras_documentos_modulo`.

## Frontend aplicado

Foi criado o módulo `saas-experience.js`, integrado ao bootstrap principal. Ele injeta a central de notificações, o onboarding responsivo, feedback de operação e o helper de upload privado. O módulo de pedidos foi conectado para anexar documentos a entregas e ocorrências.

A validação técnica passou em todos os arquivos JavaScript com `node --check`. A estrutura das novas RPCs, bucket privado, tabelas e funções foi aplicada diretamente na produção, conforme orientação desta rodada.

## Pendências para o aceite definitivo

Ainda é necessário realizar com usuários municipais: roteiro de acessibilidade assistida, teste de desempenho, treinamento, validação visual em navegadores homologados, devolução formal de mercadoria já entregue, política de retenção e eliminação de documentos e revisão jurídica do tratamento de dados pessoais. Estas etapas são de homologação e governança; não foram declaradas falsamente como concluídas pela implementação técnica.
