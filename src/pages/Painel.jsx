import { useMemo, useState } from 'react'
import { CITY_NAMES, DEFAULT_CITY } from '../data/cities.js'
import WeatherPanel from '../components/WeatherPanel.jsx'
import WeeklyForecast from '../components/WeeklyForecast.jsx'
import AgriculturalPanel from '../components/AgriculturalPanel.jsx'
import { useWeather } from '../hooks/useWeather.js'
import { analyzeAgriculture } from '../utils/analyzeAgriculture.js'

export default function Painel() {
  const [regiao, setRegiao] = useState(DEFAULT_CITY)
  const { weather, loading, error, refresh } = useWeather()
  const current = weather?.cities[regiao]
  const analysis = useMemo(() => analyzeAgriculture(current), [current])

  return (
    <main className="page">
      <section className="section">
        <p className="tag">Previsão semanal e análise agrícola</p>
        <h1>Clima e risco agrícola</h1>
        <p>Confira os próximos sete dias e acompanhe as recomendações recalculadas para a cidade escolhida.</p>

        <div className="map-box city-selector">
          <div className="satellite-strip">
            <span>Cidades monitoradas</span>
            <small>A cidade selecionada atualiza todos os indicadores</small>
          </div>
          <div className="map-grid city-grid" role="group" aria-label="Regiões monitoradas">
            {CITY_NAMES.map(nome => (
              <button
                key={nome}
                type="button"
                className={['region', regiao === nome ? 'active' : ''].join(' ')}
                aria-pressed={regiao === nome}
                onClick={() => setRegiao(nome)}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>

        <WeeklyForecast city={regiao} forecast={current?.forecast} loading={loading} error={error} />

        <div className="dashboard">
          <WeatherPanel
            city={regiao}
            current={current}
            vegetationStress={analysis.vegetationStress}
            fetchedAt={weather?.fetchedAt}
            loading={loading}
            error={error}
            onRefresh={refresh}
          />
          <AgriculturalPanel
            key={regiao}
            city={regiao}
            current={current}
            analysis={analysis}
            loading={loading}
            error={error}
            fetchedAt={weather?.fetchedAt}
            onRefresh={refresh}
          />
        </div>
      </section>
    </main>
  )
}

