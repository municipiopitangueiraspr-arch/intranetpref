-- RPCs operacionais nunca devem ser executáveis por PUBLIC/anon.
revoke execute on function public.compras_registrar_ocorrencia(integer,text,text,text,uuid), public.compras_registrar_entrega(integer,jsonb,text,date,text,text) from public, anon;
grant execute on function public.compras_registrar_ocorrencia(integer,text,text,text,uuid), public.compras_registrar_entrega(integer,jsonb,text,date,text,text) to authenticated;
