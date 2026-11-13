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
