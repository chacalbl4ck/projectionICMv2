// ==========================================
// MÓDULO: STORAGE (Armazenamento, IndexedDB e File System Access API)
// ==========================================

var fileHandle = null; // Handle nativo do arquivo data.json no disco
var alteracoesPendentes = false; // Flag de alterações não salvas

// Normaliza qualquer estrutura de arquivo de louvores importado (JSON) para a matriz oficial de pastas e canções
function normalizarEstruturaLouvores(parsed) {
    if (!parsed) return null;

    function normalizarListaCancoes(arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(function(s, sIdx) {
            if (typeof s === 'string') {
                return { title: "Louvor " + (sIdx + 1), content: s };
            }
            var t = (s && (s.title !== undefined ? s.title : (s.nome !== undefined ? s.nome : s.titulo)));
            var c = (s && (s.content !== undefined ? s.content : (s.letra !== undefined ? s.letra : s.texto)));
            return {
                title: (t !== undefined && t !== null && String(t).trim().length > 0) ? String(t).trim() : ("Louvor " + (sIdx + 1)),
                content: (c !== undefined && c !== null) ? String(c) : ""
            };
        });
    }

    function normalizarPasta(item, idx) {
        var nome = (item && (item.name || item.title || item.nome || item.categoria))
            ? String(item.name || item.title || item.nome || item.categoria).trim()
            : ("Pasta " + (idx + 1));
        var rawSongs = (item && (item.songs || item.louvores || item.canticos || item.hinos)) || [];
        return {
            name: nome,
            type: (item && item.type) || "s",
            lang: (item && item.lang) || "pt",
            songs: normalizarListaCancoes(rawSongs),
            media: (item && Array.isArray(item.media)) ? item.media : [],
            warnings: (item && Array.isArray(item.warnings)) ? item.warnings : []
        };
    }

    // Caso 1: Array
    if (Array.isArray(parsed)) {
        if (parsed.length === 0) return [];
        var primeiro = parsed[0];
        if (!primeiro || typeof primeiro !== 'object') return null;

        // Subcaso 1A: Array de pastas / categorias
        var temEstruturaPasta = primeiro.songs !== undefined || primeiro.louvores !== undefined ||
                                primeiro.canticos !== undefined || primeiro.hinos !== undefined ||
                                (primeiro.name !== undefined && !primeiro.content && !primeiro.letra);

        if (temEstruturaPasta) {
            return parsed.map(function(item, idx) {
                return normalizarPasta(item, idx);
            });
        }

        // Subcaso 1B: Array direto de canções / louvores soltos
        var temEstruturaCancao = primeiro.title !== undefined || primeiro.content !== undefined ||
                                 primeiro.nome !== undefined || primeiro.letra !== undefined ||
                                 primeiro.texto !== undefined;

        if (temEstruturaCancao) {
            return [{
                name: "Louvores Importados",
                type: "s",
                lang: "pt",
                songs: normalizarListaCancoes(parsed),
                media: [],
                warnings: []
            }];
        }
        return null;
    }

    // Caso 2: Objeto contendo array em propriedade conhecida
    if (typeof parsed === 'object') {
        var chavesArray = ['data', 'dados', 'categories', 'pastas', 'acervo', 'coletanea', 'folders'];
        for (var i = 0; i < chavesArray.length; i++) {
            var k = chavesArray[i];
            if (Array.isArray(parsed[k])) {
                return normalizarEstruturaLouvores(parsed[k]);
            }
        }

        // Caso 3: Objeto com lista de songs ou louvores: { name?: "...", songs: [...] }
        var rawLista = parsed.songs || parsed.louvores || parsed.canticos || parsed.hinos;
        if (Array.isArray(rawLista)) {
            return [normalizarPasta(parsed, 0)];
        }

        // Caso 4: Um único objeto de louvor: { title: "...", content: "..." }
        if (parsed.title !== undefined || parsed.content !== undefined || parsed.letra !== undefined) {
            return [{
                name: "Louvores Importados",
                type: "s",
                lang: "pt",
                songs: normalizarListaCancoes([parsed]),
                media: [],
                warnings: []
            }];
        }
    }

    return null;
}

