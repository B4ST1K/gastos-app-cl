import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const WIDGET_API_KEY = process.env.WIDGET_API_KEY || ''

const ALLOWED_PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito']
const CATEGORY_NAME_FALLBACKS: Record<string, { search: string[]; default?: string }> = {
  'Alimentación': { search: ['unimarc', 'jumbo', 'lider', 'tottus', 'rappi', 'uber eats', 'cornershop', 'mercadona', 'supermercado', 'soproleche', 'disfruta', 'san josé', 'santa isabel', 'restaurant', 'café', 'cafe', 'domino', 'pizza', 'burger', 'kfc', 'mcdonald', 'chinese', 'sushi'] },
  'Transporte': { search: ['uber', 'cabify', 'didi', 'metro', 'transantiago', 'colectivo', 'taxi', 'gasolina', 'shell', 'copec', 'petrobras', 'estacionamiento', 'parking', 'peaje'] },
  'Entretenimiento': { search: ['netflix', 'spotify', 'hbo', 'disney', 'prime video', 'apple tv', 'youtube', 'cinema', 'cine', 'ticketmaster', 'steam', 'playstation', 'xbox', 'nintendo', 'entradas'] },
  'Salud': { search: ['farmacia', 'cruz verde', 'ahumada', 'salcobrand', 'clínica', 'clinica', 'dentista', 'médico', 'medico', 'hospital', 'isapre', 'fonasa', 'examen'] },
  'Vestimenta': { search: ['falabella', 'parís', 'paris', 'ripley', 'zara', 'h&m', 'mango', 'nike', 'adidas', 'puma', 'tienda de ropa', 'jeans'] },
  'Hogar': { search: ['sodimac', 'easy', 'construmart', 'la polar', 'abastible', 'gasco', 'enel', 'chilquinta', 'colbún', 'colbun', 'agua', 'internet', 'movistar', 'entel', 'claro', 'wom'] },
  'Servicios': { search: ['netflix', 'spotify', 'icloud', 'google', 'notion', 'figma', 'vercel', 'github', 'chatgpt', 'openai', 'microsoft', '365', 'adobe'] },
  'Otros': { search: [], default: 'Otros' },
}

