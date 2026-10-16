import { WEATHER_REFRESH_MS } from '../data/weatherConfig.js'
import { formatISODate, isValidTimestamp } from '../utils/formatWeather.js'

export function hasCurrentForecastDates(weather, now = Date.now()) {
  const today = formatISODate(now)
  if (today === null) return false
  // Current-only or unavailable daily data can still be cached. Available daily
  // forecasts must start today, even when the response was received after midnight.
  return Object.values(weather?.cities ?? {}).every((city) => (
    !Array.isArray(city?.forecast) || city.forecast.length === 0 || city.forecast[0]?.date === today
  ))
}

export function needsWeatherRefresh(weather, now = Date.now(), retryNeeded = false) {
  const fetchedAt = weather?.fetchedAt
  return retryNeeded || !isValidTimestamp(now) || !isValidTimestamp(fetchedAt) || fetchedAt > now
    || now - fetchedAt >= WEATHER_REFRESH_MS
    || formatISODate(fetchedAt) !== formatISODate(now)
    || !hasCurrentForecastDates(weather, now)
}

export function nextWeatherRefreshDelay(weather, now = Date.now()) {
  if (needsWeatherRefresh(weather, now)) return 0
  // Brasília usa UTC−3; o prazo também encerra a previsão que ainda inclui ontem.
  const nextMidnight = Date.parse(`${formatISODate(now)}T00:00:00-03:00`) + 24 * 60 * 60 * 1000
  return Math.max(0, Math.min(weather.fetchedAt + WEATHER_REFRESH_MS, nextMidnight) - now)
}
