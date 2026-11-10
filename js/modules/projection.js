// ==========================================
// MÓDULO: PROJECTION (Projeção, Telão, Slides Reveal.js & BroadcastChannel)
// ==========================================

const projectionBroadcast = ('BroadcastChannel' in window) ? new BroadcastChannel('projecao_icm_channel') : null;

var isBlackout = false;
var isFrozen = false;
var telaoConnected = false;
var popupBloqueado = false;
var windowView = null;
var windowObs = null;
var lastTelaoPong = 0;

var projecao = [];
var projecaoAtiva = 0;
var viewSlides = "";
var telaPadrao = "";

// Envia comandos sincronizados em tempo real via BroadcastChannel, postMessage direto e localStorage
function broadcastCommand(action, payload) {
    if (projectionBroadcast) {
        try {
            projectionBroadcast.postMessage({ action: action, payload: payload, timestamp: Date.now() });
        } catch (e) {
            console.warn("Falha no BroadcastChannel:", e);
        }
    }

    var msgObj = {
        host: 'projection-html5',
        function: action,
        data: payload,
        timestamp: Date.now()
    };
    var serializedMsg = null;
    try { serializedMsg = JSON.stringify(msgObj); } catch(e) {}

    // 1. Miniatura embutida (#iframeProjection ou #viewIframe)
    var iframe = document.getElementById('iframeProjection') || document.getElementById('viewIframe');
    if (iframe && iframe.contentWindow) {
        try {
            iframe.contentWindow.postMessage(serializedMsg || msgObj, "*");
        } catch (e) {}
    }

    // 2. Janela externa do Telão (garante funcionamento mesmo em file:///)
    if (windowView && !windowView.closed) {
        try {
            windowView.postMessage(serializedMsg || msgObj, "*");
        } catch (e) {}
    }

    // 3. Janela externa da Saída OBS (garante sincronia em tempo real e file:///)
    if (windowObs && !windowObs.closed) {
        try {
            windowObs.postMessage(serializedMsg || msgObj, "*");
        } catch (e) {}
    }

    // 4. Snapshot leve para OBS / janelas da mesma origem via localStorage
    if (action === 'RELOAD_SLIDES' || action === 'CHANGE_SLIDE' || action === 'BLACKOUT' || action === 'FREEZE') {
        try {
            localStorage.setItem('obs_live_sync', JSON.stringify({
                html: viewSlides,
                currentSlide: projecaoAtiva,
                isBlackout: isBlackout,
                isFrozen: isFrozen,
                ts: Date.now()
            }));
        } catch (e) {}
    }
}

async function enviarMidiaParaJanelaTelao(mid, fileName, forceBuffer) {
    var blob = null;
    if (typeof window.obterBlobAssincronoParaTelao === 'function') {
        blob = await window.obterBlobAssincronoParaTelao(mid, fileName);
    } else if (typeof window.obterBlobParaTelao === 'function') {
        blob = window.obterBlobParaTelao(mid, fileName);
    } else if (mid && rawBlobsCache[mid]) {
        blob = rawBlobsCache[mid];
    }

    if (!blob) return;

    // Canal 1: BroadcastChannel com Blob nativo
    if (projectionBroadcast) {
        try {
            projectionBroadcast.postMessage({
                action: 'RESPONSE_MEDIA_BLOB',
                payload: { mediaId: mid, fileName: fileName, blob: blob },
                timestamp: Date.now()
            });
        } catch (e) {}
    }

    // Canal 2: postMessage direto para Telão e Iframe (converte em ArrayBuffer se file:// ou forceBuffer para imunidade total a CORS/opaque origin)
    var usarBuffer = !!forceBuffer || (window.location && window.location.protocol === 'file:');
    var iframe = document.getElementById('iframeProjection') || document.getElementById('viewIframe');

    if (usarBuffer && blob.size <= 350 * 1024 * 1024) {
        try {
            var ab = await blob.arrayBuffer();
            var bufPayload = { mediaId: mid, fileName: fileName, arrayBuffer: ab, mimeType: blob.type || '' };
            if (windowView && !windowView.closed) {
                windowView.postMessage({ host: 'projection-html5', function: 'RESPONSE_MEDIA_BLOB', data: bufPayload }, "*");
            }
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ host: 'projection-html5', function: 'RESPONSE_MEDIA_BLOB', data: bufPayload }, "*");
            }
            return;
        } catch(errBuf) {
            console.warn("Falha ao enviar ArrayBuffer da mídia, usando fallback Blob:", errBuf);
        }
    }

    var blobPayload = { mediaId: mid, fileName: fileName, blob: blob };
    if (windowView && !windowView.closed) {
        try { windowView.postMessage({ host: 'projection-html5', function: 'RESPONSE_MEDIA_BLOB', data: blobPayload }, "*"); } catch(e){}
    }
    if (iframe && iframe.contentWindow) {
        try { iframe.contentWindow.postMessage({ host: 'projection-html5', function: 'RESPONSE_MEDIA_BLOB', data: blobPayload }, "*"); } catch(e){}
    }
}