// Banco de dados local IndexedDB para arquivos pesados e handles
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
    },
    delete: function(id) {
        return this.remove(id);
    }
};

// Sanitiza a estrutura de dados antes de persistir no JSON ou localStorage
// Impede o armazenamento de URLs temporárias blob: ou strings gigantescas base64
function sanitizarDadosParaJson(dadosArray) {
    if (!Array.isArray(dadosArray)) return dadosArray;
    return dadosArray.map(function(pasta) {
        var clone = Object.assign({}, pasta);
        if (pasta.songs) clone.songs = pasta.songs;
        if (pasta.warnings) clone.warnings = pasta.warnings;
        if (pasta.media && Array.isArray(pasta.media)) {
            clone.media = pasta.media.map(function(m) {
                var mediaClean = Object.assign({}, m);
                if (mediaClean.src && (mediaClean.src.startsWith('blob:') || mediaClean.src.startsWith('data:'))) {
                    mediaClean.src = "";
                }
                if (mediaClean.image && (mediaClean.image.startsWith('blob:') || mediaClean.image.startsWith('data:'))) {
                    mediaClean.image = "";
                }
                return mediaClean;
            });
        }
        return clone;
    });
}

// Atualiza os indicadores visuais de vínculo do data.json
function atualizarIndicadorVinculo() {
    var banner = $('#bannerVincularData');
    var statusBadge = $('#fileHandleStatus');
    var statusIcon = $('#fileHandleIcon');
    var statusText = $('#fileHandleText');

    if (fileHandle) {
        banner.removeClass('d-flex').css('display', 'none');
        if (statusBadge.length) {
            statusBadge.removeClass('badge-secondary').addClass('badge-success');
            statusBadge.attr('title', 'data.json vinculado: alterações gravadas diretamente no disco');
        }
        if (statusIcon.length) {
            statusIcon.removeClass('fa-unlink text-muted').addClass('fa-link text-white');
        }
        if (statusText.length) {
            statusText.text('data.json vinculado');
        }
    } else {
        if (statusBadge.length) {
            statusBadge.removeClass('badge-success').addClass('badge-secondary');
            statusBadge.attr('title', 'Clique para vincular o arquivo data.json do seu computador');
        }
        if (statusIcon.length) {
            statusIcon.removeClass('fa-link text-white').addClass('fa-unlink text-muted');
        }
        if (statusText.length) {
            statusText.text('data.json não vinculado');
        }
    }
}

// Atualiza o pequeno ícone informativo de alterações salvas/pendentes
function marcarAlteracoesPendentes(pendente, salvoEmDisco) {
    alteracoesPendentes = !!pendente;
    var badge = $('#statusSalvar');
    var icon = $('#statusSalvarIcon');
    var text = $('#statusSalvarText');
    var badgeEd = $('#statusSalvarEditor');

    if (badgeEd.length) {
        if (alteracoesPendentes) {
            badgeEd.removeClass('badge-success text-white').addClass('badge-warning text-dark');
            badgeEd.html('<i class="fas fa-exclamation-triangle mr-1"></i> Alterações não salvas');
        } else {
            badgeEd.removeClass('badge-warning text-dark').addClass('badge-success text-white');
            badgeEd.html('<i class="fas fa-check-circle mr-1"></i> Todas as alterações salvas');
        }
    }

    if (!badge.length) return;

    if (alteracoesPendentes) {
        badge.removeClass('badge-success badge-secondary').addClass('badge-warning');
        icon.removeClass('fa-check-circle fa-database').addClass('fa-exclamation-circle text-dark');
        text.text('Não salvo');
        badge.attr('title', 'Existem alterações pendentes não salvas no arquivo.');
    } else if (salvoEmDisco || fileHandle) {
        badge.removeClass('badge-warning badge-secondary').addClass('badge-success');
        icon.removeClass('fa-exclamation-circle fa-database').addClass('fa-check-circle text-white');
        text.text('Salvo no disco');
        badge.attr('title', 'Todas as alterações foram gravadas no arquivo data.json.');
    } else {
        badge.removeClass('badge-warning badge-success').addClass('badge-secondary');
        icon.removeClass('fa-exclamation-circle fa-check-circle text-white').addClass('fa-database text-muted');
        text.text('Salvo no navegador');
        badge.attr('title', 'Salvo temporariamente no navegador. Vincule o data.json para gravar no disco.');
    }
}

