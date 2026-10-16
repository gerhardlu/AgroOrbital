import assert from 'node:assert/strict'
import test from 'node:test'
import { CITIES } from '../src/data/cities.js'
import {
  describeWeather, fetchWeather, WEATHER_MAX_SOIL_AGE_MS, WEATHER_REFRESH_MS, WEATHER_TIMEZONE,
} from '../src/services/weather.js'

const locations = [
  ['Jundiaí', -23.163445, -46.837708],
  ['Suzano', -23.514938, -46.326294],
  ['Campinas', -22.952549, -47.066803],
  ['Sorocaba', -23.514938, -47.463165],
]

function fixture() {
  const firstDay = 1791428400 // 08/10/2026 à meia-noite de São Paulo (03:00 UTC).
  return locations.map(([, latitude, longitude], index) => ({
    latitude,
    longitude,
    ...(index === 0 ? {} : { location_id: index }),
    timezone: WEATHER_TIMEZONE,
    current_units: {
      time: 'unixtime',
      interval: 'seconds',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      precipitation: 'mm',
      wind_speed_10m: 'km/h',
      cloud_cover: '%',
      weather_code: 'wmo code',
      is_day: '',
    },
    current: {
      time: 1791504000,
      interval: 900,
      temperature_2m: 20 + index,
      relative_humidity_2m: 70 + index,
      apparent_temperature: 22 + index,
      precipitation: index,
      wind_speed_10m: 5 + index,
      cloud_cover: 10 + index,
      weather_code: index,
      is_day: index % 2,
    },
    hourly_units: { time: 'unixtime', soil_moisture_3_to_9cm: 'm³/m³' },
    hourly: {
      time: Array.from({ length: 168 }, (_, hour) => firstDay + hour * 3600),
      soil_moisture_3_to_9cm: Array.from({ length: 168 }, () => 0.2 + index / 10),
    },
    daily_units: {
      time: 'unixtime',
      temperature_2m_min: '°C',
      temperature_2m_max: '°C',
      precipitation_sum: 'mm',
      precipitation_probability_max: '%',
      wind_speed_10m_max: 'km/h',
      et0_fao_evapotranspiration: 'mm',
      weather_code: 'wmo code',
    },
    daily: {
      time: Array.from({ length: 7 }, (_, day) => firstDay + day * 86400),
      temperature_2m_min: Array(7).fill(15 + index),
      temperature_2m_max: Array(7).fill(25 + index),
      precipitation_sum: [0, 2, 5, 0, 10, 15, 3],
      precipitation_probability_max: [0, 20, 50, 0, 80, 90, 30],
      wind_speed_10m_max: Array(7).fill(10 + index),
      et0_fao_evapotranspiration: Array(7).fill(4 + index),
      weather_code: Array(7).fill(index),
    },
  }))
}

