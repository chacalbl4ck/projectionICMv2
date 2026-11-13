var bibleversion = "acf";
var bible;
var bookSelected = 0;
var chapterSelected = 0;
var fromSelected = 0;
var toSelected = 0;
var bibleLoaded = false;
var bibleLoading = false;

function loadBible() {
  if (typeof bibleacf === 'undefined' && typeof biblenvi === 'undefined') {
    return;
  }
  switch(bibleversion) {
      case "nvi":
      {
        bible = typeof biblenvi !== 'undefined' ? biblenvi : bibleacf;
        break;
      }         
      case "acf":
      {
        bible = typeof bibleacf !== 'undefined' ? bibleacf : biblenvi;
        break;
      }
      default: {
        bible = typeof biblenvi !== 'undefined' ? biblenvi : bibleacf;
        break;
      }
  }
}

function carregarScriptAssincrono(src) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

var bibleLoadingPromise = null;

function inicializarBibliaLazy() {
  if (bibleLoaded) return Promise.resolve();
  if (bibleLoadingPromise) return bibleLoadingPromise;

  $('#bibleLoadingIndicator').show();
  $('#bibleContentArea').hide();
  $('#bibleEditLoadingIndicator').show();
  $('#bibleEditContentArea').hide();

  bibleLoadingPromise = (async function() {
    try {
      if (typeof bibleacf === 'undefined') {
        await carregarScriptAssincrono('bible/acf.js');
      }
      if (typeof biblenvi === 'undefined') {
        await carregarScriptAssincrono('bible/nvi.js');
      }
      await aplicarEdicoesCustomizadasBiblia();
      loadBible();
      ajustarListasDaBiblia();
      inicializarEditorBibliaUI();
      inicializarBuscaBiblicaUI();
      bibleLoaded = true;
      $('#bibleLoadingIndicator').hide();
      $('#bibleContentArea').fadeIn(200);
      $('#bibleEditLoadingIndicator').hide();
      $('#bibleEditContentArea').fadeIn(200);

      if (typeof reloadProjectionList === 'function' && typeof projecao !== 'undefined' && projecao.some(function(p){ return p.type === 'b'; })) {
        reloadProjectionList();
      }
    } catch (err) {
      console.error("Erro ao carregar arquivos da Bíblia:", err);
      var errHtml = '<p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Não foi possível carregar as bases bíblicas.</p>';
      $('#bibleLoadingIndicator').html(errHtml);
      $('#bibleEditLoadingIndicator').html(errHtml);
      bibleLoadingPromise = null;
    }
  })();

  return bibleLoadingPromise;
}

$(document).ready(function() {
  $('#bible-tab').on('click', function() {
    inicializarBibliaLazy();
  });
  $('#bible-edit-tab').on('click', function() {
    inicializarBibliaLazy().then(function() {
      sincronizarEditorComSelecaoBiblia();
    });
  });
  inicializarBuscaBiblicaUI();
});

var bookNames = [
{ name: "Gênesis", num_chapters:50 }, { name: "Êxodo", num_chapters:40 }, { name: "Levítico", num_chapters:27 }, { name: "Números", num_chapters:36 }, { name: "Deuteronômio", num_chapters:34 }, { name: "Josué", num_chapters:24 }, { name: "Juízes", num_chapters:21 }, { name: "Rute", num_chapters:4 }, { name: "1 Samuel", num_chapters:31 }, { name: "2 Samuel", num_chapters:24 }, { name: "1 Reis", num_chapters:22 }, { name: "2 Reis", num_chapters:25 }, { name: "1 Crônicas", num_chapters:29 }, { name: "2 Crônicas", num_chapters:36 }, { name: "Esdras", num_chapters:10 }, { name: "Neemias", num_chapters:13 }, { name: "Ester", num_chapters:10 }, { name: "Jó", num_chapters:42 }, { name: "Salmos", num_chapters:150 }, { name: "Provérbios", num_chapters:31 }, { name: "Eclesiastes", num_chapters:12 }, { name: "Cânticos", num_chapters:8 }, { name: "Isaías", num_chapters:66 }, { name: "Jeremias", num_chapters:52 }, { name: "Lamentações", num_chapters:5 }, { name: "Ezequiel", num_chapters:48 }, { name: "Daniel", num_chapters:12 }, { name: "Oséias", num_chapters:14 }, { name: "Joel", num_chapters:3 }, { name: "Amós", num_chapters:9 }, { name: "Obadias", num_chapters:1 }, { name: "Jonas", num_chapters:4 }, { name: "Miquéias", num_chapters:7 }, { name: "Naum", num_chapters:3 }, { name: "Habacuque", num_chapters:3 }, { name: "Sofonias", num_chapters:3 }, { name: "Ageu", num_chapters:2 }, { name: "Zacarias", num_chapters:14 }, { name: "Malaquias", num_chapters:4 }, { name: "Mateus", num_chapters:28 }, { name: "Marcos", num_chapters:16 }, { name: "Lucas", num_chapters:24 }, { name: "João", num_chapters:21 }, { name: "Atos", num_chapters:28 }, { name: "Romanos", num_chapters:16 }, { name: "1 Coríntios", num_chapters:16 }, { name: "2 Coríntios", num_chapters:13 }, { name: "Gálatas", num_chapters:6 }, { name: "Efésios", num_chapters:6 }, { name: "Filipenses", num_chapters:4 }, { name: "Colossenses", num_chapters:4 }, { name: "1 Tessalonicenses", num_chapters:5 }, { name: "2 Tessalonicenses", num_chapters:3 }, { name: "1 Timóteo", num_chapters:6 }, { name: "2 Timóteo", num_chapters:4 }, { name: "Tito", num_chapters:3 }, { name: "Filemom", num_chapters:1 }, { name: "Hebreus", num_chapters:13 }, { name: "Tiago", num_chapters:5 }, { name: "1 Pedro", num_chapters:5 }, { name: "2 Pedro", num_chapters:3 }, { name: "1 João", num_chapters:5 }, { name: "2 João", num_chapters:1 }, { name: "3 João", num_chapters:1 }, { name: "Judas", num_chapters:1 }, { name: "Apocalipse", num_chapters:22 } 
];

