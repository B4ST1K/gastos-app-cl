import { formatCurrencyPlain } from '@/lib/types'

interface SummaryCardsProps {
  totalIncome: number
  totalExpenses: number
  balance: number
}

export default function SummaryCards({
  totalIncome,
  totalExpenses,
  balance,
}: SummaryCardsProps) {
  const cards = [
    {
      label: 'Ingresos Totales',
      value: totalIncome,
      color: 'from-emerald-500 to-green-600',
      textColor: 'text-emerald-600',
      bgLight: 'bg-emerald-50',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      label: 'Gastos Totales',
      value: totalExpenses,
      color: 'from-rose-500 to-red-600',
      textColor: 'text-rose-600',
      bgLight: 'bg-rose-50',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      label: 'Balance',
      value: balance,
      color: balance >= 0 ? 'from-indigo-500 to-blue-600' : 'from-orange-500 to-red-500',
      textColor: balance >= 0 ? 'text-indigo-600' : 'text-orange-600',
      bgLight: balance >= 0 ? 'bg-indigo-50' : 'bg-orange-50',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <div
            className={`absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-gradient-to-br ${card.color} opacity-10`}
          />

          <div className="relative">
            <div className={`mb-3 inline-flex rounded-xl ${card.bgLight} p-2 ${card.textColor}`}>
              {card.icon}
            </div>

            <p className="text-sm font-medium text-gray-500">{card.label}</p>

            <p className={`mt-1 text-3xl font-bold tracking-tight ${card.textColor}`}>
              {formatCurrencyPlain(card.value)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