function guessCategory(merchant: string, categories: { id: string; name: string; type?: string | null }[]): string | null {
  const m = merchant.toLowerCase().trim()
  if (!m) return null
  let matchedName: string | null = null
  for (const [catName, spec] of Object.entries(CATEGORY_NAME_FALLBACKS)) {
    for (const s of spec.search) {
      if (m.includes(s)) {
        matchedName = catName
        break
      }
    }
    if (matchedName) break
  }
  if (!matchedName) {
    const firstWithDefault = Object.values(CATEGORY_NAME_FALLBACKS).find((v) => v.default)
    if (firstWithDefault) matchedName = (firstWithDefault as any).default
  }
  if (!matchedName) return null
  const byName = categories.find((c) => c.name === matchedName && (!c.type || c.type === 'expense'))
  if (byName) return byName.id
  const anyByName = categories.find((c) => c.name === matchedName)
  return anyByName?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const apiKeyParam = url.searchParams.get('api_key')
    const asUserIdOverride = url.searchParams.get('user_id')
    const bearer = req.headers.get('authorization')?.startsWith('Bearer ')
      ? req.headers.get('authorization')!.slice(7)
      : null

    let supabase: ReturnType<typeof createServerClient>
    let userId: string | null = null

    if (bearer) {
      const cookieStore = await cookies()
      supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(_: { name: string; value: string; options?: CookieOptions }[]) {},
        },
      })
      const me = await supabase.auth.getUser(bearer)
      if (me?.data?.user?.id) userId = me.data.user.id
      else return NextResponse.json({ ok: false, error: 'Token inválido o sesión expirada' }, { status: 401 })
    } else if (apiKeyParam && WIDGET_API_KEY && apiKeyParam === WIDGET_API_KEY && asUserIdOverride) {
      const cookieStore = await cookies()
      supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(_: { name: string; value: string; options?: CookieOptions }[]) {},
        },
      })
      userId = asUserIdOverride
    } else if (apiKeyParam && WIDGET_API_KEY && apiKeyParam === WIDGET_API_KEY && !asUserIdOverride) {
      return NextResponse.json({ ok: false, error: 'Falta parámetro user_id junto con api_key' }, { status: 400 })
    } else {
      const cookieStore = await cookies()
      supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(toSet: { name: string; value: string; options?: CookieOptions }[]) {
            try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
          },
        },
      })
      const me = await supabase.auth.getUser()
      if (me?.data?.user?.id) userId = me.data.user.id
      else return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
    }

    if (!userId) return NextResponse.json({ ok: false, error: 'No user_id' }, { status: 401 })

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'Body JSON inválido' }, { status: 400 })
    }

    const type = String(body.type || body.transaction_type || 'expense').toLowerCase()
    if (!['expense', 'income'].includes(type)) {
      return NextResponse.json({ ok: false, error: "type debe ser 'expense' o 'income'" }, { status: 400 })
    }

    let amount: number
    if (body.amount == null) return NextResponse.json({ ok: false, error: 'amount es requerido' }, { status: 400 })
    if (typeof body.amount === 'string') {
      const digits = body.amount.replace(/\D/g, '')
      amount = parseInt(digits || '0', 10)
    } else {
      amount = Math.round(Number(body.amount))
    }
    if (!amount || amount <= 0) return NextResponse.json({ ok: false, error: 'amount debe ser > 0' }, { status: 400 })

    const merchant = String(body.merchant || body.note || body.comercio || (type === 'expense' ? 'Gasto' : 'Ingreso')).trim()
    const description = body.description == null ? null : String(body.description).trim() || null
    const transactionDate = body.transaction_date ? String(body.transaction_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
    const source = String(body.source || 'iphone-shortcut').trim()

    // Cargar categorías y métodos de pago para normalizar / adivinar
    const [catsRes, pmsRes] = await Promise.all([
      supabase.from('categories').select('id,name,type,color'),
      supabase.from('payment_methods').select('id,name'),
    ])
    const cats = (catsRes.data || []) as { id: string; name: string; type?: string | null }[]
    const pms = (pmsRes.data || []) as { id: string; name: string }[]

    let categoryId = body.category_id ? String(body.category_id) : null
    if (!categoryId) {
      // Buscar por nombre si viene category_name
      if (body.category_name) {
        const found = cats.find((c) => c.name.toLowerCase() === String(body.category_name).toLowerCase() && (!c.type || c.type === type))
        if (found) categoryId = found.id
      }
      // Adivinar por merchant (solo expense)
      if (!categoryId && type === 'expense') {
        categoryId = guessCategory(merchant, cats)
      }
      // Fallback: primera categoría del tipo
      if (!categoryId) {
        const first = cats.find((c) => (!c.type || c.type === type))
        if (first) categoryId = first.id
      }
    }

    let paymentMethodId = body.payment_method_id ? String(body.payment_method_id) : null
    if (!paymentMethodId) {
      const pmNameRaw = String(body.payment_method || body.metodo_pago || (body.apple_pay ? 'Débito' : '')).trim()
      let pmName = ALLOWED_PAYMENT_METHODS.find((n) => n.toLowerCase() === pmNameRaw.toLowerCase()) || null
      if (!pmName && body.apple_pay) pmName = 'Débito'
      if (!pmName && pmNameRaw) {
        pmName = ALLOWED_PAYMENT_METHODS.find((n) => pmNameRaw.toLowerCase().includes(n.toLowerCase())) || null
      }
      if (pmName) {
        const found = pms.find((p) => p.name === pmName)
        if (found) paymentMethodId = found.id
      }
      if (!paymentMethodId) {
        paymentMethodId = pms[0]?.id ?? null
      }
    }

    // Prevención simple de duplicados en 24h (mismo monto + mismo comercio)
    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const dup = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('amount', amount)
        .eq('merchant', merchant)
        .eq('type', type)
        .gte('created_at', from)
        .maybeSingle()
      if (dup.data) {
        return NextResponse.json({ ok: true, duplicate: true, warning: 'Posible duplicado en 24h; no se insertó', transaction_id: dup.data.id })
      }
    } catch {
      // Ignorar chequeo si falla
    }

    const payload: Record<string, unknown> = {
      user_id: userId,
      type,
      amount,
      merchant,
      description,
      transaction_date: transactionDate,
      category_id: categoryId,
      payment_method_id: paymentMethodId,
      source,
    }
    if (body.external_id) (payload as any).external_id = String(body.external_id)
    if (body.raw_data) (payload as any).raw_data = typeof body.raw_data === 'string' ? body.raw_data : JSON.stringify(body.raw_data)

    const ins = await supabase.from('transactions').insert(payload).select('*').single()
    if (ins.error) {
      return NextResponse.json({ ok: false, error: 'DB insert error', details: ins.error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        message: type === 'expense' ? 'Gasto registrado' : 'Ingreso registrado',
        transaction: ins.data,
        matched: {
          category_name: cats.find((c) => c.id === categoryId)?.name || null,
          payment_method_name: pms.find((p) => p.id === paymentMethodId)?.name || null,
        },
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Error inesperado', stack: e?.stack },
      { status: 500 },
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, accept',
    },
  })
}
