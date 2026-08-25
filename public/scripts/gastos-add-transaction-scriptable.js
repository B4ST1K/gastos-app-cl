// ============================================================
// AÑADIR GASTO - iPhone / Atajos / Apple Pay / Scriptable
// ============================================================
//
// MODOS:
//
// 1. Apple Pay / Wallet
//    Wallet → Transacción → Atajo → Scriptable → API → Supabase
//
// 2. Compartir texto
//    Notas → Compartir → Atajo → Scriptable → API → Supabase
//
// 3. Ejecución manual
//    Scriptable → Añadir Gasto
//    Si faltan datos, permite introducirlos.
//
// ============================================================


// ============================================================
// CONFIGURACIÓN
// ============================================================

const CONFIG = {

  APP_URL: "https://gastos-app-cl.vercel.app/",

  // IMPORTANTE:
  // Coloca aquí tu API KEY actual.
  API_KEY: "PEGA_AQUI_TU_API_KEY",

  USER_ID: "4ae48a03-3a43-4015-a106-3386b7966e24",

  DEFAULT_TYPE: "expense",

  // Vacío = detectar / usar fallback
  DEFAULT_PAYMENT_METHOD: "",

  // Si llega una transacción real de Wallet,
  // marcarla como Apple Pay.
  MARK_AS_APPLE_PAY_WHEN_WALLET: true,

  // Si es false, no pedir confirmación cuando
  // los datos pudieron detectarse correctamente.
  CONFIRM_IF_PARSED: false,

  // ----------------------------------------------------------
  // LOGGING Y NOTIFICACIONES (nuevo)
  // ----------------------------------------------------------

  // Mostrar notificación local cuando falle la automatización.
  NOTIFY_ON_ERROR: true,

  // Mostrar notificación local cuando se guarde OK
  // (útil para confirmar que la automatización corrió bien).
  NOTIFY_ON_SUCCESS: false,

  // Enviar logs también al servidor para trazabilidad.
  REPORT_ERRORS_TO_API: true,

  // Cuántos errores mantener guardados en el iPhone.
  MAX_LOG_ENTRIES: 30,
}


// ============================================================
// URL
// ============================================================

const cleanAppUrl =
  CONFIG.APP_URL.replace(/\/+$/, "")


// ============================================================
// CONTEXTO DE EJECUCIÓN
// ============================================================

const IS_IN_APP =
  typeof config !== "undefined" &&
  config.runsInApp === true


const IS_ACTION_EXTENSION =
  typeof config !== "undefined" &&
  config.runsInActionExtension === true


const IS_SIRI =
  typeof config !== "undefined" &&
  config.runsWithSiri === true


const IS_WIDGET =
  typeof config !== "undefined" &&
  config.runsInWidget === true


// Apple Pay / Atajos / Siri:
// NO mostrar interfaces.
const IS_SILENT_RUN =
  IS_ACTION_EXTENSION ||
  IS_SIRI


// Solamente podemos mostrar Alert cuando
// realmente estamos dentro de Scriptable.
const CAN_SHOW_ALERT =
  IS_IN_APP &&
  !IS_ACTION_EXTENSION &&
  !IS_SIRI &&
  !IS_WIDGET


// ============================================================
// LOGGING PERSISTENTE + NOTIFICACIONES
// ============================================================
//
// - Guarda historial de errores (y éxitos opcionales) en el
//   iPhone usando FileManager.local()
// - Muestra Notification local cuando falla (incluso en modo
//   silencioso Apple Pay)
// - Intenta reportar errores a /api/log para depurar desde web
//
// ============================================================

const LOG_FILE_NAME =
  "gastos-add-transaction-log.json"

function safeJson(v, fallback) {
  try {
    return JSON.stringify(v)
  } catch {
    return fallback || String(v)
  }
}

