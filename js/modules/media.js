// ==========================================
// MÓDULO: MEDIA (Vídeos, Imagens, Pastas Automáticas & Visualizador)
// ==========================================

var mediaBlobUrls = {}; // Cache de Blob URLs em memória na janela principal
var rawBlobsCache = {}; // Cache de Blobs/Files com MIME types válidos

// Listas de arquivos escaneados automaticamente
var autoVideosFiles = [];
var autoImagensFiles = [];
var lastVideosFingerprint = "";
var lastImagensFingerprint = "";

// Handles de pastas monitoradas
var dirHandleSoftware = null; // Pasta geral ou raiz
var dirHandleVideos = null;   // Pasta dedicada de vídeos
var dirHandleImagens = null;  // Pasta dedicada de imagens

// Controle de corte e proporção 16:9
var currentCropImage = null;
var currentCropFileName = "";

// Formata caminho relativo para mídias internas do sistema
function formatMediaUrl(file) {
    if (!file) return "";
    if (file.startsWith("data:") || file.startsWith("blob:") || file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/") || file.startsWith("imagens/")) {
        return file;
    }
    return "imagens/" + file;
}
window.formatMediaUrl = formatMediaUrl;

// Verifica se um nome ou URL corresponde a um formato de vídeo
function isVideoFile(urlOrName) {
    if (!urlOrName) return false;
    var str = urlOrName.toLowerCase();
    return str.includes(".mp4") || str.includes(".avi") || str.startsWith("data:video/") || str.startsWith("blob:video/");
}

// Valida formatos homologados: MP4, AVI, JPG, JPEG, PNG, GIF, WEBP
function isFormatoPermitido(fileName, mimeType) {
    var ext = "";
    if (fileName) {
        var parts = fileName.toLowerCase().split('.');
        if (parts.length > 1) {
            ext = parts.pop();
        }
    }
    var permitidos = ['mp4', 'avi', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (ext && permitidos.indexOf(ext) !== -1) return true;

    if (mimeType) {
        var m = mimeType.toLowerCase();
        var mimes = [
            'video/mp4', 'video/avi', 'video/x-msvideo',
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
        ];
        if (mimes.some(val => m.startsWith(val))) return true;
    }
    return false;
}

// Injeta MIME type explícito no Blob para que navegadores Windows/Chromium engatem os demuxers corretos
function garantirBlobComMimeType(file, fileName) {
    if (!file) return null;
    var name = fileName || file.name || "";
    var ext = name.split('.').pop().toLowerCase();
    var mime = file.type;

    if (!mime || mime === "" || mime === "application/octet-stream") {
        if (ext === 'mp4') mime = 'video/mp4';
        else if (ext === 'avi') mime = 'video/x-msvideo';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'png') mime = 'image/png';
        else if (ext === 'gif') mime = 'image/gif';
        else if (ext === 'webp') mime = 'image/webp';
    }

    if (mime && mime !== file.type && typeof file.slice === 'function') {
        return file.slice(0, file.size, mime);
    }
    return file;
}

// Estado de permissão das pastas monitoradas
var autoFolderPermVideos = 'unknown';
var autoFolderPermImagens = 'unknown';
var autoFolderPermSoftware = 'unknown';

function converterDataUrlParaBlob(dataUrl, fallbackMime) {
    try {
        var parts = dataUrl.split(',');
        var byteString = atob(parts[1]);
        var mimeMatch = parts[0].match(/:(.*?);/);
        var mime = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : (fallbackMime || 'application/octet-stream');
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    } catch (e) {
        return null;
    }
}

// Expõe para a janela do telão (view.html) acesso direto aos Blobs em memória
window.obterBlobParaTelao = function(mediaId, fileName) {
    if (mediaId && rawBlobsCache[mediaId]) {
        return rawBlobsCache[mediaId];
    }
    for (var i = 0; i < autoVideosFiles.length; i++) {
        var v = autoVideosFiles[i];
        if ((mediaId && v.id === mediaId) || (fileName && v.fileName === fileName)) {
            if (v.file) {
                var b = garantirBlobComMimeType(v.file, v.fileName);
                rawBlobsCache[v.id] = b;
                return b;
            }
        }
    }
    for (var j = 0; j < autoImagensFiles.length; j++) {
        var im = autoImagensFiles[j];
        if ((mediaId && im.id === mediaId) || (fileName && im.fileName === fileName)) {
            if (im.file) {
                var b2 = garantirBlobComMimeType(im.file, im.fileName);
                rawBlobsCache[im.id] = b2;
                return b2;
            }
        }
    }
    return null;
};

// Versão assíncrona completa para responder requisições do Telão (inclui MediaDB e FileHandles)
async function obterBlobAssincronoParaTelao(mediaId, fileName) {
    var syncBlob = window.obterBlobParaTelao(mediaId, fileName);
    if (syncBlob) return syncBlob;

    var candidato = null;
    if (typeof imagens !== 'undefined' && Array.isArray(imagens)) {
        for (var i = 0; i < imagens.length; i++) {
            var m = imagens[i];
            if ((mediaId && m.id === mediaId) || (fileName && m.fileName === fileName)) {
                candidato = m;
                break;
            }
        }
    }
    if (!candidato && typeof dados !== 'undefined' && Array.isArray(dados)) {
        for (var p = 0; p < dados.length; p++) {
            var mList = dados[p].media;
            if (Array.isArray(mList)) {
                for (var k = 0; k < mList.length; k++) {
                    var item = mList[k];
                    if ((mediaId && item.id === mediaId) || (fileName && item.fileName === fileName)) {
                        candidato = item;
                        break;
                    }
                }
            }
            if (candidato) break;
        }
    }

    var lookupId = mediaId || (candidato ? candidato.id : null);
    var lookupName = fileName || (candidato ? (candidato.fileName || candidato.name) : "");

    if (candidato) {
        if (candidato.file && (candidato.file instanceof Blob || candidato.file instanceof File)) {
            var tb = garantirBlobComMimeType(candidato.file, lookupName);
            if (lookupId) rawBlobsCache[lookupId] = tb;
            return tb;
        }
        if (candidato.fileHandle && typeof candidato.fileHandle.getFile === 'function') {
            try {
                var fhFile = await candidato.fileHandle.getFile();
                var tb2 = garantirBlobComMimeType(fhFile, lookupName);
                if (lookupId) rawBlobsCache[lookupId] = tb2;
                return tb2;
            } catch(e){}
        }
    }

    if (lookupId) {
        try {
            await MediaDB.init();
            var stored = await MediaDB.get(lookupId);
            if (stored) {
                var extracted = null;
                if (typeof stored.getFile === 'function') {
                    extracted = await stored.getFile();
                } else if (stored instanceof Blob || stored instanceof File) {
                    extracted = stored;
                } else if (typeof stored === 'string' && stored.startsWith('data:')) {
                    extracted = converterDataUrlParaBlob(stored);
                }
                if (extracted) {
                    var tb3 = garantirBlobComMimeType(extracted, lookupName);
                    rawBlobsCache[lookupId] = tb3;
                    return tb3;
                }
            }
        } catch(e){}
    }
    return null;
}
window.obterBlobAssincronoParaTelao = obterBlobAssincronoParaTelao;

