// ============================================================
// Parser de emails bancarios chilenos
// Reconoce: Banco Estado, Santander, BCI, Itaú, Scotiabank,
//           Falabella, Consorcio, Ripley, Liderbip, Tenpo, etc.
// ============================================================

export interface ParsedTransaction {
  merchant: string
  amount: number
  currency: string
  transaction_date: string // YYYY-MM-DD
  transaction_type: 'expense' | 'income'
  payment_method_name?: string // 'Débito' | 'Crédito' | 'Efectivo'
  confidence: number
}

export type ParseSkipReason = 'not_bank' | 'no_subject' | 'no_amount'

export type ParseBankEmailResult =
  | { ok: true; parsed: ParsedTransaction; bank_match: true }
  | { ok: false; reason: ParseSkipReason; bank_match: boolean }

// Dominios (sin @). También matchea subdominios: correo.bancoestado.cl
const KNOWN_BANK_DOMAINS = [
  'bancoestado.cl',
  'santander.cl',
  'bci.cl',
  'itau.cl',
  'scotiabank.cl',
  'bancofalabella.cl',
  'bancoconsorcio.cl',
  'ripley.cl',
  'tenpo.cl',
  'liderbip.cl',
  'mach.cl',
  'kun.cl',
]

const BANK_SUBJECT_HINT =
  /bancoestado|santander|banco\s*bci|\bbci\b|ita[uú]|scotiabank|falabella|consorcio|ripley|tenpo|lider\s*b?ip|\bmach\b|\bkun\b|notificaci[oó]n de (compra|cargo|pago|transferencia|abono)/i

const CLP_NUM_REGEX_STRINGS = [
  // $ 10.500 ; $120.000 ; $5.230,00 ; CLP 100.000
  String.raw`(?:CLP\s*?)?\$\s*?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)`,
  String.raw`(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:pesos?|CLP)`,
  // USD fallback
  String.raw`(?:US\$|USD)\s*?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)`,
]

const AMOUNT_REGEXES = CLP_NUM_REGEX_STRINGS.map((s) => new RegExp(s, 'i'))

function parseCLPNumber(raw: string): number {
  // Entrada: "10.500", "10.500,00", "1,234.56"
  const cleaned = raw
    .replace(/\./g, '__DOT__')
    .replace(/,/g, '__COM__')
  let intPart: string
  let decPart = '00'
  if (cleaned.includes('__COM__')) {
    // Formato CLP con coma decimal: 10.500,00
    const parts = cleaned.split('__COM__')
    intPart = parts[0].replace(/__DOT__/g, '')
    decPart = (parts[1] ?? '0').padEnd(2, '0').slice(0, 2)
  } else if (cleaned.includes('__DOT__')) {
    // Posiblemente 1,234.56 o 10.500 (sin decimales)
    const lastDot = cleaned.lastIndexOf('__DOT__')
    const tail = cleaned.slice(lastDot + 6) // luego de __DOT__
    if (tail.length <= 2) {
      // 1,234.56 style
      intPart = cleaned.slice(0, lastDot).replace(/__COM__/g, '').replace(/__DOT__/g, '')
      decPart = tail.padEnd(2, '0').slice(0, 2)
    } else {
      // 10.500 miles style (sin decimal)
      intPart = cleaned.replace(/__DOT__/g, '')
    }
  } else {
    intPart = cleaned
  }
  const numStr = `${intPart}.${decPart}`
  return Math.round(Number(numStr))
}

function extractAmount(subject: string, body: string): { amount: number; currency: string } | null {
  const haystack = `${subject}\n${body}`
  for (const rx of AMOUNT_REGEXES) {
    const m = haystack.match(rx)
    if (!m) continue
    const amount = parseCLPNumber(m[1])
    if (!Number.isFinite(amount) || amount <= 0) continue
    return {
      amount,
      currency: rx.source.includes('USD') ? 'USD' : 'CLP',
    }
  }
  return null
}