function ajustarListasDaBiblia(){
  $('#listaVelho').html("");
  $('#listaNovo').html("");

  $.each(bookNames, function(i, book){
    if(i<39) {
      $('#listaVelho').append('<li class="list-group-item" data-id="'+i+'">'+book.name+'</li>');
    } else {
      $('#listaNovo').append('<li class="list-group-item" data-id="'+i+'">'+book.name+'</li>');
    }
  });

  $('#listaVelho li').click(function(){
    $('#listaVelho > li.active').removeClass('active');
    $('#listaNovo > li.active').removeClass('active');
    $(this).addClass('active');
    selectBook($(this));
  });

  $('#listaNovo li').click(function(){
    $('#listaVelho > li.active').removeClass('active');
    $('#listaNovo > li.active').removeClass('active');
    $(this).addClass('active');
    selectBook($(this));
  });  
}

function selectBook(nodeLi){
  bookSelected = parseInt(nodeLi.attr("data-id"));
  chapterSelected = 0;

  $('#listaDe').html("");
  $('#listaAte').html(""); 

  $('#listaCapitulo').html("");
  for(i = 0; i < bookNames[bookSelected].num_chapters; i++){
    $('#listaCapitulo').append('<li class="list-group-item" data-id="'+i+'">'+(i+1)+'</li>');
  } 

  $('#listaCapitulo').scrollTop(0);

  $('#listaCapitulo li').click(function(){
    $('#listaCapitulo > li.active').removeClass('active');
    $(this).addClass('active');
    selectChapter($(this));
  });

}

function selectChapter(nodeLi){
  chapterSelected = parseInt(nodeLi.attr("data-id"));
  fromSelected = 0;
  toSelected = 0;

  $('#listaDe').html("");
  $('#listaAte').html("");
  for(i = 0; i < bible[bookSelected].chapters[chapterSelected].length; i++){
    $('#listaDe').append('<li class="list-group-item" data-id="'+i+'">'+(i+1)+'</li>');
    $('#listaAte').append('<li class="list-group-item" data-id="'+i+'">'+(i+1)+'</li>');
    if(i == bible[bookSelected].chapters[chapterSelected].length - 1){
      toSelected = bible[bookSelected].chapters[chapterSelected].length - 1;
      $('#listaDe').scrollTop(0);
      $('#listaAte').scrollTop(  $('#listaAte > li[data-id="'+toSelected+'"]').offset().top - $('#listaAte').offset().top + $('#listaAte').scrollTop());
      $('#listaDe > li[data-id="'+fromSelected+'"]').addClass('active');
      $('#listaAte > li[data-id="'+toSelected+'"]').addClass('active');
      biblePreView();
    }
  } 

  $('#listaDe li').click(function(){
    $('#listaDe > li.active').removeClass('active');
    $(this).addClass('active');
    fromSelected = parseInt($(this).attr("data-id"));
    toSelected = parseInt($(this).attr("data-id"));
    $('#listaAte > li.active').removeClass('active');
    $('#listaAte > li[data-id="'+fromSelected+'"]').addClass('active');
    $('#listaAte').scrollTop(  $('#listaAte > li[data-id="'+toSelected+'"]').offset().top - $('#listaAte').offset().top + $('#listaAte').scrollTop());    
    biblePreView();
  });  

  $('#listaAte li').click(function(){
    $('#listaAte > li.active').removeClass('active');
    $(this).addClass('active');
    toSelected = parseInt($(this).attr("data-id"));
    if(fromSelected > toSelected){
      fromSelected = toSelected;
      $('#listaDe > li.active').removeClass('active');
      $('#listaDe > li[data-id="'+fromSelected+'"]').addClass('active');
      $('#listaDe').scrollTop(  $('#listaDe > li[data-id="'+fromSelected+'"]').offset().top - $('#listaDe').offset().top + $('#listaDe').scrollTop());
    }
    biblePreView();
  }); 
}

function biblePreView(){
  $('#preViewScripture').html("");
  for (var i = fromSelected; i <= toSelected; i++) {
    $('#preViewScripture').append("<p>"+bible[bookSelected].chapters[chapterSelected][i]+"</p>");
  }
}

$('#addBibleToProjection').click(function(){
  var biblia = { b: bookSelected, c: chapterSelected, from: fromSelected, to: toSelected, type: "b" }
  projecao.push(biblia);
  reloadProjectionList();
});  

$('#selectBibleVersion').change(function() {
  bibleversion = $(this).val();
  loadBible();
  biblePreView();
  reloadProjectionList();
  if ($('#inputBibleSearch').length && $('#inputBibleSearch').val().trim()) {
    executarBuscaBiblia();
  }
});

// ==========================================
// SUBSISTEMA DE EDIÇÃO DA BÍBLIA
// ==========================================
var bibleCustomEdits = { acf: { chapters: {} }, nvi: { chapters: {} } };
var originalBibleChapters = {};
var bibleEditDirty = false;
var bibleEditBookIdx = 0;
var bibleEditChapterIdx = 0;
var bibleEditVersion = "acf";
var bibleEditorInitialized = false;

function obterBaseBiblicaPorVersao(versao) {
  if (versao === 'nvi') {
    return (typeof biblenvi !== 'undefined') ? biblenvi : ((typeof bibleacf !== 'undefined') ? bibleacf : null);
  }
  return (typeof bibleacf !== 'undefined') ? bibleacf : ((typeof biblenvi !== 'undefined') ? biblenvi : null);
}

function capturarCapituloOriginalSeNecessario(versao, bIdx, cIdx) {
  var key = versao + ':' + bIdx + ':' + cIdx;
  if (originalBibleChapters[key]) return originalBibleChapters[key];
  var base = obterBaseBiblicaPorVersao(versao);
  if (base && base[bIdx] && base[bIdx].chapters && Array.isArray(base[bIdx].chapters[cIdx])) {
    originalBibleChapters[key] = base[bIdx].chapters[cIdx].slice();
    return originalBibleChapters[key];
  }
  return null;
}

