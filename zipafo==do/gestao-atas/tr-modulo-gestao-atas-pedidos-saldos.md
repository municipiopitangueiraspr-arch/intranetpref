# TERMO DE REFERÊNCIA
## Contratação de solução SaaS para Gestão de Atas, Pedidos e Saldos

**Município:** [preencher]
**Órgão/Unidade requisitante:** [preencher]
**Processo administrativo:** [preencher]
**Versão:** 1.0 — minuta técnica para validação administrativa, jurídica e orçamentária

> Este documento é uma minuta técnica de Termo de Referência. Antes de integrar um processo licitatório, deve ser revisado e aprovado pelos responsáveis do Município, inclusive quanto ao Estudo Técnico Preliminar, legislação local, planejamento anual, orçamento, proteção de dados, segurança da informação e modelo de contratação.

## 1. Objeto

Contratação de empresa especializada para fornecimento, implantação, configuração, migração assistida, treinamento, suporte, manutenção evolutiva e operação de solução de software como serviço (SaaS) para gestão de Atas de Registro de Preços, itens, fornecedores, saldos, reservas, pedidos de aquisição, aprovações, consumos, entregas parciais e finais, ocorrências, relatórios, auditoria e administração de acessos, integrada à Intranet Municipal e ao ambiente tecnológico definido pela Administração.

A solução deverá ser disponibilizada por período contratual determinado, com acesso web responsivo, segregação dos dados do Município, controles de segurança, rastreabilidade, continuidade, portabilidade e encerramento contratual, sem substituir o sistema contábil, orçamentário, patrimonial ou de controle de frequência oficial do Município.

## 2. Fundamentação e interesse público

A contratação busca centralizar e controlar a utilização de atas e saldos, reduzir consumo acima do contratado, evitar duplicidade de pedidos, diminuir controles paralelos, permitir aprovação rastreável, dar visibilidade às unidades solicitantes e preservar histórico de decisões, consumos e entregas.

A solução deverá apoiar a eficiência administrativa, a transparência, a rastreabilidade e a prestação de contas, respeitando a Lei nº 14.133/2021, a Lei nº 13.709/2018, a Lei nº 12.527/2011, a Lei nº 14.129/2021 quando adotada pelo Município, normas de segurança, acessibilidade e regulamentação local aplicável.

O sistema não deverá produzir conclusão jurídica automática sobre legalidade da aquisição. Regras legais, procedimentos internos e parâmetros administrativos deverão permanecer identificáveis e revisáveis pela autoridade competente.

## 3. Escopo da solução

A solução deverá contemplar, no mínimo:

- cadastro e manutenção de atas, aditivos, vigência, situação, processo de origem e fornecedor;
- cadastro de itens, lotes, unidade de medida, especificação, quantidades e valores;
- distribuição de quantidades por órgão, unidade ou participante, quando aplicável;
- cálculo e visualização de saldo contratado, reservado, consumido, cancelado e disponível;
- cadastro de órgãos, unidades, usuários, perfis e permissões;
- consulta de atas, itens, fornecedores, vigência, saldo e histórico;
- criação de pedido com unidade solicitante, justificativa, prioridade, itens, quantidades e observações;
- validação de vigência, situação, saldo e autorização antes do envio;
- reserva de saldo para pedido pendente, com expiração ou liberação controlada;
- tramitação para aprovação, rejeição, devolução para ajuste e cancelamento;
- aprovação transacional e idempotente, sem consumo duplicado;
- registro de consumo após aprovação;
- entregas totais e fracionadas, com quantidades, datas, documentos e ocorrências;
- cancelamento, estorno e ajuste somente por operação autorizada, com justificativa e histórico;
- notificações internas e painel de pendências;
- relatórios e exportações autorizadas;
- auditoria append-only das operações críticas;
- integração com a Intranet por autenticação e navegação existentes;
- API ou mecanismos de integração documentados, quando previstos no planejamento;
- administração, suporte, monitoramento, backup, restauração e portabilidade.

## 4. Fora do escopo