function readAllLogs() {
  try {
    const fm = FileManager.local()
    const path = fm.joinPath(fm.documentsDirectory(), LOG_FILE_NAME)
    if (!fm.fileExists(path)) return []
    const raw = fm.readString(path)
    const arr = JSON.parse(raw || "[]")
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeAllLogs(entries) {
  try {
    const fm = FileManager.local()
    const path = fm.joinPath(fm.documentsDirectory(), LOG_FILE_NAME)
    const max = Math.max(1, Number(CONFIG.MAX_LOG_ENTRIES) || 30)
    const clipped = (entries || []).slice(-max)
    fm.writeString(path, JSON.stringify(clipped, null, 2))
  } catch {}
}

function pushLog(entry) {
  try {
    const all = readAllLogs()
    all.push(Object.assign(
      { at: new Date().toISOString() },
      entry || {}
    ))
    writeAllLogs(all)
  } catch {}
}

function notifyLocal(title, body, opts) {
  try {
    if (typeof Notification === "undefined") return false
    const n = new Notification()
    n.title = String(title || "").slice(0, 100)
    n.body = String(body || "").slice(0, 300)
    if (opts && opts.openURL) n.openURL = String(opts.openURL)
    if (opts && opts.sound !== false) n.sound = "default"
    n.schedule()
    return true
  } catch {
    return false
  }
}

async function reportLogToApi(entry) {
  try {
    if (!CONFIG.REPORT_ERRORS_TO_API) return
    if (!CONFIG.API_KEY || !CONFIG.USER_ID) return
    const url =
      cleanAppUrl +
      "/api/log" +
      "?api_key=" + encodeURIComponent(CONFIG.API_KEY) +
      "&user_id=" + encodeURIComponent(CONFIG.USER_ID)

    const req = new Request(url)
    req.method = "POST"
    req.headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    }
    req.body = safeJson(entry, "{}")
    req.timeoutInterval = 6
    try {
      await req.load()
    } catch {}
  } catch {}
}

async function logAndReport(entry) {
  try {
    pushLog(entry)
    if (entry && entry.level === "error") {
      reportLogToApi(entry)
      if (CONFIG.NOTIFY_ON_ERROR) {
        const title =
          entry.error
            ? "❌ Gasto no guardado"
            : "❌ Error automatización"
        const body =
          (entry.error ? (entry.error + " · ") : "") +
          (entry.input_src ? "src=" + entry.input_src : "")
        notifyLocal(title, body)
      }
    } else if (entry && entry.level === "success" && CONFIG.NOTIFY_ON_SUCCESS) {
      const body =
        (entry.merchant || "") +
        (entry.amount ? " · $" + Number(entry.amount).toLocaleString("es-CL") : "")
      notifyLocal("✅ Gasto guardado", body)
    }
  } catch {}
}

async function presentLogViewerIfNoInput() {
  // Si estamos en la app Scriptable y no hay input,
  // preguntar si quieren ver el historial de errores.
  if (!CAN_SHOW_ALERT) return false
  const all = readAllLogs()
  if (all.length === 0) return false

  const errors = all.filter(e => e.level === "error").slice(-10).reverse()
  if (errors.length === 0) return false

  const a = new Alert()
  a.title = "Historial reciente"
  a.message =
    "Se detectaron " + errors.length + " error(es) recientes.\n" +
    "¿Ver el detalle? Cancelar = seguir al formulario."

  a.addAction("Ver errores")
  a.addAction("Borrar historial")
  a.addAction("Cancelar")

  const idx = await a.presentAlert()
  if (idx === 2 || idx == null) return false

  if (idx === 1) {
    writeAllLogs([])
    const ok = new Alert()
    ok.title = "Historial borrado"
    ok.message = "Se eliminaron " + all.length + " entradas del historial local."
    ok.addAction("OK")
    await ok.presentAlert()
    return false
  }

  // Ver errores
  const pick = new Alert()
  pick.title = "Seleccionar error"
  pick.message = "Últimos " + errors.length + " errores:"
  errors.forEach((e, i) => {
    const label =
      new Date(e.at).toLocaleString("es-CL", {
        day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit"
      }) +
      " · " +
      (e.error || "Sin mensaje").slice(0, 60)
    pick.addAction(label)
  })
  pick.addAction("Volver")
  const sel = await pick.presentAlert()
  if (sel === errors.length || sel == null) return true

  const chosen = errors[sel]
  const d = new Alert()
  d.title = "Detalle del error"
  d.message =
    "Fecha: " + new Date(chosen.at).toLocaleString("es-CL") + "\n" +
    "Mensaje: " + (chosen.error || "n/a") + "\n\n" +
    "Contexto: " + safeJson(chosen.context || {}, "{}").slice(0, 800) + "\n\n" +
    "Input: " + safeJson(chosen.input || "", "").slice(0, 800)
  d.addAction("Copiar todo")
  d.addAction("Cerrar")
  const di = await d.presentAlert()
  if (di === 0) {
    try {
      Pasteboard.copyString(safeJson(chosen, "{}"))
    } catch {}
  }
  return true
}


// ============================================================
// DEBUG
// ============================================================
//
// Para depurar:
//
// const DEBUG = true
//
// IMPORTANTE:
// Aunque DEBUG esté en true, NO se abrirá Alert
// si el script está corriendo mediante Siri/Atajos.
// En ese caso el debug se devuelve mediante Shortcut Output.
//

const DEBUG = false


// ============================================================
// UTILIDAD: CONVERTIR A TEXTO
// ============================================================

function asText(v) {

  if (v == null) return ""

  if (typeof v === "string") {
    return v
  }

  if (
    typeof v === "number" ||
    typeof v === "boolean"
  ) {
    return String(v)
  }

  if (Array.isArray(v)) {

    return v
      .map(asText)
      .filter(Boolean)
      .join("\n")
  }

  try {

    return JSON.stringify(v)

  } catch {

    return String(v)
  }
}


// ============================================================
// EXTRAER MONTO
// ============================================================

function extractAmount(text) {

  if (!text) return 0

  const t = String(text)

  const patterns = [

    // $12.990
    /\$\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)/g,

    // $12990
    /\$\s*([0-9]{2,}(?:,[0-9]+)?)/g,

    // 12.990
    /\b([0-9]{1,3}(?:\.[0-9]{3})+)\b/g,

    // $12990
    /\$\s*([0-9]+)/g,

  ]


  for (const re of patterns) {

    for (const m of t.matchAll(re)) {

      const raw =
        m[1]
          .replace(/\./g, "")
          .replace(/,/g, ".")


      const n =
        Math.round(
          parseFloat(raw || "0")
        )


      if (n > 0) {
        return n
      }
    }
  }


  // Último intento:
  // cualquier número de 4+ dígitos.

  const m =
    t.match(/\b(\d{4,})\b/)


  return m
    ? Math.round(parseFloat(m[1]))
    : 0
}


