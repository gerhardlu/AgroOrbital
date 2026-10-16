const textos = {
  home: 'AgroOrbital — Protótipo acadêmico em React, CSS e JavaScript.',
  painel: 'Clima e solo modelados pela Open-Meteo. Análise e recomendações estimadas pela previsão de sete dias.',
  contato: 'Protótipo para fins acadêmicos.',
}

export default function Footer({ pagina }) {
  return (
    <footer>
      <p>{textos[pagina]}</p>
    </footer>
  )
}
