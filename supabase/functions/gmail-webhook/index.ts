// ================================================================
// Edge Function: gmail-webhook
// Recibe la notificación PUSH de Google Pub/Sub (email nuevo)
//   -> Baja el mensaje completo de Gmail API
//   -> Extrae info con parseBankEmail
//   -> Inserta transacción en Supabase (como service_role bypass RLS)
//   -> Guarda en parsed_emails para deduplicar por gmail_message_id
// ================================================================

import { parseBankEmailDetailed } from "../_shared/bank_email_parser.ts"
import {
  createAdminSupabase,
  refreshGoogleAccessToken,
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
    // Google Pub/Sub envía: {"message":{"data":"base64(json)","messageId":"...","publishTime":"..."},"subscription":"..."}
    const contentType = (req.headers.get("content-type") ?? req.headers.get("Content-Type") ?? "").toLowerCase()
    const rawText = await req.text()
    const rawPreview = rawText.slice(0, 500)
    console.log("gmail-webhook", req.method, "ct=", contentType || "(none)", "bytes=", rawText.length)

    let body: Record<string, unknown> = {}
    if (rawText && rawText.trim().length > 0) {
      try {
        body = JSON.parse(rawText) as Record<string, unknown>
      } catch (e1) {
        try {
          // Intento 2: strip BOM / espacios extra / trailing comma suave
          const cleaned = rawText
            .replace(/^\uFEFF/, "")
            .trim()
          body = JSON.parse(cleaned) as Record<string, unknown>
        } catch (e2) {
          console.warn("JSON parse falló. Content-Type=[%s] RawPreview=[%s] FullError=[%s]",
            contentType, rawPreview,
            e2 instanceof Error ? e2.message : String(e2))
          return jsonResponse({
            error: "JSON inválido",
            content_type: contentType || "(no enviado)",
            raw_preview: rawPreview,
            hint: 'Envía el body como JSON con header Content-Type: application/json. Payload mínimo: {"_test": true}',
          }, 400)
        }
      }
    }

    const msg = (body.message ?? {}) as Record<string, unknown>
    const b64Data = String(msg.data ?? "").trim()

    let payload: Record<string, unknown> = {}
    if (b64Data) {
      try {
        const decoded = atob(b64Data)
        payload = JSON.parse(decoded) as Record<string, unknown>
      } catch (e) {
        console.warn("No se pudo base64-decode PubSub:", e, "raw data:", b64Data.slice(0, 100))
      }
    } else if (Object.keys(body).length) {
      payload = body
    }

    // Testing via POST directo (no Pub/Sub):
    //   { emailAddress, historyId,
    //     _test: true          → modo debug rápido: unread + 5 mensajes, no deduplica, responde verboso
    //     _any_account: true   → procesar TODAS las cuentas conectadas (sin filtrar email)
    //     _force_pull: true    → ignorar historyId y hacer list() con query
    //     _only_unread: true   → query Gmail "is:unread"
    //     _max: N              → override mensajes por cuenta (default 10, _test default 5)
    //     _dry_run: true       → no inserta transactions ni parsed_emails (solo muestra qué haría)
    //     _reprocess: true     → salta deduplicado por gmail_message_id
    //     _q: "query gmail"    → query custom para messages.list
    const isTestMode        = Boolean(payload._test)
    const emailAddress      = String(payload.emailAddress ?? "").trim() || null
    const historyIdRaw      = String(payload.historyId ?? "").trim() || null
    const forcePull         = Boolean(payload._force_pull) || isTestMode
    const anyAccount        = Boolean(payload._any_account ?? payload._force_pull) || isTestMode
    const onlyUnread        = Boolean(payload._only_unread) || isTestMode
    const dryRun            = Boolean(payload._dry_run)
    const reprocess         = Boolean(payload._reprocess) || isTestMode
    const customQ           = payload._q ? String(payload._q).trim() : null
    const defaultMax        = isTestMode ? 5 : 10
    const debugForceMax     = Number(payload._max ?? defaultMax)
    const historyId         = forcePull ? null : historyIdRaw

    // 1) Buscar cuenta(s) conectadas y refresh access_token si es necesario
    const supabase = createAdminSupabase()

    const query = supabase.from("connected_accounts").select("*")
    if (emailAddress) query.eq("email", emailAddress)
    query.limit(anyAccount ? 20 : 1)

    const { data: accounts, error: accErr } = await query

    if (accErr || !accounts || accounts.length === 0) {
      return jsonResponse({
        ok: false,
        error:
          "No se encontraron connected_accounts." +
          (emailAddress ? " email=" + emailAddress : " Usa {_any_account:true} o conecta una cuenta en /conectar-gmail"),
      }, 404)
    }

    const results: Array<Record<string, unknown>> = []
    let totalCreated = 0
    let totalSkipped = 0

    for (const acc of accounts) {
      const res = await processOneAccount(supabase, {
        acc,
        historyId,
        forceMax: debugForceMax,
        onlyUnread,
        reprocess,
        dryRun,
        customQ,
        verbose: isTestMode,
      })
      results.push({
        email: acc.email,
        user_id: acc.user_id,
        ...res,
      })
      totalCreated += res.created as number
      totalSkipped += res.skipped as number
    }

    return jsonResponse({
      ok: true,
      mode: isTestMode ? "test" : (dryRun ? "dry_run" : "live"),
      flags: {
        _test: isTestMode,
        _force_pull: forcePull,
        _only_unread: onlyUnread,
        _reprocess: reprocess,
        _dry_run: dryRun,
        _any_account: anyAccount,
      },
      accounts: results.length,
      processed: totalCreated + totalSkipped,
      created: totalCreated,
      skipped: totalSkipped,
      items: results,
    })
  } catch (err) {
    console.error("gmail-webhook error:", err)
    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, 500)
  }
})

