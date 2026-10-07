# Matriz de Conformidade — Módulo de Atas, Pedidos e Saldos

**Sistema:** Intranet Municipal — Prefeitura Municipal de Pitangueiras  
**Escopo:** módulo de consulta de atas, controle de saldos, pedidos, aprovações, consumo, entregas, ocorrências e relatórios.  
**Versão da matriz:** 1.0  
**Data da avaliação:** 7 de outubro de 2026  
**Ambiente avaliado:** Supabase `gestao-atas-pitangueiras` (`qgkjnzcqjhhqdgxmvtew`) e código versionado no repositório `municipiopitangueiraspr-arch/intranetpref`.

> **Importante:** esta matriz é um instrumento de engenharia, governança e preparação para contratação. Ela não é certificação jurídica, parecer da Procuradoria, auditoria independente nem declaração de conformidade integral. A aplicação de cada norma deve ser confirmada pela Prefeitura, pelo encarregado de dados, pela área de controle interno e pela assessoria jurídica.

## 1. Legenda

| Status | Significado |
|---|---|
| **Atendido tecnicamente** | Há mecanismo implementado e evidência verificável no código, banco ou interface. Não significa que a obrigação institucional inteira esteja cumprida. |
| **Parcial** | Existe uma parte do controle, mas faltam processo institucional, integração, configuração, documentação ou cobertura adicional. |
| **Pendente** | Não foi encontrada implementação suficiente no escopo avaliado. |
| **Fora do escopo direto** | A regra depende de portal, ato, processo ou sistema externo; o módulo pode apoiar, mas não substitui a obrigação. |

## 2. Resumo executivo

| Tema | Situação atual | Leitura executiva |
|---|---|---|
| **Segurança de acesso e segregação** | **Parcial / forte base técnica** | Há autenticação, perfis, RLS, tenant e permissões. Ainda é necessário formalizar matriz de papéis, revisão periódica e procedimento de desligamento. |
| **Rastreabilidade e auditoria** | **Atendido tecnicamente / parcial institucional** | Há `pedidos_eventos`, `atas_historico`, `auditoria_eventos`, `logs_operacoes` e timeline operacional. Faltam política de retenção, exportação probatória e rotina de revisão. |
| **Controle de pedidos, reservas e saldos** | **Atendido tecnicamente** | Há aprovação atômica, reservas, consumo, entregas, estornos e validações server-side. Deve continuar sendo coberto por testes e homologação. |
| **LAI e transparência ativa** | **Parcial** | O módulo oferece consultas e exportações internas; não é, sozinho, Portal da Transparência nem canal formal de pedido de acesso. |
| **LGPD** | **Parcial** | Há isolamento por tenant, escopo por unidade e controle de acesso; faltam inventário de dados, bases legais, avisos, direitos do titular, retenção e resposta a incidentes. |
| **Lei 14.133/2021** | **Parcial** | O módulo controla execução operacional de atas e pedidos; o ciclo completo de contratação e a publicidade no PNCP dependem do módulo de Compras e de procedimentos oficiais. |
| **Governo Digital e interoperabilidade** | **Parcial** | A arquitetura já usa identificadores comuns, tenant e vínculos entre processo, ata, contrato e pedido; ainda faltam API, catálogo de integrações, eventos e monitoramento de transmissão. |
| **Assinatura, arquivos e preservação** | **Pendente / parcial** | Existem anexos e documentos, mas o módulo não implementa assinatura eletrônica qualificada nem política completa de preservação arquivística. |
| **Acessibilidade** | **Parcial** | Existem melhorias de foco, navegação e auditoria automatizada; a auditoria atual ainda reporta achados e exige correção e teste manual. |

## 3. Matriz normativa principal

### 3.1 Lei nº 12.527/2011 — Lei de Acesso à Informação (LAI)

