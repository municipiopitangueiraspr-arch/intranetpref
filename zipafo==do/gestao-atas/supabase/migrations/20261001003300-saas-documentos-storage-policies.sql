-- Storage privado: o primeiro segmento do caminho é o tenant_id.
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists compras_documentos_storage_insert on storage.objects;
    create policy compras_documentos_storage_insert on storage.objects for insert to authenticated with check(bucket_id='compras-documentos' and (storage.foldername(name))[1]=app_private.current_tenant_id()::text);
    drop policy if exists compras_documentos_storage_select on storage.objects;
    create policy compras_documentos_storage_select on storage.objects for select to authenticated using(bucket_id='compras-documentos' and (storage.foldername(name))[1]=app_private.current_tenant_id()::text);
    drop policy if exists compras_documentos_storage_delete on storage.objects;
    create policy compras_documentos_storage_delete on storage.objects for delete to authenticated using(bucket_id='compras-documentos' and (storage.foldername(name))[1]=app_private.current_tenant_id()::text);
  end if;
end $$;