Salvo contratação específica, não fazem parte deste objeto: execução contábil ou financeira oficial, emissão de empenho, liquidação ou pagamento; substituição de sistemas oficiais; decisão jurídica; assinatura digital qualificada; integração externa não especificada; publicação automática em PNCP/TCE-PR; controle de estoque físico; controle de ponto; fornecimento de equipamentos; operação de infraestrutura de terceiros não prevista no modelo de SaaS.

## 5. Perfis e responsabilidades

A solução deverá permitir perfis configuráveis, no mínimo:

- **Administrador municipal:** administra usuários, unidades, parâmetros e permissões dentro do Município;
- **Gestor de atas:** cadastra e acompanha atas, itens, vigência, saldos e ocorrências conforme delegação;
- **Aprovador:** analisa, aprova, rejeita ou devolve pedidos dentro de seu escopo;
- **Solicitante:** consulta saldos autorizados, cria pedidos, acompanha tramitação e registra recebimento quando permitido;
- **Consulta/auditoria:** consulta dados e relatórios conforme autorização, sem alterar registros;
- **Operador da contratada:** suporte técnico restrito, temporário, auditado e sem acesso irrestrito aos dados municipais.

A solução deverá aplicar menor privilégio, segregação de funções, escopo por Município, órgão e unidade, e revisão periódica de acessos. Ocultar botões não substitui autorização no servidor.

## 6. Fluxo operacional mínimo

1. Ata é cadastrada ou importada, com processo, fornecedor, vigência, documentos e situação.
2. Itens são registrados com quantidades, valores, unidades e distribuição autorizada.
3. O sistema calcula o saldo inicial e disponibiliza consulta conforme perfil.
4. Usuário autorizado cria pedido, informa unidade, justificativa e itens.
5. O sistema valida vigência, situação, quantidade disponível e escopo.
6. O pedido fica pendente e reserva saldo conforme parâmetro.
7. A autoridade competente aprova, rejeita com justificativa ou devolve para ajuste.
8. A aprovação executa operação transacional: bloqueia o pedido e os itens, valida saldo, cria consumo, atualiza saldo e registra ator/data.
9. O fornecedor entrega total ou parcialmente; cada entrega registra itens, quantidades, data, documento e responsável.
10. O pedido é encerrado quando o fornecimento e as pendências forem concluídos.
11. Cancelamentos, estornos e correções seguem fluxo autorizado, sem apagar a história.
12. Relatórios e auditoria permitem reconstruir o ciclo completo.

## 7. Requisitos funcionais

### RF-01 — Atas
Cadastrar, editar, consultar, suspender, cancelar e encerrar atas conforme permissões, mantendo número, processo, modalidade, fornecedor, objeto, valores, assinatura, vigência, situação, documentos e histórico.

### RF-02 — Itens
Controlar item, lote, códigos, descrição, especificação, unidade, quantidade contratada, valor unitário, valor total, participante, situação e saldo. Impedir quantidade ou valor inválido conforme regra definida.

### RF-03 — Vigência
Alertar atas próximas do vencimento e impedir novos pedidos quando a regra parametrizada determinar bloqueio. Preservar aditivos e alterações sem destruir versões anteriores.

### RF-04 — Pedidos
Permitir criar, salvar, editar, enviar, devolver, rejeitar, cancelar e consultar pedidos. Cada pedido deverá possuir identificador único, solicitante, unidade, ata, itens, justificativa, situação, datas e histórico.

### RF-05 — Reservas
Reservar saldo para pedidos pendentes conforme configuração. Liberar reserva em rejeição, cancelamento ou expiração autorizada. A reserva não poderá gerar consumo duplicado.

### RF-06 — Aprovação
Exigir perfil autorizado, registrar decisão e justificativa quando aplicável. A operação deverá ser atômica, idempotente e protegida contra corrida concorrente.

### RF-07 — Consumo
Registrar quantidade, valor, ata, item, pedido, unidade, data, usuário e origem. O saldo deverá ser atualizado em uma transação consistente.

### RF-08 — Entregas
Registrar entrega parcial ou final, itens, quantidades, data, responsável, documento, divergência e ocorrência. O total entregue não poderá exceder o pedido autorizado sem operação formal de ajuste.

