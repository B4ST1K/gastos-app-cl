// ================================================================
// Edge Function: gmail-setup-helper
// POST sin JWT (deploy con --no-verify-jwt)
//
// Acciones disponibles (envía "action" en el body JSON):
//
// 1) action: "list"
//    → Lista cuentas conectadas connected_accounts
//
// 2) action: "validate"
//    → Prueba refresh_token de una cuenta conectada, hace
//      /userinfo y /gmail/v1/users/me/profile para comprobar
//      que el acceso a Gmail funciona.
//
// 3) action: "watch"
//    → Ejecuta Gmail API users.watch para activar Pub/Sub Push.
//      Es lo que hace el OAuth callback AUTOMÁTICAMENTE;
//      si insertaste la cuenta a mano (SQL) tienes que llamar
//      esto para que Pub/Sub empiece a enviar eventos.
//
// 4) action: "insert_account" (Peligroso: SOLO para setup inicial)
//    → Inserta/upsert directamente en connected_accounts usando
//      access + refresh tokens que obtuviste vía Playground.
//      Evita tener que pasar por el navegador.
// ================================================================

import {
  createAdminSupabase,
  refreshGoogleAccessToken,
  GMAIL_SCOPES,
} from "../_shared/edge_helpers.ts"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
}

function jsonResponse(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...(extra ?? {}) },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })
  try {
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase()
    const rawText = await req.text()
    const rawPreview = rawText.slice(0, 300)

    let payload: Record<string, unknown> = {}
    if (rawText.trim().length > 0) {
      try {
        payload = JSON.parse(rawText.replace(/^\uFEFF/, "").trim()) as Record<string, unknown>
      } catch (e) {
        return jsonResponse({
          error: "JSON inválido",
          content_type: contentType || "(no enviado)",
          raw_preview: rawPreview,
        }, 400)
      }
    }

    const action = String(payload.action ?? "list").trim().toLowerCase()
    const supabase = createAdminSupabase()

    switch (action) {
      case "list":             return await handleList(supabase, payload)
      case "validate":         return await handleValidate(supabase, payload)
      case "watch":            return await handleWatch(supabase, payload)
      case "insert_account":   return await handleInsertAccount(supabase, payload)
      case "auth_url":         return await handleAuthUrl(payload)
      default:
        return jsonResponse({
          ok: false,
          error: "action desconocida",
          available_actions: ["list", "validate", "watch", "insert_account", "auth_url"],
          examples: {
            list:           { action: "list" },
            validate:       { action: "validate", email: "tu@gmail.com" },
            watch:          { action: "watch", email: "tu@gmail.com" },
            auth_url:       { action: "auth_url", user_id: "uuid-usuario", return_to: "/" },
            insert_account: {
              action: "insert_account",
              user_id:       "uuid-del-usuario",
              email:         "tu@gmail.com",
              access_token:  "ya29.a0A...",
              refresh_token: "1//03...",
              expires_in:    3599,
            },
          },
        }, 400)
    }
  } catch (err) {
    console.error("gmail-setup-helper error:", err)
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500)
  }
})

// ============================================================
// Actions
// ============================================================

async function handleList(supabase: ReturnType<typeof createAdminSupabase>, _p: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id,user_id,provider,email,token_expires_at,last_watch_history_id,last_synced_at,created_at,updated_at")
    .order("created_at", { ascending: false })
  if (error) throw new Error("db list: " + error.message)
  return jsonResponse({
    ok: true,
    count: data?.length ?? 0,
    accounts: data ?? [],
  })
}

async function handleValidate(supabase: ReturnType<typeof createAdminSupabase>, p: Record<string, unknown>) {
  const acc = await pickOneAccount(supabase, p)
  if (!acc) return jsonResponse({ ok: false, error: "Cuenta no encontrada. Usa action:\"list\" para ver las disponibles." }, 404)

  let accessToken = acc.access_token as string
  const now = new Date()
  if (!acc.token_expires_at || new Date(acc.token_expires_at as string) <= now) {
    const r = await refreshGoogleAccessToken(acc.refresh_token as string)
    accessToken = r.accessToken
  }

  const [userInfo, gmailProfile] = await Promise.allSettled([
    fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", accessToken),
    fetchJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", accessToken),
  ])

  return jsonResponse({
    ok: true,
    account: {
      id: acc.id, email: acc.email, user_id: acc.user_id,
      provider: acc.provider,
      token_expires_at: acc.token_expires_at,
      last_watch_history_id: acc.last_watch_history_id,
    },
    userinfo:    promiseToOut(userInfo),
    gmail_profile: promiseToOut(gmailProfile),
    scopes_required: GMAIL_SCOPES,
  })
}

