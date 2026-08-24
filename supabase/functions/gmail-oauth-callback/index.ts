import { getGoogleOAuthCreds, createAdminSupabase } from "../_shared/edge_helpers.ts"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

function htmlRedirect(to: string, msg?: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Conectando…</title>
    <meta http-equiv="refresh" content="0; url=${to}"></head>
    <body style="font-family:system-ui;padding:40px;text-align:center;">
    ${msg ? `<p style="font-size:18px;">${msg}</p>` : ""}
    <p>Redirigiendo… <a href="${to}">${to}</a></p></body></html>`,
    {
      status: 302,
      headers: {
        Location: to,
        "Content-Type": "text/html; charset=utf-8",
        ...CORS_HEADERS,
      },
    }
  )
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })
  try {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthCreds()
    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(
        JSON.stringify({ error: "Missing Google OAuth secrets" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    const url = new URL(req.url)
    const code  = url.searchParams.get("code") || ""
    const state = url.searchParams.get("state") || ""
    const err   = url.searchParams.get("error")

    let userId = ""
    let returnTo = "/"
    try {
      const decoded = JSON.parse(atob(state)) as { user_id?: string; return_to?: string }
      userId   = decoded.user_id ?? ""
      returnTo = decoded.return_to ?? "/"
    } catch { /* ignore invalid state */ }

    const fallbackUrl = returnTo || "/"

    if (err || !code) {
      const reason = err ?? "missing_code"
      const fail = new URL(fallbackUrl, url.origin).toString()
      const f = new URL(fail)
      f.searchParams.set("oauth_error", reason)
      return htmlRedirect(f.toString(), `Error al conectar: ${reason}`)
    }

    // 1) Intercambiar code por access_token + refresh_token + id_token
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    })
    const tokData = (await tok.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      id_token?: string
      error?: string
      error_description?: string
    }

    if (tokData.error || !tokData.access_token) {
      const fail = new URL(fallbackUrl, url.origin).toString()
      const f = new URL(fail)
      f.searchParams.set("oauth_error", tokData.error_description ?? tokData.error ?? "token_exchange")
      return htmlRedirect(f.toString(), `Error al intercambiar token: ${tokData.error_description ?? tokData.error}`)
    }

    const accessToken  = tokData.access_token
    const refreshToken = tokData.refresh_token ?? ""
    const expiresIn    = tokData.expires_in ?? 3600

    // 2) Obtener email del usuario desde Google / userinfo
    let emailAddress = ""
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const info = (await r.json()) as { email?: string }
      emailAddress = (info.email ?? "").trim().toLowerCase()
    } catch { /* ignore */ }

    if (!emailAddress) {
      // Fallback: intentar desde Gmail API getProfile
      try {
        const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const p = (await r.json()) as { emailAddress?: string }
        emailAddress = (p.emailAddress ?? "").trim().toLowerCase()
      } catch { /* ignore */ }
    }

    if (!emailAddress) {
      const f = new URL(new URL(fallbackUrl, url.origin).toString())
      f.searchParams.set("oauth_error", "no_email")
      return htmlRedirect(f.toString(), "No se pudo obtener el email.")
    }

    // 3) Guardar/actualizar connected_accounts
    const supabase = createAdminSupabase()
    const now = new Date()
    const tokenExpiresAt = new Date(now.getTime() + (expiresIn - 60) * 1000)

    const { data: acc } = await supabase
      .from("connected_accounts")
      .upsert({
        user_id: userId,
        provider: "gmail",
        email: emailAddress,
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
        token_expires_at: tokenExpiresAt.toISOString(),
        updated_at: now.toISOString(),
      } as Record<string, unknown>, {
        onConflict: "user_id,provider,email",
      })
      .select()

    const accId = acc?.[0]?.id

    // 4) Activar Gmail Push via "watch" (Gmail Pub/Sub)
    // Requiere: en Google Cloud Console, habilitar Gmail API + crear tema Pub/Sub +
    // agregar permiso a serviceAccount:gmail-api-push@system.gserviceaccount.com
    // como Pub/Sub Publisher sobre el tema.
    let watchHistoryId: string | undefined
    let watchStatus = "no_pubsub"
    const topicName = Deno.env.get("GMAIL_PUBSUB_TOPIC")

    if (topicName) {
      try {
        const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
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
        const w = (await r.json()) as { historyId?: string; error?: unknown }
        if (w.historyId) {
          watchHistoryId = w.historyId
          watchStatus = "ok"
        } else {
          console.warn("Gmail watch returned:", w)
          watchStatus = w.error ? String(w.error) : "no_history_id"
        }
      } catch (e) {
        console.warn("Gmail watch error:", e)
        watchStatus = "exception:" + String(e)
      }
    }

    if (accId) {
      await supabase.from("connected_accounts").update({
        last_watch_history_id: watchHistoryId,
        last_synced_at: now.toISOString(),
        updated_at: now.toISOString(),
      } as Record<string, unknown>).eq("id", accId)
    }

    const success = new URL(new URL(fallbackUrl, url.origin).toString())
    success.searchParams.set("gmail_ok", "1")
    success.searchParams.set("email", emailAddress)
    success.searchParams.set("watch", watchStatus)
    return htmlRedirect(success.toString())
  } catch (err) {
    console.error("gmail-oauth-callback error:", err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
