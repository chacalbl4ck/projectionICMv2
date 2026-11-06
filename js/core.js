var dados = [];
var projecao = [];
var imagens = [];
var avisos = [];
var pastaAtiva = 0;
var louvorAtivo = 0;
var projecaoAtiva = 0;
var windowView;
var iframeView = document.getElementById("iframeProjection").contentWindow;
var viewSlides = "";
var configuracoes = {};
var ref_selected = "0_0";
var telaPadrao = ""; 
var isFirefox = typeof InstallTrigger !== 'undefined';
var fileHandle = null; // Variável global para reter permissão de escrita em disco

// ==========================================
// BANCO DE DADOS LOCAL INDEXEDDB PARA MÍDIAS PESADAS
// ==========================================
const MediaDB = {
    db: null,
    init: function() {
        return new Promise(function(resolve) {
            if (!window.indexedDB) return resolve(null);
            try {
                var req = indexedDB.open("ProjecaoICM_DB", 1);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains("media")) {
                        db.createObjectStore("media", { keyPath: "id" });
                    }
                };
                req.onsuccess = function(e) {
                    MediaDB.db = e.target.result;
                    resolve(MediaDB.db);
                };
                req.onerror = function() {
                    resolve(null);
                };
            } catch(e) {
                resolve(null);
            }
        });
    },
    save: function(id, data) {
        return new Promise(function(resolve) {
            if (!MediaDB.db) return resolve(false);
            try {
                var tx = MediaDB.db.transaction("media", "readwrite");
                var store = tx.objectStore("media");
                store.put({ id: id, data: data, updatedAt: Date.now() });
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { resolve(false); };
            } catch(e) { resolve(false); }
        });
    },
    get: function(id) {
        return new Promise(function(resolve) {
            if (!MediaDB.db) return resolve(null);
            try {
                var tx = MediaDB.db.transaction("media", "readonly");
                var store = tx.objectStore("media");
                var req = store.get(id);
                req.onsuccess = function() { resolve(req.result ? req.result.data : null); };
                req.onerror = function() { resolve(null); };
            } catch(e) { resolve(null); }
        });
    },
    remove: function(id) {
        return new Promise(function(resolve) {
            if (!MediaDB.db) return resolve(false);
            try {
                var tx = MediaDB.db.transaction("media", "readwrite");
                var store = tx.objectStore("media");
                store.delete(id);
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { resolve(false); };
            } catch(e) { resolve(false); }
        });
    }
};
MediaDB.init();

// ==========================================
// FUNÇÕES AUXILIARES DE NORMALIZAÇÃO E MÍDIA
// ==========================================
function normalizarTextoBusca(str) {
    if (!str) return "";
    return str
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/ç/g, "c")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]"\'?¿!¡]/g, " ") // Remove pontuações e parênteses
        .replace(/\s+/g, " ")
        .trim();
}

function isVideoFile(urlOrName) {
    if (!urlOrName) return false;
    var str = urlOrName.toLowerCase();
    return str.includes(".mp4") || str.includes(".avi") || str.startsWith("data:video/");
}

function formatMediaUrl(file) {
    if (!file) return "";
    if (file.startsWith("data:") || file.startsWith("blob:") || file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/")) {
        return file;
    }
    return "imagens/" + file;
}

// Variáveis de controle para o Modal de Recorte e Enquadramento 16:9
var currentCropImage = null;
var currentCropFileName = "";

// ==========================================
// CANAL DE COMUNICAÇÃO NATIVO BROADCASTCHANNEL & ESTADOS DE CULTO
// ==========================================
const projectionBroadcast = ('BroadcastChannel' in window) ? new BroadcastChannel('projecao_icm_channel') : null;
var isBlackout = false;
var isFrozen = false;
var telaoConnected = false;

function broadcastCommand(action, payload) {
    if (projectionBroadcast) {
        try {
            projectionBroadcast.postMessage({ action: action, payload: payload, timestamp: Date.now() });
        } catch (e) {
            console.warn("Erro ao emitir BroadcastChannel", e);
        }
    }

    // Mantém sincronização com a janela externa via postMessage (se estiver aberta)
    if (typeof(windowView) != 'undefined' && windowView != null && !windowView.closed) {
        try {
            windowView.postMessage(JSON.stringify({
                host: 'projection-html5',
                function: action,
                data: payload
            }), "*");
        } catch (e) {}
    }

    // Mantém sincronização com a miniatura interna no painel (iframe)
    if (iframeView) {
        try {
            iframeView.postMessage(JSON.stringify({
                host: 'projection-html5',
                function: action,
                data: payload
            }), "*");
        } catch (e) {}
    }
}

let lastTelaoPong = 0;

if (projectionBroadcast) {
    projectionBroadcast.onmessage = function(event) {
        if (!event.data) return;
        var msg = event.data;
        // Apenas a janela externa real ativa o status de conectado
        if ((msg.action === 'TELAO_READY' || msg.action === 'PONG') && msg.isExternal) {
            lastTelaoPong = Date.now();
            setTelaoStatus(true);
            sincronizarComTelao();
        } else if (msg.action === 'TELAO_CLOSED') {
            setTelaoStatus(false);
        } else if (msg.action === 'REQUEST_SLIDES' || msg.action === 'OBS_READY') {
            broadcastCommand('RELOAD_SLIDES', viewSlides);
            broadcastCommand('CHANGE_SLIDE', projecaoAtiva);
            if (isBlackout) broadcastCommand('BLACKOUT', true);
            if (isFrozen) broadcastCommand('FREEZE', true);
        }
    };
}

// Supervisor de conexão do Telão Externo (executado a cada 1 segundo)
setInterval(function() {
    // 1. Verificação direta se windowView foi aberta por este painel
    if (windowView) {
        if (windowView.closed) {
            if (telaoConnected) {
                setTelaoStatus(false);
            }
            return;
        } else {
            if (!telaoConnected) {
                setTelaoStatus(true);
            }
            return;
        }
    }

    // 2. Se a janela foi aberta de forma independente (outro navegador ou aba externa)
    if (telaoConnected) {
        if (Date.now() - lastTelaoPong > 3500) {
            setTelaoStatus(false);
        }
    }

    // Envia ping pelo canal
    if (projectionBroadcast) {
        try {
            projectionBroadcast.postMessage({ action: 'PING', timestamp: Date.now() });
        } catch (e) {}
    }
}, 1200);

function setTelaoStatus(connected) {
    telaoConnected = connected;
    var icon = document.getElementById('telaoStatusIcon');
    var text = document.getElementById('telaoStatusText');
    var badge = document.getElementById('telaoStatusBadge');
    var btnLaunch = document.getElementById('btnLaunchView');

    if (connected) {
        if (icon) icon.className = "fas fa-circle text-success mr-1";
        if (text) text.innerText = "Telão Conectado";
        if (badge) {
            badge.className = "badge badge-dark border border-success py-1 px-2 text-success font-weight-bold";
            badge.title = "Telão conectado e sincronizado via BroadcastChannel";
        }
        if (btnLaunch) {
            btnLaunch.className = "btn btn-outline-success font-weight-bold";
            btnLaunch.innerHTML = '<i class="fas fa-tv text-success"></i> Telão Ativo';
        }
    } else {
        if (icon) icon.className = "fas fa-circle text-muted mr-1";
        if (text) text.innerText = "Telão Desconectado";
        if (badge) {
            badge.className = "badge badge-secondary py-1 px-2";
            badge.title = "Telão desconectado. Clique para abrir.";
        }
        if (btnLaunch) {
            btnLaunch.className = "btn btn-primary font-weight-bold";
            btnLaunch.innerHTML = '<i class="fas fa-tv"></i> Abrir Telão';
        }
    }
}

function sincronizarComTelao() {
    if (configuracoes && configuracoes.themes) {
        var temaAtivo = configuracoes.themes.find(t => t.id == configuracoes.active_theme);
        if (temaAtivo) {
            broadcastCommand('CHANGE_THEME', temaAtivo.file);
        }
        if (configuracoes.fontSize) {
            broadcastCommand('CHANGE_FONT_SIZE', configuracoes.fontSize);
        }
    }
    if (viewSlides) {
        broadcastCommand('RELOAD_SLIDES', viewSlides);
    }
    if (!isFrozen) {
        broadcastCommand('CHANGE_SLIDE', projecaoAtiva);
    }
    if (isBlackout) {
        broadcastCommand('BLACKOUT', isBlackout);
    }
}

function toggleBlackout() {
    isBlackout = !isBlackout;
    broadcastCommand('BLACKOUT', isBlackout);
    
    if (isBlackout) {
        $('#btnBlackout').addClass('btn-blackout-active');
        $('#alertBlackoutActive').fadeIn(150);
    } else {
        $('#btnBlackout').removeClass('btn-blackout-active');
        $('#alertBlackoutActive').fadeOut(150);
    }
}

function toggleFreeze() {
    isFrozen = !isFrozen;
    
    if (isFrozen) {
        $('#btnFreeze').addClass('btn-freeze-active');
        $('#alertFreezeActive').fadeIn(150);
    } else {
        $('#btnFreeze').removeClass('btn-freeze-active');
        $('#alertFreezeActive').fadeOut(150);
        // Ao descongelar, sincroniza imediatamente o telão com a posição atual do operador
        if (projectionBroadcast) {
            projectionBroadcast.postMessage({ action: 'CHANGE_SLIDE', payload: projecaoAtiva, timestamp: Date.now() });
        }
        if (typeof(windowView) != 'undefined' && windowView != null && !windowView.closed) {
            try {
                windowView.postMessage(JSON.stringify({
                    host: 'projection-html5',
                    function: 'changeSlide',
                    data: projecaoAtiva
                }), "*");
            } catch (e) {}
        }
    }
}

$('#btnBlackout').click(function() {
    toggleBlackout();
});

$('#btnFreeze').click(function() {
    toggleFreeze();
});

// ==========================================
// 1. CARREGAMENTO MODERNO E VÍNCULO DE DISCO
// ==========================================

// Função que pede acesso nativo ao arquivo no disco (File System Access API)
$("#linkFile").click(async function() {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON Database', accept: {'application/json': ['.json']} }]
        });
        const file = await fileHandle.getFile();
        const contents = await file.text();
        atualizaListaArquivos(contents);
        alert("Sucesso! O arquivo data.json foi vinculado. A partir de agora, toda alteração será salva automaticamente no seu disco.");
    } catch (err) {
        console.warn("Seleção cancelada ou erro:", err);
    }
});