### RF-09 — Cancelamento e estorno
Permitir apenas a perfis autorizados, com motivo obrigatório, validações de dependência e auditoria. Nunca remover fisicamente consumo histórico para corrigir saldo.

### RF-10 — Relatórios
Disponibilizar relatórios de atas, vigência, itens, saldo, reservas, consumos, pedidos por situação, entregas, atrasos, fornecedores, unidades e ocorrências, com filtros, exportação autorizada e identificação do período de apuração.

### RF-11 — Auditoria
Registrar criação, alteração, envio, aprovação, rejeição, devolução, cancelamento, estorno, entrega, mudança de permissão, login relevante e exportação, com ator, data/hora, entidade, operação, justificativa, estado anterior/novo e correlação.

### RF-12 — Notificações
Notificar usuários sobre pedido recebido, decisão, devolução, vencimento, entrega pendente, saldo crítico e solicitação de acesso, sem depender apenas de e-mail.

### RF-13 — Acesso
Permitir login por credencial institucional e, quando habilitado pelo Município, Google OAuth. O provedor externo apenas autentica; a autorização de módulos, unidades e operações será decidida pelo cadastro municipal e pelo backend.

### RF-14 — Administração
Permitir que o administrador aprove solicitações de acesso, vincule usuário ao Município, defina perfil, órgão, unidade, módulos e permissões, suspenda acesso e consulte histórico.

## 8. Requisitos não funcionais

- aplicação web responsiva, em português do Brasil, com linguagem clara;
- compatibilidade com versões atuais dos navegadores suportados pela Administração;
- acessibilidade conforme legislação e padrão definido no plano de implantação;
- disponibilidade, desempenho e suporte medidos por indicadores do contrato;
- operações críticas transacionais e protegidas contra repetição;
- APIs, exportações e documentação em formatos abertos quando tecnicamente aplicável;
- logs protegidos contra alteração indevida;
- separação entre desenvolvimento, homologação e produção;
- atualizações com janela, comunicação, teste e plano de reversão;
- tratamento seguro de falhas, sem exposição de dados ou segredos;
- sem chaves privilegiadas no frontend;
- suporte a backup, restauração e teste periódico;
- portabilidade sem custo adicional indevido no encerramento, nos termos definidos no contrato.

## 9. Segurança, privacidade e LGPD

A Administração deverá definir controlador, operador, encarregado, finalidades, bases legais, retenção e compartilhamentos. A contratada deverá tratar apenas os dados necessários, manter confidencialidade, aplicar controles técnicos e administrativos, comunicar incidentes e cooperar com o Município no atendimento às obrigações legais.

A solução deverá possuir isolamento por Município/tenant, RLS ou mecanismo equivalente, autorização server-side, revisão de privilégios, MFA para perfis críticos quando disponível, Storage privado, criptografia em trânsito, gestão de sessão, proteção contra CSRF/XSS conforme arquitetura, registro de acesso, monitoramento e processo de revogação.

Dados de servidores, fornecedores, representantes, solicitantes e responsáveis deverão ser classificados. Relatórios públicos não poderão expor dados pessoais sem base adequada. O contrato deverá disciplinar suboperadores, localização dos dados, retenção, devolução, eliminação e resposta a incidentes.

## 10. Implantação e migração

A contratada deverá apresentar plano com diagnóstico, configuração, migração, validação, treinamento, piloto, entrada em operação, suporte assistido e transferência de conhecimento. A migração deverá preservar chaves, histórico, documentos, saldos e evidências, com reconciliação e aprovação do Município.

Nenhuma carga deverá sobrescrever dados sem cópia, relatório de erros, validação e plano de retorno.

## 11. Entregáveis

1. plano de trabalho e cronograma;
2. matriz de requisitos e rastreabilidade;
3. solução configurada e acessível em homologação;
4. documentação de arquitetura, dados, APIs e permissões;
5. plano e evidência de migração;
6. manual de usuário e administrador;
7. material e registro de treinamento;
8. plano de segurança, privacidade e incidentes;
9. plano de backup, restauração e continuidade;
10. relatório de testes funcionais, segurança, concorrência, cross-tenant, acessibilidade e desempenho;
11. versão de produção após aceite;
12. relatório de implantação assistida;
13. exportação de dados de teste de portabilidade;
14. documentação de encerramento e transição.

