// ============================================================
// Widget Gastos App - Scriptable iOS
// ============================================================
// Cómo usar:
//   1. Instala Scriptable (gratis) en la App Store.
//   2. Crea un nuevo script vacío, borra TODO y pega este texto.
//   3. En la línea CONFIGURACIÓN abajo pon tus datos.
//   4. Guarda el script con nombre "Gastos Widget".
//   5. Ve a la Home del iPhone, mantén pulsado -> + -> Scriptable.
//   6. Selecciona el script "Gastos Widget" y el tamaño.
// ============================================================

// 👇👇👇 COMPLETA ESTOS 3 (o 4) CAMPOS ANTES DE USAR 👇👇👇

const CONFIG = {
  // URL de tu app en Vercel (sin barra al final).
  // Si pruebas local: "http://192.168.x.x:3000"
  APP_URL: "https://TU-PROYECTO.vercel.app",

  // MODO AUTENTICACIÓN — USA UNO DE LOS DOS:
  // ---------------------------------------------------------------
  // OPCIÓN A) Bearer JWT (más seguro, 1 usuario tú mismo).
  // Cómo obtenerlo: abre tu app, inicia sesión, Abre DevTools
  // Application / Storage / Cookies / nombre: sb-xxx-auth-token
  // Copia el valor JSON y el campo access_token. Pégalo aquí.
  // Caduca en 1h (lo renueva Scriptable si le pasas refresh token).
  // ---------------------------------------------------------------
  BEARER_TOKEN: "",  // access_token de Supabase (sb-xxx-auth-token)

  // OPCIÓN B) API KEY + USER_ID (simple para 1 usuario sin rotación).
  // Cómo: en Vercel project settings env vars agrega WIDGET_API_KEY
  // (una contraseña que tú inventes). Luego USER_ID = tu UUID auth.users
  // Desventaja: si alguien saca la apikey, ve tus datos. Ventaja:
  // no tienes que renovar el token cada hora.
  API_KEY: "",       // WIDGET_API_KEY que pusiste en Vercel
  USER_ID: "",       // Tu user_id (UUID auth.users)
  // 👆👆👆 termina configuración 👆👆👆
}

// ============================================================
// Endpoints
// ============================================================

const widgetApi = () => {
  if (CONFIG.BEARER_TOKEN && CONFIG.BEARER_TOKEN.length > 0) {
    return `${CONFIG.APP_URL}/api/widget-summary`
  }
  return `${CONFIG.APP_URL}/api/widget-summary?api_key=${encodeURIComponent(CONFIG.API_KEY)}&user_id=${encodeURIComponent(CONFIG.USER_ID)}`
}

const loadData = async () => {
  const req = new Request(widgetApi())
  if (CONFIG.BEARER_TOKEN && CONFIG.BEARER_TOKEN.length > 0) {
    req.headers = { Authorization: `Bearer ${CONFIG.BEARER_TOKEN}` }
  }
  req.timeoutInterval = 15
  const res = await req.loadJSON()
  return res
}

// ============================================================
// Formato moneda CLP (usamos los que vienen en "amount_formatted"
// si no, fallback a formatter local).
// ============================================================
const fmtCLP = (n) => {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n || 0)
  } catch (e) {
    return `$${Math.round(n || 0).toLocaleString("es-CL")}`
  }
}

const colorFor = (hex) => new Color(hex || "#6b7280", 1)

// ============================================================
// Widget CHICO
// ============================================================
function buildSmall(w, data) {
  const s = data.summary
  const title = w.addText("Gastos · " + (data.period.month || "Mes"))
  title.font = Font.boldSystemFont(12)
  title.textColor = Color.gray()

  w.addSpacer(4)

  const balanceBig = w.addText((s.balance_sign === "positive" ? "+" : "-") + s.balance_formatted)
  balanceBig.font = Font.boldSystemFont(22)
  balanceBig.textColor = s.balance_sign === "positive" ? colorFor("#10b981") : colorFor("#ef4444")

  w.addSpacer(2)
  const label = w.addText(s.balance_label)
  label.font = Font.systemFont(10)
  label.textColor = Color.gray()
  label.lineLimit = 2

  w.addSpacer()

  const stack = w.addStack()
  stack.layoutHorizontally()
  const inc = stack.addText("⬆ " + s.total_income_formatted)
  inc.font = Font.systemFont(10)
  inc.textColor = colorFor("#10b981")
  stack.addSpacer()
  const exp = stack.addText("⬇ " + s.total_expense_formatted)
  exp.font = Font.systemFont(10)
  exp.textColor = colorFor("#ef4444")

  const footer = w.addText(data.updated_at ? (new Date(data.updated_at)).toLocaleTimeString("es-CL", {hour:'2-digit',minute:'2-digit'}) : "")
  footer.font = Font.systemFont(8)
  footer.textColor = Color.lightGray()
}