function processarMensagemJanela(data) {
    if (!data) return;
    var action = data.action || data.function;
    var payload = data.payload || data.data || {};

    if (action === 'TELAO_READY') {
        telaoConnected = true;
        lastTelaoPong = Date.now();
        atualizarStatusTelao(true);
        updateViewSlides(projecaoAtiva);
        if (isBlackout) broadcastCommand('BLACKOUT', true);
    } else if (action === 'OBS_READY' || action === 'REQUEST_SLIDES') {
        if (action === 'OBS_READY' && windowObs && !windowObs.closed) {
            try {
                windowObs.postMessage(JSON.stringify({
                    host: 'projection-html5',
                    function: 'RELOAD_SLIDES',
                    data: { html: viewSlides, currentSlide: projecaoAtiva },
                    timestamp: Date.now()
                }), "*");
                if (isBlackout) windowObs.postMessage(JSON.stringify({ host: 'projection-html5', function: 'BLACKOUT', data: true, timestamp: Date.now() }), "*");
                if (isFrozen) windowObs.postMessage(JSON.stringify({ host: 'projection-html5', function: 'FREEZE', data: true, timestamp: Date.now() }), "*");
            } catch(e) {}
            if (projectionBroadcast) {
                try { projectionBroadcast.postMessage({ action: 'RELOAD_SLIDES', payload: { html: viewSlides, currentSlide: projecaoAtiva }, timestamp: Date.now() }); } catch(e) {}
            }
        } else {
            updateViewSlides(projecaoAtiva);
            if (isBlackout) broadcastCommand('BLACKOUT', true);
            if (isFrozen) broadcastCommand('FREEZE', true);
        }
    } else if (action === 'PONG') {
        telaoConnected = true;
        lastTelaoPong = Date.now();
        atualizarStatusTelao(true);
    } else if (action === 'TELAO_CLOSED') {
        telaoConnected = false;
        atualizarStatusTelao(false);
    } else if (action === 'REQUEST_MEDIA_BLOB') {
        var mid = data.mediaId || payload.mediaId || "";
        var fName = data.fileName || payload.fileName || "";
        var fBuf = !!(data.forceBuffer || payload.forceBuffer);
        if (mid || fName) {
            enviarMidiaParaJanelaTelao(mid, fName, fBuf);
        }
    } else if (action === 'VIDEO_SYNC') {
        lastTelaoVideoSyncAt = Date.now();
        // Garante sincronia do vídeo na pré-visualização embutida mesmo em file:///
        var iframeSync = document.getElementById('iframeProjection') || document.getElementById('viewIframe');
        if (iframeSync && iframeSync.contentWindow) {
            try {
                iframeSync.contentWindow.postMessage(JSON.stringify({
                    host: 'projection-html5',
                    function: 'VIDEO_SYNC',
                    data: payload,
                    timestamp: Date.now()
                }), "*");
            } catch(e) {}
        }
        atualizarControlesVideoPainel(payload);
    } else if (action === 'PREVIEW_VIDEO_STATE') {
        // Quando Telão está fechado, os controles do painel acompanham a pré-visualização
        if (!telaoConnected || (Date.now() - lastTelaoVideoSyncAt > 1200)) {
            atualizarControlesVideoPainel(payload);
        }
    }
}

// Resposta a requisições vindas do telão, OBS ou janelas secundárias via BroadcastChannel
if (projectionBroadcast) {
    projectionBroadcast.onmessage = function(event) {
        processarMensagemJanela(event.data);
    };
}

// Resposta complementar via postMessage direto (essencial no protocolo file://)
window.addEventListener('message', function(event) {
    try {
        var msg = (typeof event.data === 'string') ? JSON.parse(event.data) : event.data;
        if (msg && (msg.action || msg.function)) {
            processarMensagemJanela(msg);
        }
    } catch (e) {}
});

// Monitora conectividade com a janela do telão via heartbeat (BroadcastChannel + windowView direto)
setInterval(function() {
    if (projectionBroadcast) {
        try { projectionBroadcast.postMessage({ action: 'PING', timestamp: Date.now() }); } catch(e){}
    }
    if (windowView && !windowView.closed) {
        try {
            windowView.postMessage(JSON.stringify({ host: 'projection-html5', function: 'PING', data: Date.now() }), "*");
        } catch(e){}
    }
    if (Date.now() - lastTelaoPong > 3000) {
        if (windowView && windowView.closed && telaoConnected) {
            telaoConnected = false;
            atualizarStatusTelao(false);
        } else if (telaoConnected && (!windowView || windowView.closed)) {
            telaoConnected = false;
            atualizarStatusTelao(false);
        }
    }
}, 1000);