async function aplicarEdicoesCustomizadasBiblia() {
  var loadedRaw = null;
  try { loadedRaw = localStorage.getItem('bible_custom_edits'); } catch(e) {}

  if (!loadedRaw && typeof MediaDB !== 'undefined' && typeof MediaDB.get === 'function') {
    try {
      await MediaDB.init();
      var dbVal = await MediaDB.get('app_bible_custom_edits');
      if (dbVal) loadedRaw = (typeof dbVal === 'string') ? dbVal : JSON.stringify(dbVal);
    } catch(e) {}
  }

  if (loadedRaw) {
    try {
      var parsed = JSON.parse(loadedRaw);
      if (parsed && typeof parsed === 'object') {
        bibleCustomEdits.acf = (parsed.acf && parsed.acf.chapters) ? { chapters: parsed.acf.chapters } : { chapters: {} };
        bibleCustomEdits.nvi = (parsed.nvi && parsed.nvi.chapters) ? { chapters: parsed.nvi.chapters } : { chapters: {} };
      }
    } catch(e) {}
  }

  ['acf', 'nvi'].forEach(function(ver) {
    var base = obterBaseBiblicaPorVersao(ver);
    var chaptersMap = (bibleCustomEdits[ver] && bibleCustomEdits[ver].chapters) ? bibleCustomEdits[ver].chapters : {};
    if (!base) return;
    Object.keys(chaptersMap).forEach(function(bcKey) {
      var parts = bcKey.split(':');
      var bIdx = parseInt(parts[0], 10);
      var cIdx = parseInt(parts[1], 10);
      var customList = chaptersMap[bcKey];
      if (!isNaN(bIdx) && !isNaN(cIdx) && Array.isArray(customList) && base[bIdx] && base[bIdx].chapters && base[bIdx].chapters[cIdx]) {
        capturarCapituloOriginalSeNecessario(ver, bIdx, cIdx);
        base[bIdx].chapters[cIdx] = customList.slice();
      }
    });
  });
}

function persistirEdicoesCustomizadasBiblia() {
  var serialized = JSON.stringify(bibleCustomEdits);
  try {
    localStorage.setItem('bible_custom_edits', serialized);
  } catch(e) {
    console.warn("Falha ao gravar alterações da Bíblia no localStorage:", e);
  }
  if (typeof MediaDB !== 'undefined' && typeof MediaDB.save === 'function') {
    try {
      MediaDB.init().then(function() {
        MediaDB.save('app_bible_custom_edits', serialized);
      }).catch(function(){});
    } catch(e) {}
  }
}

function definirStatusEditorBiblia(texto, badgeClass) {
  var badge = $('#bibleEditStatusBadge');
  if (!badge.length) return;
  badge.removeClass('badge-secondary badge-warning badge-success badge-info badge-danger').addClass(badgeClass || 'badge-secondary');
  badge.text(texto);
}

function atualizarListaCapitulosEditor() {
  var capSelect = document.getElementById('editBibleChapter');
  if (!capSelect) return;
  var base = obterBaseBiblicaPorVersao(bibleEditVersion);
  var totalCaps = (base && base[bibleEditBookIdx] && base[bibleEditBookIdx].chapters)
    ? base[bibleEditBookIdx].chapters.length
    : ((bookNames[bibleEditBookIdx] && bookNames[bibleEditBookIdx].num_chapters) || 1);

  if (bibleEditChapterIdx >= totalCaps) bibleEditChapterIdx = 0;

  var html = '';
  for (var c = 0; c < totalCaps; c++) {
    html += '<option value="' + c + '">Capítulo ' + (c + 1) + '</option>';
  }
  capSelect.innerHTML = html;
  capSelect.value = String(bibleEditChapterIdx);
}

function renderizarVersiculosEdicaoBiblia() {
  var container = document.getElementById('bibleEditVersesContainer');
  if (!container) return;

  var base = obterBaseBiblicaPorVersao(bibleEditVersion);
  if (!base || !base[bibleEditBookIdx] || !base[bibleEditBookIdx].chapters || !base[bibleEditBookIdx].chapters[bibleEditChapterIdx]) {
    container.innerHTML = '<p class="text-muted text-center p-3">Capítulo não disponível.</p>';
    return;
  }

  var origCap = capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx) || [];
  var verses = base[bibleEditBookIdx].chapters[bibleEditChapterIdx];
  container.innerHTML = '';

  var escHtml = function(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  verses.forEach(function(text, vIdx) {
    var isExtra = vIdx >= origCap.length;
    var isEdited = !isExtra && text !== origCap[vIdx];

    var rowDiv = document.createElement('div');
    rowDiv.className = 'bible-edit-verse-row mb-2 p-2 rounded';
    rowDiv.style.background = '#2b2b2b';
    rowDiv.style.border = isEdited ? '1px solid #ffc107' : (isExtra ? '1px solid #17a2b8' : '1px solid #3c3c3c');
    rowDiv.dataset.verseIdx = vIdx;

    var headerHtml =
      '<div class="d-flex justify-content-between align-items-center mb-1">' +
        '<div>' +
          '<span class="badge badge-dark mr-1">Versículo ' + (vIdx + 1) + '</span>' +
          (isEdited ? '<span class="badge badge-warning">Editado</span>' : '') +
          (isExtra ? '<span class="badge badge-info">Novo</span>' : '') +
        '</div>' +
        '<div class="btn-group btn-group-sm">' +
          (!isExtra && isEdited ? '<button type="button" class="btn btn-outline-warning btn-xs btn-restore-single-verse" data-verse-idx="' + vIdx + '" title="Restaurar versículo original"><i class="fas fa-undo"></i></button>' : '') +
          (isExtra && vIdx === verses.length - 1 ? '<button type="button" class="btn btn-outline-danger btn-xs btn-remove-last-verse" data-verse-idx="' + vIdx + '" title="Remover último versículo adicionado"><i class="fas fa-trash"></i></button>' : '') +
        '</div>' +
      '</div>' +
      '<textarea class="form-control form-control-sm bible-edit-verse-input bg-dark text-light" data-verse-idx="' + vIdx + '" rows="2">' + escHtml(text) + '</textarea>';

    rowDiv.innerHTML = headerHtml;
    container.appendChild(rowDiv);
  });

  bibleEditDirty = false;
  var hasChapterOverride = !!(bibleCustomEdits[bibleEditVersion] && bibleCustomEdits[bibleEditVersion].chapters && bibleCustomEdits[bibleEditVersion].chapters[bibleEditBookIdx + ':' + bibleEditChapterIdx]);
  definirStatusEditorBiblia(hasChapterOverride ? 'Capítulo customizado' : 'Texto original', hasChapterOverride ? 'badge-info' : 'badge-secondary');
  filtrarVersiculosEdicaoBiblia();
}

function filtrarVersiculosEdicaoBiblia() {
  var searchEl = document.getElementById('editBibleSearch');
  var container = document.getElementById('bibleEditVersesContainer');
  if (!searchEl || !container) return;

  var q = (searchEl.value || '').trim().toLowerCase();
  var rows = container.querySelectorAll('.bible-edit-verse-row');
  rows.forEach(function(row) {
    if (!q) {
      row.style.display = '';
      return;
    }
    var idx = parseInt(row.dataset.verseIdx, 10) + 1;
    var ta = row.querySelector('textarea.bible-edit-verse-input');
    var val = ta ? ta.value.toLowerCase() : '';
    var match = (String(idx) === q || ('versículo ' + idx).indexOf(q) !== -1 || val.indexOf(q) !== -1);
    row.style.display = match ? '' : 'none';
  });
}

