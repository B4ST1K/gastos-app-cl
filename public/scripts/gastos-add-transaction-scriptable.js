// ============================================================
// Añadir Transacción desde iPhone (Atajo / Notificación)
// ============================================================
// Instalación en Scriptable:
//   1. Nuevo script vacío → pega TODO este texto
//   2. Rellena CONFIG abajo
//   3. Guarda como "Añadir Gasto"
//   4. En app Atajos (Shortcuts), crea un atajo que llame
//      a "Run Scriptable Script" → "Añadir Gasto" y le pasa
//      el texto de la notificación / banco como entrada.
//
// Formatos que auto-detecta el parser (extensión CL):
//   • "Pagaste $ 12.990 en UNIMARC SUC 123"
//   • "Compra por $9990 - Rappi"
//   • "Se realizó un cargo de $ 1.290 en Café Starbucks"
//   • "Transferencia: $50.000 a Juan"
//   • "Cargo tarjeta $25.000 Mercado Libre"
// ============================================================

const CONFIG = {
  APP_URL: "https://gastos-app-cl.vercel.app/",

  // Usa el mismo sistema que el widget: API KEY + USER ID (sin caducidad)
  API_KEY: "Bastian1920!",
  USER_ID: "4ae48a03-3a43-4015-a106-3386b7966e24",

  // Si quieres forzar una categoría o método:
  DEFAULT_TYPE: "expense",              // expense o income
  DEFAULT_PAYMENT_METHOD: "",           // vacío = deducir / Débito
  MARK_AS_APPLE_PAY_WHEN_NOTIFIED: true, // si viene de notificación → marcar como Apple Pay
}

const cleanAppUrl = CONFIG.APP_URL.replace(/\/+$/, "")

function extractAmount(text) {
  if (!text) return 0
  const t = String(text)
  // Formatos CL: $12.990 / $ 12.990 / 12990 / $12990
  const patterns = [
    /\$\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)/g,
    /\$\s*([0-9]{2,}(?:,[0-9]+)?)/g,
    /\b([0-9]{1,3}(?:\.[0-9]{3})+)\b/g,
    /\$\s*([0-9]+)/g,
  ]
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const raw = m[1].replace(/\./g, "").replace(/,/g, ".")
      const n = Math.round(parseFloat(raw || "0"))
      if (n > 0) return n
    }
  }
  // Último intento: cualquier número largo
  const m = t.match(/\b(\d{4,})\b/)
  return m ? Math.round(parseFloat(m[1])) : 0
}

