# Intranet Municipal de Pitangueiras
## Documento-base de contexto, visão e diretrizes para continuidade do projeto

**Versão:** 1.0  
**Última atualização:** 07/10/2026  
**Município:** Pitangueiras — Paraná  
**Repositório principal:** `municipiopitangueiraspr-arch/intranetpref`  
**Publicação atual:** https://municipiopitangueiraspr-arch.github.io/intranetpref/  

> Este documento é o briefing permanente do projeto. Ele deve ser lido antes de propor alterações de arquitetura, banco de dados, identidade visual, fluxos ou novos módulos. Seu objetivo é evitar que o contexto, as dores do Município e a visão de longo prazo precisem ser explicados novamente a cada novo agente, desenvolvedor ou colaborador.

---

## 1. Resumo executivo

A Intranet Municipal é uma plataforma própria, desenvolvida gradualmente pelo Departamento de Informática da Prefeitura de Pitangueiras, para integrar processos administrativos e informações gerenciais que hoje estão espalhados entre sistemas contratados, sistemas estaduais/federais, planilhas e controles locais.

O primeiro módulo operacional é **Atas, Saldos e Pedidos**. Ele não é um produto isolado nem o objetivo final do projeto. É o primeiro caso de uso real da futura plataforma municipal integrada.

A estratégia é:

- começar por uma dor concreta e recorrente;
- entregar valor rapidamente aos secretários e servidores;
- construir um núcleo técnico reutilizável;
- compartilhar usuários, órgãos, fornecedores, documentos, permissões e auditoria entre módulos;
- integrar sistemas externos sem tentar substituí-los imediatamente;
- evoluir ao longo de quatro ou cinco anos para uma plataforma municipal própria.

### Decisão estratégica central

> Construir pequeno na operação, mas pensar grande na arquitetura.

O módulo atual deve ser simples para quem usa, porém seus dados e seus fundamentos devem preparar a Prefeitura para os próximos módulos: compras, contratos, almoxarifado, patrimônio, protocolo, tarefas, saúde, educação, assistência social, obras, planejamento e painéis gerenciais.

---

## 2. A dor que originou o projeto

Na rotina da sala de licitação, era comum o secretário telefonar perguntando:

- “Tem licitação de papel higiênico?”
- “Ainda existe saldo?”
- “Alguém já fez pedido desse item?”
- “Qual ata atende essa necessidade?”

Para responder, um servidor precisava interromper o trabalho e procurar informações em diversas planilhas, relatórios e controles separados. Mesmo quando encontrava um saldo, muitas vezes não era possível saber rapidamente se havia pedidos pendentes ou reservas que já comprometiam aquela quantidade.

O problema é mais crítico nas atas compartilhadas entre secretarias. Quando uma ata é específica de uma secretaria, o controle costuma ser mais direto. Porém, quando várias secretarias utilizam a mesma ata:

- cada órgão pode ter uma visão parcial;
- o gestor da ata pode não saber todos os pedidos feitos pelos demais órgãos;
- o fiscal e o gestor podem depender de informações manuais;
- os secretários não têm acesso imediato ao estado real do saldo;
- a licitação vira um ponto central de consulta para tarefas que deveriam ser distribuídas aos responsáveis.

Os secretários não fazem essas ligações por falta de interesse. Eles ligam porque não possuem uma fonte única, confiável e atualizada da informação.

### Impacto administrativo atual

A ausência de uma fonte única provoca:

- interrupção de servidores para consultas manuais;
- risco de consumir saldo já comprometido;
- dificuldade de acompanhar atas compartilhadas;
- dependência de planilhas e memória individual;
- baixa rastreabilidade dos pedidos;
- dificuldade para planejar novas contratações;
- dificuldade para preparar o Plano Anual de Contratações;
- perda de tempo em atividades que poderiam ser autoatendimento.

---

## 3. O objetivo do módulo Atas, Saldos e Pedidos

O módulo deve permitir que o usuário autorizado:

1. consulte as atas disponíveis;
2. encontre itens por descrição, fornecedor, órgão, vigência e categoria;
3. veja saldo contratado, reservado, consumido e disponível;
4. identifique se há pedidos pendentes que afetam o saldo;
5. monte uma solicitação sem depender de planilhas;
6. envie o pedido para análise e aprovação;
7. acompanhe a tramitação;
8. registre entregas totais ou parciais quando permitido;
9. mantenha histórico das decisões e alterações;
10. gere informações úteis para planejamento e prestação de contas.

