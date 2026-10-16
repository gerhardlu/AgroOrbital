import { useId } from 'react'
import { FORECAST_DAYS } from '../data/weatherConfig.js'
import {
  calendarTimestamp, formatForecastDate, formatSoilMoisture, formatValue, formatWeekday,
} from '../utils/formatWeather.js'
import '../styles/weekly.css'

const dayMs = 24 * 60 * 60 * 1000

function forecastStatus(hasDays, loading, error) {
  if (loading) return hasDays ? 'Atualizando a previsão da semana…' : 'Buscando a previsão dos próximos sete dias…'
  if (error) return typeof error === 'string' ? error : 'Não foi possível atualizar a previsão.'
  return hasDays ? 'Previsão de sete dias, incluindo hoje, no horário de Brasília.' : 'A previsão está indisponível no momento.'
}

function summarize(days) {
  const uniqueDays = new Map()
  for (const day of days) {
    const timestamp = calendarTimestamp(day?.date)
    if (timestamp !== null && !uniqueDays.has(day.date)) uniqueDays.set(day.date, { ...day, timestamp })
  }
  const availableDays = [...uniqueDays.values()].sort((first, second) => first.timestamp - second.timestamp)
  const fullPeriod = availableDays.length === FORECAST_DAYS
    && availableDays.every((day, index) => index === 0 || day.timestamp - availableDays[index - 1].timestamp === dayMs)
  const rainyDays = availableDays.filter(day => Number.isFinite(day.precipitation) && day.precipitation >= 0)
  const temperatureDays = availableDays.filter(day => Number.isFinite(day.minTemperature)
    && Number.isFinite(day.maxTemperature) && day.maxTemperature >= day.minTemperature)
  const rainComplete = fullPeriod && rainyDays.length === FORECAST_DAYS
  const temperatureComplete = fullPeriod && temperatureDays.length === FORECAST_DAYS
  const min = temperatureDays.length ? Math.min(...temperatureDays.map(day => day.minTemperature)) : null
  const max = temperatureDays.length ? Math.max(...temperatureDays.map(day => day.maxTemperature)) : null

  return {
    partial: !rainComplete || !temperatureComplete,
    rain: rainyDays.length ? rainyDays.reduce((sum, day) => sum + day.precipitation, 0) : null,
    rainDays: rainyDays.length ? rainyDays.filter(day => day.precipitation > 0).length : null,
    rainDetail: rainComplete ? `Total previsto nos ${FORECAST_DAYS} dias` : `Parcial · ${rainyDays.length} de ${FORECAST_DAYS} dias com dados`,
    rainyDetail: rainComplete ? 'Precipitação prevista acima de 0 mm' : `Parcial · ${rainyDays.length} de ${FORECAST_DAYS} dias com dados`,
    amplitude: min === null || max === null ? null : max - min,
    temperatureDetail: temperatureDays.length
      ? `${formatValue(min, ' °C')} a ${formatValue(max, ' °C')}${temperatureComplete ? '' : ` · Parcial: ${temperatureDays.length} de ${FORECAST_DAYS} dias`}`
      : 'Temperaturas indisponíveis',
  }
}

function soilCoverage(day) {
  const { soilMoistureSamples: samples, soilMoistureExpectedSamples: expected, soilMoistureCoverage: coverage } = day
  if (Number.isInteger(samples) && Number.isInteger(expected) && expected > 0 && samples >= 0 && samples < expected) {
    return `Cobertura parcial: ${samples} de ${expected} horas`
  }
  if (Number.isFinite(coverage) && coverage >= 0 && coverage < 1) {
    return `Cobertura parcial: ${formatValue(coverage * 100, '% das horas')}`
  }
  return null
}

function ForecastDay({ day, headingId }) {
  const hasDate = calendarTimestamp(day.date) !== null
  const coverage = soilCoverage(day)
  const metrics = [
    ['Chuva', formatValue(day.precipitation, ' mm')],
    ['Chance de chuva', formatValue(day.precipitationProbability, '%')],
    ['Vento máximo', formatValue(day.maxWindSpeed, ' km/h')],
  ]

  return (
    <article className="weekly-day" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {hasDate ? (
          <time dateTime={day.date}>
            <span className="weekly-weekday">{formatWeekday(day.date)}</span>
            <span className="weekly-date">{formatForecastDate(day.date)}</span>
          </time>
        ) : 'Data indisponível'}
      </h3>
      <p className="weekly-condition">{day.description || 'Condição indisponível'}</p>
      <dl className="weekly-day-metrics">
        <div className="weekly-temperatures">
          <dt>Temperatura</dt>
          <dd>
            <span><small>Mín.</small> {formatValue(day.minTemperature, ' °C')}</span>
            <span><small>Máx.</small> {formatValue(day.maxTemperature, ' °C')}</span>
          </dd>
        </div>
        {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        <div className="weekly-soil">
          <dt>Umidade do solo <span>3–9 cm</span></dt>
          <dd>{formatSoilMoisture(day.soilMoistureAvg)}</dd>
          <dd className="weekly-soil-note">Média estimada por modelo</dd>
          {coverage && <dd className="weekly-coverage">{coverage}</dd>}
        </div>
      </dl>
    </article>
  )
}

export default function WeeklyForecast({ city, forecast, loading, error }) {
  const headingId = useId()
  const days = Array.isArray(forecast) ? forecast.slice(0, FORECAST_DAYS).map(day => day || {}) : []
  const hasDays = days.length > 0
  const summary = summarize(days)
  const metrics = [
    ['Chuva acumulada prevista', formatValue(summary.rain, ' mm'), summary.rainDetail],
    ['Amplitude térmica', formatValue(summary.amplitude, ' °C'), summary.temperatureDetail],
    ['Dias com chuva prevista', formatValue(summary.rainDays), summary.rainyDetail],
  ]

  return (
    <section className="weekly-forecast" aria-labelledby={headingId}>
      <div className="weekly-heading">
        <div>
          <p className="tag">Previsão de 7 dias</p>
          <h2 id={headingId}>Resumo da semana em {city}</h2>
        </div>
        {hasDays && summary.partial && <span className="weekly-partial">Resumo parcial</span>}
      </div>
      <p className={`weekly-status${error ? ' weekly-error' : ''}`} role="status" aria-live="polite">{forecastStatus(hasDays, loading, error)}</p>
      {error && hasDays && (
        <p className="weekly-stale">Exibindo a última previsão recebida. A atualização está pendente.</p>
      )}

      <div className="weekly-content" aria-busy={loading}>
        {hasDays ? (
          <>
            <dl className="weekly-summary">
              {metrics.map(([label, value, detail]) => (
                <div key={label}>
                  <dt>{label}</dt><dd>{value}</dd>
                  <dd className="weekly-summary-detail">{detail}</dd>
                </div>
              ))}
            </dl>
            <div className="weekly-days">
              {days.map((day, index) => (
                <ForecastDay key={`${day.date || 'sem-data'}-${index}`} day={day} headingId={`${headingId}-day-${index}`} />
              ))}
            </div>
          </>
        ) : (
          <p className="weekly-empty">
            {loading ? 'O resumo e os dias aparecerão aqui após a consulta.' : 'Use a atualização do painel para consultar a previsão novamente.'}
          </p>
        )}
      </div>

      <p className="weekly-source">
        Dados por <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
        {' '}· <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
        {' '}Previsões regionais estimadas por modelos, com valores arredondados.
        {' '}Solo: média diária volumétrica (m³/m³), exibida em % vol., sem sensor local.
      </p>
    </section>
  )
}