function arraysIguaisTexto(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function atualizarAbasEProjecaoAposEdicaoBiblia() {
  if (typeof invalidarCacheBuscaBiblica === 'function') {
    invalidarCacheBuscaBiblica();
  }
  loadBible();
  if (bibleLoaded && bookSelected === bibleEditBookIdx && chapterSelected === bibleEditChapterIdx && bibleversion === bibleEditVersion) {
    var base = obterBaseBiblicaPorVersao(bibleversion);
    var totalV = (base && base[bookSelected] && base[bookSelected].chapters && base[bookSelected].chapters[chapterSelected])
      ? base[bookSelected].chapters[chapterSelected].length : 0;
    if ($('#listaDe li').length !== totalV) {
      var activeChapLi = $('#listaCapitulo li[data-id="' + chapterSelected + '"]');
      if (activeChapLi.length && typeof selectChapter === 'function') {
        selectChapter(activeChapLi);
      }
    } else {
      if (toSelected >= totalV && totalV > 0) toSelected = totalV - 1;
      if (fromSelected > toSelected) fromSelected = Math.max(0, toSelected);
      biblePreView();
    }
  }
  if (typeof reloadProjectionList === 'function' && typeof projecao !== 'undefined' && Array.isArray(projecao) && projecao.some(function(p) { return p.type === 'b'; })) {
    reloadProjectionList();
  }
}

function salvarCapituloEdicaoBiblia() {
  var container = document.getElementById('bibleEditVersesContainer');
  var base = obterBaseBiblicaPorVersao(bibleEditVersion);
  if (!container || !base || !base[bibleEditBookIdx] || !base[bibleEditBookIdx].chapters) return false;

  var origCap = capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx) || [];
  var inputs = Array.from(container.querySelectorAll('textarea.bible-edit-verse-input'));
  inputs.sort(function(a, b) {
    return parseInt(a.getAttribute('data-verse-idx'), 10) - parseInt(b.getAttribute('data-verse-idx'), 10);
  });

  var novosVersiculos = inputs.map(function(inp) {
    return inp.value;
  });

  base[bibleEditBookIdx].chapters[bibleEditChapterIdx] = novosVersiculos.slice();

  var bcKey = bibleEditBookIdx + ':' + bibleEditChapterIdx;
  if (!bibleCustomEdits[bibleEditVersion]) bibleCustomEdits[bibleEditVersion] = { chapters: {} };

  if (arraysIguaisTexto(novosVersiculos, origCap)) {
    delete bibleCustomEdits[bibleEditVersion].chapters[bcKey];
  } else {
    bibleCustomEdits[bibleEditVersion].chapters[bcKey] = novosVersiculos.slice();
  }

  persistirEdicoesCustomizadasBiblia();
  renderizarVersiculosEdicaoBiblia();
  atualizarAbasEProjecaoAposEdicaoBiblia();
  definirStatusEditorBiblia('Salvo com sucesso!', 'badge-success');
  return true;
}

function adicionarVersiculoEdicaoBiblia() {
  var base = obterBaseBiblicaPorVersao(bibleEditVersion);
  if (!base || !base[bibleEditBookIdx] || !base[bibleEditBookIdx].chapters || !base[bibleEditBookIdx].chapters[bibleEditChapterIdx]) return;

  capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx);
  // Preserva alterações digitadas antes de anexar o novo versículo
  var container = document.getElementById('bibleEditVersesContainer');
  if (container) {
    var existingInputs = container.querySelectorAll('textarea.bible-edit-verse-input');
    var currentArr = [];
    existingInputs.forEach(function(inp) {
      var idx = parseInt(inp.getAttribute('data-verse-idx'), 10);
      currentArr[idx] = inp.value;
    });
    if (currentArr.length > 0) base[bibleEditBookIdx].chapters[bibleEditChapterIdx] = currentArr;
  }

  base[bibleEditBookIdx].chapters[bibleEditChapterIdx].push('');
  var bcKey = bibleEditBookIdx + ':' + bibleEditChapterIdx;
  if (!bibleCustomEdits[bibleEditVersion]) bibleCustomEdits[bibleEditVersion] = { chapters: {} };
  bibleCustomEdits[bibleEditVersion].chapters[bcKey] = base[bibleEditBookIdx].chapters[bibleEditChapterIdx].slice();

  persistirEdicoesCustomizadasBiblia();
  renderizarVersiculosEdicaoBiblia();
  atualizarAbasEProjecaoAposEdicaoBiblia();
  definirStatusEditorBiblia('Novo versículo adicionado', 'badge-info');

  if (container) {
    container.scrollTop = container.scrollHeight;
    var allTa = container.querySelectorAll('textarea.bible-edit-verse-input');
    if (allTa.length > 0) allTa[allTa.length - 1].focus();
  }
}

function restaurarCapituloEdicaoBiblia() {
  var base = obterBaseBiblicaPorVersao(bibleEditVersion);
  var origCap = capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx);
  if (!base || !origCap || !base[bibleEditBookIdx] || !base[bibleEditBookIdx].chapters) return;

  base[bibleEditBookIdx].chapters[bibleEditChapterIdx] = origCap.slice();
  if (bibleCustomEdits[bibleEditVersion] && bibleCustomEdits[bibleEditVersion].chapters) {
    delete bibleCustomEdits[bibleEditVersion].chapters[bibleEditBookIdx + ':' + bibleEditChapterIdx];
  }

  persistirEdicoesCustomizadasBiblia();
  renderizarVersiculosEdicaoBiblia();
  atualizarAbasEProjecaoAposEdicaoBiblia();
  definirStatusEditorBiblia('Capítulo restaurado', 'badge-secondary');
}