function atualizarStatusTelao(conectado) {
    telaoConnected = conectado;
    var badge = $('#telaoStatusBadge');
    var icon = $('#telaoStatusIcon');
    var text = $('#telaoStatusText');
    var btn = $('#btnLaunchView');

    if (conectado) {
        if (badge.length) {
            badge.removeClass('badge-secondary').addClass('badge-success');
            badge.attr('title', 'A janela do Telão está conectada e recebendo comandos em tempo real.');
        }
        if (icon.length) icon.removeClass('text-muted').addClass('text-success');
        if (text.length) text.text('Telão Conectado');
        if (btn.length) {
            btn.removeClass('btn-primary').addClass('btn-success');
            btn.html('<i class="fas fa-tv"></i> Telão Aberto');
        }
    } else {
        if (badge.length) {
            badge.removeClass('badge-success').addClass('badge-secondary');
            badge.attr('title', 'A janela do Telão está fechada ou desconectada. Clique em "Abrir Telão" para conectar.');
        }
        if (icon.length) icon.removeClass('text-success').addClass('text-muted');
        if (text.length) text.text('Telão Desconectado');
        if (btn.length) {
            btn.removeClass('btn-success').addClass('btn-primary');
            btn.html('<i class="fas fa-tv"></i> Abrir Telão');
        }
    }
}
window.setTelaoStatus = atualizarStatusTelao;
window.atualizarStatusTelao = atualizarStatusTelao;

// Controle de Blackout Litúrgico
function toggleBlackout(forceState) {
    isBlackout = (typeof forceState === 'boolean') ? forceState : !isBlackout;
    broadcastCommand('BLACKOUT', isBlackout);

    var btn = $('#btnBlackout');
    var badge = $('#blackoutBadge');
    var alertBadge = $('#alertBlackoutActive');

    if (isBlackout) {
        btn.addClass('active btn-danger').removeClass('btn-outline-danger btn-secondary');
        if (badge.length) badge.removeClass('d-none');
        if (alertBadge.length) alertBadge.show();
    } else {
        btn.removeClass('active btn-danger').addClass('btn-outline-danger');
        if (badge.length) badge.addClass('d-none');
        if (alertBadge.length) alertBadge.hide();
    }
}

// Controle de Freeze (Congelamento da última imagem no Telão + silêncio de vídeos)
function toggleFreeze(forceState) {
    isFrozen = (typeof forceState === 'boolean') ? forceState : !isFrozen;
    broadcastCommand('FREEZE', isFrozen);

    var btn = $('#btnFreeze');
    var badge = $('#freezeBadge');
    var alertBadge = $('#alertFreezeActive');

    if (isFrozen) {
        btn.addClass('active btn-info').removeClass('btn-outline-info btn-secondary');
        if (badge.length) badge.removeClass('d-none');
        if (alertBadge.length) alertBadge.show();
    } else {
        btn.removeClass('active btn-info').addClass('btn-outline-info');
        if (badge.length) badge.addClass('d-none');
        if (alertBadge.length) alertBadge.hide();
        mudaProjecaoAtiva();
    }
}

// Inicializa a janela do telão
function startProjection() { 
    if (typeof(windowView) == 'undefined' || windowView == null || windowView.closed) {
        try {
            windowView = window.open(
                "view.html", 
                "ProjectionTelao", 
                "directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,channelmode=yes,fullscreen=yes,resizable=yes"
            );
        } catch(e) {
            console.error("Erro ao invocar window.open:", e);
        }
        
        if (!windowView || windowView.closed || typeof windowView.closed == 'undefined') {
            popupBloqueado = true;
            console.warn("Pop-up do telão bloqueado pelo navegador.");
            alert("Atenção: O navegador bloqueou a abertura da janela do Telão.\n\nPor favor, clique no ícone de pop-up bloqueado na barra de endereços do navegador e escolha 'Sempre permitir pop-ups para esta página'. Depois clique novamente no botão 'Abrir Telão'.");
            return false;
        } else {
            popupBloqueado = false;
            try { windowView.opener = window; } catch(e){}
            try { windowView.focus(); } catch(e){}
            atualizarStatusTelao(true);
            setTimeout(function() {
                updateViewSlides(projecaoAtiva);
            }, 500);
        }
        updateViewSlides(projecaoAtiva);
    } else {
        try { windowView.focus(); } catch(e){}
        if (!telaoConnected) updateViewSlides(projecaoAtiva);
    }
    return true;
}
window.startProjection = startProjection;

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Erro ao ativar tela cheia: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Retorna atributo data-background correspondente ao tipo de slide (1: Tela Padrão, 2: Louvores, 3: Bíblia)
function getBackgroundForSection(id) {
    var resp = "";
    if (typeof configuracoes !== 'undefined' && configuracoes && configuracoes.backgrounds && Array.isArray(configuracoes.backgrounds)) {
        for (var i = 0; i < configuracoes.backgrounds.length; i++) {
            var bg = configuracoes.backgrounds[i];
            if (bg.id == id) {
                if (bg.type == 1) { // Imagem / Vídeo
                    var isVid = (bg.media_type === "video" || (typeof isVideoFile === 'function' && isVideoFile(bg.image_file)));
                    var formatted = (typeof formatMediaUrl === 'function') ? formatMediaUrl(bg.image_file) : (bg.image_file || "");
                    if (isVid) {
                        return ' data-background-video="' + formatted + '" data-background-video-loop data-background-video-muted';
                    } else if (formatted) {
                        return ' data-background="' + formatted + '" data-background-image="' + formatted + '"';
                    }
                } else if (bg.type == 2) { // Cor
                    return ' data-background="' + (bg.color || "#000000") + '"';
                }
            }
        }
    }
    
    // Fallbacks padrão caso ainda não inicializado
    if (id === 1) return ' data-background="imagens/fundo.jpg"';
    if (id === 2) return '';
    if (id === 3) return ' data-background="imagens/madeira_bg.jpg"';
    return resp;
}
window.getBackgroundForSection = getBackgroundForSection;

