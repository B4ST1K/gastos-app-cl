export type BillingPeriod = {
  start: Date
  end: Date
  label: string
  iso: { start: string; end: string }
}

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(d)

/**
 * Devuelve el período de facturación basado en un día de corte (por defecto 25).
 * - Si HOY es >= día de corte: período = [25 este mes, 25 del mes que viene)
 * - Si HOY es < día de corte:  período = [25 mes pasado, 25 este mes)
 *
 * `end` es EXCLUSIVE a nivel de día (25 00:00 UTC). Para comparaciones >= start && < end.
 * Si usas .lte() con la fecha como datetime, usa `endExclusiveEndOfDay` (24 23:59:59.999Z).
 */
export function getBillingPeriod(startDay = 25, now = new Date()): BillingPeriod {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() // 0..11
  const today = now.getUTCDate()

  let startYear = year
  let startMonth = month
  let endYear = year
  let endMonth = month + 1 // por defecto: este mes -> mes que viene

  if (today < startDay) {
    // Aún no llegamos al corte de este mes. El período vigente empieza el 25 del mes pasado.
    startMonth = month - 1
    // endMonth se queda = month (este mes).
    endMonth = month
  }

  // Normalizar por año (casos enero/diciembre)
  if (startMonth < 0) {
    startMonth = 11
    startYear = year - 1
  }
  if (endMonth > 11) {
    endMonth = 0
    endYear = year + 1
  }

  const start = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0))
  // end exclusive (25 del siguiente mes, 00:00 UTC). Usar con < o <= endExclusiveEndOfDay
  const end = new Date(Date.UTC(endYear, endMonth, startDay, 0, 0, 0, 0))

  // El end "menos 1 ms" para usar con .lte() en rangos datetime hasta último ms del 24
  const endExclusiveEndOfDay = new Date(Date.UTC(endYear, endMonth, startDay, 0, 0, 0, 0))
  endExclusiveEndOfDay.setUTCMilliseconds(endExclusiveEndOfDay.getUTCMilliseconds() - 1)

  const label = `${fmtDate(start)} → ${fmtDate(new Date(endExclusiveEndOfDay))}`

  return {
    start,
    end, // exclusive 00:00
    label,
    iso: {
      start: start.toISOString(),
      end: new Date(end.getTime() - 1).toISOString(), // inclusive last ms
    },
  }
}

/**
 * Devuelve rango MES NATURAL por si quieres un fallback o comparar.
 */
export function getCalendarMonth(now = new Date()) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  const endExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0))
  const label = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(now)
  return {
    start,
    end: endExclusive,
    label,
    iso: {
      start: start.toISOString(),
      end: new Date(endExclusive.getTime() - 1).toISOString(),
    },
  }
}

export const BILLING_DAY_DEFAULT = 25