function exportarVersaoBibliaJs(versao) {
  var ver = versao || bibleEditVersion || 'acf';
  var base = obterBaseBiblicaPorVersao(ver);
  if (!base) {
    alert("Base bíblica ainda não carregada.");
    return;
  }
  var varName = (ver === 'nvi') ? 'biblenvi' : 'bibleacf';
  var content = 'var ' + varName + ' = ' + JSON.stringify(base) + ';';
  var blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = ver + '.js';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function sincronizarEditorComSelecaoBiblia() {
  if (!bibleEditorInitialized || bibleEditDirty) return;
  bibleEditVersion = bibleversion || 'acf';
  bibleEditBookIdx = bookSelected || 0;
  bibleEditChapterIdx = chapterSelected || 0;

  $('#editBibleVersion').val(bibleEditVersion);
  $('#editBibleBook').val(String(bibleEditBookIdx));
  atualizarListaCapitulosEditor();
  renderizarVersiculosEdicaoBiblia();
}

function inicializarEditorBibliaUI() {
  var bookSelect = document.getElementById('editBibleBook');
  if (bookSelect && bookSelect.options.length === 0) {
    var base = obterBaseBiblicaPorVersao(bibleEditVersion) || bookNames;
    var optHtml = '';
    for (var b = 0; b < base.length; b++) {
      var nomeLivro = (base[b] && base[b].name) ? base[b].name : (bookNames[b] ? bookNames[b].name : ('Livro ' + (b + 1)));
      optHtml += '<option value="' + b + '">' + (b + 1) + '. ' + nomeLivro + '</option>';
    }
    bookSelect.innerHTML = optHtml;
  }

  if (!bibleEditorInitialized) {
    bibleEditVersion = bibleversion || 'acf';
    bibleEditBookIdx = bookSelected || 0;
    bibleEditChapterIdx = chapterSelected || 0;
    $('#editBibleVersion').val(bibleEditVersion);
    $('#editBibleBook').val(String(bibleEditBookIdx));
    atualizarListaCapitulosEditor();
    renderizarVersiculosEdicaoBiblia();
    bibleEditorInitialized = true;

    $('#editBibleVersion').off('change').on('change', function() {
      bibleEditVersion = $(this).val();
      atualizarListaCapitulosEditor();
      renderizarVersiculosEdicaoBiblia();
    });

    $('#editBibleBook').off('change').on('change', function() {
      bibleEditBookIdx = parseInt($(this).val(), 10) || 0;
      bibleEditChapterIdx = 0;
      atualizarListaCapitulosEditor();
      renderizarVersiculosEdicaoBiblia();
    });

    $('#editBibleChapter').off('change').on('change', function() {
      bibleEditChapterIdx = parseInt($(this).val(), 10) || 0;
      renderizarVersiculosEdicaoBiblia();
    });

    $('#editBibleSearch').off('input').on('input', function() {
      filtrarVersiculosEdicaoBiblia();
    });

    $('#btnClearBibleEditSearch').off('click').on('click', function() {
      $('#editBibleSearch').val('');
      filtrarVersiculosEdicaoBiblia();
    });

    $('#bibleEditVersesContainer').off('input', '.bible-edit-verse-input').on('input', '.bible-edit-verse-input', function() {
      bibleEditDirty = true;
      definirStatusEditorBiblia('Alterações não salvas', 'badge-warning');
    });

    $('#bibleEditVersesContainer').off('click', '.btn-restore-single-verse').on('click', '.btn-restore-single-verse', function() {
      var vIdx = parseInt($(this).attr('data-verse-idx'), 10);
      var origCap = capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx);
      if (!origCap || isNaN(vIdx) || vIdx < 0 || vIdx >= origCap.length) return;
      var ta = document.querySelector('#bibleEditVersesContainer textarea.bible-edit-verse-input[data-verse-idx="' + vIdx + '"]');
      if (ta) ta.value = origCap[vIdx];
      salvarCapituloEdicaoBiblia();
    });

    $('#bibleEditVersesContainer').off('click', '.btn-remove-last-verse').on('click', '.btn-remove-last-verse', function() {
      var base = obterBaseBiblicaPorVersao(bibleEditVersion);
      var origCap = capturarCapituloOriginalSeNecessario(bibleEditVersion, bibleEditBookIdx, bibleEditChapterIdx) || [];
      if (base && base[bibleEditBookIdx] && base[bibleEditBookIdx].chapters[bibleEditChapterIdx]) {
        var ch = base[bibleEditBookIdx].chapters[bibleEditChapterIdx];
        if (ch.length > origCap.length) {
          ch.pop();
          var taList = document.querySelectorAll('#bibleEditVersesContainer textarea.bible-edit-verse-input');
          if (taList.length > ch.length) taList[taList.length - 1].closest('.bible-edit-verse-row').remove();
          salvarCapituloEdicaoBiblia();
        }
      }
    });

    $('#btnSaveBibleChapter').off('click').on('click', function() {
      salvarCapituloEdicaoBiblia();
    });

    $('#btnAddBibleVerse').off('click').on('click', function() {
      adicionarVersiculoEdicaoBiblia();
    });

    $('#btnRestoreBibleChapter').off('click').on('click', function() {
      restaurarCapituloEdicaoBiblia();
    });

    $('#btnExportBibleEdits').off('click').on('click', function() {
      exportarVersaoBibliaJs(bibleEditVersion);
    });
  }
}

ajustarListasDaBiblia();

// ==========================================
// SUBSISTEMA DE BUSCA DE TEXTOS E PASSAGENS BÍBLICAS
// ==========================================
var bibleSearchIndex = { acf: null, nvi: null };
var bibleSearchTimeout = null;
var bibleSearchUIInitialized = false;

