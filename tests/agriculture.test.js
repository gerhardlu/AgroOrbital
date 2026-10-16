import assert from 'node:assert/strict'
import test from 'node:test'
import { AGRICULTURE_CRITERIA, analyzeAgriculture } from '../src/utils/analyzeAgriculture.js'

function forecast(overrides = {}) {
  return { forecast: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-10-${String(8 + index).padStart(2, '0')}`, minTemperature: 18, maxTemperature: 27,
    precipitation: 3, precipitationProbability: 50, maxWindSpeed: 10, et0: 3, weatherCode: 0,
    soilMoistureAvg: 0.2 + index * 0.01, soilMoistureSamples: 24, soilMoistureExpectedSamples: 24,
    ...overrides,
  })) }
}

test('calor persistente e déficit semanal mudam atenção e orientação sem inventar NDVI ou produtividade', () => {
  const result = analyzeAgriculture(forecast({ maxTemperature: 35, precipitation: 0, et0: 5 }))
  assert.equal(result.risk.level, 'high')
  assert.equal(result.summary.totalRain, 0)
  assert.equal(result.summary.et0Weekly, 35)
  assert.equal(result.summary.dryDays, 7)
  assert.equal(result.summary.hotDays, 7)
  assert.equal(result.waterBalance.value, -35)
  assert.equal(result.vegetationStress.level, 'high')
  assert.equal(result.vegetationStress.label, 'Elevado')
  assert.ok(result.solution.some(({ title }) => title === 'Avaliar disponibilidade de água'))
  assert.equal(result.ndvi, undefined)
  assert.equal(result.yield, undefined)
  assert.equal(result.vegetationStress.score, undefined)
})

test('chuva intensa e vento direcionam a solução a drenagem e avaliação de operações', () => {
  const result = analyzeAgriculture(forecast({ precipitation: 25, maxWindSpeed: 30 }))
  assert.equal(result.risk.level, 'high')
  assert.equal(result.summary.intenseRainDays, 7)
  assert.equal(result.summary.windyDays, 7)
  assert.equal(result.summary.totalRain, 175)
  assert.equal(result.waterBalance.state, 'surplus')
  assert.ok(result.solution.some(({ title }) => title === 'Inspecionar drenagem'))
  assert.ok(result.solution.some(({ title }) => title === 'Reavaliar operações e pulverizações'))
  assert.equal(result.inspectionWindow, null)
})

test('ausência de alertas exige a semana completa e não garante produtividade', () => {
  const result = analyzeAgriculture(forecast())
  assert.equal(result.risk.level, 'low')
  assert.equal(result.sufficientData, true)
  assert.equal(result.summary.partialCoverage, false)
  assert.equal(result.vegetationStress.level, 'low')
  assert.equal(result.waterBalance.value, 0)
  assert.match(result.reasons[0], /não assegura/)
})

test('dados ausentes e parciais não são zeros nem classificam risco semanal como baixo', () => {
  for (const source of [null, {}, { forecast: [] }, { forecast: [null] }, { forecast: forecast().forecast.slice(0, 6) }, forecast({ et0: null })]) {
    const result = analyzeAgriculture(source)
    assert.equal(result.risk.level, 'unknown')
    assert.equal(result.risk.label, 'Dados insuficientes')
    assert.equal(result.summary.partialCoverage, true)
    assert.equal(result.waterBalance.value, null)
    assert.equal(result.vegetationStress.level, 'unknown')
    assert.equal(result.inspectionWindow, null)
  }
  const missingRain = forecast()
  missingRain.forecast[2].precipitation = null
  const result = analyzeAgriculture(missingRain)
  assert.equal(result.summary.totalRain, null)
  assert.equal(result.summary.dryDays, null)
  assert.equal(result.summary.rainyDays, null)
  assert.equal(result.summary.completeDays, 6)
  assert.equal(result.dailyRisks[2].level, 'unknown')
})

test('datas inválidas, repetidas ou não consecutivas impedem uma avaliação semanal', () => {
  for (const date of [null, '2026-02-30', '2026-10-08', '2026-10-25']) {
    const source = forecast()
    source.forecast[1].date = date
    const result = analyzeAgriculture(source)
    assert.equal(result.risk.level, 'unknown')
    assert.equal(result.summary.totalRain, null)
  }
})

test('mudanças da previsão recalculam recomendações e estresse sem alterar os dados de entrada', () => {
  const source = forecast()
  const original = structuredClone(source)
  const before = analyzeAgriculture(source)
  assert.deepEqual(source, original)
  source.forecast[0].precipitation = 25
  source.forecast[0].maxWindSpeed = 30
  const after = analyzeAgriculture(source)
  assert.notDeepEqual(before.solution, after.solution)
  assert.equal(before.risk.level, 'low')
  assert.equal(after.risk.level, 'high')
})

test('zeros são medidas válidas, temperaturas negativas são válidas, números inválidos são insuficientes', () => {
  const result = analyzeAgriculture(forecast({ minTemperature: -2, maxTemperature: 0, precipitation: 0, et0: 0, maxWindSpeed: 0, soilMoistureAvg: 0 }))
  assert.equal(result.sufficientData, true)
  assert.equal(result.summary.totalRain, 0)
  assert.equal(result.summary.minTemperature, -2)
  assert.equal(result.waterBalance.value, 0)
  assert.equal(result.soilTrend.state, 'stable')
  for (const override of [{ et0: -1 }, { maxWindSpeed: NaN }, { precipitation: '0' }, { maxTemperature: Infinity }, { minTemperature: 30 }]) {
    assert.equal(analyzeAgriculture(forecast(override)).sufficientData, false)
  }
})

test('tendência de solo exclui dias com amostras incompletas e precisa de dois dias completos', () => {
  const source = forecast()
  source.forecast[0].soilMoistureAvg = 0.8
  source.forecast[0].soilMoistureSamples = 12
  source.forecast[6].soilMoistureAvg = 0.01
  source.forecast[6].soilMoistureSamples = 23
  const trend = analyzeAgriculture(source).soilTrend
  assert.equal(trend.state, 'increasing')
  assert.ok(Math.abs(trend.value - 0.04) < Number.EPSILON)
  assert.equal(trend.firstDate, '2026-10-09')
  assert.equal(trend.lastDate, '2026-10-13')
  assert.equal(trend.completeDays, 5)
  assert.equal(analyzeAgriculture(forecast({ soilMoistureSamples: 0 })).soilTrend.state, 'unavailable')
})

test('inspeção seleciona um dia menos adverso sem chamar a janela de segura para pulverização', () => {
  const source = forecast({ precipitation: 0.5 })
  source.forecast[3].precipitation = 0
  source.forecast[3].maxWindSpeed = 5
  const result = analyzeAgriculture(source)
  assert.equal(result.inspectionWindow.date, '2026-10-11')
  assert.match(result.inspectionWindow.text, /não é uma janela validada para pulverização/)
})

test('prioridades são curtas e descrições completas permanecem na solução', () => {
  const result = analyzeAgriculture(forecast({ precipitation: 25, maxWindSpeed: 30 }))
  assert.deepEqual(result.rec, result.solution.map(({ title }) => title))
  assert.ok(result.solution.every(({ title, text }) => text.length > title.length))
  const insufficient = analyzeAgriculture(null)
  assert.deepEqual(insufficient.rec, insufficient.solution.map(({ title }) => title))
})

test('a solução acompanha queda confiável do solo sem mudar a classe climática', () => {
  const source = forecast({ soilMoistureAvg: 0.3 })
  const before = analyzeAgriculture(source)
  source.forecast[6].soilMoistureAvg = 0.25
  const after = analyzeAgriculture(source)
  assert.equal(before.soilTrend.state, 'stable')
  assert.equal(after.soilTrend.state, 'decreasing')
  assert.equal(before.risk.level, after.risk.level)
  assert.equal(before.vegetationStress.level, after.vegetationStress.level)
  assert.ok(after.reasons.some((reason) => reason.includes('Queda prevista na umidade')))
  assert.ok(after.solution.some(({ title }) => title === 'Acompanhar a umidade do solo'))
  assert.notDeepEqual(before.solution, after.solution)
  source.forecast[6].soilMoistureSamples = 23
  const incomplete = analyzeAgriculture(source)
  assert.ok(!incomplete.solution.some(({ title }) => title === 'Acompanhar a umidade do solo'))
})

test('inspeção exclui o dia atual na data de São Paulo mesmo após a virada em UTC', () => {
  const source = forecast({ precipitation: 0.5 })
  source.observedAt = Date.parse('2026-10-09T00:00:00Z') // 21h de 08/10 em São Paulo.
  source.forecast[0].precipitation = 0
  source.forecast[0].maxWindSpeed = 1
  source.forecast[1].precipitation = 0
  source.forecast[1].maxWindSpeed = 5
  assert.equal(analyzeAgriculture(source).inspectionWindow.date, '2026-10-09')
  source.observedAt = Date.parse('2026-10-09T03:00:00Z') // 00h de 09/10 em São Paulo.
  assert.equal(analyzeAgriculture(source).inspectionWindow.date, '2026-10-10')
  source.observedAt = Date.parse('2026-10-14T20:00:00-03:00')
  assert.equal(analyzeAgriculture(source).inspectionWindow, null)
  delete source.observedAt
  assert.equal(analyzeAgriculture(source).inspectionWindow.date, '2026-10-08')
})

test('trovoadas com chuva diária baixa geram atenção elevada, motivos e solução de tempestades', () => {
  const source = forecast({ precipitation: 0.5, et0: 0.5 })
  source.forecast[0].weatherCode = 95
  source.forecast[3].weatherCode = 95
  const result = analyzeAgriculture(source)
  assert.equal(result.summary.thunderstormDays, 2)
  assert.equal(result.summary.intenseRainDays, 0)
  assert.equal(result.risk.level, 'high')
  assert.equal(result.dailyRisks[0].level, 'high')
  assert.ok(result.dailyRisks[0].reasons.includes('Trovoadas'))
  assert.ok(result.reasons.some((reason) => /2 dia\(s\).*08\/10, 11\/10/.test(reason)))
  assert.ok(result.solution.some(({ title }) => title === 'Revisar exposição a tempestades'))
  assert.equal(result.vegetationStress.level, 'low')
  assert.notEqual(result.inspectionWindow.date, '2026-10-08')
  assert.notEqual(result.inspectionWindow.date, '2026-10-11')
})

test('trovoadas com granizo 96 e 99 recebem atenção elevada sem inventar dano observado', () => {
  for (const weatherCode of [96, 99]) {
    const result = analyzeAgriculture(forecast({ weatherCode, precipitation: 0.5, et0: 0.5 }))
    assert.equal(result.risk.level, 'high')
    assert.equal(result.summary.thunderstormDays, 7)
    assert.ok(result.dailyRisks.every(({ level }) => level === 'high'))
    assert.equal(result.inspectionWindow, null)
    assert.equal(result.vegetationStress.level, 'low')
    assert.match(result.vegetationStress.description, /não indicam dano observado/)
  }
})

test('código meteorológico ausente não vira ausência de trovoadas nem avaliação de baixo risco', () => {
  for (const weatherCode of [null, undefined, 95.5, -1, '95']) {
    const source = forecast()
    source.forecast[2].weatherCode = weatherCode
    const result = analyzeAgriculture(source)
    assert.equal(result.risk.level, 'unknown')
    assert.equal(result.summary.thunderstormDays, null)
    assert.equal(result.dailyRisks[2].level, 'unknown')
    assert.equal(result.sufficientData, false)
    assert.equal(result.inspectionWindow, null)
  }
})

test('saldo próximo do limiar usa valores originais e apresentação não altera classificação', () => {
  const source = forecast({ precipitation: 1.3, et0: 3.44, soilMoistureAvg: 0.3 })
  source.forecast.slice(0, AGRICULTURE_CRITERIA.persistentHotDays).forEach((day) => { day.maxTemperature = 33 })
  const result = analyzeAgriculture(source)
  assert.ok(Math.abs(result.waterBalance.value - (-14.98)) < 1e-10)
  assert.equal(result.waterBalance.state, 'balanced')
  assert.equal(result.risk.level, 'medium')
  assert.equal(result.vegetationStress.level, 'medium')
  assert.ok(!result.rec.includes('Avaliar disponibilidade de água'))
  assert.match(result.waterBalance.description, /-14,98 mm/)
  assert.match(result.summary.text, /-14,98 mm/)
  source.forecast.forEach((day) => { day.maxTemperature = 27 })
  assert.equal(analyzeAgriculture(source).risk.level, 'low')
})

test('totais e extremos conservam precisão e limiares configurados mantêm limites inclusivos', () => {
  const source = forecast({ maxTemperature: 31.99, precipitation: 0.01, et0: 0 })
  const result = analyzeAgriculture(source)
  assert.equal(result.summary.maxTemperature, 31.99)
  assert.ok(Math.abs(result.summary.totalRain - 0.07) < Number.EPSILON)
  assert.equal(result.summary.hotDays, 0)
  assert.equal(result.risk.level, 'low')
  const boundary = forecast({ maxTemperature: AGRICULTURE_CRITERIA.hotTemperature,
    precipitation: AGRICULTURE_CRITERIA.intensePrecipitation, maxWindSpeed: AGRICULTURE_CRITERIA.windySpeed })
  const atThreshold = analyzeAgriculture(boundary)
  assert.equal(atThreshold.summary.hotDays, AGRICULTURE_CRITERIA.expectedDays)
  assert.equal(atThreshold.summary.intenseRainDays, AGRICULTURE_CRITERIA.expectedDays)
  assert.equal(atThreshold.summary.windyDays, AGRICULTURE_CRITERIA.expectedDays)
  assert.equal(atThreshold.risk.level, 'high')
})

test('datas duplicadas não inflacionam cobertura nem produzem uma tendência ambígua de solo', () => {
  const source = forecast()
  source.forecast[1].date = source.forecast[0].date
  const result = analyzeAgriculture(source)
  assert.equal(result.summary.availableDays, 6)
  assert.equal(result.summary.completeDays, 5)
  assert.equal(result.risk.level, 'unknown')
  assert.equal(result.soilTrend.state, 'unavailable')
  assert.equal(result.soilTrend.value, null)
  assert.match(result.soilTrend.description, /Datas repetidas/)
  assert.ok(result.dailyRisks.filter(({ date }) => date === '2026-10-08').every(({ level }) => level === 'unknown'))
})

test('tendência de solo exige as 24 amostras horárias numéricas e preserva pequenas variações', () => {
  for (const sampleCounts of [
    { soilMoistureSamples: 1, soilMoistureExpectedSamples: 1 },
    { soilMoistureSamples: 24.5, soilMoistureExpectedSamples: 24.5 },
    { soilMoistureSamples: '24', soilMoistureExpectedSamples: '24' },
    { soilMoistureSamples: Infinity, soilMoistureExpectedSamples: Infinity },
  ]) {
    assert.equal(analyzeAgriculture(forecast(sampleCounts)).soilTrend.state, 'unavailable')
  }
  const source = forecast({ soilMoistureAvg: 0.3 })
  source.forecast[6].soilMoistureAvg = 0.295
  assert.equal(analyzeAgriculture(source).soilTrend.state, 'stable')
  source.forecast[6].soilMoistureAvg = 0.2949
  const result = analyzeAgriculture(source)
  assert.equal(result.soilTrend.state, 'decreasing')
  assert.ok(Math.abs(result.soilTrend.value - (-0.0051)) < Number.EPSILON)
})

test('horário presente mas inválido bloqueia a escolha de inspeção em vez de permitir dias passados', () => {
  for (const observedAt of [NaN, Infinity, '2026-10-08T21:00:00-03:00', 8.64e15 + 1]) {
    const source = { ...forecast({ precipitation: 0 }), observedAt }
    const result = analyzeAgriculture(source)
    assert.equal(result.inspectionWindow, null)
    assert.ok(result.solution.some(({ text }) => text.includes('horário dos dados é inválido')))
  }
})

test('ordem de entrada não muda a semana nem modifica previsões fornecidas', () => {
  const source = forecast({ precipitation: 0.5 })
  const expected = analyzeAgriculture(source)
  source.forecast.reverse()
  const original = structuredClone(source)
  assert.deepEqual(analyzeAgriculture(source), expected)
  assert.deepEqual(source, original)
  const invalidTemperatures = forecast()
  invalidTemperatures.forecast[0].minTemperature = invalidTemperatures.forecast[0].maxTemperature + 1
  const invalid = analyzeAgriculture(invalidTemperatures)
  assert.equal(invalid.summary.minTemperature, null)
  assert.equal(invalid.summary.maxTemperature, null)
  assert.equal(invalid.risk.level, 'unknown')
})