const MERCHANT_PATTERNS = [
  // "Compra por $9.990 en UBER" — no capturar el monto como comercio
  /(?:compra|cargo|pago|gasto|consumo)[^\n]{0,80}?\$\s*[\d.]{1,12}(?:,\d{1,2})?\s+(?:en|a)\s+["']?([A-ZÁÉÍÓÚÑa-záéíóúñ0-9][^\n\r<]{1,50}?)["']?(?=$|\n|\r|\.|,|;|\s{2,})/i,
  /(?:comercio|establecimiento|local)\s*[:\-]\s*["']?([^\n\r<]{2,60}?)["']?/i,
  /(?:realizaste|tienes un)[^\n]{0,80}?\s+en\s+([A-ZÀ-Ú0-9][^\n\r<]{2,50}?)(?:\.|$|\n)/i,
]

function isPlausibleMerchant(name: string): boolean {
  if (name.length < 2 || name.length > 80) return false
  if (/^\$/.test(name)) return false
  if (/^[\d.\s,]+$/.test(name)) return false
  if (/bancoestado|notificaci[oó]n/i.test(name)) return false
  return true
}

function extractMerchant(subject: string, body: string): string | null {
  const candidates = [subject, body.slice(0, 4000)]
  for (const text of candidates) {
    for (const rx of MERCHANT_PATTERNS) {
      const m = text.match(rx)
      if (m) {
        const cleaned = m[1]
          .replace(/\s+/g, ' ')
          .replace(/[.\-_,;()\[\]]+$/g, '')
          .trim()
        if (isPlausibleMerchant(cleaned)) return cleaned
      }
    }
  }
  return null
}

const DATE_PATTERNS = [
  // 23/08/2026 ; 23-08-2026 ; 23.08.2026
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
  // 23 de agosto de 2026
  /(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*)?(\d{2,4})/i,
  // 2026-08-23 ISO
  /(\d{4})[\-](\d{1,2})[\-](\d{1,2})/,
]

const MONTHS_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

function extractDate(subject: string, body: string, fallback?: Date): string {
  const hs = `${subject}\n${body}`
  for (const rx of DATE_PATTERNS) {
    const m = hs.match(rx)
    if (!m) continue
    try {
      let y: number, mo: number, d: number
      if (m.length === 4 && m[0].includes('de') || (m[2] && MONTHS_ES[m[2].toLowerCase()])) {
        d = Number(m[1])
        mo = MONTHS_ES[m[2].toLowerCase()]
        y = Number(m[3])
        if (y < 100) y += 2000
      } else if (m[1].length === 4) {
        y = Number(m[1]); mo = Number(m[2]); d = Number(m[3])
      } else {
        d = Number(m[1]); mo = Number(m[2]); y = Number(m[3])
        if (y < 100) y += 2000
      }
      if (y && mo && d && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return `${y}-${pad(mo)}-${pad(d)}`
      }
    } catch { /* ignore */ }
  }
  const fb = fallback ?? new Date()
  return `${fb.getFullYear()}-${pad(fb.getMonth() + 1)}-${pad(fb.getDate())}`
}

const TX_TYPE_RULES: Array<{ match: RegExp; type: 'expense' | 'income'; weight: number }> = [
  { match: /cargo|cobran|debit|pago(?:\s+realizado|efectuado)?|compra|gasto|abono\s*en\s*(?:comercio|establecimiento)|consumo|retiro|suscripcion|suscripcion|subscripcion|cuota/i, type: 'expense', weight: 0.95 },
  { match: /ingreso|abono|deposito|depósito|sueldo|salario|pago\s*(?:de|recibido)|transferencia\s*(?:recibida|a\s*tu\s*cuenta|hacia\s*ti)|remuneracion|vendedor/i, type: 'income', weight: 0.95 },
]

function extractType(subject: string, body: string): { transaction_type: 'expense' | 'income'; confidence: number } {
  const hs = `${subject}\n${body}`
  let bestScore = 0
  let bestType: 'expense' | 'income' = 'expense'
  for (const r of TX_TYPE_RULES) {
    if (r.match.test(hs)) {
      bestScore = Math.max(bestScore, r.weight)
      bestType = r.type
    }
  }
  return { transaction_type: bestType, confidence: Math.max(0.5, bestScore) }
}

const PM_RULES: Array<{ match: RegExp; pm: string }> = [
  { match: /credito|crédito|tarjeta\s*de\s*crédito|visa|mastercard|mastercard/i, pm: 'Crédito' },
  { match: /debito|débito|tarjeta\s*de\s*debito|redcompra|red compra|chq|chequera|cuenta\s*corriente|cuenta\s*vista/i, pm: 'Débito' },
  { match: /efectivo|retiro\s*en\s*(?:banco|cajero|sucursal)|atm/i, pm: 'Efectivo' },
]

function extractPaymentMethod(subject: string, body: string): string | undefined {
  const hs = `${subject}\n${body}`
  for (const r of PM_RULES) if (r.match.test(hs)) return r.pm
  return undefined
}

function hostMatchesBank(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '')
  return KNOWN_BANK_DOMAINS.some((d) => h === d || h.endsWith('.' + d))
}

function extractHosts(text: string): string[] {
  const hosts: string[] = []
  const re = /@([a-z0-9.-]+\.[a-z]{2,})/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) hosts.push(m[1].toLowerCase())
  return hosts
}

export function isBankNotification(from: string, subject: string, body: string): boolean {
  const haystack = `${from}\n${subject}\n${body}`
  if (extractHosts(haystack).some(hostMatchesBank)) return true
  if (BANK_SUBJECT_HINT.test(subject)) return true
  return false
}

export function parseBankEmail(params: {
  from: string
  subject: string
  bodyPreview?: string | null
  body?: string | null
  receivedAt?: Date | null
}): ParsedTransaction | null {
  const result = parseBankEmailDetailed(params)
  return result.ok ? result.parsed : null
}

export function parseBankEmailDetailed(params: {
  from: string
  subject: string
  bodyPreview?: string | null
  body?: string | null
  receivedAt?: Date | null
}): ParseBankEmailResult {
  const { from, subject, body, bodyPreview, receivedAt } = params
  const safeBody = body ?? bodyPreview ?? ''
  const bankMatch = isBankNotification(from, subject, safeBody)

  if (!bankMatch) return { ok: false, reason: 'not_bank', bank_match: false }
  if (!subject) return { ok: false, reason: 'no_subject', bank_match: true }

  const amountInfo = extractAmount(subject, safeBody)
  if (!amountInfo) return { ok: false, reason: 'no_amount', bank_match: true }

  const merchant = extractMerchant(subject, safeBody) ?? 'Comercio'
  const { transaction_type, confidence } = extractType(subject, safeBody)
  const transaction_date = extractDate(subject, safeBody, receivedAt ?? new Date())
  const payment_method_name = extractPaymentMethod(subject, safeBody)

  const totalConfidence = Math.min(
    1,
    confidence *
      (merchant === 'Comercio' ? 0.8 : 0.95) *
      (payment_method_name ? 1.0 : 0.9)
  )

  return {
    ok: true,
    bank_match: true,
    parsed: {
      merchant,
      amount: amountInfo.amount,
      currency: amountInfo.currency,
      transaction_date,
      transaction_type,
      payment_method_name,
      confidence: Math.round(totalConfidence * 1000) / 1000,
    },
  }
}
