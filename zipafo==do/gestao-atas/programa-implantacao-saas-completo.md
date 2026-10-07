# Programa de implantação do SaaS municipal completo

**Data de referência:** 01/10/2026
**Objetivo:** transformar a Intranet existente em uma solução SaaS municipal efetivamente implementável, operável, auditável, homologável e especificável em contratação pública.

## 1. Compromisso de entrega

A solução não será tratada como MVP. Cada módulo somente poderá ser classificado como **pronto para homologação** quando possuir fluxo completo, regras persistentes, autorização por perfil e tenant, auditoria, relatórios, operação, documentação e testes com evidências.

A execução será feita em ondas técnicas. Isso não reduz o escopo: evita publicar simultaneamente funcionalidades incompletas, misturar dados de teste com dados reais ou declarar como concluído aquilo que ainda depende de decisão municipal, integração externa ou validação jurídica.

## 2. Estado real observado

Existem seis módulos cadastrados no catálogo: Atas/Pedidos/Saldos, Estoque, Gestão de Trabalho, Atos Oficiais, Biblioteca e Compras Públicas.

A situação atual é:

| Módulo | Situação de partida | Tratamento no programa |
|---|---|---|
| Atas, Pedidos e Saldos | Núcleo operacional evoluído, com aprovação atômica, reservas, entregas e timeline em evolução | Primeiro módulo a fechar e homologar |
| Gestão de Trabalho | Fundação operacional com tabelas, RLS, RPCs e interface | Completar permissões, recorrência, documentos, relatórios e E2E |
| Compras Públicas | Protótipo operacional avançado com fundação de processos, etapas e contratos | Completar fluxos jurídicos/administrativos, execução e integrações |
| Biblioteca Municipal | Implementação parcial com TR localizado | Auditoria requisito a requisito e fechamento funcional |
| Atos Oficiais | Legado com rota e tabelas, mas sem TR/ETP e com policies a revisar | Reespecificar, proteger e homologar antes de contratar |
| Estoque e Almoxarifado | Ativo no catálogo, porém sem rota funcional comprovada | Desativar temporariamente ou implementar como módulo próprio |

Até o momento, foram localizados três TRs e nenhum ETP formal. Os TRs são fontes funcionais, mas não substituem o ETP da contratação do SaaS, análise de alternativas, dimensionamento, custos, riscos, SLA, operação, portabilidade e saída.

## 3. Arquitetura-alvo

O produto será tratado como plataforma multi-tenant municipal, com isolamento lógico verificável e possibilidade de instância dedicada por município. Toda entidade operacional deve possuir tenant, ator, timestamps, estado controlado, política de retenção e regras de exportação.

A arquitetura-alvo possui oito camadas:

1. **Identidade:** Supabase Auth, Google/OIDC quando autorizado, vinculação a usuário municipal, desativação, recuperação e MFA para perfis privilegiados quando disponível.
2. **Tenant e organização:** município, unidades, memberships, perfis, papéis, escopos e segregação entre administrador municipal e operador da plataforma.
3. **Autorização:** RLS, policies específicas por operação, grants mínimos, funções de negócio e testes cross-tenant.
4. **Domínio:** módulos funcionais com RPCs transacionais, estados, invariantes, versionamento e auditoria.
5. **Documentos:** Storage privado, metadados, tipos permitidos, limite, retenção, acesso temporário e registro de download.
6. **Experiência:** telas responsivas, linguagem clara, acessibilidade básica, feedback de erro, busca, filtros, exportações e navegação consistente.
7. **Operação:** logs, métricas, alertas, backup, restauração, migrações, rollback, suporte, incidentes e continuidade.
8. **Contratação e saída:** documentação de requisitos, SLA, critérios de aceite, portabilidade, transição e encerramento.

## 4. Ondas de implementação

### Onda 0 — Governança técnica e proteção

Antes de novas expansões, será mantido o princípio de não usar produção para testes destrutivos. Cada alteração de banco terá migration identificável, verificação de pré-condições, evidência, rollback ou estratégia de reversão e publicação rastreável.

Também serão tratados os seguintes pontos: contas de teste individuais, remoção de credenciais de arquivos, inventário de Storage/Auth, revisão das seis tabelas com RLS sem policy declarada, política de mudança e documentação de ambientes.

**Gate 0:** ambientes identificados, backup verificável, fixture isolado, responsável por aceite e plano de reversão.

### Onda 1 — Atas, Pedidos e Saldos

O ciclo completo a ser fechado é:

`ata → item → saldo físico → reserva → pedido → aprovação/reprovação → consumo → entrega parcial/final → cancelamento/estorno autorizado → encerramento → relatório → auditoria`.

Já existe o núcleo de reserva, aprovação atômica, rejeição, cancelamento, entrega e timeline. As próximas entregas são: estorno formal segregado, encerramento, relatórios consolidados, anexos privados, validação cross-tenant, concorrência com duas conexões e E2E autenticado.

**Gate 1:** nenhum saldo negativo, aprovação idempotente, concorrência validada, justificativas obrigatórias, entrega parcial/final, cancelamento protegido, estorno autorizado, timeline completa, relatório exportável, RLS positivo/negativo e restore comprovado.

### Onda 2 — Plataforma SaaS comum

Será consolidada uma matriz única de autorização para recursos e operações. O padrão não será “RLS habilitado = seguro”; cada tabela deverá ter policy verificável ou justificativa documentada para acesso exclusivo por funções privilegiadas.

Serão implementados ou revisados: onboarding de tenant, gestão de unidades, revisão de acessos, notificações persistentes, Storage, busca autorizada, exportações, configurações municipais, feriados, auditoria protegida, observabilidade e documentação dos contratos internos.