var bookAliases = {
  'gn': 0, 'gen': 0, 'genesis': 0,
  'ex': 1, 'exo': 1, 'exodo': 1,
  'lv': 2, 'lev': 2, 'levitico': 2,
  'nm': 3, 'num': 3, 'numeros': 3,
  'dt': 4, 'deu': 4, 'deuteronomio': 4,
  'js': 5, 'jos': 5, 'josue': 5,
  'jz': 6, 'jui': 6, 'juizes': 6,
  'rt': 7, 'rut': 7, 'rute': 7,
  '1sm': 8, '1sam': 8, '1 samuel': 8, '1samuel': 8,
  '2sm': 9, '2sam': 9, '2 samuel': 9, '2samuel': 9,
  '1rs': 10, '1reis': 10, '1 reis': 10,
  '2rs': 11, '2reis': 11, '2 reis': 11,
  '1cr': 12, '1cro': 12, '1cronicas': 12, '1 cronicas': 12,
  '2cr': 13, '2cro': 13, '2cronicas': 13, '2 cronicas': 13,
  'ed': 14, 'esd': 14, 'esdras': 14,
  'ne': 15, 'neem': 15, 'neemias': 15,
  'et': 16, 'est': 16, 'ester': 16,
  'job': 17, 'jo': 17,
  'sl': 18, 'sal': 18, 'salmo': 18, 'salmos': 18,
  'pv': 19, 'prv': 19, 'prov': 19, 'proverbios': 19,
  'ec': 20, 'ecl': 20, 'eclesiastes': 20,
  'ct': 21, 'cant': 21, 'canticos': 21, 'cantares': 21,
  'is': 22, 'isa': 22, 'isaias': 22,
  'jr': 23, 'jer': 23, 'jeremias': 23,
  'lm': 24, 'lam': 24, 'lamentacoes': 24,
  'ez': 25, 'eze': 25, 'ezequiel': 25,
  'dn': 26, 'dan': 26, 'daniel': 26,
  'os': 27, 'ose': 27, 'oseias': 27,
  'jl': 28, 'joe': 28, 'joel': 28,
  'am': 29, 'amo': 29, 'amos': 29,
  'ob': 30, 'oba': 30, 'obadias': 30,
  'jon': 31, 'jonas': 31,
  'mq': 32, 'miq': 32, 'miqueias': 32,
  'na': 33, 'nau': 33, 'naum': 33,
  'hc': 34, 'hab': 34, 'habacuque': 34,
  'sf': 35, 'sof': 35, 'sofonias': 35,
  'ag': 36, 'age': 36, 'ageu': 36,
  'zc': 37, 'zac': 37, 'zacarias': 37,
  'ml': 38, 'mal': 38, 'malaquias': 38,
  'mt': 39, 'mat': 39, 'mateus': 39,
  'mc': 40, 'mar': 40, 'marcos': 40,
  'lc': 41, 'luc': 41, 'lucas': 41,
  'joao': 42, 'jao': 42, 'jn': 42,
  'at': 43, 'ato': 43, 'atos': 43,
  'rm': 44, 'rom': 44, 'romanos': 44,
  '1co': 45, '1cor': 45, '1corintios': 45, '1 corintios': 45,
  '2co': 46, '2cor': 46, '2corintios': 46, '2 corintios': 46,
  'gl': 47, 'gal': 47, 'galatas': 47,
  'ef': 48, 'efe': 48, 'efesios': 48,
  'fp': 49, 'fil': 49, 'filipenses': 49,
  'cl': 50, 'col': 50, 'colossenses': 50,
  '1ts': 51, '1tes': 51, '1tessalonicenses': 51, '1 tessalonicenses': 51,
  '2ts': 52, '2tes': 52, '2tessalonicenses': 52, '2 tessalonicenses': 52,
  '1tm': 53, '1tim': 53, '1timoteo': 53, '1 timoteo': 53,
  '2tm': 54, '2tim': 54, '2timoteo': 54, '2 timoteo': 54,
  'tt': 55, 'tit': 55, 'tito': 55,
  'fm': 56, 'flm': 56, 'filemom': 56,
  'hb': 57, 'heb': 57, 'hebreus': 57,
  'tg': 58, 'tia': 58, 'tiago': 58,
  '1pe': 59, '1ped': 59, '1pedro': 59, '1 pedro': 59,
  '2pe': 60, '2ped': 60, '2pedro': 60, '2 pedro': 60,
  '1jo': 61, '1jn': 61, '1joao': 61, '1 joao': 61,
  '2jo': 62, '2jn': 62, '2joao': 62, '2 joao': 62,
  '3jo': 63, '3jn': 63, '3joao': 63, '3 joao': 63,
  'jd': 64, 'jud': 64, 'judas': 64,
  'ap': 65, 'apo': 65, 'apoc': 65, 'apocalipse': 65
};

for (var bIdxLoop = 0; bIdxLoop < bookNames.length; bIdxLoop++) {
  var normBName = normalizarTextoBuscaBiblica(bookNames[bIdxLoop].name);
  bookAliases[normBName] = bIdxLoop;
  bookAliases[normBName.replace(/\s+/g, '')] = bIdxLoop;
}

