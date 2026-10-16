import assert from 'node:assert/strict'
import test from 'node:test'
import { createStandaloneHtml } from '../scripts/build-standalone.mjs'

const entry = '<!doctype html><html><head><script type="module" crossorigin src="./assets/app.js"></script><link rel="stylesheet" href="./assets/main.css"><link href="assets/mobile.css" rel="stylesheet"></head><body><div id="root"></div><a href="#home">Início</a></body></html>'
const javascript = 'const greeting = "Olá"; console.log(greeting);'
const mainCss = 'body { color: #39ffb6; }'
const mobileCss = '@media (max-width: 600px) { body { margin: 0; } }'
const assets = { 'assets/app.js': javascript, 'assets/main.css': mainCss, 'assets/mobile.css': mobileCss }
const reader = overrides => async path => {
  const files = { ...assets, ...overrides }
  if (!Object.hasOwn(files, path)) throw new Error(`Arquivo ausente: ${path}`)
  return files[path]
}

test('embute o único bundle e todos os estilos sem alterar o restante do documento', async () => {
  const requested = []
  const html = await createStandaloneHtml(entry, async path => {
    requested.push(path)
    return assets[path]
  })
  const expected = entry
    .replace('<script type="module" crossorigin src="./assets/app.js"></script>', `<script type="module">\nif (!location.hash) location.hash = '#painel';\n${javascript}\n</script>`)
    .replace('<link rel="stylesheet" href="./assets/main.css">', `<style>\n${mainCss}\n</style>`)
    .replace('<link href="assets/mobile.css" rel="stylesheet">', `<style>\n${mobileCss}\n</style>`)
  assert.equal(html, expected)
  assert.deepEqual(requested, ['assets/app.js', 'assets/main.css', 'assets/mobile.css'])
  assert.equal(html.includes('src='), false)
  assert.equal(html.includes('<link'), false)
})

test('abre o painel só quando não existe rota escolhida', async () => {
  const html = await createStandaloneHtml(entry, reader())
  assert.equal(html.includes("if (!location.hash) location.hash = '#painel';"), true)
  assert.equal(html.includes('href="#home"'), true)
})

test('escapa fechamentos de script e style em strings e comentários sem cortar os elementos', async () => {
  const js = 'const html = "</script><h1>teste</h1>"; /* </ScRiPt> */'
  const css = 'a::after { content: "</style>"; } /* </StYlE> */'
  const html = await createStandaloneHtml(entry, reader({ 'assets/app.js': js, 'assets/main.css': css }))
  assert.equal(html.includes('"<\\/script><h1>teste</h1>"'), true)
  assert.equal(html.includes('/* <\\/ScRiPt> */'), true)
  assert.equal(html.includes('content: "<\\/style>"'), true)
  assert.equal(html.includes('/* <\\/StYlE> */'), true)
  assert.equal((html.match(/<\/script>/gi) ?? []).length, 1)
  assert.equal((html.match(/<\/style>/gi) ?? []).length, 2)
})

test('permite palavras import em strings, comentários, regex e texto de template', async () => {
  const js = 'const text = "import x from foo"; /* import("foo") */ const re = /import\\("x"\\)/; const template = `import("foo") ${1 + 1}`;'
  const html = await createStandaloneHtml(entry, reader({ 'assets/app.js': js }))
  assert.equal(html.includes(js), true)
})

test('aceita métodos chamados import e export sem confundi-los com módulos', async () => {
  const js = 'const loader = { import() { return 1; }, export: "ok" }; loader.import();'
  const html = await createStandaloneHtml(entry, reader({ 'assets/app.js': js }))
  assert.equal(html.includes(js), true)
})

test('identifica sintaxe JavaScript inválida pelo parser real', async () => {
  await assert.rejects(createStandaloneHtml(entry, reader({ 'assets/app.js': 'const broken = ;' })), /JavaScript inválido/)
})

test('rejeita módulos importados, imports dinâmicos inclusive em template, import.meta e exports', async () => {
  for (const js of [
    'import value from "./other.js";', 'import "https://cdn.test/file.js";',
    'const x = import("./lazy.js");', 'const x = `result ${import("./lazy.js")}`;',
    'const x = import.meta.url;', 'export { value } from "./other.js";',
  ]) await assert.rejects(createStandaloneHtml(entry, reader({ 'assets/app.js': js })), /módulos|imports/)
})

test('rejeita entrada sem JavaScript, mais de um script externo ou entrada que não é ESM', async () => {
  for (const html of [
    '<html><body>Sem script</body></html>',
    entry.replace('</head>', '<script src="assets/extra.js"></script></head>'),
    entry.replace('type="module"', 'type="text/javascript"'),
  ]) await assert.rejects(createStandaloneHtml(html, reader()), /JavaScript ESM|módulo ESM/)
})

test('rejeita arquivo ausente e endereço externo, absoluto ou que atravesse dist', async () => {
  for (const path of ['../app.js', 'assets/../../app.js', '%2e%2e/app.js', '/assets/app.js',
    'C:\\app.js', 'https://cdn.test/app.js', '//cdn.test/app.js', 'assets/app.js?v=1',
    'assets/app.js#x', 'assets%5capp.js', 'assets/%00app.js']) {
    const html = entry.replace('./assets/app.js', path)
    await assert.rejects(createStandaloneHtml(html, reader()), /caminho local dentro de dist/)
  }
  await assert.rejects(createStandaloneHtml(entry.replace('./assets/app.js', 'assets/missing.js'), reader()), /Arquivo ausente/)
})

test('rejeita dependências CSS locais e @import, preservando URL inline e referência ao próprio HTML', async () => {
  for (const css of ['a { background: url(./picture.png); }', 'a { background: url("/images/p.png"); }',
    '@import "other.css";', 'a { background: url(../picture.png); }']) {
    await assert.rejects(createStandaloneHtml(entry, reader({ 'assets/main.css': css })), /url\(\) local|@import/)
  }
  const css = '/* url(./comment.png) */ a::after { content: "url(fake.png)"; } a { background: url(data:image/png;base64,AA==); filter: url(#shadow); }'
  const html = await createStandaloneHtml(entry, reader({ 'assets/main.css': css }))
  assert.equal(html.includes(css), true)
})

test('rejeita recursos locais restantes no HTML e assets referenciados pelo JavaScript', async () => {
  for (const tag of ['<img src="./photo.png">', '<link rel="icon" href="assets/icon.svg">',
    '<link rel="modulepreload" href="assets/chunk.js">', '<base href="./">',
    '<img srcset="photo.png 1x, photo-large.png 2x">']) {
    await assert.rejects(createStandaloneHtml(entry.replace('</body>', `${tag}</body>`), reader()), /referência local restante|tag base|srcset|modulepreload/)
  }
  await assert.rejects(createStandaloneHtml(entry, reader({ 'assets/app.js': 'const image = "./assets/photo.png";' })), /sem embutir/)
  for (const js of ['fetch("./data.json");', 'fetch(`./data.json`);', 'const image = `./assets/photo.png`;',
    'new URL("picture.png", document.baseURI);', 'new Worker("worker.js");']) {
    await assert.rejects(createStandaloneHtml(entry, reader({ 'assets/app.js': js })), /recurso local solicitado|asset referenciado/)
  }
  await assert.rejects(createStandaloneHtml(entry.replace('</head>', '<style>@import "other.css";</style></head>'), reader()), /@import/)
  await assert.rejects(createStandaloneHtml(entry.replace('<div id="root">', '<div id="root" style="background: url(p.png)">'), reader()), /url\(\) local/)
})
