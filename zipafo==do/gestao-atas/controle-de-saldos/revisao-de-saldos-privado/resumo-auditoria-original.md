# Resultado da correção — Controle de Saldos

**Status:** lote seguro aplicado; seis exceções financeiras seguem intactas para revisão.

## Interface e arquivos

- Estilizei o filtro **Exibir** e harmonizei o cabeçalho de Gestão de Saldos e o bloco de importação JSON com uma paleta azul-ardósia/neutra, removendo a combinação de verdes que destoava.
- Ajustei a auditoria para associar registros priorizando **processo + número da ata**, com fornecedor/modalidade como apoio, e para exibir processo e modalidade nos resultados.
- No cadastro e na edição, acrescentei sugestões de modalidades usuais sem restringir o texto literal do edital, e identificação de modalidade/processo nos cards.
- Foram sincronizados e conferidos somente cinco arquivos de **Intranet / Controle de Saldos**: `gestao-atas.css`, `gestao.js`, `cadastro.js`, `cadastro.html` e `editar-ata.html`. Nenhum outro módulo foi alterado.

## Aplicação no Supabase

A operação atômica retornou **521/521 snapshots de saldo** e **96/96 snapshots de modalidade** correspondentes, e confirmou:

- **521 saldos aplicados** em `itens_ata`;
- **96 modalidades aplicadas** em `atas`, distribuídas por 28 processos;
- os saldos existentes e as modalidades vazias foram revalidados antes da escrita; na execução também foram impostos limites para impedir saldo negativo ou acima da quantidade contratada/valor total atual.

Foram atualizados saldo quantitativo e monetário. Preço unitário e valor total contratual permaneceram inalterados. As modalidades foram pesquisadas em fontes oficiais do PNCP e do portal municipal; as referências constam no CSV de modalidades.

## Seis exceções preservadas

Cinco valores monetários propostos ultrapassavam o `valor_total` atual; um era negativo. Esses itens não foram alterados e foram conferidos no banco após o lote.

| ID do item | Processo / ata | Saldo proposto | Valor total atual | Motivo |
|---:|---|---:|---:|---|
| 318 | 4/2026 · 11/2026 | 100 un. · R$ 18.000,00 | R$ 10.000,00 | Proposta excede o total |
| 319 | 4/2026 · 11/2026 | 157 un. · R$ 42.390,00 | R$ 20.000,00 | Proposta excede o total |
| 320 | 4/2026 · 11/2026 | 100 un. · R$ 58.000,00 | R$ 10.000,00 | Proposta excede o total |
| 410 | 57/2026 · 83/2026 | 5.700 un. · R$ 849,30 | R$ 840,00 | Proposta excede o total |
| 445 | 6/2026 · 51/2026 | 45 un. · R$ 3.860,55 | R$ 2.250,00 | Proposta excede o total |
| 754 | 56/2025 · 76/2025 | 72,40 un. · **−R$ 1.823,99** | R$ 33.520,00 | Proposta negativa |

Entre os 527 candidatos iniciais, **33** tinham alerta de que o saldo monetário não correspondia a quantidade × preço unitário atual. Isso foi tratado como alerta de reconciliação; nenhum preço unitário ou total contratual foi alterado.

Outras linhas ficaram fora do lote por divergência de quantidade contratada (100), quantidade proposta fora do limite (8) ou correspondência ainda ambígua (10).

## Arquivos de conferência

- [CSV dos 521 saldos aplicados](/home/ubuntu/intranet-controle-saldos/saldos-aplicados-521.csv)
- [CSV completo dos 527 candidatos, com status e fontes](/home/ubuntu/intranet-controle-saldos/proposta-correcao-saldos.csv)
- [CSV das 96 modalidades, com fonte por registro](/home/ubuntu/intranet-controle-saldos/proposta-modalidades-atas.csv)
- [CSV das seis pendências para revisão](/home/ubuntu/intranet-controle-saldos/pendencias-saldos-revisao.csv)

## Fontes consultadas

- Relatórios “relatorio-de-saldos-das-contratacoes-12.xls” e “(13).xls” e regras de extração da pasta Relatório das Contratações.
- [Consulta oficial do PNCP](https://pncp.gov.br/app/editais?orgaoCnpj=95543427000142), com os campos de modalidade e SRP.
- Editais do PNCP e páginas de licitações do [portal municipal de Pitangueiras](https://pitangueiras.pr.gov.br/index.php?sessao=3dc6a584a83k3d&pagina=5), usados para confirmar os processos sem resultado suficiente na consulta principal.
