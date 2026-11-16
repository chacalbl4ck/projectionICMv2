// =====================================================================
// Suíte de Testes Automatizados - Projeção ICM HTML5
// Executável tanto localmente quanto no GitHub Actions (CI/CD)
// =====================================================================
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failures = 0;

function runTest(name, fn) {
  try {
    process.stdout.write(`  • ${name}... `);
    fn();
    console.log('\x1b[32mOK\x1b[0m');
  } catch (err) {
    failures++;
    console.log('\x1b[31mFALHA\x1b[0m');
    console.error(`    Erro: ${err.message}`);
  }
}

console.log('\n==================================================');
console.log('🧪 Iniciando Verificação de Integridade - Projeção ICM');
console.log('==================================================\n');

// 1. Verificação de Sintaxe JavaScript
console.log('1) Verificação de Sintaxe JavaScript (node -c):');
const jsFiles = [
  'server.js',
  'desktop/Compilar_Exe.js',
  'js/core.js',
  'js/bible.js',
  'js/modules/storage.js',
  'js/modules/media.js',
  'js/modules/projection.js',
  'js/modules/tree.js',
  'js/modules/remote.js'
];

jsFiles.forEach(file => {
  const fullPath = path.join(root, file);
  runTest(`Sintaxe ${file}`, () => {
    assert(fs.existsSync(fullPath), `Arquivo ${file} não encontrado`);
    execFileSync(process.execPath, ['-c', fullPath], { stdio: 'pipe' });
  });
});

// 2. Integridade dos Arquivos HTML Principais
console.log('\n2) Integridade dos Arquivos HTML e Interface:');
const htmlFiles = ['index.html', 'view.html', 'obs.html', 'controle.html'];

htmlFiles.forEach(file => {
  const fullPath = path.join(root, file);
  runTest(`Arquivo ${file}`, () => {
    assert(fs.existsSync(fullPath), `Arquivo ${file} não existe`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(content.includes('<!DOCTYPE html>') || content.includes('<!doctype html>'), 'DOCTYPE ausente');
  });
});

runTest('Controles de Blackout e Freeze sem atalhos visuais', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(indexHtml.includes('id="btnBlackout"'), 'Elemento #btnBlackout ausente');
  assert(indexHtml.includes('id="btnFreeze"'), 'Elemento #btnFreeze ausente');
  assert(!indexHtml.includes('>B</kbd>'), 'Botão não deve exibir tecla B');
  assert(!indexHtml.includes('>F</kbd>'), 'Botão não deve exibir tecla F');
  assert(!indexHtml.includes('Atalho: Tecla B'), 'Tooltip não deve mencionar Atalho: Tecla B');
  assert(!indexHtml.includes('Atalho: Tecla F'), 'Tooltip não deve mencionar Atalho: Tecla F');
});

runTest('Elementos de Busca Bíblica em index.html', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(indexHtml.includes('id="inputBibleSearch"'), 'Elemento #inputBibleSearch ausente');
  assert(indexHtml.includes('id="btnClearBibleSearch"'), 'Elemento #btnClearBibleSearch ausente');
  assert(indexHtml.includes('id="bibleSearchResults"'), 'Elemento #bibleSearchResults ausente');
  assert(indexHtml.includes('placeholder="Pesquisar por título do louvor ou mídia..."'), 'Placeholder de busca de louvores incorreto');
});