test('consulta as quatro cidades de uma vez com unidades explícitas e cancelamento', async (t) => {
  const signal = new AbortController().signal
  const before = Date.now()
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://api.open-meteo.com')
    assert.equal(url.pathname, '/v1/forecast')
    assert.equal(url.searchParams.get('latitude'), CITIES.map(city => city.latitude).join(','))
    assert.equal(url.searchParams.get('longitude'), CITIES.map(city => city.longitude).join(','))
    assert.equal(url.searchParams.get('temperature_unit'), 'celsius')
    assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh')
    assert.equal(url.searchParams.get('precipitation_unit'), 'mm')
    assert.equal(url.searchParams.get('timezone'), 'America/Sao_Paulo')
    assert.equal(url.searchParams.get('timeformat'), 'unixtime')
    assert.equal(url.searchParams.get('forecast_days'), '7')
    assert.equal(url.searchParams.get('hourly'), 'soil_moisture_3_to_9cm')
    assert.deepEqual(url.searchParams.get('daily').split(',').sort(), [
      'temperature_2m_min', 'temperature_2m_max', 'precipitation_sum',
      'precipitation_probability_max', 'wind_speed_10m_max', 'et0_fao_evapotranspiration', 'weather_code',
    ].sort())
    assert.deepEqual(url.searchParams.get('current').split(',').sort(), [
      'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
      'precipitation', 'wind_speed_10m', 'cloud_cover', 'weather_code', 'is_day',
    ].sort())
    assert.equal(options.signal, signal)
    assert.equal(options.cache, 'no-store')
    return { ok: true, json: async () => fixture() }
  })

  const result = await fetchWeather({ signal })
  assert.equal(mock.mock.callCount(), 1)
  assert.equal(WEATHER_REFRESH_MS, 900_000)
  assert.ok(result.fetchedAt >= before && result.fetchedAt <= Date.now())
  assert.deepEqual(Object.keys(result.cities), locations.map(([name]) => name))
  locations.forEach(([name], index) => {
    const { forecast, soilMoisture, soilObservedAt, soilDepth, ...current } = result.cities[name]
    assert.deepEqual(current, {
      interval: 900,
      temperature: 20 + index,
      humidity: 70 + index,
      apparentTemperature: 22 + index,
      precipitation: index,
      windSpeed: 5 + index,
      cloudCover: 10 + index,
      weatherCode: index,
      description: describeWeather(index),
      isDay: Boolean(index % 2),
      observedAt: 1791504000000,
    })
    assert.equal(soilMoisture, 0.2 + index / 10)
    assert.equal(soilObservedAt, current.observedAt)
    assert.equal(soilDepth, '3–9 cm')
    assert.equal(forecast.length, 7)
    assert.deepEqual(forecast.map((day) => day.date), [
      '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
    ])
    assert.equal(forecast[0].minTemperature, 15 + index)
    assert.equal(forecast[0].maxTemperature, 25 + index)
    assert.equal(forecast[0].maxWindSpeed, 10 + index)
    assert.equal(forecast[0].et0, 4 + index)
    assert.equal(forecast[0].precipitation, 0)
    assert.equal(forecast[0].precipitationProbability, 0)
    assert.equal(forecast[0].soilMoistureSamples, 24)
    assert.equal(forecast[0].soilMoistureExpectedSamples, 24)
    assert.equal(forecast[0].soilMoistureCoverage, 1)
  })
})

test('preserva medidas indisponíveis como null e não transforma chuva zero em ausência', async (t) => {
  const payload = fixture()
  for (const field of Object.keys(payload[0].current)) {
    if (field !== 'time' && field !== 'precipitation') payload[0].current[field] = null
  }
  delete payload[0].hourly
  delete payload[0].daily
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  assert.deepEqual(cities['Jundiaí'], {
    interval: null,
    temperature: null,
    humidity: null,
    apparentTemperature: null,
    precipitation: 0,
    windSpeed: null,
    cloudCover: null,
    weatherCode: null,
    description: 'Condição não informada',
    isDay: null,
    observedAt: 1791504000000,
    soilMoisture: null,
    soilObservedAt: null,
    soilDepth: '3–9 cm',
    forecast: [],
  })
})

test('rejeita erros HTTP antes de ler ou mostrar valores', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 429,
    json: async () => { throw new Error('Não deve tentar ler a resposta') },
  }))
  await assert.rejects(fetchWeather(), /HTTP 429/)
})

test('informa o intervalo retornado pela API sem presumir uma janela fixa', async (t) => {
  const payload = fixture()
  payload[0].current.interval = 3600
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  assert.equal(cities['Jundiaí'].interval, 3600)
  assert.equal(cities['Suzano'].interval, 900)
})