// ================================================================
// Helpers
// ================================================================

async function processOneAccount(
  supabase: ReturnType<typeof import("../_shared/edge_helpers.ts").createAdminSupabase>,
  opts: {
    acc: Record<string, unknown>
    historyId: string | null
    forceMax: number
    onlyUnread?: boolean
    reprocess?: boolean
    dryRun?: boolean
    customQ?: string | null
    verbose?: boolean
  }
): Promise<{
  processed: number; created: number; skipped: number;
  items: Array<Record<string, unknown>>;
  reason?: string;
  query_used?: string;
  messages_found?: number;
}> {
  const acc = opts.acc
  let accessToken = acc.access_token as string
  const now = new Date()
  if (!acc.token_expires_at || new Date(acc.token_expires_at as string) <= now) {
    const refreshed = await refreshGoogleAccessToken(acc.refresh_token as string)
    accessToken = refreshed.accessToken
    const expiresAt = new Date(now.getTime() + (refreshed.expiresIn - 60) * 1000)
    if (!opts.dryRun) {
      await supabase.from("connected_accounts").update({
        access_token: accessToken,
        token_expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", acc.id)
    }
  }

  const userId = acc.user_id as string
  // Gmail notifica el historyId ACTUAL. history.list necesita el historyId ANTERIOR guardado.
  const storedHistoryId = String(acc.last_watch_history_id ?? "").trim() || null
  const startHistoryId =
    storedHistoryId && opts.historyId && storedHistoryId !== opts.historyId
      ? storedHistoryId
      : null

  let messageIds: string[] = []
  let queryUsed = ""

  if (startHistoryId) {
    const q = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
    }).toString()
    queryUsed = `history.list startHistoryId=${startHistoryId}`
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?${q}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = (await r.json()) as {
      history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>
      historyId?: string
      error?: { code?: number; message?: string }
    }
    if (data.error) {
      console.warn("Gmail history.list falló, fallback a messages.list:", data.error)
      queryUsed += ` (error ${data.error.code ?? "?"} → fallback)`
    } else {
      for (const h of data.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          if (m?.message?.id && !messageIds.includes(m.message.id)) messageIds.push(m.message.id)
        }
      }
      if (!opts.dryRun) {
        await supabase.from("connected_accounts").update({
          last_watch_history_id: data.historyId ?? opts.historyId ?? startHistoryId,
          updated_at: now.toISOString(),
        }).eq("id", acc.id)
      }
    }
  } else if (opts.historyId && !opts.dryRun) {
    await supabase.from("connected_accounts").update({
      last_watch_history_id: opts.historyId,
      updated_at: now.toISOString(),
    }).eq("id", acc.id)
  }

  if (messageIds.length === 0) {
    const parts: string[] = []
    if (opts.customQ) parts.push(opts.customQ)
    if (opts.onlyUnread) parts.push("is:unread")
    parts.push("newer_than:14d")
    const qParam = parts.join(" ")
    queryUsed = `messages.list q="${qParam}" max=${opts.forceMax}`
    const q = new URLSearchParams({
      q: qParam,
      maxResults: String(Math.max(1, Math.min(100, opts.forceMax))),
    }).toString()
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${q}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = (await r.json()) as {
      messages?: Array<{ id: string }>
      error?: unknown
    }
    if (data.error) throw new Error("Gmail list messages error: " + JSON.stringify(data.error))
    messageIds = (data.messages ?? []).map((m) => m.id)
  }

  if (messageIds.length === 0) {
    return { processed: 0, created: 0, skipped: 0, items: [], reason: "sin mensajes nuevos", query_used: queryUsed, messages_found: 0 }
  }

  let createdCount = 0
  let skippedCount = 0
  const processedIds: Array<Record<string, unknown>> = []

  for (const msgId of messageIds) {
    const item: Record<string, unknown> = { id: msgId }

    if (!opts.reprocess) {
      const { data: already } = await supabase
        .from("parsed_emails")
        .select("id")
        .eq("user_id", userId)
        .eq("gmail_message_id", msgId)
        .limit(1)
      if (already && already.length > 0) {
        skippedCount++
        item.result = "duplicate"
        processedIds.push(item)
        continue
      }
    }

    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const msg = (await r.json()) as {
      id: string
      threadId?: string
      internalDate?: string
      payload?: GmailPayload
      snippet?: string
      error?: unknown
    }
    if (msg.error) {
      console.warn("Error fetching Gmail msg", msgId, msg.error)
      item.result = "fetch_error"
      item.error = msg.error
      processedIds.push(item)
      continue
    }
    const headers = msg.payload?.headers ?? []
    const getH = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? ""
    const from       = getH("From")
    const subject    = getH("Subject")
    const dateHeader = getH("Date")
    const receivedAt = msg.internalDate
      ? new Date(Number(msg.internalDate))
      : dateHeader ? new Date(dateHeader) : new Date()

    const bodyPreview = msg.snippet ?? ""
    const fullBody = decodeGmailPayload(msg.payload) || bodyPreview

    const parseResult = parseBankEmailDetailed({
      from,
      subject,
      bodyPreview,
      body: fullBody,
      receivedAt,
    })
    const parsed = parseResult.ok ? parseResult.parsed : null

    item.from = from
    item.subject = subject
    item.snippet = opts.verbose ? bodyPreview.slice(0, 300) : undefined
    item.body_chars = opts.verbose ? fullBody.length : undefined
    item.bank_match = parseResult.bank_match
    if (!parseResult.ok) item.skip_reason = parseResult.reason

    const parsedInsert = {
      user_id: userId,
      gmail_message_id: msg.id,
      thread_id: msg.threadId ?? null,
      subject,
      from_address: from,
      received_at: receivedAt.toISOString(),
      merchant: parsed?.merchant ?? null,
      amount: parsed?.amount ?? null,
      currency: parsed?.currency ?? null,
      transaction_date: parsed?.transaction_date ?? null,
      transaction_type: parsed?.transaction_type ?? null,
      payment_method_name: parsed?.payment_method_name ?? null,
      raw_subject: subject,
      raw_body_preview: (fullBody || bodyPreview).slice(0, 2000),
      confidence: parsed?.confidence ?? 0,
    }

    if (!parsed) {
      skippedCount++
      item.result = parseResult.ok ? "not_a_bank_email" : parseResult.reason
      processedIds.push(item)
      if (!opts.dryRun) {
        await supabase.from("parsed_emails").insert(parsedInsert as Record<string, unknown>)
      }
      continue
    }

    item.merchant = parsed.merchant
    item.amount = parsed.amount
    item.type = parsed.transaction_type
    item.currency = parsed.currency
    item.payment_method = parsed.payment_method_name
    item.confidence = parsed.confidence
    item.date = parsed.transaction_date

    let categoryId: string | null = null
    let paymentMethodId: string | null = null

    const { data: catData } = await supabase
      .from("categories")
      .select("id, name")
      .eq("type", parsed.transaction_type)
      .limit(50)
    const cats = catData ?? []
    const merchantLower = parsed.merchant.toLowerCase()
    for (const c of cats) {
      if (merchantLower.includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(merchantLower.slice(0, 4))) {
        categoryId = c.id
        item.category_matched = c.name
        break
      }
    }
    if (!categoryId && cats.length > 0) {
      const fallback = cats.find((c) => /otros/i.test(c.name)) ?? cats[0]
      categoryId = fallback.id
      item.category_matched = fallback.name + " (fallback)"
    }

    if (parsed.payment_method_name) {
      const { data: pmData } = await supabase
        .from("payment_methods")
        .select("id, name")
        .ilike("name", parsed.payment_method_name)
        .limit(1)
      if (pmData && pmData.length > 0) {
        paymentMethodId = pmData[0].id
        item.payment_method_matched = pmData[0].name
      }
    }

    const txPayload: Record<string, unknown> = {
      user_id: userId,
      type: parsed.transaction_type,
      amount: parsed.amount,
      merchant: parsed.merchant,
      description: `Auto importado Gmail · ${subject}`,
      category_id: categoryId,
      payment_method_id: paymentMethodId,
      transaction_date: parsed.transaction_date,
      source: "gmail",
      external_id: msg.id,
      confidence: parsed.confidence,
    }

    if (opts.dryRun) {
      createdCount++
      item.result = "dry_run_created"
      item.transaction_preview = {
        type: txPayload.type,
        amount: txPayload.amount,
        merchant: txPayload.merchant,
        category_id: txPayload.category_id,
        payment_method_id: txPayload.payment_method_id,
        transaction_date: txPayload.transaction_date,
      }
      processedIds.push(item)
      continue
    }

    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert(txPayload)
      .select("id")
      .single()

    if (txErr) {
      console.error("Insert tx falló:", txErr)
      item.result = "insert_error:" + txErr.message
    } else {
      createdCount++
      item.result = "created"
      item.transaction_id = tx.id
    }

    await supabase.from("parsed_emails").insert({
      ...parsedInsert,
      transaction_id: tx?.id ?? null,
    } as Record<string, unknown>)

    processedIds.push(item)
  }

  if (!opts.dryRun) {
    await supabase.from("connected_accounts").update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", acc.id)
  }

  return {
    processed: createdCount + skippedCount,
    created: createdCount,
    skipped: skippedCount,
    items: processedIds,
    query_used: queryUsed,
    messages_found: messageIds.length,
  }
}

type GmailPayload = {
  mimeType?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string }
  parts?: GmailPayload[]
}

function base64UrlDecode(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
  try {
    return atob(b64 + pad)
  } catch {
    return ""
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function decodeGmailPayload(payload?: GmailPayload): string {
  if (!payload) return ""
  const texts: string[] = []
  const htmls: string[] = []

  function walk(p?: GmailPayload) {
    if (!p) return
    const mime = (p.mimeType ?? "").toLowerCase()
    const data = p.body?.data
    if (data) {
      const decoded = base64UrlDecode(data)
      if (mime.includes("text/plain")) texts.push(decoded)
      else if (mime.includes("text/html")) htmls.push(stripHtml(decoded))
      else if (!mime.startsWith("multipart/")) texts.push(stripHtml(decoded))
    }
    for (const part of p.parts ?? []) walk(part)
  }

  walk(payload)
  return [...texts, ...htmls].join("\n").trim()
}
