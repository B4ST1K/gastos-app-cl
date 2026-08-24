'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { formatCurrencyPlain } from '@/lib/types'

interface CategoryData {
  name: string
  value: number
  color: string
  icon?: string
}

interface ExpensePieChartProps {
  data: CategoryData[]
}

export default function ExpensePieChart({ data }: ExpensePieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: Array<{ payload: CategoryData }>
  }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload
      const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0
      return (
        <div className="rounded-lg border bg-white p-3 shadow-lg">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            {item.icon && <span>{item.icon}</span>}
            {item.name}
          </p>
          <p className="text-sm font-medium text-gray-600">
            {formatCurrencyPlain(item.value)}
          </p>
          <p className="text-xs text-gray-500">{percentage}% del total</p>
        </div>
      )
    }
    return null
  }

  const renderLegend = (props: { payload?: Array<{ value: string; color: string }> }) => {
    const { payload } = props
    if (!payload) return null
    return (
      <ul className="mt-4 space-y-2">
        {payload.map((entry, index) => {
          const item = data[index]
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0
          return (
            <li key={`legend-${index}`} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-700 flex items-center gap-1">
                  {item.icon && <span>{item.icon}</span>}
                  {entry.value}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500">{percentage}%</span>
                <span className="font-medium text-gray-800 w-28 text-right">
                  {formatCurrencyPlain(item.value)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-gray-500">
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
            d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
          />
        </svg>
        <p className="font-medium">Aún no hay gastos registrados</p>
        <p className="text-sm">Agrega tu primer gasto para ver el gráfico</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Gastos por Categoría</h3>
          <p className="text-sm text-gray-500">Distribución de tus gastos</p>
        </div>
        <div className="rounded-lg bg-rose-50 px-3 py-1.5">
          <span className="text-sm font-semibold text-rose-600">
            Total: {formatCurrencyPlain(total)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="middle"
                align="right"
                layout="vertical"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col justify-center">
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            Detalle por categoría
          </h4>
          <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {data.map((item) => {
              const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0
              return (
                <li
                  key={item.name}
                  className="group rounded-xl border border-gray-100 p-3 transition hover:border-gray-200 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
                        style={{
                          backgroundColor: `${item.color}15`,
                        }}
                      >
                        {item.icon ?? '📦'}
                      </span>
                      <span className="font-medium text-gray-800">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{percentage}%</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrencyPlain(item.value)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
