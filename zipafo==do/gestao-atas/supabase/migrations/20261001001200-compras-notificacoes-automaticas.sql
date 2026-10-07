-- Compras Públicas — notificações internas automáticas.
-- Cria avisos somente para usuários já atribuídos em tarefas/obrigações.
-- Não envia e-mail, webhook ou integração externa.

CREATE OR REPLACE FUNCTION public.compras_notificar_atribuicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private
AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    INSERT INTO public.compras_notificacoes(
      tenant_id,usuario_id,tipo,titulo,mensagem,prioridade,entidade,entidade_id
    ) VALUES (
      NEW.tenant_id,
      NEW.responsavel_id,
      CASE WHEN TG_TABLE_NAME='compras_obrigacoes' THEN 'obrigacao' ELSE 'tarefa' END,
      CASE WHEN TG_TABLE_NAME='compras_obrigacoes' THEN 'Nova obrigação atribuída' ELSE 'Nova tarefa atribuída' END,
      CASE WHEN TG_TABLE_NAME='compras_obrigacoes' THEN NEW.descricao ELSE NEW.titulo END,
      'normal',
      CASE WHEN TG_TABLE_NAME='compras_obrigacoes' THEN 'obrigacao' ELSE 'tarefa' END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compras_tarefas_notificar_atribuicao ON public.compras_tarefas;
CREATE TRIGGER compras_tarefas_notificar_atribuicao
  AFTER INSERT ON public.compras_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.compras_notificar_atribuicao();

DROP TRIGGER IF EXISTS compras_obrigacoes_notificar_atribuicao ON public.compras_obrigacoes;
CREATE TRIGGER compras_obrigacoes_notificar_atribuicao
  AFTER INSERT ON public.compras_obrigacoes
  FOR EACH ROW EXECUTE FUNCTION public.compras_notificar_atribuicao();

REVOKE ALL ON FUNCTION public.compras_notificar_atribuicao() FROM PUBLIC,anon,authenticated;