// ============================================================
// STOP WORDS
// ============================================================

const STOP_WORDS = new Set([

  "en",
  "por",
  "de",
  "del",
  "con",
  "sin",
  "para",
  "la",
  "el",
  "los",
  "las",
  "una",
  "uno",
  "unos",
  "y",
  "o",
  "que",
  "al",
  "su",
  "sus",
  "suc",
  "s.a",
  "sucursal",
  "numero",
  "n°",
  "ref",
  "id",
  "cod",
  "orden",

])


function cleanStopWords(s) {

  return s
    .split(/\s+/)
    .filter(
      w =>
        w &&
        !STOP_WORDS.has(
          w.toLowerCase()
        )
    )
    .join(" ")
    .trim()
}


function titleize(s) {

  return s
    .split(/\s+/)
    .map(w => {

      if (!w) return w

      return (
        w[0].toUpperCase() +
        w.slice(1).toLowerCase()
      )

    })
    .join(" ")
}


// ============================================================
// EXTRAER COMERCIO DESDE TEXTO
// ============================================================

function extractMerchant(text) {

  if (!text) {
    return "Gasto Apple Pay"
  }


  const t = String(text)


  let clean =
    t

      .replace(
        /\$\s*[0-9\., ]+/g,
        " "
      )

      .replace(
        /\b[0-9\.,]+\b/g,
        " "
      )

      .replace(
        /\s+/g,
        " "
      )

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

    const m =
      clean.match(re)


    if (
      m &&
      m[1]
    ) {

      const cand =
        m[1].trim()


      if (
        cand.length >= 3
      ) {

        return titleize(
          cleanStopWords(cand)
        )
      }
    }
  }


  // Fallback:
  // últimas 3 palabras.

  const words =
    clean
      .split(/\s+/)
      .filter(
        w =>
          w &&
          /^[A-Za-zÁÉÍÓÚáéíóÚñÑ0-9&]/
            .test(w)
      )


  if (
    words.length === 0
  ) {
    return "Gasto Apple Pay"
  }


  const tail =
    words.slice(-3)


  return titleize(
    cleanStopWords(
      tail.join(" ")
    )
  )
}


// ============================================================
// DETECTAR TIPO
// ============================================================

function detectType(text) {

  const t =
    String(text || "")
      .toLowerCase()


  if (
    /(ingreso|depósito|deposito|transf[ée]rencia\s*(recibida|a favor)|abono|te\s*transfiri[oó]|ingresaste|reembolso)/
      .test(t)
  ) {

    return "income"
  }


  return CONFIG.DEFAULT_TYPE || "expense"
}


// ============================================================
// DETECTAR MÉTODO DE PAGO
// ============================================================