**Gate 2:** dois tenants de teste, dois usuários com escopos distintos, tentativa cross-tenant bloqueada, acesso administrativo segregado e trilha de auditoria consultável.

### Onda 3 — Gestão de Trabalho

Completar tarefas, demandas, projetos, agenda, rotinas, recorrência, ocorrências, dependências, subtarefas, capacidade, conflitos, comentários, anexos, notificações, indicadores, relatórios e pesquisa. As policies serão especializadas por papel e objeto, não apenas por tenant.

**Gate 3:** fluxo de ponta a ponta por solicitante, responsável, supervisor e administrador; teste de conflito, carga, recorrência, anexos, notificações e exportação.

### Onda 4 — Compras Públicas

Completar planejamento, PCA, demanda, ETP, TR, pesquisa de preços, fornecedores, propostas, julgamento, recursos, adjudicação, homologação, publicação, contrato, execução, medições, atestos, aditivos, reajustes, sanções e encerramento.

Integrações como PNCP, TCE-PR, SIM-AM ou outras somente serão declaradas concluídas com API, autenticação, reenvio, idempotência, recibo, tratamento de falha e auditoria demonstrados. Sem isso, serão documentadas como adaptadores pendentes ou exportações manuais.

**Gate 4:** cada etapa possui ator, estado, decisão, documento, versão, prazo, evidência e regra de transição.

### Onda 5 — Biblioteca Municipal

Fechar catálogo, obras, exemplares, autores, circulação, empréstimo, devolução, renovação, reserva, atraso, inventário, aquisições, doações, descarte, transferência, eventos, documentos, indicadores, relatórios, múltiplas unidades e proteção dos dados de leitores.

**Gate 5:** inventário reconciliado, circulação completa, relatórios, importação/exportação, políticas LGPD e teste por unidade.

### Onda 6 — Atos Oficiais e Estoque

Atos Oficiais será reespecificado antes de ser apresentado como módulo contratável, especialmente anexos, versões, configurações e cadeia de publicação. Estoque será desativado no catálogo enquanto não houver escopo e rota real, ou será implementado com TR/ETP e ciclo completo de almoxarifado.

## 5. Segurança, LGPD e governo digital

O produto deverá conter inventário de dados pessoais, finalidade, base legal aplicável, controlador, operador, compartilhamentos, retenção, descarte, canal de atendimento, encarregado, incidentes, suboperadores e controles de acesso.

A implementação observará linguagem clara, acessibilidade, transparência, interoperabilidade, formatos abertos, minimização e proteção de dados. A declaração jurídica final dependerá do Município, do encarregado, da área jurídica e do responsável por segurança. O software não substituirá ato normativo municipal, decisão administrativa ou parecer jurídico.

## 6. Operação SaaS

O pacote operacional incluirá:

- catálogo de ambientes e versões;
- migrations e rollback;
- backup lógico e físico quando disponível;
- teste de restauração separado;
- monitoramento de disponibilidade e erros;
- classificação de incidentes;
- tempos de resposta e solução;
- janela de manutenção;
- plano de continuidade;
- suporte e treinamento;
- portabilidade de dados;
- transição e encerramento contratual.

## 7. Pacote licitatório a ser produzido

A solução será acompanhada de documentação técnica que possa alimentar, sem substituir a elaboração oficial do Município:

1. matriz de módulos e requisitos;
2. ETP da contratação do SaaS;
3. estudo de alternativas e mercado;
4. mapa de riscos;
5. especificação funcional e não funcional;
6. requisitos de segurança, LGPD e acessibilidade;
7. implantação e migração;
8. treinamento e suporte;
9. SLA e indicadores;
10. critérios de aceite por marco;
11. modelo de medição e pagamento por resultado;
12. responsabilidades;
13. propriedade e portabilidade dos dados;
14. backup, restauração e continuidade;
15. transição e encerramento;
16. matriz requisito → tela → RPC → tabela/policy → teste → evidência.

## 8. Regra de declaração de prontidão

Os termos abaixo serão usados de forma controlada:

- **Protótipo:** há interface ou fluxo demonstrativo, mas faltam persistência, segurança ou aceite.
- **Fundação operacional:** há banco e fluxos relevantes, mas ainda faltam partes essenciais de operação ou homologação.
- **Pronto para homologação:** escopo funcional fechado, critérios de aceite executáveis e evidências de segurança e operação.
- **Homologado:** testes e aceite formal do Município registrados.
- **SaaS contratável:** módulo homologado, documentação contratual, operação, SLA, segurança, continuidade, portabilidade e saída definidos.

A publicação de uma migration ou de uma tela nunca será usada sozinha como prova de completude.

## 9. Próximas entregas executáveis

A sequência imediata é:

1. fechar o relatório requisito → implementação → teste → evidência;
2. corrigir as policies sem declaração e registrar justificativas;
3. completar estorno e encerramento de Atas/Pedidos/Saldos;
4. criar fixtures de homologação sem dados reais;
5. substituir o login compartilhado por contas de teste individuais;
6. executar E2E autenticado quando a conta de homologação estiver válida;
7. iniciar a matriz funcional de Gestão de Trabalho e Compras Públicas;
8. elaborar o pacote ETP/SLA/implantação/saída.

Enquanto a credencial de teste fornecida não autenticar no Supabase, testes que dependem de sessão real serão marcados como **pendentes por pré-condição**, nunca como aprovados.

## 10. Estado desta entrega

**Publicado nesta rodada:** programa de implantação e critérios de prontidão.
**Validado:** inventário documental e técnico existente, incluindo seis módulos, três TRs localizados, nenhum ETP identificado e pendências de segurança/rota já registradas.
**Pendente:** execução das ondas, homologação autenticada e aceite formal municipal.
