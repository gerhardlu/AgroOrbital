import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { WEATHER_REFRESH_MS, WEATHER_REQUEST_TIMEOUT_MS } from '../src/data/weatherConfig.js'
import { hasCurrentForecastDates, needsWeatherRefresh, nextWeatherRefreshDelay } from '../src/hooks/weatherCachePolicy.js'
import { formatISODate } from '../src/utils/formatWeather.js'

// Execute the actual hook with a minimal effect host and deterministic browser
// events, clock and network. This tests request lifecycles without a DOM dependency.
const hookSource = readFileSync(new URL('../src/hooks/useWeather.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replace('export function useWeather', 'function useWeather')

function eventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const group = listeners.get(type) ?? new Set()
      group.add(listener)
      listeners.set(type, group)
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
    dispatch(type) { [...listeners.get(type) ?? []].forEach((listener) => listener({ type })) },
  }
}

async function flush() {
  for (let index = 0; index < 5; index++) await Promise.resolve()
}

function harness({ now = Date.parse('2026-10-08T12:00:00-03:00'), ignoreAbort = false } = {}) {
  const clock = { now }
  const timers = new Map()
  const requests = []
  const state = []
  let nextTimer = 0
  let effect
  let cleanup
  const document = { ...eventTarget(), visibilityState: 'visible' }
  const window = { ...eventTarget(),
    setTimeout(callback, delay) {
      const id = ++nextTimer
      timers.set(id, { callback, at: clock.now + delay })
      return id
    },
    clearTimeout(id) { timers.delete(id) },
  }
  const fetchWeather = ({ signal }) => new Promise((resolve, reject) => {
    requests.push({ resolve, reject, signal })
    if (!ignoreAbort) signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  const runWeatherHook = vm.runInNewContext(`${hookSource}\nuseWeather`, {
    useState(initial) {
      const index = state.length
      state.push(typeof initial === 'function' ? initial() : initial)
      return [state[index], value => { state[index] = value }]
    },
    useRef: current => ({ current }), useCallback: callback => callback,
    useEffect: callback => { effect = callback },
    fetchWeather, WEATHER_REFRESH_MS, WEATHER_REQUEST_TIMEOUT_MS,
    hasCurrentForecastDates: (weather, time = clock.now) => hasCurrentForecastDates(weather, time),
    needsWeatherRefresh: (weather, time = clock.now, retry) => needsWeatherRefresh(weather, time, retry),
    nextWeatherRefreshDelay: (weather, time = clock.now) => nextWeatherRefreshDelay(weather, time),
    AbortController, document, window, Date: { now: () => clock.now },
  })
  const api = runWeatherHook()
  const mount = () => { cleanup = effect() }
  const unmount = () => { cleanup?.() }
  mount()
  return {
    requests, api, clock, timers, mount, unmount,
    view: () => ({ weather: state[0], loading: state[1], error: state[2] }),
    currentWeather: () => ({ fetchedAt: clock.now, cities: { 'Jundiaí': { forecast: [{ date: formatISODate(clock.now) }] } } }),
    online: () => window.dispatch('online'),
    visibility(value) { document.visibilityState = value; document.dispatch('visibilitychange') },
    async advance(milliseconds) {
      const target = clock.now + milliseconds
      let callbacks = 0
      while (true) {
        const next = [...timers.entries()].sort((left, right) => left[1].at - right[1].at)[0]
        if (!next || next[1].at > target) break
        assert.ok(++callbacks < 50, 'A consulta não pode entrar em loop imediato')
        clock.now = next[1].at
        timers.delete(next[0])
        next[1].callback()
        await flush()
      }
      clock.now = target
      await flush()
    },
  }
}

test('online durante consulta pendente é consumido uma vez após falha, sem repetição imediata', async () => {
  const app = harness()
  try {
    app.online()
    app.online()
    assert.equal(app.requests.length, 1)
    app.requests[0].reject(new Error('Sem rede'))
    await flush()
    assert.equal(app.requests.length, 2)
    app.requests[1].reject(new Error('Ainda sem resposta'))
    await flush()
    assert.equal(app.requests.length, 2)
    await app.advance(WEATHER_REFRESH_MS - 1)
    assert.equal(app.requests.length, 2)
    await app.advance(1)
    assert.equal(app.requests.length, 3)
    app.requests[2].resolve(app.currentWeather())
    await flush()
    assert.equal(app.view().error, '')
  } finally { app.unmount() }
})

test('consulta bem-sucedida consome online pendente e não leva o retry para uma falha posterior', async () => {
  const app = harness()
  try {
    app.online()
    app.requests[0].resolve(app.currentWeather())
    await flush()
    assert.equal(app.requests.length, 1)
    await app.advance(1_000)
    app.online()
    assert.equal(app.requests.length, 1)
    void app.api.refresh()
    assert.equal(app.requests.length, 2)
    app.requests[1].reject(new Error('Falha posterior'))
    await flush()
    assert.equal(app.requests.length, 2)
  } finally { app.unmount() }
})

test('previsão defasada após meia-noite preserva dados antigos, informa pendência e respeita backoff', async () => {
  const app = harness({ now: Date.parse('2026-10-08T23:59:58-03:00') })
  try {
    const original = app.currentWeather()
    app.requests[0].resolve(original)
    await flush()
    await app.advance(2_000)
    assert.equal(app.requests.length, 2)
    const stale = { fetchedAt: app.clock.now, cities: { 'Jundiaí': { forecast: [{ date: '2026-10-08' }] } } }
    app.requests[1].resolve(stale)
    await flush()
    assert.equal(app.view().weather, original)
    assert.match(app.view().error, /fonte ainda não atualizou/)
    await app.advance(WEATHER_REFRESH_MS - 1)
    assert.equal(app.requests.length, 2)
    await app.advance(1)
    assert.equal(app.requests.length, 3)
    app.requests[2].resolve({ ...stale, fetchedAt: app.clock.now })
    await flush()
    assert.equal(app.requests.length, 3)
    assert.equal(app.view().weather, original)
    app.online()
    assert.equal(app.requests.length, 4)
    const fresh = app.currentWeather()
    app.requests[3].resolve(fresh)
    await flush()
    assert.equal(app.view().weather, fresh)
    assert.equal(app.view().error, '')
  } finally { app.unmount() }
})

test('montagem StrictMode e ocultar/reabrir ignoram respostas antigas e cancelam as consultas anteriores', async () => {
  const app = harness({ ignoreAbort: true })
  try {
    app.unmount()
    assert.equal(app.requests[0].signal.aborted, true)
    app.mount()
    assert.equal(app.requests.length, 2)
    app.requests[0].resolve(app.currentWeather())
    await flush()
    assert.equal(app.view().weather, null)
    app.visibility('hidden')
    assert.equal(app.requests[1].signal.aborted, true)
    app.visibility('visible')
    assert.equal(app.requests.length, 3)
    app.requests[1].resolve(app.currentWeather())
    await flush()
    assert.equal(app.view().weather, null)
    const current = app.currentWeather()
    app.requests[2].resolve(current)
    await flush()
    assert.equal(app.view().weather, current)
  } finally { app.unmount() }
  assert.equal(app.timers.size, 0)
})