// Pré-hidrata mídias salvas manualmente do IndexedDB na inicialização
async function hidratarMidiasDoMediaDB() {
    try {
        await MediaDB.init();
        var listaTodos = [];
        if (typeof imagens !== 'undefined' && Array.isArray(imagens)) {
            listaTodos = listaTodos.concat(imagens);
        }
        if (typeof dados !== 'undefined' && Array.isArray(dados)) {
            dados.forEach(function(p) {
                if (Array.isArray(p.media)) listaTodos = listaTodos.concat(p.media);
            });
        }
        for (var i = 0; i < listaTodos.length; i++) {
            var item = listaTodos[i];
            if (item && item.id && !mediaBlobUrls[item.id] && !rawBlobsCache[item.id]) {
                await resolverUrlMidia(item);
            }
        }
    } catch(e){}
}
window.hidratarMidiasDoMediaDB = hidratarMidiasDoMediaDB;

// Resolve a URL de reprodução da mídia dinamicamente (Blob-First)
async function resolverUrlMidia(mediaItem) {
    if (!mediaItem) return "";

    var fileName = mediaItem.fileName || mediaItem.name || "";
    var isVid = (mediaItem.type === 'video' || isVideoFile(fileName));

    // 1. Reutiliza Blob URL ativo no cache se existente
    if (mediaItem.id && mediaBlobUrls[mediaItem.id]) {
        return mediaBlobUrls[mediaItem.id];
    }

    // 2. Se temos objeto File ou Blob disponível em memória
    var fileObj = mediaItem.file;
    if (!fileObj && mediaItem.id && rawBlobsCache[mediaItem.id]) {
        fileObj = rawBlobsCache[mediaItem.id];
    }

    // 3. Se temos handle nativo de arquivo (FileSystemFileHandle)
    if (!fileObj && mediaItem.fileHandle && typeof mediaItem.fileHandle.getFile === 'function') {
        try {
            fileObj = await mediaItem.fileHandle.getFile();
        } catch (e) {
            console.warn("Handle de arquivo não acessível:", e);
        }
    }

    // 4. Se temos no MediaDB (IndexedDB)
    if (!fileObj && mediaItem.id) {
        try {
            var stored = await MediaDB.get(mediaItem.id);
            if (stored) {
                if (typeof stored.getFile === 'function') {
                    fileObj = await stored.getFile();
                } else if (stored instanceof Blob || stored instanceof File) {
                    fileObj = stored;
                } else if (typeof stored === 'string') {
                    return stored;
                }
            }
        } catch(e) {
            console.warn("Erro ao buscar mídia no MediaDB:", e);
        }
    }

    // Se obtivemos o File/Blob, cria Blob URL tipado garantido com MIME type correto
    if (fileObj && (fileObj instanceof Blob || fileObj instanceof File)) {
        var typedBlob = garantirBlobComMimeType(fileObj, fileName);
        if (mediaItem.id) rawBlobsCache[mediaItem.id] = typedBlob;
        var url = URL.createObjectURL(typedBlob);
        if (mediaItem.id) mediaBlobUrls[mediaItem.id] = url;
        mediaItem.src = url;
        return url;
    }

    // 5. Se já é um URL válido (blob:, http:, data:)
    if (mediaItem.src && (mediaItem.src.startsWith("blob:") || mediaItem.src.startsWith("http://") || mediaItem.src.startsWith("https://") || mediaItem.src.startsWith("data:"))) {
        return mediaItem.src;
    }

    // 6. Fallback final: caminho relativo na pasta local do software
    if (mediaItem.fileName) {
        var folder = (mediaItem.folder === 'imagens' || !isVid) ? 'imagens/' : 'videos/';
        return folder + encodeURIComponent(mediaItem.fileName);
    }

    return mediaItem.src || mediaItem.image || "";
}

function resolverUrlMidiaSync(mediaItem) {
    if (!mediaItem) return "";

    var fileName = mediaItem.fileName || mediaItem.name || "";
    var isVid = (mediaItem.type === 'video' || isVideoFile(fileName));

    // 1. Se já temos Blob URL ativo no cache, usa imediatamente
    if (mediaItem.id && mediaBlobUrls[mediaItem.id]) {
        return mediaBlobUrls[mediaItem.id];
    }

    // 2. Se temos objeto File ou rawBlob no cache, gera o Blob URL
    var fileObj = mediaItem.file || (mediaItem.id ? rawBlobsCache[mediaItem.id] : null);
    if (fileObj && (fileObj instanceof Blob || fileObj instanceof File)) {
        var typedBlob = garantirBlobComMimeType(fileObj, fileName);
        if (mediaItem.id) rawBlobsCache[mediaItem.id] = typedBlob;
        var bUrl = URL.createObjectURL(typedBlob);
        if (mediaItem.id) mediaBlobUrls[mediaItem.id] = bUrl;
        return bUrl;
    }

    // 3. Se o item já tem um src válido em memória
    if (mediaItem.src && (mediaItem.src.startsWith("blob:") || mediaItem.src.startsWith("http://") || mediaItem.src.startsWith("https://") || mediaItem.src.startsWith("data:"))) {
        return mediaItem.src;
    }

    // 4. Fallback para caminho relativo
    if (mediaItem.fileName) {
        var folder = (mediaItem.folder === 'imagens' || !isVid) ? 'imagens/' : 'videos/';
        return folder + encodeURIComponent(mediaItem.fileName);
    }

    return mediaItem.src || mediaItem.image || "";
}

function salvarMetadadosPastasAuto() {
    try {
        localStorage.setItem('autoFoldersMeta', JSON.stringify({
            softwareName: dirHandleSoftware ? dirHandleSoftware.name : "",
            videosName: dirHandleVideos ? dirHandleVideos.name : "",
            imagensName: dirHandleImagens ? dirHandleImagens.name : ""
        }));
    } catch(e){}
}

function obterNomePastaSalva(tipo) {
    if (tipo === 'videos' && dirHandleVideos) return dirHandleVideos.name;
    if (tipo === 'imagens' && dirHandleImagens) return dirHandleImagens.name;
    if (tipo === 'software' && dirHandleSoftware) return dirHandleSoftware.name;
    try {
        var meta = JSON.parse(localStorage.getItem('autoFoldersMeta') || '{}');
        if (tipo === 'videos') return meta.videosName || "";
        if (tipo === 'imagens') return meta.imagensName || "";
        if (tipo === 'software') return meta.softwareName || "";
    } catch(e){}
    return "";
}

async function garantirPermissaoLeituraHandle(handle) {
    if (!handle) return 'none';
    try {
        if (typeof handle.queryPermission === 'function') {
            var atual = await handle.queryPermission({ mode: 'read' });
            if (atual === 'granted') return 'granted';
        }
        if (typeof handle.requestPermission === 'function') {
            return await handle.requestPermission({ mode: 'read' });
        }
    } catch(e) {}
    return 'prompt';
}