// ============================================================
// Widget MEDIANO
// ============================================================
function buildMedium(w, data) {
  const s = data.summary

  const header = w.addStack()
  const headerTitle = header.addText("Gastos App")
  headerTitle.font = Font.boldSystemFont(13)
  headerTitle.textColor = Color.gray()
  header.addSpacer()
  const month = header.addText(data.period.month || "")
  month.font = Font.systemFont(11)
  month.textColor = Color.gray()

  w.addSpacer(6)

  const mainRow = w.addStack()
  mainRow.layoutHorizontally()

  const left = mainRow.addStack()
  left.layoutVertically()
  const balanceLbl = left.addText((s.balance_sign === "positive" ? "Saldo a favor" : "Saldo en contra"))
  balanceLbl.font = Font.systemFont(10)
  balanceLbl.textColor = Color.gray()
  const bal = left.addText(s.balance_formatted)
  bal.font = Font.boldSystemFont(26)
  bal.textColor = s.balance_sign === "positive" ? colorFor("#10b981") : colorFor("#ef4444")
  left.addSpacer(4)

  mainRow.addSpacer(16)

  const right = mainRow.addStack()
  right.layoutVertically()
  right.size = new Size(0, 0)
  right.addSpacer(2)

  const incRow = right.addStack()
  incRow.layoutHorizontally()
  const incDot = incRow.addText("● ")
  incDot.textColor = colorFor("#10b981")
  incDot.font = Font.systemFont(10)
  const incLbl = incRow.addText("Ingresos")
  incLbl.font = Font.systemFont(10)
  incLbl.textColor = Color.gray()
  incRow.addSpacer()
  const incVal = incRow.addText(s.total_income_formatted)
  incVal.font = Font.boldSystemFont(12)
  incVal.textColor = colorFor("#10b981")

  right.addSpacer(2)

  const expRow = right.addStack()
  expRow.layoutHorizontally()
  const expDot = expRow.addText("● ")
  expDot.textColor = colorFor("#ef4444")
  expDot.font = Font.systemFont(10)
  const expLbl = expRow.addText("Gastos")
  expLbl.font = Font.systemFont(10)
  expLbl.textColor = Color.gray()
  expRow.addSpacer()
  const expVal = expRow.addText(s.total_expense_formatted)
  expVal.font = Font.boldSystemFont(12)
  expVal.textColor = colorFor("#ef4444")

  // Desglose categorías (top 3)
  w.addSpacer(8)
  const catTitle = w.addText("Top categorías")
  catTitle.font = Font.systemFont(10)
  catTitle.textColor = Color.gray()
  w.addSpacer(2)

  const top3 = (data.categories_breakdown || []).slice(0, 3)
  if (top3.length === 0) {
    const empty = w.addText("Sin gastos este mes")
    empty.font = Font.systemFont(10)
    empty.textColor = Color.lightGray()
  }
  top3.forEach((c) => {
    const row = w.addStack()
    row.layoutHorizontally()
    const bar = row.addText("● ")
    bar.font = Font.systemFont(10)
    bar.textColor = colorFor(c.color)
    const name = row.addText(c.name || "Otros")
    name.font = Font.systemFont(10)
    name.lineLimit = 1
    row.addSpacer()
    const amt = row.addText(c.amount_formatted || fmtCLP(c.amount))
    amt.font = Font.systemFont(10)
    amt.textColor = Color.darkGray()
  })

  w.addSpacer()

  const footer = w.addText("Actualizado " + (data.updated_at ? (new Date(data.updated_at)).toLocaleTimeString("es-CL", {hour:'2-digit',minute:'2-digit'}) : ""))
  footer.font = Font.systemFont(8)
  footer.textColor = Color.lightGray()
}