// 3. Validação do Mecanismo de Busca Bíblica
console.log('\n3) Validação do Mecanismo Bíblico (js/bible.js):');
runTest('Parser de referências e busca textual', () => {
  const bibleAcfPath = path.join(root, 'bible', 'acf.js');
  assert(fs.existsSync(bibleAcfPath), 'bible/acf.js ausente');
  eval(fs.readFileSync(bibleAcfPath, 'utf8'));

  global.bibleacf = bibleacf;
  global.bibleversion = 'acf';
  global.$ = function() {
    return {
      ready: function(cb) { if (cb) cb(); return this; },
      val: function() { return ''; },
      hide: function() { return this; },
      show: function() { return this; },
      html: function() { return this; },
      append: function() { return this; },
      find: function() { return this; },
      addClass: function() { return this; },
      removeClass: function() { return this; },
      scrollTop: function() { return 0; },
      offset: function() { return { top: 0 }; },
      focus: function() { return this; },
      off: function() { return this; },
      on: function() { return this; },
      click: function() { return this; },
      change: function() { return this; },
      fadeIn: function() { return this; }
    };
  };
  global.$.each = function(arr, fn) {
    if (Array.isArray(arr)) arr.forEach((v, i) => fn(i, v));
  };
  global.document = { ready: function() {} };
  global.window = {};

  eval(fs.readFileSync(path.join(root, 'js', 'bible.js'), 'utf8'));

  assert(typeof parsearReferenciaBiblica === 'function', 'parsearReferenciaBiblica não é função');
  assert(typeof obterIndiceBuscaBiblia === 'function', 'obterIndiceBuscaBiblia não é função');
  assert(typeof destacarTermosBuscaBiblia === 'function', 'destacarTermosBuscaBiblia não é função');

  // Testes de parser
  const rSl = parsearReferenciaBiblica('Sl 23', bibleacf);
  assert.strictEqual(rSl.b, 18, 'Salmos index 18');
  assert.strictEqual(rSl.c, 22, 'Capítulo 23 index 22');

  const rJn = parsearReferenciaBiblica('João 3:16', bibleacf);
  assert.strictEqual(rJn.b, 42, 'João index 42');
  assert.strictEqual(rJn.c, 2, 'Capítulo 3 index 2');
  assert.strictEqual(rJn.from, 15, 'Versículo 16 index 15');

  const r1Co = parsearReferenciaBiblica('1co 13:4-7', bibleacf);
  assert.strictEqual(r1Co.b, 45, '1 Coríntios index 45');
  assert.strictEqual(r1Co.c, 12, 'Capítulo 13 index 12');
  assert.strictEqual(r1Co.from, 3, 'Versículo 4 index 3');
  assert.strictEqual(r1Co.to, 6, 'Versículo 7 index 6');

  // Teste de índice
  const idx = obterIndiceBuscaBiblia('acf');
  assert(idx.length > 31000, 'ACF deve conter mais de 31.000 versículos');

  const match = idx.filter(i => i.normText.includes('pastor') && i.normText.includes('faltara'));
  assert(match.length >= 1, 'Deve encontrar Sl 23:1');
  assert.strictEqual(match[0].bookName, 'Salmos');
  assert.strictEqual(match[0].chapterNum, 23);
  assert.strictEqual(match[0].verseNum, 1);
});

// 4. Validação da Busca de Louvores (js/modules/tree.js)
console.log('\n4) Validação da Busca de Louvores (js/modules/tree.js):');
runTest('Busca estritamente por título (sem busca interna na letra)', () => {
  const treeCode = fs.readFileSync(path.join(root, 'js', 'modules', 'tree.js'), 'utf8');
  assert(!treeCode.includes('normContent'), 'normContent ainda presente em tree.js');
  assert(treeCode.includes('var normTitle = normalizarTextoBusca(song.title);'), 'normTitle ausente');
  assert(treeCode.includes('isMatch = terms.every(function(t) { return normTitle.includes(t); });'), 'Filtro deve checar apenas normTitle');
});

// 5. Validação dos Atalhos no Teclado (js/core.js)
console.log('\n5) Validação dos Atalhos no Teclado (js/core.js):');
runTest('Remoção de B e F do keydown com preservação de setas', () => {
  const coreCode = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
  assert(!coreCode.includes('e.which == 70'), 'Atalho F ainda presente');
  assert(!coreCode.includes('e.which == 66'), 'Atalho B ainda presente');
  assert(!coreCode.includes('toggleFreeze()'), 'toggleFreeze() ainda chamado no keydown');
  assert(coreCode.includes('e.which == 38 || e.which == 37'), 'Seta para cima/esquerda ausente');
  assert(coreCode.includes('e.which == 40 || e.which == 39'), 'Seta para baixo/direita ausente');
});

