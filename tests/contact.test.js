import assert from 'node:assert/strict'
import test from 'node:test'
import { validateContact } from '../src/utils/validateContact.js'

const valido = {
  name: 'João da Silva',
  email: 'joao@example.com',
  area: 'Jundiaí',
  message: 'Preciso monitorar a umidade do solo da minha lavoura.',
}

test('entrada ausente ou com tipos inválidos devolve erro de campo sem lançar exceção', () => {
  for (const input of [undefined, null, {}, 42, { ...valido, name: null }]) {
    assert.equal(validateContact(input).field, 'name')
  }
  assert.equal(validateContact({ ...valido, email: {} }).field, 'email')
  assert.equal(validateContact({ ...valido, message: 42 }).field, 'message')
})

test('aceita solicitações válidas e os limites de 30 e 500 caracteres', () => {
  assert.equal(validateContact(valido), null)
  assert.equal(validateContact({ ...valido, message: 'a'.repeat(30) }), null)
  assert.equal(validateContact({ ...valido, message: 'a'.repeat(500) }), null)
})

test('rejeita descrições vazias, curtas, com espaços ou acima do limite', () => {
  for (const message of ['', ' '.repeat(30), 'a'.repeat(29), 'a'.repeat(501)]) {
    assert.equal(validateContact({ ...valido, message }).field, 'message')
  }
  assert.equal(validateContact({ ...valido, message: ` ${'a'.repeat(29)} ` }).field, 'message')
})

test('rejeita nomes incompletos e e-mails inválidos', () => {
  for (const name of ['', 'João', 'J Silva', 'João S']) {
    assert.equal(validateContact({ ...valido, name }).field, 'name')
  }
  for (const email of [
    '',
    'joao',
    'joao@example',
    'joao @example.com',
    'joao@example,com.br',
    'joao@example..com',
    'jo,ao@example.com',
    'joao@-example.com',
  ]) {
    assert.equal(validateContact({ ...valido, email }).field, 'email')
  }
  assert.equal(validateContact({ ...valido, email: ' joao@example.com ' }), null)
})

test('exige uma região cadastrada e aceita as quatro regiões do painel', () => {
  for (const area of ['', 'São Paulo', 'toString']) {
    assert.equal(validateContact({ ...valido, area }).field, 'area')
  }
  for (const area of ['Jundiaí', 'Suzano', 'Campinas', 'Sorocaba']) {
    assert.equal(validateContact({ ...valido, area }), null)
  }
})
