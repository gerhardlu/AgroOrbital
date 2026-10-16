import { FORECAST_DAYS } from '../data/weatherConfig.js'
import { calendarTimestamp, formatForecastDate, formatISODate } from './formatWeather.js'

// Dashboard screening rules, not crop-specific agronomic limits.
export const AGRICULTURE_CRITERIA = Object.freeze({
  expectedDays: FORECAST_DAYS,
  hotTemperature: 32,
  persistentHotDays: 3,
  dryPrecipitation: 1,
  intensePrecipitation: 20,
  windySpeed: 25,
  weeklyDeficit: -15,
  soilTrendTolerance: 0.005,
  dailySoilSamples: 24,
  minimumSoilDays: 2,
  thunderstormCodes: Object.freeze([95, 96, 99]),
})

const rules = AGRICULTURE_CRITERIA
const unavailable = 'Dados insuficientes'
const numbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const soilNumbers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
const display = (value) => numbers.format(value)
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const nonnegative = (value) => finite(value) && value >= 0
const soilValue = (value) => finite(value) && value >= 0 && value <= 1
const weatherCodeValue = (value) => Number.isInteger(value) && value >= 0
const isThunderstorm = (value) => rules.thunderstormCodes.includes(value)
const sum = (values) => values.reduce((total, value) => total + value, 0)
// Absorb only floating-point subtraction noise, not meaningful differences around a rule.
const arithmeticTolerance = (...values) => Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 4
const hasDeficit = (value) => value <= rules.weeklyDeficit + arithmeticTolerance(value, rules.weeklyDeficit)

const criteria = [
  `A avaliação semanal exige ${rules.expectedDays} dias consecutivos, com mínima, máxima, chuva, vento máximo, ET₀ e código meteorológico disponíveis em todos os dias.`,
  `Triagem climática: calor com máxima ≥ ${rules.hotTemperature} °C; dia seco com chuva < ${rules.dryPrecipitation} mm; chuva intensa com total diário ≥ ${rules.intensePrecipitation} mm; vento máximo ≥ ${rules.windySpeed} km/h.`,
  `Atenção elevada quando há previsão de trovoadas (códigos WMO ${rules.thunderstormCodes.join(', ')}), chuva intensa, ou pelo menos ${rules.persistentHotDays} dias quentes e saldo semanal de chuva menos ET₀ ≤ ${display(rules.weeklyDeficit)} mm. Outros sinais geram atenção moderada.`,
  'O estresse da vegetação é uma estimativa qualitativa por calor e saldo de água; não é NDVI, medição de saúde vegetal ou previsão de produtividade.',
  `A tendência de umidade compara o primeiro e o último dia com ${rules.dailySoilSamples} amostras horárias completas; exige ao menos ${rules.minimumSoilDays} dias diferentes. Diferenças de até ${soilNumbers.format(rules.soilTrendTolerance)} m³/m³ são exibidas como estáveis.`,
]

const limitations = [
  'Previsões meteorológicas e de umidade do solo são estimativas de modelos para a cidade; confirme as condições na propriedade.',
  'Chuva menos ET₀ é um saldo meteorológico de referência. Não representa a água disponível às raízes nem a necessidade exata de irrigação.',
  'A avaliação não considera cultura, fase de desenvolvimento, tipo de solo, irrigação ou histórico do talhão.',
]

function validTemperatures(day) {
  return finite(day.minTemperature) && finite(day.maxTemperature) && day.minTemperature <= day.maxTemperature
}

function completeDay(day) {
  return calendarTimestamp(day.date) !== null && validTemperatures(day)
    && nonnegative(day.precipitation) && nonnegative(day.maxWindSpeed)
    && nonnegative(day.et0) && weatherCodeValue(day.weatherCode)
}

function prepareForecast(forecast) {
  const days = (Array.isArray(forecast) ? forecast : [])
    .map((day) => day && typeof day === 'object' && !Array.isArray(day) ? { ...day } : {})
    .sort((left, right) => (calendarTimestamp(left.date) ?? Infinity) - (calendarTimestamp(right.date) ?? Infinity))
    .slice(0, rules.expectedDays)
  const occurrences = new Map()
  days.forEach(({ date }) => {
    if (calendarTimestamp(date) !== null) occurrences.set(date, (occurrences.get(date) ?? 0) + 1)
  })
  const dates = days.map(({ date }) => calendarTimestamp(date))
  const contiguous = days.length === rules.expectedDays && dates.every((date, index) => (
    date !== null && (index === 0 || date - dates[index - 1] === 86_400_000)
  ))
  const completeDays = days.filter((day) => occurrences.get(day.date) === 1 && completeDay(day)).length
  return { days, occurrences, contiguous, completeDays, sufficientData: contiguous && completeDays === rules.expectedDays }
}