test('rejeita formato, unidades e associação de cidades inseguros', async (t) => {
  const invalidPayloads = [null, {}, fixture().slice(0, 3)]
  for (const mutate of [
    (payload) => { payload[0].current = {} },
    (payload) => { payload[0].current_units.temperature_2m = '°F' },
    (payload) => { payload[0].current.time = '2026-10-08T12:00' },
    (payload) => { payload[0].current.time = 0 },
    (payload) => { payload[0].current.time = Number.MAX_SAFE_INTEGER },
    (payload) => { delete payload[0].current.relative_humidity_2m },
    (payload) => { payload[0].current.temperature_2m = '23' },
    (payload) => { payload[0].current.temperature_2m = Infinity },
    (payload) => { payload[0].current.is_day = 2 },
    (payload) => { payload[0].current.interval = 0 },
    (payload) => { payload[0].current.relative_humidity_2m = 101 },
    (payload) => { payload[0].current.precipitation = -1 },
    (payload) => { payload[0].current.weather_code = 1.5 },
    (payload) => { payload[0].latitude = 0 },
    (payload) => { payload[1].location_id = 0 },
    (payload) => { [payload[0], payload[1]] = [payload[1], payload[0]] },
    (payload) => { payload[0].timezone = 'UTC' },
    (payload) => { payload[0].hourly_units.soil_moisture_3_to_9cm = '%' },
    (payload) => { payload[0].hourly.soil_moisture_3_to_9cm[0] = 1.1 },
    (payload) => { payload[0].hourly.soil_moisture_3_to_9cm.pop() },
    (payload) => { payload[0].hourly.time[1] = payload[0].hourly.time[0] },
    (payload) => { payload[0].hourly.time[1] = payload[0].hourly.time[0] + 1800 },
    (payload) => { payload[0].hourly.time[0] += 1 },
    (payload) => { payload[0].daily_units.temperature_2m_max = '°F' },
    (payload) => { payload[0].daily.precipitation_probability_max[0] = 101 },
    (payload) => { payload[0].daily.precipitation_sum[0] = -1 },
    (payload) => { payload[0].daily.et0_fao_evapotranspiration[0] = -1 },
    (payload) => { payload[0].daily.temperature_2m_min[0] = 40 },
    (payload) => { payload[0].daily.time[1] = payload[0].daily.time[0] + 3600 },
    (payload) => { payload[0].daily.weather_code[0] = '61' },
  ]) {
    const payload = fixture()
    mutate(payload)
    invalidPayloads.push(payload)
  }
  let activePayload
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => activePayload }))
  for (const payload of invalidPayloads) {
    activePayload = payload
    await assert.rejects(fetchWeather(), /dados inválidos/)
  }
})

