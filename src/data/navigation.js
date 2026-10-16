export const PAGES = Object.freeze([
  { id: 'home', label: 'Início', title: 'AgroOrbital — Clima e análise agrícola' },
  { id: 'painel', label: 'Painel', title: 'Previsão semanal — AgroOrbital' },
  { id: 'contato', label: 'Contato', title: 'Contato — AgroOrbital' },
].map(Object.freeze))

export function pageFromHash(hash) {
  if (typeof hash !== 'string') return 'home'
  return PAGES.find(page => page.id === hash.slice(1))?.id ?? 'home'
}
