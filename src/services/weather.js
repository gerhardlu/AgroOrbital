import { CITIES } from '../data/cities.js'
import { FORECAST_DAYS, WEATHER_TIMEZONE, WEATHER_MAX_SOIL_AGE_MS } from '../data/weatherConfig.js'
import { formatISODate, isValidTimestamp } from '../utils/formatWeather.js'

export { WEATHER_REFRESH_MS, WEATHER_TIMEZONE, WEATHER_MAX_SOIL_AGE_MS } from '../data/weatherConfig.js'

const soilField = 'soil_moisture_3_to_9cm'
const soilUnit = 'm³/m³'
const soilDepth = '3–9 cm'
const dayMs = 24 * 60 * 60 * 1000

const fields = {
  interval: ['interval', 'seconds'],
  temperature: ['temperature_2m', '°C'],
  humidity: ['relative_humidity_2m', '%'],
  apparentTemperature: ['apparent_temperature', '°C'],
  precipitation: ['precipitation', 'mm'],
  windSpeed: ['wind_speed_10m', 'km/h'],
  cloudCover: ['cloud_cover', '%'],
  weatherCode: ['weather_code', 'wmo code'],
}

const dailyFields = {
  minTemperature: ['temperature_2m_min', '°C'],
  maxTemperature: ['temperature_2m_max', '°C'],
  precipitation: ['precipitation_sum', 'mm'],
  precipitationProbability: ['precipitation_probability_max', '%'],
  maxWindSpeed: ['wind_speed_10m_max', 'km/h'],
  et0: ['et0_fao_evapotranspiration', 'mm'],
  weatherCode: ['weather_code', 'wmo code'],
}

const descriptions = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Nevoeiro',
  48: 'Nevoeiro com formação de geada',
  51: 'Garoa leve',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  56: 'Garoa congelante leve',
  57: 'Garoa congelante intensa',
  61: 'Chuva leve',
  63: 'Chuva moderada',
  65: 'Chuva intensa',
  66: 'Chuva congelante leve',
  67: 'Chuva congelante intensa',
  71: 'Neve leve',
  73: 'Neve moderada',
  75: 'Neve intensa',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva leves',
  81: 'Pancadas de chuva moderadas',
  82: 'Pancadas de chuva intensas',
  85: 'Pancadas de neve leves',
  86: 'Pancadas de neve intensas',
  95: 'Trovoadas',
  96: 'Trovoadas com granizo leve',
  99: 'Trovoadas com granizo intenso',
}

export function describeWeather(code) {
  return Object.hasOwn(descriptions, code)
    ? descriptions[code]
    : 'Condição não informada'
}

function invalidResponse() {
  return new Error('A fonte meteorológica retornou dados inválidos. Tente atualizar novamente.')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function distanceKm(location, city) {
  const radians = Math.PI / 180
  const latitudeDifference = (location.latitude - city.latitude) * radians
  const longitudeDifference = (location.longitude - city.longitude) * radians
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(location.latitude * radians) * Math.cos(city.latitude * radians)
    * Math.sin(longitudeDifference / 2) ** 2
  const clamped = Math.min(1, Math.max(0, a))
  return 6371 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped))
}

function validateLocation(location, index) {
  if (!isObject(location)
    || !Number.isFinite(location.latitude)
    || !Number.isFinite(location.longitude)
    || Math.abs(location.latitude) > 90
    || Math.abs(location.longitude) > 180
    || (location.location_id !== undefined && location.location_id !== index)) {
    throw invalidResponse()
  }

  // A API retorna o centro da célula meteorológica, alguns km distante da cidade.
  // A distância e a cidade mais próxima conferem a ordem da resposta sem exigir
  // igualdade exata com as coordenadas solicitadas.
  const distances = CITIES.map((city) => distanceKm(location, city))
  if (distances[index] > 20 || distances.some((distance, otherIndex) => (
    otherIndex !== index && distance <= distances[index]
  ))) {
    throw invalidResponse()
  }
}

function normalizeCurrent(location) {
  const { current, current_units: units } = location
  if (!isObject(current) || !isObject(units)
    || units.time !== 'unixtime'
    || !validTimestamp(current.time)) {
    throw invalidResponse()
  }

  const normalized = {}
  for (const [name, [field, unit]] of Object.entries(fields)) {
    const value = current[field]
    if (units[field] !== unit || !Object.hasOwn(current, field)
      || (value !== null && !Number.isFinite(value))) {
      throw invalidResponse()
    }
    normalized[name] = value
  }

  if ((normalized.interval !== null && normalized.interval <= 0)
    || [normalized.humidity, normalized.cloudCover].some((value) => (
      value !== null && (value < 0 || value > 100)
    ))
    || [normalized.precipitation, normalized.windSpeed].some((value) => value !== null && value < 0)
    || (normalized.weatherCode !== null && (
      !Number.isInteger(normalized.weatherCode) || normalized.weatherCode < 0
    ))) {
    throw invalidResponse()
  }

  if (!Object.hasOwn(current, 'is_day')
    || ![null, 0, 1].includes(current.is_day)
    || units.is_day !== '') {
    throw invalidResponse()
  }

  return {
    ...normalized,
    description: describeWeather(normalized.weatherCode),
    isDay: current.is_day === null ? null : current.is_day === 1,
    observedAt: current.time * 1000,
  }
}

function validTimestamp(seconds) {
  return Number.isSafeInteger(seconds) && seconds > 0
    && Number.isSafeInteger(seconds * 1000)
    && isValidTimestamp(seconds * 1000)
}

