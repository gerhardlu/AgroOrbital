import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWeather } from '../services/weather.js'
import { WEATHER_REFRESH_MS, WEATHER_REQUEST_TIMEOUT_MS } from '../data/weatherConfig.js'
import { hasCurrentForecastDates, needsWeatherRefresh, nextWeatherRefreshDelay } from './weatherCachePolicy.js'

let cachedWeather = null
let cachedError = ''

export function useWeather() {
  const [weather, setWeather] = useState(() => cachedWeather)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => cachedError)
  const activeRef = useRef(false)
  const requestRef = useRef(null)
  const weatherRef = useRef(cachedWeather)
  const retryNeededRef = useRef(Boolean(cachedError))
  const onlineRecoveryPendingRef = useRef(false)
  const scheduleRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!activeRef.current || requestRef.current || document.visibilityState !== 'visible') return

    const controller = new AbortController()
    requestRef.current = controller
    onlineRecoveryPendingRef.current = false
    setLoading(true)
    setError('')
    scheduleRef.current?.()

    let timedOut = false
    let failed = false
    let staleForecast = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, WEATHER_REQUEST_TIMEOUT_MS)

    try {
      const result = await fetchWeather({ signal: controller.signal })
      if (!activeRef.current || requestRef.current !== controller || controller.signal.aborted) return

      staleForecast = !hasCurrentForecastDates(result)
      if (staleForecast) throw new Error('Forecast dates are stale')

      cachedWeather = result
      cachedError = ''
      weatherRef.current = result
      retryNeededRef.current = false
      setWeather(result)
    } catch {
      if (!activeRef.current || requestRef.current !== controller) return

      failed = true
      cachedError = staleForecast
        ? 'A fonte ainda não atualizou a previsão para o dia de hoje. A consulta será tentada novamente.'
        : timedOut
        ? 'A consulta demorou demais. Tente atualizar novamente.'
        : 'Não foi possível consultar o tempo. Verifique sua conexão e tente novamente.'
      retryNeededRef.current = true
      setError(cachedError)
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === controller) {
        requestRef.current = null
        const recoverOnline = failed && onlineRecoveryPendingRef.current
        onlineRecoveryPendingRef.current = false
        if (activeRef.current) {
          setLoading(false)
          scheduleRef.current?.(recoverOnline)
        }
      }
    }
  }, [])

  useEffect(() => {
    activeRef.current = true
    let timer = null

    const clearTimer = () => {
      window.clearTimeout(timer)
      timer = null
    }

    const scheduleNext = (recoverOnline = false) => {
      clearTimer()
      if (!activeRef.current || requestRef.current || document.visibilityState !== 'visible') return

      if (recoverOnline) {
        void refresh()
        return
      }

      // Falhas tentam novamente no intervalo normal; voltar à aba/rede antecipa o retry.
      const delay = retryNeededRef.current ? WEATHER_REFRESH_MS : nextWeatherRefreshDelay(weatherRef.current)
      timer = window.setTimeout(refreshIfNeeded, Math.max(1, delay))
    }

    const refreshIfNeeded = () => {
      if (document.visibilityState !== 'visible') {
        clearTimer()
        const pending = requestRef.current
        if (pending) {
          retryNeededRef.current = true
          onlineRecoveryPendingRef.current = false
          requestRef.current = null
          pending.abort()
          setLoading(false)
        }
        return
      }

      if (needsWeatherRefresh(weatherRef.current, Date.now(), retryNeededRef.current)) void refresh()
      else scheduleNext()
    }

    const recoverOnline = () => {
      if (document.visibilityState === 'visible' && requestRef.current) {
        // Consume this event once if the active request subsequently fails.
        onlineRecoveryPendingRef.current = true
      } else refreshIfNeeded()
    }

    scheduleRef.current = scheduleNext
    refreshIfNeeded()
    document.addEventListener('visibilitychange', refreshIfNeeded)
    window.addEventListener('online', recoverOnline)

    return () => {
      activeRef.current = false
      clearTimer()
      scheduleRef.current = null
      document.removeEventListener('visibilitychange', refreshIfNeeded)
      window.removeEventListener('online', recoverOnline)
      onlineRecoveryPendingRef.current = false
      const pending = requestRef.current
      requestRef.current = null
      pending?.abort()
    }
  }, [refresh])

  return { weather, loading, error, refresh }
}