test('agrega solo por data em São Paulo, incluindo fim do dia UTC, e expõe cobertura parcial', async (t) => {
  const payload = fixture()
  payload[0].hourly = {
    time: [1791424800, 1791428400, 1791511200, 1791514800],
    soil_moisture_3_to_9cm: [0.9, 0.1, 0.3, 0.5],
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  const [first, second, third] = cities['Jundiaí'].forecast
  assert.equal(first.date, '2026-10-08')
  assert.equal(first.timestamp, 1791428400000)
  assert.equal(first.soilMoistureAvg, 0.2)
  assert.equal(first.soilMoistureMin, 0.1)
  assert.equal(first.soilMoistureMax, 0.3)
  assert.equal(first.soilMoistureSamples, 2)
  assert.equal(first.soilMoistureCoverage, 2 / 24)
  assert.equal(second.date, '2026-10-09')
  assert.equal(second.soilMoistureAvg, 0.5)
  assert.equal(second.soilMoistureSamples, 1)
  assert.equal(third.soilMoistureAvg, null)
  assert.equal(third.soilMoistureMin, null)
  assert.equal(third.soilMoistureMax, null)
  assert.equal(third.soilMoistureSamples, 0)
  assert.equal(third.soilMoistureCoverage, 0)
})

test('solo atual usa o horário anterior mais recente e nunca antecipa amostras futuras', async (t) => {
  const payload = fixture()
  const observed = payload[0].current.time
  payload[0].hourly = {
    time: [observed - 3600, observed + 3600],
    soil_moisture_3_to_9cm: [0, 0.9],
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  assert.equal(cities['Jundiaí'].soilMoisture, 0)
  assert.equal(cities['Jundiaí'].soilObservedAt, (observed - 3600) * 1000)
})

test('mantém médias diárias zero reais e não conta horas nulas na cobertura do solo', async (t) => {
  const payload = fixture()
  payload[0].hourly.soil_moisture_3_to_9cm = Array(168).fill(0)
  payload[0].hourly.soil_moisture_3_to_9cm[24] = null
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  const [first, second] = cities['Jundiaí'].forecast
  assert.equal(first.soilMoistureAvg, 0)
  assert.equal(first.soilMoistureMin, 0)
  assert.equal(first.soilMoistureMax, 0)
  assert.equal(first.soilMoistureSamples, 24)
  assert.equal(first.soilMoistureCoverage, 1)
  assert.equal(second.soilMoistureAvg, 0)
  assert.equal(second.soilMoistureSamples, 23)
  assert.equal(second.soilMoistureCoverage, 23 / 24)
})

test('não apresenta como atual solo antigo, nulo ou exclusivamente futuro', async (t) => {
  const payload = fixture()
  const observed = payload[0].current.time
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  assert.equal(WEATHER_MAX_SOIL_AGE_MS, 10_800_000)
  for (const hourly of [
    { time: [observed - 14_400], soil_moisture_3_to_9cm: [0.2] },
    { time: [observed - 3600, observed], soil_moisture_3_to_9cm: [0.2, null] },
    { time: [observed + 3600], soil_moisture_3_to_9cm: [0.8] },
  ]) {
    payload[0].hourly = hourly
    const { cities } = await fetchWeather()
    assert.equal(cities['Jundiaí'].soilMoisture, null)
    assert.equal(cities['Jundiaí'].soilObservedAt, null)
  }
})

test('preserva dias com campos ausentes/nulos, sem inventar chuva, ET0 ou solo zero', async (t) => {
  const payload = fixture()
  delete payload[0].daily.et0_fao_evapotranspiration
  payload[0].daily.precipitation_sum[0] = null
  payload[0].daily.temperature_2m_min[0] = null
  payload[0].hourly.soil_moisture_3_to_9cm = Array(168).fill(null)
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }))
  const { cities } = await fetchWeather()
  const city = cities['Jundiaí']
  assert.equal(city.forecast.length, 7)
  assert.equal(city.forecast[0].precipitation, null)
  assert.equal(city.forecast[0].minTemperature, null)
  assert.equal(city.forecast[0].maxTemperature, 25)
  assert.equal(city.forecast[0].et0, null)
  assert.equal(city.forecast[0].soilMoistureAvg, null)
  assert.equal(city.forecast[0].soilMoistureCoverage, 0)
  assert.equal(city.soilMoisture, null)
  assert.equal(city.soilObservedAt, null)
})

test('propaga falhas de rede e de cancelamento sem produzir valores substitutos', async (t) => {
  const aborted = new DOMException('Consulta cancelada', 'AbortError')
  t.mock.method(globalThis, 'fetch', async () => { throw aborted })
  await assert.rejects(fetchWeather(), (error) => error === aborted)
})

test('descreve códigos WMO em português e indica códigos desconhecidos', () => {
  assert.equal(describeWeather(0), 'Céu limpo')
  assert.equal(describeWeather(2), 'Parcialmente nublado')
  assert.equal(describeWeather(45), 'Nevoeiro')
  assert.equal(describeWeather(61), 'Chuva leve')
  assert.equal(describeWeather(82), 'Pancadas de chuva intensas')
  assert.equal(describeWeather(99), 'Trovoadas com granizo intenso')
  for (const code of [null, undefined, 999, 'toString']) {
    assert.equal(describeWeather(code), 'Condição não informada')
  }
})