// 6. Validação do Banco de Dados Litúrgico
console.log('\n6) Validação do Banco de Dados Litúrgico (data/data.json):');
runTest('Estrutura de dados válida e não corrompida', () => {
  const dataPath = path.join(root, 'data', 'data.json');
  assert(fs.existsSync(dataPath), 'data/data.json ausente');
  const jsonContent = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(jsonContent);
  assert(Array.isArray(parsed), 'data.json deve ser um array de categorias');
  assert(parsed.length > 0, 'data.json não deve estar vazio');
  const totalLouvores = parsed.reduce((acc, cat) => acc + (cat.songs ? cat.songs.length : 0), 0);
  assert(totalLouvores > 500, `Esperado acervo com mais de 500 louvores (encontrados: ${totalLouvores})`);
});

// 7. Validação do Módulo de Avisos e Quebras de Linha (Issue #1)
console.log('\n7) Validação do Módulo de Avisos (Issue #1 - Preservação de ENTER e Linhas Vazias):');

// Simulação de ambiente mínimo para carregar projection.js no Node
global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
global.window.removeEventListener = global.window.removeEventListener || (() => {});
global.document = global.document || {};
global.document.querySelectorAll = global.document.querySelectorAll || (() => []);
global.document.getElementById = global.document.getElementById || (() => null);
global.document.addEventListener = global.document.addEventListener || (() => {});

const projectionModule = require(path.join(root, 'js', 'modules', 'projection.js'));
const normFn = projectionModule.normalizarTextoAviso;
const convFn = projectionModule.converterTextoParaHtmlAviso;

runTest('Normalização de HTML contenteditable para texto limpo (ENTER simples e salto de linhas)', () => {
  assert(typeof normFn === 'function', 'normalizarTextoAviso deve ser uma função');
  assert(typeof convFn === 'function', 'converterTextoParaHtmlAviso deve ser uma função');

  // Caso 1: Quebra simples de linha gerada por ENTER
  const t1 = normFn('Linha 1<div>Linha 2</div>');
  assert.strictEqual(t1, 'Linha 1\nLinha 2', 'ENTER simples deve gerar exatamente 1 quebra de linha');

  // Caso 2: Pressionar ENTER para saltar uma linha dando espaço entre linhas (<div><br></div>)
  const t2 = normFn('Linha 1<div>Linha 2</div><div><br></div><div>Linha 3</div>');
  assert.strictEqual(t2, 'Linha 1\nLinha 2\n\nLinha 3', 'Salto de linha com ENTER deve produzir 2 quebras seguidas');

  // Caso 3: Múltiplos saltos de linha consecutivos (2 linhas vazias)
  const t3 = normFn('Linha 1<div><br></div><div><br></div><div>Linha 2</div>');
  assert.strictEqual(t3, 'Linha 1\n\n\nLinha 2', 'Múltiplos saltos de linha devem preservar todas as linhas vazias');

  // Caso 4: Estrutura baseada em parágrafos (<p>...</p>)
  const t4 = normFn('<p>Culto Especial</p><p><br></p><p>Quinta-feira às 19:30</p>');
  assert.strictEqual(t4, 'Culto Especial\n\nQuinta-feira às 19:30', 'Formato com tag p deve preservar espaçamento');

  // Caso 5: Quebras tradicionais <br>
  const t5 = normFn('Linha 1<br>Linha 2<br><br>Linha 3');
  assert.strictEqual(t5, 'Linha 1\nLinha 2\n\nLinha 3', 'Tags <br> e <br><br> devem ser convertidas corretamente');
});

runTest('Conversão de texto para HTML de projeção (viewSlides e livesongs)', () => {
  // Teste de conversão para projeção: newlines devem virar tags <br> reais
  const htmlResult = convFn('Aviso Importante\n\nReunião de Jovens\nSábado às 16:00');
  assert.strictEqual(
    htmlResult,
    'Aviso Importante<br><br>Reunião de Jovens<br>Sábado às 16:00',
    'HTML de projeção deve conter <br><br> para o espaço vertical de linha vazia'
  );

  // Sanitização de tags perigosas e escape de entidades
  const safeHtml = convFn('Aviso com <script>alert(1)</script> & "aspas"');
  assert(!safeHtml.includes('<script>'), 'Tags de script não devem ser injetadas');
  assert(safeHtml.includes('&amp;'), 'Caractere & deve ser escapado para &amp;');
  assert(safeHtml.includes('&quot;'), 'Aspas devem ser escapadas para &quot;');
});