function normalizarTextoBuscaBiblica(s) {
  if (!s) return "";
  return s.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function invalidarCacheBuscaBiblica(versao) {
  if (versao) {
    bibleSearchIndex[versao] = null;
  } else {
    bibleSearchIndex.acf = null;
    bibleSearchIndex.nvi = null;
  }
}

function obterIndiceBuscaBiblia(versao) {
  var v = (versao === 'nvi') ? 'nvi' : 'acf';
  if (bibleSearchIndex[v]) return bibleSearchIndex[v];

  var base = obterBaseBiblicaPorVersao(v);
  if (!base || !Array.isArray(base)) return [];

  var index = [];
  for (var b = 0; b < base.length; b++) {
    var bName = (bookNames[b] && bookNames[b].name) ? bookNames[b].name : ((base[b] && base[b].name) ? base[b].name : ("Livro " + (b + 1)));
    var normBName = normalizarTextoBuscaBiblica(bName);
    var chaps = base[b].chapters || [];
    for (var c = 0; c < chaps.length; c++) {
      var verses = chaps[c] || [];
      for (var vIdx = 0; vIdx < verses.length; vIdx++) {
        var text = verses[vIdx] || "";
        var normText = normalizarTextoBuscaBiblica(text);
        index.push({
          b: b,
          c: c,
          v: vIdx,
          bookName: bName,
          chapterNum: c + 1,
          verseNum: vIdx + 1,
          text: text,
          normText: normText,
          normRef: normBName + " " + (c + 1) + " " + (vIdx + 1)
        });
      }
    }
  }
  bibleSearchIndex[v] = index;
  return index;
}

function parsearReferenciaBiblica(query, baseBiblica) {
  if (!query) return null;
  var clean = query.trim();
  var m = clean.match(/^([1-3]?\s*[a-zA-ZÀ-ÿ]+)\s*(\d+)(?:[:,\.\s]+(\d+))?(?:\s*-\s*(\d+))?$/i);
  if (!m) return null;

  var bookRaw = normalizarTextoBuscaBiblica(m[1]);
  var bIdx = (bookAliases[bookRaw] !== undefined) ? bookAliases[bookRaw] : bookAliases[bookRaw.replace(/\s+/g, '')];
  if (bIdx === undefined || bIdx < 0 || bIdx >= 66) return null;

  var chapNum = parseInt(m[2], 10);
  if (isNaN(chapNum) || chapNum < 1 || (bookNames[bIdx] && chapNum > bookNames[bIdx].num_chapters)) return null;
  var cIdx = chapNum - 1;

  var base = baseBiblica || obterBaseBiblicaPorVersao(bibleversion);
  var totalVersos = (base && base[bIdx] && base[bIdx].chapters && base[bIdx].chapters[cIdx]) ? base[bIdx].chapters[cIdx].length : 0;
  if (totalVersos === 0) return null;

  var vFromNum = m[3] ? parseInt(m[3], 10) : 1;
  var vToNum = m[4] ? parseInt(m[4], 10) : (m[3] ? vFromNum : totalVersos);

  if (vFromNum < 1) vFromNum = 1;
  if (vFromNum > totalVersos) vFromNum = totalVersos;
  if (vToNum < vFromNum) vToNum = vFromNum;
  if (vToNum > totalVersos) vToNum = totalVersos;

  return {
    b: bIdx,
    c: cIdx,
    from: vFromNum - 1,
    to: vToNum - 1,
    bookName: bookNames[bIdx].name,
    chapterNum: chapNum,
    fromVerseNum: vFromNum,
    toVerseNum: vToNum,
    isChapterOnly: (!m[3] && !m[4])
  };
}

function destacarTermosBuscaBiblia(texto, terms) {
  if (!texto || !terms || terms.length === 0) return texto || "";
  try {
    var patterns = [];
    for (var i = 0; i < terms.length; i++) {
      var s = terms[i].toLowerCase();
      s = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(/[aáàãâä]/g, '[aáàãâäAÁÀÃÂÄ]');
      s = s.replace(/[eéèêë]/g, '[eéèêëEÉÈÊË]');
      s = s.replace(/[iíìîï]/g, '[iíìîïIÍÌÎÏ]');
      s = s.replace(/[oóòõôö]/g, '[oóòõôöOÓÒÕÔÖ]');
      s = s.replace(/[uúùûü]/g, '[uúùûüUÚÙÛÜ]');
      s = s.replace(/[cç]/g, '[cçCÇ]');
      patterns.push(s);
    }
    var reg = new RegExp('(' + patterns.join('|') + ')', 'gi');
    return (texto + "").replace(reg, function(match) {
      return '<mark class="bg-warning text-dark font-weight-bold px-1 rounded">' + match + '</mark>';
    });
  } catch (e) {
    return texto;
  }
}

function navegarParaPassagemBiblica(bIdx, cIdx, fromIdx, toIdx) {
  var $bookList = (bIdx < 39) ? $('#listaVelho') : $('#listaNovo');
  var $otherList = (bIdx < 39) ? $('#listaNovo') : $('#listaVelho');
  var $bookLi = $bookList.find('li[data-id="' + bIdx + '"]');

  $otherList.find('li.active').removeClass('active');
  $bookList.find('li.active').removeClass('active');
  $bookLi.addClass('active');

  if ($bookLi.length && $bookLi.offset() && $bookList.offset()) {
    var bOffset = $bookLi.offset().top - $bookList.offset().top + $bookList.scrollTop();
    $bookList.scrollTop(Math.max(0, bOffset - 40));
  }

  selectBook($bookLi);

  var $chapLi = $('#listaCapitulo').find('li[data-id="' + cIdx + '"]');
  $('#listaCapitulo > li.active').removeClass('active');
  $chapLi.addClass('active');

  if ($chapLi.length && $chapLi.offset() && $('#listaCapitulo').offset()) {
    var cOffset = $chapLi.offset().top - $('#listaCapitulo').offset().top + $('#listaCapitulo').scrollTop();
    $('#listaCapitulo').scrollTop(Math.max(0, cOffset - 40));
  }

  selectChapter($chapLi);

  if (typeof fromIdx === 'number' && fromIdx >= 0) {
    fromSelected = fromIdx;
    toSelected = (typeof toIdx === 'number' && toIdx >= fromIdx) ? toIdx : fromIdx;

    $('#listaDe > li.active').removeClass('active');
    var $fromLi = $('#listaDe > li[data-id="' + fromSelected + '"]');
    $fromLi.addClass('active');
    if ($fromLi.length && $fromLi.offset() && $('#listaDe').offset()) {
      var fOffset = $fromLi.offset().top - $('#listaDe').offset().top + $('#listaDe').scrollTop();
      $('#listaDe').scrollTop(Math.max(0, fOffset - 40));
    }

    $('#listaAte > li.active').removeClass('active');
    var $toLi = $('#listaAte > li[data-id="' + toSelected + '"]');
    $toLi.addClass('active');
    if ($toLi.length && $toLi.offset() && $('#listaAte').offset()) {
      var tOffset = $toLi.offset().top - $('#listaAte').offset().top + $('#listaAte').scrollTop();
      $('#listaAte').scrollTop(Math.max(0, tOffset - 40));
    }

    biblePreView();
  }
}
window.navegarParaPassagemBiblica = navegarParaPassagemBiblica;

function executarBuscaBiblia() {
  var query = ($('#inputBibleSearch').val() || "").trim();
  var $results = $('#bibleSearchResults');
  var $clearBtn = $('#btnClearBibleSearch');

  if (!query) {
    $results.hide().html("");
    $clearBtn.hide();
    return;
  }

  $clearBtn.show();

  var base = obterBaseBiblicaPorVersao(bibleversion);
  if (!base) {
    $results.show().html('<div class="text-warning p-2"><i class="fas fa-spinner fa-spin"></i> Base bíblica carregando...</div>');
    return;
  }

  var html = [];
  var refMatch = parsearReferenciaBiblica(query, base);

  if (refMatch) {
    var trechoPassagem = "";
    if (base[refMatch.b] && base[refMatch.b].chapters && base[refMatch.b].chapters[refMatch.c]) {
      var vArray = base[refMatch.b].chapters[refMatch.c];
      var snippets = [];
      for (var sIdx = refMatch.from; sIdx <= Math.min(refMatch.to, refMatch.from + 2); sIdx++) {
        if (vArray[sIdx]) snippets.push('<strong>' + (sIdx + 1) + '.</strong> ' + vArray[sIdx]);
      }
      if (refMatch.to > refMatch.from + 2) {
        snippets.push('<span class="text-muted font-italic">... (mais ' + (refMatch.to - refMatch.from - 2) + ' versículos)</span>');
      }
      trechoPassagem = snippets.join(' ');
    }

    var rotuloRef = refMatch.bookName + ' ' + refMatch.chapterNum + (refMatch.isChapterOnly ? ' (Capítulo Completo)' : (':' + refMatch.fromVerseNum + (refMatch.toVerseNum > refMatch.fromVerseNum ? '-' + refMatch.toVerseNum : '')));

    html.push('<div class="card bg-dark border-info text-light mb-2 p-2">');
    html.push('  <div class="d-flex justify-content-between align-items-center mb-1">');
    html.push('    <span><i class="fas fa-bookmark text-info mr-1"></i> <strong class="text-light">' + rotuloRef + '</strong> <span class="badge badge-info text-uppercase">' + bibleversion.toUpperCase() + '</span></span>');
    html.push('    <div>');
    html.push('      <button class="btn btn-sm btn-info btn-view-verse mr-1" data-b="' + refMatch.b + '" data-c="' + refMatch.c + '" data-from="' + refMatch.from + '" data-to="' + refMatch.to + '"><i class="fas fa-eye"></i> Ver</button>');
    html.push('      <button class="btn btn-sm btn-success btn-add-verse-direct" data-b="' + refMatch.b + '" data-c="' + refMatch.c + '" data-from="' + refMatch.from + '" data-to="' + refMatch.to + '"><i class="fas fa-plus"></i> Projetar</button>');
    html.push('    </div>');
    html.push('  </div>');
    if (trechoPassagem) {
      html.push('  <div class="small text-light p-1 rounded" style="background: rgba(0,0,0,0.3);">' + trechoPassagem + '</div>');
    }
    html.push('</div>');
  }

  // Busca textual
  var terms = normalizarTextoBuscaBiblica(query).split(/\s+/).filter(Boolean);
  if (terms.length > 0) {
    var index = obterIndiceBuscaBiblia(bibleversion);
    var matches = [];
    for (var i = 0; i < index.length; i++) {
      var item = index[i];
      var matchesAll = true;
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        if (!item.normText.includes(term) && !item.normRef.includes(term)) {
          matchesAll = false;
          break;
        }
      }
      if (matchesAll) {
        matches.push(item);
        if (matches.length >= 100) break;
      }
    }

    if (matches.length > 0) {
      html.push('<div class="d-flex justify-content-between align-items-center text-muted small mb-1 border-bottom border-secondary pb-1">');
      html.push('  <span><i class="fas fa-list-ul"></i> ' + matches.length + ' versículo(s) encontrado(s) na versão <strong>' + bibleversion.toUpperCase() + '</strong>' + (matches.length >= 100 ? ' (limitado aos 100 primeiros)' : '') + ':</span>');
      html.push('</div>');

      html.push('<div class="bible-search-list">');
      for (var mIdx = 0; mIdx < matches.length; mIdx++) {
        var mItem = matches[mIdx];
        var highlighted = destacarTermosBuscaBiblia(mItem.text, terms);
        html.push('<div class="d-flex justify-content-between align-items-center py-1 border-bottom border-secondary text-light" style="font-size: 0.9rem;">');
        html.push('  <div style="flex: 1; padding-right: 8px;">');
        html.push('    <strong class="text-info">' + mItem.bookName + ' ' + mItem.chapterNum + ':' + mItem.verseNum + '</strong>: ');
        html.push('    <span class="text-light">' + highlighted + '</span>');
        html.push('  </div>');
        html.push('  <div class="text-nowrap">');
        html.push('    <button class="btn btn-sm btn-outline-info btn-view-verse mr-1" data-b="' + mItem.b + '" data-c="' + mItem.c + '" data-from="' + mItem.v + '" data-to="' + mItem.v + '" title="Ver e selecionar"><i class="fas fa-eye"></i></button>');
        html.push('    <button class="btn btn-sm btn-outline-success btn-add-verse-direct" data-b="' + mItem.b + '" data-c="' + mItem.c + '" data-from="' + mItem.v + '" data-to="' + mItem.v + '" title="Adicionar à projeção"><i class="fas fa-plus"></i></button>');
        html.push('  </div>');
        html.push('</div>');
      }
      html.push('</div>');
    } else if (!refMatch) {
      html.push('<div class="text-muted p-3 text-center"><i class="fas fa-search"></i> Nenhum versículo encontrado para "<strong>' + $('<div>').text(query).html() + '</strong>" na versão ' + bibleversion.toUpperCase() + '.</div>');
    }
  }

  $results.html(html.join('\n')).show();
}