async function reconectarPastasSalvas() {
    var concedeuAlguma = false;
    if (dirHandleSoftware) {
        autoFolderPermSoftware = await garantirPermissaoLeituraHandle(dirHandleSoftware);
        if (autoFolderPermSoftware === 'granted') concedeuAlguma = true;
    }
    if (dirHandleVideos) {
        autoFolderPermVideos = await garantirPermissaoLeituraHandle(dirHandleVideos);
        if (autoFolderPermVideos === 'granted') concedeuAlguma = true;
    }
    if (dirHandleImagens) {
        autoFolderPermImagens = await garantirPermissaoLeituraHandle(dirHandleImagens);
        if (autoFolderPermImagens === 'granted') concedeuAlguma = true;
    }
    if (concedeuAlguma) {
        await escanearPastasAutomaticas();
    } else {
        atualizarIndicadorPastasAuto();
        renderizarItensPastasAutomaticas();
    }
    return concedeuAlguma;
}
window.reconectarPastasSalvas = reconectarPastasSalvas;

// Vincula a pasta raiz do software ou pasta compartilhada
async function vincularPastaSoftware(forcarEscolha) {
    if (!window.showDirectoryPicker) {
        alert("Seu navegador não suporta a File System Access API para vincular pastas diretamente.");
        return;
    }
    try {
        if (!forcarEscolha && dirHandleSoftware && typeof dirHandleSoftware.requestPermission === 'function') {
            try {
                var perm = await dirHandleSoftware.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    perm = await dirHandleSoftware.requestPermission({ mode: 'read' });
                }
                autoFolderPermSoftware = perm;
                if (perm === 'granted') {
                    await reconectarPastasSalvas();
                    return;
                }
            } catch(e) {}
        }

        var dir = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });
        if (dir) {
            dirHandleSoftware = dir;
            autoFolderPermSoftware = 'granted';
            await MediaDB.init();
            await MediaDB.save("app_dir_handle_root", dir);

            try {
                dirHandleVideos = await dir.getDirectoryHandle('videos', { create: false });
                autoFolderPermVideos = 'granted';
                await MediaDB.save("app_dir_handle_videos", dirHandleVideos);
            } catch(e) { }

            try {
                dirHandleImagens = await dir.getDirectoryHandle('imagens', { create: false });
                autoFolderPermImagens = 'granted';
                await MediaDB.save("app_dir_handle_imagens", dirHandleImagens);
            } catch(e) { }

            salvarMetadadosPastasAuto();

            // Vincula automaticamente data.json caso esteja presente
            if (!fileHandle) {
                try {
                    var autoJson = null;
                    try {
                        var dataSub = await dir.getDirectoryHandle('data');
                        autoJson = await dataSub.getFileHandle('data.json');
                    } catch(e) {
                        autoJson = await dir.getFileHandle('data.json');
                    }
                    if (autoJson) {
                        fileHandle = autoJson;
                        await MediaDB.save("app_linked_file_handle", fileHandle);
                        atualizarIndicadorVinculo();
                        marcarAlteracoesPendentes(false, true);
                    }
                } catch(e){}
            }

            atualizarIndicadorPastasAuto();
            await escanearPastasAutomaticas();
        }
    } catch(err) {
        if (err.name !== 'AbortError') console.warn("Seleção de pasta cancelada:", err);
    }
}

// Vincula uma pasta dedicada de Vídeos selecionada pelo operador
async function vincularPastaVideos(forcarEscolha) {
    if (!window.showDirectoryPicker) {
        alert("Seu navegador não suporta a File System Access API para vincular pastas diretamente.");
        return;
    }
    try {
        if (!forcarEscolha && dirHandleVideos) {
            var p = await garantirPermissaoLeituraHandle(dirHandleVideos);
            autoFolderPermVideos = p;
            if (p === 'granted') {
                atualizarIndicadorPastasAuto();
                await escanearPastasAutomaticas();
                return;
            }
        } else if (!forcarEscolha && !dirHandleVideos && dirHandleSoftware) {
            var okSoft = await reconectarPastasSalvas();
            if (okSoft) return;
        }
        var dir = await window.showDirectoryPicker({ mode: 'read', startIn: 'videos' });
        if (dir) {
            dirHandleVideos = dir;
            autoFolderPermVideos = 'granted';
            lastVideosFingerprint = "__force_reload__";
            await MediaDB.init();
            await MediaDB.save("app_dir_handle_videos", dir);
            salvarMetadadosPastasAuto();
            atualizarIndicadorPastasAuto();
            await escanearPastasAutomaticas();
        }
    } catch(err) {
        if (err.name !== 'AbortError') console.warn("Seleção da pasta de vídeos cancelada:", err);
    }
}

// Vincula uma pasta dedicada de Imagens selecionada pelo operador
async function vincularPastaImagens(forcarEscolha) {
    if (!window.showDirectoryPicker) {
        alert("Seu navegador não suporta a File System Access API para vincular pastas diretamente.");
        return;
    }
    try {
        if (!forcarEscolha && dirHandleImagens) {
            var p = await garantirPermissaoLeituraHandle(dirHandleImagens);
            autoFolderPermImagens = p;
            if (p === 'granted') {
                atualizarIndicadorPastasAuto();
                await escanearPastasAutomaticas();
                return;
            }
        } else if (!forcarEscolha && !dirHandleImagens && dirHandleSoftware) {
            var okSoft = await reconectarPastasSalvas();
            if (okSoft) return;
        }
        var dir = await window.showDirectoryPicker({ mode: 'read', startIn: 'pictures' });
        if (dir) {
            dirHandleImagens = dir;
            autoFolderPermImagens = 'granted';
            lastImagensFingerprint = "__force_reload__";
            await MediaDB.init();
            await MediaDB.save("app_dir_handle_imagens", dir);
            salvarMetadadosPastasAuto();
            atualizarIndicadorPastasAuto();
            await escanearPastasAutomaticas();
        }
    } catch(err) {
        if (err.name !== 'AbortError') console.warn("Seleção da pasta de imagens cancelada:", err);
    }
}