function detectPaymentMethod(
  text,
  isWallet
) {

  const t =
    String(text || "")
      .toLowerCase()


  if (
    /cr[ée]dito|visa|mastercard|master card|amex/
      .test(t)
  ) {

    return "Crédito"
  }


  if (
    /d[ée]bito|redcompra|red compra/
      .test(t)
  ) {

    return "Débito"
  }


  if (
    /efectivo|retiro|cajero/
      .test(t)
  ) {

    return "Efectivo"
  }


  if (
    CONFIG.DEFAULT_PAYMENT_METHOD
  ) {

    return CONFIG.DEFAULT_PAYMENT_METHOD
  }


  // Fallback para Wallet.
  if (isWallet) {
    return "Débito"
  }


  return ""
}


// ============================================================
// ENVIAR A API
// ============================================================

async function pushTransaction({

  amount,
  merchant,
  description,
  type,
  payment_method,
  apple_pay,
  source,
  transaction_date,

}) {

  const url =
    `${cleanAppUrl}/api/transaction` +
    `?api_key=${encodeURIComponent(CONFIG.API_KEY)}` +
    `&user_id=${encodeURIComponent(CONFIG.USER_ID)}`


  const body = {

    amount,

    merchant,

    description,

    type,

    payment_method,

    apple_pay:
      !!apple_pay,

    source:
      source ||
      "iphone-shortcut",

    transaction_date:
      transaction_date ||
      new Date()
        .toISOString()
        .slice(0, 10),

  }


  const req =
    new Request(url)


  req.method =
    "POST"


  req.headers = {

    "Content-Type":
      "application/json",

    "Accept":
      "application/json",

  }


  req.body =
    JSON.stringify(body)


  req.timeoutInterval =
    20


  let raw


  try {

    raw =
      await req.loadString()

  } catch (e) {

    throw new Error(
      "Red fallida: " +
      (
        e?.message ||
        String(e)
      )
    )
  }


  let parsed


  try {

    parsed =
      JSON.parse(raw)

  } catch {

    throw new Error(
      `HTTP ${
        req?.response?.statusCode || "?"
      } no JSON: ${
        raw.slice(0, 200)
      }`
    )
  }


  if (!parsed.ok) {

    throw new Error(
      `Error API: ${
        parsed.error ||
        parsed.details ||
        JSON.stringify(parsed)
          .slice(0, 200)
      }`
    )
  }


  return parsed
}


// ============================================================
// BUSCAR VALOR EN OBJETO
// ============================================================

function pickDictValue(
  obj,
  keys
) {

  if (
    !obj ||
    typeof obj !== "object" ||
    Array.isArray(obj)
  ) {

    return ""
  }


  const entries =
    Object.keys(obj)


  for (
    const want of keys
  ) {

    const hit =
      entries.find(
        k =>
          k
            .toLowerCase()
            .replace(/\s+/g, "") ===
          want
      )


    if (
      hit &&
      obj[hit] != null &&
      String(obj[hit]).trim()
    ) {

      return obj[hit]
    }
  }


  return ""
}


// ============================================================
// PARSEAR OBJETO WALLET
// ============================================================

function walletFromObject(obj) {

  if (
    !obj ||
    typeof obj !== "object" ||
    Array.isArray(obj)
  ) {

    return null
  }


  // Posibles envoltorios.

  const wrapKeys = [

    "transaction",
    "transaccion",
    "wallet",
    "payment",
    "data",
    "result",

  ]


  const wrap =
    Object.keys(obj)
      .find(
        k =>
          wrapKeys.includes(
            k.toLowerCase()
          ) &&
          obj[k] &&
          typeof obj[k] === "object"
      )


  if (wrap) {
    obj = obj[wrap]
  }


  // ----------------------------------------------------------
  // MONTO
  // ----------------------------------------------------------

  const amountRaw =
    pickDictValue(
      obj,
      [

        "amount",
        "monto",
        "importe",
        "cantidad",
        "value",
        "total",
        "transactionamount",

      ]
    )


  // ----------------------------------------------------------
  // COMERCIO
  // ----------------------------------------------------------

  let merchantRaw =
    pickDictValue(
      obj,
      [

        "merchant",
        "comercio",
        "name",
        "nombre",
        "title",
        "payee",
        "vendor",
        "store",
        "businessname",

      ]
    )


  if (
    merchantRaw &&
    typeof merchantRaw === "object"
  ) {

    merchantRaw =
      pickDictValue(
        merchantRaw,
        [
          "name",
          "nombre",
          "title",
          "merchant",
        ]
      ) ||
      asText(merchantRaw)
  }


  // ----------------------------------------------------------
  // INFORMACIÓN EXTRA
  // ----------------------------------------------------------

  const extra =
    pickDictValue(
      obj,
      [

        "card",
        "tarjeta",
        "description",
        "descripcion",
        "note",
        "body",
        "text",
        "subtitle",

      ]
    )


  // ----------------------------------------------------------
  // MONTO
  // ----------------------------------------------------------

  let amount = 0


  if (
    typeof amountRaw === "number" &&
    amountRaw > 0
  ) {

    amount =
      Math.round(amountRaw)

  } else {

    amount =
      extractAmount(
        asText(amountRaw) +
        " " +
        asText(obj)
      )
  }


  // ----------------------------------------------------------
  // COMERCIO
  // ----------------------------------------------------------

  const merchant =
    merchantRaw

      ? titleize(
          cleanStopWords(
            String(merchantRaw)
              .trim()
          )
        )

      : extractMerchant(
          asText(obj)
        )


  // Si no encontramos monto ni comercio,
  // no consideramos que sea Wallet.

  if (
    !amount &&
    !merchantRaw
  ) {

    return null
  }


  return {

    amount,

    merchant:
      merchant ||
      "Apple Pay",

    description:
      [

        asText(merchantRaw),

        asText(amountRaw),

        asText(extra),

      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 300),

  }
}