// Salva fundos personalizados e limites estritos para backgrounds
async function salvarFundosPersonalizados() {
    var fundos = configuracoes.fundosPersonalizados || [];
    
    async function processarArquivoFundo(inputEl) {
        if (!inputEl || !inputEl.files || !inputEl.files[0]) return null;
        var file = inputEl.files[0];

        if (!isFormatoPermitido(file.name, file.type)) {
            alert("Formato não suportado para o fundo (" + file.name + "). Os formatos permitidos são: MP4, AVI, JPG, JPEG, PNG, GIF, WEBP.");
            return null;
        }

        var isVid = isVideoFile(file.name) || (file.type && file.type.startsWith("video/"));

        // Limitações restritas apenas para fundos contínuos do Reveal.js (10 MB e 30s)
        if (isVid) {
            if (file.size > 10 * 1024 * 1024) {
                alert("O vídeo de fundo (" + file.name + ") excede o limite máximo permitido de 10 MB para planos de fundo contínuos.");
                return null;
            }
            try {
                var duracao = await new Promise((resolve) => {
                    var vTest = document.createElement('video');
                    vTest.preload = 'metadata';
                    vTest.onloadedmetadata = function() {
                        window.URL.revokeObjectURL(vTest.src);
                        resolve(vTest.duration);
                    };
                    vTest.onerror = function() { resolve(0); };
                    vTest.src = URL.createObjectURL(file);
                });
                if (duracao > 30) {
                    alert("O vídeo de fundo (" + file.name + ") possui " + Math.round(duracao) + "s, excedendo o limite de 30 segundos permitido para planos de fundo.");
                    return null;
                }
            } catch(e){}
        }

        var fid = "fundo_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        var typedBlob = garantirBlobComMimeType(file, file.name);
        rawBlobsCache[fid] = typedBlob;
        var blobUrl = URL.createObjectURL(typedBlob);
        mediaBlobUrls[fid] = blobUrl;

        try {
            await MediaDB.init();
            await MediaDB.save(fid, typedBlob);
        } catch(e){}

        var novoFundo = {
            id: fid,
            name: file.name.replace(/\.[^/.]+$/, ""),
            fileName: file.name,
            type: isVid ? "video" : "image",
            src: blobUrl
        };
        fundos.push(novoFundo);
        return novoFundo;
    }

    var f1 = await processarArquivoFundo(document.getElementById('inputFundoTelaPadrao'));
    var f2 = await processarArquivoFundo(document.getElementById('inputFundoLouvores'));
    var f3 = await processarArquivoFundo(document.getElementById('inputFundoBiblia'));

    configuracoes.telaPadraoTipo = $('#selectTipoTelaPadrao').val();
    if (f1) configuracoes.telaPadraoMidia = f1.src;
    else if (configuracoes.telaPadraoTipo === 'imagem' || configuracoes.telaPadraoTipo === 'video') {
        configuracoes.telaPadraoMidia = $('#selectMidiaTelaPadrao').val() || configuracoes.telaPadraoMidia;
    }

    configuracoes.louvoresTipo = $('#selectTipoLouvores').val();
    if (f2) configuracoes.louvoresMidia = f2.src;
    else if (configuracoes.louvoresTipo === 'imagem' || configuracoes.louvoresTipo === 'video') {
        configuracoes.louvoresMidia = $('#selectMidiaLouvores').val() || configuracoes.louvoresMidia;
    }

    configuracoes.bibliaTipo = $('#selectTipoBiblia').val();
    if (f3) configuracoes.bibliaMidia = f3.src;
    else if (configuracoes.bibliaTipo === 'imagem' || configuracoes.bibliaTipo === 'video') {
        configuracoes.bibliaMidia = $('#selectMidiaBiblia').val() || configuracoes.bibliaMidia;
    }

    configuracoes.fundosPersonalizados = fundos;
    try { localStorage.setItem('configuracoes', JSON.stringify(configuracoes)); } catch(e){}

    atualizarSelectsBackground();
    generateLiveList();
    $('#modalFundos').modal('hide');
}

function atualizarSelectsBackground() {
    var fundos = configuracoes.fundosPersonalizados || [];
    var optionsHtml = '<option value="">(Selecione uma mídia adicionada)</option>';
    fundos.forEach(function(f) {
        optionsHtml += '<option value="' + f.src + '">' + (f.type === 'video' ? '🎬 ' : '🖼️ ') + f.name + '</option>';
    });

    $('#selectMidiaTelaPadrao, #selectMidiaLouvores, #selectMidiaBiblia').html(optionsHtml);

    if (configuracoes.telaPadraoTipo) $('#selectTipoTelaPadrao').val(configuracoes.telaPadraoTipo);
    if (configuracoes.telaPadraoMidia) $('#selectMidiaTelaPadrao').val(configuracoes.telaPadraoMidia);
    if (configuracoes.louvoresTipo) $('#selectTipoLouvores').val(configuracoes.louvoresTipo);
    if (configuracoes.louvoresMidia) $('#selectMidiaLouvores').val(configuracoes.louvoresMidia);
    if (configuracoes.bibliaTipo) $('#selectTipoBiblia').val(configuracoes.bibliaTipo);
    if (configuracoes.bibliaMidia) $('#selectMidiaBiblia').val(configuracoes.bibliaMidia);

    toggleSelectMidia($('#selectTipoTelaPadrao'), '#divMidiaTelaPadrao');
    toggleSelectMidia($('#selectTipoLouvores'), '#divMidiaLouvores');
    toggleSelectMidia($('#selectTipoBiblia'), '#divMidiaBiblia');
}