function normalizeTimes(series, units, maximumLength, stepSeconds) {
  if (!isObject(series) || !isObject(units) || units.time !== 'unixtime'
    || !Array.isArray(series.time) || series.time.length > maximumLength
    || series.time.some((time, index) => (
      !validTimestamp(time) || (stepSeconds && time % stepSeconds !== 0)
      || (index > 0 && time <= series.time[index - 1])
    ))) {
    throw invalidResponse()
  }
  return series.time.map((time) => time * 1000)
}

function normalizeOptionalSeries(series, units, field, unit, length, isValid) {
  const values = series[field]
  // A ausência de uma variável não significa zero; a fonte pode não oferecê-la.
  if (values === undefined || values === null) return Array(length).fill(null)
  if (units[field] !== unit || !Array.isArray(values) || values.length !== length
    || values.some((value) => value !== null && (
      !Number.isFinite(value) || !isValid(value)
    ))) {
    throw invalidResponse()
  }
  return values
}

function normalizeSoil(location, observedAt) {
  const { hourly, hourly_units: units } = location
  if (hourly === undefined || hourly === null) {
    return { soilMoisture: null, soilObservedAt: null, soilDepth, samples: [] }
  }
  const times = normalizeTimes(hourly, units, FORECAST_DAYS * 24, 3600)
  const values = normalizeOptionalSeries(hourly, units, soilField, soilUnit,
    times.length, (value) => value >= 0 && value <= 1)
  const samples = times.map((timestamp, index) => ({ timestamp, value: values[index] }))
  const current = samples.findLast(({ timestamp }) => timestamp <= observedAt)
  const hasCurrent = current && current.value !== null
    && observedAt - current.timestamp <= WEATHER_MAX_SOIL_AGE_MS
  return {
    soilMoisture: hasCurrent ? current.value : null,
    soilObservedAt: hasCurrent ? current.timestamp : null,
    soilDepth,
    samples,
  }
}

function validDailyValue(name, value) {
  if (['precipitation', 'maxWindSpeed', 'et0'].includes(name)) return value >= 0
  if (name === 'precipitationProbability') return value >= 0 && value <= 100
  if (name === 'weatherCode') return Number.isInteger(value) && value >= 0
  return true
}

function groupSoilByDate(samples) {
  const groups = new Map()
  for (const { timestamp, value } of samples) {
    if (value === null) continue
    const date = formatISODate(timestamp)
    const group = groups.get(date) ?? { count: 0, sum: 0, min: value, max: value }
    group.count += 1
    group.sum += value
    group.min = Math.min(group.min, value)
    group.max = Math.max(group.max, value)
    if (group.count > 24) throw invalidResponse()
    groups.set(date, group)
  }
  return groups
}

function normalizeForecast(location, soilSamples) {
  const { daily, daily_units: units } = location
  if (daily === undefined || daily === null) return []
  const times = normalizeTimes(daily, units, FORECAST_DAYS)
  const values = Object.fromEntries(Object.entries(dailyFields).map(([name, [field, unit]]) => (
    [name, normalizeOptionalSeries(daily, units, field, unit, times.length,
      (value) => validDailyValue(name, value))]
  )))
  const dates = times.map(formatISODate)
  if (new Set(dates).size !== dates.length
    || times.some((time, index) => index > 0 && time - times[index - 1] !== dayMs)) {
    throw invalidResponse()
  }

  const soilByDate = groupSoilByDate(soilSamples)
  return times.map((timestamp, index) => {
    const day = Object.fromEntries(Object.entries(values).map(([name, series]) => [name, series[index]]))
    if (day.minTemperature !== null && day.maxTemperature !== null
      && day.minTemperature > day.maxTemperature) throw invalidResponse()
    const soil = soilByDate.get(dates[index])
    const sampleCount = soil?.count ?? 0
    // São Paulo usa dias de 24 h. A contagem expõe os dias com série incompleta.
    const expectedSamples = 24
    return {
      date: dates[index],
      timestamp,
      ...day,
      description: describeWeather(day.weatherCode),
      soilMoistureAvg: soil ? soil.sum / sampleCount : null,
      soilMoistureMin: soil?.min ?? null,
      soilMoistureMax: soil?.max ?? null,
      soilMoistureSamples: sampleCount,
      soilMoistureExpectedSamples: expectedSamples,
      soilMoistureCoverage: sampleCount / expectedSamples,
    }
  })
}

export async function fetchWeather({ signal } = {}) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: CITIES.map((city) => city.latitude).join(','),
    longitude: CITIES.map((city) => city.longitude).join(','),
    current: [...Object.values(fields).map(([field]) => field).filter((field) => field !== 'interval'), 'is_day'].join(','),
    hourly: soilField,
    daily: Object.values(dailyFields).map(([field]) => field).join(','),
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: WEATHER_TIMEZONE,
    timeformat: 'unixtime',
    forecast_days: String(FORECAST_DAYS),
  }).toString()

  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Não foi possível consultar o tempo agora (HTTP ${response.status}). Tente atualizar novamente.`)
  }

  const payload = await response.json()
  if (!Array.isArray(payload) || payload.length !== CITIES.length) {
    throw invalidResponse()
  }

  const weatherByCity = {}
  payload.forEach((location, index) => {
    validateLocation(location, index)
    if (location.timezone !== undefined && location.timezone !== WEATHER_TIMEZONE) throw invalidResponse()
    const current = normalizeCurrent(location)
    const { samples, ...soil } = normalizeSoil(location, current.observedAt)
    weatherByCity[CITIES[index].name] = {
      ...current,
      ...soil,
      forecast: normalizeForecast(location, samples),
    }
  })
  return { cities: weatherByCity, fetchedAt: Date.now() }
}