function atualizarIndicadorPastasAuto(permStatus) {
    var badge = $('#autoFoldersBadge');
    var icon = $('#autoFoldersIcon');
    var text = $('#autoFoldersText');

    var temPrompt = (permStatus === 'prompt') ||
        (dirHandleVideos && autoFolderPermVideos === 'prompt') ||
        (dirHandleImagens && autoFolderPermImagens === 'prompt') ||
        (dirHandleSoftware && autoFolderPermSoftware === 'prompt');

    if (temPrompt) {
        var temCacheLocal = (autoVideosFiles.length > 0 || autoImagensFiles.length > 0);
        badge.removeClass('badge-secondary badge-info badge-success').addClass('badge-warning');
        icon.removeClass('fa-folder fa-sync-alt text-white text-muted').addClass(temCacheLocal ? 'fa-database text-dark' : 'fa-exclamation-circle text-dark');
        text.text(temCacheLocal ? 'Pastas: Cache (Sincronizar)' : 'Pastas: Clique p/ Reconectar');
        badge.attr('title', temCacheLocal
            ? 'Vídeos e imagens em cache prontos para uso. Clique para sincronizar novos arquivos da pasta no disco.'
            : 'Suas pastas foram lembradas. Clique para liberar o acesso após reiniciar o navegador.');
        return;
    }

    if (dirHandleVideos || dirHandleImagens || dirHandleSoftware) {
        badge.removeClass('badge-secondary badge-warning').addClass('badge-info');
        icon.removeClass('fa-folder fa-unlink text-muted fa-exclamation-circle fa-database text-dark').addClass('fa-sync-alt text-white');
        text.text('Pastas: Monitorando');
        badge.attr('title', 'Sincronização automática ativa.');
        $('#bannerVincularData').removeClass('d-flex').css('display', 'none');
    } else {
        badge.removeClass('badge-info badge-success badge-warning').addClass('badge-secondary');
        icon.removeClass('fa-sync-alt text-white fa-exclamation-circle fa-database text-dark').addClass('fa-folder text-muted');
        text.text('Pastas: Desconectadas');
        badge.attr('title', 'Clique para vincular as pastas locais de vídeos e imagens.');
    }
}

// Controle de varredura semáforo, ordenação determinística e preservação de seleção
var isScanningAutoFolders = false;
var lastAutoScanCompletedAt = 0;
var selectedAutoItemState = { tipo: '', id: '', fileName: '' };

window.definirItemAutoSelecionado = function(tipo, item) {
    if ((tipo === 'auto-video' || tipo === 'auto-image') && item) {
        selectedAutoItemState = {
            tipo: tipo,
            id: item.id || '',
            fileName: item.fileName || ''
        };
    } else {
        selectedAutoItemState = { tipo: '', id: '', fileName: '' };
    }
};

window.solicitarScanPastasDebounce = function() {
    if (isScanningAutoFolders) return;
    if (Date.now() - lastAutoScanCompletedAt < 2500) return;
    escanearPastasAutomaticas();
};

