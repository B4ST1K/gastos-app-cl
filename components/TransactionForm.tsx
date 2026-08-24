'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  TransactionType,
  Category,
  PaymentMethod,
  getCategoryColor,
  getCategoryIcon,
  formatCurrencyPlain,
} from '@/lib/types'

interface TransactionFormProps {
  userId: string
  onAdded: () => void
}

export default function TransactionForm({ userId, onAdded }: TransactionFormProps) {
  const supabase = createClient()

  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)

  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [merchant, setMerchant] = useState('')
  const [description, setDescription] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const filteredCategories = categories.filter(
    (c) => !c.type || c.type === type
  )

  useEffect(() => {
    async function loadMeta() {
      try {
        const [catsRes, pmsRes] = await Promise.all([
          supabase.from('categories').select('*').order('name'),
          supabase
            .from('payment_methods')
            .select('*')
            .in('name', ['Efectivo', 'Débito', 'Crédito'])
            .order('name'),
        ])
        if (!catsRes.error) {
          const raw = (catsRes.data ?? []) as Category[]
          const seen = new Map<string, Category>()
          raw.forEach((c) => {
            const key = `${c.name}__${c.type ?? 'null'}`
            if (!seen.has(key)) seen.set(key, c)
          })
          setCategories(Array.from(seen.values()))
        }
        if (!pmsRes.error) {
          const raw = (pmsRes.data ?? []) as PaymentMethod[]
          const seen = new Map<string, PaymentMethod>()
          raw.forEach((p) => {
            if (!seen.has(p.name)) seen.set(p.name, p)
          })
          setPaymentMethods(Array.from(seen.values()))
        }
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [supabase])

  useEffect(() => {
    setCategoryId('')
  }, [type])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!categoryId) {
      setError('Selecciona una categoría')
      return
    }

    const amountNum = parseInt(amount.replace(/\D/g, ''), 10)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Introduce un importe válido mayor que 0')
      return
    }

    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        type,
        amount: amountNum,
        category_id: categoryId || null,
        payment_method_id: paymentMethodId || null,
        merchant: merchant.trim() || null,
        description: description.trim() || null,
        transaction_date: transactionDate,
        source: 'manual',
      }

      const { error } = await supabase.from('transactions').insert(payload)
      if (error) throw error

      setSuccess(type === 'expense' ? 'Gasto añadido correctamente' : 'Ingreso añadido correctamente')
      setAmount('')
      setCategoryId('')
      setPaymentMethodId('')
      setMerchant('')
      setDescription('')
      setTransactionDate(new Date().toISOString().split('T')[0])

      setTimeout(() => setSuccess(''), 2500)
      onAdded()
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
      else setError('Error al guardar la transacción')
    } finally {
      setLoading(false)
    }
  }

  function formatAmountInput(value: string) {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    const num = parseInt(digits, 10)
    if (isNaN(num)) return ''
    return new Intl.NumberFormat('es-CL').format(num)
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Nueva Transacción</h3>
        <p className="text-sm text-gray-500">Registra un nuevo gasto o ingreso</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setType('expense')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
            type === 'expense'
              ? 'bg-white text-rose-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
          Gasto
        </button>
        <button
          type="button"
          onClick={() => setType('income')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition ${
            type === 'income'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Ingreso
        </button>
      </div>

      {loadingMeta ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Monto (CLP)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 font-semibold">
                $
              </span>
              <input
                type="text"
                inputMode="numeric"
                required
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                placeholder="100.000"
                className={`w-full rounded-lg border py-3 pl-8 pr-3 text-lg font-semibold transition focus:outline-none focus:ring-2 ${
                  type === 'expense'
                    ? 'border-gray-200 focus:border-rose-400 focus:ring-rose-100'
                    : 'border-gray-200 focus:border-emerald-400 focus:ring-emerald-100'
                }`}
              />
            </div>
            {amount && (
              <p className="mt-1 text-xs text-gray-500">
                {formatCurrencyPlain(parseInt(amount.replace(/\D/g, '') || '0', 10))}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Categoría
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredCategories.length === 0 ? (
                <p className="col-span-full text-sm text-gray-500">No hay categorías disponibles</p>
              ) : (
                filteredCategories.map((cat) => {
                  const active = categoryId === cat.id
                  const color = getCategoryColor(cat)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-transparent text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                      style={active ? { backgroundColor: color } : undefined}
                    >
                      <span className="text-base">{getCategoryIcon(cat)}</span>
                      <span className="truncate">{cat.name}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Comercio / Destino
            </label>
            <input
              type="text"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Ej: Unimarc, Rappi, Banco..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Descripción (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Compra del supermercado semanal"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Método de Pago
              </label>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Selecciona</option>
                {paymentMethods.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Fecha
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
              type === 'expense'
                ? 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'
                : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
            }`}
          >
            {loading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : null}
            {loading
              ? 'Guardando...'
              : type === 'expense'
              ? 'Añadir Gasto'
              : 'Añadir Ingreso'}
          </button>
        </form>
      )}
    </div>
  )
}