runTest('Resiliência de CSS (white-space: pre-wrap) em view.css, style.css e obs.html', () => {
  const viewCss = fs.readFileSync(path.join(root, 'css', 'view.css'), 'utf8');
  const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
  const obsHtml = fs.readFileSync(path.join(root, 'obs.html'), 'utf8');

  assert(viewCss.includes('white-space: pre-wrap;'), 'css/view.css deve conter white-space: pre-wrap para .warning-body');
  assert(styleCss.includes('white-space: pre-wrap;'), 'css/style.css deve conter white-space: pre-wrap para .warning-body');
  assert(obsHtml.includes('white-space: pre-wrap;'), 'obs.html deve conter white-space: pre-wrap para .lower-third-text');
});

runTest('Proteção de digitação em contenteditable no keydown de js/core.js', () => {
  const coreCode = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
  assert(
    coreCode.includes('[contenteditable="true"]:focus'),
    'keydown deve ignorar atalhos quando elemento contenteditable estiver focado'
  );
  assert(
    coreCode.includes('convAvisoHtmlFn'),
    'js/core.js deve carregar avisos no modal usando conversor de HTML com <br>'
  );
  assert(
    coreCode.includes('normAvisoFn'),
    'js/core.js deve normalizar conteúdo do aviso ao salvar'
  );
});

// 8. Validação da Importação e Persistência do Acervo de Louvores
console.log('\n8) Validação da Importação e Persistência do Acervo de Louvores:');
const storageModule = require(path.join(root, 'js', 'modules', 'storage.js'));
const normalizarFn = storageModule.normalizarEstruturaLouvores;

runTest('Normalização de acervo nativo [ { name, songs } ]', () => {
  const input = [
    { name: 'Pasta A', songs: [{ title: 'Hino 1', content: 'Letra 1' }] },
    { name: 'Pasta B', songs: [{ title: 'Hino 2', content: 'Letra 2' }] }
  ];
  const res = normalizarFn(input);
  assert(Array.isArray(res) && res.length === 2, 'Deve manter as duas pastas');
  assert.strictEqual(res[0].name, 'Pasta A');
  assert.strictEqual(res[0].songs[0].title, 'Hino 1');
  assert.strictEqual(res[1].songs[0].title, 'Hino 2');
});

runTest('Normalização de objeto envelopado { data: [...] } ou { dados: [...] }', () => {
  const inputData = {
    data: [
      { name: 'Coletânea Jovem', songs: [{ title: 'Louvor 10', content: 'Texto 10' }] }
    ]
  };
  const res1 = normalizarFn(inputData);
  assert(Array.isArray(res1) && res1.length === 1, 'Deve extrair array de .data');
  assert.strictEqual(res1[0].name, 'Coletânea Jovem');

  const inputDados = {
    dados: [
      { name: 'Coletânea Crianças', songs: [{ title: 'Louvor C', content: 'Texto C' }] }
    ]
  };
  const res2 = normalizarFn(inputDados);
  assert(Array.isArray(res2) && res2.length === 1, 'Deve extrair array de .dados');
  assert.strictEqual(res2[0].name, 'Coletânea Crianças');
});

runTest('Normalização de objeto com categorias { categories: [...] }', () => {
  const input = {
    categories: [
      { title: 'Culto Especial', louvores: [{ nome: 'Hino da Vitória', letra: 'Glória a Deus' }] }
    ]
  };
  const res = normalizarFn(input);
  assert(Array.isArray(res) && res.length === 1, 'Deve converter categories para pastas');
  assert.strictEqual(res[0].name, 'Culto Especial');
  assert.strictEqual(res[0].songs[0].title, 'Hino da Vitória');
  assert.strictEqual(res[0].songs[0].content, 'Glória a Deus');
});