function compararArquivosDeterministico(a, b) {
    var nomeA = (a && (a.fileName || a.name)) ? String(a.fileName || a.name) : "";
    var nomeB = (b && (b.fileName || b.name)) ? String(b.fileName || b.name) : "";
    var cmp = nomeA.localeCompare(nomeB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return String((a && a.folder) || "").localeCompare(String((b && b.folder) || ""), 'pt-BR');
}

function gerarFingerprintPasta(lista) {
    return (lista || []).map(function(item) {
        return (item.fileName || '') + ':' + (item.modTime || 0) + ':' + (item.fileSize || 0) + ':' + (item.folder || '');
    }).join('|');
}

// Salva metadados das pastas automáticas e restaura mídias em cache offline via IndexedDB
function salvarCacheMetadadosPastas(storageKey, lista) {
    try {
        var meta = (lista || []).map(function(item) {
            return {
                id: item.id,
                name: item.name,
                fileName: item.fileName,
                fileSize: item.fileSize || 0,
                modTime: item.modTime || 0,
                type: item.type,
                folder: item.folder || '',
                isAutoFolder: true
            };
        });
        localStorage.setItem(storageKey, JSON.stringify(meta));
    } catch(e) {}
}

async function restaurarCachePastasAutomaticas() {
    try {
        await MediaDB.init();
    } catch(e) { return; }

    var carregou = false;

    async function hidratarLista(storageKey, targetArr, fallbackFolder, defaultType) {
        var raw = null;
        try { raw = localStorage.getItem(storageKey); } catch(e) {}
        if (!raw) return;
        var metaList = [];
        try { metaList = JSON.parse(raw); } catch(e) { return; }
        if (!Array.isArray(metaList) || metaList.length === 0) return;

        targetArr.length = 0;
        var seenCacheIds = new Set();
        for (var i = 0; i < metaList.length; i++) {
            var m = metaList[i];
            if (!m || !m.id) continue;
            var cacheDedup = (m.fileName || m.id).toLowerCase();
            if (seenCacheIds.has(cacheDedup)) continue;
            seenCacheIds.add(cacheDedup);
            var blob = null;
            try {
                var stored = await MediaDB.get(m.id);
                if (stored instanceof Blob || stored instanceof File) {
                    blob = garantirBlobComMimeType(stored, m.fileName || m.name);
                }
            } catch(e) {}
            if (blob) {
                rawBlobsCache[m.id] = blob;
                if (!mediaBlobUrls[m.id]) {
                    mediaBlobUrls[m.id] = URL.createObjectURL(blob);
                }
                targetArr.push({
                    id: m.id,
                    name: m.name,
                    fileName: m.fileName,
                    fileSize: m.fileSize || blob.size || 0,
                    modTime: m.modTime || 0,
                    type: m.type || defaultType,
                    file: blob,
                    folder: m.folder || fallbackFolder,
                    isAutoFolder: true,
                    fromCache: true,
                    src: mediaBlobUrls[m.id]
                });
                carregou = true;
            }
        }
        targetArr.sort(compararArquivosDeterministico);
    }

    if (autoVideosFiles.length === 0) {
        await hidratarLista('autoVideosCacheMeta', autoVideosFiles, 'videos', 'video');
        if (autoVideosFiles.length > 0) lastVideosFingerprint = gerarFingerprintPasta(autoVideosFiles);
    }
    if (autoImagensFiles.length === 0) {
        await hidratarLista('autoImagensCacheMeta', autoImagensFiles, 'imagens', 'image');
        if (autoImagensFiles.length > 0) lastImagensFingerprint = gerarFingerprintPasta(autoImagensFiles);
    }

    if (carregou) {
        atualizarIndicadorPastasAuto();
        renderizarItensPastasAutomaticas();
        if (typeof window.filtrarArvoreSemReabrir === 'function') {
            window.filtrarArvoreSemReabrir();
        }
    }
}
window.restaurarCachePastasAutomaticas = restaurarCachePastasAutomaticas;

// Escaneia periodicamente as pastas de mídias de forma adaptativa, ordenada e sem concorrência
async function escanearPastasAutomaticas() {
    if (!dirHandleSoftware && !dirHandleVideos && !dirHandleImagens) return;
    if (isScanningAutoFolders) return;

    isScanningAutoFolders = true;
    try {
        var prevPermV = autoFolderPermVideos;
        var prevPermI = autoFolderPermImagens;
        var prevPermS = autoFolderPermSoftware;

        var prevVidMap = {};
        (autoVideosFiles || []).forEach(function(it) { if (it && it.id) prevVidMap[it.id] = it; });
        var prevImgMap = {};
        (autoImagensFiles || []).forEach(function(it) { if (it && it.id) prevImgMap[it.id] = it; });

        var novosVideos = [];
        var novasImagens = [];
        var arquivosProcessados = new Set();
        var leuVideos = false;
        var leuImagens = false;

        async function verificarPermissao(handle) {
            if (!handle) return 'none';
            if (typeof handle.queryPermission !== 'function') return 'granted';
            try {
                return await handle.queryPermission({ mode: 'read' });
            } catch(e) {
                return 'prompt';
            }
        }

        async function processarArquivo(nome, entry, pastaOrigem, tipoForcado) {
            if (!entry || entry.kind !== 'file') return;

            var parts = nome.split('.');
            var ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
            if (!isFormatoPermitido(nome)) return;

            var isVidEntry = (ext === 'mp4' || ext === 'avi') && tipoForcado !== 'image';
            var isImgEntry = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && tipoForcado !== 'video';
            if (!isVidEntry && !isImgEntry) return;

            // Deduplica pelo tipo de mídia + nome em minúsculas, evitando duplicidade caso duas pastas apontem para os mesmos arquivos
            var chaveUnica = (isVidEntry ? "vid:" : "img:") + nome.toLowerCase();
            if (arquivosProcessados.has(chaveUnica)) return;

            arquivosProcessados.add(chaveUnica);
            var file = null;
            try {
                file = await entry.getFile();
            } catch(e) {
                return;
            }

            var cleanName = nome.replace(/\.[^/.]+$/, "");
            var modTime = file ? (file.lastModified || 0) : 0;
            var size = file ? (file.size || 0) : 0;

            // É vídeo se a extensão for mp4/avi ou tipoForcado for 'video'
            if ((ext === 'mp4' || ext === 'avi') && tipoForcado !== 'image') {
                var idVid = "auto_vid_" + nome;
                var prevVid = prevVidMap[idVid];
                var vidCacheValido = prevVid && prevVid.modTime === modTime && prevVid.fileSize === size && rawBlobsCache[idVid] && mediaBlobUrls[idVid];

                if (!vidCacheValido) {
                    var typedBlob = file ? garantirBlobComMimeType(file, nome) : null;
                    if (typedBlob) {
                        rawBlobsCache[idVid] = typedBlob;
                        mediaBlobUrls[idVid] = URL.createObjectURL(typedBlob);
                        try { MediaDB.save(idVid, typedBlob); } catch(e){}
                    }
                }

                novosVideos.push({
                    id: idVid,
                    name: cleanName,
                    fileName: nome,
                    fileSize: size,
                    modTime: modTime,
                    type: "video",
                    fileHandle: entry,
                    file: rawBlobsCache[idVid] || file,
                    folder: pastaOrigem || "videos",
                    isAutoFolder: true,
                    src: mediaBlobUrls[idVid] || ""
                });
            }
            // É imagem se a extensão for permitida de imagem
            else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) && tipoForcado !== 'video') {
                var idImg = "auto_img_" + nome;
                var prevImg = prevImgMap[idImg];
                var imgCacheValido = prevImg && prevImg.modTime === modTime && prevImg.fileSize === size && rawBlobsCache[idImg] && mediaBlobUrls[idImg];

                if (!imgCacheValido) {
                    var typedImgBlob = file ? garantirBlobComMimeType(file, nome) : null;
                    if (typedImgBlob) {
                        rawBlobsCache[idImg] = typedImgBlob;
                        mediaBlobUrls[idImg] = URL.createObjectURL(typedImgBlob);
                        try { MediaDB.save(idImg, typedImgBlob); } catch(e){}
                    }
                }

                novasImagens.push({
                    id: idImg,
                    name: cleanName,
                    fileName: nome,
                    fileSize: size,
                    modTime: modTime,
                    type: "image",
                    fileHandle: entry,
                    file: rawBlobsCache[idImg] || file,
                    folder: pastaOrigem || "imagens",
                    isAutoFolder: true,
                    src: mediaBlobUrls[idImg] || ""
                });
            }
        }

        // 1. Escaneia dirHandleVideos (se vinculado e autorizado)
        if (dirHandleVideos) {
            autoFolderPermVideos = await verificarPermissao(dirHandleVideos);
            if (autoFolderPermVideos === 'granted') {
                leuVideos = true;
                try {
                    for await (const [nome, entry] of dirHandleVideos.entries()) {
                        await processarArquivo(nome, entry, "videos", "video");
                    }
                } catch(e) {
                    console.warn("Erro ao ler dirHandleVideos:", e);
                }
            }
        }

        // 2. Escaneia dirHandleImagens (se vinculado e autorizado)
        if (dirHandleImagens) {
            autoFolderPermImagens = await verificarPermissao(dirHandleImagens);
            if (autoFolderPermImagens === 'granted') {
                leuImagens = true;
                try {
                    for await (const [nome, entry] of dirHandleImagens.entries()) {
                        await processarArquivo(nome, entry, "imagens", "image");
                    }
                } catch(e) {
                    console.warn("Erro ao ler dirHandleImagens:", e);
                }
            }
        }

        // 3. Escaneia dirHandleSoftware (pasta raiz ou pasta compartilhada)
        if (dirHandleSoftware) {
            autoFolderPermSoftware = await verificarPermissao(dirHandleSoftware);
            if (autoFolderPermSoftware === 'granted') {
                if (!dirHandleVideos) leuVideos = true;
                if (!dirHandleImagens) leuImagens = true;
                try {
                    for await (const [nome, entry] of dirHandleSoftware.entries()) {
                        if (entry.kind === 'file') {
                            if (nome === 'data.json' || nome === 'index.html' || nome === 'view.html' || nome === 'obs.html') continue;
                            await processarArquivo(nome, entry, "raiz", null);
                        } else if (entry.kind === 'directory') {
                            var subLower = nome.toLowerCase();
                            if (!dirHandleVideos && (subLower === 'videos' || subLower === 'video' || subLower === 'vids')) {
                                try {
                                    for await (const [sNome, sEntry] of entry.entries()) {
                                        await processarArquivo(sNome, sEntry, "videos", "video");
                                    }
                                } catch(e){}
                            }
                            if (!dirHandleImagens && (subLower === 'imagens' || subLower === 'images' || subLower === 'fotos' || subLower === 'pictures' || subLower === 'img')) {
                                try {
                                    for await (const [sNome, sEntry] of entry.entries()) {
                                        await processarArquivo(sNome, sEntry, "imagens", "image");
                                    }
                                } catch(e){}
                            }
                        }
                    }
                } catch(e) {
                    console.warn("Erro ao ler dirHandleSoftware raiz:", e);
                }
            }
        }

        atualizarIndicadorPastasAuto();

        novosVideos.sort(compararArquivosDeterministico);
        novasImagens.sort(compararArquivosDeterministico);

        var fpVid = gerarFingerprintPasta(novosVideos);
        var fpImg = gerarFingerprintPasta(novasImagens);

        var mudou = false;
        if (leuVideos) {
            if (fpVid !== lastVideosFingerprint) {
                lastVideosFingerprint = fpVid;
                autoVideosFiles = novosVideos;
                salvarCacheMetadadosPastas('autoVideosCacheMeta', novosVideos);
                mudou = true;
            } else {
                autoVideosFiles = novosVideos;
            }
        }
        if (leuImagens) {
            if (fpImg !== lastImagensFingerprint) {
                lastImagensFingerprint = fpImg;
                autoImagensFiles = novasImagens;
                salvarCacheMetadadosPastas('autoImagensCacheMeta', novasImagens);
                mudou = true;
            } else {
                autoImagensFiles = novasImagens;
            }
        }

        var permMudou = (prevPermV !== autoFolderPermVideos || prevPermI !== autoFolderPermImagens || prevPermS !== autoFolderPermSoftware);

        if (mudou || permMudou) {
            renderizarItensPastasAutomaticas();
            if (mudou && typeof window.filtrarArvoreSemReabrir === 'function') {
                window.filtrarArvoreSemReabrir();
            }
            if (mudou && typeof window.notificarCatalogoRemoto === 'function') {
                window.notificarCatalogoRemoto();
            }
        }
    } finally {
        isScanningAutoFolders = false;
        lastAutoScanCompletedAt = Date.now();
    }
}