## 12. Critérios de aceite

O aceite de cada marco dependerá de evidência verificável, não apenas de demonstração visual. Deverão ser aprovados, no mínimo:

- cadastro e consulta de ata, item, fornecedor e vigência;
- cálculo e consulta de saldos;
- criação e tramitação de pedido;
- reserva e liberação de saldo;
- aprovação idempotente;
- saldo insuficiente rejeitado;
- duas aprovações concorrentes sem consumo duplicado;
- entrega parcial e final;
- rejeição, cancelamento e estorno auditados;
- perfis com permissões distintas;
- tentativa cross-tenant negada;
- trilha de auditoria completa;
- relatórios e exportações reconciliados;
- backup e restauração em ambiente separado;
- login, logout, expiração e revogação de acesso;
- responsividade, acessibilidade e console sem erro crítico;
- documentação entregue e treinamento realizado.

O aceite deverá indicar casos aprovados, reprovados, pendências, severidade, prazo de correção e responsável. Falha crítica em segurança, integridade de saldo, autorização ou isolamento impede o aceite do marco.

## 13. Níveis mínimos de serviço

O edital/contrato deverá estabelecer valores para disponibilidade, tempo de resposta, atendimento por severidade, restauração, backup, correção de vulnerabilidades, exportação e implantação de correções. Os valores deverão ser definidos pelo Município após análise de criticidade, orçamento e capacidade, evitando metas inexequíveis.

O pagamento deverá ser vinculado a entregáveis e resultados aceitos, com regras objetivas para glosa, correção, penalidade e reexecução.

## 14. Suporte e manutenção

A contratada deverá disponibilizar canal em português, registro de chamados, classificação por severidade, acompanhamento, base de conhecimento, manutenção corretiva e evolutiva conforme escopo, comunicação de indisponibilidades e relatório mensal de níveis de serviço.

Acesso de suporte a dados municipais deverá ser excepcional, autorizado, temporário, rastreado e revogado ao final do atendimento.

## 15. Continuidade, backup e saída

Deverá existir backup com política de retenção, criptografia, controle de acesso, monitoramento e testes de restauração. O Município deverá receber evidências periódicas.

No encerramento, a contratada deverá fornecer dados, metadados, documentos, logs que pertençam ao Município, dicionário de dados e instruções de importação em formato documentado, além de cooperar com a transição dentro do prazo contratual. A eliminação posterior dependerá de autorização e política de retenção aplicável.

## 16. Qualificação e prova de conceito

O Município poderá exigir comprovação de capacidade técnica, equipe, suporte, segurança e experiência compatível. Se adotada prova de conceito, ela deverá usar dados fictícios ou anonimizados, roteiro público, critérios objetivos e não poderá permitir acesso a dados reais.

## 17. Responsabilidades

A Administração deverá fornecer decisões, parâmetros, responsáveis, dados autorizados, acesso aos ambientes, aceite e fiscalização. A contratada deverá entregar a solução, proteger dados, corrigir falhas, manter documentação, cumprir níveis de serviço, apoiar auditorias e preservar a portabilidade.

## 18. Gestão de riscos

Riscos mínimos a registrar: saldo incorreto; aprovação indevida; acesso cross-tenant; indisponibilidade; perda de dados; falha de backup; vazamento de dados pessoais; dependência de provedor; integração externa indisponível; migração inconsistente; falta de treinamento; lock-in; mudança normativa; uso de regra jurídica não validada.

Cada risco deverá possuir probabilidade, impacto, responsável, prevenção, contingência e evidência de monitoramento.

## 19. Referências e validações necessárias

A equipe do Município deverá validar a aderência à Lei nº 14.133/2021, Lei nº 13.709/2018, Lei nº 12.527/2011, Lei nº 14.129/2021 quando adotada, Lei nº 13.460/2017, Lei nº 14.063/2020, normas locais e orientações oficiais de segurança, transparência, acessibilidade e contratação de software/nuvem.

**Este TR não substitui o ETP, a pesquisa de preços, a análise jurídica, o mapa de riscos, a dotação orçamentária, o edital ou o contrato.**