O sistema deve retirar a consulta operacional da informalidade e transformá-la em um fluxo rastreável.

### Resultado esperado para os secretários

O secretário deve conseguir responder boa parte das próprias dúvidas consultando o sistema, sem precisar interromper a licitação para obter uma informação básica.

### Resultado esperado para a administração

A Prefeitura deve conseguir saber:

- o que cada secretaria solicita;
- quais itens são mais consumidos;
- qual ata atende determinada necessidade;
- quanto foi contratado, reservado, consumido e entregue;
- quais atas estão próximas do vencimento;
- quais necessidades devem ser consideradas no planejamento anual;
- onde existem gargalos, atrasos ou riscos de desabastecimento.

---

## 4. Relação com o Plano Anual de Contratações

O módulo deve ser uma memória operacional para o planejamento. Quando os pedidos são registrados de forma estruturada, o Município passa a ter dados para apoiar o Plano Anual de Contratações, sem depender apenas da memória dos secretários ou da reconstrução manual de planilhas.

Os dados podem responder:

- qual secretaria consumiu determinado item;
- qual quantidade foi solicitada e aprovada;
- em que período houve consumo;
- qual fornecedor e ata foram utilizados;
- quais itens aparecem repetidamente;
- quais necessidades foram previstas, mas não atendidas;
- quais itens devem ser considerados no próximo ciclo de contratação.

> O planejamento anual deve nascer do histórico real de necessidades do Município, e não apenas de uma coleta manual feita às pressas quando o prazo está próximo.

---

## 5. Visão de longo prazo: uma plataforma municipal própria

A visão de quatro ou cinco anos é que os departamentos utilizem uma plataforma municipal comum, desenvolvida pelo próprio Departamento de Informática.

Hoje existem sistemas diferentes para:

- administração;
- assistência social;
- saúde;
- educação;
- obrigações e sistemas estaduais;
- obrigações e sistemas federais.

Esses sistemas não necessariamente serão substituídos de imediato. Alguns possuem obrigações legais, especialização ou integração oficial que precisam ser preservadas.

A plataforma municipal deve cumprir dois papéis:

### 5.1. Sistema próprio para processos municipais

A Prefeitura poderá desenvolver internamente, de forma progressiva:

- Atas, Saldos e Pedidos;
- Compras Públicas;
- Contratos;
- Almoxarifado;
- Patrimônio;
- Protocolo;
- Tarefas e tramitação;
- Gestão administrativa;
- Planejamento;
- Indicadores e painéis gerenciais;
- Gestão de documentos;
- Obras e serviços;
- outros processos municipais priorizados.

### 5.2. Camada de integração com sistemas externos

A plataforma também deverá importar, consolidar ou integrar informações de:

- sistemas estaduais;
- sistemas federais;
- sistemas especializados de saúde, educação e assistência;
- arquivos CSV, XML, PDF ou planilhas;
- APIs externas;
- sistemas contábeis e oficiais, quando tecnicamente possível.

A plataforma própria não deve tentar substituir imediatamente sistemas oficiais ou especializados. Primeiro deve conectar informações, reduzir redigitação e oferecer uma visão gerencial municipal.

---

## 6. Princípios de arquitetura

### 6.1. Plataforma, não coleção de telas

Cada novo módulo deve usar o mesmo núcleo de:

- autenticação;
- usuários;
- órgãos e unidades;
- perfis e permissões;
- fornecedores;
- documentos;
- notificações;
- auditoria;
- busca;
- configurações;
- integrações.

Não criar cadastros paralelos de usuários, fornecedores ou órgãos em cada módulo.

### 6.2. Núcleo compartilhado

O núcleo deve conter entidades e serviços reutilizáveis:

- usuários e identidade;
- órgãos, secretarias e unidades;
- cargos e funções;
- perfis, papéis e permissões;
- fornecedores e representantes;
- materiais, itens e unidades de medida;
- documentos e anexos;
- solicitações;
- notificações;
- trilha de auditoria;
- configurações municipais;
- integrações e logs.

