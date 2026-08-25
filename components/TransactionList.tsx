'use client'

import { useState } from 'react'
import {
  Transaction,
  TransactionJoined,
  Category,
  formatCurrency,
  formatDate,
  getCategoryColor,
  getCategoryIcon,
  getCategoryName,
} from '@/lib/types'

interface TransactionListProps {
  transactions: TransactionJoined[]
  categories?: Category[]
  onDelete?: (id: string) => void
  onUpdate?: (
    id: string,
    patch: Partial<Pick<Transaction, 'amount' | 'merchant' | 'category_id'>>
  ) => Promise<{ error?: any; data?: any }>
}

export default function TransactionList({
  transactions,
  categories = [],
  onDelete,
  onUpdate,
}: TransactionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    amount: string
    merchant: string
    category_id: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  function startEdit(tx: TransactionJoined) {
    setEditingId(tx.id)
    setDraft({
      amount: String(tx.amount),
      merchant: tx.merchant ?? '',
      category_id: tx.category_id ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  async function saveEdit(id: string) {
    if (!draft || !onUpdate) return
    setSaving(true)
    try {
      const digits = draft.amount.replace(/\D/g, '')
      const amount = parseInt(digits || '0', 10)
      if (!amount || amount <= 0) {
        alert('Monto inválido')
        return
      }
      const patch: Partial<Pick<Transaction, 'amount' | 'merchant' | 'category_id'>> = {
        amount,
        merchant: draft.merchant.trim() || null,
        category_id: draft.category_id || null,
      }
      await onUpdate(id, patch)
      setEditingId(null)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Movimientos Recientes</h3>
            <p className="text-sm text-gray-500">Últimas transacciones del período</p>
          </div>
        </div>
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mb-2 h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="font-medium">No hay movimientos registrados este período</p>
          <p className="text-sm">Comienza agregando tus primeros gastos e ingresos</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Movimientos Recientes</h3>
          <p className="text-sm text-gray-500">
            Últimas {transactions.length} transacciones del período · Haz clic en editar
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => {
          const color = getCategoryColor(tx.category ?? null)
          const icon = getCategoryIcon(tx.category ?? null)
          const categoryName = getCategoryName(tx.category ?? null)
          const title = tx.merchant || tx.description || categoryName
          const isEditing = editingId === tx.id
          const applicableCategories = categories.filter(
            (c) => !c.type || c.type === tx.type || c.type === null
          )

          return (
            <div
              key={tx.id}
              className="group rounded-xl border border-gray-100 p-4 transition hover:border-gray-200 hover:bg-gray-50"
            >
              {!isEditing ? (
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                    style={{
                      backgroundColor: `${color}15`,
                    }}
                  >
                    <span className="text-lg">{icon}</span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-gray-900">{title}</span>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${color}15`,
                          color,
                        }}
                      >
                        {categoryName}
                      </span>
                      {tx.payment_method && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {tx.payment_method.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                      <span>{formatDate(tx.transaction_date)}</span>
                      {tx.merchant && tx.description && (
                        <span className="truncate text-gray-400">{tx.description}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-lg font-bold ${
                        tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : '-'}
                      {formatCurrency(tx.amount)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {onUpdate && (
                      <button
                        onClick={() => startEdit(tx)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 opacity-0 transition hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
                        title="Editar transacción"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                          <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(tx.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        title="Eliminar transacción"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                      style={{
                        backgroundColor: `${color}15`,
                      }}
                    >
                      <span className="text-lg">{icon}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <label className="flex flex-1 flex-col text-xs text-gray-500">
                        Comercio / Nota
                        <input
                          type="text"
                          value={draft?.merchant ?? ''}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, merchant: e.target.value } : d))
                          }
                          className="mt-0.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Ej: Supermercado"
                        />
                      </label>
                      <label className="flex w-full flex-col text-xs text-gray-500 sm:w-40">
                        Monto (CLP)
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draft?.amount ?? ''}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, amount: e.target.value } : d))
                          }
                          className="mt-0.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="10000"
                        />
                      </label>
                      <label className="flex w-full flex-col text-xs text-gray-500 sm:w-44">
                        Categoría
                        <select
                          value={draft?.category_id ?? ''}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, category_id: e.target.value } : d))
                          }
                          className="mt-0.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">Sin categoría</option>
                          {applicableCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.icon ? `${c.icon} ` : ''}
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {formatDate(tx.transaction_date)} · {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                      {tx.payment_method ? ` · ${tx.payment_method.name}` : ''}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => saveEdit(tx.id)}
                        disabled={saving}
                        className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