function renderizarItensPastasAutomaticas() {
    var listaVid = document.getElementById('listaAutoVideos');
    var listaImg = document.getElementById('listaAutoImagens');
    var badgeVid = document.querySelector('.badge-count-videos');
    var badgeImg = document.querySelector('.badge-count-imagens');
    var songListEl = document.getElementById('songList');
    var prevScrollTop = songListEl ? songListEl.scrollTop : 0;

    // Preserva seleção atual nas pastas automáticas mesmo se um novo arquivo for detectado
    var selVidId = (selectedAutoItemState.tipo === 'auto-video') ? selectedAutoItemState.id : '';
    var selVidName = (selectedAutoItemState.tipo === 'auto-video') ? selectedAutoItemState.fileName : '';
    var selImgId = (selectedAutoItemState.tipo === 'auto-image') ? selectedAutoItemState.id : '';
    var selImgName = (selectedAutoItemState.tipo === 'auto-image') ? selectedAutoItemState.fileName : '';

    if (listaVid) {
        var domSelVid = listaVid.querySelector('li.selected');
        if (domSelVid) {
            selVidId = domSelVid.dataset.mediaId || selVidId;
            selVidName = domSelVid.dataset.fileName || selVidName;
        }
    }
    if (listaImg) {
        var domSelImg = listaImg.querySelector('li.selected');
        if (domSelImg) {
            selImgId = domSelImg.dataset.mediaId || selImgId;
            selImgName = domSelImg.dataset.fileName || selImgName;
        }
    }

    if (badgeVid) badgeVid.textContent = autoVideosFiles.length;
    if (badgeImg) badgeImg.textContent = autoImagensFiles.length;

    var vidPromptPendente = (dirHandleVideos && autoFolderPermVideos === 'prompt') || (!dirHandleVideos && dirHandleSoftware && autoFolderPermSoftware === 'prompt');
    var imgPromptPendente = (dirHandleImagens && autoFolderPermImagens === 'prompt') || (!dirHandleImagens && dirHandleSoftware && autoFolderPermSoftware === 'prompt');

    if (listaVid) {
        listaVid.innerHTML = '';
        if (autoVideosFiles.length === 0) {
            if (vidPromptPendente) {
                var nomeV = obterNomePastaSalva('videos') || obterNomePastaSalva('software') || 'Vídeos';
                listaVid.innerHTML = '<li class="p-2 text-center"><button type="button" class="btn btn-sm btn-warning font-weight-bold btn-vincular-pasta-videos"><i class="fas fa-unlock mr-1"></i> Reconectar: ' + nomeV + '</button><br><button type="button" class="btn btn-link btn-sm text-info p-0 mt-1 btn-trocar-pasta-videos">Trocar Pasta</button></li>';
            } else if (!dirHandleVideos && !dirHandleSoftware) {
                listaVid.innerHTML = '<li class="p-2 text-center text-muted"><button type="button" class="btn btn-sm btn-outline-info btn-vincular-pasta-videos"><i class="fas fa-folder-open mr-1"></i> Selecionar Pasta de Vídeos</button><br><small>Cole vídeos (.mp4, .avi) no seu computador.</small></li>';
            } else {
                listaVid.innerHTML = '<li class="p-2 text-muted text-center" style="font-size:0.85rem;"><em>Nenhum vídeo compatível na pasta</em><br><button type="button" class="btn btn-link btn-sm text-info btn-trocar-pasta-videos">Trocar Pasta</button></li>';
            }
        } else {
            if (vidPromptPendente) {
                var syncVidLi = document.createElement('li');
                syncVidLi.className = 'p-1 text-center';
                syncVidLi.style.listStyle = 'none';
                syncVidLi.innerHTML = '<button type="button" class="btn btn-sm btn-outline-warning btn-block btn-vincular-pasta-videos" style="font-size:0.78rem; padding:2px 6px;"><i class="fas fa-sync-alt mr-1"></i> Cache offline • Ler novos arquivos</button>';
                listaVid.appendChild(syncVidLi);
            }
            autoVideosFiles.forEach(function(item, index) {
                var li = document.createElement('li');
                li.innerHTML = '<i class="fas fa-file-video text-info mr-1"></i> ' + item.name;
                li.dataset.tipo = "auto-video";
                li.dataset.id = index;
                li.dataset.mediaId = item.id || "";
                li.dataset.fileName = item.fileName || "";
                if ((selVidId && item.id === selVidId) || (selVidName && item.fileName === selVidName)) {
                    li.classList.add('selected');
                }
                li.addEventListener('dblclick', function(e) { adicionarAProjecao(e, li, item, 'auto-video', index); });
                li.addEventListener('click', function(e) { selecionarItemDaLista(e, li, item, 'auto-video', index); });
                listaVid.appendChild(li);
            });
        }
    }

    if (listaImg) {
        listaImg.innerHTML = '';
        if (autoImagensFiles.length === 0) {
            if (imgPromptPendente) {
                var nomeI = obterNomePastaSalva('imagens') || obterNomePastaSalva('software') || 'Imagens';
                listaImg.innerHTML = '<li class="p-2 text-center"><button type="button" class="btn btn-sm btn-warning font-weight-bold btn-vincular-pasta-imagens"><i class="fas fa-unlock mr-1"></i> Reconectar: ' + nomeI + '</button><br><button type="button" class="btn btn-link btn-sm text-warning p-0 mt-1 btn-trocar-pasta-imagens">Trocar Pasta</button></li>';
            } else if (!dirHandleImagens && !dirHandleSoftware) {
                listaImg.innerHTML = '<li class="p-2 text-center text-muted"><button type="button" class="btn btn-sm btn-outline-warning btn-vincular-pasta-imagens"><i class="fas fa-folder-open mr-1"></i> Selecionar Pasta de Imagens</button><br><small>Cole imagens (.jpg, .png, etc.) no seu computador.</small></li>';
            } else {
                listaImg.innerHTML = '<li class="p-2 text-muted text-center" style="font-size:0.85rem;"><em>Nenhuma imagem compatível na pasta</em><br><button type="button" class="btn btn-link btn-sm text-warning btn-trocar-pasta-imagens">Trocar Pasta</button></li>';
            }
        } else {
            if (imgPromptPendente) {
                var syncImgLi = document.createElement('li');
                syncImgLi.className = 'p-1 text-center';
                syncImgLi.style.listStyle = 'none';
                syncImgLi.innerHTML = '<button type="button" class="btn btn-sm btn-outline-warning btn-block btn-vincular-pasta-imagens" style="font-size:0.78rem; padding:2px 6px;"><i class="fas fa-sync-alt mr-1"></i> Cache offline • Ler novos arquivos</button>';
                listaImg.appendChild(syncImgLi);
            }
            autoImagensFiles.forEach(function(item, index) {
                var li = document.createElement('li');
                li.innerHTML = '<i class="fas fa-file-image text-warning mr-1"></i> ' + item.name;
                li.dataset.tipo = "auto-image";
                li.dataset.id = index;
                li.dataset.mediaId = item.id || "";
                li.dataset.fileName = item.fileName || "";
                if ((selImgId && item.id === selImgId) || (selImgName && item.fileName === selImgName)) {
                    li.classList.add('selected');
                }
                li.addEventListener('dblclick', function(e) { adicionarAProjecao(e, li, item, 'auto-image', index); });
                li.addEventListener('click', function(e) { selecionarItemDaLista(e, li, item, 'auto-image', index); });
                listaImg.appendChild(li);
            });
        }
    }

    if (songListEl && prevScrollTop > 0) {
        songListEl.scrollTop = prevScrollTop;
    }
}