function extractMerchant(text) {
  if (!text) return "Gasto Apple Pay"
  const t = String(text)
  // Quitar monto y stop-words
  let clean = t
    .replace(/\$\s*[0-9\., ]+/g, " ")
    .replace(/\b[0-9\.,]+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const patterns = [
    /\ben\s+([^\.\n\r,;]+)$/i,
    /\bpor\s+([^\.\n\r,;]+)$/i,
    /\ba\s+([^\.\n\r,;]+)$/i,
    /\bd[eé]\s+([^\.\n\r,;]+)$/i,
    /\b-\s*([^\.\n\r,;]+)$/i,
    /—\s*([^\.\n\r,;]+)$/i,
    /\/\s*([^\.\n\r,;]+)$/i,
  ]
  for (const re of patterns) {
    const m = clean.match(re)
    if (m && m[1]) {
      let cand = m[1].trim()
      if (cand.length >= 3) return titleize(cleanStopWords(cand))
    }
  }

  // Fallback: las 3 últimas palabras "capitalizadas" (suele ser comercio)
  const words = clean
    .split(/\s+/)
    .filter((w) => w && /^[A-Za-zÁÉÍÓÚáéíóÚñÑ0-9&]/.test(w))
  if (words.length === 0) return "Gasto Apple Pay"
  const tail = words.slice(-3)
  return titleize(cleanStopWords(tail.join(" ")))
}

const STOP_WORDS = new Set(
  ["en", "por", "de", "del", "con", "sin", "para", "la", "el", "los", "las", "una", "uno", "unos", "y", "o", "que", "al", "su", "sus", "suc", "s.a", "sucursal", "numero", "n°", "ref", "id", "cod", "orden"]
)
function cleanStopWords(s) {
  return s.split(/\s+/).filter((w) => w && !STOP_WORDS.has(w.toLowerCase())).join(" ").trim()
}
function titleize(s) {
  return s.split(/\s+/).map((w) => w ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w).join(" ")
}

function detectType(text) {
  const t = String(text || "").toLowerCase()
  if (/(ingreso|depósito|deposito|transf[ée]rencia\s*(recibida|a favor)|abono|te\s*transfiri[oó]|ingresaste|reembolso)/.test(t)) return "income"
  return CONFIG.DEFAULT_TYPE || "expense"
}

function detectPaymentMethod(text, isNotification) {
  const t = String(text || "").toLowerCase()
  if (/cr[ée]dito|visa|mastercard|master card|amex/.test(t)) return "Crédito"
  if (/d[ée]bito/.test(t) || /d[ée]bito|redcompra|red compra/.test(t)) return "Débito"
  if (/efectivo|retiro|cajero/.test(t)) return "Efectivo"
  if (CONFIG.DEFAULT_PAYMENT_METHOD) return CONFIG.DEFAULT_PAYMENT_METHOD
  if (isNotification || CONFIG.MARK_AS_APPLE_PAY_WHEN_NOTIFIED) return "Débito"
  return ""
}

async function pushTransaction({ amount, merchant, description, type, payment_method, apple_pay, source, transaction_date }) {
  const url = `${cleanAppUrl}/api/transaction?api_key=${encodeURIComponent(CONFIG.API_KEY)}&user_id=${encodeURIComponent(CONFIG.USER_ID)}`
  const body = {
    amount,
    merchant,
    description,
    type,
    payment_method,
    apple_pay: !!apple_pay,
    source: source || "iphone-shortcut",
    transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
  }
  const req = new Request(url)
  req.method = "POST"
  req.headers = { "Content-Type": "application/json", "Accept": "application/json" }
  req.body = JSON.stringify(body)
  req.timeoutInterval = 20
  let raw
  try {
    raw = await req.loadString()
  } catch (e) {
    throw new Error("Red fallida: " + (e?.message || String(e)))
  }
  let parsed
  try { parsed = JSON.parse(raw) } catch {
    throw new Error(`HTTP ${req?.response?.statusCode || "?"} no JSON: ${raw.slice(0,100)}`)
  }
  if (!parsed.ok) throw new Error(`Error API: ${parsed.error || parsed.details || JSON.stringify(parsed).slice(0,120)}`)
  return parsed
}

// ============================================================
// Interfaz: si recibe args desde Atajo o desde Scriptable
// ============================================================

const DEBUG = false // 👈 Pon en TRUE para ver pop-up de qué datos se recibieron (luego vuelve a FALSE)

async function main() {
  // 1) Obtener entrada DESDE TODAS LAS FUENTES POSIBLES (en orden de prioridad)
  let input = ""
  let isNotification = false
  let source = "iphone-shortcut"
  let inputSrc = "none"

  // Método A: args desde Shortcut (Run Script con parámetro / Share Sheet)
  if (args) {
    const pt = args.plainText ? String(args.plainText) : ""
    const qpText = args.queryParameters ? String(args.queryParameters.text || args.queryParameters.notification || "") : ""
    const wpText = args.widgetParameter ? String(args.widgetParameter) : ""
    const bpText = args.bookmarkPath ? String(args.bookmarkPath) : ""

    if (pt.trim().length > 0) {
      input = pt.trim()
      inputSrc = "args.plainText"
    } else if (qpText.trim().length > 0) {
      input = qpText.trim()
      inputSrc = "args.queryParameters"
    } else if (wpText.trim().length > 0) {
      input = wpText.trim()
      inputSrc = "args.widgetParameter"
    } else if (bpText.trim().length > 0) {
      input = bpText.trim()
      inputSrc = "args.bookmarkPath"
    }

    if (args.fileURLs && args.fileURLs.length > 0 && !input) {
      try {
        const fm = FileManager.local()
        input = args.fileURLs.map((u) => { try { return fm.readString(u) } catch { return "" } }).join("\n").trim()
        if (input) inputSrc = "args.fileURLs"
      } catch {}
    }
  }

  // Método B: PORTAPAPELES (CLIPBOARD) — el MÁS FIABLE si viene de compartir / copiar
  if (!input) {
    try {
      const clip = Pasteboard.pasteString()
      if (clip && String(clip).trim().length > 0 && looksLikeTransactionText(String(clip))) {
        input = String(clip).trim()
        inputSrc = "clipboard"
      }
    } catch {}
  }

  if (input && input.length > 0) {
    isNotification = true
    source = inputSrc === "clipboard" ? "iphone-clipboard" : "iphone-notification"
  }

  if (DEBUG) {
    const a = new Alert()
    a.title = "DEBUG: Input recibido"
    a.message = `src=${inputSrc}\nlen=${input.length}\n\n---\n${(input || "(vacio)").slice(0, 400)}`
    a.addAction("OK")
    await a.presentAlert()
  }

  // 2) Parsear si hay input o pedir datos
  let amount = 0
  let merchant = ""
  let description = null
  let type = CONFIG.DEFAULT_TYPE || "expense"
  let payment_method = ""

  if (input && input.trim().length > 0) {
    amount = extractAmount(input)
    merchant = extractMerchant(input)
    type = detectType(input)
    payment_method = detectPaymentMethod(input, isNotification)
    description = input.length > 10 ? input.slice(0, 300) : null
  }

  // 3) Confirmación interactiva (siempre dentro de Scriptable, o si faltan datos)
  if (true) {
    const q = new Alert()
    q.title = source.includes("notific") || source === "iphone-clipboard"
      ? (inputSrc === "clipboard" ? "Añadir desde portapapeles" : "Añadir desde notificación")
      : "Añadir transacción"
    q.message = input
      ? `Fuente: ${inputSrc}\nTexto:\n${input.slice(0,200)}\n\nMonto detectado: ${amount ? "$" + amount.toLocaleString("es-CL") : "?"}\nComercio: ${merchant || "?"}`
      : `No llegó ningún texto (src=${inputSrc}). Ingresa los datos manualmente:`
    q.addTextField("Monto (CLP)", amount ? String(amount) : "")
    q.addTextField("Comercio", merchant || "")
    q.addTextField("Descripción (opc)", description || "")
    q.addAction("Gasto")
    q.addAction("Ingreso")
    q.addAction("Cancelar")
    const idx = await q.presentAlert()
    if (idx === 2 || idx == null) throw new Error("Cancelado por usuario")
    type = idx === 0 ? "expense" : "income"
    const amtRaw = q.textFieldValue(0) || ""
    amount = parseInt(String(amtRaw).replace(/\D/g, ""), 10) || 0
    merchant = (q.textFieldValue(1) || "").trim() || "Gasto Manual"
    description = (q.textFieldValue(2) || "").trim() || null
    if (!payment_method) payment_method = CONFIG.DEFAULT_PAYMENT_METHOD || "Débito"
  }

  if (!amount || amount <= 0) throw new Error("Monto inválido: " + amount)
  if (!merchant) merchant = "Gasto Manual"

  const res = await pushTransaction({
    amount, merchant, description, type, payment_method,
    apple_pay: isNotification || CONFIG.MARK_AS_APPLE_PAY_WHEN_NOTIFIED,
    source,
  })

  // 4) Respuesta
  if (!config.runsInWidget) {
    const matched = res.matched || {}
    const a = new Alert()
    a.title = res.duplicate ? "⚠️ Posible duplicado" : "✅ Guardado"
    a.message = [
      res.message || "",
      "",
      `Monto: ${(type === "income" ? "+ " : "- ")} $${Number(amount).toLocaleString("es-CL")}`,
      `Comercio: ${merchant}`,
      matched.category_name ? `Categoría: ${matched.category_name}` : "",
      matched.payment_method_name ? `Método: ${matched.payment_method_name}` : "",
      res.duplicate ? `ID existente: ${res.transaction_id}` : "",
    ].filter(Boolean).join("\n")
    a.addAction("OK")
    await a.presentAlert()
  }

  // Salida para Shortcut (devuelve texto resumen)
  Script.setShortcutOutput(
    JSON.stringify({ ok: true, amount, merchant, type, transaction_id: res.transaction?.id, duplicated: !!res.duplicate, inputSrc })
  )
  return res
}

function looksLikeTransactionText(s) {
  if (!s || typeof s !== "string" || s.trim().length < 6) return false
  const txt = s.toLowerCase()
  // Si tiene un formato de monto CLP o palabras típicas de transacción, damos por bueno
  return /\$/.test(s) || /\b\d{4,}\b/.test(s) ||
    /(paga(st|ste)|compra|cargo|abono|transferenc|debito|débito|crédito|credito)/.test(txt)
}

try {
  await main()
} catch (e) {
  console.error("Error:", e)
  if (!config.runsInWidget) {
    const a = new Alert()
    a.title = "❌ Error"
    a.message = e?.message || String(e)
    a.addAction("OK")
    await a.presentAlert()
  }
  Script.setShortcutOutput(JSON.stringify({ ok: false, error: e?.message || String(e) }))
}

Script.complete()
