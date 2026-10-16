import assert from 'node:assert/strict'
import test from 'node:test'
import { WEATHER_REFRESH_MS } from '../src/data/weatherConfig.js'
import { hasCurrentForecastDates, needsWeatherRefresh, nextWeatherRefreshDelay } from '../src/hooks/weatherCachePolicy.js'

const timestamp = date => Date.parse(`${date}-03:00`)

test('cache recente espera só o tempo restante até completar 15 minutos', () => {
  const fetchedAt = timestamp('2026-10-08T12:00:00')
  const weather = { fetchedAt }
  const now = fetchedAt + WEATHER_REFRESH_MS - 1
  assert.equal(needsWeatherRefresh(weather, now), false)
  assert.equal(nextWeatherRefreshDelay(weather, now), 1)
  assert.equal(needsWeatherRefresh(weather, now + 1), true)
  assert.equal(nextWeatherRefreshDelay(weather, now + 1), 0)
})

test('consulta recente com tentativa falha precisa de retry ao voltar à rede ou à aba', () => {
  const fetchedAt = timestamp('2026-10-08T12:00:00')
  const weather = { fetchedAt }
  const now = fetchedAt + 60_000
  assert.equal(needsWeatherRefresh(weather, now), false)
  assert.equal(needsWeatherRefresh(weather, now, true), true)
})

test('troca de dia em Brasília encerra o cache mesmo antes de 15 minutos', () => {
  const weather = { fetchedAt: timestamp('2026-10-08T23:58:00') }
  const beforeMidnight = timestamp('2026-10-08T23:59:30')
  const midnight = timestamp('2026-10-09T00:00:00')
  assert.equal(needsWeatherRefresh(weather, beforeMidnight), false)
  assert.equal(nextWeatherRefreshDelay(weather, beforeMidnight), 30_000)
  assert.equal(needsWeatherRefresh(weather, midnight), true)
  assert.equal(nextWeatherRefreshDelay(weather, midnight), 0)
})

test('mudança da data UTC antes de meia-noite de Brasília preserva cache fresco', () => {
  const weather = { fetchedAt: timestamp('2026-10-08T20:59:00') }
  const now = timestamp('2026-10-08T21:01:00')
  assert.equal(needsWeatherRefresh(weather, now), false)
  assert.equal(nextWeatherRefreshDelay(weather, now), WEATHER_REFRESH_MS - 120_000)
})

test('ausência, timestamp inválido ou relógio anterior ao cache exigem consulta', () => {
  const now = timestamp('2026-10-08T12:00:00')
  for (const weather of [null, {}, { fetchedAt: null }, { fetchedAt: '1791482400000' },
    { fetchedAt: NaN }, { fetchedAt: Infinity }, { fetchedAt: 1e20 }, { fetchedAt: now + 1 }]) {
    assert.equal(needsWeatherRefresh(weather, now), true)
    assert.equal(nextWeatherRefreshDelay(weather, now), 0)
  }
})

test('cache recém-consultado agenda o prazo completo quando a próxima meia-noite é posterior', () => {
  const now = timestamp('2026-10-08T12:00:00')
  assert.equal(nextWeatherRefreshDelay({ fetchedAt: now }, now), WEATHER_REFRESH_MS)
})

test('resposta recebida depois da meia-noite não renova uma previsão que ainda começa ontem', () => {
  const now = timestamp('2026-10-09T00:00:02')
  const weather = { fetchedAt: now, cities: {
    'Jundiaí': { forecast: [{ date: '2026-10-08' }, { date: '2026-10-09' }] },
  } }
  assert.equal(hasCurrentForecastDates(weather, now), false)
  assert.equal(needsWeatherRefresh(weather, now), true)
  assert.equal(nextWeatherRefreshDelay(weather, now), 0)
  weather.cities['Jundiaí'].forecast = [{ date: '2026-10-09' }]
  assert.equal(hasCurrentForecastDates(weather, now), true)
  assert.equal(needsWeatherRefresh(weather, now), false)
})

test('uma cidade defasada invalida o cache; ausência da série diária mantém o clima atual disponível', () => {
  const now = timestamp('2026-10-08T12:00:00')
  const weather = { fetchedAt: now, cities: {
    'Jundiaí': { forecast: [{ date: '2026-10-08' }] },
    Suzano: { forecast: [] }, Campinas: {}, Sorocaba: { forecast: [{ date: '2026-10-07' }] },
  } }
  assert.equal(hasCurrentForecastDates(weather, now), false)
  assert.equal(needsWeatherRefresh(weather, now), true)
  weather.cities.Sorocaba.forecast = [{ date: '2026-10-08' }]
  assert.equal(needsWeatherRefresh(weather, now), false)
  weather.cities.Sorocaba.forecast = [{ date: '2026-10-09' }]
  assert.equal(needsWeatherRefresh(weather, now), true)
})

test('política recusa data atual inválida e mantém o dia de Brasília na consulta que cruza UTC', () => {
  const now = timestamp('2026-10-08T21:01:00')
  const weather = { fetchedAt: now, cities: { 'Jundiaí': { forecast: [{ date: '2026-10-08' }] } } }
  assert.equal(hasCurrentForecastDates(weather, now), true)
  assert.equal(needsWeatherRefresh(weather, now), false)
  assert.equal(hasCurrentForecastDates(weather, NaN), false)
  assert.equal(needsWeatherRefresh(weather, NaN), true)
})