function summarizeForecast({ days, occurrences, contiguous, completeDays, sufficientData }) {
  const aggregate = (field, validate, operation) => contiguous && days.every((day) => validate(day[field], day))
    ? operation(days.map((day) => day[field])) : null
  const count = (field, validate, predicate) => aggregate(field, validate, (values) => values.filter(predicate).length)
  const temperature = (_value, day) => validTemperatures(day)
  const summary = {
    totalRain: aggregate('precipitation', nonnegative, sum),
    et0Weekly: aggregate('et0', nonnegative, sum),
    minTemperature: aggregate('minTemperature', temperature, (values) => Math.min(...values)),
    maxTemperature: aggregate('maxTemperature', temperature, (values) => Math.max(...values)),
    dryDays: count('precipitation', nonnegative, (value) => value < rules.dryPrecipitation),
    rainyDays: count('precipitation', nonnegative, (value) => value >= rules.dryPrecipitation),
    hotDays: count('maxTemperature', temperature, (value) => value >= rules.hotTemperature),
    intenseRainDays: count('precipitation', nonnegative, (value) => value >= rules.intensePrecipitation),
    windyDays: count('maxWindSpeed', nonnegative, (value) => value >= rules.windySpeed),
    thunderstormDays: count('weatherCode', weatherCodeValue, isThunderstorm),
    availableDays: occurrences.size, completeDays, expectedDays: rules.expectedDays,
    partialCoverage: !sufficientData,
    startDate: contiguous ? days[0].date : null,
    endDate: contiguous ? days.at(-1).date : null,
  }
  summary.text = sufficientData
    ? `Nos próximos ${rules.expectedDays} dias, ${display(summary.totalRain)} mm de chuva, temperaturas de ${display(summary.minTemperature)} a ${display(summary.maxTemperature)} °C e ${summary.hotDays} dia(s) com máxima ≥ ${rules.hotTemperature} °C. ${summary.thunderstormDays} dia(s) com previsão de trovoadas. Saldo chuva − ET₀: ${display(summary.totalRain - summary.et0Weekly)} mm.`
    : `Cobertura insuficiente para avaliar a semana: ${completeDays} de ${rules.expectedDays} dias com os campos necessários e datas únicas. Não é possível concluir que o risco seja baixo.`
  return summary
}

function waterBalance({ totalRain: rain, et0Weekly: et0 }) {
  const value = rain !== null && et0 !== null ? rain - et0 : null
  const state = value === null ? 'unavailable' : hasDeficit(value) ? 'deficit' : value > 0 ? 'surplus' : 'balanced'
  return { value, rain, et0, unit: 'mm', state,
    label: { unavailable, deficit: 'Chuva abaixo da ET₀', surplus: 'Chuva acima da ET₀', balanced: 'Sem déficit pelo critério' }[state],
    description: value === null ? `O saldo exige chuva e ET₀ em todos os ${rules.expectedDays} dias consecutivos.`
      : `Chuva prevista menos evapotranspiração de referência: ${display(value)} mm em ${rules.expectedDays} dias. Esse saldo não define a quantidade de irrigação.`,
  }
}

function dailyRisk(day) {
  if (!completeDay(day)) return { date: day.date ?? null, level: 'unknown', label: unavailable, reasons: [] }
  const reasons = []
  const intenseRain = day.precipitation >= rules.intensePrecipitation
  const thunderstorm = isThunderstorm(day.weatherCode)
  if (day.maxTemperature >= rules.hotTemperature) reasons.push('Calor')
  if (intenseRain) reasons.push('Chuva intensa')
  if (day.maxWindSpeed >= rules.windySpeed) reasons.push('Vento')
  if (thunderstorm) reasons.push('Trovoadas')
  const level = intenseRain || thunderstorm ? 'high' : reasons.length ? 'medium' : 'low'
  return { date: day.date, level,
    label: { high: 'Atenção elevada', medium: 'Atenção', low: 'Sem alertas pelos critérios' }[level], reasons }
}

