import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export function createAuthenticatedEdgeSupabase(authHeader: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")

  // Preferimos service role por si hay que actualizar rows que escapan a RLS
  // (parsing es server-side y seguro, user_id es controlado por nosotros)
  const key = serviceRole ?? anonKey
  if (!supabaseUrl || !key) throw new Error("Missing Supabase env vars")

  return createClient(supabaseUrl, key, {
    ...(authHeader
      ? { global: { headers: { Authorization: authHeader } } }
      : serviceRole
      ? {}
      : {}),
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Si tenemos service role → usamos admin client (sin RLS) para insertar en nombre del user */
export function createAdminSupabase() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY en secrets")
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Google OAuth helpers
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
]

export function getGoogleOAuthCreds() {
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID")
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")
  const redirectUri  = Deno.env.get("GOOGLE_REDIRECT_URI")
  return { clientId, clientSecret, redirectUri }
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleOAuthCreds()
  if (!clientId || !clientSecret) throw new Error("Missing Google OAuth secrets")

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  })
  const data = (await r.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!data.access_token || data.error) {
    throw new Error(data.error_description ?? data.error ?? "Refresh Google token falló")
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  }
}