### 6.3. Módulos independentes, dados conectados

Saúde, educação, assistência, compras e administração podem ter regras próprias. Não misturar todas as regras em tabelas gigantescas.

O compartilhamento deve ocorrer por:

- entidades mestres comuns;
- identificadores estáveis;
- APIs ou serviços internos;
- eventos e integrações;
- permissões por módulo e órgão.

### 6.4. Segurança no backend

Esconder um botão não é autorização. Toda operação deve ser protegida no banco, na API ou no backend:

- menor privilégio;
- RLS ou mecanismo equivalente;
- escopo por Município, órgão e unidade;
- separação de funções;
- histórico append-only para operações críticas;
- validação server-side;
- nenhuma chave privilegiada no frontend.

### 6.5. Dados como patrimônio institucional

O sistema deve preservar histórico e contexto. Não apagar eventos para “corrigir” informação.

Correções devem ocorrer por:

- operação autorizada;
- justificativa;
- registro do estado anterior e novo;
- ator e data/hora;
- vínculo com a operação original.

---

## 7. Camadas futuras da plataforma

### Camada 1 — Núcleo da plataforma

- autenticação;
- usuários;
- órgãos e unidades;
- perfis e permissões;
- notificações;
- documentos;
- auditoria;
- pesquisa;
- configurações;
- integrações.

### Camada 2 — Cadastros mestres

- fornecedores;
- representantes;
- servidores e usuários;
- materiais e itens;
- unidades de medida;
- endereços;
- processos;
- contratos;
- documentos;
- classificações;
- centros de custo.

### Camada 3 — Módulos de negócio

- Atas, Saldos e Pedidos;
- Compras Públicas;
- Contratos;
- Almoxarifado;
- Patrimônio;
- Protocolo;
- Gestão de Pessoas;
- Saúde;
- Educação;
- Assistência Social;
- Obras e Serviços;
- Planejamento;
- Transparência interna.

### Camada 4 — Integrações e dados

- adaptadores para sistemas externos;
- importação de arquivos;
- APIs;
- fila de integração;
- logs de integração;
- tratamento de falhas;
- conciliação e monitoramento;
- relatórios gerenciais consolidados.

---

## 8. Decisões já tomadas para o módulo atual

### 8.1. Fornecedor é cadastro municipal reutilizável

Fornecedor não deve ser exclusivo de uma ata. O mesmo fornecedor poderá ser usado futuramente em:

- atas;
- contratos;
- compras;
- serviços;
- manutenção;
- obras;
- pagamentos;
- almoxarifado.

A ata deve apenas criar um vínculo com o fornecedor.

### 8.2. Responsáveis da ata são dados de governança

Gestor, fiscal e fiscal substituto são registrados para identificação e governança. Nesta fase, eles não mudam automaticamente as regras de pedidos ou aprovação.

A evolução futura recomendada é uma tabela histórica de responsabilidades com:

- pessoa;
- função: gestor, fiscal ou substituto;
- data de início;
- data de fim;
- ato de designação;
- documento;
- situação.

Assim será possível responder quem era o responsável em determinado período, e não somente quem é o responsável atual.

### 8.3. Pedido deve evoluir para solicitação municipal

Atualmente o pedido está ligado ao fluxo de atas. Futuramente, o conceito de solicitação poderá atender:

- material;
- serviço;
- manutenção;
- transporte;
- abertura de processo;
- demanda de TI;
- almoxarifado;
- outros serviços internos.

Não acoplar de forma irreversível o conceito de solicitação apenas à ata.

### 8.4. Consumo deve alimentar planejamento

Cada pedido aprovado e cada consumo devem ser aproveitados para:

- PAC;
- previsão orçamentária;
- estoque;
- novas compras;
- análise de recorrência;
- identificação de sazonalidade;
- relatórios por secretaria e órgão.

---

## 9. Roadmap recomendado

### Fase 1 — Fundação e Atas, Saldos e Pedidos

- estabilizar consulta de atas;
- consolidar saldos, reservas e consumos;
- pedidos e aprovação;
- entregas parciais e finais;
- fornecedores e representantes;
- gestores e fiscais;
- relatórios básicos;
- suporte ao PAC;
- auditoria;
- permissões;
- notificações.

