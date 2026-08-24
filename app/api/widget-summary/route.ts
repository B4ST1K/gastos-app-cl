import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { formatCurrencyPlain, formatDate, getCategoryName } from '@/lib/types'
import { getBillingPeriod } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const WIDGET_API_KEY = process.env.WIDGET_API_KEY || ''
const BILLING_DAY = Number(process.env.BILLING_DAY || 25)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const apiKeyParam = searchParams.get('api_key')
    const asUserIdOverride = searchParams.get('user_id')
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
      if (me?.data?.user?.id) {
        userId = me.data.user.id
      } else {
        return NextResponse.json({ ok: false, error: 'Token inválido o sesión expirada' }, { status: 401 })
      }
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
            try {
              toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {}
          },
        },
      })
      const me = await supabase.auth.getUser()
      if (me?.data?.user?.id) {
        userId = me.data.user.id
      } else {
        return NextResponse.json(
          { ok: false, error: 'No autenticado. Agrega Authorization: Bearer <token> o ?api_key=XX&user_id=YY' },
          { status: 401 },
        )
      }
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'No user_id' }, { status: 401 })
    }

    const period = getBillingPeriod(BILLING_DAY)
    const rangeFrom = period.iso.start.slice(0, 10)
    const rangeTo = period.iso.end.slice(0, 10)

    const [txPeriodRes, catsRes, pmsRes, lastTxsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,type,amount,category_id,transaction_date')
        .eq('user_id', userId)
        .gte('transaction_date', rangeFrom)
        .lte('transaction_date', rangeTo),
      supabase.from('categories').select('id,name,type,color,icon'),
      supabase.from('payment_methods').select('id,name'),
      supabase
        .from('transactions')
        .select('id,type,amount,merchant,description,transaction_date,category_id,payment_method_id,source')
        .eq('user_id', userId)
        .gte('transaction_date', rangeFrom)
        .lte('transaction_date', rangeTo)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    if (txPeriodRes.error) {
      return NextResponse.json(
        { ok: false, error: `DB error period (25-25): ${txPeriodRes.error.message}` },
        { status: 500 },
      )
    }

    const catsMap = new Map<string, { id: string; name: string; type?: string | null; color?: string | null }>()
    if (catsRes.data) (catsRes.data as any[]).forEach((c) => catsMap.set(c.id, c))
    const pmsMap = new Map<string, { id: string; name: string }>()
    if (pmsRes.data) (pmsRes.data as any[]).forEach((p) => pmsMap.set(p.id, p))

    const txs = (txPeriodRes.data || []) as any[]
    const totalExpense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0)
    const totalIncome = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0)
    const balance = totalIncome - totalExpense

    const byCategory = new Map<string, number>()
    txs.filter((t) => t.type === 'expense').forEach((t) => {
      const key = t.category_id || 'sin-categoria'
      byCategory.set(key, (byCategory.get(key) || 0) + Number(t.amount || 0))
    })
    const categoriesBreakdown = Array.from(byCategory.entries())
      .map(([catId, amount]) => {
        const cat = catsMap.get(catId)
        return {
          category_id: catId,
          name: cat?.name || 'Sin categoría',
          color: cat?.color || '#6b7280',
          type: cat?.type || 'expense',
          amount,
          amount_formatted: formatCurrencyPlain(amount),
        }
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)

    const last = (lastTxsRes.data || []) as any[]
    const lastTransactions = last.map((t) => {
      const cat = t.category_id ? catsMap.get(t.category_id) : null
      const pm = t.payment_method_id ? pmsMap.get(t.payment_method_id) : null
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount || 0),
        amount_formatted: formatCurrencyPlain(Number(t.amount || 0)),
        title:
          t.merchant ||
          t.description ||
          (t.type === 'expense' ? 'Gasto' : 'Ingreso') +
            (cat?.name ? ` · ${cat.name}` : ''),
        category: cat
          ? { id: cat.id, name: cat.name, color: cat.color || '#6b7280' }
          : { id: 'n/a', name: 'Sin categoría', color: '#6b7280' },
        payment_method: pm ? { id: pm.id, name: pm.name } : null,
        date_formatted: formatDate(t.transaction_date),
        source: t.source || 'manual',
      }
    })

    const updatedAt = new Date().toISOString()

    const payload = {
      ok: true,
      updated_at: updatedAt,
      period: {
        label: period.label,
        billing_day: BILLING_DAY,
        month: period.label, // backward compat
        from: rangeFrom,
        to: rangeTo,
        from_iso: period.iso.start,
        to_iso: period.iso.end,
      },
      summary: {
        total_income: totalIncome,
        total_expense: totalExpense,
        balance,
        balance_label:
          balance >= 0
            ? `A favor: ${formatCurrencyPlain(balance)}`
            : `En contra: ${formatCurrencyPlain(Math.abs(balance))}`,
        balance_sign: balance >= 0 ? 'positive' : 'negative',
        total_income_formatted: formatCurrencyPlain(totalIncome),
        total_expense_formatted: formatCurrencyPlain(totalExpense),
        balance_formatted: formatCurrencyPlain(Math.abs(balance)),
      },
      last_transactions: lastTransactions,
      categories_breakdown: categoriesBreakdown,
      meta: {
        tx_count_month: txs.length,
        tx_count_loaded: lastTransactions.length,
        user_id: userId,
      },
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=15, stale-while-revalidate=30',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Error inesperado', stack: e?.stack },
      { status: 500 },
    )
  }
}
