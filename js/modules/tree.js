// ==========================================
// MÓDULO: TREE (Árvore de Arquivos, Busca Full-Text e Gerenciamento de Pastas)
// ==========================================

// Normaliza texto removendo acentos, pontuações e parênteses para busca fonética
function normalizarTextoBusca(texto) {
    if (!texto) return "";
    return texto.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ç/g, "c")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]"\'?¿!¡]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

var folderOpenState = {};
var lastSearchQuery = "";

function obterChavePasta(detailsEl) {
    if (!detailsEl || !detailsEl.dataset) return null;
    if (detailsEl.dataset.autoFolder) return 'auto-' + detailsEl.dataset.autoFolder;
    if (detailsEl.dataset.folderId !== undefined) return 'song-' + detailsEl.dataset.folderId;
    if (detailsEl.dataset.category) return 'cat-' + detailsEl.dataset.category;
    return null;
}

function capturarEstadoPastas() {
    var container = document.getElementById('songList');
    if (!container) return;
    container.querySelectorAll('details').forEach(function(det) {
        var chave = obterChavePasta(det);
        if (chave) {
            folderOpenState[chave] = !!det.open;
        }
    });
}

function aplicarRastreamentoToggle(detailsEl, chave) {
    if (!detailsEl || !chave) return;
    detailsEl.open = !!folderOpenState[chave];
    detailsEl.addEventListener('toggle', function() {
        folderOpenState[chave] = !!detailsEl.open;
    });
}

function criarNoPasta(titulo, itens, tipo, iconePasta, iconeItem, categoria) {
    const details = document.createElement('details');
    details.dataset.category = categoria;
    aplicarRastreamentoToggle(details, 'cat-' + categoria);

    const summary = document.createElement('summary');
    summary.innerHTML = `<i class="fas ${iconePasta}"></i> ${titulo}`;
    summary.dataset.tipo = "folder";
    summary.dataset.category = categoria;

    summary.addEventListener('click', (e) => {
        document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
        summary.classList.add('selected');
    });
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    itens.forEach((item, index) => {
        const li = document.createElement('li');
        var itemNome = item.name || item.title || "Sem título";
        li.innerHTML = `<i class="fas ${iconeItem}"></i> ${itemNome}`;
        li.dataset.tipo = tipo;
        li.dataset.id = index;

        li.addEventListener('dblclick', (e) => adicionarAProjecao(e, li, item, tipo, index));
        li.addEventListener('click', (e) => {
            document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
        });
        
        ul.appendChild(li);
    });

    details.appendChild(ul);
    return details;
}

