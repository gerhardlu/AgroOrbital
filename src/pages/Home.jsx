import { Fragment } from 'react'

const problemas = [
  { icon: '🌡️', title: 'Risco climático', text: 'Calor extremo e baixa umidade afetam irrigação, colheita e produtividade.' },
  { icon: '🌱', title: 'Estresse da lavoura', text: 'Variações na vegetação podem indicar pragas, seca ou falha no plantio.' },
  { icon: '📉', title: 'Impacto econômico', text: 'Menos produção significa menor renda para o produtor e alimento mais caro.' },
]
const etapas = [
  { title: 'Previsão e solo', text: 'Consulta clima, previsão de sete dias incluindo hoje e solo modelado na camada de 3–9 cm.' },
  { title: 'Análise semanal', text: 'Compara calor, chuva, vento e demanda de água para estimar atenção e estresse climático da vegetação.' },
  { title: 'Plano do produtor', text: 'Consulta alertas e recomendações recalculados no painel e confirma as condições na propriedade.' },
]
const fontes = [
  { title: 'Open-Meteo', text: 'Clima atual, previsão semanal e solo modelado para as quatro cidades.', link: 'https://open-meteo.com/' },
  { title: 'NASA', text: 'Dados abertos, imagens e missões de observação.' },
  { title: 'ESA', text: 'Programas de monitoramento terrestre e ambiental.' },
  { title: 'Space Charter', text: 'Uso de satélites para resposta a desastres.' },
]
const objetivos = [
  { title: 'ODS 2', text: 'Fome zero e agricultura sustentável.' },
  { title: 'ODS 9', text: 'Indústria, inovação e infraestrutura.' },
  { title: 'ODS 13', text: 'Ação contra a mudança global do clima.' },
]

export default function Home({ irPara }) {
  const abrirPainel = (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    irPara('painel')
  }
  const mostrarFuncionamento = (event) => {
    event.preventDefault()
    document.getElementById('funcionamento')?.scrollIntoView({ behavior: 'auto' })
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-text">
          <p className="tag">Global Solution 2026/1 • Economia Espacial</p>
          <h1>Previsões da semana transformadas em decisões simples para pequenos produtores.</h1>
          <p>
            O AgroOrbital reúne clima atual, previsão de sete dias e umidade do solo estimados
            pela Open-Meteo para Jundiaí, Suzano, Campinas e Sorocaba. A análise e as recomendações
            acompanham as atualizações da previsão. Imagens de satélite são uma referência conceitual do projeto.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#painel" onClick={abrirPainel}>Ver previsão e análise semanal</a>
            <a className="btn secondary" href="#funcionamento" onClick={mostrarFuncionamento}>Como funciona</a>
          </div>
        </div>
        <div className="space-visual" role="img" aria-label="Ilustração conceitual de satélite monitorando lavouras">
          <div className="stars"></div>
          <div className="orbit"></div>
          <div className="earth"><span className="field f1"></span><span className="field f2"></span><span className="field f3"></span></div>
          <div className="satellite-card">🛰️<small>Conceito orbital</small></div>
          <div className="signal s1"></div><div className="signal s2"></div><div className="signal s3"></div>
        </div>
      </section>

      <section className="section" id="problema">
        <p className="tag">Problema real</p>
        <h2>A informação existe, mas não chega de forma simples ao campo.</h2>
        <p>
          Agricultores familiares nem sempre têm acesso rápido a imagens de satélite, previsão climática
          e indicadores de vegetação. Isso aumenta perdas por seca, excesso de chuva, pragas e decisões tomadas tarde demais.
        </p>
        <div className="cards">
          {problemas.map(({ icon, title, text }) => (
            <article className="card icon-card" key={title}>
              <span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section workflow" id="funcionamento">
        <p className="tag">Do clima ao planejamento agrícola</p>
        <h2>Fluxo da solução</h2>
        <div className="flow">
          {etapas.map(({ title, text }, index) => (
            <Fragment key={title}>
              {index > 0 && <div className="arrow" aria-hidden="true">→</div>}
              <div className="flow-item"><strong>{index + 1}</strong><h3>{title}</h3><p>{text}</p></div>
            </Fragment>
          ))}
        </div>
      </section>

      <section className="section data-section">
        <div>
          <p className="tag">Dados e referências</p>
          <h2>Fontes do protótipo</h2>
          <p>
            Clima e umidade volumétrica do solo vêm dos modelos da Open-Meteo. A análise usa critérios climáticos
            simples, apresentados no painel. O estresse da vegetação é estimado pelo clima; NDVI e produtividade
            exigem dados da lavoura. As instituições espaciais inspiram a possibilidade de integração orbital futura.
          </p>
        </div>
        <div className="source-grid">
          {fontes.map(({ title, text, link }) => (
            <article key={title}>
              <b>{title}</b><span>{text}</span>
              {link && <a href={link}>Dados meteorológicos por Open-Meteo</a>}
            </article>
          ))}
        </div>
      </section>

      <section className="section ods">
        <p className="tag">Impacto</p>
        <h2>ODS relacionados</h2>
        <div className="ods-grid">
          {objetivos.map(({ title, text }) => <div key={title}><b>{title}</b><span>{text}</span></div>)}
        </div>
      </section>
    </main>
  )
}