// Função que força gravação direta no HD usando a permissão vinculada
async function salvarDiretoNoDisco() {
    if (fileHandle) {
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(dados, null, 2));
            await writable.close();
            return true;
        } catch(e) {
            console.error("Erro ao salvar no disco", e);
            return false;
        }
    }
    return false;
}

async function carregaLouvores() {
    const localData = localStorage.getItem("data");
    if (localData) {
        try {
            atualizaListaArquivos(localData);
            return;
        } catch (e) {
            console.warn("Dados em cache corrompidos, recarregando do arquivo...", e);
            localStorage.removeItem("data");
        }
    }

    try {
        const response = await fetch('data/data.json');
        if (!response.ok) throw new Error("Arquivo não encontrado");
        
        const data = await response.text();
        atualizaListaArquivos(data);
    } catch (error) {
        console.warn("CORS ou leitura local bloqueada. Seleção manual necessária:", error);
        $('#carregarModal').modal('show');
    }
}

$("#filedata").change(function() {
    var file = this.files[0];
    var reader = new FileReader();

    reader.onload = function(event) {
        var contents = event.target.result;
        atualizaListaArquivos(contents);
    }

    reader.readAsText(file); 
    $('#carregarModal').modal('toggle');
});

// ==========================================
// 2. RENDERIZAÇÃO DA ÁRVORE NATIVA
// ==========================================
function criarNoPasta(titulo, itens, tipo, iconePasta, iconeItem, category, folderId) {
    const details = document.createElement('details');
    details.open = false; // Sempre recolhido por padrão na inicialização
    
    const summary = document.createElement('summary');
    summary.innerHTML = `<i class="fas ${iconePasta}"></i> ${titulo}`;
    summary.dataset.tipo = "folder";
    summary.dataset.category = category;
    
    if (folderId !== undefined) {
        summary.dataset.folderId = folderId;
        details.dataset.folderId = folderId; 
    }
    
    summary.addEventListener('click', (e) => {
        document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
        summary.classList.add('selected');
    });

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    itens.forEach((item, index) => {
        const li = document.createElement('li');
        const nomeItem = item.title || item.name; 
        
        var iconeReal = iconeItem;
        if (tipo === 'image') {
            var isVid = (item.type === 'video' || isVideoFile(item.image || item.src));
            iconeReal = isVid ? 'fa-file-video text-info' : 'fa-file-image text-warning';
        }

        li.innerHTML = `<i class="fas ${iconeReal}"></i> ${nomeItem}`;
        li.dataset.tipo = tipo;
        li.dataset.id = index;
        
        const itemIdFormatado = `${tipo === 'song' ? details.dataset.folderId : tipo}_${index}`;
        if (ref_selected === itemIdFormatado) {
            li.classList.add('selected');
        }
        
        li.addEventListener('dblclick', (e) => adicionarAProjecao(e, li, item, tipo, index));
        li.addEventListener('click', (e) => selecionarItemDaLista(e, li, item, tipo, index));
        
        ul.appendChild(li);
    });

    details.appendChild(ul);
    return details;
}

function criarNoPastaComMidias(titulo, songs, media, warnings, folderId) {
    const details = document.createElement('details');
    details.open = false; // Sempre recolhida por padrão
    details.dataset.folderId = folderId;

    const summary = document.createElement('summary');
    summary.innerHTML = `<i class="fas fa-folder"></i> ${titulo}`;
    summary.dataset.tipo = "folder";
    summary.dataset.category = "song";
    summary.dataset.folderId = folderId;

    summary.addEventListener('click', (e) => {
        document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
        summary.classList.add('selected');
    });
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    // 1. Músicas da pasta
    if (songs && songs.length > 0) {
        songs.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-file-alt"></i> ${item.title || "Sem título"}`;
            li.dataset.tipo = "song";
            li.dataset.id = index;
            if (ref_selected === `${folderId}_${index}`) {
                li.classList.add('selected');
            }
            li.addEventListener('dblclick', (e) => adicionarAProjecao(e, li, item, 'song', index));
            li.addEventListener('click', (e) => selecionarItemDaLista(e, li, item, 'song', index));
            ul.appendChild(li);
        });
    }

    // 2. Mídias (imagens / vídeos) colocadas pelo usuário nesta pasta
    if (media && media.length > 0) {
        media.forEach((item, index) => {
            const li = document.createElement('li');
            const isVid = (item.type === 'video' || isVideoFile(item.src || item.image));
            const icon = isVid ? 'fa-file-video text-info' : 'fa-file-image text-warning';
            li.innerHTML = `<i class="fas ${icon}"></i> ${item.name || "Mídia"}`;
            li.dataset.tipo = "media";
            li.dataset.id = index;
            li.dataset.folderId = folderId;
            li.addEventListener('dblclick', (e) => adicionarAProjecao(e, li, item, 'media', index));
            li.addEventListener('click', (e) => {
                document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
            });
            ul.appendChild(li);
        });
    }

    // 3. Avisos colocados pelo usuário nesta pasta
    if (warnings && warnings.length > 0) {
        warnings.forEach((item, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-exclamation-triangle text-warning"></i> ${item.name || "Aviso"}`;
            li.dataset.tipo = "warning";
            li.dataset.id = index;
            li.dataset.folderId = folderId;
            li.addEventListener('dblclick', (e) => adicionarAProjecao(e, li, item, 'warning', index));
            li.addEventListener('click', (e) => {
                document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected');
            });
            ul.appendChild(li);
        });
    }

    details.appendChild(ul);
    return details;
}

function renderizarArvoreNativa(dadosLouvores, listaAvisos, listaImagens) {
    const container = document.getElementById('songList');
    container.innerHTML = ''; 

    if (listaAvisos && listaAvisos.length > 0) {
        const noAvisos = criarNoPasta('Avisos (Geral)', listaAvisos, 'warning', 'fa-clipboard', 'fa-exclamation-triangle', 'warning');
        container.appendChild(noAvisos);
    }

    if (listaImagens && listaImagens.length > 0) {
        const noImagens = criarNoPasta('Mídias (Geral)', listaImagens, 'image', 'fa-film', 'fa-file-image', 'image');
        container.appendChild(noImagens);
    }

    $('#listaDePastas').html("");
    
    // Atualiza opções de pastas nos modais de nova imagem/vídeo e aviso
    $('#selectMediaFolder').html('<option value="-1">📁 Mídias Gerais</option>');
    $('#selectWarningFolder').html('<option value="-1">📋 Pasta Geral de Avisos</option>');

    dadosLouvores.forEach((pasta, indexPasta) => {
        if (pasta.type === "s") {
            const pastaNode = criarNoPastaComMidias(pasta.name, pasta.songs, pasta.media || [], pasta.warnings || [], indexPasta);
            container.appendChild(pastaNode);
        }
        $('#listaDePastas').append('<a class="dropdown-item" data-id="'+indexPasta+'">'+pasta.name+'</a>');
        $('#selectMediaFolder').append('<option value="'+indexPasta+'">📂 '+pasta.name+'</option>');
        $('#selectWarningFolder').append('<option value="'+indexPasta+'">📂 '+pasta.name+'</option>');
    });

    $('#listaDePastas > a').off('click').on('click', function(){
        var pastaSelecionada = parseInt($(this).attr("data-id"));
        dados[pastaSelecionada].songs.push({title: "", content: ""});
        var lastAdded = dados[pastaSelecionada].songs.length - 1;
        ref_selected = pastaSelecionada+"_"+lastAdded; 
        
        atualizaListasFromJSON(dados);
        $('#guias a[href="#edit"]').tab('show');
    });
}

// ==========================================
// 3. AÇÕES DE CLIQUE NA ÁRVORE NATIVA
// ==========================================
function adicionarAProjecao(e, elementoLi, item, tipo, itemId) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (tipo === 'song') {
        const folderId = elementoLi ? elementoLi.closest('details').dataset.folderId : pastaAtiva;
        projecao.push({ id: itemId, folderId: parseInt(folderId), type: "s" });
    } else if (tipo === 'image' || tipo === 'media') {
        let folderId = -1;
        if (elementoLi) {
            const detailsEl = elementoLi.closest('details');
            folderId = detailsEl && detailsEl.dataset.folderId !== undefined ? parseInt(detailsEl.dataset.folderId) : -1;
        } else if (item && item.folderId !== undefined) {
            folderId = parseInt(item.folderId);
        }
        projecao.push({ 
            id: itemId, 
            folderId: folderId, 
            type: "i", 
            mediaItem: item 
        });
    } else if (tipo === 'warning') {
        let folderId = -1;
        if (elementoLi) {
            const detailsEl = elementoLi.closest('details');
            folderId = detailsEl && detailsEl.dataset.folderId !== undefined ? parseInt(detailsEl.dataset.folderId) : -1;
        } else if (item && item.folderId !== undefined) {
            folderId = parseInt(item.folderId);
        }
        projecao.push({ 
            id: itemId, 
            folderId: folderId, 
            type: "w", 
            warningItem: item 
        });
    }
    reloadProjectionList();
}

function selecionarItemDaLista(e, elementoLi, item, tipo, itemId) {
    document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
    elementoLi.classList.add('selected');

    if (tipo === 'song') {
        const folderId = elementoLi.closest('details').dataset.folderId;
        pastaAtiva = parseInt(folderId);
        louvorAtivo = parseInt(itemId);
        ref_selected = pastaAtiva + "_" + louvorAtivo;

        document.getElementById('title').value = item.title;
        document.getElementById('content').value = item.content;
    }
}

function atualizaListaArquivos(newData){
    dados = JSON.parse(newData);
    localStorage.setItem('data', JSON.stringify(dados));
    
    if(localStorage.getItem("warnings") != null)
        avisos = JSON.parse(localStorage.getItem("warnings"));
    
    if(localStorage.getItem("images") != null)
        imagens = JSON.parse(localStorage.getItem("images")); 

    renderizarArvoreNativa(dados, avisos, imagens);
    
    if (dados.length > 0 && dados[0].songs.length > 0) {
        $('#title').val(dados[0].songs[0].title); 
        $('#content').val(dados[0].songs[0].content);
    }
}