// Visualizador de mídias (Modal de Pré-visualização com decodificação H.264 garantida)
async function exibirVisualizadorMidia(mediaItem, tipo, itemId, folderId) {
    if (!mediaItem) return;

    var src = await resolverUrlMidia(mediaItem);
    if (!src) {
        alert("⚠️ Mídia não encontrada no computador:\n\nO arquivo original (" + (mediaItem.fileName || mediaItem.name || "") + ") não foi localizado. Ele pode ter sido movido, renomeado ou excluído do computador.\n\nComo o sistema apenas referencia o local original da mídia no seu computador, é necessário adicioná-la novamente no sistema.");
        return;
    }

    var fileName = mediaItem.fileName || mediaItem.name || "";
    var isVid = (mediaItem.type === "video" || isVideoFile(src) || isVideoFile(fileName));
    var videoEl = document.getElementById('mediaViewerVideo');
    var imgEl = document.getElementById('mediaViewerImg');

    if (isVid) {
        $(imgEl).hide().attr('src', '');
        if (videoEl) {
            videoEl.pause();
            videoEl.removeAttribute('src');
            while (videoEl.firstChild) {
                videoEl.removeChild(videoEl.firstChild);
            }

            var ext = fileName.split('.').pop().toLowerCase();
            var mime = (ext === 'avi') ? 'video/x-msvideo' : 'video/mp4';

            var sourceEl = document.createElement('source');
            sourceEl.src = src;
            sourceEl.type = mime;
            videoEl.appendChild(sourceEl);

            videoEl.src = src;
            $(videoEl).show();

            var alertDiv = document.getElementById('mediaViewerErrorAlert');
            if (alertDiv) $(alertDiv).hide();

            videoEl.onerror = function() {
                var err = videoEl.error;
                console.warn("Erro ao carregar vídeo:", err);
                var alertBox = document.getElementById('mediaViewerErrorAlert');
                if (!alertBox) {
                    alertBox = document.createElement('div');
                    alertBox.id = 'mediaViewerErrorAlert';
                    alertBox.className = 'alert alert-warning mt-2 text-left';
                    videoEl.parentNode.appendChild(alertBox);
                }
                alertBox.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i> <strong>Não foi possível reproduzir este vídeo:</strong> O arquivo pode estar corrompido ou utilizar um codec não suportado pelo navegador (ex: H.265/HEVC ou DivX). Para compatibilidade total na web, utilize vídeos MP4 codificados em <strong>H.264 (AVC)</strong> com áudio <strong>AAC</strong>.';
                $(alertBox).show();
            };

            videoEl.load();
        }
        $('#mediaViewerInfo').text("Vídeo • " + (mediaItem.name || "Vídeo"));
    } else {
        if (videoEl) {
            videoEl.pause();
            videoEl.removeAttribute('src');
            while (videoEl.firstChild) {
                videoEl.removeChild(videoEl.firstChild);
            }
            $(videoEl).hide();
            var alertDiv = document.getElementById('mediaViewerErrorAlert');
            if (alertDiv) $(alertDiv).hide();
        }
        $(imgEl).attr('src', src).show();
        $('#mediaViewerInfo').text("Imagem • " + (mediaItem.name || "Imagem"));
    }

    $('#mediaViewerTitle').text(mediaItem.name || "Visualizador de Mídia");

    $('#btnAddToProjFromViewer').off('click').on('click', function() {
        adicionarAProjecao(null, null, mediaItem, tipo, itemId);
        $('#mediaViewerModal').modal('hide');
    });

    $('#mediaViewerModal').modal('show');
}

// Modal de recorte e enquadramento 16:9
function abrirModalCrop16x9(imageSrc, fileName, onConfirmCallback) {
    currentCropImage = imageSrc;
    currentCropFileName = fileName || "imagem";

    $('#cropSourceImg').attr('src', imageSrc);
    $('#cropModal16x9').modal('show');

    $('#btnConfirmCropMedia').off('click').on('click', function() {
        var canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        var ctx = canvas.getContext('2d');
        var img = new Image();
        img.onload = function() {
            var srcW = img.naturalWidth || img.width;
            var srcH = img.naturalHeight || img.height;
            var targetAspect = 16 / 9;
            var srcAspect = srcW / srcH;

            var drawW, drawH, drawX, drawY;
            if (srcAspect > targetAspect) {
                drawH = srcH;
                drawW = srcH * targetAspect;
                drawX = (srcW - drawW) / 2;
                drawY = 0;
            } else {
                drawW = srcW;
                drawH = srcW / targetAspect;
                drawX = 0;
                drawY = (srcH - drawH) / 2;
            }

            ctx.drawImage(img, drawX, drawY, drawW, drawH, 0, 0, 1920, 1080);
            var croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
            $('#cropModal16x9').modal('hide');
            if (onConfirmCallback) onConfirmCallback(croppedDataUrl);
        };
        img.src = imageSrc;
    });

    $('#btnCancelCropMedia').off('click').on('click', function() {
        $('#cropModal16x9').modal('hide');
        if (onConfirmCallback) onConfirmCallback(imageSrc);
    });
}

