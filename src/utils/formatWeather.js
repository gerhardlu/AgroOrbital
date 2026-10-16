import { WEATHER_TIMEZONE } from '../data/weatherConfig.js'

const numbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const preciseNumbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const dateTimes = new Intl.DateTimeFormat('pt-BR', {
  timeZone: WEATHER_TIMEZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const dates = new Intl.DateTimeFormat('pt-BR', {
  timeZone: WEATHER_TIMEZONE, day: '2-digit', month: '2-digit',
})
const weekdays = new Intl.DateTimeFormat('pt-BR', { timeZone: WEATHER_TIMEZONE, weekday: 'short' })
const isoDates = new Intl.DateTimeFormat('en-CA', {
  timeZone: WEATHER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

export function isValidTimestamp(timestamp) {
  return Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime())
}

export function formatValue(value, unit = '', precision = 1) {
  const formatter = precision === 2 ? preciseNumbers : numbers
  return Number.isFinite(value) ? `${formatter.format(value)}${unit}` : '—'
}

export function formatDateTime(timestamp) {
  return isValidTimestamp(timestamp) ? dateTimes.format(timestamp) : '—'
}

export function formatISODate(timestamp) {
  if (!isValidTimestamp(timestamp)) return null
  const parts = Object.fromEntries(isoDates.formatToParts(timestamp).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function calendarTimestamp(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  // Meio-dia em Brasília mantém o dia civil independente do fuso do visitante.
  const timestamp = Date.parse(`${date}T12:00:00-03:00`)
  return isValidTimestamp(timestamp) && formatISODate(timestamp) === date ? timestamp : null
}

export function formatForecastDate(date) {
  const timestamp = calendarTimestamp(date)
  return timestamp === null ? '—' : dates.format(timestamp)
}

export function formatWeekday(date) {
  const timestamp = calendarTimestamp(date)
  if (timestamp === null) return '—'
  const label = weekdays.format(timestamp).replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatSoilMoisture(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? formatValue(value * 100, '% vol.') : '—'
}
