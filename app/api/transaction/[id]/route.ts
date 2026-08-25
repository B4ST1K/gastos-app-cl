import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const WIDGET_API_KEY = process.env.WIDGET_API_KEY || ''

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ ok: false, error: 'Falta id de transacción' }, { status: 400 })
    }

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

    const patch: Record<string, unknown> = {}

    if (body.amount != null) {
      let amount: number
      if (typeof body.amount === 'string') {
        const digits = body.amount.replace(/\D/g, '')
        amount = parseInt(digits || '0', 10)
      } else {
        amount = Math.round(Number(body.amount))
      }
      if (!amount || amount <= 0) {
        return NextResponse.json({ ok: false, error: 'amount debe ser > 0' }, { status: 400 })
      }
      patch.amount = amount
    }

    if (body.merchant != null) {
      const v = String(body.merchant).trim()
      patch.merchant = v || null
    }

    if (body.comercio != null && body.merchant == null) {
      const v = String(body.comercio).trim()
      patch.merchant = v || null
    }

    if (body.description != null) {
      const v = String(body.description).trim()
      patch.description = v || null
    }

    if (body.category_id != null) {
      const v = String(body.category_id).trim()
      patch.category_id = v || null
    }

    if (body.category_name != null && body.category_id == null) {
      const catName = String(body.category_name).trim()
      const found = await supabase
        .from('categories')
        .select('id')
        .or(`name.ilike.${catName}%`, {})
        .limit(1)
        .maybeSingle()
      if (found.data) patch.category_id = found.data.id
    }

    if (body.payment_method_id != null) {
      const v = String(body.payment_method_id).trim()
      patch.payment_method_id = v || null
    }

    if (body.transaction_date != null) {
      patch.transaction_date = String(body.transaction_date).slice(0, 10)
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'No hay campos para actualizar' }, { status: 400 })
    }

    const txBefore = await supabase
      .from('transactions')
      .select('id,user_id')
      .eq('id', id)
      .maybeSingle()

    if (!txBefore.data) {
      return NextResponse.json({ ok: false, error: 'Transacción no encontrada' }, { status: 404 })
    }
    if (txBefore.data.user_id !== userId) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    const upd = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (upd.error) {
      return NextResponse.json({ ok: false, error: 'DB update error', details: upd.error.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        message: 'Transacción actualizada',
        transaction: upd.data,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
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
      'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, accept',
    },
  })
}