function soilTrend({ days, occurrences }) {
  const complete = days.filter((day) => occurrences.get(day.date) === 1 && soilValue(day.soilMoistureAvg)
    && day.soilMoistureExpectedSamples === rules.dailySoilSamples
    && day.soilMoistureSamples === rules.dailySoilSamples)
  const ambiguous = [...occurrences.values()].some((count) => count > 1)
  if (ambiguous || complete.length < rules.minimumSoilDays) {
    return { value: null, state: 'unavailable', label: unavailable, completeDays: complete.length,
      description: ambiguous ? 'Datas repetidas tornam a tendência ambígua; atualize a previsão antes de comparar a umidade.'
        : `A tendência exige pelo menos ${rules.minimumSoilDays} dias diferentes com ${rules.dailySoilSamples} amostras horárias de umidade disponíveis em cada dia.` }
  }
  const first = complete[0]
  const last = complete.at(-1)
  const value = last.soilMoistureAvg - first.soilMoistureAvg
  const tolerance = rules.soilTrendTolerance + arithmeticTolerance(first.soilMoistureAvg, last.soilMoistureAvg)
  const state = value < -tolerance ? 'decreasing' : value > tolerance ? 'increasing' : 'stable'
  return { value, state,
    label: { decreasing: 'Tendência de queda', increasing: 'Tendência de alta', stable: 'Pouca variação prevista' }[state],
    completeDays: complete.length, firstDate: first.date, lastDate: last.date,
    description: `Comparação das médias modeladas de ${formatForecastDate(first.date)} e ${formatForecastDate(last.date)}; ${complete.length} dias com amostragem completa. Não indica saturação ou necessidade de irrigação.` }
}

function inspectionPlan(days, observedAt) {
  const observedDate = formatISODate(observedAt)
  if (observedAt !== undefined && observedAt !== null && observedDate === null) {
    return { window: null, text: 'O horário dos dados é inválido. Atualize a previsão antes de escolher uma data futura para inspeção.' }
  }
  const suitable = days.filter((day) => (!observedDate || day.date > observedDate)
    && day.precipitation < rules.dryPrecipitation && day.maxWindSpeed < rules.windySpeed
    && day.maxTemperature < rules.hotTemperature && !isThunderstorm(day.weatherCode))
    .sort((left, right) => left.precipitation - right.precipitation || left.maxWindSpeed - right.maxWindSpeed
      || left.maxTemperature - right.maxTemperature || left.date.localeCompare(right.date))
  const window = suitable.length ? { date: suitable[0].date,
    text: `${formatForecastDate(suitable[0].date)} é uma opção para inspeção: chuva < ${rules.dryPrecipitation} mm, vento máximo < ${rules.windySpeed} km/h, máxima < ${rules.hotTemperature} °C e sem código de trovoada. Confirme as condições locais; não é uma janela validada para pulverização.` } : null
  return { window, text: window?.text ?? `Nenhum dia${observedDate ? ' futuro' : ''} atende simultaneamente aos critérios de inspeção do painel. Consulte a previsão horária e confirme condições seguras de acesso.` }
}

function climateAssessment(summary, balance) {
  const heat = summary.hotDays > 0
  const deficit = hasDeficit(balance.value)
  const persistentHeatDeficit = summary.hotDays >= rules.persistentHotDays && deficit
  const elevated = summary.thunderstormDays > 0 || summary.intenseRainDays > 0 || persistentHeatDeficit
  const level = elevated ? 'high' : heat || deficit || summary.windyDays > 0 ? 'medium' : 'low'
  return { heat, deficit,
    risk: { level, cls: level, label: { high: 'Atenção climática elevada', medium: 'Atenção climática moderada', low: 'Sem alertas pelos critérios' }[level] },
    vegetationStress: {
      level: persistentHeatDeficit ? 'high' : heat || deficit ? 'medium' : 'low',
      label: persistentHeatDeficit ? 'Elevado' : heat || deficit ? 'Moderado' : 'Poucos sinais', estimated: true,
      description: `Estimativa somente por calor (${summary.hotDays} dia(s) quentes) e saldo chuva − ET₀ de ${display(balance.value)} mm. Trovoadas são avaliadas na atenção climática e não indicam dano observado. Danos, NDVI e produtividade exigem observações da lavoura.`,
    },
  }
}