runTest('Normalização de lista plana de canções { songs: [...] } ou array [ { title, content } ]', () => {
  const inputSongs = {
    songs: [
      { title: 'Cantai ao Senhor', content: 'Um cântico novo' },
      { title: 'Grande é o Senhor', content: 'Digno de louvor' }
    ]
  };
  const res1 = normalizarFn(inputSongs);
  assert(Array.isArray(res1) && res1.length === 1, 'Deve encapsular songs soltos em uma pasta padrão');
  assert.strictEqual(res1[0].songs.length, 2);
  assert.strictEqual(res1[0].songs[0].title, 'Cantai ao Senhor');

  const inputArray = [
    { title: 'Cântico 1', content: 'Verso 1' },
    { title: 'Cântico 2', content: 'Verso 2' }
  ];
  const res2 = normalizarFn(inputArray);
  assert(Array.isArray(res2) && res2.length === 1, 'Deve encapsular array de canções em uma pasta padrão');
  assert.strictEqual(res2[0].songs.length, 2);
  assert.strictEqual(res2[0].songs[1].title, 'Cântico 2');
});

runTest('Tratamento resiliente de entradas nulas, inválidas ou vazias', () => {
  assert.strictEqual(normalizarFn(null), null, 'null deve retornar null');
  assert.strictEqual(normalizarFn(undefined), null, 'undefined deve retornar null');
  assert.strictEqual(normalizarFn(''), null, 'string vazia deve retornar null');
  assert.strictEqual(normalizarFn(12345), null, 'número deve retornar null');
  assert.strictEqual(normalizarFn({}), null, 'objeto sem chaves válidas deve retornar null');
});

runTest('Prioridade do IndexedDB (app_custom_data_json) no carregamento de js/core.js', () => {
  const coreCode = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
  assert(
    coreCode.includes('app_custom_data_json'),
    'carregaLouvores deve consultar "app_custom_data_json" no MediaDB'
  );
  assert(
    coreCode.includes('processarImportacaoLouvores'),
    'js/core.js deve exportar a função global processarImportacaoLouvores'
  );
  assert(
    coreCode.includes('restaurarColetaneaPadrao'),
    'js/core.js deve exportar a função global restaurarColetaneaPadrao'
  );
  assert(
    coreCode.includes('salvarAcervoCompleto'),
    'salvamento do editor e importação devem usar salvarAcervoCompleto'
  );
});

runTest('Endpoint HTTP POST /api/data em server.js e ProjecaoICM.cs', () => {
  const serverCode = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const csCode = fs.readFileSync(path.join(root, 'desktop', 'ProjecaoICM.cs'), 'utf8');
  assert(
    serverCode.includes("pathname === '/api/data' && req.method === 'POST'"),
    'server.js deve implementar POST /api/data para persistir data/data.json'
  );
  assert(
    csCode.includes('pathName == "/api/data" && req.Method == "POST"'),
    'ProjecaoICM.cs deve implementar POST /api/data para persistir data/data.json'
  );
});

runTest('Interface do usuário (index.html) possui opções de Importar e Restaurar Padrão', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(
    indexHtml.includes('id="btnRestaurarPadrao"'),
    'index.html deve conter botão #btnRestaurarPadrao'
  );
  assert(
    indexHtml.includes('id="import"'),
    'index.html deve conter botão #import para abrir modal de importação'
  );
  assert(
    indexHtml.includes('id="fileImport"'),
    'index.html deve conter input #fileImport'
  );
});

// ----------------------------------------------------
// 9. Preservação do Slide Ativo na Adição e Remoção da Fila de Projeção
// ----------------------------------------------------
console.log('\n9) Validação da Preservação do Slide Ativo na Fila de Projeção (Sem Reset Indevido):');

