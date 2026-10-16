import { useState } from 'react'
import { CITY_NAMES } from '../data/cities.js'
import { grupo, integrantes, videoPitch } from '../data/academic.js'
import {
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  validateContact,
} from '../utils/validateContact.js'

const vazio = { name: '', email: '', area: '', message: '' }
const semFeedback = { text: '', type: '', field: '' }

export default function Contato() {
  const [form, setForm] = useState(vazio)
  const [feedback, setFeedback] = useState(semFeedback)

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((anterior) => ({ ...anterior, [name]: value }))
    setFeedback(semFeedback)
  }

  const onSubmit = (event) => {
    event.preventDefault()
    const erro = validateContact(form)

    if (erro) {
      setFeedback({ ...erro, type: 'error' })
      event.currentTarget.elements.namedItem(erro.field)?.focus()
      return
    }

    setFeedback({
      text: 'Solicitação registrada com sucesso. Esta é uma simulação do protótipo.',
      type: 'success',
      field: '',
    })
    setForm(vazio)
  }

  const acessibilidade = (campo) => ({
    'aria-invalid': feedback.field === campo || undefined,
    'aria-describedby': feedback.field === campo ? 'form-feedback' : undefined,
  })

  return (
    <main className="page">
      <section className="section form-layout">
        <div>
          <p className="tag">Cadastro de interesse</p>
          <h1>Solicitar monitoramento</h1>
          <p>Preencha o formulário para simular o cadastro de uma propriedade rural no sistema.</p>
          <div className="mini-panel">
            <b>O que o produtor receberia?</b>
            <span>Previsão semanal, umidade do solo modelada, atenção climática e recomendações de planejamento.</span>
          </div>
        </div>

        <form className="form" onSubmit={onSubmit} noValidate>
          <label htmlFor="name">
            Nome completo
            <input
              type="text"
              id="name"
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={onChange}
              placeholder="Ex: João da Silva"
              required
              {...acessibilidade('name')}
            />
          </label>
          <label htmlFor="email">
            E-mail
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={onChange}
              placeholder="exemplo@email.com"
              required
              {...acessibilidade('email')}
            />
          </label>
          <label htmlFor="area">
            Região da propriedade
            <select
              id="area"
              name="area"
              value={form.area}
              onChange={onChange}
              required
              {...acessibilidade('area')}
            >
              <option value="">Selecione</option>
              {CITY_NAMES.map((regiao) => (
                <option key={regiao} value={regiao}>{regiao}</option>
              ))}
            </select>
          </label>
          <label htmlFor="message">
            Descrição da necessidade
            <textarea
              id="message"
              name="message"
              value={form.message}
              onChange={onChange}
              placeholder={`Descreva o problema da lavoura em ${MIN_MESSAGE_LENGTH} a ${MAX_MESSAGE_LENGTH} caracteres`}
              minLength={MIN_MESSAGE_LENGTH}
              maxLength={MAX_MESSAGE_LENGTH}
              required
              {...acessibilidade('message')}
              aria-describedby={feedback.field === 'message' ? 'char-counter form-feedback' : 'char-counter'}
            />
          </label>
          <small id="char-counter" className="form-counter">
            {form.message.length}/{MAX_MESSAGE_LENGTH} caracteres
          </small>
          <button className="btn primary" type="submit">Enviar solicitação</button>
          <p id="form-feedback" className={`feedback ${feedback.type}`} role="status">
            {feedback.text}
          </p>
        </form>
      </section>

      <section className="section academic-info">
        <p><strong>Grupo:</strong> {grupo}</p>
        <p><strong>Integrantes:</strong></p>
        <ul className="academic-members">
          {integrantes.map((integrante) => <li key={integrante}>{integrante}</li>)}
        </ul>
        <p className="pitch-link">
          <strong>Link do Vídeo Pitch:</strong>{' '}
          <a href={videoPitch} target="_blank" rel="noopener noreferrer">{videoPitch}</a>
        </p>
      </section>
    </main>
  )
}