function criarNoPastaComMidias(titulo, songs, media, warnings, folderId) {
    const details = document.createElement('details');
    details.dataset.folderId = folderId;
    aplicarRastreamentoToggle(details, 'song-' + folderId);

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

    // 2. Mídias (imagens / vídeos) colocadas nesta pasta
    if (media && media.length > 0) {
        media.forEach((item, index) => {
            const li = document.createElement('li');
            const isVid = (item.type === 'video' || isVideoFile(item.src || item.image || item.fileName));
            let iconHtml = isVid ? '<i class="fas fa-file-video text-info"></i>' : '<i class="fas fa-file-image text-warning"></i>';
            li.innerHTML = `${iconHtml} ${item.name || "Mídia"}`;
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

    // 3. Avisos colocados nesta pasta
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
    capturarEstadoPastas();
    container.innerHTML = ''; 

    // 1. Pasta Automática de Vídeos (monitora vídeos do computador)
    const detailsVideos = document.createElement('details');
    detailsVideos.id = 'pastaAutoVideos';
    detailsVideos.dataset.autoFolder = 'videos';
    detailsVideos.innerHTML = `
        <summary class="folder-auto-summary" data-tipo="folder" data-category="auto-videos">
            <i class="fas fa-folder text-info"></i>
            <i class="fas fa-video text-info mr-1"></i>
            <strong>Vídeos</strong>
            <span class="badge badge-info ml-1 badge-count-videos">${autoVideosFiles.length}</span>
            <button type="button" class="btn btn-sm btn-link text-info p-0 ml-auto btn-vincular-pasta-videos" title="Selecionar ou alterar pasta de vídeos" style="line-height:1;"><i class="fas fa-folder-open"></i></button>
        </summary>
        <ul class="tree-list" id="listaAutoVideos"></ul>
    `;
    aplicarRastreamentoToggle(detailsVideos, 'auto-videos');
    container.appendChild(detailsVideos);

    // 2. Pasta Automática de Imagens (monitora imagens do computador)
    const detailsImagens = document.createElement('details');
    detailsImagens.id = 'pastaAutoImagens';
    detailsImagens.dataset.autoFolder = 'imagens';
    detailsImagens.innerHTML = `
        <summary class="folder-auto-summary" data-tipo="folder" data-category="auto-imagens">
            <i class="fas fa-folder text-warning"></i>
            <i class="fas fa-images text-warning mr-1"></i>
            <strong>Imagens</strong>
            <span class="badge badge-warning ml-1 badge-count-imagens">${autoImagensFiles.length}</span>
            <button type="button" class="btn btn-sm btn-link text-warning p-0 ml-auto btn-vincular-pasta-imagens" title="Selecionar ou alterar pasta de imagens" style="line-height:1;"><i class="fas fa-folder-open"></i></button>
        </summary>
        <ul class="tree-list" id="listaAutoImagens"></ul>
    `;
    aplicarRastreamentoToggle(detailsImagens, 'auto-imagens');
    container.appendChild(detailsImagens);

    renderizarItensPastasAutomaticas();

    if (listaAvisos && listaAvisos.length > 0) {
        const noAvisos = criarNoPasta('Avisos (Geral)', listaAvisos, 'warning', 'fa-clipboard', 'fa-exclamation-triangle', 'warning');
        container.appendChild(noAvisos);
    }

    if (listaImagens && listaImagens.length > 0) {
        const noImagens = criarNoPasta('Mídias (Geral)', listaImagens, 'image', 'fa-film', 'fa-file-image', 'image');
        container.appendChild(noImagens);
    }

    $('#listaDePastas').html("");
    $('#selectMediaFolder').html('<option value="-1">📁 Mídias Gerais</option>');
    $('#selectWarningFolder').html('<option value="-1">📋 Pasta Geral de Avisos</option>');

    dadosLouvores.forEach((item, index) => {
        const noPasta = criarNoPastaComMidias(item.name, item.songs, item.media, item.warnings, index);
        container.appendChild(noPasta);
        $('#listaDePastas').append('<a class="dropdown-item" href="#" data-id="'+index+'">'+item.name+'</a>');
        $('#selectMediaFolder').append('<option value="'+index+'">📁 '+item.name+'</option>');
        $('#selectWarningFolder').append('<option value="'+index+'">📁 '+item.name+'</option>');
    });

    if (typeof window.filtrarArvoreSemReabrir === 'function' && lastSearchQuery !== '') {
        window.filtrarArvoreSemReabrir();
    }

    $('#listaDePastas a').click(function(e) {
        e.preventDefault();
        var pastaSelecionada = parseInt($(this).attr("data-id"));
        if (isNaN(pastaSelecionada) || !dados[pastaSelecionada]) return;

        var novoLouvor = {
            title: "Novo Louvor",
            content: "Digite a letra do louvor aqui...\n\nSegunda estrofe aqui..."
        };

        if (!dados[pastaSelecionada].songs) dados[pastaSelecionada].songs = [];
        dados[pastaSelecionada].songs.push(novoLouvor);
        var lastAdded = dados[pastaSelecionada].songs.length - 1;

        pastaAtiva = pastaSelecionada;
        louvorAtivo = lastAdded;
        ref_selected = `${pastaAtiva}_${louvorAtivo}`;
        
        folderOpenState['song-' + pastaSelecionada] = true;
        try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(err){}
        marcarAlteracoesPendentes(true);
        renderizarArvoreNativa(dados, avisos, imagens);
        
        var detailsEl = document.querySelector(`details[data-folder-id="${pastaSelecionada}"]`);
        if (detailsEl) {
            detailsEl.open = true;
            var novoLi = detailsEl.querySelector(`li[data-id="${lastAdded}"][data-tipo="song"]`);
            if (novoLi) {
                document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
                novoLi.classList.add('selected');
                novoLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        $('#title').val(novoLouvor.title);
        $('#content').val(novoLouvor.content);
        $('#guias a[href="#edit"]').tab('show');
        setTimeout(() => { $('#title').focus().select(); }, 150);
    });
}

function adicionarAProjecao(e, elementoLi, item, tipo, itemId) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (tipo === 'song') {
        const folderId = elementoLi ? elementoLi.closest('details').dataset.folderId : pastaAtiva;
        projecao.push({ id: itemId, folderId: parseInt(folderId), type: "s" });
    } else if (tipo === 'image' || tipo === 'media' || tipo === 'auto-video' || tipo === 'auto-image') {
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
        if (item) {
            var prevSrc = item.src;
            resolverUrlMidia(item).then(function(u) {
                if (u && u !== prevSrc) {
                    item.src = u;
                    if (typeof generateLiveList === 'function') generateLiveList();
                    else if (typeof updateViewSlides === 'function') updateViewSlides();
                }
            });
        }
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

    if (typeof window.definirItemAutoSelecionado === 'function') {
        window.definirItemAutoSelecionado(tipo, item);
    }

    if (tipo === 'song') {
        const folderId = elementoLi.closest('details').dataset.folderId;
        pastaAtiva = parseInt(folderId);
        louvorAtivo = parseInt(itemId);
        ref_selected = pastaAtiva + "_" + louvorAtivo;

        document.getElementById('title').value = item.title || "";
        document.getElementById('content').value = item.content || "";
        marcarAlteracoesPendentes(false, !!fileHandle);
    }
}

function executarFiltroArvore(ajustarAberturaPastas) {
    var rawQuery = $('#treesearch').val() || "";
    var normQuery = normalizarTextoBusca(rawQuery);

    if (normQuery === "") {
        $("#songList details").show();
        $("#songList li").show();
        if (ajustarAberturaPastas) {
            $("#songList details").each(function() {
                this.open = false;
                var ch = obterChavePasta(this);
                if (ch) folderOpenState[ch] = false;
            });
        }
        lastSearchQuery = "";
        return;
    }

    var terms = normQuery.split(" ").filter(function(t) { return t.length > 0; });

    $("#songList details").each(function() {
        var detailsEl = $(this);
        var domDetails = this;
        var folderId = detailsEl.data('folderId') !== undefined ? detailsEl.data('folderId') : detailsEl.attr('data-folder-id');
        var hasVisibleItems = false;

        detailsEl.find('li').each(function() {
            var li = $(this);
            var tipo = li.data('tipo') || li.attr('data-tipo');
            if (!tipo) {
                li.hide();
                return;
            }
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
                var normName = normalizarTextoBusca((media.name || "") + " " + (media.fileName || ""));
                isMatch = terms.every(function(t) { return normName.includes(t); });
            } else if (tipo === 'auto-video' && autoVideosFiles[id]) {
                var v = autoVideosFiles[id];
                var fullV = normalizarTextoBusca((v.name || "") + " " + (v.fileName || ""));
                isMatch = terms.every(function(t) { return fullV.includes(t); });
            } else if (tipo === 'auto-image' && autoImagensFiles[id]) {
                var im = autoImagensFiles[id];
                var fullIm = normalizarTextoBusca((im.name || "") + " " + (im.fileName || ""));
                isMatch = terms.every(function(t) { return fullIm.includes(t); });
            } else if (tipo === 'warning') {
                var aviso = (folderId !== undefined && dados[folderId] && dados[folderId].warnings && dados[folderId].warnings[id]) ? dados[folderId].warnings[id] : (avisos && avisos[id] ? avisos[id] : null);
                if (aviso) {
                    var wName = aviso.name || "";
                    var wTitle = (aviso.warning && aviso.warning.content) ? aviso.warning.content.title : (aviso.title || "");
                    var wBody = (aviso.warning && aviso.warning.content) ? aviso.warning.content.body : (aviso.body || "");
                    var fullWarn = normalizarTextoBusca((wName + " " + wTitle + " " + wBody).replace(/<[^>]*>/g, " "));
                    isMatch = terms.every(function(t) { return fullWarn.includes(t); });
                }
            } else if (tipo === 'image' && imagens && imagens[id]) {
                var imgItem = imagens[id];
                var normImg = normalizarTextoBusca((imgItem.name || "") + " " + (imgItem.fileName || ""));
                isMatch = terms.every(function(t) { return normImg.includes(t); });
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
            if (ajustarAberturaPastas) {
                domDetails.open = true;
                var chOpen = obterChavePasta(domDetails);
                if (chOpen) folderOpenState[chOpen] = true;
            }
        } else {
            detailsEl.hide();
            if (ajustarAberturaPastas) {
                domDetails.open = false;
                var chClose = obterChavePasta(domDetails);
                if (chClose) folderOpenState[chClose] = false;
            }
        }
    });
    lastSearchQuery = normQuery;
}

window.filtrarArvoreSemReabrir = function() {
    executarFiltroArvore(false);
};

// ==========================================
// BUSCA AVANÇADA FULL-TEXT (TÍTULO + LETRA/ESTROFES)
// ==========================================
$(document).ready(function() {
    $("#treesearch").off("input keyup").on("input", function() {
        var normQuery = normalizarTextoBusca($(this).val() || "");
        if (normQuery !== lastSearchQuery) {
            executarFiltroArvore(true);
        }
    });

    // Funções de Exclusão de Itens e Pastas
    $("#deleteFromTree").click(function(){
        const selecionado = document.querySelector('#songList .selected');
        if(!selecionado) return;

        const tipo = selecionado.dataset.tipo;

        if(tipo === "auto-video" || tipo === "auto-image"){
            alert("Este arquivo está em uma pasta monitorada no seu computador. Para excluí-lo, apague ou mova o arquivo diretamente na pasta correspondente no computador.");
            return;
        }

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

        if(tipo === "auto-video" || tipo === "auto-image"){
            alert("Este arquivo está em uma pasta monitorada no seu computador. Para excluí-lo, apague ou mova o arquivo diretamente na pasta correspondente no computador.");
            return;
        }
        
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
                const detailsEl = selecionado.closest('details');
                const folderId = parseInt(selecionado.dataset.folderId !== undefined ? selecionado.dataset.folderId : (detailsEl ? detailsEl.dataset.folderId : -1));
                if (folderId >= 0 && dados[folderId] && dados[folderId].media) {
                    dados[folderId].media.splice(itemId, 1);
                } else if (imagens && imagens[itemId]) {
                    imagens.splice(itemId, 1);
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
        try {
            var imgSanit = (imagens || []).map(function(m) {
                return { id: m.id, name: m.name, fileName: m.fileName, fileSize: m.fileSize, type: m.type, isLocalRef: !!m.isLocalRef, src: "", image: "" };
            });
            localStorage.setItem('images', JSON.stringify(imgSanit));
        } catch(e){}
        try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(e){}
        salvarDiretoNoDisco();
        atualizaListasFromJSON(dados); 
        
        if (dados.length > 0 && dados[0].songs && dados[0].songs.length > 0) {
            $('#title').val(dados[0].songs[0].title); 
            $('#content').val(dados[0].songs[0].content);
        } else {
            $('#title').val(""); 
            $('#content').val("");
        }
        $('#excluirModal').modal('hide'); 
    });

    $("#newFolder").off('click').on('click', function(){ 
        $('#folderName').val("");
        $('#makeFolderModal').modal('show');
        setTimeout(function() { $('#folderName').focus(); }, 250);
    });

    $('#folderName').off('keypress').on('keypress', function(e) {
        if (e.which === 13) {
            e.preventDefault();
            $('#confirmMakeFolder').click();
        }
    });

    $("#confirmMakeFolder").off('click').on('click', async function(){ 
        var name = ($('#folderName').val() || "").trim();
        if (!name) {
            alert("Por favor, digite um nome para a pasta.");
            $('#folderName').focus();
            return;
        }
        if (!Array.isArray(dados)) dados = [];
        dados.push({ name: name, type: "s", songs: [], media: [], warnings: [] });
        var newIdx = dados.length - 1;
        folderOpenState['song-' + newIdx] = true;

        try {
            localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados)));
        } catch(err){}
        marcarAlteracoesPendentes(true);
        await salvarDiretoNoDisco();
        renderizarArvoreNativa(dados, avisos, imagens);

        var novaPastaEl = document.querySelector(`details[data-folder-id="${newIdx}"]`);
        if (novaPastaEl) {
            var sum = novaPastaEl.querySelector('summary');
            if (sum) {
                document.querySelectorAll('#songList .selected').forEach(el => el.classList.remove('selected'));
                sum.classList.add('selected');
                sum.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        $('#folderName').val("");
        $('#makeFolderModal').modal('hide');
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
            try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(err){}
            salvarDiretoNoDisco();
            atualizaListasFromJSON(dados);
            marcarAlteracoesPendentes(true);
            $('#renameFolderModal').modal('hide');
        }
    });
});