### Fase 2 — Compras, contratos e documentos

Conectar o ciclo:

> planejamento → compra → ata → contrato → pedido → consumo → encerramento

### Fase 3 — Almoxarifado e patrimônio

Reutilizar itens, fornecedores, órgãos e solicitações para:

- entradas;
- saídas;
- estoque;
- localização;
- responsáveis;
- patrimônio;
- inventário;
- movimentações.

### Fase 4 — Gestão administrativa transversal

- protocolo;
- documentos;
- tarefas;
- tramitação;
- notificações;
- agenda;
- atendimento interno;
- relatórios.

### Fase 5 — Integração com saúde, educação e assistência

Inicialmente:

- importar informações;
- consolidar demandas;
- acompanhar indicadores;
- integrar órgãos e usuários;
- criar painéis gerenciais;
- reduzir controles paralelos.

### Fase 6 — Plataforma municipal madura

- identidade única;
- cadastros integrados;
- módulos conectados;
- histórico institucional;
- relatórios consolidados;
- integrações externas;
- governança de dados;
- menor dependência de planilhas e sistemas isolados.

---

## 10. Identidade visual e experiência

A identidade visual atual é institucional, clara e compartilhada entre os módulos.

### Direção visual

- aparência de sistema municipal confiável;
- navegação consistente entre módulos;
- linguagem em português do Brasil;
- foco em clareza e produtividade;
- telas responsivas;
- estados vazios explícitos;
- mensagens de erro compreensíveis;
- confirmação antes de operações destrutivas ou importantes;
- acessibilidade e foco visível;
- redução de movimento quando solicitado pelo sistema operacional.

### Tokens visuais canônicos

As principais cores atuais são:

- azul-marinho profundo: `#062744` / `#082f54`;
- azul institucional: `#0b3b66`;
- azul de ação: `#0d72d5`;
- azul claro: `#20a9e8`;
- verde de sucesso: `#159b6b`;
- turquesa: `#18a98b`;
- amarelo de destaque/seleção: `#fbbf24`;
- vermelho de erro: `#e9434f`;
- fundo claro: `#f5f8fc`;
- texto principal: `#102a43` / `#334e68`.

### Padrões de interface

- sidebar institucional azul;
- brasão da Prefeitura em moldura clara;
- menu ativo com destaque azul e marcador amarelo;
- cabeçalho branco com linha superior institucional;
- cards com bordas suaves e sombra discreta;
- botões primários em azul;
- estados de status em verde, amarelo e vermelho;
- tabelas com cabeçalho azul-marinho;
- modais e drawers com fundo branco e contraste suficiente.

Não criar um tema visual independente para cada módulo. Novos módulos devem reutilizar o design system compartilhado.

---

## 11. Segurança, privacidade e governança

A plataforma deverá observar, conforme aplicável:

- Lei Geral de Proteção de Dados;
- transparência e acesso à informação;
- regras de contratação pública;
- normas municipais;
- regras de segurança da informação;
- acessibilidade;
- retenção documental;
- segregação de funções.

### Regras permanentes

- não colocar segredos ou chaves privilegiadas no frontend;
- não presumir autorização porque uma rota está escondida;
- validar cada operação no servidor/banco;
- manter RLS e permissões coerentes;
- usar Storage privado para documentos sensíveis;
- registrar operações críticas;
- manter desenvolvimento, homologação e produção separados;
- fazer backup e testar restauração;
- criar plano de reversão antes de mudanças arriscadas;
- não declarar um módulo pronto para produção sem testes reais de autorização, concorrência, isolamento e recuperação.

### Limitação atual importante

A Intranet está evoluindo para uma arquitetura mais segura e preparada para módulos futuros, mas não deve ser declarada automaticamente como um SaaS multi-tenant completo. O retrofit de isolamento, usuários, unidades, módulos legados, Storage e permissões exige migrações e testes próprios.

---

## 12. Orientações para futuros agentes e desenvolvedores

Antes de alterar o projeto:

