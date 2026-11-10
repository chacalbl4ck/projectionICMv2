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