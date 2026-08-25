import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WIDGET_API_KEY = process.env.WIDGET_API_KEY || ''

const ALLOWED_LEVELS = new Set(['error', 'warn', 'info', 'success'])

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const apiKeyParam = url.searchParams.get('api_key')
    const asUserIdOverride = url.searchParams.get('user_id')

    const authOk =
      !!apiKeyParam &&
      !!WIDGET_API_KEY &&
      apiKeyParam === WIDGET_API_KEY &&
      !!asUserIdOverride

    if (!authOk) {
      return NextResponse.json(
        { ok: false, error: 'No autorizado (usa ?api_key=X&user_id=Y)' },
        { status: 401 },
      )
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const level = ALLOWED_LEVELS.has(body?.level) ? body.level : 'info'
    const errorMsg = body?.error ? String(body.error).slice(0, 500) : null
    const inputSrc = body?.input_src ? String(body.input_src).slice(0, 100) : null
    const input = body?.input ? String(body.input).slice(0, 1000) : null
    const context = body?.context
      ? JSON.stringify(body.context).slice(0, 2000)
      : null

    const stamped = {
      at: new Date().toISOString(),
      user_id: asUserIdOverride,
      level,
      error: errorMsg,
      input_src: inputSrc,
      input,
      context,
      amount: body?.amount ?? null,
      merchant: body?.merchant ? String(body.merchant).slice(0, 200) : null,
      type: body?.type ? String(body.type).slice(0, 50) : null,
      transaction_id: body?.transaction_id ? String(body.transaction_id).slice(0, 100) : null,
    }

    console.log(
      `[api/log] user=${asUserIdOverride.slice(0,8)} level=${level} ` +
        `${errorMsg ? 'error=' + errorMsg.replace(/\s+/g, ' ').slice(0, 160) : ''}`,
    )

    return NextResponse.json(
      { ok: true, received: stamped },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Error inesperado' },
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