// ============================================================
// PARSEAR JSON
// ============================================================

function tryParseJson(s) {

  if (
    typeof s !== "string"
  ) {

    return null
  }


  const t =
    s.trim()


  if (
    !t.startsWith("{") &&
    !t.startsWith("[")
  ) {

    return null
  }


  try {

    return JSON.parse(t)

  } catch {

    return null
  }
}


// ============================================================
// RECIBIR ENTRADA DE ATAJOS
// ============================================================

function collectShortcutInput() {

  const out = {

    input: "",

    src: "none",

    wallet: null,

    debug: "",

  }


  if (
    typeof args === "undefined" ||
    !args
  ) {

    return out
  }


  const bits = []


  // ==========================================================
  // INFORMACIÓN DE DEBUG
  // ==========================================================

  try {

    bits.push(
      "shortcutParameter=" +
      typeof args.shortcutParameter +
      " " +
      asText(
        args.shortcutParameter
      ).slice(0, 500)
    )

  } catch {}


  try {

    bits.push(
      "plainTexts=" +
      asText(
        args.plainTexts
      ).slice(0, 200)
    )

  } catch {}


  try {

    bits.push(
      "urls=" +
      asText(
        args.urls
      ).slice(0, 100)
    )

  } catch {}


  out.debug =
    bits.join("\n")


  // ==========================================================
  // 1. SHORTCUT PARAMETER
  // ==========================================================

  if (
    args.shortcutParameter != null &&
    args.shortcutParameter !== ""
  ) {

    const sp =
      args.shortcutParameter


    // Intentar reconocer Wallet.

    const wallet =
      typeof sp === "object"

        ? walletFromObject(sp)

        : walletFromObject(
            tryParseJson(sp)
          )


    if (
      wallet &&
      wallet.amount > 0
    ) {

      out.wallet =
        wallet


      out.input =
        [

          wallet.merchant,

          "$" +
          wallet.amount,

          wallet.description,

        ]
          .filter(Boolean)
          .join(" ")


      out.src =
        "args.shortcutParameter"


      return out
    }


    // Texto normal.

    const text =
      asText(sp).trim()


    if (
      text &&
      text !== "{}" &&
      text !== "[object Object]"
    ) {

      out.input =
        text


      out.src =
        "args.shortcutParameter"


      return out
    }
  }


  // ==========================================================
  // 2. SHARE SHEET - TEXTOS
  // ==========================================================

  if (
    args.plainTexts &&
    args.plainTexts.length > 0
  ) {

    const text =
      args.plainTexts
        .map(asText)
        .filter(Boolean)
        .join("\n")
        .trim()


    if (text) {

      out.input =
        text


      out.src =
        "args.plainTexts"


      return out
    }
  }


  // ==========================================================
  // 3. URL
  // ==========================================================

  if (
    args.urls &&
    args.urls.length > 0
  ) {

    const text =
      args.urls
        .map(asText)
        .filter(Boolean)
        .join("\n")
        .trim()


    if (text) {

      out.input =
        text


      out.src =
        "args.urls"


      return out
    }
  }


  // ==========================================================
  // 4. QUERY PARAMETERS
  // ==========================================================

  const qp =
    args.queryParameters || {}


  const qpText =
    asText(
      qp.text ||
      qp.notification ||
      qp.input ||
      ""
    )


  if (
    qpText.trim()
  ) {

    out.input =
      qpText.trim()


    out.src =
      "args.queryParameters"


    return out
  }


  // ==========================================================
  // 5. WIDGET
  // ==========================================================

  if (
    args.widgetParameter &&
    String(
      args.widgetParameter
    ).trim()
  ) {

    out.input =
      String(
        args.widgetParameter
      ).trim()


    out.src =
      "args.widgetParameter"


    return out
  }


  // ==========================================================
  // 6. ARCHIVOS
  // ==========================================================

  if (
    args.fileURLs &&
    args.fileURLs.length > 0
  ) {

    try {

      const fm =
        FileManager.local()


      const text =
        args.fileURLs
          .map(u => {

            try {

              return fm.readString(u)

            } catch {

              return ""
            }

          })
          .join("\n")
          .trim()


      if (text) {

        out.input =
          text


        out.src =
          "args.fileURLs"


        return out
      }

    } catch {}
  }


  return out
}


