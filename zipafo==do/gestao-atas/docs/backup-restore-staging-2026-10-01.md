# Backup, restore e rollback — staging de Compras

**Projeto:** `homologacao-compras-2026-10-01`
**Ref:** `xnktywrdoqlacwmdemfp`
**Data:** 1º de outubro de 2026

## Manifesto lógico capturado

Antes do ensaio havia 1 fluxo, 1 versão, 1 etapa, 1 subetapa configurável, 1 processo e 1 subetapa operacional nas fixtures `fixture-tenant-a`/`fixture-tenant-b`.

O catálogo do staging continha as migrations de bootstrap, schema, calendário, subetapas, RLS, fixtures, identidades sintéticas e policies do E2E transacional.

## Ensaio executado

Foi executado o rollback em uma transação, na ordem correta de dependências. Durante a transação, os contadores retornaram zero para tenants de fixture, fluxos e subetapas operacionais. A transação foi encerrada com `ROLLBACK`, sem apagar a evidência persistida.

Após o rollback transacional, uma consulta independente confirmou a restauração dos dados: 2 tenants de fixture, 1 fluxo e 1 subetapa operacional permaneceram disponíveis.

## Conclusão

O rollback lógico foi ensaiado com sucesso. Ainda não foi executado um backup físico gerenciado nem um restore de projeto inteiro, pois o conector disponível não expõe exportação/restauração de backup físico neste fluxo. O artefato de rollback permanece pronto para uma janela de limpeza definitiva das fixtures.