| Artigo / tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Arts. 3º, 6º e 7º | Garantir acesso à informação, gestão transparente e proteção da informação | Tela `controle-de-saldos/gestao-atas.html`; consulta de atas e itens em `js/modules/consulta.js`; filtros e exportação | **Parcial** | Definir quais dados são públicos, quais são internos e quais contêm informação pessoal; publicar os dados públicos em canal oficial. |
| Art. 8º | Transparência ativa, inclusive divulgação em sítio oficial | `js/modules/relatorios.js` possui relatórios de saldos, consumo, pedidos, fornecedores e auditoria; não há publicação pública automática desse conteúdo | **Parcial** | Criar visão/API pública somente com campos autorizados, atualização, responsável, histórico de publicação e validação pelo Portal da Transparência. |
| Arts. 10 a 14 | Procedimento para pedido de acesso à informação e resposta | O módulo não é um e-SIC e não possui fluxo de solicitação LAI | **Fora do escopo direto** | Integrar ou referenciar o e-SIC oficial; não tratar pedidos LAI como pedidos de compra. |
| Arts. 25 e 31 | Segurança, sigilo e proteção de informação pessoal | RLS, políticas `*_deny_anon`, escopo de tenant/unidade e perfis em `usuarios` | **Parcial** | Criar classificação da informação, regras de anonimização e revisão das consultas/exportações para evitar exposição indevida. |

### 3.2 Lei nº 13.709/2018 — LGPD

| Artigo / tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Art. 6º | Princípios de finalidade, adequação, necessidade, segurança e prestação de contas | Seleções por campos específicos em várias consultas; perfis e escopo por unidade/tenant | **Parcial** | Documentar finalidade de cada campo e remover dados não necessários das telas e exportações. |
| Arts. 7º e 23 | Bases legais e tratamento pelo Poder Público | O banco possui usuários, contatos, fornecedores e responsáveis; não há registro de finalidade/base legal por tratamento | **Pendente** | Inventariar tratamentos, indicar controlador/operador, finalidade, base legal, prazo e área responsável. |
| Arts. 18 e 19 | Direitos do titular e confirmação/acesso | Não foi localizado fluxo de atendimento ao titular no módulo | **Pendente** | Criar procedimento institucional e, se fizer sentido, tela administrativa para localizar, exportar, corrigir e registrar atendimento. |
| Arts. 37 e 38 | Registro das operações e avaliação de impacto quando aplicável | `auditoria_eventos`, `logs_operacoes`, `pedidos_eventos` e `atas_historico` registram operações; não substituem ROPA ou RIPD | **Parcial** | Integrar a matriz ao ROPA/RIPD da Prefeitura e registrar finalidade, categoria de dados e retenção. |
| Arts. 46 a 49 | Medidas de segurança e governança | RLS por tenant, `app_private.current_user_id()`, `app_private.current_tenant_id()`, políticas por perfil/unidade, RPCs com validação | **Atendido tecnicamente / parcial** | Completar MFA quando aplicável, gestão de segredos, backups, restauração testada, monitoramento, resposta a incidentes e revisão de acessos. |
| Art. 48 | Comunicação de incidente relevante | Não foi localizado módulo ou procedimento de incidente de dados pessoais | **Pendente** | Criar plano de resposta, classificação de incidentes, responsáveis, evidências, prazos e comunicação à ANPD/titulares quando exigível. |

### 3.3 Lei nº 14.129/2021 — Governo Digital

| Artigo / tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Princípios de desburocratização e serviços digitais | Reduzir controles paralelos e facilitar acesso a serviços | Consulta centralizada, carrinho, pedidos, fila de aprovação, notificações e relatórios | **Atendido tecnicamente / parcial** | Medir tempo de atendimento, redução de planilhas e satisfação dos usuários. |
| Interoperabilidade e integração | Compartilhar dados de forma segura e padronizada | `tenant_id`, vínculos entre órgãos, usuários, fornecedores, atas, pedidos e processos; módulo de Compras relaciona processos, contratos e atas | **Parcial** | Publicar contratos de dados, API interna, identificadores estáveis, eventos, fila de integração e tratamento de falhas. |
| Dados abertos e transparência | Disponibilizar dados públicos em formato adequado | Exportação CSV/PDF interna em consulta, pedidos e relatórios | **Parcial** | Criar conjunto público revisado, dicionário de dados, periodicidade, licença e endpoint/arquivo oficial. |
| Governança e segurança | Gestão de riscos, acessos e continuidade | Perfis `ADMIN`, `SECRETARIO`, `SOLICITANTE`, `ESTAGIARIO`; RLS e auditoria | **Parcial** | Formalizar governança, revisão de perfis, continuidade, recuperação de desastre e indicadores. |

### 3.4 Lei nº 14.133/2021 — Licitações e Contratos Administrativos

