# Checklist E2E — Compras no staging

## Pré-condições

- [x] Projeto separado criado: `xnktywrdoqlacwmdemfp`.
- [x] Schema de Compras instalado.
- [x] RLS central habilitada.
- [x] Fixtures descartáveis criadas.
- [x] Rollback das fixtures preparado.
- [ ] Usuário Auth real de teste criado.
- [ ] Sessão browser autenticada disponível.

## Fluxo do gestor

1. Fazer login como gestor do tenant A.
2. Abrir Compras e acessar Configuração.
3. Criar um fluxo em rascunho.
4. Criar uma versão e adicionar etapa.
5. Adicionar e editar uma subetapa.
6. Publicar a versão.
7. Criar um processo usando a versão publicada.
8. Confirmar o snapshot de etapa e subetapa.
9. Concluir a subetapa e confirmar o status operacional.
10. Verificar cálculo de prazo útil com feriado configurado.

## Teste negativo cross-tenant

1. Fazer login como gestor do tenant B.
2. Confirmar que o fluxo e processo do tenant A não aparecem.
3. Tentar abrir diretamente os IDs do tenant A pela API/client.
4. Confirmar resposta vazia ou erro de autorização.
5. Tentar inserir registro com `tenant_id` do tenant A.
6. Confirmar rejeição pelo RLS.

## Fechamento

- [ ] Executar rollback das fixtures.
- [ ] Confirmar que não restaram processos, fluxos ou memberships de fixture.
- [ ] Registrar evidências no handoff.
