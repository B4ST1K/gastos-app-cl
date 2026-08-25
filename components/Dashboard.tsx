'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Transaction,
  Category,
  PaymentMethod,
  TransactionJoined,
  getCategoryColor,
  getCategoryName,
} from '@/lib/types'
import { getBillingPeriod, BILLING_DAY_DEFAULT } from '@/lib/billing'
import Header from './Header'
import SummaryCards from './SummaryCards'
import ExpensePieChart from './ExpensePieChart'
import TransactionForm from './TransactionForm'
import TransactionList from './TransactionList'

interface DashboardProps {
  userEmail: string
  userId: string
}

export default function Dashboard({ userEmail, userId }: DashboardProps) {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)

  const billingPeriod = useMemo(() => getBillingPeriod(BILLING_DAY_DEFAULT), [])
  const periodFrom = billingPeriod.iso.start.slice(0, 10)
  const periodTo = billingPeriod.iso.end.slice(0, 10)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, catsRes, pmsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('payment_methods').select('*').order('name'),
      ])

      if (!txRes.error && txRes.data) {
        setTransactions(txRes.data as Transaction[])
      }
      if (!catsRes.error && catsRes.data) {
        const raw = (catsRes.data ?? []) as Category[]
        const seen = new Map<string, Category>()
        raw.forEach((c) => {
          const key = `${c.name}__${c.type ?? 'null'}`
          if (!seen.has(key)) seen.set(key, c)
        })
        setCategories(Array.from(seen.values()))
      }
      if (!pmsRes.error && pmsRes.data) {
        const raw = (pmsRes.data ?? []) as PaymentMethod[]
        const seen = new Map<string, PaymentMethod>()
        raw.forEach((p) => {
          if (!seen.has(p.name)) seen.set(p.name, p)
        })
        setPaymentMethods(Array.from(seen.values()))
      }
    } finally {
      setLoading(false)
    }
  }, [supabase, userId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const categoriesMap = useMemo(() => {
    const m = new Map<string, Category>()
    categories.forEach((c) => m.set(c.id, c))
    return m
  }, [categories])

  const paymentMethodsMap = useMemo(() => {
    const m = new Map<string, PaymentMethod>()
    paymentMethods.forEach((p) => m.set(p.id, p))
    return m
  }, [paymentMethods])

  const joined: TransactionJoined[] = useMemo(
    () =>
      transactions.map((tx) => ({
        ...tx,
        category: tx.category_id
          ? categoriesMap.get(tx.category_id) ?? null
          : null,
        payment_method: tx.payment_method_id
          ? paymentMethodsMap.get(tx.payment_method_id) ?? null
          : null,
      })),
    [transactions, categoriesMap, paymentMethodsMap]
  )

  const joinedInPeriod = useMemo(
    () =>
      joined.filter((tx) => {
        const d = tx.transaction_date.slice(0, 10)
        return d >= periodFrom && d <= periodTo
      }),
    [joined, periodFrom, periodTo]
  )

  async function handleDelete(id: string) {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (!error) {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
    }
  }

  async function handleUpdate(id: string, patch: Partial<Pick<Transaction, 'amount' | 'merchant' | 'category_id'>>) {
    const { error, data } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (!error && data) {
      setTransactions((prev) =>
        prev.map((t) => (t.id === id ? ({ ...t, ...data } as Transaction) : t))
      )
    }
    return { error, data }
  }

  const totalIncome = joinedInPeriod
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpenses = joinedInPeriod
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const balance = totalIncome - totalExpenses

  const expenseByCategory = useMemo(() => {
    const byId = new Map<string, number>()
    joinedInPeriod
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const key = t.category_id ?? '__uncategorized__'
        byId.set(key, (byId.get(key) ?? 0) + Number(t.amount))
      })

    const arr: Array<{ name: string; value: number; color: string; icon: string }> = []
    byId.forEach((value, catId) => {
      const cat = categoriesMap.get(catId)
      arr.push({
        name: getCategoryName(cat),
        value,
        color: getCategoryColor(cat),
        icon: cat?.icon ?? '📦',
      })
    })
    return arr.sort((a, b) => b.value - a.value)
  }, [joinedInPeriod, categoriesMap])

  const recentTransactions = joinedInPeriod.slice(0, 10)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header email={userEmail} />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-center justify-center py-24">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header email={userEmail} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Panel de Control</h2>
              <p className="mt-1 text-gray-500">Resumen de tus finanzas personales</p>
            </div>
            <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
              Período: {billingPeriod.label}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <SummaryCards
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            balance={balance}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <ExpensePieChart data={expenseByCategory} />
            <TransactionList
              transactions={recentTransactions}
              categories={categories}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          </div>

          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-8">
              <TransactionForm userId={userId} onAdded={loadAll} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
