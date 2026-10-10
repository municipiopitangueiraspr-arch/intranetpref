import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_ORIGINS = ["https://municipiopitangueiraspr-arch.github.io"];
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("SECURITY_LOGIN_ALLOWED_ORIGINS") ?? DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const encoder = new TextEncoder();

type AuthPayload = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string; app_metadata?: { provider?: string; providers?: string[] } };
};

function json(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function safeIp(request: Request): string | null {
  // Só confiamos no IP que o proxy do edge injeta; os headers forwarded
  // alternativos podem ser enviados ou forjados pelo próprio cliente.
  const raw = request.headers.get("cf-connecting-ip") ?? "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 64 || /[\s,;]/.test(candidate)) return null;
  if (/^[0-9.]+$/.test(candidate) || (/^[0-9a-fA-F:]+$/.test(candidate) && candidate.includes(":"))) {
    return candidate;
  }
  return null;
}

function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@", 2);
  if (!domain) return local ? `${local.slice(0, 1)}•••` : "identificador não informado";
  return `${local.slice(0, 1) || "•"}•••@${domain}`;
}

async function emailTag(email: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function upstreamReason(status: number): string {
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 401) return "invalid_credentials";
  return "auth_service_error";
}

function readOAuthAmr(token: string): { present: boolean; methods: string[]; oauthAt: number | null } {
  try {
    const part = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!part) return { present: false, methods: [], oauthAt: null };
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="))) as { amr?: unknown };
    if (!Array.isArray(claims.amr)) return { present: false, methods: [], oauthAt: null };
    const entries = claims.amr.filter((item): item is { method?: string; timestamp?: number } => !!item && typeof item === "object");
    const timestamps = entries
      .filter((item) => item.method === "oauth" && Number.isFinite(Number(item.timestamp)))
      .map((item) => Number(item.timestamp) * 1000);
    return {
      present: true,
      methods: entries.map((item) => String(item.method ?? "")),
      oauthAt: timestamps.length ? Math.max(...timestamps) : null,
    };
  } catch {
    return { present: false, methods: [], oauthAt: null };
  }
}

async function restRows(path: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`security-read-${response.status}`);
  return await response.json();
}