async function handleWatch(supabase: ReturnType<typeof createAdminSupabase>, p: Record<string, unknown>) {
  const topicName = Deno.env.get("GMAIL_PUBSUB_TOPIC")
  if (!topicName) {
    return jsonResponse({
      ok: false,
      error: "Falta secret GMAIL_PUBSUB_TOPIC. Agrégalo en Supabase → Edge Functions → Secrets.",
      expected: "projects/TU_PROYECTO/topics/TU_TOPIC",
    }, 500)
  }

  const acc = await pickOneAccount(supabase, p)
  if (!acc) return jsonResponse({ ok: false, error: "Cuenta no encontrada." }, 404)

  let accessToken = acc.access_token as string
  const now = new Date()
  if (!acc.token_expires_at || new Date(acc.token_expires_at as string) <= now) {
    const r = await refreshGoogleAccessToken(acc.refresh_token as string)
    accessToken = r.accessToken
  }

  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
    }),
  })
  const data = (await resp.json()) as Record<string, unknown>

  if (data.historyId) {
    await supabase.from("connected_accounts").update({
      last_watch_history_id: String(data.historyId),
      updated_at: now.toISOString(),
    }).eq("id", acc.id)
  }

  return jsonResponse({
    ok: Boolean(data.historyId),
    topic: topicName,
    response: data,
    help: !data.historyId
      ? "Si el error dice 'Error sending test message to Cloud PubSub' → revisa el permiso de Pub/Sub Publisher a gmail-api-push@system.gserviceaccount.com sobre el topic."
      : undefined,
  })
}

async function handleInsertAccount(supabase: ReturnType<typeof createAdminSupabase>, p: Record<string, unknown>) {
  const userId       = String(p.user_id ?? "").trim()
  const email        = String(p.email ?? "").trim().toLowerCase()
  const accessToken  = String(p.access_token ?? "").trim()
  const refreshToken = String(p.refresh_token ?? "").trim()
  const expiresIn    = Number(p.expires_in ?? 3599) || 3599

  if (!userId || !email || !accessToken || !refreshToken) {
    return jsonResponse({
      ok: false,
      error: "Faltan campos. Se requiere: user_id, email, access_token, refresh_token. expires_in es opcional (default 3599).",
    }, 400)
  }

  // Validar rápido el access token contra userinfo
  const ui = await fetchJson("https://www.googleapis.com/oauth2/v3/userinfo", accessToken)
  const emailFromGoogle = (ui?.email as string | undefined)?.toLowerCase()

  if (emailFromGoogle && emailFromGoogle !== email) {
    console.warn(`email mismatch: user envió ${email}, Google devolvió ${emailFromGoogle}`)
  }

  const now = new Date()
  const tokenExpiresAt = new Date(now.getTime() + (expiresIn - 60) * 1000)

  const { data, error } = await supabase
    .from("connected_accounts")
    .upsert({
      user_id: userId,
      provider: "gmail",
      email,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      updated_at: now.toISOString(),
    } as Record<string, unknown>, {
      onConflict: "user_id,provider,email",
    })
    .select()

  if (error) throw new Error("upsert: " + error.message)

  return jsonResponse({
    ok: true,
    inserted: data?.[0] ?? null,
    google_email_check: emailFromGoogle || "(no se pudo leer, access_token posiblemente inválido)",
    next: "Corre action:\"validate\" y luego action:\"watch\" para activar Pub/Sub.",
  })
}

async function handleAuthUrl(p: Record<string, unknown>) {
  const userId    = String(p.user_id ?? "").trim()
  const returnTo  = String(p.return_to ?? "/").trim() || "/"
  if (!userId) return jsonResponse({ ok: false, error: "falta user_id" }, 400)

  const clientId    = Deno.env.get("GOOGLE_CLIENT_ID")
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI")
  if (!clientId || !redirectUri) {
    return jsonResponse({ ok: false, error: "Faltan GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI en secrets." }, 500)
  }

  const statePayload = JSON.stringify({ user_id: userId, return_to: returnTo })
  const state = btoa(statePayload)

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")
  authUrl.searchParams.set("scope", GMAIL_SCOPES.join(" "))
  authUrl.searchParams.set("state", state)

  return jsonResponse({
    ok: true,
    url: authUrl.toString(),
    note: "Ábrela en el navegador. Para que 'prompt=consent' devuelva refresh_token, puede que necesites desautorizar la app primero en https://myaccount.google.com/permissions",
  })
}

// ============================================================
// Helpers
// ============================================================

async function pickOneAccount(
  supabase: ReturnType<typeof createAdminSupabase>,
  p: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const email = String(p.email ?? "").trim().toLowerCase()
  const id    = String(p.id ?? "").trim()
  const userId = String(p.user_id ?? "").trim()

  let q = supabase.from("connected_accounts").select("*").limit(5)
  if (email)  q = q.eq("email", email)
  if (id)     q = q.eq("id", id)
  if (userId) q = q.eq("user_id", userId)

  const { data, error } = await q
  if (error) throw new Error("db pick: " + error.message)
  return data?.[0] ?? null
}

async function fetchJson(url: string, accessToken: string): Promise<Record<string, unknown> | null> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  try {
    return (await r.json()) as Record<string, unknown>
  } catch {
    return { _raw: await r.text(), status: r.status }
  }
}

function promiseToOut<T>(r: PromiseSettledResult<T>): Record<string, unknown> {
  if (r.status === "fulfilled") return { ok: true, data: r.value as unknown as Record<string, unknown> }
  return { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
}
