import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// =========== CORS HELPERS (IMPORTANTE) ===========
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...(extraHeaders ?? {}) },
  })
}

Deno.serve(async (req) => {
  try {
    // ====== Responder CORS preflight (OPTIONS) PRIMERO ======
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // Solo permitimos POST
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405)
    }

    // ====== AUTENTICACIÓN ======
    const authHeader =
      req.headers.get("Authorization") ?? req.headers.get("authorization")

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const anonKey   = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !anonKey) {
      console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY en Edge Function")
      return jsonResponse({ error: "Server misconfiguration" }, 500)
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401)
    }

    // ====== PARSE Y VALIDACIONES ======
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400)
    }

    const amount            = Number(body.amount)
    const merchant          = String(body.merchant ?? "").trim()
    const description       = body.description == null ? null : String(body.description).trim() || null
    const category_id       = String(body.category_id ?? "").trim() || null
    const payment_method_id = String(body.payment_method_id ?? "").trim() || null
    const transaction_date  = String(body.transaction_date ?? "").trim() || new Date().toISOString().slice(0, 10)
    const type              = String(body.transaction_type ?? body.type ?? "expense").toLowerCase()
    const source            = String(body.source ?? "manual").trim()
    const external_id       = body.external_id       == null ? null : String(body.external_id)
    const raw_data          = body.raw_data          == null ? null : JSON.stringify(body.raw_data)
    const confidence        = body.confidence        == null ? null : Number(body.confidence)

    if (!amount || amount <= 0)  return jsonResponse({ error: "Invalid amount" }, 400)
    if (!merchant)               return jsonResponse({ error: "Merchant is required" }, 400)
    if (!["expense", "income"].includes(type))
      return jsonResponse({ error: "Invalid transaction_type (use 'expense' or 'income')" }, 400)

    // ====== DUPLICADO POR external_id (solo si la columna existe en tu BD) ======
    if (external_id) {
      try {
        const { data: existing } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("source", source)
          .eq("external_id", external_id)
          .maybeSingle()

        if (existing) {
          return jsonResponse({
            success: true,
            duplicate: true,
            transaction_id: existing.id,
          })
        }
      } catch (e) {
        // Si la columna external_id todavía no existe → ignoramos el chequeo
        console.warn("No se pudo checkear duplicado:", e)
      }
    }

    // ====== INSERT TRANSACCIÓN (USAMOS LOS NOMBRES REALES DE COLUMNAS) ======
    const payload: Record<string, unknown> = {
      user_id: user.id,
      amount,
      merchant,
      description,
      category_id,
      payment_method_id,
      transaction_date,
      type,
      source,
    }

    // Añadimos campos extra SÓLO si los tienes en la BD
    if (external_id  != null) (payload as Record<string, unknown>).external_id  = external_id
    if (raw_data     != null) (payload as Record<string, unknown>).raw_data     = raw_data
    if (confidence   != null) (payload as Record<string, unknown>).confidence   = confidence

    const { data: transaction, error: insertError } = await supabase
      .from("transactions")
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      console.error("INSERT ERROR:", insertError)
      return jsonResponse({
        error: "Could not create transaction",
        details: insertError.message,
        code: insertError.code,
      }, 500)
    }

    return jsonResponse({
      success: true,
      duplicate: false,
      transaction,
    }, 201)
  } catch (error) {
    console.error("UNEXPECTED ERROR:", error)
    return jsonResponse(
      {
        error: "Unexpected error",
        details: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
}) 