function recommendations(days, summary, balance, trend, climate, inspection) {
  const reasons = []
  const solution = []
  const add = (reason, title, text) => {
    if (reason) reasons.push(reason)
    solution.push({ title, text })
  }
  if (summary.thunderstormDays > 0) {
    const dates = days.filter((day) => isThunderstorm(day.weatherCode)).map(({ date }) => formatForecastDate(date)).join(', ')
    add(`${summary.thunderstormDays} dia(s) com previsão de trovoadas: ${dates}. O código meteorológico sinaliza tempestades mesmo quando a chuva diária prevista é baixa.`,
      'Revisar exposição a tempestades', `Há previsão de trovoadas em ${dates}. Reveja a exposição de pessoas e equipamentos em operações de campo; consulte a previsão horária e avisos meteorológicos locais antes de definir atividades. A previsão não confirma danos à vegetação.`)
  }
  if (climate.deficit) {
    add(`Chuva − ET₀ de ${display(balance.value)} mm: igual ou abaixo do critério de ${display(rules.weeklyDeficit)} mm na semana.`,
      'Avaliar disponibilidade de água', `Com saldo meteorológico de ${display(balance.value)} mm, verifique a umidade na profundidade das raízes. Avalie irrigação conforme cultura, solo e manejo; a previsão não define volume nem duração.`)
  }
  if (climate.heat) {
    add(`${summary.hotDays} dia(s) com máxima ≥ ${rules.hotTemperature} °C.`, 'Acompanhar o calor',
      `Há ${summary.hotDays} dia(s) quentes previstos. Inspecione sinais de murcha e confirme o estado das plantas no campo; considere operações nas horas mais amenas conforme a previsão horária.`)
  }
  if (summary.intenseRainDays > 0) {
    add(`${summary.intenseRainDays} dia(s) com chuva diária ≥ ${rules.intensePrecipitation} mm.`, 'Inspecionar drenagem',
      `Há ${summary.intenseRainDays} dia(s) com chuva intensa pelo critério do painel. Verifique drenagem e áreas baixas antes da chuva; avalie as condições de acesso e evite tráfego se o solo estiver encharcado.`)
  }
  if (summary.windyDays > 0 || summary.intenseRainDays > 0 || climate.heat) {
    add(summary.windyDays > 0 ? `${summary.windyDays} dia(s) com vento máximo ≥ ${rules.windySpeed} km/h.` : null,
      'Reavaliar operações e pulverizações', 'Consulte a previsão horária de chuva, vento e temperatura e confirme as condições no local. Agende aplicações apenas dentro das condições indicadas no rótulo do produto e na orientação técnica.')
  }
  if (!reasons.length) {
    add('Nenhum dos critérios de calor, chuva intensa, vento, trovoadas ou déficit semanal foi atingido. Isso não assegura condições adequadas para todas as culturas.',
      'Manter acompanhamento', 'Mantenha inspeções de solo e plantas e revise a previsão antes das operações. A ausência de alertas climáticos não garante saúde da vegetação ou produtividade.')
  }
  if (trend.state === 'decreasing') {
    add(`Queda prevista na umidade modelada do solo entre ${formatForecastDate(trend.firstDate)} e ${formatForecastDate(trend.lastDate)}: aproximadamente ${soilNumbers.format(Math.abs(trend.value))} m³/m³, usando dias com amostragem completa.`,
      'Acompanhar a umidade do solo', 'A previsão indica queda na umidade da camada de solo modelada. Inspecione a umidade no local e na profundidade das raízes, acompanhe a evolução e confirme a necessidade de ajustes no manejo conforme cultura e tipo de solo.')
  }
  add(null, 'Planejar a inspeção', inspection.text)
  return { reasons, solution }
}

function insufficientAssessment() {
  return {
    risk: { level: 'unknown', cls: 'unavailable', label: unavailable },
    vegetationStress: { level: 'unknown', label: unavailable, estimated: true, description: 'O estresse climático da vegetação exige uma previsão semanal completa.' },
    inspectionWindow: null,
    reasons: [`A avaliação exige ${rules.expectedDays} datas consecutivas e todos os campos climáticos necessários; nenhum valor ausente foi tratado como zero.`],
    solution: [
      { title: 'Completar a previsão semanal', text: `Atualize os dados e confirme a disponibilidade dos ${rules.expectedDays} dias. A solução climática será recalculada quando houver cobertura suficiente.` },
      { title: 'Verificação em campo', text: 'Inspecione solo e plantas; não baseie ajustes de irrigação ou operações somente em dados parciais.' },
    ],
  }
}

/** City-level climate screening. Missing data stays null; classification uses unrounded values. */
export function analyzeAgriculture(cityWeather) {
  const forecast = prepareForecast(cityWeather?.forecast)
  const summary = summarizeForecast(forecast)
  const balance = waterBalance(summary)
  const trend = soilTrend(forecast)
  let assessment = insufficientAssessment()
  if (forecast.sufficientData) {
    const climate = climateAssessment(summary, balance)
    const inspection = inspectionPlan(forecast.days, cityWeather?.observedAt)
    assessment = { risk: climate.risk, vegetationStress: climate.vegetationStress, inspectionWindow: inspection.window,
      ...recommendations(forecast.days, summary, balance, trend, climate, inspection) }
  }
  return { ...assessment, text: summary.text, summary, waterBalance: balance, soilTrend: trend,
    dailyRisks: forecast.days.map((day) => forecast.occurrences.get(day.date) === 1 ? dailyRisk(day)
      : { date: day.date ?? null, level: 'unknown', label: unavailable, reasons: [] }),
    rec: assessment.solution.map(({ title }) => title), criteria: [...criteria], limitations: [...limitations],
    sufficientData: forecast.sufficientData }
}