function atualizaListasFromJSON(newData){
    dados = newData;
    
    if(localStorage.getItem("warnings") != null)
        avisos = JSON.parse(localStorage.getItem("warnings"));
    
    if(localStorage.getItem("images") != null)
        imagens = JSON.parse(localStorage.getItem("images")); 

    renderizarArvoreNativa(dados, avisos, imagens);
    reloadProjectionList();
}

function reloadProjectionList(){
    if(projecao.length == 0){
        $("#no-projection-msg").show();
    } else {
        $("#no-projection-msg").hide();
    }
    $("#projections tbody").html("");
    $.each(projecao, function(i, item) { 
        if(item.type == "s") $('#projections tbody').append('<tr data-id="'+i+'"><td>'+dados[item.folderId].songs[item.id].title+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>');
        if(item.type == "b") {
            var label = bible[item.b].name+" "+(item.c+1)+":"+(item.from+1);
            if(item.from < item.to) label += "-" + (item.to+1);
            $('#projections tbody').append('<tr data-id="'+i+'"><td>'+label+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'); 
        }
        if(item.type == "i") {
            var mediaName = item.mediaItem ? item.mediaItem.name : (imagens[item.id] ? imagens[item.id].name : "Mídia");
            var isVid = item.mediaItem ? (item.mediaItem.type === 'video' || isVideoFile(item.mediaItem.src || item.mediaItem.image)) : (imagens[item.id] && (imagens[item.id].type === 'video' || isVideoFile(imagens[item.id].image || imagens[item.id].src)));
            var icon = isVid ? 'fa-video text-info' : 'fa-image text-warning';
            $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas '+icon+'"></i>&nbsp;'+mediaName+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'); 
        }
        if(item.type == "w") {
            var aviso = item.warningItem || (item.folderId >= 0 && dados[item.folderId] && dados[item.folderId].warnings ? dados[item.folderId].warnings[item.id] : avisos[item.id]);
            var avisoName = aviso ? (aviso.name || "Aviso") : "Aviso";
            $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-exclamation-triangle text-warning"></i>&nbsp;'+avisoName+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'); 
        }
    }); 
    $(".btn-x").click(function(){
        var id = $(this).closest('tr').attr("data-id");
        projecao.splice(id, 1);
        reloadProjectionList();
    });
    $("#projections tbody tr td:first-child").click(function(){
        var goto = parseInt($(this).attr("data-goto"));
        projecaoAtiva = goto;
        mudaProjecaoAtiva(); 
    });
    generateLiveList(); 
}

$("#btnAbrirConf").click(function(){ 
    $('#confModal').modal('toggle');
});

// ==========================================
// BUSCA AVANÇADA FULL-TEXT (TÍTULO + LETRA/ESTROFES)
// Ignora acentos, ç, vírgulas, pontos e parênteses
// ==========================================
$("#treesearch").on("input keyup", function() {
    var rawQuery = $(this).val();
    var normQuery = normalizarTextoBusca(rawQuery);

    if (normQuery === "") {
        $("#songList details").show();
        $("#songList li").show();
        $("#songList details").prop('open', false); // Mantém todas as pastas recolhidas
        return;
    }

    var terms = normQuery.split(" ").filter(function(t) { return t.length > 0; });

    $("#songList details").each(function() {
        var detailsEl = $(this);
        var folderId = detailsEl.data('folderId') !== undefined ? detailsEl.data('folderId') : detailsEl.attr('data-folder-id');
        var hasVisibleItems = false;

        detailsEl.find('li').each(function() {
            var li = $(this);
            var tipo = li.data('tipo') || li.attr('data-tipo');
            var id = parseInt(li.data('id') !== undefined ? li.data('id') : li.attr('data-id'));
            var isMatch = false;

            if (tipo === 'song' && folderId !== undefined && dados[folderId] && dados[folderId].songs && dados[folderId].songs[id]) {
                var song = dados[folderId].songs[id];
                var normTitle = normalizarTextoBusca(song.title);
                var normContent = normalizarTextoBusca((song.content || "").replace(/<[^>]*>/g, " "));
                var fullText = normTitle + " " + normContent;

                isMatch = terms.every(function(t) { return fullText.includes(t); });
            } else if (tipo === 'media' && folderId !== undefined && dados[folderId] && dados[folderId].media && dados[folderId].media[id]) {
                var media = dados[folderId].media[id];
                var normName = normalizarTextoBusca(media.name);
                isMatch = terms.every(function(t) { return normName.includes(t); });
            } else if (tipo === 'warning') {
                var aviso = (folderId !== undefined && dados[folderId] && dados[folderId].warnings && dados[folderId].warnings[id]) ? dados[folderId].warnings[id] : (avisos && avisos[id] ? avisos[id] : null);
                if (aviso) {
                    var wName = aviso.name || "";
                    var wTitle = (aviso.warning && aviso.warning.content) ? aviso.warning.content.title : (aviso.title || "");
                    var wBody = (aviso.warning && aviso.warning.content) ? aviso.warning.content.body : (aviso.body || "");
                    var fullWarn = normalizarTextoBusca((wName + " " + wTitle + " " + wBody).replace(/<[^>]*>/g, " "));
                    isMatch = terms.every(function(t) { return fullWarn.includes(t); });
                } else {
                    var itemText = normalizarTextoBusca(li.text());
                    isMatch = terms.every(function(t) { return itemText.includes(t); });
                }
            } else {
                var itemText = normalizarTextoBusca(li.text());
                isMatch = terms.every(function(t) { return itemText.includes(t); });
            }

            if (isMatch) {
                li.show();
                hasVisibleItems = true;
            } else {
                li.hide();
            }
        });

        if (hasVisibleItems) {
            detailsEl.show();
            detailsEl.prop('open', true); // Abre a pasta para exibir os resultados encontrados
        } else {
            var folderTitle = normalizarTextoBusca(detailsEl.find('summary').text());
            var folderMatches = terms.every(function(t) { return folderTitle.includes(t); });
            if (folderMatches) {
                detailsEl.show();
                detailsEl.find('li').show();
            } else {
                detailsEl.hide();
                detailsEl.prop('open', false);
            }
        }
    });
});

// ==========================================
// 4. FUNÇÕES DE EXCLUSÃO
// ==========================================
$("#deleteFromTree").click(function(){
    const selecionado = document.querySelector('#songList .selected');
    if(!selecionado) return;

    const tipo = selecionado.dataset.tipo;

    if(tipo === "song"){
        $('#excluirModal').find('.modal-body p').html("Deseja realmente apagar a música <strong>"+selecionado.textContent+"</strong> ?");
    } else if(tipo === "folder") {
        $('#excluirModal').find('.modal-body p').html("Deseja realmente apagar a pasta <strong>"+selecionado.textContent+"</strong> e todo o seu conteúdo ?");
    } else {
        $('#excluirModal').find('.modal-body p').html("Deseja apagar <strong>"+selecionado.textContent+"</strong> ?");
    } 
    $('#excluirModal').modal('toggle');
});

$("#confirmDeleteFromTree").click(function(){
    const selecionado = document.querySelector('#songList .selected');
    if(!selecionado) return;

    const tipo = selecionado.dataset.tipo;
    
    if (tipo === "folder") {
        const cat = selecionado.dataset.category;
        if (cat === "song") {
            const folderId = parseInt(selecionado.dataset.folderId);
            dados.splice(folderId, 1);
        } else if (cat === "warning") {
            avisos = [];
        } else if (cat === "image") {
            imagens = [];
        }
    } else {
        const itemId = parseInt(selecionado.dataset.id);
        if(tipo === "song"){
            const folderId = parseInt(selecionado.closest('details').dataset.folderId);
            dados[folderId].songs.splice(itemId, 1);
        } else if(tipo === "media"){
            const folderId = parseInt(selecionado.dataset.folderId !== undefined ? selecionado.dataset.folderId : selecionado.closest('details').dataset.folderId);
            if (dados[folderId] && dados[folderId].media) {
                dados[folderId].media.splice(itemId, 1);
            }
        } else if(tipo === "image"){
            imagens.splice(itemId, 1);
        } else if(tipo === "warning"){
            const folderId = (selecionado.dataset.folderId !== undefined) ? parseInt(selecionado.dataset.folderId) : (selecionado.closest('details') && selecionado.closest('details').dataset.folderId !== undefined ? parseInt(selecionado.closest('details').dataset.folderId) : -1);
            if (folderId >= 0 && dados[folderId] && dados[folderId].warnings) {
                dados[folderId].warnings.splice(itemId, 1);
            } else {
                avisos.splice(itemId, 1);
            }
        }
    }
    
    ref_selected = "0_0";
    
    try { localStorage.setItem('warnings', JSON.stringify(avisos)); } catch(e){}
    try { localStorage.setItem('images', JSON.stringify(imagens)); } catch(e){}
    try { localStorage.setItem('data', JSON.stringify(dados)); } catch(e){}
    salvarDiretoNoDisco();
    atualizaListasFromJSON(dados); 
    
    if (dados.length > 0 && dados[0].songs.length > 0) {
        $('#title').val(dados[0].songs[0].title); 
        $('#content').val(dados[0].songs[0].content);
    } else {
        $('#title').val(""); 
        $('#content').val("");
    }
    $('#excluirModal').modal('toggle'); 
});

$("#newFolder").click(function(){ 
    $('#makeFolderModal').modal('toggle');
    $('#folderName').val("");
});

$("#confirmMakeFolder").click(function(){ 
    var name = $('#folderName').val();
    dados.push({name: name, type: "s", lang: "pt", songs: []});
    atualizaListasFromJSON(dados);
    $('#makeFolderModal').modal('toggle');
});

$("#btnRenameFolder").click(function(){ 
    const selecionado = document.querySelector('#songList .selected');
    if (!selecionado) {
        alert("Por favor, selecione uma pasta para renomear.");
        return;
    }

    let folderId = undefined;
    const tipo = selecionado.dataset.tipo;
    if (tipo === "folder") {
        if (selecionado.dataset.category !== "song" || selecionado.dataset.folderId === undefined) {
            alert("Apenas pastas personalizadas podem ser renomeadas.");
            return;
        }
        folderId = parseInt(selecionado.dataset.folderId);
    } else {
        const details = selecionado.closest('details');
        if (details && details.dataset.folderId !== undefined) {
            folderId = parseInt(details.dataset.folderId);
        }
    }

    if (folderId === undefined || isNaN(folderId) || !dados[folderId]) {
        alert("Por favor, selecione uma pasta personalizada para renomear.");
        return;
    }

    $('#renameFolderModal').data('folderId', folderId);
    $('#renameFolderInput').val(dados[folderId].name);
    $('#renameFolderModal').modal('show');
});

$("#confirmRenameFolder").click(async function(){ 
    const folderId = $('#renameFolderModal').data('folderId');
    const novoNome = $('#renameFolderInput').val().trim();

    if (!novoNome) {
        alert("O nome da pasta não pode ficar vazio.");
        return;
    }

    if (folderId !== undefined && dados[folderId]) {
        dados[folderId].name = novoNome;
        try { localStorage.setItem('data', JSON.stringify(dados)); } catch(e){}
        await salvarDiretoNoDisco();
        atualizaListasFromJSON(dados);
        $('#renameFolderModal').modal('hide');
    }
});

// ==========================================
// 5. BOTÃO SALVAR COM AUTO-SAVE EM DISCO
// ==========================================
$("#save").click(async function(){
    dados[pastaAtiva].songs[louvorAtivo].title = $("#title").val();
    dados[pastaAtiva].songs[louvorAtivo].content = $("#content").val();
    ref_selected = pastaAtiva+"_"+louvorAtivo;
    
    atualizaListasFromJSON(dados);
    localStorage.setItem('data', JSON.stringify(dados)); 
    
    // Tenta salvar direto no disco se houver permissão concedida
    let gravado = await salvarDiretoNoDisco();
    
    if(gravado) {
        $("#msgSave").removeClass('alert-warning').addClass('alert-success');
        $("#msgSaveText").html("Louvor atualizado e <strong>salvo automaticamente no disco!</strong>");
    } else {
        $("#msgSave").removeClass('alert-success').addClass('alert-warning');
        $("#msgSaveText").html("Louvor atualizado no cache. <strong>Você precisa exportar para gravar fisicamente</strong> ou usar a opção de vincular arquivo.");
    }
    
    $("#msgSave").show();
});

$("#export").click(function(){
    $("<a />", {
        "download": "data.json",
        "href" : "data:application/json," + encodeURIComponent(JSON.stringify(dados))
    }).appendTo("body")
    .click(function() {
        $(this).remove()
    })[0].click() 
});

$("#import").click(function(){
    $('#importModal').modal('toggle');
});

$("#fileImport").change(function() {
    var file = this.files[0];
    var reader = new FileReader();

    reader.onload = function(event) {
        var contents = event.target.result;
        atualizaListaArquivos(contents);
    }
    reader.readAsText(file); 
    $('#importModal').modal('toggle')
});

$("#btnCreateWarn").click(function(){
    $('#warningModalTitle').html('<i class="fas fa-exclamation-triangle mr-1"></i> Novo Aviso');
    $('#warningName').val('');
    $('#newWarningModal .warning-title').html('Aviso');
    $('#newWarningModal .warning-body').html('Digite o conteúdo do aviso aqui...');
    $('#editingWarningIndex').val('-1');
    $('#editingWarningFolderId').val('-1');

    const selecionado = document.querySelector('#songList .selected');
    if (selecionado) {
        let folderId = selecionado.dataset.folderId;
        if (folderId === undefined) {
            let details = selecionado.closest('details');
            if (details) folderId = details.dataset.folderId;
        }
        if (folderId !== undefined && parseInt(folderId) >= 0) {
            $('#selectWarningFolder').val(folderId);
        } else {
            $('#selectWarningFolder').val('-1');
        }
    } else {
        $('#selectWarningFolder').val('-1');
    }

    $('#newWarningModal').find('.modal-body').css({
        width:'auto', height:'auto', 'max-height':'100%'
    });
    $('#newWarningModal').modal('show');
});

$("#btnEditWarning").click(function(){
    const selecionado = document.querySelector('#songList .selected');
    if (!selecionado) {
        alert("Por favor, selecione um aviso na lista para editar.");
        return;
    }

    if (selecionado.dataset.tipo !== "warning") {
        alert("O item selecionado não é um aviso. Por favor, clique sobre um aviso para editar.");
        return;
    }

    const itemId = parseInt(selecionado.dataset.id);
    let folderId = -1;
    if (selecionado.dataset.folderId !== undefined) {
        folderId = parseInt(selecionado.dataset.folderId);
    } else {
        let details = selecionado.closest('details');
        if (details && details.dataset.folderId !== undefined) {
            folderId = parseInt(details.dataset.folderId);
        }
    }

    let aviso = null;
    if (folderId >= 0 && dados[folderId] && dados[folderId].warnings && dados[folderId].warnings[itemId]) {
        aviso = dados[folderId].warnings[itemId];
    } else if (avisos && avisos[itemId]) {
        aviso = avisos[itemId];
        folderId = -1;
    }

    if (!aviso) {
        alert("Aviso não encontrado.");
        return;
    }

    var avisoName = aviso.name || "";
    var avisoTitle = (aviso.warning && aviso.warning.content) ? aviso.warning.content.title : (aviso.title || "Aviso");
    var avisoBody = (aviso.warning && aviso.warning.content) ? aviso.warning.content.body : (aviso.body || "");

    $('#warningModalTitle').html('<i class="fas fa-pencil-alt mr-1"></i> Editar Aviso');
    $('#warningName').val(avisoName);
    $('#selectWarningFolder').val(folderId);
    $('#editingWarningIndex').val(itemId);
    $('#editingWarningFolderId').val(folderId);

    $('#newWarningModal .warning-title').html(avisoTitle);
    $('#newWarningModal .warning-body').html(avisoBody);

    $('#newWarningModal').find('.modal-body').css({
        width:'auto', height:'auto', 'max-height':'100%'
    });
    $('#newWarningModal').modal('show');
});

$("#confirmCreateWarning").click(async function(){ 
    var name = $('#warningName').val().trim();
    var title = $('.warning-title').html();
    var body = $('.warning-body').html();
    var content = {title: title, body: body};
    var targetFolderId = parseInt($('#selectWarningFolder').val());
    var editIdx = parseInt($('#editingWarningIndex').val());
    var origFolderId = parseInt($('#editingWarningFolderId').val());

    if (!name) {
        name = title ? title.replace(/<[^>]*>/g, '').trim() : "Aviso";
    }

    var warningObj = {
        name: name,
        warning: {
            content: content,
            type: "regular"
        }
    };

    if (editIdx >= 0) {
        // Se estava editando, remove da pasta de origem
        if (origFolderId >= 0 && dados[origFolderId] && dados[origFolderId].warnings) {
            dados[origFolderId].warnings.splice(editIdx, 1);
        } else if (avisos && avisos[editIdx]) {
            avisos.splice(editIdx, 1);
        }

        // Insere na pasta de destino escolhida
        if (targetFolderId >= 0 && dados[targetFolderId]) {
            if (!dados[targetFolderId].warnings) dados[targetFolderId].warnings = [];
            dados[targetFolderId].warnings.push(warningObj);
        } else {
            avisos.push(warningObj);
        }
    } else {
        // Novo aviso
        if (targetFolderId >= 0 && dados[targetFolderId]) {
            if (!dados[targetFolderId].warnings) dados[targetFolderId].warnings = [];
            dados[targetFolderId].warnings.push(warningObj);
        } else {
            avisos.push(warningObj);
        }
    }

    try { localStorage.setItem('warnings', JSON.stringify(avisos)); } catch(e){}
    try { localStorage.setItem('data', JSON.stringify(dados)); } catch(e){}
    await salvarDiretoNoDisco();
    atualizaListasFromJSON(dados);

    $('#newWarningModal').modal('hide');
});

$("#btnLaunchView").click(function(){
    startProjection(); 
});

$("#btnLaunchObs").click(function(){
    window.open("obs.html", "OBS_Projection", "width=1920,height=1080");
});

$("#newImage").click(function(){
    $('#newImageModal').modal('toggle');
});

$("#confirmCreateImage").click(function(){ 
    var name = $('#imageName').val().trim();
    var file = $("#fileimage").prop('files')[0];
    var targetFolderId = parseInt($('#selectMediaFolder').val());

    if (!file) {
        alert("Por favor, selecione um arquivo de imagem ou vídeo.");
        return;
    }
    if (!name) {
        name = file.name.replace(/\.[^/.]+$/, "");
    }

    var isVid = isVideoFile(file.name) || (file.type && file.type.startsWith("video/"));

    if (isVid && file.size > 10 * 1024 * 1024) {
        alert("O vídeo selecionado possui " + (file.size / (1024 * 1024)).toFixed(1) + " MB. O limite máximo permitido para vídeos é de 10 MB.");
        return;
    }

    var reader = new FileReader();
    reader.onload = async function(e) {
        var dataUrl = e.target.result;
        var mediaObj = {
            id: "media_" + Date.now(),
            name: name,
            type: isVid ? "video" : "image",
            src: dataUrl,
            image: dataUrl
        };

        await MediaDB.save(mediaObj.id, dataUrl);

        if (targetFolderId >= 0 && dados[targetFolderId]) {
            if (!dados[targetFolderId].media) dados[targetFolderId].media = [];
            dados[targetFolderId].media.push(mediaObj);
            try { localStorage.setItem('data', JSON.stringify(dados)); } catch(err){}
            salvarDiretoNoDisco();
        } else {
            imagens.push(mediaObj);
            try { localStorage.setItem('images', JSON.stringify(imagens)); } catch(err){}
        }

        atualizaListasFromJSON(dados);
        $('#newImageModal').modal('hide');
        $('#imageName').val('');
        $('#fileimage').val('');
    };
    reader.readAsDataURL(file);
});

// ==========================================
// VISUALIZADOR DE MÍDIAS (IMAGENS E VÍDEOS)
// ==========================================
async function exibirVisualizadorMidia(mediaItem, tipo, itemId, folderId) {
    if (!mediaItem) return;

    var src = mediaItem.src || mediaItem.image || "";
    if (!src && mediaItem.id) {
        src = await MediaDB.get(mediaItem.id) || "";
    }

    var isVid = (mediaItem.type === "video" || isVideoFile(src) || isVideoFile(mediaItem.name));
    var videoEl = document.getElementById('mediaViewerVideo');

    if (isVid) {
        $('#mediaViewerImg').hide().attr('src', '');
        if (videoEl) {
            videoEl.src = src;
            $(videoEl).show();
            videoEl.play().catch(function(){});
        }
        $('#mediaViewerInfo').text("Vídeo • " + (mediaItem.name || "Vídeo"));
    } else {
        if (videoEl) {
            videoEl.pause();
            videoEl.src = '';
            $(videoEl).hide();
        }
        $('#mediaViewerImg').attr('src', src).show();
        $('#mediaViewerInfo').text("Imagem • " + (mediaItem.name || "Imagem"));
    }

    $('#mediaViewerTitle').text(mediaItem.name || "Visualizador de Mídia");

    $('#btnAddToProjFromViewer').off('click').on('click', function() {
        adicionarAProjecao(null, null, mediaItem, tipo, itemId);
        $('#mediaViewerModal').modal('hide');
    });

    $('#mediaViewerModal').modal('show');
}

$('#mediaViewerModal').on('hidden.bs.modal', function() {
    var videoEl = document.getElementById('mediaViewerVideo');
    if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
    }
    $('#mediaViewerImg').attr('src', '');
});

$("#btnPreviewMedia").click(async function(){
    const selecionado = document.querySelector('#songList .selected');
    if (!selecionado) {
        alert("Por favor, selecione uma imagem ou vídeo na lista para visualizar.");
        return;
    }

    const tipo = selecionado.dataset.tipo;
    if (tipo !== 'media' && tipo !== 'image') {
        alert("O item selecionado não é uma mídia. Selecione uma imagem ou vídeo para visualizar.");
        return;
    }

    const itemId = parseInt(selecionado.dataset.id);
    let mediaItem = null;
    let folderId = undefined;

    if (tipo === 'media') {
        folderId = parseInt(selecionado.dataset.folderId !== undefined ? selecionado.dataset.folderId : selecionado.closest('details').dataset.folderId);
        if (dados[folderId] && dados[folderId].media && dados[folderId].media[itemId]) {
            mediaItem = dados[folderId].media[itemId];
        }
    } else if (tipo === 'image') {
        if (imagens && imagens[itemId]) {
            mediaItem = imagens[itemId];
        }
    }

    if (!mediaItem) {
        alert("Mídia não encontrada.");
        return;
    }

    await exibirVisualizadorMidia(mediaItem, tipo, itemId, folderId);
});

// ==========================================
// 6. ENCAIXE AUTOMÁTICO DE TEXTO NA TELA
// ==========================================
function generateLiveList(){ 
    var telaPadraoPainel = '<td>Tela Padrão</td><td></td>';
    $("#livesongs tbody").html(""); 
    $('#livesongs tbody').append('<tr data-id="0">'+telaPadraoPainel+'</tr>');
    viewSlides="<section"+getBackgroundForSection(1)+telaPadrao;
    var f = 1;
    
    $.each(projecao, function(i, item) { 
        if(item.type == "s"){
            var lang = "";
            var parsed = dados[item.folderId].songs[item.id].content.split('\n\n');
            $.each(parsed, function(j, estrofe) { 
                var estrofeEsp = estrofe.replace(/\n/g,"<br>");
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+dados[item.folderId].songs[item.id].title+'</td><td>'+estrofeEsp+'</td></tr>');
                
                let charCount = estrofe.length;
                let fontSizePercent = 100;
                
                if (charCount > 350) fontSizePercent = 60;
                else if (charCount > 250) fontSizePercent = 75;
                else if (charCount > 150) fontSizePercent = 90;
                
                var estrofeFormatada = `<div style="font-size: ${fontSizePercent}%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; width: 100%;">${estrofeEsp}</div>`;

                var fimState = "";
                var fimStyle = "";
                if(j+1 == parsed.length){
                    fimState = " showfim";
                    fimStyle = "<style>.showfim footer{ display: block; }</style>\n" 
                } 
                if(j == 0){
                    if(dados[item.folderId].songs[item.id].title.length > 32){
                        var titulodividido = dados[item.folderId].songs[item.id].title.split(" ");
                        var indexDivision = Math.round(titulodividido.length/2);
                        var nome = dados[item.folderId].songs[item.id].title.replace(titulodividido[indexDivision],titulodividido[indexDivision]+"<br>");
                        viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo:before { content: \""+nome.split("<br>")[0]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo:after { content: \""+nome.split("<br>")[1]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+"{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #titulo{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2"+lang+" #logo{ display: table; }</style>\n"+fimStyle; 
                    } else {
                        viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+" #titulo:after { content: \""+dados[item.folderId].songs[item.id].title+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+"{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle"+lang+" #logo{ display: table; }</style>\n"+fimStyle;
                    } 
                    $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
                } else {
                    viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showlogo"+item.folderId+"_"+item.id+"_"+j+fimState+"\" data-background-transition=\"none\">\n<style>\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo"+lang+"{ display: block; }\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo"+lang+" #logo{ display: block; }</style>\n"+fimStyle;
                }
                
                viewSlides+=estrofeFormatada+"\n</section>\n";
                f++;
            });
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao;
        }
        
        if(item.type == "b"){
            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            if (typeof bible !== 'undefined' && bible && bible[item.b] && bible[item.b].chapters && bible[item.b].chapters[item.c]) {
                for (var vIdx = item.from; vIdx <= item.to; vIdx++) {
                    var label = bible[item.b].name+" "+(item.c+1)+":"+(vIdx+1);
                    var scripture = bible[item.b].chapters[item.c][vIdx];
                    var refverse = "b"+item.b+"c"+item.c+"v"+vIdx;
                    $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+label+'</td><td>'+scripture+'</td></tr>');
                    viewSlides+="<section"+getBackgroundForSection(3)+" data-state=\"scriptures "+refverse+"\" data-background-transition=\"none\">\n<style>\n."+refverse+" footer.scripturetitle small:after{ content: \""+label+"\"; }\n."+refverse+" footer.scripturetitle{ display: block; }\n</style>\n<p>"+scripture+"</p>\n</section>\n";
                    f++;
                }
            } else {
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td>Texto Bíblico</td><td>Carregando Bíblia...</td></tr>');
                viewSlides+="<section"+getBackgroundForSection(3)+">\n<p>Carregando Texto Bíblico...</p>\n</section>\n";
                f++;
            }
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao; 
        }
        
        if(item.type == "i"){
            var media = item.mediaItem || (item.folderId >= 0 && dados[item.folderId] && dados[item.folderId].media ? dados[item.folderId].media[item.id] : imagens[item.id]);
            var mediaSrc = media ? (media.src || media.image || "") : "";
            var mediaName = media ? (media.name || "Mídia") : "Mídia";
            var isVid = media ? (media.type === "video" || isVideoFile(mediaSrc)) : false;

            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            
            if (isVid) {
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-video text-info"></i>&nbsp;'+mediaName+'</td><td><video style="max-height: 80px; max-width: 130px; border-radius: 4px;" src="'+mediaSrc+'" muted></video></td></tr>');
                viewSlides+="<section data-background=\"#000000\">\n<video controls autoplay loop playsinline style=\"max-width: 100%; max-height: 100vh; margin: auto; display: block;\" src=\""+mediaSrc+"\"></video>\n</section>\n";
            } else {
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-image text-warning"></i>&nbsp;'+mediaName+'</td><td><img class="responsive-img" src="'+mediaSrc+'" style="max-height: 80px; max-width: 130px; object-fit: contain; border-radius: 4px;"></td></tr>');
                viewSlides+="<section data-background=\"#000000\">\n<img style=\"max-width: 100%; max-height: 100vh; object-fit: contain; margin: auto; display: block;\" src=\""+mediaSrc+"\">\n</section>\n";
            }

            f++;
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao; 
        }
        
        if(item.type == "w"){
            var aviso = item.warningItem || (item.folderId >= 0 && dados[item.folderId] && dados[item.folderId].warnings ? dados[item.folderId].warnings[item.id] : avisos[item.id]);
            var avisoName = aviso ? (aviso.name || "Aviso") : "Aviso";
            var avisoTitle = (aviso && aviso.warning && aviso.warning.content) ? aviso.warning.content.title : (aviso ? aviso.title : "Aviso");
            var avisoBody = (aviso && aviso.warning && aviso.warning.content) ? aviso.warning.content.body : (aviso ? aviso.body : "");

            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-exclamation-triangle text-warning"></i>&nbsp;'+avisoName+'</td><td><strong>'+avisoTitle+'</strong><br>'+avisoBody+'</td></tr>');
            viewSlides+="<section data-background=\"imagens/madeira_bg.jpg\">\n<table class=\"reveal warning-table\">\n<tr height=\"10vh\">\n<td class=\"warning-title\" width=\"80%\">"+avisoTitle+"</td>\n<td width=\"20%\"><div id=\"fancypart\" class=\"warning-logo\"><i class=\"icon-logo_bold\"></i></div></td>\n</tr>\n<tr>\n<td colspan=\"2\">\n<div style=\"display: table;\">\n<div class=\"warning-body\">"+avisoBody+"</div>\n</div>\n</td>\n</tr>\n</table>\n</section>\n";
            f++;
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao; 
        }
    });

    $('#livesongs > tbody > tr').click(function() { 
        $( this ).parent().find( 'tr.active' ).removeClass( 'active' );
        $( this ).addClass( 'active' );
        projecaoAtiva = parseInt($(this).attr("data-id"));
        mudaSlide();
    });

    projecaoAtiva = 0;
    mudaProjecaoAtiva();
    updateViewSlides();
}

function updateViewSlides(){
    broadcastCommand('RELOAD_SLIDES', viewSlides);
}

function mudaProjecaoAtiva(){
    $('#livesongs > tbody > tr.active').removeClass( 'active' );
    $('#livesongs > tbody > tr[data-id="'+projecaoAtiva+'"]').addClass( 'active' );
    $('#scrollblock').scrollTop(
        $('#livesongs > tbody > tr[data-id="'+projecaoAtiva+'"]').offset().top - $('#scrollblock').offset().top + $('#scrollblock').scrollTop()
    ); 
    mudaSlide();
}

function mudaSlide(){
    // A miniatura interna no iframe sempre acompanha a navegação do operador
    if (iframeView) {
        try {
            iframeView.postMessage(JSON.stringify({
                host: 'projection-html5',
                function: 'changeSlide',
                data: projecaoAtiva
            }), "*");
        } catch (e) {}
    }

    // Se estiver em modo CONGELADO (Freeze), não propaga a troca de slide para o telão
    if (!isFrozen) {
        if (projectionBroadcast) {
            try {
                projectionBroadcast.postMessage({ action: 'CHANGE_SLIDE', payload: projecaoAtiva, timestamp: Date.now() });
            } catch (e) {}
        }
        if (typeof(windowView) != 'undefined' && windowView != null && !windowView.closed) {
            try {
                windowView.postMessage(JSON.stringify({
                    host: 'projection-html5',
                    function: 'changeSlide',
                    data: projecaoAtiva
                }), "*");
            } catch (e) {}
        }
    }
}

$(document).on('keydown', function(e) {
    var rows = $('#livesongs > tbody > tr');
    var tag = e.target.tagName.toLowerCase();
    var isInput = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    var tabName = $('#guias a[aria-selected="true"]').attr('aria-controls');
    
    // Atalhos Rápidos Globais de Culto (quando o operador não está digitando em campos de texto)
    if (!isInput) {
        // Tecla B: Alterna Blackout instantâneo
        if (e.keyCode === 66 || e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            toggleBlackout();
            return;
        }
        // Tecla F: Alterna Congelamento (Freeze)
        if (e.keyCode === 70 || e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            toggleFreeze();
            return;
        }
    }

    if (tabName == "live" && !isInput){
        switch(e.keyCode) {
            case 37: // left
                if(projecaoAtiva > 0){
                    projecaoAtiva--;
                    mudaProjecaoAtiva();
                } 
                break;
            case 38: // up
                if(projecaoAtiva > 0){
                    projecaoAtiva--;
                    mudaProjecaoAtiva();
                } 
                break;
            case 39: // right
                if(rows.length > projecaoAtiva + 1){
                    projecaoAtiva++;
                    mudaProjecaoAtiva();
                } 
                break; 
            case 40: // down
                if(rows.length > projecaoAtiva + 1){
                    projecaoAtiva++;
                    mudaProjecaoAtiva();
                } 
                break; 
            case 27: // esc
                projecaoAtiva = 0;
                mudaProjecaoAtiva();
                break; 
            default: return;
        }
        e.preventDefault();
    }

    if ((e.ctrlKey || e.metaKey) && tabName == "edit") {
        switch (String.fromCharCode(e.which).toLowerCase()) {
            case 's':
                e.preventDefault();
                $("#save").click()
                break;
        }
    }
});

$(window).keypress(function(event) {
    if (!(event.which == 115 && event.ctrlKey) && !(event.which == 19)) return true;
    event.preventDefault();
    return false;
});

// ==========================================
// 7. DETECÇÃO DE POPUP BLOQUEADO E ABERTURA AUTOMÁTICA
// ==========================================
var popupBloqueado = false;

function startProjection() { 
    if (typeof(windowView) =='undefined' || windowView == null || windowView.closed) {
        windowView = window.open("view.html", "_blank", "directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,channelmode=yes, fullscreen=yes");
        
        // Se após tentar abrir o objeto não existir ou continuar fechado, o bloqueador agiu.
        if(!windowView || windowView.closed || typeof windowView.closed == 'undefined') {
            popupBloqueado = true;
            document.getElementById("loader").style.display = "none";
            document.querySelector("#loading h5").innerHTML = `
                <div class="card bg-dark text-white border-warning shadow-lg p-3" style="max-width: 500px; margin: 0 auto;">
                    <div class="card-body text-center p-3">
                        <div style="font-size: 2.5rem; margin-bottom: 10px;">⚠️</div>
                        <h4 class="text-warning font-weight-bold mb-3">Permissão de Abertura do Telão</h4>
                        <p class="mb-3" style="font-size: 0.95rem; line-height: 1.5; color: #e0e0e0;">
                            O seu navegador bloqueou a abertura automática da tela de projeção.<br>
                            Por favor, clique no ícone de pop-up na barra de navegação acima e escolha <strong>"Sempre permitir pop-ups para esta página"</strong>.
                        </p>
                        <button class="btn btn-warning btn-lg px-4 mt-2 font-weight-bold" onclick="location.reload()">
                            <i class="fas fa-redo"></i> Já Permiti. Recarregar Sistema
                        </button>
                    </div>
                </div>
            `;
            showLoading(); 
            return false;
        } else {
            popupBloqueado = false;
            setTelaoStatus(true);
            setTimeout(function() {
                sincronizarComTelao();
            }, 600);
        }
    } else {
        windowView.focus();
    }
    return true;
}

$('#startProjection').click(function(){
    startProjection();
});


// ==========================================
// 8. FERRAMENTAS WYSIWYG DA TEXTAREA
// ==========================================
$('#rplYI').click(function(){
    $('#content').selection('insert', {text: '<font color="yellow"><i>', mode: 'before'}).selection('insert', {text: '</i></font>', mode: 'after'});
});

$('#rplBis').click(function(){
    $('#content').selection('insert', {text: '<blockquote class="chave-bis">', mode: 'before'}).selection('insert', {text: '</blockquote>', mode: 'after'});
});

$('#rplBis-small').click(function(){
    $('#content').selection('insert', {text: '<blockquote class="chave-bis-small">', mode: 'before'}).selection('insert', {text: '</blockquote>', mode: 'after'});
});

$('.rplanyx').click(function(){
    var times = $(this).attr("data-times");
    $('#content').selection('insert', {text: '<blockquote class="chave-'+times+'">', mode: 'before'}).selection('insert', {text: '</blockquote>', mode: 'after'});
});

// Novas Injeções 
$('#btnCoro').click(function(){
    $('#content').selection('insert', {text: '<font color="yellow"><i>CORO</i></font>\n', mode: 'before'});
});

$('#btnFinal').click(function(){
    $('#content').selection('insert', {text: '<font color="yellow"><i>FINAL:</i></font>\n', mode: 'before'});
});

$('#btnContracanto').click(function(){
    $('#content').selection('insert', {text: '<i><font color="#00ff00">', mode: 'before'}).selection('insert', {text: '</font></i>', mode: 'after'});
});

$("#btnAbout").click(function(){
    var title = '<i class="fas fa-info-circle mr-1"></i> Sobre o Projeção ICM';
    $('#modalNotImplemented .modal-content').addClass('text-light bg-dark');
    $('#modalNotImplemented .modal-header .close').addClass('text-light');
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-header > h5').html(title);
    var bodyHtml = `
      <div class="p-1">
        <h5 class="text-warning mb-2"><i class="fas fa-desktop mr-1"></i> Projeção ICM HTML5 <span class="badge badge-warning text-dark ml-1">v2.0.0</span></h5>
        <p class="mb-3 text-light">Sistema avançado de projeção e transmissão de louvores, textos bíblicos e avisos para cultos.</p>
        
        <div class="card bg-secondary text-light p-3 mb-3 border-0">
          <p class="mb-1 font-weight-bold"><i class="fas fa-users-cog mr-1 text-info"></i> Manutenção e Desenvolvimento (v2.0.0):</p>
          <p class="mb-2 text-warning small font-weight-bold"><i class="fas fa-church mr-1"></i> ICM - Leopoldina / MG</p>
          
          <div class="border-top border-dark pt-2 mb-2">
            <p class="mb-1 font-weight-bold"><i class="fas fa-user mr-1 text-info"></i> Caio Monteiro</p>
            <div class="pl-3 small">
              <p class="mb-1"><i class="fas fa-envelope text-warning fa-fw"></i> <a href="mailto:caiormleo@outlook.com.br" class="text-info font-weight-bold">caiormleo@outlook.com.br</a></p>
              <p class="mb-0"><i class="fab fa-github text-warning fa-fw"></i> <a href="https://github.com/chacalbl4ck" target="_blank" rel="noopener noreferrer" class="text-info font-weight-bold">chacalbl4ck</a></p>
            </div>
          </div>

          <div class="border-top border-dark pt-2">
            <p class="mb-1 font-weight-bold"><i class="fas fa-user mr-1 text-info"></i> André Castilho</p>
            <div class="pl-3 small">
              <p class="mb-0"><i class="fas fa-envelope text-warning fa-fw"></i> <a href="mailto:atendimento@amcast.com.br" class="text-info font-weight-bold">atendimento@amcast.com.br</a></p>
            </div>
          </div>
        </div>

        <div class="border-top border-secondary pt-2 text-muted small">
          <p class="mb-1"><strong>Desenvolvido originalmente por:</strong> Ítalo Carvalho Zaina</p>
          <p class="mb-0"><strong>Revisores originais:</strong> Ítalo, Sinvaldo, Geff</p>
        </div>
      </div>
    `;
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-body').html(bodyHtml);
    $('#modalNotImplemented').modal('show');
});

function setTelaPadraoHtml(tipo) {
    if (tipo === 1) {
        telaPadrao = ">\n<h1>MARANATA</h1>\n<h3>O Senhor Jesus vem!</h3>\n</section>\n";
    } else if (tipo === 2) {
        telaPadrao = " data-state=\"show_backlay1\">\n<style>\n.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display: block}\n</style>\n<h1>Santa Ceia</h1><br>\n</section>\n";
    } else {
        telaPadrao = ">\n</section>\n";
    }
}

function defaultConfigurations(){
    if(localStorage.getItem("settings") === null){ 
        configuracoes = {
            images: [
                {file: "fundo.jpg"},
                {file: "campo-uva.jpg"},
                {file: "madeira_bg.jpg"}
            ],
            themes: [
                {id: 1, name: "Padrão Azul", file: "icm"},
                {id: 2, name: "Santa Ceia", file: "ceia"}
            ],
            active_theme: 1,
            backgrounds: [
                { id: 1, type: 1, color: "#000000", image_file: "fundo.jpg" },
                { id: 2, type: 1, color: "#000000", image_file: "fundo.jpg" },
                { id: 3, type: 2, color: "#000000", image_file: "madeira_bg.jpg" }
            ],
            fontSize: 2,
            telaPadraoTexto: 1 
        }; 
        localStorage.setItem('settings', JSON.stringify(configuracoes));
    } else {
        configuracoes = JSON.parse(localStorage.getItem("settings"));
    }

    if (configuracoes.telaPadraoTexto === undefined) configuracoes.telaPadraoTexto = 1;

    var selectTheme = $("#selectTheme");
    selectTheme.empty(); 
    configuracoes.themes.forEach(function (theme){
        var option = new Option(theme.name, theme.id); 
        selectTheme.append($(option));
    });
    selectTheme.val(configuracoes.active_theme); 

    $('#fontSizeRange').val(configuracoes.fontSize);
    $('#currentFontSize').text(configuracoes.fontSize);
    atualizaFontSizeText();
    changeFontSize();

    configuracoes.backgrounds.forEach(function (bg){
        if(bg.type == 1){
            $("#image_"+bg.id).show();
            $("#color_"+bg.id).hide();
            $(`input[name="imgColor_${bg.id}"][value="1"]`).prop('checked', true).parent().addClass('active').siblings().removeClass('active');
        } else{
            $("#image_"+bg.id).hide();
            $("#color_"+bg.id).show();
            $(`input[name="imgColor_${bg.id}"][value="2"]`).prop('checked', true).parent().addClass('active').siblings().removeClass('active');
        }
        var formatted = formatMediaUrl(bg.image_file);
        if (bg.media_type === "video" || isVideoFile(bg.image_file)) {
            $("#image_"+bg.id).html('<video src="'+formatted+'" muted autoplay loop style="width:100%; height:100%; object-fit:cover;"></video>');
            $("#image_"+bg.id).css("background", "none");
        } else {
            $("#image_"+bg.id).html('');
            $("#image_"+bg.id).css("background", "url('"+formatted+"')");
        }
        $("#color_"+bg.id).val(bg.color);
    });

    if (configuracoes.telaPadraoTexto === 1) {
        $("#activeTextStandartScr").prop('checked', true);
        $("#activeTextStandartScr2").prop('checked', false);
        setTelaPadraoHtml(1);
    } else if (configuracoes.telaPadraoTexto === 2) {
        $("#activeTextStandartScr").prop('checked', false);
        $("#activeTextStandartScr2").prop('checked', true);
        setTelaPadraoHtml(2);
    } else {
        $("#activeTextStandartScr").prop('checked', false);
        $("#activeTextStandartScr2").prop('checked', false);
        setTelaPadraoHtml(0);
    }

    generateLiveList();
}

$("#selectTheme").change(function() {
    var selectedTheme = $(this).val(); 
    configuracoes.active_theme = selectedTheme;
    changeThemeImages();
    changeTheme();
    localStorage.setItem('settings', JSON.stringify(configuracoes));
});

$('#confirmConf').click(function (){
    localStorage.setItem('settings', JSON.stringify(configuracoes));
    $('#confModal').modal('toggle');
});

function changeTheme(){
    configuracoes.themes.forEach(function (theme){
        if (theme.id == configuracoes.active_theme) {
            broadcastCommand('CHANGE_THEME', theme.file);
            generateLiveList(); 
        }
    }); 
}

function changeThemeImages(){
    var old1 = getBackground(1);
    var imagem = configuracoes.images[1].file;
    if(configuracoes.active_theme == 1){ 
        imagem = configuracoes.images[0].file;
    } else if(configuracoes.active_theme == 2){
        imagem = configuracoes.images[1].file;
    }
    setBackground(1,1,old1.color, imagem);
    $("#image_1").css("background", "url('"+formatMediaUrl(imagem)+"')");
}

function changeFontSize(){
    broadcastCommand('CHANGE_FONT_SIZE', configuracoes.fontSize);
}

$('#fontSizeRange').on('input change', function () {
    var size = parseFloat($(this).val()); 
    configuracoes.fontSize = size; 
    $('#currentFontSize').text(configuracoes.fontSize);
    atualizaFontSizeText();
    changeFontSize();
    localStorage.setItem('settings', JSON.stringify(configuracoes));
});

function atualizaFontSizeText(){
    if(configuracoes.fontSize == 1) $('#currentFontSize').text($('#currentFontSize').text()+" - Menor");
    if(configuracoes.fontSize == 2) $('#currentFontSize').text($('#currentFontSize').text()+" - Normal");
    if(configuracoes.fontSize == 4) $('#currentFontSize').text($('#currentFontSize').text()+" - Maior");
}

$("#activeTextStandartScr").click(function(e) {
    if($(this).is(':checked')){
        $("#activeTextStandartScr2").prop('checked', false);
        configuracoes.telaPadraoTexto = 1;
    } else {
        configuracoes.telaPadraoTexto = 0;
    }
    setTelaPadraoHtml(configuracoes.telaPadraoTexto);
    localStorage.setItem('settings', JSON.stringify(configuracoes));
    generateLiveList();
});

$("#activeTextStandartScr2").click(function(e) { 
    if($(this).is(':checked')){
        $("#activeTextStandartScr").prop('checked', false);
        configuracoes.telaPadraoTexto = 2;
    } else {
        configuracoes.telaPadraoTexto = 0;
    }
    setTelaPadraoHtml(configuracoes.telaPadraoTexto);
    localStorage.setItem('settings', JSON.stringify(configuracoes));
    generateLiveList();
});

$('input[type=radio][name=imgColor_1]').change(function() { 
    var old = getBackground(1);
    if(this.value == 1){ 
        $("#image_1").show();
        $("#color_1").hide();
        setBackground(1, 1, old.color, old.image_file, old.media_type);
    } else {
        $("#image_1").hide();
        $("#color_1").show();
        setBackground(1, 2, old.color, old.image_file, old.media_type);
    }
    generateLiveList();
});

$('input[type=radio][name=imgColor_2]').change(function() { 
    var old = getBackground(2); 
    if(this.value == 1){ 
        $("#image_2").show();
        $("#color_2").hide();
        setBackground(2, 1, old.color, old.image_file, old.media_type);
    } else {
        $("#image_2").hide();
        $("#color_2").show();
        setBackground(2, 2, old.color, old.image_file, old.media_type);
    }
    generateLiveList();
});

$('input[type=radio][name=imgColor_3]').change(function() { 
    var old = getBackground(3); 
    if(this.value == 1){ 
        $("#image_3").show();
        $("#color_3").hide();
        setBackground(3, 1, old.color, old.image_file, old.media_type);
    } else {
        $("#image_3").hide();
        $("#color_3").show();
        setBackground(3, 2, old.color, old.image_file, old.media_type);
    }
    generateLiveList();
});

$('#selectImageModal').on('show.bs.modal', function (e) {
    reloadListOfImages();
});

function reloadListOfImages(){
    $('#images').html("");
    configuracoes.images.forEach(function (imagem, index){
        var isVid = (imagem.media_type === "video" || isVideoFile(imagem.file));
        var itemHtml = '';
        var bgUrl = formatMediaUrl(imagem.file);

        if (isVid) {
            itemHtml = '<div class="bg-item" data-index="'+index+'" data-media-type="video">' +
                       '<video src="'+bgUrl+'" muted style="width:100%; height:100%; object-fit:cover;"></video>' +
                       '<span class="bg-badge"><i class="fas fa-video"></i> Vídeo</span>' +
                       (index >= 3 ? '<button type="button" class="bg-del-btn" data-index="'+index+'" title="Excluir"><i class="fas fa-times"></i></button>' : '') +
                       '</div>';
        } else {
            itemHtml = '<div class="bg-item" style="background-image: url(\''+bgUrl+'\'); background-size: cover; background-position: center;" data-index="'+index+'" data-media-type="image">' +
                       '<span class="bg-badge"><i class="fas fa-image"></i> Foto</span>' +
                       (index >= 3 ? '<button type="button" class="bg-del-btn" data-index="'+index+'" title="Excluir"><i class="fas fa-times"></i></button>' : '') +
                       '</div>';
        }
        $('#images').append(itemHtml);
    });

    $('#images div.bg-item').off('click').on('click', function(e){
        if ($(e.target).closest('.bg-del-btn').length > 0) return;
        var idx = parseInt($(this).attr("data-index"));
        var imgItem = configuracoes.images[idx];
        if (!imgItem) return;

        var image_file = imgItem.file;
        var media_type = imgItem.media_type || (isVideoFile(image_file) ? "video" : "image");
        var id = parseInt($('#images').attr("data-type"));
        var oldbg = getBackground(id);
        
        setBackground(id, 1, oldbg.color, image_file, media_type);
        
        var formatted = formatMediaUrl(image_file);
        if (media_type === "video" || isVideoFile(image_file)) {
            $("#image_"+id).html('<video src="'+formatted+'" muted autoplay loop style="width:100%; height:100%; object-fit:cover;"></video>');
            $("#image_"+id).css("background", "none");
        } else {
            $("#image_"+id).html('');
            $("#image_"+id).css({
                "background-image": "url('" + formatted + "')",
                "background-size": "cover",
                "background-position": "center"
            });
        }
        
        $('#selectImageModal').modal('toggle');
        generateLiveList();
    });

    $('.bg-del-btn').off('click').on('click', function(e){
        e.stopPropagation();
        var idx = parseInt($(this).attr('data-index'));
        if (confirm("Deseja remover este fundo da lista?")) {
            configuracoes.images.splice(idx, 1);
            try { localStorage.setItem('settings', JSON.stringify(configuracoes)); } catch(err){}
            reloadListOfImages();
        }
    });
}

$('.image-select').click(function() {
    var valor_id = $(this).attr('id')[$(this).attr('id').length - 1];
    $("div#images").attr("data-type", valor_id);
    $('#selectImageModal').modal('toggle');
});

function getBackgroundForSection(id){
    var resp = "";
    configuracoes.backgrounds.forEach(function (bg){ 
        if(bg.id == id){ 
            if(bg.type == 1){ 
                var isVid = (bg.media_type === "video" || isVideoFile(bg.image_file));
                var formatted = formatMediaUrl(bg.image_file);
                if (isVid) {
                    resp = ' data-background-video="' + formatted + '" data-background-video-loop data-background-video-muted';
                } else {
                    resp = ' data-background="' + formatted + '" data-background-image="' + formatted + '"';
                }
            } else {
                resp = ' data-background="' + bg.color + '"';
            }
        } 
    });
    return resp;
}

function getBackground(id){
    var oldbg = {};
    configuracoes.backgrounds.forEach(function (bg){ 
        if(bg.id == id){ 
            oldbg = bg;
        } 
    });
    return oldbg;
}

function setBackground(id, tipo, cor, arquivo, media_type){
    configuracoes.backgrounds.forEach(function (bg){ 
        if(bg.id == id){ 
            bg.type = tipo;
            bg.color = cor;
            bg.image_file = arquivo;
            bg.media_type = media_type || (isVideoFile(arquivo) ? "video" : "image");
        } 
    });
    try { localStorage.setItem('settings', JSON.stringify(configuracoes)); } catch(err){}
}

$('input[type="color"]').change(function (){
    var tipo = parseInt($(this).attr("id").split("_")[1]);
    var old = getBackground(tipo);
    var color = $(this).val();
    setBackground(tipo, 2, color, old.file);
    generateLiveList();
});

// ==========================================
// UPLOAD DE FUNDO (IMAGENS E VÍDEOS COM ENQUADRAMENTO 16:9)
// ==========================================
$('#addNewImage').click(function(){
    $('#imagesToAdd').click();
});

$('#imagesToAdd').on('change', function() {
    var file = this.files[0];
    if (!file) return;

    var isVid = isVideoFile(file.name) || (file.type && file.type.startsWith("video/"));

    if (isVid) {
        // Validação de Vídeo: tamanho máximo 10 MB
        if (file.size > 10 * 1024 * 1024) {
            alert("O vídeo selecionado possui " + (file.size / (1024 * 1024)).toFixed(1) + " MB. O limite máximo permitido para vídeos de fundo é de 10 MB.");
            $('#imagesToAdd').val('');
            return;
        }

        var tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        var videoBlobUrl = URL.createObjectURL(file);

        tempVideo.onloadedmetadata = function() {
            URL.revokeObjectURL(videoBlobUrl);
            // Validação de Vídeo: duração máxima 30 segundos
            if (tempVideo.duration > 30.5) {
                alert("O vídeo possui " + Math.round(tempVideo.duration) + " segundos. O tempo máximo permitido para vídeos de fundo é de 30 segundos.");
                $('#imagesToAdd').val('');
                return;
            }

            var reader = new FileReader();
            reader.onload = async function(e) {
                var dataUrl = e.target.result;
                var vidId = "bg_vid_" + Date.now();
                await MediaDB.save(vidId, dataUrl);

                configuracoes.images.push({
                    id: vidId,
                    file: dataUrl,
                    name: file.name,
                    media_type: "video"
                });
                try { localStorage.setItem('settings', JSON.stringify(configuracoes)); } catch(err){}
                reloadListOfImages();
                $('#imagesToAdd').val('');
            };
            reader.readAsDataURL(file);
        };
        tempVideo.onerror = function() {
            alert("Não foi possível carregar os metadados do vídeo. Certifique-se de que é um formato compatível (MP4/AVI).");
            $('#imagesToAdd').val('');
        };
        tempVideo.src = videoBlobUrl;

    } else {
        // Imagem (jpg, jpeg, png, gif, webp)
        var reader = new FileReader();
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            var img = new Image();
            img.onload = function() {
                currentCropImage = img;
                currentCropFileName = file.name;

                var ratio = img.width / img.height;
                var is16_9 = Math.abs(ratio - (16 / 9)) < 0.05;

                abrirModalEnquadramento16_9(is16_9, img.width, img.height, ratio);
            };
            img.onerror = function() {
                alert("Erro ao decodificar a imagem. Tente outro arquivo.");
                $('#imagesToAdd').val('');
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }
});

function abrirModalEnquadramento16_9(is16_9, w, h, ratio) {
    if (!is16_9) {
        $('#cropWarningAlert').removeClass('alert-success').addClass('alert-warning');
        $('#cropWarningText').html('<strong>Atenção:</strong> A imagem possui resolução ' + w + 'x' + h + ' (proporção ' + ratio.toFixed(2) + ':1), que <strong>não é 16:9</strong>. Ajuste o recorte, zoom e posição abaixo para evitar distorções no telão.');
    } else {
        $('#cropWarningAlert').removeClass('alert-warning').addClass('alert-success');
        $('#cropWarningText').html('<strong>Ótimo:</strong> A imagem já possui proporção 16:9 perfeita (' + w + 'x' + h + '). Se desejar, faça ajustes de zoom ou posição abaixo.');
    }

    $('#cropZoom').val(100);
    $('#cropZoomVal').text('100');
    $('#cropPanX').val(0);
    $('#cropPanXVal').text('0');
    $('#cropPanY').val(0);
    $('#cropPanYVal').text('0');

    $('#cropAdjustModal').modal('show');
    setTimeout(desenharPreviewEnquadramento, 200);
}

function desenharPreviewEnquadramento() {
    if (!currentCropImage) return;
    var canvas = document.getElementById('cropPreviewCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var zoom = parseFloat($('#cropZoom').val()) / 100;
    var panXPercent = parseFloat($('#cropPanX').val()) / 100;
    var panYPercent = parseFloat($('#cropPanY').val()) / 100;

    var scaleCover = Math.max(canvas.width / currentCropImage.width, canvas.height / currentCropImage.height) * zoom;
    var drawW = currentCropImage.width * scaleCover;
    var drawH = currentCropImage.height * scaleCover;

    var centerX = (canvas.width - drawW) / 2;
    var centerY = (canvas.height - drawH) / 2;

    var maxPanX = Math.max(0, (drawW - canvas.width) / 2);
    var maxPanY = Math.max(0, (drawH - canvas.height) / 2);

    var posX = centerX + (panXPercent * maxPanX);
    var posY = centerY + (panYPercent * maxPanY);

    ctx.drawImage(currentCropImage, posX, posY, drawW, drawH);
}

$('#cropZoom').on('input change', function() {
    $('#cropZoomVal').text($(this).val());
    desenharPreviewEnquadramento();
});
$('#cropPanX').on('input change', function() {
    $('#cropPanXVal').text($(this).val());
    desenharPreviewEnquadramento();
});
$('#cropPanY').on('input change', function() {
    $('#cropPanYVal').text($(this).val());
    desenharPreviewEnquadramento();
});
$('#btnResetCrop').click(function() {
    $('#cropZoom').val(100);
    $('#cropZoomVal').text('100');
    $('#cropPanX').val(0);
    $('#cropPanXVal').text('0');
    $('#cropPanY').val(0);
    $('#cropPanYVal').text('0');
    desenharPreviewEnquadramento();
});

$('#btnConfirmCrop').click(async function() {
    if (!currentCropImage) return;

    var outCanvas = document.createElement('canvas');
    outCanvas.width = 1920;
    outCanvas.height = 1080;
    var ctx = outCanvas.getContext('2d');
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1920, 1080);

    var zoom = parseFloat($('#cropZoom').val()) / 100;
    var panXPercent = parseFloat($('#cropPanX').val()) / 100;
    var panYPercent = parseFloat($('#cropPanY').val()) / 100;

    var scaleCover = Math.max(1920 / currentCropImage.width, 1080 / currentCropImage.height) * zoom;
    var drawW = currentCropImage.width * scaleCover;
    var drawH = currentCropImage.height * scaleCover;

    var centerX = (1920 - drawW) / 2;
    var centerY = (1080 - drawH) / 2;

    var maxPanX = Math.max(0, (drawW - 1920) / 2);
    var maxPanY = Math.max(0, (drawH - 1080) / 2);

    var posX = centerX + (panXPercent * maxPanX);
    var posY = centerY + (panYPercent * maxPanY);

    ctx.drawImage(currentCropImage, posX, posY, drawW, drawH);

    var finalDataUrl = outCanvas.toDataURL('image/jpeg', 0.85);
    var bgId = "bg_img_" + Date.now();
    await MediaDB.save(bgId, finalDataUrl);

    configuracoes.images.push({
        id: bgId,
        file: finalDataUrl,
        name: currentCropFileName,
        media_type: "image"
    });
    try { localStorage.setItem('settings', JSON.stringify(configuracoes)); } catch(err){}

    reloadListOfImages();
    $('#cropAdjustModal').modal('hide');
    $('#imagesToAdd').val('');
    currentCropImage = null;
});

function hideLoading() {
    var loadingEl = document.getElementById("loading");
    if (loadingEl) {
        loadingEl.style.setProperty("display", "none", "important");
        loadingEl.classList.add("d-none");
    }
}

function showLoading() {
    var loadingEl = document.getElementById("loading");
    if (loadingEl) {
        loadingEl.classList.remove("d-none");
        loadingEl.style.setProperty("display", "flex", "important");
    }
}

// Inicialização segura do Painel do Operador
let inicializado = false;
async function inicializarSistema() {
    if (inicializado) return;
    inicializado = true;

    try {
        defaultConfigurations();
    } catch (e) {
        console.error("Erro em defaultConfigurations:", e);
    }

    try {
        await carregaLouvores();
    } catch (e) {
        console.error("Erro em carregaLouvores:", e);
    }

    try {
        if (typeof projecao !== 'undefined' && projecao.some(p => p.type === 'b') && typeof inicializarBibliaLazy === 'function') {
            await inicializarBibliaLazy();
        }
    } catch(e) {}

    try {
        reloadProjectionList();
    } catch (e) {
        console.error("Erro em reloadProjectionList:", e);
    }

    // Abre sempre a janela do telão automaticamente ao iniciar o sistema
    let abriu = startProjection();
    if (abriu) {
        hideLoading();
    }

    // Consulta imediatamente se o telão já se encontra aberto em outro monitor
    broadcastCommand('REQUEST_STATUS');
}

// Dispara a inicialização assim que o DOM estiver pronto
$(document).ready(function() {
    inicializarSistema();
});

// Fallback preventivo caso o ready atrase
window.onload = function() {
    inicializarSistema();
};

// Trava de segurança: após 1.5s força a remoção do loader caso algum script bloqueie (a menos que popup esteja bloqueado)
setTimeout(function() {
    if (!popupBloqueado) {
        hideLoading();
    }
}, 1500);

(function(){
    window.addEventListener( 'message', function( event ) { 
        try {
            var data = JSON.parse( event.data ); 
            if(data.host === 'projection-html5-painel' && data.function === 'opened' && data.isExternal){
                setTelaoStatus(true);
                recarrega(data.data);
            }
        } catch (e) {}
    } );

    function recarrega(data) {
        reloadProjectionList();
        changeFontSize();
        changeTheme();
    }
})()

var ps = new PerfectScrollbar('#scrollblock');