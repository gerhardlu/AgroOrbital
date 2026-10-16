import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Painel from './pages/Painel.jsx'
import Contato from './pages/Contato.jsx'
import { PAGES, pageFromHash } from './data/navigation.js'

function paginaAtual() {
  return pageFromHash(window.location.hash)
}

export default function App() {
  const [pagina, setPagina] = useState(paginaAtual)

  useEffect(() => {
    const atualizarPagina = () => {
      setPagina(paginaAtual())
      window.scrollTo(0, 0)
    }

    window.addEventListener('hashchange', atualizarPagina)
    return () => window.removeEventListener('hashchange', atualizarPagina)
  }, [])

  useEffect(() => {
    document.title = PAGES.find(page => page.id === pagina).title
  }, [pagina])

  const irPara = (nome) => {
    if (!PAGES.some(page => page.id === nome)) return
    if (window.location.hash === `#${nome}`) {
      window.scrollTo(0, 0)
      return
    }
    window.location.hash = nome
  }

  return (
    <>
      <Header pagina={pagina} irPara={irPara} />
      {pagina === 'home' && <Home irPara={irPara} />}
      {pagina === 'painel' && <Painel />}
      {pagina === 'contato' && <Contato />}
      <Footer pagina={pagina} />
    </>
  )
}
