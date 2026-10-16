import { CITY_NAMES } from '../data/cities.js'

export const MIN_MESSAGE_LENGTH = 30
export const MAX_MESSAGE_LENGTH = 500

const text = value => typeof value === 'string' ? value : ''

export function validateContact(form) {
  const values = form && typeof form === 'object' ? form : {}
  const name = text(values.name)
  const email = text(values.email)
  const message = text(values.message)
  const partes = name.trim().split(/\s+/).filter(Boolean)

  if (partes.length < 2) {
    return { field: 'name', text: 'Digite nome e sobrenome.' }
  }
  if (partes[0].length < 2 || partes[partes.length - 1].length < 2) {
    return { field: 'name', text: 'Nome e sobrenome devem ter ao menos 2 letras.' }
  }
  const emailValido = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i
  if (!emailValido.test(email.trim())) {
    return { field: 'email', text: 'Digite um e-mail válido.' }
  }
  if (!CITY_NAMES.includes(values.area)) {
    return { field: 'area', text: 'Selecione a região da propriedade.' }
  }
  if (message.trim().length < MIN_MESSAGE_LENGTH) {
    return {
      field: 'message',
      text: `Escreva uma descrição com pelo menos ${MIN_MESSAGE_LENGTH} caracteres.`,
    }
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { field: 'message', text: `Máximo de ${MAX_MESSAGE_LENGTH} caracteres.` }
  }

  return null
}