function inicializarBuscaBiblicaUI() {
  if (bibleSearchUIInitialized) return;
  bibleSearchUIInitialized = true;

  $('#inputBibleSearch').off('input keyup').on('input keyup', function(e) {
    if (e.which === 27) { // ESC limpa a busca
      $(this).val("");
      executarBuscaBiblia();
      return;
    }
    clearTimeout(bibleSearchTimeout);
    bibleSearchTimeout = setTimeout(function() {
      executarBuscaBiblia();
    }, 150);
  });

  $('#btnClearBibleSearch').off('click').on('click', function() {
    $('#inputBibleSearch').val("");
    executarBuscaBiblia();
    $('#inputBibleSearch').focus();
  });

  $('#bibleSearchResults').off('click', '.btn-view-verse').on('click', '.btn-view-verse', function(e) {
    e.preventDefault();
    var b = parseInt($(this).attr('data-b'), 10);
    var c = parseInt($(this).attr('data-c'), 10);
    var from = parseInt($(this).attr('data-from'), 10);
    var to = parseInt($(this).attr('data-to'), 10);
    navegarParaPassagemBiblica(b, c, from, to);
  });

  $('#bibleSearchResults').off('click', '.btn-add-verse-direct').on('click', '.btn-add-verse-direct', function(e) {
    e.preventDefault();
    var b = parseInt($(this).attr('data-b'), 10);
    var c = parseInt($(this).attr('data-c'), 10);
    var from = parseInt($(this).attr('data-from'), 10);
    var to = parseInt($(this).attr('data-to'), 10);
    var $btn = $(this);

    var biblia = { b: b, c: c, from: from, to: to, type: "b" };
    if (typeof projecao !== 'undefined') {
      projecao.push(biblia);
      if (typeof reloadProjectionList === 'function') {
        reloadProjectionList();
      }
    }

    var originalHtml = $btn.html();
    $btn.removeClass('btn-outline-success btn-success').addClass('btn-light text-dark').html('<i class="fas fa-check text-success"></i>');
    setTimeout(function() {
      $btn.removeClass('btn-light text-dark').addClass('btn-outline-success').html(originalHtml);
    }, 1200);
  });
}