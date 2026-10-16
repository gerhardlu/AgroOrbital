import { useId, useState } from 'react'
import { formatDateTime, formatSoilMoisture, formatValue, isValidTimestamp } from '../utils/formatWeather.js'
import '../styles/agriculture.css'

function analysisStatus(current, fetchedAt, loading, error) {
  if (loading) return 'Recalculando com a atualização da previsão…'
  if (error) return current
    ? 'Atualização pendente: esta análise usa a última previsão recebida.'
    : 'Não foi possível obter a previsão para calcular a análise.'
  return isValidTimestamp(fetchedAt)
    ? `Análise atualizada em ${formatDateTime(fetchedAt)} (Brasília).`
    : 'Aguardando os dados da previsão.'
}

function planStatus(sufficientData, loading, error) {
  if (loading) return 'Consultando novamente a previsão para atualizar este plano…'
  if (error) return 'Atualização pendente: plano da última previsão recebida.'
  return sufficientData ? 'Plano atualizado junto com a previsão da semana.' : 'Previsão insuficiente para avaliar a semana.'
}

export default function AgriculturalPanel({ city, current, analysis, loading, error, fetchedAt, onRefresh }) {
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const panelId = useId()
  const headingId = `${panelId}-heading`
  const alertId = `${panelId}-alert`
  const solutionId = `${panelId}-solution`
  const { summary, risk, vegetationStress, waterBalance, soilTrend } = analysis
  const metrics = [
    [`Umidade do solo · ${current?.soilDepth || '3–9 cm'}`, formatSoilMoisture(current?.soilMoisture)],
    ['Estresse vegetal · calor/água', vegetationStress.label],
    ['Máxima prevista na semana', formatValue(summary.maxTemperature, ' °C')],
    ['Tendência do solo na semana', soilTrend.label],
  ]
  const waterMetrics = [
    ['Chuva acumulada', formatValue(summary.totalRain, ' mm')],
    ['Evapotranspiração de referência', formatValue(summary.et0Weekly, ' mm')],
    ['Chuva − demanda do clima', formatValue(waterBalance.value, ' mm', 2)],
  ]

  const toggleSolution = () => {
    if (!solutionOpen) void onRefresh()
    setSolutionOpen(open => !open)
  }

  return (
    <section className="status-panel agricultural-panel" aria-labelledby={headingId}>
      <p className="tag">Análise dos próximos sete dias</p>
      <h2 id={headingId}>Análise agrícola de {city}</h2>
      <p className="simulation-note">Triagem climática estimada a partir da previsão semanal e do solo modelado.</p>
      <div className={`risk ${risk.cls}`}>{risk.label}</div>
      <p>{analysis.text}</p>

      <p className={`agriculture-status${error ? ' agriculture-stale' : ''}`} role="status">
        {analysisStatus(current, fetchedAt, loading, error)}
      </p>

      <div className="agriculture-metrics" aria-busy={loading}>
        {metrics.map(([label, value]) => <div key={label}><span>{value}</span><small>{label}</small></div>)}
      </div>
      <p className="agriculture-method-note">A umidade do solo é volumétrica e estimada por modelo. O estresse da vegetação usa o calor e o saldo de água previstos; não é uma medição de NDVI.</p>
      {isValidTimestamp(current?.soilObservedAt) && (
        <p className="agriculture-method-note">Horário do solo: <time dateTime={new Date(current.soilObservedAt).toISOString()}>{formatDateTime(current.soilObservedAt)}</time> (Brasília).</p>
      )}

      <h3>Água prevista na semana</h3>
      <dl className="agriculture-water">
        {waterMetrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="agriculture-method-note">{waterBalance.description}</p>
      <p className="agriculture-method-note">Produtividade da lavoura depende também da cultura, do talhão e do histórico; não é calculada apenas pela previsão do tempo.</p>

      <h3>Motivos da avaliação</h3>
      <ul>{analysis.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <h3>Prioridades da semana</h3>
      <ul>{analysis.solution.map(({ title }) => <li key={title}>{title}</li>)}</ul>

      <div className="dashboard-actions">
        <button className="btn primary" type="button" aria-expanded={alertOpen} aria-controls={alertId} onClick={() => setAlertOpen(open => !open)} disabled={!analysis.sufficientData && !alertOpen}>
          Ver alerta da semana
        </button>
        <button className="btn secondary" type="button" aria-expanded={solutionOpen} aria-controls={solutionId} onClick={toggleSolution} disabled={!analysis.sufficientData && !solutionOpen}>
          Solução geral recomendada
        </button>
      </div>

      <div id={alertId} className="weekly-alert" hidden={!alertOpen} role="status">
        <strong>{city}: {risk.label}.</strong> {analysis.text}
        <p>Alerta exibido neste painel, atualizado junto com a previsão semanal.</p>
      </div>

      <section id={solutionId} className="solution-panel" hidden={!solutionOpen}>
        <h3>Plano recomendado para {city}</h3>
        <p>{planStatus(analysis.sufficientData, loading, error)}</p>
        <ul>{analysis.solution.map(({ title, text }) => <li key={title}><strong>{title}:</strong> {text}</li>)}</ul>
        <p className="agriculture-method-note">Estas são orientações de planejamento. O painel não envia comandos a equipamentos.</p>
      </section>

      <details className="analysis-criteria">
        <summary>Como a análise é calculada</summary>
        <p>{summary.completeDays} de {summary.expectedDays} dias com dados completos.</p>
        <p>{soilTrend.description}</p>
        <ul>{analysis.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul>
        <ul>{analysis.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>
      </details>
    </section>
  )
}
