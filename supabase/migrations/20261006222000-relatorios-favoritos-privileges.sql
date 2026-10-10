-- Remove privilégios amplos herdados dos privilégios padrão do schema.
-- A aplicação precisa somente consultar, inserir e remover os próprios favoritos;
-- o isolamento por linha continua sendo imposto pela política RLS.
REVOKE ALL ON TABLE public.relatorios_favoritos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.relatorios_favoritos TO authenticated;
GRANT ALL ON TABLE public.relatorios_favoritos TO service_role;
