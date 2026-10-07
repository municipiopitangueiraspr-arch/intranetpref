-- Compras Públicas — calendário municipal e prazos em dias úteis.
-- Usa compras_feriados já existente; não cria integração externa nem altera datas legadas.

CREATE OR REPLACE FUNCTION public.compras_calcular_prazo_dias_uteis(
  p_tenant_id uuid,
  p_data_inicio date,
  p_dias integer
)
RETURNS date
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, app_private
AS $$
DECLARE
  v_data date := coalesce(p_data_inicio,current_date);
  v_contador integer := 0;
BEGIN
  IF NOT app_private.has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Sem acesso ao tenant';
  END IF;
  IF p_dias IS NULL OR p_dias < 0 THEN
    RAISE EXCEPTION 'O número de dias úteis deve ser não negativo';
  END IF;
  WHILE v_contador < p_dias LOOP
    v_data := v_data + 1;
    IF extract(isodow FROM v_data) < 6
       AND NOT EXISTS (
         SELECT 1 FROM public.compras_feriados f
         WHERE f.tenant_id=p_tenant_id AND f.data=v_data
       ) THEN
      v_contador := v_contador + 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;

REVOKE ALL ON FUNCTION public.compras_calcular_prazo_dias_uteis(uuid,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compras_calcular_prazo_dias_uteis(uuid,date,integer) TO authenticated;