runTest('Funções globais de rastreamento semântico em js/modules/projection.js', () => {
  const projCode = fs.readFileSync(path.join(root, 'js', 'modules', 'projection.js'), 'utf8');
  assert(
    projCode.includes('function obterInfoSlideAtivo('),
    'projection.js deve definir obterInfoSlideAtivo'
  );
  assert(
    projCode.includes('function resolverNovoSlideAtivo('),
    'projection.js deve definir resolverNovoSlideAtivo'
  );
  assert(
    projCode.includes('function removerItemDaProjecao('),
    'projection.js deve definir removerItemDaProjecao'
  );
  assert(
    projCode.includes('window.obterInfoSlideAtivo = obterInfoSlideAtivo'),
    'projection.js deve exportar obterInfoSlideAtivo no window'
  );
  assert(
    projCode.includes('window.resolverNovoSlideAtivo = resolverNovoSlideAtivo'),
    'projection.js deve exportar resolverNovoSlideAtivo no window'
  );
  assert(
    projCode.includes('window.removerItemDaProjecao = removerItemDaProjecao'),
    'projection.js deve exportar removerItemDaProjecao no window'
  );
});

runTest('Sincronização e classes no DOM do Reveal em view.html', () => {
  const viewHtml = fs.readFileSync(path.join(root, 'view.html'), 'utf8');
  assert(
    viewHtml.includes('Reveal.slide(slideNum, 0, 0);'),
    'view.html deve navegar com Reveal.slide(slideNum, 0, 0)'
  );
  assert(
    viewHtml.includes("sec.classList.add('present');"),
    'reloadReveal em view.html deve aplicar classe .present ao slide ativo'
  );
  assert(
    viewHtml.includes("sec.removeAttribute('hidden');"),
    'reloadReveal em view.html deve remover atributo hidden do slide ativo'
  );
});

runTest('Rastreamento de slide na adição e exclusão em fila simulada', () => {
  const vm = require('vm');
  const projCode = fs.readFileSync(path.join(root, 'js', 'modules', 'projection.js'), 'utf8');

  const noop = () => {};
  const mockJQueryObj = {
    on: () => mockJQueryObj,
    off: () => mockJQueryObj,
    append: () => mockJQueryObj,
    html: () => mockJQueryObj,
    click: () => mockJQueryObj,
    each: () => mockJQueryObj,
    addClass: () => mockJQueryObj,
    removeClass: () => mockJQueryObj,
    attr: () => '',
    show: () => mockJQueryObj,
    hide: () => mockJQueryObj,
    ready: (fn) => { if (typeof fn === 'function') fn(); return mockJQueryObj; }
  };
  const mockJQuery = function() { return mockJQueryObj; };
  mockJQuery.each = function(arr, fn) { if (Array.isArray(arr)) arr.forEach((item, idx) => fn(idx, item)); };

  const mockWindow = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { protocol: 'http:' }
  };

  const sandbox = {
    dados: [
      {
        name: "Coletânea",
        songs: [
          { title: "01 - Hino 1", content: "Estrofe 1\n\nEstrofe 2\n\nEstrofe 3" },
          { title: "02 - Hino 2", content: "Estrofe 1\n\nEstrofe 2" },
          { title: "03 - Hino 3", content: "Estrofe 1\n\nEstrofe 2\n\nEstrofe 3\n\nEstrofe 4" }
        ]
      }
    ],
    projecao: [],
    projecaoAtiva: 0,
    window: mockWindow,
    document: {
      querySelectorAll: () => [],
      getElementById: () => null
    },
    $: mockJQuery,
    jQuery: mockJQuery,
    console: console,
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    BroadcastChannel: function() { return { postMessage: noop, close: noop }; },
    localStorage: { setItem: noop, getItem: () => null }
  };
  vm.createContext(sandbox);

  // Executa o trecho relevante de projection.js no sandbox
  vm.runInContext(projCode, sandbox);

  const { obterInfoSlideAtivo, resolverNovoSlideAtivo, removerItemDaProjecao } = sandbox;

  // 1. Fila vazia inicia em 0
  assert.strictEqual(sandbox.projecaoAtiva, 0);

  // 2. Adiciona Hino 0 (3 estrofes: slides 1, 2, 3; slide 4 é tela padrão intermediária)
  sandbox.projecao.push({ id: 0, folderId: 0, type: "s" });
  // Projeta Estrofe 2 (slide 2)
  sandbox.projecaoAtiva = 2;
  let info = obterInfoSlideAtivo(sandbox.projecaoAtiva);
  assert.strictEqual(info.subOffset, 1, 'Slide 2 corresponde à 2ª estrofe (subOffset 1)');

  // 3. Adiciona Hino 1 (2 estrofes) ao fim da fila
  sandbox.projecao.push({ id: 1, folderId: 0, type: "s" });
  let novoSlide = resolverNovoSlideAtivo(info);
  assert.strictEqual(novoSlide, 2, 'Adicionar hino não deve alterar índice do slide ativo anterior');

  // 4. Adiciona passagem Bíblica (3 versículos) ao fim da fila
  sandbox.projecao.push({ b: 0, c: 0, from: 0, to: 2, type: "b" });
  novoSlide = resolverNovoSlideAtivo(info);
  assert.strictEqual(novoSlide, 2, 'Adicionar bíblia não deve alterar índice do slide ativo');

  // 5. Agora o operador projeta o Hino 1, Estrofe 1 (que está no slide 6: hino 0 ocupa 1,2,3,4; hino 1 começa no 5, estrofe 1 é 6)
  sandbox.projecaoAtiva = 6;
  info = obterInfoSlideAtivo(sandbox.projecaoAtiva);
  assert.strictEqual(info.itemRef.id, 1, 'Deve identificar que o slide 6 pertence ao Hino 1');

  // 6. Exclui o item anterior (Hino 0, index 0 na fila)
  sandbox.projecao.splice(0, 1);
  novoSlide = resolverNovoSlideAtivo(info);
  // Agora Hino 1 é o primeiro da fila (slides 1, 2, 3). Estrofe 1 deve ser o slide 2!
  assert.strictEqual(novoSlide, 2, 'Excluir item anterior deve remapear slide ativo para a mesma estrofe sem resetar para tela padrão');

  // 7. Agora exclui o item que está ativo no momento (Hino 1)
  info = obterInfoSlideAtivo(novoSlide);
  sandbox.projecao.splice(0, 1); // remove Hino 1
  novoSlide = resolverNovoSlideAtivo(info);
  assert.strictEqual(novoSlide, 0, 'Excluir o próprio item sendo projetado deve resetar limpa e corretamente para a Tela Padrão (0)');
});

