import { getGoogleOAuthCreds, GMAIL_SCOPES } from "../_shared/edge_helpers.ts"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS })
  try {
    const { clientId, redirectUri } = getGoogleOAuthCreds()
    if (!clientId || !redirectUri) {
      return new Response(
        JSON.stringify({ error: "Faltan GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI / GOOGLE_CLIENT_SECRET en secrets." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    const url = new URL(req.url)
    const user_id = url.searchParams.get("user_id") || ""
    const return_to = url.searchParams.get("return_to") || "/"

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "falta user_id" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    // state = user_id + return_to (base64 para pasarlo por Google)
    const statePayload = JSON.stringify({ user_id, return_to })
    const state = btoa(statePayload)

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent") // nos aseguramos de obtener refresh_token
    authUrl.searchParams.set("scope", GMAIL_SCOPES.join(" "))
    authUrl.searchParams.set("state", state)

    // GET normal → redirect 302
    if (req.method === "GET") {
      return Response.redirect(authUrl.toString(), 302)
    }

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