| Artigo / tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Arts. 11 e 18 | Planejamento e governança da contratação | O módulo de Compras possui demandas, PCA e ETP configurável; Atas relacionam `processo_compras_id` | **Parcial** | Garantir que cada pedido de contratação tenha vínculo, justificativa, ETP/TR, pesquisa de preços e aprovação formal conforme o procedimento municipal. |
| Arts. 82 a 86 | Sistema de registro de preços e atas | `atas`, `itens_ata`, fornecedores, vigência, saldos, gestores/fiscais e histórico | **Atendido tecnicamente / parcial jurídico** | Validar os fluxos com a regulamentação municipal e acrescentar os campos/documentos exigidos para cada modalidade. |
| Arts. 117 e 140 | Fiscalização, recebimento e execução | `pedidos_entregas`, `pedidos_entregas_itens`, `pedidos_ocorrencias`, timeline e RPC `compras_registrar_entrega` | **Atendido tecnicamente / parcial institucional** | Formalizar quem recebe, fiscaliza, atesta e resolve ocorrência; preservar documentos comprobatórios e atos de designação. |
| Arts. 174 a 176 | Publicidade e PNCP | Módulo de Compras registra publicação, canal, protocolo e URL, mas o código informa que o registro é manual e não transmite ao PNCP | **Parcial / fora do escopo de transmissão** | Integrar ao PNCP somente após definir credenciais, responsabilidade, validação do payload, retorno, retry e log de transmissão. |
| Art. 12 e publicidade dos atos | Processo documentado e rastreável | `compras_documentos`, versões de artefatos, decisões, auditoria e registros operacionais | **Parcial** | Adotar checklist de completude e bloqueio de avanço quando documentos obrigatórios estiverem ausentes. |

### 3.5 Lei Complementar nº 101/2000 e LC nº 131/2009 — Responsabilidade Fiscal e Transparência Fiscal

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Transparência da execução | Publicidade de receitas, despesas, contratos e execução em tempo real quando aplicável | Relatórios de consumo, pedidos, fornecedores e saldos; sem integração contábil/orçamentária | **Parcial** | Integrar empenho, liquidação, pagamento e dotação com o sistema contábil; validar quais dados devem ser publicados. |
| Planejamento | Compatibilidade com planejamento e orçamento | PCA e processos no módulo de Compras; não há validação orçamentária no módulo de Atas | **Parcial** | Vincular pedido/processo ao planejamento e, quando possível, a dotação ou declaração de disponibilidade. |

### 3.6 Lei nº 14.063/2020 — Assinaturas eletrônicas

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Assinaturas em atos e documentos | Definir nível de assinatura e autoria conforme o ato | Há `created_by`, `publicada_por`, `registrado_por` e histórico; o próprio módulo de Compras informa que registrar artefato não é assinatura digital | **Pendente para assinatura** | Não apresentar registro de usuário como assinatura. Definir política municipal e integrar provedor de assinatura adequado quando documentos exigirem assinatura. |

### 3.7 Lei nº 8.159/1991, Lei nº 12.682/2012 e Decreto nº 10.278/2020 — Arquivos e digitalização

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Gestão e preservação documental | Autenticidade, integridade, classificação, temporalidade e destinação | Documentos e versões existem em Compras; anexos operacionais podem ser enviados para o storage | **Parcial** | Criar classificação documental, código de temporalidade, hash, versão imutável, trilha de acesso, retenção e exportação de pacote probatório. |
| Digitalização | Requisitos para documento digitalizado | Não foi localizada validação de resolução, formato, metadados ou declaração de conformidade | **Pendente** | Definir procedimento de digitalização e validações antes de aceitar documentos como cópia digitalizada oficial. |

### 3.8 Lei nº 13.460/2017 — Direitos do usuário de serviço público

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Informação, qualidade e avaliação | Informação clara, acompanhamento e melhoria do serviço | Central de ajuda, estados de pedido, notificações, filtros e timeline | **Parcial** | Definir SLA interno, métricas, pesquisa de satisfação e canal de suporte. A aplicação direta depende de o serviço ser interno ou externo. |

### 3.9 Lei nº 13.146/2015 — Estatuto da Pessoa com Deficiência

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Acessibilidade digital | Remover barreiras de acesso e uso | Auditoria `scripts/audit-acessibilidade-intranet.py`, foco visível, `aria-label`, navegação por teclado e redução de movimento em estilos compartilhados | **Parcial** | Corrigir os achados restantes, executar teste manual com teclado/leitor de tela e registrar evidência por versão. A auditoria de 7/10/2026 encontrou 138 achados no conjunto avaliado. |

