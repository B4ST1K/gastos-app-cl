'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestImport() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function createTestTransaction() {
    setLoading(true)
    setMessage('Enviando...')

    const supabase = createClient()

    // Obtener la sesión actual
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      setMessage('No hay una sesión iniciada.')
      setLoading(false)
      return
    }

    // Obtener una categoría
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('name', 'Supermercado')
      .single()

    if (categoryError || !category) {
      setMessage('No se encontró la categoría Supermercado.')
      setLoading(false)
      return
    }

    // Obtener método de pago
    const { data: paymentMethod, error: paymentError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('name', 'Crédito')
      .single()

    if (paymentError || !paymentMethod) {
      setMessage('No se encontró el método Crédito.')
      setLoading(false)
      return
    }

    // Llamar a nuestra Edge Function
    const { data, error } = await supabase.functions.invoke(
      'import-transaction',
      {
        body: {
          amount: 10000,
          merchant: 'Lider - TEST',
          description: 'Transacción automática de prueba',
          category_id: category.id,
          payment_method_id: paymentMethod.id,
          transaction_type: 'expense',
          source: 'test',
          external_id: `test-${Date.now()}`,
          confidence: 1,
        },
      }
    )

    if (error) {
      console.error(error)
      setMessage(`Error: ${error.message}`)
      setLoading(false)
      return
    }

    console.log(data)

    setMessage(
      data?.duplicate
        ? '⚠️ La transacción ya existía.'
        : '✅ ¡Transacción creada correctamente!'
    )

    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border p-8">

        <h1 className="text-2xl font-bold">
          Prueba de importación
        </h1>

        <p className="mt-2 text-gray-500">
          Esto creará un gasto de prueba de $10.000.
        </p>

        <button
          onClick={createTestTransaction}
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-black p-3 text-white disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Crear gasto de prueba'}
        </button>

        {message && (
          <div className="mt-6 rounded-lg bg-gray-100 p-4">
            {message}
          </div>
        )}

      </div>
    </main>
  )
}