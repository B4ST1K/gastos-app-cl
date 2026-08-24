export type TransactionType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  type?: TransactionType | null
  created_at?: string
}

export interface PaymentMethod {
  id: string
  name: string
  created_at?: string
}

export interface Transaction {
  id: string
  user_id: string
  type: TransactionType
  amount: number
  merchant?: string | null
  description?: string | null
  category_id?: string | null
  payment_method_id?: string | null
  transaction_date: string
  source?: string
  created_at?: string
}

export interface TransactionJoined extends Transaction {
  category?: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null
  payment_method?: Pick<PaymentMethod, 'id' | 'name'> | null
}

export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  'Comida': '#ef4444',
  'Supermercado': '#f97316',
  'Transporte': '#eab308',
  'Entretenimiento': '#22c55e',
  'Salud': '#06b6d4',
  'Hogar': '#3b82f6',
  'Suscripciones': '#8b5cf6',
  'Educación': '#ec4899',
  'Compras': '#f43f5e',
  'Viajes': '#14b8a6',
  'Servicios': '#6366f1',
  'Otros': '#6b7280',
  'Salario': '#10b981',
  'Freelance': '#0ea5e9',
  'Inversiones': '#a855f7',
  'Ventas': '#f59e0b',
  'Regalos': '#f472b6',
}

export function getCategoryColor(category: Category | null | undefined): string {
  if (category?.color) return category.color
  if (category?.name && DEFAULT_CATEGORY_COLORS[category.name]) {
    return DEFAULT_CATEGORY_COLORS[category.name]
  }
  return '#6b7280'
}

export function getCategoryName(category: Category | null | undefined): string {
  return category?.name ?? 'Sin categoría'
}

export function getCategoryIcon(category: Category | null | undefined): string {
  return category?.icon ?? '📦'
}

export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs)
  if (amount < 0) return `-${formatted}`
  return formatted
}

export function formatCurrencyPlain(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