### 3.10 Lei nº 12.965/2014 — Marco Civil da Internet

| Tema | Obrigação relacionada | Evidência no módulo | Status | Adequação necessária |
|---|---|---|---|---|
| Privacidade e segurança | Tratamento responsável de dados e segurança da aplicação | Supabase Auth, RLS, bloqueio de acesso anônimo, logs e separação por tenant | **Parcial** | Formalizar política de privacidade, guarda de registros, resposta a incidentes, gestão de acesso administrativo e critérios de compartilhamento. |

## 4. Mapa de evidências técnicas

| Evidência | Papel na conformidade |
|---|---|
| `public.atas` | Cadastro da ata, vigência, situação, fornecedor, processo de compras, gestor, fiscal, órgão responsável e ato de designação. |
| `public.itens_ata` | Quantidades contratadas/estimadas, valor unitário/total, saldo, situação e unidade de medida. |
| `public.pedidos` e `public.itens_pedido` | Solicitação por órgão, itens, quantidades, status, aprovação e vínculo com ata. |
| `public.pedidos_reservas` | Reserva operacional para evitar que pedidos concorrentes consumam o mesmo saldo. |
| `public.consumos` | Registro do consumo que reduz o saldo operacional. |
| `public.pedidos_entregas` e `public.pedidos_entregas_itens` | Recebimentos parciais/finais, quantidades entregues e documento/observação. |
| `public.pedidos_eventos` | Timeline de transições e eventos do pedido, com ator, justificativa e metadados. |
| `public.pedidos_ocorrencias` | Divergência, avaria, atraso, recusa, devolução e outras ocorrências, com severidade e responsável. |
| `public.pedidos_estornos` e `public.pedidos_estornos_itens` | Solicitação e aprovação de estorno sem apagar o histórico de consumo. |
| `public.atas_historico` | Histórico de alterações das atas. |
| `public.auditoria_eventos` e `public.logs_operacoes` | Auditoria administrativa e eventos de operação. |
| `public.usuarios`, `public.usuarios_modulos`, `public.app_tenants`, `public.app_tenant_memberships` | Identidade, perfil, módulo, tenant e associação do usuário. |
| Políticas RLS e funções `app_private.*` | Isolamento por tenant/unidade, identificação do usuário corrente e segregação de operações. |
| `controle-de-saldos/js/modules/consulta.js` | Consulta, filtros, favoritos, detalhes de atas, itens e exportação. |
| `controle-de-saldos/js/modules/pedidos.js` | Criação/consulta, aprovação, rejeição, recebimento, estorno, ocorrências, timeline e exportação. |
| `controle-de-saldos/js/modules/relatorios.js` | Relatórios de atas, consumo, pedidos, fornecedores, riscos e auditoria; exportação CSV/PDF. |
| `controle-de-saldos/js/modules/cadastro.js` e `editar-ata.js` | Cadastro e manutenção de atas, fornecedores, contato, gestor, fiscal e órgão responsável. |
| `controle-de-saldos/js/modules/auth.js` e `usuarios.js` | Carregamento de usuário, perfis, permissões de abas, logout, ativação/desativação e gestão administrativa. |

## 5. Controles já verificáveis no banco

A inspeção do projeto controlado confirmou, entre outros, os seguintes controles:

- RLS habilitado em entidades críticas como `atas`, `itens_ata`, `pedidos`, `consumos`, `fornecedores`, `usuarios` e tabelas operacionais.
- Políticas de bloqueio para anônimos (`*_deny_anon`) nas entidades sensíveis.
- Escopo por tenant (`*_tenant_scope`) e, quando aplicável, por unidade (`*_unidade_scope`).
- Funções server-side para aprovar, rejeitar, cancelar, registrar entrega, registrar ocorrência, solicitar/aprovar estorno e encerrar pedido.
- Validações server-side de pedido aprovado, quantidade entregue, entrega final incompleta, tipo de ocorrência, severidade e descrição mínima.
- Relações por chave estrangeira entre ata, item, fornecedor, pedido, usuário, órgão, processo de compras e contrato.
- Identificação explícita de gestor, fiscal, fiscal substituto, órgão responsável, ato e data de designação na ata.

