-- Alertas internos do centro de segurança. Sem envio externo e sem persistir cópias
-- dos eventos: as condições são recalculadas sob demanda por ADMIN ativo.
CREATE INDEX IF NOT EXISTS auditoria_eventos_security_alerts_idx
  ON public.auditoria_eventos (ocorrido_em DESC)
  WHERE entidade = 'app_tenant_memberships' OR operacao = 'DELETE';

CREATE OR REPLACE FUNCTION public.admin_security_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT app_private.current_user_is_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Apenas administradores podem consultar alertas de segurança.';
  END IF;

  WITH alert_rows AS (
    SELECT
      'login-identity-' || min(s.id)::text AS alert_id,
      CASE WHEN count(*) >= 8 THEN 'critical'::text ELSE 'warning'::text END AS severity,
      'Volume elevado de tentativas para um identificador'::text AS title,
      format('%s tentativas registradas (falhas ou autenticações em andamento) em 15 minutos para %s.', count(*), max(s.identifier_masked)) AS message,
      count(*)::integer AS event_count,
      '15 minutos'::text AS window_label,
      max(s.created_at) AS last_event_at,
      CASE WHEN count(*) >= 8 THEN 1 ELSE 2 END AS severity_order
    FROM public.security_login_events s
    WHERE s.outcome IN ('failure', 'pending')
      AND s.created_at >= statement_timestamp() - interval '15 minutes'
    GROUP BY s.identifier_tag
    HAVING count(*) >= 5

    UNION ALL

    SELECT
      'login-ip-' || min(s.id)::text AS alert_id,
      CASE WHEN count(*) >= 30 THEN 'critical'::text ELSE 'warning'::text END AS severity,
      'Volume elevado de tentativas por origem'::text AS title,
      format('%s tentativas registradas (falhas ou autenticações em andamento) pelo mesmo IP nos últimos 15 minutos. O endereço é ocultado neste resumo.', count(*)) AS message,
      count(*)::integer AS event_count,
      '15 minutos'::text AS window_label,
      max(s.created_at) AS last_event_at,
      CASE WHEN count(*) >= 30 THEN 1 ELSE 2 END AS severity_order
    FROM public.security_login_events s
    WHERE s.outcome IN ('failure', 'pending')
      AND s.ip_address IS NOT NULL
      AND s.created_at >= statement_timestamp() - interval '15 minutes'
    GROUP BY s.ip_address
    HAVING count(*) >= 15

    UNION ALL

    SELECT
      'auth-service-error-' || min(s.id)::text AS alert_id,
      CASE WHEN count(*) >= 10 THEN 'critical'::text ELSE 'warning'::text END AS severity,
      'Falhas técnicas no serviço de autenticação'::text AS title,
      format('%s erros técnicos de autenticação nos últimos 15 minutos; verifique a disponibilidade do Auth e da Edge Function.', count(*)) AS message,
      count(*)::integer AS event_count,
      '15 minutos'::text AS window_label,
      max(s.created_at) AS last_event_at,
      CASE WHEN count(*) >= 10 THEN 1 ELSE 2 END AS severity_order
    FROM public.security_login_events s
    WHERE s.outcome = 'failure'
      AND s.reason_code = 'auth_service_error'
      AND s.created_at >= statement_timestamp() - interval '15 minutes'
    HAVING count(*) >= 5

    UNION ALL

    SELECT
      'oauth-provider-' || md5(native.provider) AS alert_id,
      CASE WHEN count(*) >= 5 THEN 'critical'::text ELSE 'warning'::text END AS severity,
      'Falhas explícitas em provedor externo'::text AS title,
      format('%s falhas explicitamente classificadas em 15 minutos no provedor %s.', count(*), native.provider) AS message,
      count(*)::integer AS event_count,
      '15 minutos'::text AS window_label,
      max(native.created_at) AS last_event_at,
      CASE WHEN count(*) >= 5 THEN 1 ELSE 2 END AS severity_order
    FROM (
      SELECT
        lower(trim(coalesce(
          a.payload::jsonb #>> '{metadata,provider}',
          a.payload::jsonb ->> 'provider',
          ''
        ))) AS provider,
        a.created_at
      FROM auth.audit_log_entries a
      WHERE a.created_at >= statement_timestamp() - interval '15 minutes'
        AND a.payload::jsonb ->> 'action' = 'login'
        AND lower(trim(coalesce(
          a.payload::jsonb #>> '{metadata,provider}',
          a.payload::jsonb ->> 'provider',
          ''
        ))) NOT IN ('', 'email')
        AND (
          a.payload::jsonb ? 'error'
          OR a.payload::jsonb ? 'error_code'
        )
    ) native
    GROUP BY native.provider
    HAVING count(*) >= 3

    UNION ALL

    SELECT
      'transaction-review-' || min(ae.id)::text AS alert_id,
      'review'::text AS severity,
      CASE
        WHEN ae.entidade = 'app_tenant_memberships' THEN 'Alteração em vínculo de acesso'::text
        ELSE 'Exclusão registrada na trilha'::text
      END AS title,
      format('%s operação(ões) %s na entidade %s nas últimas 24 horas. Revise responsável, operação e campos na trilha transacional.', count(*), lower(ae.operacao), ae.entidade) AS message,
      count(*)::integer AS event_count,
      '24 horas'::text AS window_label,
      max(ae.ocorrido_em) AS last_event_at,
      3 AS severity_order
    FROM public.auditoria_eventos ae
    WHERE ae.ocorrido_em >= statement_timestamp() - interval '24 hours'
      AND (ae.entidade = 'app_tenant_memberships' OR ae.operacao = 'DELETE')
    GROUP BY ae.entidade, ae.operacao
  )
  SELECT jsonb_build_object(
    'generated_at', statement_timestamp(),
    'alerts', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', alert_id,
            'severity', severity,
            'title', title,
            'message', message,
            'event_count', event_count,
            'window', window_label,
            'last_event_at', last_event_at
          )
          ORDER BY severity_order, last_event_at DESC
        )
        FROM alert_rows
      ),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_security_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_security_alerts() TO authenticated;