// ----------------------------------------------------
// 10. Validação da Otimização de Memória e Processador (Evicção de Blobs, Revogação de URLs, Desacoplamento de Sync Ocioso e Reconciliação Diferencial)
// ----------------------------------------------------
console.log('\n10) Validação da Otimização de Memória e Processador:');

runTest('Gerenciamento de Ciclo de Vida de Blobs e ObjectURLs em js/modules/media.js', () => {
  const mediaCode = fs.readFileSync(path.join(root, 'js', 'modules', 'media.js'), 'utf8');
  assert(
    mediaCode.includes('var MAX_ACTIVE_BLOBS =') && mediaCode.includes('var blobAccessOrder ='),
    'media.js deve definir MAX_ACTIVE_BLOBS e blobAccessOrder para política LRU de evicção'
  );
  assert(
    mediaCode.includes('function revogarBlobMidia(') && mediaCode.includes('URL.revokeObjectURL('),
    'media.js deve implementar revogarBlobMidia com chamada explícita a URL.revokeObjectURL'
  );
  assert(
    mediaCode.includes('function obterIdsMidiasEmUso(') && mediaCode.includes('function limparCacheMidiasInativas('),
    'media.js deve implementar obterIdsMidiasEmUso e limparCacheMidiasInativas'
  );
  assert(
    mediaCode.includes('function purgarCacheExcedenteSeNecessario('),
    'media.js deve implementar purgarCacheExcedenteSeNecessario antes de alocar novos ObjectURLs'
  );
  assert(
    !mediaCode.includes('MediaDB.save(idVid, typedBlob)'),
    'escanearPastasAutomaticas não deve salvar blobs pesados de vídeo no IndexedDB a cada ciclo de varredura'
  );
});