1. leia este documento;
2. identifique se a mudança pertence ao núcleo, a um cadastro mestre ou a um módulo;
3. procure estruturas existentes antes de criar tabelas duplicadas;
4. verifique as migrations e as políticas RLS;
5. preserve dados existentes;
6. prefira migrations aditivas e reversíveis;
7. mantenha compatibilidade com GitHub Pages e caminhos relativos;
8. reutilize a identidade visual canônica;
9. valide JavaScript, SQL, links e permissões;
10. documente decisões importantes e limitações;
11. não invente dados de demonstração como se fossem dados reais;
12. não substitua sistemas oficiais sem decisão institucional explícita.

### Perguntas que todo novo módulo deve responder

- Qual dor municipal ele resolve?
- Qual entidade compartilhada ele reutiliza?
- Quais usuários, órgãos e unidades podem acessá-lo?
- Quais operações precisam de auditoria?
- Que dados ele produz para planejamento?
- Como ele se integra com outros módulos?
- O que acontece quando um usuário, órgão ou fornecedor é desativado?
- Como fazer backup, restauração e exportação?
- Quais partes dependem de configuração externa ou obrigação legal?

### Linguagem recomendada

Evitar termos que prometam mais do que o sistema comprovadamente faz. Distinguir sempre:

- implementado;
- validado;
- publicado;
- em homologação;
- planejado;
- dependente de integração;
- dependente de decisão administrativa/jurídica.

---

## 13. Estado atual do projeto

No momento, o primeiro módulo está publicado no GitHub Pages e possui:

- consulta de atas;
- cadastro de atas;
- itens e saldos;
- carrinho/pedidos;
- evolução para fornecedores e responsáveis;
- identidade visual compartilhada;
- estrutura de migrations no Supabase;
- documentação técnica e auditorias no Drive.

A evolução mais recente adicionou ao cadastro de atas:

- dados detalhados do fornecedor;
- contato comercial;
- gestores e fiscais;
- órgão responsável;
- ato e data de designação;
- observações de governança.

Esses dados foram adicionados de forma opcional, sem alterar retroativamente atas existentes.

### Links úteis

- Repositório: https://github.com/municipiopitangueiraspr-arch/intranetpref
- Intranet publicada: https://municipiopitangueiraspr-arch.github.io/intranetpref/
- Módulo de atas: https://municipiopitangueiraspr-arch.github.io/intranetpref/controle-de-saldos/gestao-atas.html
- Tela de edição de ata: https://municipiopitangueiraspr-arch.github.io/intranetpref/controle-de-saldos/templates/editar-ata.html

---

## 14. Próximas decisões recomendadas

1. definir o nome oficial da plataforma municipal;
2. formalizar o núcleo compartilhado e os cadastros mestres;
3. definir o padrão de identificadores entre módulos;
4. decidir a estratégia de histórico de gestores e fiscais;
5. definir o modelo futuro de solicitações municipais;
6. priorizar o fluxo de aprovação e reservas de saldo;
7. definir relatórios mínimos para o PAC;
8. mapear integrações com saúde, educação e assistência;
9. escolher o primeiro módulo seguinte ao de atas;
10. criar uma matriz de módulos, entidades, permissões e integrações;
11. estabelecer rotina de backup, restauração e documentação;
12. validar os fluxos com usuários reais de diferentes secretarias.

---

## 15. Resumo para leitura rápida por outro agente

A Intranet Municipal de Pitangueiras é uma plataforma própria em construção pelo Departamento de Informática. O módulo atual de Atas, Saldos e Pedidos nasceu para resolver a dificuldade dos secretários em consultar atas compartilhadas, saldos reais e pedidos pendentes sem interromper a equipe de licitação.

O módulo é apenas o primeiro passo de uma plataforma maior que deverá integrar gradualmente a administração, saúde, educação, assistência social e outros setores. Sistemas estaduais, federais ou especializados não serão substituídos automaticamente; a estratégia inicial é integrar informações e criar uma visão municipal comum.

Qualquer evolução deve preservar essa visão: reutilizar usuários, órgãos, fornecedores, documentos, permissões e auditoria; evitar cadastros duplicados; manter segurança server-side; usar a identidade visual institucional compartilhada; produzir dados úteis para planejamento; e documentar claramente o que está implementado, validado, publicado ou ainda planejado.

> Se uma decisão deixar o módulo mais isolado, duplicar cadastros ou dificultar futuras integrações, ela provavelmente está contrariando a visão do projeto.
