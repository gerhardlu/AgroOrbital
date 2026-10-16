import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarTimestamp, formatDateTime, formatForecastDate, formatISODate, formatSoilMoisture, formatValue, formatWeekday } from '../src/utils/formatWeather.js'
import { pageFromHash } from '../src/data/navigation.js'

test('valores ausentes não viram zero e saldo próximo do limiar preserva duas casas', () => {
  assert.equal(formatValue(null, ' mm'), '—')
  assert.equal(formatValue(NaN), '—')
  assert.equal(formatValue(0, ' mm'), '0 mm')
  assert.equal(formatValue(-14.98, ' mm', 2), '-14,98 mm')
  assert.equal(formatSoilMoisture(0), '0% vol.')
  assert.equal(formatSoilMoisture(0.372), '37,2% vol.')
  assert.equal(formatSoilMoisture(null), '—')
  assert.equal(formatSoilMoisture(1.1), '—')
})

test('datas civis e horários usam Brasília inclusive ao mudar o dia em UTC', () => {
  assert.equal(formatISODate(Date.parse('2026-10-09T02:59:00Z')), '2026-10-08')
  assert.equal(formatISODate(Date.parse('2026-10-09T03:00:00Z')), '2026-10-09')
  assert.equal(formatForecastDate('2026-10-08'), '08/10')
  assert.equal(formatWeekday('2026-10-08'), 'Qui')
  assert.match(formatDateTime(Date.parse('2026-10-09T03:30:00Z')), /09\/10.*00:30/)
  for (const invalid of [null, '', '2026-02-30', '2026-13-01']) {
    assert.equal(calendarTimestamp(invalid), null)
    assert.equal(formatForecastDate(invalid), '—')
  }
  assert.equal(formatDateTime(Infinity), '—')
})

test('fragmentos desconhecidos ou tipos inválidos mantêm uma página válida', () => {
  assert.equal(pageFromHash('#painel'), 'painel')
  assert.equal(pageFromHash('#contato'), 'contato')
  for (const invalid of [null, undefined, 42, '', '#toString']) assert.equal(pageFromHash(invalid), 'home')
})