// ============================================================
// DETECTAR TEXTO DE TRANSACCIÓN
// ============================================================

function looksLikeTransactionText(s) {

  if (
    !s ||
    typeof s !== "string" ||
    s.trim().length < 6
  ) {

    return false
  }


  const txt =
    s.toLowerCase()


  return (

    /\$/.test(s) ||

    /\b\d{4,}\b/.test(s) ||

    /(paga(st|ste)|compra|cargo|abono|transferenc|debito|débito|crédito|credito)/
      .test(txt)

  )
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  // ==========================================================
  // VALIDACIÓN RÁPIDA DE CONFIG
  // ==========================================================

  if (
    !CONFIG.API_KEY ||
    CONFIG.API_KEY.indexOf("PEGA_AQUI_TU_API_KEY") !== -1 ||
    !CONFIG.USER_ID
  ) {
    throw new Error(
      "CONFIG incompleta. Abre el script en Scriptable " +
      "y configura API_KEY y USER_ID."
    )
  }

  let input = ""

  let inputSrc =
    "none"

  let wallet =
    null


  // ==========================================================
  // OBTENER ENTRADA
  // ==========================================================

  const fromArgs =
    collectShortcutInput()


  input =
    fromArgs.input


  inputSrc =
    fromArgs.src


  wallet =
    fromArgs.wallet


  // ==========================================================
  // HISTORIAL DE ERRORES (si ejecución manual sin input)
  // ==========================================================

  if (!input && IS_IN_APP) {
    const handled = await presentLogViewerIfNoInput()
    if (handled) return
  }


  // ==========================================================
  // CLIPBOARD
  // ==========================================================

  if (!input) {

    try {

      const clip =
        Pasteboard.pasteString()


      if (
        clip &&
        String(clip).trim().length > 0 &&
        looksLikeTransactionText(
          String(clip)
        )
      ) {

        input =
          String(clip).trim()


        inputSrc =
          "clipboard"
      }

    } catch {}
  }


  // ==========================================================
  // DEBUG
  // ==========================================================

  if (DEBUG) {

    const debugText =

      "=== SCRIPTABLE DEBUG ===\n\n" +

      `runsInApp=${IS_IN_APP}\n` +

      `runsInActionExtension=${IS_ACTION_EXTENSION}\n` +

      `runsWithSiri=${IS_SIRI}\n` +

      `runsInWidget=${IS_WIDGET}\n` +

      `silent=${IS_SILENT_RUN}\n` +

      `canShowAlert=${CAN_SHOW_ALERT}\n\n` +

      `src=${inputSrc}\n` +

      `len=${input.length}\n\n` +

      `wallet=${
        wallet
          ? JSON.stringify(wallet)
          : "null"
      }\n\n` +

      `${fromArgs.debug}\n\n` +

      "=== INPUT ===\n" +

      (
        input ||
        "(vacio)"
      ).slice(0, 1000)


    // SOLO Alert si realmente estamos
    // dentro de la aplicación Scriptable.

    if (CAN_SHOW_ALERT) {

      const a =
        new Alert()


      a.title =
        "DEBUG: Input recibido"


      a.message =
        debugText


      a.addAction(
        "OK"
      )


      await a.presentAlert()

    } else {

      // En Siri/Atajos NO usamos Alert.
      // El debug se devuelve al Atajo.

      Script.setShortcutOutput(

        JSON.stringify({

          debug: true,

          message:
            debugText,

        })

      )
    }
  }


  // ==========================================================
  // VARIABLES
  // ==========================================================

  let amount = 0

  let merchant = ""

  let description = null

  let type =
    CONFIG.DEFAULT_TYPE ||
    "expense"

  let payment_method = ""


  // ==========================================================
  // WALLET
  // ==========================================================

  if (
    wallet &&
    wallet.amount > 0
  ) {

    amount =
      wallet.amount


    merchant =
      wallet.merchant ||
      "Apple Pay"


    description =
      wallet.description ||
      input.slice(0, 300)


    type =
      detectType(input)


    payment_method =
      detectPaymentMethod(
        input,
        true
      )

  }

  // ==========================================================
  // TEXTO
  // ==========================================================

  else if (
    input &&
    input.trim().length > 0
  ) {

    amount =
      extractAmount(input)


    merchant =
      extractMerchant(input)


    type =
      detectType(input)


    payment_method =
      detectPaymentMethod(
        input,
        false
      )


    description =
      input.length > 10
        ? input.slice(0, 300)
        : null
  }


  // ==========================================================
  // VALIDACIÓN
  // ==========================================================

  const fromShortcut =

    inputSrc ===
      "args.shortcutParameter" ||

    inputSrc ===
      "args.plainTexts"


  const parsedOk =
    amount > 0 &&
    !!merchant


  // ==========================================================
  // CONFIRMACIÓN
  // ==========================================================
  //
  // En Atajos / Apple Pay:
  //
  // NO se muestra formulario.
  //
  // Si falta información, devuelve error.
  //
  // ==========================================================

  let needConfirm = false


  if (
    IS_SILENT_RUN
  ) {

    needConfirm =
      false

  } else {

    needConfirm =
      CONFIG.CONFIRM_IF_PARSED ||
      !parsedOk ||
      !fromShortcut
  }


  // ==========================================================
  // FORMULARIO MANUAL
  // ==========================================================

  if (
    needConfirm &&
    CAN_SHOW_ALERT
  ) {

    const q =
      new Alert()


    q.title =
      "Añadir transacción"


    q.message =

      input

        ? `Fuente: ${inputSrc}\n` +
          `Texto:\n${input.slice(0, 200)}\n\n` +
          `Monto detectado: ${
            amount
              ? "$" +
                amount.toLocaleString(
                  "es-CL"
                )
              : "?"
          }\n` +
          `Comercio: ${
            merchant || "?"
          }`

        : `No llegó ningún texto ` +
          `(src=${inputSrc}). ` +
          `Ingresa los datos manualmente:`


    q.addTextField(
      "Monto (CLP)",
      amount
        ? String(amount)
        : ""
    )


    q.addTextField(
      "Comercio",
      merchant || ""
    )


    q.addTextField(
      "Descripción (opc)",
      description || ""
    )


    q.addAction(
      "Gasto"
    )


    q.addAction(
      "Ingreso"
    )


    q.addAction(
      "Cancelar"
    )


    const idx =
      await q.presentAlert()


    if (
      idx === 2 ||
      idx == null
    ) {

      throw new Error(
        "Cancelado por usuario"
      )
    }


    type =
      idx === 0
        ? "expense"
        : "income"


    const amtRaw =
      q.textFieldValue(0) ||
      ""


    amount =
      parseInt(
        String(amtRaw)
          .replace(/\D/g, ""),
        10
      ) || 0


    merchant =
      (
        q.textFieldValue(1) ||
        ""
      ).trim() ||
      "Gasto Manual"


    description =
      (
        q.textFieldValue(2) ||
        ""
      ).trim() ||
      null


    if (!payment_method) {

      payment_method =
        CONFIG.DEFAULT_PAYMENT_METHOD ||
        "Débito"
    }

  } else if (
    needConfirm &&
    !CAN_SHOW_ALERT
  ) {

    // Si estamos en modo silencioso y no
    // pudimos detectar los datos, no intentamos
    // abrir una ventana.

    throw new Error(
      "No se pudo detectar monto/comercio " +
      "desde la entrada de Atajos."
    )
  }


  // ==========================================================
  // MÉTODO DE PAGO FINAL
  // ==========================================================

  if (!payment_method) {

    payment_method =
      CONFIG.DEFAULT_PAYMENT_METHOD ||
      (
        wallet
          ? "Débito"
          : ""
      )
  }


  // ==========================================================
  // VALIDACIONES
  // ==========================================================

  if (
    !amount ||
    amount <= 0
  ) {

    throw new Error(
      "Monto inválido: " +
      amount
    )
  }


  if (!merchant) {

    merchant =
      "Gasto Manual"
  }


  // ==========================================================
  // ENVIAR A API
  // ==========================================================

  const res =
    await pushTransaction({

      amount,

      merchant,

      description,

      type,

      payment_method,

      // SOLO true si realmente detectamos Wallet.
      apple_pay:
        !!wallet &&
        CONFIG.MARK_AS_APPLE_PAY_WHEN_WALLET,

      source:
        wallet
          ? "apple-pay-shortcut"
          : "iphone-shortcut",

    })


  // ==========================================================
  // LOG: ÉXITO
  // ==========================================================

  logAndReport({
    level: "success",
    error: null,
    input_src: inputSrc,
    input: input || "",
    context: {
      wallet: !!wallet,
      from_shortcut: fromShortcut,
      parsed_ok: parsedOk,
      category: res.matched?.category_name || null,
      payment_method: res.matched?.payment_method_name || null,
      duplicated: !!res.duplicate,
    },
    amount,
    merchant,
    type,
    transaction_id: res.transaction?.id || res.transaction_id || null,
  })


  // ==========================================================
  // RESULTADO INTERACTIVO
  // ==========================================================

  if (
    CAN_SHOW_ALERT
  ) {

    const matched =
      res.matched || {}


    const a =
      new Alert()


    a.title =
      res.duplicate
        ? "⚠️ Posible duplicado"
        : "✅ Guardado"


    a.message =
      [

        res.message || "",

        "",

        `Monto: ${
          type === "income"
            ? "+ "
            : "- "
        }${
          Number(amount)
            .toLocaleString(
              "es-CL"
            )
        }`,

        `Comercio: ${merchant}`,

        matched.category_name
          ? `Categoría: ${
              matched.category_name
            }`
          : "",

        matched.payment_method_name
          ? `Método: ${
              matched.payment_method_name
            }`
          : "",

        res.duplicate
          ? `ID existente: ${
              res.transaction_id
            }`
          : "",

      ]
        .filter(Boolean)
        .join("\n")


    a.addAction(
      "OK"
    )


    await a.presentAlert()
  }


  // ==========================================================
  // SALIDA PARA ATAJOS
  // ==========================================================

  const shortcutResult = {

    ok: true,

    amount,

    merchant,

    type,

    payment_method,

    apple_pay:
      !!wallet,

    transaction_id:
      res.transaction?.id ||
      res.transaction_id ||
      null,

    duplicated:
      !!res.duplicate,

    inputSrc,

  }


  Script.setShortcutOutput(

    JSON.stringify(
      shortcutResult
    )

  )


  return res
}


