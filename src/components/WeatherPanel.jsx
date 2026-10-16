import { useId } from 'react'
import { formatDateTime, formatSoilMoisture, formatValue, isValidTimestamp } from '../utils/formatWeather.js'
import '../styles/weather.css'

function weatherStatus(current, loading, error) {
  if (loading) return current ? 'Atualizando as condições meteorológicas…' : 'Buscando o tempo nas quatro cidades…'
  return error || 'Consulta automática a cada 15 minutos.'
}

function periodLabel(isDay) {
  if (isDay === true) return 'Dia'
  if (isDay === false) return 'Noite'
  return '—'
}

function WeatherTime({ label, timestamp }) {
  if (!isValidTimestamp(timestamp)) return null

  return (
    <span>
      {label}: <time dateTime={new Date(timestamp).toISOString()}>{formatDateTime(timestamp)}</time>
    </span>
  )
}

export default function WeatherPanel({ city, current, vegetationStress, fetchedAt, loading, error, onRefresh }) {
  const headingId = useId()
  const precipitationLabel = Number.isFinite(current?.interval) && current.interval > 0
    ? `Chuva em ${formatValue(current.interval / 60)} min`
    : 'Precipitação'
  const metrics = current ? [
    ['Umidade do ar', formatValue(current.humidity, '%')],
    [`Solo ${current.soilDepth || '3–9 cm'} · modelo`, formatSoilMoisture(current.soilMoisture)],
    ['Sensação térmica', formatValue(current.apparentTemperature, ' °C')],
    ['Vento', formatValue(current.windSpeed, ' km/h')],
    [precipitationLabel, formatValue(current.precipitation, ' mm')],
    ['Nebulosidade', formatValue(current.cloudCover, '%')],
    ['Período', periodLabel(current.isDay)],
    ['Vegetação · estresse por calor/água', vegetationStress?.label || '—'],
  ] : []
  const buttonLabel = error ? 'Tentar novamente' : 'Atualizar'

  return (
    <section className="weather-panel" aria-labelledby={headingId}>
      <div className="weather-heading-row">
        <div>
          <p className="tag">Condições meteorológicas</p>
          <h2 id={headingId}>Tempo em {city}</h2>
        </div>
        <button className="btn secondary weather-refresh" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Atualizando…' : buttonLabel}
        </button>
      </div>

      <p className={`weather-status${error ? ' weather-error' : ''}`} role="status" aria-live="polite">
        {weatherStatus(current, loading, error)}
      </p>

      {error && current && (
        <p className="weather-stale">Exibindo os últimos dados recebidos. A atualização está pendente.</p>
      )}

      <div className="weather-data" aria-busy={loading}>
        {current ? (
          <>
            <div className="weather-summary">
              <span className="weather-temperature">{formatValue(current.temperature, ' °C')}</span>
              <span>{current.description}</span>
            </div>
            <dl className="weather-metrics">
              {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="weather-times">
              <WeatherTime label="Horário dos dados" timestamp={current.observedAt} />
              <WeatherTime label="Horário do solo" timestamp={current.soilObservedAt} />
              <WeatherTime label="Última consulta" timestamp={fetchedAt} />
              <span>Horário de Brasília.</span>
            </p>
          </>
        ) : (
          <p className="weather-empty">
            {loading ? 'As condições aparecerão aqui após a consulta.' : 'Os dados meteorológicos estão indisponíveis no momento.'}
          </p>
        )}
      </div>

      <p className="weather-source">
        Dados meteorológicos por <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
        {' '}· <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
        {' '}Estimativas regionais por modelo, com valores arredondados. Umidade do ar e umidade volumétrica do solo são medidas diferentes.
        {' '}O estresse vegetal considera o clima da semana; não mede NDVI.
      </p>
    </section>
  )
}