// ==========================================
// EVENTOS DE MÍDIA (Janela de Adição & Visualizador)
// ==========================================
$(document).ready(function() {
    $("#newImage").click(function(){
        $('#imageName').val('');
        $('#fileimage').val('');
        $('#newImageModal').modal('toggle');
    });

    $("#fileimage").on('change', function() {
        if (this.files && this.files[0]) {
            var f = this.files[0];
            if (!$('#imageName').val().trim()) {
                $('#imageName').val(f.name.replace(/\.[^/.]+$/, ""));
            }
        }
    });

    $('#newImageModal').on('hidden.bs.modal', function() {
        $('#imageName').val('');
        $('#fileimage').val('');
    });

    $('#btnResetCrop').on('click', function() {
        $('#cropZoom').val(100);
        $('#cropZoomVal').text('100');
        $('#cropPanX').val(0);
        $('#cropPanXVal').text('0');
        $('#cropPanY').val(0);
        $('#cropPanYVal').text('0');
    });

    // Confirmação de inclusão de mídia pela janela simples
    $("#confirmCreateImage").click(async function(){ 
        var name = $('#imageName').val().trim();
        var fileInput = document.getElementById("fileimage");
        var file = (fileInput && fileInput.files && fileInput.files.length > 0) ? fileInput.files[0] : null;
        var targetFolderId = parseInt($('#selectMediaFolder').val());

        if (!file) {
            alert("Por favor, selecione um arquivo de imagem ou vídeo no seu computador.");
            return;
        }
        if (!isFormatoPermitido(file.name, file.type)) {
            alert("Formato de arquivo não suportado. Os formatos permitidos são: MP4, AVI, JPG, JPEG, PNG, GIF, WEBP.");
            return;
        }
        if (!name) {
            name = file.name.replace(/\.[^/.]+$/, "");
        }

        var isVid = isVideoFile(file.name) || (file.type && file.type.startsWith("video/"));
        var mediaId = "media_" + Date.now();
        var typedBlob = garantirBlobComMimeType(file, file.name);
        rawBlobsCache[mediaId] = typedBlob;
        var blobUrl = URL.createObjectURL(typedBlob);
        mediaBlobUrls[mediaId] = blobUrl;

        // Salva Blob no IndexedDB para persistência e compartilhamento imediato com o telão
        try {
            await MediaDB.init();
            await MediaDB.save(mediaId, typedBlob);
        } catch (e) {
            console.warn("Erro ao salvar referência no MediaDB:", e);
        }

        var mediaObj = {
            id: mediaId,
            name: name,
            fileName: file.name,
            fileSize: file.size,
            type: isVid ? "video" : "image",
            isLocalRef: true,
            src: blobUrl,
            image: blobUrl,
            file: file
        };

        if (targetFolderId >= 0 && dados[targetFolderId]) {
            if (!dados[targetFolderId].media) dados[targetFolderId].media = [];
            dados[targetFolderId].media.push(mediaObj);
            try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(err){}
            salvarDiretoNoDisco();
        } else {
            imagens.push(mediaObj);
            try {
                var imagensSanitizadas = imagens.map(function(m) {
                    return {
                        id: m.id,
                        name: m.name,
                        fileName: m.fileName,
                        fileSize: m.fileSize,
                        type: m.type,
                        isLocalRef: true,
                        src: "",
                        image: ""
                    };
                });
                localStorage.setItem('images', JSON.stringify(imagensSanitizadas));
            } catch(err){}
        }

        marcarAlteracoesPendentes(true);
        renderizarArvoreNativa(dados, avisos, imagens);
        $('#newImageModal').modal('hide');
    });

    $('#mediaViewerModal').off('shown.bs.modal').on('shown.bs.modal', function() {
        var videoEl = document.getElementById('mediaViewerVideo');
        if (videoEl && videoEl.style.display !== 'none') {
            var playPromise = videoEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.log("Aguardando interação do usuário para reproduzir vídeo:", err);
                });
            }
        }
    });

    $('#mediaViewerModal').on('hidden.bs.modal', function() {
        var videoEl = document.getElementById('mediaViewerVideo');
        if (videoEl) {
            videoEl.pause();
            videoEl.removeAttribute('src');
            while (videoEl.firstChild) {
                videoEl.removeChild(videoEl.firstChild);
            }
        }
        $('#mediaViewerImg').attr('src', '');
        var alertDiv = document.getElementById('mediaViewerErrorAlert');
        if (alertDiv) $(alertDiv).hide();
    });

    $("#btnPreviewMedia").click(async function(){
        const selecionado = document.querySelector('#songList .selected');
        if (!selecionado) {
            alert("Por favor, selecione uma mídia na lista para visualizar.");
            return;
        }

        const tipo = selecionado.dataset.tipo;
        if (tipo !== 'media' && tipo !== 'image' && tipo !== 'auto-video' && tipo !== 'auto-image') {
            alert("O item selecionado não é uma mídia. Selecione uma imagem ou vídeo para visualizar.");
            return;
        }

        const itemId = parseInt(selecionado.dataset.id);
        let mediaItem = null;
        let folderId = undefined;

        if (tipo === 'auto-video') {
            mediaItem = autoVideosFiles[itemId];
        } else if (tipo === 'auto-image') {
            mediaItem = autoImagensFiles[itemId];
        } else if (tipo === 'media') {
            var detailsEl = selecionado.closest('details');
            folderId = parseInt(selecionado.dataset.folderId !== undefined ? selecionado.dataset.folderId : (detailsEl ? detailsEl.dataset.folderId : -1));
            if (folderId >= 0 && dados[folderId] && dados[folderId].media && dados[folderId].media[itemId]) {
                mediaItem = dados[folderId].media[itemId];
            } else if (imagens && imagens[itemId]) {
                mediaItem = imagens[itemId];
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

    // Cliques nos botões de vincular ou reconectar pastas do sistema
    $('#autoFoldersBadge').off('click').on('click', async function() {
        if (dirHandleSoftware || dirHandleVideos || dirHandleImagens) {
            var ok = await reconectarPastasSalvas();
            if (!ok && (autoFolderPermSoftware === 'denied' || (!dirHandleVideos && !dirHandleImagens && autoFolderPermSoftware !== 'prompt'))) {
                vincularPastaSoftware(true);
            }
        } else {
            vincularPastaSoftware(false);
        }
    });
    $('#btnVincularPastaAutoBanner').off('click').on('click', function() {
        vincularPastaSoftware(false);
    });
    $(document).on('click', '.btn-vincular-pasta-videos', function(e) {
        e.preventDefault();
        e.stopPropagation();
        vincularPastaVideos(false);
    });
    $(document).on('click', '.btn-trocar-pasta-videos', function(e) {
        e.preventDefault();
        e.stopPropagation();
        vincularPastaVideos(true);
    });
    $(document).on('click', '.btn-vincular-pasta-imagens', function(e) {
        e.preventDefault();
        e.stopPropagation();
        vincularPastaImagens(false);
    });
    $(document).on('click', '.btn-trocar-pasta-imagens', function(e) {
        e.preventDefault();
        e.stopPropagation();
        vincularPastaImagens(true);
    });
    $(document).on('click', '.btn-vincular-pastas-sistema', function(e) {
        e.preventDefault();
        e.stopPropagation();
        vincularPastaSoftware(false);
    });
});