// Salva os dados diretamente no disco usando File System Access API
async function salvarDiretoNoDisco() {
    if (!fileHandle) {
        marcarAlteracoesPendentes(false, false);
        return false;
    }
    try {
        if (typeof fileHandle.queryPermission === 'function') {
            var perm = await fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'prompt' && typeof fileHandle.requestPermission === 'function') {
                perm = await fileHandle.requestPermission({ mode: 'readwrite' });
            }
            if (perm !== 'granted') {
                marcarAlteracoesPendentes(true, false);
                return false;
            }
        }
        var dadosSanitizados = sanitizarDadosParaJson(dados);
        var jsonContent = JSON.stringify(dadosSanitizados, null, 2);
        var writable = await fileHandle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        marcarAlteracoesPendentes(false, true);
        atualizarIndicadorVinculo();
        return true;
    } catch (e) {
        console.warn("Erro ao gravar diretamente no arquivo data.json:", e);
        marcarAlteracoesPendentes(true, false);
        return false;
    }
}

// Salva o acervo completo de dados em todos os canais de persistência (IndexedDB, Servidor/Disco, fileHandle e localStorage)
async function salvarAcervoCompleto(dadosParaSalvar) {
    if (!dadosParaSalvar) return false;
    var sanitizados = sanitizarDadosParaJson(dadosParaSalvar);

    // 1. IndexedDB (MediaDB) - Alta capacidade permanente sem limite de quota
    try {
        await MediaDB.init();
        await MediaDB.save("app_custom_data_json", sanitizados);
    } catch(e) {
        console.warn("Falha ao salvar no IndexedDB:", e);
    }

    // 2. localStorage - Cache rápido de sessão
    try {
        localStorage.setItem('data', JSON.stringify(sanitizados));
    } catch(e) {
        console.warn("localStorage quota excedida, mantido seguro no IndexedDB:", e);
    }

    // 3. Servidor Local HTTP (ProjecaoICM.exe / server.js) - Grava direto em data/data.json
    if (typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:')) {
        try {
            fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sanitizados, null, 2)
            }).then(function(r) {
                if (r.ok) {
                    marcarAlteracoesPendentes(false, true);
                }
            }).catch(function() {});
        } catch(e) {}
    }

    // 4. File System Access API (fileHandle se vinculado e com permissão)
    var gravadoDisco = false;
    if (fileHandle) {
        gravadoDisco = await salvarDiretoNoDisco();
    }

    marcarAlteracoesPendentes(false, gravadoDisco || (typeof location !== 'undefined' && location.protocol.startsWith('http')));
    return true;
}

// Abre janela para o usuário vincular o arquivo data.json
async function vincularDataJson() {
    if (!window.showOpenFilePicker) {
        alert("Seu navegador não suporta a File System Access API para salvar arquivos diretamente no disco.");
        return;
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Arquivo de Dados JSON (data.json)',
                accept: { 'application/json': ['.json'] }
            }],
            multiple: false
        });
        if (handle) {
            fileHandle = handle;
            await MediaDB.init();
            await MediaDB.save("app_linked_file_handle", fileHandle);

            var file = await fileHandle.getFile();
            var contents = await file.text();
            if (contents && contents.trim().length > 0) {
                if (typeof window.processarImportacaoLouvores === 'function') {
                    await window.processarImportacaoLouvores(contents);
                } else {
                    atualizaListaArquivos(contents);
                    await salvarAcervoCompleto(dados);
                }
            }
            atualizarIndicadorVinculo();
            marcarAlteracoesPendentes(false, true);
        }
    } catch(err) {
        console.warn("Seleção do arquivo data.json cancelada ou falhou:", err);
    }
}

if (typeof window !== 'undefined') {
    window.normalizarEstruturaLouvores = normalizarEstruturaLouvores;
    window.salvarAcervoCompleto = salvarAcervoCompleto;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports.normalizarEstruturaLouvores = normalizarEstruturaLouvores;
    module.exports.sanitizarDadosParaJson = sanitizarDadosParaJson;
    module.exports.MediaDB = MediaDB;
}