async function writeEvent(event: {
  auth_user_id: string | null;
  identifier_masked: string;
  identifier_tag: string;
  provider: "password" | "oauth";
  outcome: "success" | "failure";
  reason_code: string | null;
  ip_address: string | null;
  user_agent: string | null;
}): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/security_login_events`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(event),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`security-write-${response.status}`);
}

async function serviceRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`security-rpc-${name}-${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function finishAttempt(eventId: number, outcome: "success" | "failure", reasonCode: string | null, authUserId: string | null = null): Promise<void> {
  await serviceRpc<unknown>("security_login_finish_attempt", {
    p_event_id: eventId,
    p_auth_user_id: authUserId,
    p_outcome: outcome,
    p_reason_code: reasonCode,
  });
}

async function updateLastAccess(authUserId: string): Promise<void> {
  const query = new URLSearchParams({ uuid: `eq.${authUserId}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ultimo_acesso: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`security-last-access-${response.status}`);
}

async function revokeOrphanSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (error) {
    console.error("[security-login] rejected session cleanup failed", error instanceof Error ? error.message : "unknown");
  }
}

async function handlePasswordLogin(request: Request, origin: string, body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 1024 || !email.includes("@")) {
    return json(400, { code: "invalid_request", message: "Informe e-mail e senha válidos." }, origin);
  }

  const tag = await emailTag(email);
  const ip = safeIp(request);
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 512) || null;
  let attempt: { allowed?: boolean; event_id?: number | string };
  try {
    attempt = await serviceRpc("security_login_begin_attempt", {
      p_identifier_masked: maskEmail(email),
      p_identifier_tag: tag,
      p_ip_address: ip,
      p_user_agent: userAgent,
    });
  } catch (error) {
    console.error("[security-login] atomic rate-limit reservation unavailable", error instanceof Error ? error.message : "unknown");
    return json(503, { code: "security_service_unavailable", message: "Não foi possível validar o acesso com segurança. Tente novamente em instantes." }, origin);
  }

  if (attempt.allowed !== true) {
    return json(429, { code: "rate_limited", message: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }, origin);
  }
  const eventId = Number(attempt.event_id);
  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    console.error("[security-login] rate-limit reservation did not return an event id");
    return json(503, { code: "security_service_unavailable", message: "Não foi possível validar o acesso com segurança. Tente novamente em instantes." }, origin);
  }
  const recordFailure = async (reason: string, authUserId: string | null = null) => {
    try {
      await finishAttempt(eventId, "failure", reason, authUserId);
    } catch (error) {
      console.error("[security-login] failed attempt finalization failed", error instanceof Error ? error.message : "unknown");
    }
  };

  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[security-login] upstream unavailable", error instanceof Error ? error.message : "unknown");
    await recordFailure("auth_service_error");
    return json(503, { code: "auth_service_unavailable", message: "O serviço de autenticação está indisponível. Tente novamente em instantes." }, origin);
  }

  const payload = await authResponse.json().catch(() => ({})) as AuthPayload;
  if (!authResponse.ok || !payload.access_token || !payload.refresh_token || !payload.user?.id) {
    const reason = upstreamReason(authResponse.status);
    await recordFailure(reason);
    const isLimited = authResponse.status === 429;
    return json(isLimited ? 429 : 401, {
      code: reason,
      message: isLimited ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." : "E-mail ou senha incorretos.",
    }, origin);
  }

  const profileQuery = new URLSearchParams({ select: "ativo", uuid: `eq.${payload.user.id}`, limit: "1" });
  let profiles: Record<string, unknown>[];
  try {
    profiles = await restRows(`usuarios?${profileQuery.toString()}`);
  } catch (error) {
    console.error("[security-login] application profile lookup failed", error instanceof Error ? error.message : "unknown");
    await recordFailure("auth_service_error", payload.user.id);
    await revokeOrphanSession(payload.access_token);
    return json(503, { code: "security_service_unavailable", message: "Não foi possível validar o acesso com segurança. Tente novamente em instantes." }, origin);
  }

  if (!profiles[0] || profiles[0].ativo !== true) {
    const reason = profiles[0] ? "profile_inactive" : "profile_missing";
    await recordFailure(reason, payload.user.id);
    await revokeOrphanSession(payload.access_token);
    return json(401, { code: "invalid_credentials", message: "E-mail ou senha incorretos." }, origin);
  }

  try {
    await finishAttempt(eventId, "success", null, payload.user.id);
  } catch (error) {
    // Não entrega uma sessão caso o evento de acesso bem-sucedido não possa ser registrado.
    console.error("[security-login] successful login could not be audited", error instanceof Error ? error.message : "unknown");
    await revokeOrphanSession(payload.access_token);
    return json(503, { code: "audit_unavailable", message: "Não foi possível registrar o acesso com segurança. Tente novamente em instantes." }, origin);
  }

  try {
    await updateLastAccess(payload.user.id);
  } catch (error) {
    // O log canônico já foi gravado; a coluna legada é apenas um resumo auxiliar.
    console.error("[security-login] last-access summary update failed", error instanceof Error ? error.message : "unknown");
  }

  return json(200, {
    session: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    },
  }, origin);
}

async function handleOAuthSuccess(request: Request, origin: string, body: Record<string, unknown>) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { code: "missing_session", message: "Sessão não validada." }, origin);

  const startedAt = Number(body.oauth_started_at);
  const now = Date.now();
  if (!Number.isSafeInteger(startedAt) || now - startedAt > 10 * 60 * 1000 || startedAt > now + 120_000) {
    return json(400, { code: "invalid_oauth_attempt", message: "Tentativa de autenticação não validada." }, origin);
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok) return json(401, { code: "invalid_session", message: "Sessão não validada." }, origin);

  const user = await userResponse.json().catch(() => ({})) as AuthPayload["user"];
  if (!user?.id || !user.email) return json(401, { code: "invalid_session", message: "Sessão não validada." }, origin);

  const provider = user.app_metadata?.provider;
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : (provider ? [provider] : []);
  if (!providers.includes("google")) return json(400, { code: "unsupported_provider", message: "Este evento não corresponde a um acesso Google." }, origin);
  const amr = readOAuthAmr(token);
  const refreshOnly = amr.methods.length > 0 && amr.methods.every((method) => method === "token_refresh");
  if ((amr.oauthAt !== null && (amr.oauthAt < startedAt - 120_000 || amr.oauthAt > now + 120_000 || now - amr.oauthAt > 10 * 60 * 1000))
      || (amr.present && amr.oauthAt === null && !refreshOnly)) {
    return json(401, { code: "invalid_oauth_attempt", message: "Não foi possível confirmar um novo acesso pelo provedor." }, origin);
  }

  let adminUser: { last_sign_in_at?: string };
  try {
    const adminResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      cache: "no-store",
    });
    if (!adminResponse.ok) throw new Error(`auth-admin-${adminResponse.status}`);
    const adminPayload = await adminResponse.json() as { user?: { last_sign_in_at?: string }; last_sign_in_at?: string };
    adminUser = adminPayload.user ?? adminPayload;
  } catch (error) {
    console.error("[security-login] OAuth sign-in time could not be verified", error instanceof Error ? error.message : "unknown");
    return json(503, { code: "security_service_unavailable", message: "Não foi possível validar o acesso com segurança." }, origin);
  }
  const lastSignInAt = Date.parse(adminUser.last_sign_in_at ?? "");
  if (!Number.isFinite(lastSignInAt) || lastSignInAt < startedAt - 120_000 || lastSignInAt > now + 120_000 || now - lastSignInAt > 10 * 60 * 1000) {
    return json(401, { code: "invalid_oauth_attempt", message: "Não foi possível confirmar um novo acesso pelo provedor." }, origin);
  }

  try {
    const profileQuery = new URLSearchParams({ select: "ativo", uuid: `eq.${user.id}`, limit: "1" });
    const profiles = await restRows(`usuarios?${profileQuery.toString()}`);
    if (profiles[0]?.ativo === true) await updateLastAccess(user.id);
  } catch (error) {
    console.error("[security-login] OAuth last-access summary update failed", error instanceof Error ? error.message : "unknown");
  }

  try {
    await writeEvent({
      auth_user_id: user.id,
      identifier_masked: maskEmail(user.email),
      identifier_tag: await emailTag(user.email),
      provider: "oauth",
      outcome: "success",
      reason_code: null,
      ip_address: safeIp(request),
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 512) || null,
    });
  } catch (error) {
    console.error("[security-login] OAuth success event write failed", error instanceof Error ? error.message : "unknown");
    return json(503, { code: "audit_unavailable", message: "Não foi possível registrar o acesso com segurança." }, origin);
  }
  return json(200, { recorded: true }, origin);
}

class BodyTooLargeError extends Error {}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* stream already closed */ }
      throw new BodyTooLargeError("request body exceeds limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden origin", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "POST") return json(405, { code: "method_not_allowed" }, origin);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error("[security-login] required Supabase environment variables are missing");
    return json(503, { code: "security_service_unavailable", message: "Serviço de autenticação indisponível." }, origin);
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) return json(413, { code: "request_too_large", message: "Requisição inválida." }, origin);

  let body: Record<string, unknown>;
  try {
    const rawBody = await readBoundedBody(request, 4096);
    body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid-body");
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(413, { code: "request_too_large", message: "Requisição inválida." }, origin);
    return json(400, { code: "invalid_request", message: "Requisição inválida." }, origin);
  }

  if (body.action === "password_login") return await handlePasswordLogin(request, origin, body);
  if (body.action === "oauth_success") return await handleOAuthSuccess(request, origin, body);
  return json(400, { code: "invalid_action", message: "Ação de autenticação inválida." }, origin);
});
