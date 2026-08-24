'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ConnectGmailPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [connected, setConnected] = useState<null | {
    email: string
    last_synced_at: string | null
    last_watch_history_id: string | null
  }>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('gmail_ok') === '1') {
      setMessage(
        `✅ Gmail ${url.searchParams.get('email') ?? ''} conectado correctamente. Watch: ${url.searchParams.get('watch') ?? 'N/A'}`
      )
    }
    if (url.searchParams.has('oauth_error')) {
      setError(`❌ Error OAuth: ${url.searchParams.get('oauth_error')}`)
    }
    loadUser()
  }, [])

  async function loadUser() {
    setLoading(true)
    const { data: { user }, error: uErr } = await supabase.auth.getUser()
    if (uErr || !user) {
      setError('No hay sesión iniciada.')
      setLoading(false)
      return
    }
    setUserId(user.id)
    setEmail(user.email ?? null)

    const { data, error: qErr } = await supabase
      .from('connected_accounts')
      .select('email, last_synced_at, last_watch_history_id')
      .eq('user_id', user.id)
      .eq('provider', 'gmail')
      .limit(1)
    if (qErr) setError(qErr.message)
    else if (data && data.length > 0) setConnected(data[0])

    setLoading(false)
  }

  async function handleConnect() {
    if (!userId) return
    setMessage('Redirigiendo a Google…')
    setError('')
    const return_to = `${window.location.origin}/conectar-gmail`
    try {
      const { data, error } = await supabase.functions.invoke(
        'gmail-oauth-start',
        {
          method: 'POST',
          body: {},
          headers: {},
        }
      )
      if (error) throw error
      // Para no depender de invoke, usamos GET directamente en la Edge Function
      window.location.href = data?.url ?? ''
    } catch {
      // Fallback: GET a la edge function
      const startUrl = new URL(
        `/functions/v1/gmail-oauth-start?user_id=${encodeURIComponent(userId)}&return_to=${encodeURIComponent(return_to)}`,
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? window.location.origin
      ).toString()
      window.location.href = startUrl
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            Conectar Gmail (Importación automática)
          </h1>
          <p className="mt-2 text-gray-500">
            Autorizamos a nuestra app a <strong>solo leer</strong> los emails transaccionales de tu
            banco. Cada compra/cargo que te llegue por email se agregará automáticamente como
            transacción.
          </p>

          {loading ? (
            <div className="mt-8 py-8 text-center text-gray-500">Cargando…</div>
          ) : (
            <div className="mt-8 space-y-6">
              {connected ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white text-xl">
                      ✓
                    </span>
                    <div>
                      <p className="font-semibold text-emerald-800">
                        Cuenta conectada
                      </p>
                      <p className="text-sm text-emerald-700">{connected.email}</p>
                      <p className="mt-1 text-xs text-emerald-700">
                        Última sincronización:{' '}
                        {connected.last_synced_at
                          ? new Date(connected.last_synced_at).toLocaleString('es-CL')
                          : 'Aún no'}
                        {' · '}
                        Watch: {connected.last_watch_history_id ? 'Activo' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-gray-700">
                    No tienes ninguna cuenta de Gmail conectada aún. Haz clic en el botón para
                    autorizar.
                  </p>
                </div>
              )}

              <button
                onClick={handleConnect}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-white border border-gray-200 px-6 py-4 text-base font-semibold text-gray-800 shadow-sm hover:bg-gray-50 transition"
              >
                <svg width="24" height="24" viewBox="0 0 48 48">
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H26v8h9.6c-1.7 4.7-6.2 8-11.6 8-6.9 0-12.5-5.6-12.5-12.5S17.1 11 24 11c3 0 5.8 1 8 2.8l5.7-5.7C34.5 5.2 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.5-.2-2.9-.4-4.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.7 15.4 18.9 11 24 11c3 0 5.8 1 8 2.8l5.7-5.7C34.5 5.2 29.5 3 24 3 16.1 3 9.3 7.3 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 45c5.4 0 10.4-2 14.2-5.4l-6.5-5.3c-2.1 1.5-4.7 2.4-7.7 2.4-5.3 0-9.8-3.2-11.5-7.8l-6.5 5C9.5 41.8 16.2 45 24 45z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20c0-.2 0-.3-.1-.5H42l-8.3 5.6 6.5 5.4c-.1.3.1 1.5.1 1.5l6.3-5c1.2-1.1 2-2.6 2-4.3 0-1.5-.2-2.9-.3-4.5z"
                  />
                </svg>
                {connected ? 'Conectar otra cuenta de Gmail' : 'Conectar con Gmail'}
              </button>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {message && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
                  {message}
                </div>
              )}

              {email && (
                <p className="text-xs text-gray-500 text-center">
                  Conectado como: <strong>{email}</strong>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
