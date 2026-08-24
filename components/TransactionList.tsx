import {
  TransactionJoined,
  formatCurrency,
  formatDate,
  getCategoryColor,
  getCategoryIcon,
  getCategoryName,
} from '@/lib/types'

interface TransactionListProps {
  transactions: TransactionJoined[]
  onDelete?: (id: string) => void
}

export default function TransactionList({ transactions, onDelete }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Movimientos Recientes</h3>
            <p className="text-sm text-gray-500">Últimas transacciones</p>
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
          <p className="font-medium">No hay movimientos registrados</p>
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
          <p className="text-sm text-gray-500">Últimas {transactions.length} transacciones</p>
        </div>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => {
          const color = getCategoryColor(tx.category ?? null)
          const icon = getCategoryIcon(tx.category ?? null)
          const categoryName = getCategoryName(tx.category ?? null)
          const title = tx.merchant || tx.description || categoryName
          return (
            <div
              key={tx.id}
              className="group flex items-center gap-4 rounded-xl border border-gray-100 p-4 transition hover:border-gray-200 hover:bg-gray-50"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{
                  backgroundColor: `${color}15`,
                }}
              >
                {tx.type === 'expense' ? (
                  <span className="text-lg">{icon}</span>
                ) : (
                  <span className="text-lg">{icon}</span>
                )}
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

              {onDelete && (
                <button
                  onClick={() => onDelete(tx.id)}
                  className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
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
          )
        })}
      </div>
    </div>
  )
}