## 6. Plano de adequação priorizado

### Prioridade 0 — Antes de vender ou declarar conformidade

1. **Aprovar a matriz com a Procuradoria, Controle Interno e Encarregado de Dados.**
2. **Definir a matriz institucional de papéis:** administrador do sistema, gestor da ata, fiscal, secretário, solicitante, compras, controle interno e auditor.
3. **Formalizar ROPA/LGPD:** dados tratados, finalidade, base legal, acesso, compartilhamento, retenção e descarte.
4. **Criar política de retenção e preservação:** pedidos, atas, documentos, logs, anexos e eventos.
5. **Corrigir os achados de acessibilidade e registrar teste manual.**
6. **Documentar backup, restauração e resposta a incidentes.**

### Prioridade 1 — Para operação institucional madura

1. Criar visão pública revisada para transparência, sem expor dados pessoais ou internos.
2. Integrar ou registrar formalmente o fluxo de publicação no PNCP e Diário Oficial.
3. Criar pacote probatório por processo/ata/pedido: documentos, eventos, responsáveis, hashes e exportação.
4. Criar revisão periódica de acessos e trilha de desligamento/reativação.
5. Criar contratos de dados e API interna para compras, contabilidade, almoxarifado e patrimônio.
6. Criar catálogo de integrações, fila de eventos, retry, monitoramento e reconciliação.

### Prioridade 2 — Evolução da plataforma municipal

1. Assinatura eletrônica integrada para documentos que exigirem assinatura.
2. Integração orçamentária/contábil para empenho, liquidação, pagamento e disponibilidade.
3. Portal de indicadores públicos com dicionário de dados e periodicidade.
4. Gestão arquivística completa, incluindo temporalidade, preservação e exportação para repositório institucional.
5. Painel de riscos de abastecimento, prazos, contratos e responsabilidades.

## 7. Checklist de aceite da matriz

- [ ] A Procuradoria revisou o enquadramento legal e a regulamentação municipal relacionada.
- [ ] O Encarregado de Dados aprovou ROPA, bases legais, avisos e fluxo de titulares.
- [ ] O Controle Interno aprovou a trilha de auditoria e os relatórios mínimos.
- [ ] A área de Compras validou o fluxo da Lei nº 14.133/2021 e a relação com PNCP.
- [ ] A área de TI testou backup, restauração, segregação por tenant e revogação de acesso.
- [ ] A equipe corrigiu e homologou os achados de acessibilidade.
- [ ] A Prefeitura definiu a política de retenção e preservação documental.
- [ ] A Prefeitura definiu o que será público, interno, restrito e sigiloso.
- [ ] Cada release passa por atualização desta matriz e anexação das evidências.

## 8. Fontes oficiais consultadas

- [Lei nº 12.527/2011 — LAI](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm)
- [Lei nº 13.709/2018 — LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Lei nº 14.129/2021 — Governo Digital](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14129.htm)
- [Lei nº 14.133/2021 — Licitações e Contratos](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm)
- [Lei nº 14.063/2020 — Assinaturas Eletrônicas](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm)
- [Lei nº 8.159/1991 — Política Nacional de Arquivos](https://www.planalto.gov.br/ccivil_03/leis/l8159.htm)
- [Lei nº 12.682/2012 — Documentos digitalizados](https://www.planalto.gov.br/ccivil_03/leis/l12682.htm)
- [Decreto nº 10.278/2020 — Requisitos para digitalização](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/d10278.htm)
- [Lei Complementar nº 101/2000 — Responsabilidade Fiscal](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm)
- [Lei Complementar nº 131/2009 — Transparência](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp131.htm)
- [Lei nº 13.460/2017 — Usuário de serviço público](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13460.htm)
- [Lei nº 13.146/2015 — Estatuto da Pessoa com Deficiência](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm)
- [Lei nº 12.965/2014 — Marco Civil da Internet](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm)
- [ANPD — Segurança da Informação](https://www.gov.br/anpd/pt-br/assuntos/seguranca-da-informacao)
- [PNCP — Portal Nacional de Contratações Públicas](https://www.gov.br/pncp/pt-br)

## 9. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 07/10/2026 | Primeira matriz baseada no código do módulo, migrations e schema do Supabase controlado. |