// ============================================================
// Widget GRANDE
// ============================================================
function buildLarge(w, data) {
  const s = data.summary

  // Header
  const header = w.addStack()
  const t = header.addText("Gastos App")
  t.font = Font.boldSystemFont(14)
  t.textColor = Color.gray()
  header.addSpacer()
  const m = header.addText(data.period.month || "")
  m.font = Font.systemFont(12)
  m.textColor = Color.gray()

  w.addSpacer(8)

  // Big balance
  const sign = s.balance_sign === "positive" ? "Saldo a favor" : "Saldo en contra"
  const signLabel = w.addText(sign)
  signLabel.font = Font.systemFont(10)
  signLabel.textColor = Color.gray()

  const big = w.addText(fmtCLP(Math.abs(s.balance)))
  big.font = Font.boldSystemFont(36)
  big.textColor = s.balance_sign === "positive" ? colorFor("#10b981") : colorFor("#ef4444")

  w.addSpacer(6)

  // Income/Expense row
  const ieStack = w.addStack()
  ieStack.layoutHorizontally()

  const incCard = ieStack.addStack()
  incCard.backgroundColor = colorFor("#10b98133")
  incCard.cornerRadius = 10
  incCard.setPadding(10, 10, 10, 10)
  incCard.layoutVertically()
  const il = incCard.addText("Ingresos")
  il.font = Font.systemFont(10)
  il.textColor = colorFor("#065f46")
  incCard.addSpacer(2)
  const iv = incCard.addText(s.total_income_formatted)
  iv.font = Font.boldSystemFont(18)
  iv.textColor = colorFor("#065f46")

  ieStack.addSpacer(10)

  const expCard = ieStack.addStack()
  expCard.backgroundColor = colorFor("#ef444433")
  expCard.cornerRadius = 10
  expCard.setPadding(10, 10, 10, 10)
  expCard.layoutVertically()
  const el = expCard.addText("Gastos")
  el.font = Font.systemFont(10)
  el.textColor = colorFor("#7f1d1d")
  expCard.addSpacer(2)
  const ev = expCard.addText(s.total_expense_formatted)
  ev.font = Font.boldSystemFont(18)
  ev.textColor = colorFor("#7f1d1d")

  w.addSpacer(10)

  // Últimos movimientos
  const txTitle = w.addText("Últimos movimientos")
  txTitle.font = Font.systemFont(11)
  txTitle.textColor = Color.gray()
  w.addSpacer(4)

  const txs = (data.last_transactions || []).slice(0, 5)
  if (txs.length === 0) {
    const empty = w.addText("Sin movimientos recientes")
    empty.font = Font.systemFont(11)
    empty.textColor = Color.lightGray()
  }
  txs.forEach((tx) => {
    const row = w.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()

    const dot = row.addText("● ")
    dot.font = Font.systemFont(10)
    dot.textColor = tx.type === "income" ? colorFor("#10b981") : colorFor(tx.category?.color || "#ef4444")

    const body = row.addStack()
    body.layoutVertically()
    body.spacing = 1
    const t1 = body.addText(tx.title || (tx.type === "income" ? "Ingreso" : "Gasto"))
    t1.font = Font.systemFont(11)
    t1.lineLimit = 1
    const t2 = body.addText(tx.date_formatted + (tx.category?.name ? " · " + tx.category.name : ""))
    t2.font = Font.systemFont(9)
    t2.textColor = Color.lightGray()
    t2.lineLimit = 1

    row.addSpacer()

    const val = row.addText((tx.type === "income" ? "+" : "-") + (tx.amount_formatted || fmtCLP(tx.amount)))
    val.font = Font.boldSystemFont(12)
    val.textColor = tx.type === "income" ? colorFor("#10b981") : colorFor("#111827")

    w.addSpacer(3)
  })

  w.addSpacer()

  const footer = w.addText("Actualizado " + (data.updated_at ? (new Date(data.updated_at)).toLocaleString("es-CL", {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ""))
  footer.font = Font.systemFont(8)
  footer.textColor = Color.lightGray()
}

// ============================================================
// Entry Point
// ============================================================

async function createWidget() {
  let data
  try {
    data = await loadData()
    if (!data || !data.ok) throw new Error((data && data.error) || "No data")
  } catch (e) {
    const w = new ListWidget()
    const t = w.addText("Error")
    t.font = Font.boldSystemFont(13)
    t.textColor = colorFor("#ef4444")
    w.addSpacer(4)
    const msg = w.addText(String(e && (e.message || e)).slice(0, 180))
    msg.font = Font.systemFont(11)
    msg.textColor = Color.gray()
    w.addSpacer()
    const h = w.addText("Revisa CONFIG del script")
    h.font = Font.systemFont(9)
    h.textColor = Color.lightGray()
    w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
    return w
  }

  const family = config.widgetFamily || "medium"
  const w = new ListWidget()
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000)
  w.setPadding(14, 14, 14, 14)

  if (family === "small") buildSmall(w, data)
  else if (family === "large") buildLarge(w, data)
  else buildMedium(w, data)

  // Tap widget abre la app
  w.url = CONFIG.APP_URL + "/"

  return w
}

// Si lo ejecutas directamente dentro de Scriptable,
// muestra una previsualización del widget mediano.
if (config.runsInWidget) {
  const w = await createWidget()
  Script.setWidget(w)
} else {
  const fams = ["small", "medium", "large"]
  const pick = new Alert()
  pick.title = "Vista previa widget"
  fams.forEach((f) => pick.addAction(f.charAt(0).toUpperCase() + f.slice(1)))
  pick.addAction("Cancelar")
  const idx = await pick.presentAlert()
  if (idx < 3) {
    const fake = {}
    Object.defineProperty(fake, "widgetFamily", { get: () => fams[idx] })
    Object.assign(config, fake)
    const w = await createWidget()
    if (fams[idx] === "small") await w.presentSmall()
    else if (fams[idx] === "large") await w.presentLarge()
    else await w.presentMedium()
  }
}

Script.complete()