function toggleSelectMidia(selectEl, divSelector) {
    var val = selectEl.val();
    if (val === 'imagem' || val === 'video') {
        $(divSelector).show();
    } else {
        $(divSelector).hide();
    }
}

var lastTelaoVideoSyncAt = 0;
var videoControlCmdSeq = 0;

function formatarTempoVideo(sec) {
    var total = Math.floor(Math.max(0, Number(sec) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mm = (h > 0 && m < 10) ? ('0' + m) : (m < 10 ? '0' + m : '' + m);
    var ss = s < 10 ? '0' + s : '' + s;
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

function definirEstadoBotaoPlayPause(btnEl, paused) {
    if (!btnEl) return;
    if (paused) {
        btnEl.classList.remove('btn-warning');
        btnEl.classList.add('btn-primary');
        btnEl.innerHTML = '<i class="fas fa-play"></i>';
        btnEl.title = 'Reproduzir';
    } else {
        btnEl.classList.remove('btn-primary');
        btnEl.classList.add('btn-warning');
        btnEl.innerHTML = '<i class="fas fa-pause"></i>';
        btnEl.title = 'Pausar';
    }
}

function atualizarControlesVideoPainel(state) {
    if (!state) return;
    var rows = document.querySelectorAll('#livesongs tr[data-video-row="true"]');
    if (!rows || rows.length === 0) return;

    var targetIdx = (typeof state.slideIndex === 'number') ? state.slideIndex : projecaoAtiva;
    rows.forEach(function(row) {
        var rIdx = parseInt(row.getAttribute('data-id'), 10);
        var rMid = row.getAttribute('data-media-id') || '';
        var isTarget = (rIdx === targetIdx) || (rIdx === projecaoAtiva && state.mediaId && state.mediaId === rMid);
        var btnToggle = row.querySelector('.btn-vid-toggle');

        if (!isTarget) {
            definirEstadoBotaoPlayPause(btnToggle, true);
            return;
        }

        definirEstadoBotaoPlayPause(btnToggle, !!state.paused);
        var slider = row.querySelector('.vid-progress-slider');
        var label = row.querySelector('.vid-time-label');
        var dur = (state.duration && isFinite(state.duration) && state.duration > 0)
            ? state.duration
            : (slider ? (parseFloat(slider.max) || 0) : 0);
        var cur = Math.max(0, Number(state.currentTime) || 0);

        if (slider && slider.dataset.dragging !== 'true') {
            if (dur > 0) slider.max = dur;
            slider.value = dur > 0 ? Math.min(dur, cur) : cur;
        }
        if (label && (!slider || slider.dataset.dragging !== 'true')) {
            label.textContent = formatarTempoVideo(cur) + ' / ' + formatarTempoVideo(dur);
        }
    });
}

function enviarComandoControleVideo(slideId, command, value) {
    var mudouSlide = (projecaoAtiva !== slideId);
    if (mudouSlide) {
        projecaoAtiva = slideId;
        mudaProjecaoAtiva();
    }
    var rowEl = document.querySelector('#livesongs tr[data-id="' + slideId + '"]');
    var mediaId = rowEl ? (rowEl.getAttribute('data-media-id') || '') : '';
    var payload = {
        cmdId: ++videoControlCmdSeq,
        slideIndex: slideId,
        mediaId: mediaId,
        command: command,
        value: value
    };
    if (mudouSlide) {
        setTimeout(function() {
            broadcastCommand('VIDEO_CONTROL', payload);
        }, 120);
    } else {
        broadcastCommand('VIDEO_CONTROL', payload);
    }
}

// ==========================================
// MOTOR DE CONSTRUÇÃO DE SLIDES LITÚRGICOS
// ==========================================
function generateLiveList(){ 
    var telaPadraoPainel = '<td>Tela Padrão</td><td></td>';
    $("#livesongs tbody").html(""); 
    $('#livesongs tbody').append('<tr data-id="0">'+telaPadraoPainel+'</tr>');
    viewSlides="<section"+getBackgroundForSection(1)+telaPadrao;
    var f = 1;
    
    $.each(projecao, function(i, item) { 
        if(item.type == "s"){
            var parsed = dados[item.folderId].songs[item.id].content.split("\n\n");
            $.each(parsed, function(j, estrofe) { 
                var estrofeEsp = estrofe.replace(/\n/g, "<br>");
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+dados[item.folderId].songs[item.id].title+'</td><td>'+estrofeEsp+'</td></tr>');
                
                // Normaliza contagem de caracteres sem tags litúrgicas para não diminuir indevidamente a fonte
                var textoLimpo = estrofe.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
                var textoSemRotulos = textoLimpo.replace(/^(CORO|FINAL:?|REFRÃO:?)\s*/i, '').trim();
                let charCount = textoSemRotulos.length;

                var linhasVisiveis = estrofe.split(/\r?\n|<br\s*\/?>/i).filter(l => l.replace(/<[^>]+>/g, '').trim().length > 0);
                let totalLinhas = linhasVisiveis.length;

                let fontSizePercent = 100;
                if (charCount > 380 || totalLinhas >= 8) fontSizePercent = 80;
                else if (charCount > 280 || totalLinhas >= 7) fontSizePercent = 88;
                else if (charCount > 200 || totalLinhas >= 6) fontSizePercent = 94;
                else fontSizePercent = 100;
                
                var estrofeFormatada = `<div class="verse-container" style="font-size: ${fontSizePercent}%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; width: 100%;"><div class="verse-text" style="max-width: 95%; line-height: 1.25;">${estrofeEsp}</div></div>`;

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
                        viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2 #titulo:before { content: \""+nome.split("<br>")[0]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2 #titulo:after { content: \""+nome.split("<br>")[1]+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2 #titulo{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle2 #logo{ display: table; }</style>\n"+fimStyle; 
                    } else {
                        viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showtitle"+item.folderId+"_"+item.id+fimState+"\">\n<style>\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle #titulo:after { content: \""+dados[item.folderId].songs[item.id].title+"\"; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle{ display: table; }\n.showtitle"+item.folderId+"_"+item.id+" header.winetitle #logo{ display: table; }</style>\n"+fimStyle;
                    } 
                    $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
                } else {
                    viewSlides+="<section"+getBackgroundForSection(2)+" data-state=\"showlogo"+item.folderId+"_"+item.id+"_"+j+fimState+"\" data-background-transition=\"none\">\n<style>\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo{ display: block; }\n.showlogo"+item.folderId+"_"+item.id+"_"+j+" header.whitelogo #logo{ display: block; }</style>\n"+fimStyle;
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
            var mediaSrc = resolverUrlMidiaSync(media);
            var mediaName = media ? (media.name || "Mídia") : "Mídia";
            var isVid = media ? (media.type === "video" || isVideoFile(mediaSrc) || isVideoFile(media.fileName)) : false;

            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            
            var escAttr = function(val) {
                return String(val || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            };
            var fileName = media ? (media.fileName || media.name || "") : "";
            var mediaId = (media && media.id) ? media.id : ("media_fallback_" + i + "_" + fileName.replace(/\W/g, ""));
            var attrId = escAttr(mediaId);
            var attrName = escAttr(fileName);
            var attrSrc = escAttr(mediaSrc);

            if (isVid) {
                var controlsHtml =
                    '<div class="d-flex align-items-center" style="gap: 10px;">' +
                        '<video class="thumb-video-preview" style="max-height: 70px; max-width: 120px; min-width: 90px; object-fit: contain; border-radius: 4px; background: #000;" src="'+attrSrc+'" muted preload="metadata"></video>' +
                        '<div class="video-ctrl-box flex-grow-1" data-slide-id="'+f+'" data-media-id="'+attrId+'" style="min-width: 210px;">' +
                            '<div class="d-flex align-items-center flex-wrap mb-1" style="gap: 4px;">' +
                                '<button type="button" class="btn btn-sm btn-primary btn-vid-toggle" title="Reproduzir"><i class="fas fa-play"></i></button>' +
                                '<button type="button" class="btn btn-sm btn-secondary btn-vid-restart" title="Reiniciar do início"><i class="fas fa-redo-alt"></i></button>' +
                                '<button type="button" class="btn btn-sm btn-secondary btn-vid-back10" title="Retroceder 10 segundos"><i class="fas fa-backward"></i> 10s</button>' +
                                '<button type="button" class="btn btn-sm btn-secondary btn-vid-fwd10" title="Avançar 10 segundos">10s <i class="fas fa-forward"></i></button>' +
                                '<span class="ml-auto font-weight-bold vid-time-label" style="font-size: 0.82rem; font-family: monospace; white-space: nowrap;">00:00 / 00:00</span>' +
                            '</div>' +
                            '<input type="range" class="custom-range vid-progress-slider" min="0" max="100" step="0.1" value="0" style="width: 100%; cursor: pointer;">' +
                        '</div>' +
                    '</div>';
                $('#livesongs tbody').append('<tr data-id="'+f+'" data-video-row="true" data-media-id="'+attrId+'"><td><i class="fas fa-video text-info"></i>&nbsp;'+mediaName+'</td><td>'+controlsHtml+'</td></tr>');
                viewSlides+="<section data-background=\"#000000\" data-media-slide=\"true\" data-media-type=\"video\" data-media-id=\""+attrId+"\" data-file-name=\""+attrName+"\" data-media-src=\""+attrSrc+"\"></section>\n";
            } else {
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-image text-warning"></i>&nbsp;'+mediaName+'</td><td><img class="responsive-img" src="'+mediaSrc+'" style="max-height: 80px; max-width: 130px; object-fit: contain; border-radius: 4px;"></td></tr>');
                viewSlides+="<section data-background=\"#000000\" data-media-slide=\"true\" data-media-type=\"image\" data-media-id=\""+attrId+"\" data-file-name=\""+attrName+"\" data-media-src=\""+attrSrc+"\"></section>\n";
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

    // Pré-carrega duração nas miniaturas de vídeo e garante mudo absoluto na lista
    document.querySelectorAll('#livesongs tr[data-video-row="true"]').forEach(function(row) {
        var thumbVid = row.querySelector('video.thumb-video-preview');
        var slider = row.querySelector('.vid-progress-slider');
        var label = row.querySelector('.vid-time-label');
        if (thumbVid) {
            thumbVid.muted = true;
            thumbVid.defaultMuted = true;
            try { thumbVid.volume = 0; } catch(e) {}
            thumbVid.addEventListener('loadedmetadata', function() {
                if (thumbVid.duration && isFinite(thumbVid.duration)) {
                    if (slider) slider.max = thumbVid.duration;
                    if (label) label.textContent = formatarTempoVideo(0) + ' / ' + formatarTempoVideo(thumbVid.duration);
                }
            });
        }
    });

    $('#livesongs > tbody > tr').click(function(e) { 
        if ($(e.target).closest('.video-ctrl-box').length > 0) return;
        projecaoAtiva = parseInt($(this).attr("data-id"));
        mudaProjecaoAtiva();
    });

    // Preserva a estrofe/slide ativo caso seja válido, impedindo retorno indesejado à tela padrão
    if (typeof projecaoAtiva !== 'number' || projecaoAtiva < 0 || projecaoAtiva >= f) {
        projecaoAtiva = 0;
    }
    mudaProjecaoAtiva();
    updateViewSlides(projecaoAtiva);
}

function updateViewSlides(targetSlide){
    var slide = (typeof targetSlide === 'number') ? targetSlide : projecaoAtiva;
    broadcastCommand('RELOAD_SLIDES', { html: viewSlides, currentSlide: slide });
}

function mudaProjecaoAtiva(){ 
    $('#livesongs > tbody > tr').each(function(i, item) { 
        if($(item).attr("data-id") == projecaoAtiva){
            $(item).addClass("active");
            var sb = document.getElementById('scrollblock');
            if (sb && $('#live').hasClass('active')) {
                var offset = $(item).offset();
                var tableOffset = $('#livesongs').offset();
                if (offset && tableOffset) {
                    sb.scrollTop = Math.max(0, offset.top - tableOffset.top - 40);
                }
            }
        } else {
            $(item).removeClass("active");
            var btnT = item.querySelector ? item.querySelector('.btn-vid-toggle') : null;
            if (btnT) definirEstadoBotaoPlayPause(btnT, true);
        }
    });
    
    if (!isFrozen) {
        broadcastCommand('CHANGE_SLIDE', projecaoAtiva);
    } else {
        // Quando congelado, atualiza apenas a prévia local para preparar o próximo slide
        var iframePreview = document.getElementById('iframeProjection') || document.getElementById('viewIframe');
        if (iframePreview && iframePreview.contentWindow) {
            try {
                iframePreview.contentWindow.postMessage(JSON.stringify({
                    host: 'projection-html5',
                    function: 'CHANGE_SLIDE',
                    data: projecaoAtiva,
                    timestamp: Date.now()
                }), "*");
            } catch(e) {}
        }
    }
}

function reloadProjectionList(){
    $('#projections tbody').html("");

    if (!Array.isArray(projecao) || projecao.length === 0) {
        $('#no-projection-msg').show();
    } else {
        $('#no-projection-msg').hide();
    }

    $.each(projecao, function(i, item) {
        var removeBtn = '<button type="button" class="btn btn-sm btn-link p-0 text-danger float-right btn-remover-projecao" data-index="'+i+'" style="cursor: pointer; line-height: 1;" title="Remover da lista"><i class="fas fa-times-circle"></i></button>';
        if(item.type == "s"){
            if (dados[item.folderId] && dados[item.folderId].songs && dados[item.folderId].songs[item.id]) {
                $('#projections tbody').append('<tr data-id="'+i+'"><td>'+dados[item.folderId].songs[item.id].title + removeBtn + '</td></tr>');
            }
        } else if(item.type == "b"){
            var bLabel = (typeof bible !== 'undefined' && bible && bible[item.b]) ? bible[item.b].name : "Texto Bíblico";
            $('#projections tbody').append('<tr data-id="'+i+'"><td>'+bLabel+' '+(item.c+1)+':'+(item.from+1)+'-'+(item.to+1) + removeBtn + '</td></tr>');
        } else if(item.type == "i"){
            var mItem = item.mediaItem || (item.folderId >= 0 && dados[item.folderId] && dados[item.folderId].media ? dados[item.folderId].media[item.id] : imagens[item.id]);
            var mName = mItem ? (mItem.name || "Mídia") : "Mídia";
            var isVid = mItem ? (mItem.type === "video" || isVideoFile(mItem.src || mItem.image || mItem.fileName)) : false;
            var iconHtml = isVid ? '<i class="fas fa-video text-info"></i> ' : '<i class="fas fa-image text-warning"></i> ';
            $('#projections tbody').append('<tr data-id="'+i+'"><td>'+iconHtml + mName + removeBtn + '</td></tr>');
        } else if(item.type == "w"){
            var wItem = item.warningItem || (item.folderId >= 0 && dados[item.folderId] && dados[item.folderId].warnings ? dados[item.folderId].warnings[item.id] : avisos[item.id]);
            var wName = wItem ? (wItem.name || "Aviso") : "Aviso";
            $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-exclamation-triangle text-warning"></i> '+wName + removeBtn + '</td></tr>');
        }
    });

    generateLiveList();
}

// Configuração de eventos da barra de projeção e lista para projeção (delegados)
$(document).ready(function() {
    $('#projections').off('click', 'tbody > tr > td:first-child').on('click', 'tbody > tr > td:first-child', function(e) {
        if ($(e.target).closest('.btn-remover-projecao').length > 0) return;
        var gotoIdx = parseInt($(this).attr("data-goto"));
        if (!isNaN(gotoIdx)) {
            projecaoAtiva = gotoIdx;
            mudaProjecaoAtiva();
        }
    });

    $('#projections').off('click', '.btn-remover-projecao').on('click', '.btn-remover-projecao', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var index = parseInt($(this).attr('data-index'));
        if (!isNaN(index) && index >= 0 && index < projecao.length) {
            projecao.splice(index, 1);
            if (projecao.length === 0) {
                projecaoAtiva = 0;
            }
            reloadProjectionList();
        }
    });

    $('#btnLaunchView, #btnTelao, #btnLaunchTelao, [data-action="start-projection"]').off('click').on('click', function(e) {
        e.preventDefault();
        startProjection();
    });

    $("#btnLaunchObs").off('click').on('click', function(e) {
        if (e && e.preventDefault) e.preventDefault();
        windowObs = window.open("obs.html", "OBS_Projection", "width=1920,height=1080,resizable=yes");
        if (windowObs) {
            try { windowObs.opener = window; } catch(err){}
            try { windowObs.focus(); } catch(err){}
            setTimeout(function() { updateViewSlides(projecaoAtiva); }, 350);
            setTimeout(function() { updateViewSlides(projecaoAtiva); }, 900);
        }
    });

    $('#btnBlackout').click(function() {
        toggleBlackout();
    });

    $('#btnFreeze').click(function() {
        toggleFreeze();
    });

    // Controles de reprodução de vídeo na lista Ao Vivo (#livesongs)
    $('#livesongs').off('click', '.btn-vid-toggle').on('click', '.btn-vid-toggle', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var box = this.closest('.video-ctrl-box');
        if (!box) return;
        enviarComandoControleVideo(parseInt(box.getAttribute('data-slide-id'), 10), 'toggle');
    });

    $('#livesongs').off('click', '.btn-vid-restart').on('click', '.btn-vid-restart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var box = this.closest('.video-ctrl-box');
        if (!box) return;
        enviarComandoControleVideo(parseInt(box.getAttribute('data-slide-id'), 10), 'restart');
    });

    $('#livesongs').off('click', '.btn-vid-back10').on('click', '.btn-vid-back10', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var box = this.closest('.video-ctrl-box');
        if (!box) return;
        enviarComandoControleVideo(parseInt(box.getAttribute('data-slide-id'), 10), 'seekBy', -10);
    });

    $('#livesongs').off('click', '.btn-vid-fwd10').on('click', '.btn-vid-fwd10', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var box = this.closest('.video-ctrl-box');
        if (!box) return;
        enviarComandoControleVideo(parseInt(box.getAttribute('data-slide-id'), 10), 'seekBy', 10);
    });

    $('#livesongs').off('mousedown touchstart', '.vid-progress-slider').on('mousedown touchstart', '.vid-progress-slider', function(e) {
        e.stopPropagation();
        this.dataset.dragging = 'true';
    });

    $('#livesongs').off('input', '.vid-progress-slider').on('input', '.vid-progress-slider', function(e) {
        e.stopPropagation();
        var box = this.closest('.video-ctrl-box');
        var label = box ? box.querySelector('.vid-time-label') : null;
        if (label) {
            label.textContent = formatarTempoVideo(parseFloat(this.value) || 0) + ' / ' + formatarTempoVideo(parseFloat(this.max) || 0);
        }
    });

    $('#livesongs').off('change', '.vid-progress-slider').on('change', '.vid-progress-slider', function(e) {
        e.stopPropagation();
        delete this.dataset.dragging;
        var box = this.closest('.video-ctrl-box');
        if (!box) return;
        enviarComandoControleVideo(parseInt(box.getAttribute('data-slide-id'), 10), 'seek', parseFloat(this.value) || 0);
    });

    $('#livesongs').off('mouseup touchend', '.vid-progress-slider').on('mouseup touchend', '.vid-progress-slider', function(e) {
        e.stopPropagation();
        delete this.dataset.dragging;
    });

    $('#livesongs').off('click', '.vid-progress-slider').on('click', '.vid-progress-slider', function(e) {
        e.stopPropagation();
    });
});