// ============================================================
// EJECUTAR
// ============================================================

try {

  await main()

} catch (e) {

  console.error(
    "Error:",
    e
  )


  const errorMessage =
    e?.message ||
    String(e)


  // Guardar input que causó el error (para depurar).
  // Usamos variables globales o las que existan.
  let capturedInput = ""
  let capturedSrc = "unknown"
  let capturedWallet = null
  try {
    capturedInput = (typeof input !== "undefined") ? (input || "") : ""
    capturedSrc = (typeof inputSrc !== "undefined") ? (inputSrc || "") : "unknown"
    capturedWallet = (typeof wallet !== "undefined") ? (wallet || null) : null
  } catch {}


  logAndReport({
    level: "error",
    error: errorMessage,
    input_src: capturedSrc,
    input: capturedInput,
    context: {
      runsInApp: IS_IN_APP,
      runsInActionExtension: IS_ACTION_EXTENSION,
      runsWithSiri: IS_SIRI,
      runsInWidget: IS_WIDGET,
      silent_run: IS_SILENT_RUN,
      can_show_alert: CAN_SHOW_ALERT,
      wallet: capturedWallet,
      stack: e?.stack || null,
      name: e?.name || null,
    },
  })


  // ==========================================================
  // ERROR INTERACTIVO
  // ==========================================================

  if (
    CAN_SHOW_ALERT
  ) {

    const a =
      new Alert()


    a.title =
      "❌ Error"


    a.message =
      errorMessage +
      "\n\n🔎 Sugerencia: abre el script y toca Ejecutar " +
      "sin entrada para ver el historial completo de errores."


    a.addAction(
      "OK"
    )


    await a.presentAlert()
  }


  // ==========================================================
  // ERROR PARA ATAJOS / SIRI
  // ==========================================================

  Script.setShortcutOutput(

    JSON.stringify({

      ok: false,

      error:
        errorMessage,

      context: {

        runsInApp:
          IS_IN_APP,

        runsInActionExtension:
          IS_ACTION_EXTENSION,

        runsWithSiri:
          IS_SIRI,

      },

      input_src: capturedSrc,
      input: capturedInput,

    })

  )
}


// ============================================================
// FINALIZAR
// ============================================================

Script.complete()