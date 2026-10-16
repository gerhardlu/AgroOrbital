import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'rolldown/parseAst'

function fail(message) {
  throw new Error(`HTML único: ${message}`)
}

function attributes(text) {
  const result = {}
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of text.matchAll(pattern)) {
    const name = match[1].toLowerCase()
    if (Object.hasOwn(result, name)) fail(`atributo duplicado: ${name}.`)
    result[name] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return result
}

function assetPath(url) {
  if (typeof url !== 'string' || !url.trim()) fail('o endereço de um asset está vazio.')
  let decoded
  try { decoded = decodeURIComponent(url) } catch { fail(`endereço de asset inválido: ${url}.`) }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith('/')
    || /[\\?#&]/.test(decoded) || [...decoded].some(character => character.charCodeAt(0) < 32)
    || decoded.split('/').includes('..')) {
    fail(`o asset deve ter um caminho local dentro de dist: ${url}.`)
  }
  const normalized = posix.normalize(decoded)
  if (normalized === '.' || normalized.startsWith('../')) fail(`caminho de asset inválido: ${url}.`)
  return normalized
}

function quotedEnd(source, start) {
  const quote = source[start]
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1
    else if (source[index] === quote) return index + 1
  }
  fail('string não encerrada em um asset.')
}

function scriptString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral') return node.quasis[0]?.value.cooked ?? null
  return null
}

function validateScript(source) {
  let ast
  try { ast = parseAst(source) } catch (error) { fail(`JavaScript inválido: ${error.message}`) }
  const pending = [ast]
  while (pending.length) {
    const node = pending.pop()
    if (!node?.type) continue
    if (node.type === 'ImportDeclaration' || node.type === 'ImportExpression'
      || (node.type === 'MetaProperty' && node.meta.name === 'import') || node.type.startsWith('Export')) {
      fail('imports, import.meta, exports e módulos dinâmicos não são suportados; gere um único bundle de entrada.')
    }
    const value = scriptString(node)
    if (value !== null && /^(?:\.\.?\/|\/)?assets\//i.test(value)) fail(`asset referenciado pelo JavaScript sem embutir: ${value}.`)
    const callee = node.callee?.name ?? node.callee?.property?.name ?? node.callee?.property?.value
    if (['CallExpression', 'NewExpression'].includes(node.type) && ['fetch', 'URL', 'Worker'].includes(callee)) {
      const url = scriptString(node.arguments[0])
      if (url !== null && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) fail(`recurso local solicitado pelo JavaScript sem embutir: ${url}.`)
    }
    for (const child of Object.values(node)) {
      if (child !== null && typeof child === 'object') pending.push(...(Array.isArray(child) ? child : [child]))
    }
  }
}

function validateCss(source) {
  let index = 0
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2)
      if (end === -1) fail('comentário não encerrado no CSS.')
      index = end + 2
    } else if (source[index] === '"' || source[index] === "'") index = quotedEnd(source, index)
    else if (/^@import\b/i.test(source.slice(index))) fail('@import no CSS não é suportado; inclua todos os estilos no bundle.')
    else if (/^url\s*\(/i.test(source.slice(index))) {
      const opening = source.indexOf('(', index)
      let end = opening + 1
      while (end < source.length && source[end] !== ')') {
        end = source[end] === '"' || source[end] === "'" ? quotedEnd(source, end) : end + 1
      }
      if (end === source.length) fail('url() não encerrado no CSS.')
      const url = source.slice(opening + 1, end).trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
      if (!/^(?:data:|https?:|\/\/|#)/i.test(url)) fail(`url() local no CSS ainda depende de arquivo externo: ${url || '(vazio)'}.`)
      index = end + 1
    } else index += 1
  }
}

function validateRemainingHtml(html) {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  for (const match of markup.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase()
    const attrs = attributes(match[2])
    if (tag === 'base') fail('a tag base não é suportada no HTML único.')
    if (tag === 'link' && attrs.rel?.toLowerCase().split(/\s+/).includes('modulepreload')) fail('modulepreload depende de módulos externos não suportados.')
    if (attrs.srcset !== undefined) fail('srcset precisa ser embutido antes de gerar o HTML único.')
    if (attrs.style !== undefined) validateCss(attrs.style)
    for (const name of ['src', 'href', 'poster', 'data']) {
      const value = attrs[name]
      if (value === undefined || !value || value.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue
      fail(`referência local restante em ${tag}[${name}]: ${value}.`)
    }
  }
}

export async function createStandaloneHtml(html, readAsset) {
  if (typeof html !== 'string' || typeof readAsset !== 'function') fail('informe o HTML e uma função para ler os assets.')
  const replacements = []
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  const scripts = [...html.matchAll(scriptPattern)]
  const externalScripts = scripts.filter(match => attributes(match[1]).src !== undefined)
  if (externalScripts.length !== 1) fail('a entrada deve conter exatamente um arquivo JavaScript ESM.')
  const script = externalScripts[0]
  const scriptAttrs = attributes(script[1])
  if (scriptAttrs.type?.toLowerCase() !== 'module') fail('o JavaScript de entrada precisa ser um módulo ESM.')

  const load = async url => {
    const path = assetPath(url)
    try {
      const content = await readAsset(path)
      if (typeof content !== 'string') fail(`o asset ${path} não retornou texto.`)
      return content
    } catch (error) {
      throw new Error(`HTML único: não foi possível ler o asset ${path}: ${error.message}`, { cause: error })
    }
  }

  const javascript = await load(scriptAttrs.src)
  validateScript(javascript)
  const escapedScript = javascript.replace(/<\/script/gi, match => match.replace('/', '\\/'))
  replacements.push({ start: script.index, length: script[0].length,
    value: `<script type="module">\nif (!location.hash) location.hash = '#painel';\n${escapedScript}\n</script>` })
  for (const inline of scripts.filter(match => match !== script)) validateScript(inline[2])
  for (const inline of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) validateCss(inline[1])

  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = attributes(match[1])
    if (!attrs.rel?.toLowerCase().split(/\s+/).includes('stylesheet')) continue
    const css = await load(attrs.href)
    validateCss(css)
    const escapedCss = css.replace(/<\/style/gi, token => token.replace('/', '\\/'))
    replacements.push({ start: match.index, length: match[0].length, value: `<style>\n${escapedCss}\n</style>` })
  }

  let result = html
  for (const replacement of replacements.sort((first, second) => second.start - first.start)) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.start + replacement.length)
  }
  validateRemainingHtml(result)
  return result
}

export async function buildStandalone(distDir, outputPath) {
  const distRoot = await realpath(distDir)
  const readAsset = async asset => {
    const target = await realpath(join(distRoot, asset))
    const local = relative(distRoot, target)
    if (local === '..' || local.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(local)) {
      fail(`o asset está fora de dist: ${asset}.`)
    }
    return readFile(target, 'utf8')
  }
  const html = await createStandaloneHtml(await readAsset('index.html'), readAsset)
  const target = resolve(outputPath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, html, 'utf8')
  return target
}

const scriptFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === scriptFile) {
  const projectRoot = resolve(dirname(scriptFile), '..')
  try {
    if (process.argv.length > 4) fail('uso: node scripts/build-standalone.mjs [distDir] [outputPath].')
    const output = await buildStandalone(process.argv[2] ?? join(projectRoot, 'dist'),
      process.argv[3] ?? join(projectRoot, 'standalone', 'index.html'))
    process.stdout.write(`HTML único gerado: ${output}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