runTest('Desacoplamento e Liberação de Hardware / VRAM em view.html', () => {
  const viewHtml = fs.readFileSync(path.join(root, 'view.html'), 'utf8');
  assert(
    viewHtml.includes('canvas.width = 0;') && viewHtml.includes('canvas.height = 0;'),
    'ocultarCanvasCongelado deve zerar dimensões do canvas para desalocar o buffer de 1080p da GPU/RAM'
  );
  assert(
    viewHtml.includes('function armazenarTelaoBlobUrl(') && viewHtml.includes('URL.revokeObjectURL(antiga)'),
    'view.html deve implementar armazenarTelaoBlobUrl com revogação explícita da URL anterior'
  );
  assert(
    viewHtml.includes('mEl.pause();') && viewHtml.includes('mEl.removeAttribute(\'src\');') && viewHtml.includes('mEl.load();'),
    'reloadReveal deve pausar, desvincular src e chamar load() nos elementos de vídeo/áudio antigos antes de recriar o DOM'
  );
  assert(
    viewHtml.includes('function obterVideoAtivoParaSync(somenteSeTocando)') &&
    viewHtml.includes('if (somenteSeTocando && (sVid.paused || sVid.ended || sVid.readyState < 2)) return null;'),
    'obterVideoAtivoParaSync deve suportar somenteSeTocando para anular ticks periódicos em vídeos pausados ou estáticos'
  );
});

runTest('Throttling e Caching Diferencial em js/modules/remote.js', () => {
  const remoteCode = fs.readFileSync(path.join(root, 'js', 'modules', 'remote.js'), 'utf8');
  assert(
    remoteCode.includes('if (!activeRow) return;'),
    'notificarEstadoRemoto com isVideoTickOnly deve abortar imediatamente se não houver linha de vídeo ativa'
  );
  assert(
    remoteCode.includes('var minThrottle = isVideoTickOnly ? 1000 : 350;'),
    'enviarEstadoRemoto deve limitar a telemetria periódica de vídeo a no mínimo 1000ms'
  );
  assert(
    remoteCode.includes('cachedLiveSlides !== null && cachedLiveQueue !== null && lastCachedSlidesVersion === curVer'),
    'construirSnapshotRemoto deve reutilizar slides e fila cacheados sem reconsultar o DOM quando a versão da lista for idêntica'
  );
});

runTest('Reconciliação DOM sem Recriação Desnecessária em controle.html', () => {
  const controleHtml = fs.readFileSync(path.join(root, 'controle.html'), 'utf8');
  assert(
    controleHtml.includes('lastRenderedSlidesSig') && controleHtml.includes('lastRenderedQueueSig'),
    'controle.html deve manter assinaturas das listas para evitar destruição e recriação do DOM a cada tick'
  );
  assert(
    controleHtml.includes('listEl.querySelectorAll(\'.slide-list-item\').forEach('),
    'controle.html deve atualizar apenas a classe active quando a estrutura dos slides for idêntica'
  );
});

runTest('Gerenciamento de Streams e Concorrência em desktop/ProjecaoICM.cs', () => {
  const csCode = fs.readFileSync(path.join(root, 'desktop', 'ProjecaoICM.cs'), 'utf8');
  assert(
    csCode.includes('using (MemoryStream headerBuf = new MemoryStream())'),
    'ReadHttpRequest deve envolver headerBuf em bloco using para descarte imediato da memória'
  );
  assert(
    csCode.includes('lock (s)') && csCode.includes('lock (stream)'),
    'ProjecaoICM.cs deve sincronizar escritas SSE simultâneas com lock para prevenir corrupção de sockets'
  );
  assert(
    csCode.includes('// Conexão encerrada pelo cliente prematuramente'),
    'CopyFileSlice deve tratar desconexões prematuras do cliente durante streaming sem vazar threads'
  );
});

console.log('\n==================================================');
if (failures === 0) {
  console.log('✅ \x1b[32mTODOS OS TESTES PASSARAM COM SUCESSO!\x1b[0m');
  console.log('==================================================\n');
  process.exit(0);
} else {
  console.error(`❌ \x1b[31m${failures} TESTE(S) FALHARAM!\x1b[0m`);
  console.log('==================================================\n');
  process.exit(1);
}
