import { useEffect, useState } from 'react'
import { PAGES } from '../data/navigation.js'

export default function Header({ pagina, irPara }) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const fecharMenu = () => setAberto(false)
    const fecharComEscape = (event) => {
      if (event.key === 'Escape') fecharMenu()
    }
    window.addEventListener('keydown', fecharComEscape)
    window.addEventListener('hashchange', fecharMenu)
    return () => {
      window.removeEventListener('keydown', fecharComEscape)
      window.removeEventListener('hashchange', fecharMenu)
    }
  }, [])

  const ir = (nome) => (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    irPara(nome)
    setAberto(false)
  }

  return (
    <header className="header">
      <nav className="nav" aria-label="Navegação principal">
        <a className="logo" href="#home" onClick={ir('home')}>
          Agro<span>Orbital</span>
        </a>
        <button
          className="menu-btn"
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={aberto}
          aria-controls="nav-links"
        >
          ☰
        </button>
        <div id="nav-links" className={`links ${aberto ? 'open' : ''}`}>
          {PAGES.map(({ id: nome, label: texto }) => (
            <a
              key={nome}
              href={`#${nome}`}
              onClick={ir(nome)}
              aria-current={pagina === nome ? 'page' : undefined}
            >
              {texto}
            </a>
          ))}
        </div>
      </nav>
    </header>
  )
}
