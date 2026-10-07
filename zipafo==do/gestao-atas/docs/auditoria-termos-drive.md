# Auditoria de proveniência — documentos do Google Drive

**Escopo:** documentos de referência para o Módulo de Compras Públicas e para a fronteira de integração com a Biblioteca. Esta auditoria não converte o conteúdo dos Termos em regra jurídica nem copia documentos do Drive para a árvore publicável.

## Fontes institucionais verificadas

| Documento | ID do Drive | Localização | Classificação | Uso na implementação |
|---|---|---|---|---|
| [Termo de Referência — Módulo de Gestão de Compras Públicas](https://docs.google.com/document/d/1CZTNztuYKMINfk203I2Jmva05Pi5kkyr/edit) | `1CZTNztuYKMINfk203I2Jmva05Pi5kkyr` | Raiz autorizada `Intranet` (`1TrYuFmqXf1avrGcKHdIq6Gvj3S72lDLy`) | Requisito institucional do módulo | Fonte de escopo e critérios de aceite para planejamento, instrução, decisões, publicações, contratos, execução, relatórios, segurança e testes. Não é, por si, fonte normativa legal. |
| [Termo de Referência — Módulo de Gestão da Biblioteca Municipal](https://docs.google.com/document/d/1Kfil4BpBP4uakDN5vIbZUXIwpIxF5ucd/edit) | `1Kfil4BpBP4uakDN5vIbZUXIwpIxF5ucd` | Raiz autorizada `Intranet` (`1TrYuFmqXf1avrGcKHdIq6Gvj3S72lDLy`) | Requisito institucional do módulo Biblioteca | Consultado para identificar fronteiras de integração e riscos de regressão. A implementação desta tarefa permanece limitada a Compras e às integrações autorizadas com Controle de Saldos; não altera a Biblioteca. |

**Metadados retornados pela API do Drive em 1º de outubro de 2026:** os dois itens são arquivos DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`). O Termo de Compras foi modificado em `2026-10-01T00:10:55.087Z` e o Termo da Biblioteca em `2026-10-01T00:10:37.687Z`. A raiz comum retornada pelo Drive é a pasta `Intranet` acima.

## Interpretação e rastreabilidade

- Os Termos são requisitos do contratante e evidência de escopo; não substituem a legislação, atos oficiais, decisões da autoridade ou regulamentação municipal.
- A aplicação deve registrar separadamente: **norma legal citada**, **procedimento interno aprovado** e **parâmetro configurável**. Não se deve inferir limites, prazos, enquadramentos ou aprovações a partir de um exemplo ou do próprio sistema.
- O Termo de Compras fundamenta os requisitos operacionais e de aceite (ciclo, artefatos, decisões, execução, integração e testes). O Termo da Biblioteca fundamenta apenas a preservação da fronteira e a regressão do módulo já existente nesta tarefa.
- A data de modificação e o ID do arquivo permitem localizar as fontes. Os hashes SHA-256 dos dois DOCX e de duas notas institucionais relevantes, junto às contagens de extração e classificações, estão em [`auditoria-requisitos-1-10.md`](auditoria-requisitos-1-10.md). Esta checagem cobre somente quatro documentos selecionados e não alega auditoria de todo o Drive.
- Arquivos financeiros privados de revisão de saldos não foram consultados nem copiados para a publicação ou pacote de Compras. Seus dados permanecem fora da árvore pública.

## Limites

A listagem de metadados da pasta comprova existência, nome, localização e data de modificação; a leitura dos documentos é necessária para a matriz de requisito → implementação. Nenhuma destas evidências comprova aceite jurídico/municipal, execução operacional ou cobertura integral dos Termos. As decisões legais, critérios municipais, credenciais externas e contas de teste continuam sendo dependências institucionais.
