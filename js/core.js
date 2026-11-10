// ==========================================
// PROJEÇÃO ICM HTML5 - CORE PRINCIPAL
// Orquestrador de Ciclo de Vida, Edição de Louvores e Configurações
// ==========================================

var pastaAtiva = 0;
var louvorAtivo = 0;
var dados = [];
var avisos = [];
var imagens = [];
var configuracoes = {};
var ref_selected = "0_0";
var isFirefox = typeof InstallTrigger !== 'undefined';

// ==========================================
// FORMATAÇÃO DE URL DE MÍDIA E CONFIGURAÇÕES
// ==========================================
function formatMediaUrl(file) {
    if (!file) return "";
    if (file.startsWith("data:") || file.startsWith("blob:") || file.startsWith("http://") || file.startsWith("https://") || file.startsWith("/") || file.startsWith("imagens/")) {
        return file;
    }
    return "imagens/" + file;
}
window.formatMediaUrl = formatMediaUrl;

function setTelaPadraoHtml(tipo) {
    if (tipo === 1) {
        telaPadrao = ">\n<h1>MARANATA</h1>\n<h3>O Senhor Jesus vem!</h3>\n</section>\n";
    } else if (tipo === 2) {
        telaPadrao = " data-state=\"show_backlay1\">\n<style>\n.show_backlay1 header.backlay1-pt-br .backlay_1-pt-br{display: block}\n</style>\n<h1>Santa Ceia</h1><br>\n</section>\n";
    } else {
        telaPadrao = ">\n</section>\n";
    }
}
window.setTelaPadraoHtml = setTelaPadraoHtml;

function defaultConfigurations() {
    var stored = null;
    try {
        stored = localStorage.getItem("settings") || localStorage.getItem("configuracoes");
    } catch(e){}

    if (!stored) {
        configuracoes = {
            images: [
                { file: "fundo.jpg", name: "Padrão Azul", media_type: "image" },
                { file: "campo-uva.jpg", name: "Santa Ceia", media_type: "image" },
                { file: "madeira_bg.jpg", name: "Bíblia Madeira", media_type: "image" }
            ],
            themes: [
                { id: 1, name: "Padrão Azul", file: "icm" },
                { id: 2, name: "Santa Ceia", file: "ceia" }
            ],
            active_theme: 1,
            backgrounds: [
                { id: 1, type: 1, color: "#000000", image_file: "fundo.jpg", media_type: "image" },
                { id: 2, type: 1, color: "#000000", image_file: "fundo.jpg", media_type: "image" },
                { id: 3, type: 1, color: "#000000", image_file: "madeira_bg.jpg", media_type: "image" }
            ],
            fontSize: 2,
            telaPadraoTexto: 1
        };
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
    } else {
        try {
            configuracoes = JSON.parse(stored);
        } catch(e) {
            configuracoes = {};
        }
    }

    if (!configuracoes.themes || !Array.isArray(configuracoes.themes) || configuracoes.themes.length === 0) {
        configuracoes.themes = [
            { id: 1, name: "Padrão Azul", file: "icm" },
            { id: 2, name: "Santa Ceia", file: "ceia" }
        ];
    }
    if (!configuracoes.images || !Array.isArray(configuracoes.images) || configuracoes.images.length === 0) {
        configuracoes.images = [
            { file: "fundo.jpg", name: "Padrão Azul", media_type: "image" },
            { file: "campo-uva.jpg", name: "Santa Ceia", media_type: "image" },
            { file: "madeira_bg.jpg", name: "Bíblia Madeira", media_type: "image" }
        ];
    }
    if (!configuracoes.backgrounds || !Array.isArray(configuracoes.backgrounds) || configuracoes.backgrounds.length === 0) {
        configuracoes.backgrounds = [
            { id: 1, type: 1, color: "#000000", image_file: "fundo.jpg", media_type: "image" },
            { id: 2, type: 1, color: "#000000", image_file: "fundo.jpg", media_type: "image" },
            { id: 3, type: 1, color: "#000000", image_file: "madeira_bg.jpg", media_type: "image" }
        ];
    }
    if (configuracoes.fontSize === undefined) configuracoes.fontSize = 2;
    if (configuracoes.telaPadraoTexto === undefined) configuracoes.telaPadraoTexto = 1;
    if (configuracoes.active_theme === undefined) configuracoes.active_theme = 1;

    // Popula select de temas
    var selectTheme = $("#selectTheme");
    selectTheme.empty();
    configuracoes.themes.forEach(function (theme) {
        var option = new Option(theme.name, theme.id);
        selectTheme.append($(option));
    });
    selectTheme.val(configuracoes.active_theme);

    // Fonte
    $('#fontSizeRange').val(configuracoes.fontSize);
    $('#currentFontSize').text(configuracoes.fontSize);
    atualizaFontSizeText();
    changeFontSize();

    // Renderiza o visual dos 3 fundos (1: Tela Padrão, 2: Louvor, 3: Bíblia)
    configuracoes.backgrounds.forEach(function (bg) {
        atualizarVisualFundoConfig(bg);
    });

    // Tela Padrão
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

    if (typeof generateLiveList === 'function') generateLiveList();
}
window.defaultConfigurations = defaultConfigurations;

function getBackground(id) {
    var oldbg = { id: id, type: 1, color: "#000000", image_file: (id === 3 ? "madeira_bg.jpg" : "fundo.jpg"), media_type: "image" };
    if (!configuracoes.backgrounds) configuracoes.backgrounds = [];
    configuracoes.backgrounds.forEach(function (bg) { 
        if (bg.id == id) { 
            oldbg = bg;
        } 
    });
    return oldbg;
}
window.getBackground = getBackground;

function setBackground(id, tipo, cor, arquivo, media_type) {
    var achou = false;
    if (!configuracoes.backgrounds) configuracoes.backgrounds = [];
    configuracoes.backgrounds.forEach(function (bg) { 
        if (bg.id == id) { 
            bg.type = tipo;
            bg.color = cor || bg.color || "#000000";
            bg.image_file = arquivo || bg.image_file || (id === 3 ? "madeira_bg.jpg" : "fundo.jpg");
            bg.media_type = media_type || (typeof isVideoFile === 'function' && isVideoFile(bg.image_file) ? "video" : "image");
            achou = true;
        } 
    });
    if (!achou) {
        configuracoes.backgrounds.push({
            id: id,
            type: tipo,
            color: cor || "#000000",
            image_file: arquivo || (id === 3 ? "madeira_bg.jpg" : "fundo.jpg"),
            media_type: media_type || "image"
        });
    }
    try {
        localStorage.setItem('settings', JSON.stringify(configuracoes));
        localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
    } catch(err){}
}
window.setBackground = setBackground;

function atualizarVisualFundoConfig(bg) {
    if (!bg || !bg.id) return;
    var id = bg.id;
    var imgEl = $("#image_" + id);
    var colorEl = $("#color_" + id);

    if (bg.type == 1) { // Imagem / Vídeo
        imgEl.show();
        colorEl.hide();
        $('input[name="imgColor_' + id + '"][value="1"]').prop('checked', true).closest('label').addClass('active').siblings().removeClass('active');
    } else { // Cor
        imgEl.hide();
        colorEl.show();
        $('input[name="imgColor_' + id + '"][value="2"]').prop('checked', true).closest('label').addClass('active').siblings().removeClass('active');
    }

    var formatted = formatMediaUrl(bg.image_file);
    var isVid = (bg.media_type === "video" || (typeof isVideoFile === 'function' && isVideoFile(bg.image_file)));
    if (isVid) {
        imgEl.html('<video src="' + formatted + '" muted autoplay loop style="width:100%; height:100%; object-fit:cover;"></video>');
        imgEl.css("background", "none");
    } else {
        imgEl.html('');
        imgEl.css({
            "background-image": "url('" + formatted + "')",
            "background-size": "cover",
            "background-position": "center"
        });
    }
    colorEl.val(bg.color || "#000000");
}
window.atualizarVisualFundoConfig = atualizarVisualFundoConfig;

function reloadListOfImages() {
    $('#images').html("");
    if (!configuracoes.images) configuracoes.images = [];

    configuracoes.images.forEach(function (imagem, index) {
        var isVid = (imagem.media_type === "video" || (typeof isVideoFile === 'function' && isVideoFile(imagem.file)));
        var itemHtml = '';
        var bgUrl = formatMediaUrl(imagem.file);

        if (isVid) {
            itemHtml = '<div class="bg-item" data-index="' + index + '" data-media-type="video" style="position:relative; width:150px; height:85px; display:inline-block; margin:6px; cursor:pointer; border:2px solid #555; border-radius:4px; overflow:hidden;">' +
                       '<video src="' + bgUrl + '" muted style="width:100%; height:100%; object-fit:cover;"></video>' +
                       '<span class="badge badge-info" style="position:absolute; bottom:4px; left:4px; font-size:0.7rem;"><i class="fas fa-video"></i> Vídeo</span>' +
                       (index >= 3 ? '<button type="button" class="btn btn-sm btn-danger bg-del-btn" data-index="' + index + '" style="position:absolute; top:2px; right:2px; padding:0 4px; line-height:1;" title="Excluir"><i class="fas fa-times"></i></button>' : '') +
                       '</div>';
        } else {
            itemHtml = '<div class="bg-item" style="position:relative; width:150px; height:85px; display:inline-block; margin:6px; cursor:pointer; border:2px solid #555; border-radius:4px; overflow:hidden; background-image:url(\'' + bgUrl + '\'); background-size:cover; background-position:center;" data-index="' + index + '" data-media-type="image">' +
                       '<span class="badge badge-dark" style="position:absolute; bottom:4px; left:4px; font-size:0.7rem;"><i class="fas fa-image"></i> Foto</span>' +
                       (index >= 3 ? '<button type="button" class="btn btn-sm btn-danger bg-del-btn" data-index="' + index + '" style="position:absolute; top:2px; right:2px; padding:0 4px; line-height:1;" title="Excluir"><i class="fas fa-times"></i></button>' : '') +
                       '</div>';
        }
        $('#images').append(itemHtml);
    });

    $('#images div.bg-item').off('click').on('click', function(e) {
        if ($(e.target).closest('.bg-del-btn').length > 0) return;
        var idx = parseInt($(this).attr("data-index"));
        var imgItem = configuracoes.images[idx];
        if (!imgItem) return;

        var image_file = imgItem.file;
        var media_type = imgItem.media_type || (typeof isVideoFile === 'function' && isVideoFile(image_file) ? "video" : "image");
        var id = parseInt($('#images').attr("data-type")) || 1;
        var oldbg = getBackground(id);

        setBackground(id, 1, oldbg.color || "#000000", image_file, media_type);
        atualizarVisualFundoConfig(getBackground(id));

        $('#selectImageModal').modal('hide');
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    $('.bg-del-btn').off('click').on('click', function(e) {
        e.stopPropagation();
        var idx = parseInt($(this).attr('data-index'));
        if (confirm("Deseja remover este fundo da lista?")) {
            configuracoes.images.splice(idx, 1);
            try {
                localStorage.setItem('settings', JSON.stringify(configuracoes));
                localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
            } catch(err){}
            reloadListOfImages();
        }
    });
}
window.reloadListOfImages = reloadListOfImages;

function changeTheme() {
    if (!configuracoes.themes) return;
    configuracoes.themes.forEach(function (theme) {
        if (theme.id == configuracoes.active_theme) {
            broadcastCommand('CHANGE_THEME', theme.file);
            generateLiveList(); 
        }
    }); 
}

function changeFontSize() {
    broadcastCommand('CHANGE_FONT_SIZE', configuracoes.fontSize || 2);
}

function atualizaFontSizeText() {
    var fs = configuracoes.fontSize || 2;
    var label = fs.toString();
    if (fs == 1) label += " - Menor";
    else if (fs == 2) label += " - Normal";
    else if (fs == 2.2) label += " - Grande";
    else if (fs == 4) label += " - Extra Grande";
    $('#currentFontSize').text(label);
}

// 16:9 Background Crop Controls
var currentCropImage = null;
var currentCropFileName = "";

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

// ==========================================
// 1. CARREGAMENTO E INICIALIZAÇÃO DE DADOS
// ==========================================
async function carregaLouvores() {
    try {
        defaultConfigurations();
    } catch(e) {
        console.error("Erro ao inicializar configurações padrão:", e);
    }

    // 1. Restaura handles previamente autorizados e salvos no IndexedDB
    try {
        await MediaDB.init();
        if (!fileHandle) {
            var savedHandle = await MediaDB.get("app_linked_file_handle");
            if (savedHandle && typeof savedHandle.getFile === 'function') {
                fileHandle = savedHandle;
            }
        }
        if (!dirHandleSoftware) {
            var savedDir = await MediaDB.get("app_dir_handle_root");
            if (savedDir) dirHandleSoftware = savedDir;
        }
        if (!dirHandleVideos) {
            var savedVidDir = await MediaDB.get("app_dir_handle_videos");
            if (savedVidDir) dirHandleVideos = savedVidDir;
        }
        if (!dirHandleImagens) {
            var savedImgDir = await MediaDB.get("app_dir_handle_imagens");
            if (savedImgDir) dirHandleImagens = savedImgDir;
        }
        atualizarIndicadorPastasAuto();
        await restaurarCachePastasAutomaticas();
        await escanearPastasAutomaticas();
    } catch (e) {
        console.warn("Falha ao recuperar handles do IndexedDB:", e);
    }

    // Se temos handle restaurado, tenta ler direto do disco
    if (fileHandle) {
        try {
            var perm = (typeof fileHandle.queryPermission === 'function') 
                ? await fileHandle.queryPermission({ mode: 'readwrite' }) 
                : 'granted';
            if (perm === 'granted') {
                var file = await fileHandle.getFile();
                var contents = await file.text();
                if (contents && contents.trim().length > 0) {
                    atualizaListaArquivos(contents);
                    atualizarIndicadorVinculo();
                    marcarAlteracoesPendentes(false, true);
                    return;
                }
            }
        } catch (e) {
            console.warn("Handle persistido aguardando interação do usuário:", e);
        }
    }

    // 2. Tenta carregar do localStorage
    if (localStorage.getItem("data") !== null && localStorage.getItem("data") !== "" && localStorage.getItem("data") !== "[]") {
        try {
            atualizaListaArquivos(localStorage.getItem("data"));
            atualizarIndicadorVinculo();
            marcarAlteracoesPendentes(false, false);
            return;
        } catch (e) {
            console.warn("Falha ao carregar do localStorage:", e);
        }
    }

    // 3. Fallback: carrega via fetch/XMLHttpRequest do arquivo data/data.json
    try {
        var resp = await fetch('data/data.json');
        if (resp.ok) {
            var jsonText = await resp.text();
            if (jsonText && jsonText.trim().length > 0) {
                atualizaListaArquivos(jsonText);
                atualizarIndicadorVinculo();
                marcarAlteracoesPendentes(false, false);
                return;
            }
        }
    } catch (e) {
        console.warn("Fetch de data/data.json falhou, tentando XHR legado:", e);
    }

    // Fallback XHR para navegadores legados
    var xhr = new XMLHttpRequest();
    xhr.overrideMimeType("application/json");
    xhr.open('GET', 'data/data.json', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && (xhr.status == "200" || xhr.status == "0")) {
            if (xhr.responseText && xhr.responseText.trim().length > 0) {
                atualizaListaArquivos(xhr.responseText);
                atualizarIndicadorVinculo();
                marcarAlteracoesPendentes(false, false);
            }
        }
    };
    xhr.send(null);
}

function atualizaListaArquivos(jsonString) {
    try {
        dados = JSON.parse(jsonString);
    } catch (e) {
        console.error("Erro ao analisar JSON dos louvores:", e);
        return;
    }

    if (localStorage.getItem("warnings") !== null && localStorage.getItem("warnings") !== "") {
        try { avisos = JSON.parse(localStorage.getItem("warnings")); } catch(e){ avisos = []; }
    }
    if (localStorage.getItem("images") !== null && localStorage.getItem("images") !== "") {
        try { imagens = JSON.parse(localStorage.getItem("images")); } catch(e){ imagens = []; }
    }
    try { defaultConfigurations(); } catch(e){}

    atualizaListasFromJSON(dados);
}

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

function atualizaListasFromJSON(dadosLouvores) {
    if (!dadosLouvores || !dadosLouvores.length) return;

    renderizarArvoreNativa(dadosLouvores, avisos, imagens);

    var tituloAtual = $('#title').val();
    if ((!tituloAtual || !dadosLouvores[pastaAtiva]) && dadosLouvores[0] && dadosLouvores[0].songs && dadosLouvores[0].songs.length > 0) {
        $('#title').val(dadosLouvores[0].songs[0].title);
        $('#content').val(dadosLouvores[0].songs[0].content);
        pastaAtiva = 0;
        louvorAtivo = 0;
        ref_selected = "0_0";
    }

    if (typeof window.hidratarMidiasDoMediaDB === 'function') {
        window.hidratarMidiasDoMediaDB();
    }

    generateLiveList();
    hideLoading();
}

// ==========================================
// 2. EDITOR DE LOUVORES E FORMATAÇÃO LITÚRGICA
// ==========================================
$(document).ready(function() {
    // Salvar edições do louvor ativo
    $("#save, #salvar").off('click').on('click', async function(e) {
        if (e && e.preventDefault) e.preventDefault();

        if (typeof pastaAtiva === 'undefined' || pastaAtiva < 0 || typeof louvorAtivo === 'undefined' || louvorAtivo < 0) {
            alert("Nenhum louvor selecionado para salvar. Por favor, clique em um louvor na lista antes de salvar.");
            return;
        }
        if (!dados[pastaAtiva] || !dados[pastaAtiva].songs || !dados[pastaAtiva].songs[louvorAtivo]) {
            alert("O louvor selecionado não foi encontrado.");
            return;
        }

        var newTitle = $('#title').val().trim();
        var newContent = $('#content').val();

        if (!newTitle) {
            alert("O título do louvor não pode ficar em branco.");
            return;
        }

        dados[pastaAtiva].songs[louvorAtivo].title = newTitle;
        dados[pastaAtiva].songs[louvorAtivo].content = newContent;
        ref_selected = pastaAtiva + "_" + louvorAtivo;

        try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(err){}
        
        var gravado = await salvarDiretoNoDisco();
        marcarAlteracoesPendentes(false);
        renderizarArvoreNativa(dados, avisos, imagens);
        reloadProjectionList();

        var badgeEd = $('#statusSalvarEditor');
        if (badgeEd.length) {
            badgeEd.removeClass('badge-warning text-dark').addClass('badge-success text-white');
            if (gravado) {
                badgeEd.html('<i class="fas fa-check-circle mr-1"></i> Louvor salvo no disco!');
            } else {
                badgeEd.html('<i class="fas fa-check-circle mr-1"></i> Salvo no cache local');
            }
        }
    });

    // Atalho de teclado Ctrl+S para salvar louvor
    $(document).keydown(function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            if ($('#edit').hasClass('active') || $('#content:focus, #title:focus').length) {
                e.preventDefault();
                $("#save").click();
            }
        }
    });

    // Inserção rápida de tags de formatação litúrgica no textarea
    function inserirTagNoEditor(tagInicio, tagFim) {
        var textarea = document.getElementById('content');
        if (!textarea) return;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var text = textarea.value;
        var selected = text.substring(start, end);
        var replacement = tagInicio + selected + tagFim;
        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + tagInicio.length, end + tagInicio.length);
        marcarAlteracoesPendentes(true);
    }

    $('#btnCoro, #btnInserirCoro').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<font color="yellow"><i>CORO</i></font>\n', '');
    });
    $('#btnFinal, #btnInserirFinal').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<font color="yellow"><i>FINAL:</i></font>\n', '');
    });
    $('#btnContracanto').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<i><font color="#00ff00">', '</font></i>');
    });
    $('#rplYI').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<font color="yellow"><i>', '</i></font>');
    });
    $('#rplBis, #btnInserirBis').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chave-bis">', '</blockquote>');
    });
    $('#rplBis-small, #btnInserirBisFinal').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chave-bis-small">', '</blockquote>');
    });
    $('.rplanyx').click(function(e) {
        e.preventDefault();
        var times = $(this).attr("data-times");
        inserirTagNoEditor('<blockquote class="chave-' + times + '">', '</blockquote>');
    });
    $('#btnInserir2x').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chaves-2x">', '</blockquote>');
    });
    $('#btnInserir3x').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chaves-3x">', '</blockquote>');
    });
    $('#btnInserir4x').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chaves-4x">', '</blockquote>');
    });
    $('#btnInserir5x').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chaves-5x">', '</blockquote>');
    });
    $('#btnInserir6x').click(function(e) {
        e.preventDefault();
        inserirTagNoEditor('<blockquote class="chaves-6x">', '</blockquote>');
    });

    $('#title, #content').on('input', function() {
        marcarAlteracoesPendentes(true);
    });

    // ==========================================
    // 3. EDITOR DE AVISOS
    // ==========================================
    $('#newWarning, #btnCreateWarn').click(function() {
        $('#warningModalTitle').html('<i class="fas fa-exclamation-triangle mr-1"></i> Novo Aviso');
        $('#editingWarningIndex').val('-1');
        $('#editingWarningFolderId').val('-1');
        $('#warningName').val('');
        $('#selectWarningFolder').val('-1');
        $('#newWarningModal .warning-title').text('Aviso');
        $('#newWarningModal .warning-body').text('Digite o conteúdo do aviso aqui...');
        $('#newWarningModal').modal('show');
    });

    $('#btnEditWarning').click(function() {
        const selecionado = document.querySelector('#songList .selected');
        if (!selecionado || selecionado.dataset.tipo !== 'warning') {
            alert("Selecione um aviso na lista para editar.");
            return;
        }

        var itemId = parseInt(selecionado.dataset.id);
        var detailsEl = selecionado.closest('details');
        var folderId = parseInt(selecionado.dataset.folderId !== undefined ? selecionado.dataset.folderId : (detailsEl ? detailsEl.dataset.folderId : -1));

        var aviso = (folderId >= 0 && dados[folderId] && dados[folderId].warnings) ? dados[folderId].warnings[itemId] : avisos[itemId];
        if (!aviso) return;

        $('#warningModalTitle').html('<i class="fas fa-edit mr-1"></i> Editar Aviso');
        $('#editingWarningIndex').val(itemId);
        $('#editingWarningFolderId').val(folderId);
        $('#warningName').val(aviso.name || '');
        $('#selectWarningFolder').val(folderId);

        var title = (aviso.warning && aviso.warning.content) ? aviso.warning.content.title : (aviso.title || 'Aviso');
        var body = (aviso.warning && aviso.warning.content) ? aviso.warning.content.body : (aviso.body || '');

        $('#newWarningModal .warning-title').text(title);
        $('#newWarningModal .warning-body').html(body.replace(/\n/g, '<br>'));
        $('#newWarningModal').modal('show');
    });

    $('#confirmCreateWarning').click(function() {
        var name = $('#warningName').val().trim();
        var title = $('#newWarningModal .warning-title').text().trim();
        var body = $('#newWarningModal .warning-body').html().trim();
        var targetFolderId = parseInt($('#selectWarningFolder').val());
        var editIndex = parseInt($('#editingWarningIndex').val());
        var editFolderId = parseInt($('#editingWarningFolderId').val());

        if (!name) {
            name = title || "Aviso";
        }

        var avisoObj = {
            name: name,
            title: title,
            body: body.replace(/<br\s*\/?>/gi, '\n'),
            warning: {
                content: {
                    title: title,
                    body: body.replace(/<br\s*\/?>/gi, '\n')
                }
            }
        };

        if (editIndex >= 0) {
            // Edição existente
            if (editFolderId >= 0 && dados[editFolderId] && dados[editFolderId].warnings) {
                dados[editFolderId].warnings[editIndex] = avisoObj;
            } else {
                avisos[editIndex] = avisoObj;
            }
        } else {
            // Novo aviso
            if (targetFolderId >= 0 && dados[targetFolderId]) {
                if (!dados[targetFolderId].warnings) dados[targetFolderId].warnings = [];
                dados[targetFolderId].warnings.push(avisoObj);
            } else {
                avisos.push(avisoObj);
            }
        }

        try { localStorage.setItem('warnings', JSON.stringify(avisos)); } catch(e){}
        try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(e){}
        salvarDiretoNoDisco();
        marcarAlteracoesPendentes(true);
        renderizarArvoreNativa(dados, avisos, imagens);
        $('#newWarningModal').modal('hide');
    });

    // ==========================================
    // 4. CONFIGURAÇÕES & ATALHOS DE TECLADO
    // ==========================================
    $("#btnAbrirConf").click(function(){ 
        $('#confModal').modal('toggle');
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
              <p class="mb-1 font-weight-bold"><i class="fas fa-code-branch mr-1 text-info"></i> Manutenção e Desenvolvimento (v2.0.0):</p>
              <p class="mb-2 text-warning small font-weight-bold"><i class="fas fa-map-marker-alt mr-1"></i> ICM - Leopoldina / MG</p>
              
              <div class="border-top border-dark pt-2 mb-2">
                <p class="mb-1 font-weight-bold"><i class="fas fa-user-circle mr-1 text-info"></i> Caio Monteiro</p>
                <div class="pl-3 small">
                  <p class="mb-1"><i class="fas fa-envelope-square text-warning fa-fw"></i> <a href="mailto:caiormleo@outlook.com.br" class="text-info font-weight-bold">caiormleo@outlook.com.br</a></p>
                  <p class="mb-0"><i class="fab fa-github-square text-warning fa-fw"></i> <a href="https://github.com/chacalbl4ck" target="_blank" rel="noopener noreferrer" class="text-info font-weight-bold">chacalbl4ck</a></p>
                </div>
              </div>

              <div class="border-top border-dark pt-2">
                <p class="mb-1 font-weight-bold"><i class="fas fa-user-circle mr-1 text-info"></i> André Castilho</p>
                <div class="pl-3 small">
                  <p class="mb-0"><i class="fas fa-envelope-square text-warning fa-fw"></i> <a href="mailto:atendimento@amcast.com.br" class="text-info font-weight-bold">atendimento@amcast.com.br</a></p>
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

    $('#btnVincularDataBanner').click(function() {
        if (typeof vincularDataJson === 'function') {
            vincularDataJson();
        }
    });

    $('#btnDispensarBanner').click(function() {
        $('#bannerVincularData').slideUp(200);
    });

    // ==========================================
    // MENU IMPORTAR / EXPORTAR E VINCULAR
    // ==========================================
    $("#linkFile").off('click').on('click', async function(e) {
        if (e && e.preventDefault) e.preventDefault();
        await vincularDataJson();
    });

    $("#export, #exportarJson").off('click').on('click', function(e) {
        if (e && e.preventDefault) e.preventDefault();
        var dadosParaExportar = sanitizarDadosParaJson(dados);
        var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dadosParaExportar, null, 2));
        var downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "data.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    $("#import").off('click').on('click', function(e) {
        if (e && e.preventDefault) e.preventDefault();
        $('#importModal').modal('show');
    });

    $("#filedata").off('change').on('change', function() {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(event) {
            atualizaListaArquivos(event.target.result);
        };
        reader.readAsText(file);
        $('#loadModal').modal('hide');
    });

    // ==========================================
    // SELEÇÃO E CONFIGURAÇÃO DE FUNDOS (TELA PADRÃO, LOUVORES, BÍBLIA)
    // ==========================================
    $('.image-select').off('click').on('click', function() {
        var rawId = $(this).attr('id');
        var valor_id = parseInt(rawId.replace('image_', ''));
        if (isNaN(valor_id)) valor_id = 1;
        $("div#images").attr("data-type", valor_id);
        reloadListOfImages();
        $('#selectImageModal').modal('show');
    });

    $('input[type=radio][name=imgColor_1], input[type=radio][name=imgColor_2], input[type=radio][name=imgColor_3]').change(function() {
        var id = parseInt($(this).attr('name').replace('imgColor_', ''));
        var tipo = parseInt($(this).val()); // 1 = Imagem, 2 = Cor
        var old = getBackground(id);
        setBackground(id, tipo, old.color, old.image_file, old.media_type);
        atualizarVisualFundoConfig(getBackground(id));
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    $('#color_1, #color_2, #color_3').on('input change', function() {
        var id = parseInt($(this).attr('id').replace('color_', ''));
        var old = getBackground(id);
        var cor = $(this).val();
        setBackground(id, 2, cor, old.image_file, old.media_type);
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    $("#selectTheme").change(function() {
        var selectedTheme = $(this).val(); 
        configuracoes.active_theme = selectedTheme;
        changeTheme();
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
    });

    $('#fontSizeRange').on('input change', function() {
        var size = parseFloat($(this).val()); 
        configuracoes.fontSize = size; 
        $('#currentFontSize').text(configuracoes.fontSize);
        atualizaFontSizeText();
        changeFontSize();
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
    });

    $("#activeTextStandartScr").change(function() {
        if ($(this).is(':checked')) {
            $("#activeTextStandartScr2").prop('checked', false);
            configuracoes.telaPadraoTexto = 1;
        } else {
            configuracoes.telaPadraoTexto = 0;
        }
        setTelaPadraoHtml(configuracoes.telaPadraoTexto);
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    $("#activeTextStandartScr2").change(function() { 
        if ($(this).is(':checked')) {
            $("#activeTextStandartScr").prop('checked', false);
            configuracoes.telaPadraoTexto = 2;
        } else {
            configuracoes.telaPadraoTexto = 0;
        }
        setTelaPadraoHtml(configuracoes.telaPadraoTexto);
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    // Botão Salvar do Modal de Configurações
    $('#confirmConf').off('click').on('click', function() {
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(e){}
        $('#confModal').modal('hide');
        generateLiveList();
        updateViewSlides(projecaoAtiva);
    });

    // Upload de novo fundo personalizado com limites e recorte 16:9
    $('#addNewImage').off('click').on('click', function() {
        $('#imagesToAdd').click();
    });

    $('#imagesToAdd').off('change').on('change', function() {
        var file = this.files[0];
        if (!file) return;

        if (typeof isFormatoPermitido === 'function' && !isFormatoPermitido(file.name, file.type)) {
            alert("Formato de arquivo não suportado (" + file.name + "). Os formatos permitidos para fundos são: MP4, AVI, JPG, JPEG, PNG, GIF, WEBP.");
            $('#imagesToAdd').val('');
            return;
        }

        var isVid = (typeof isVideoFile === 'function') ? isVideoFile(file.name) : (file.type && file.type.startsWith("video/"));

        if (isVid) {
            if (file.size > 10 * 1024 * 1024) {
                alert("O vídeo selecionado possui " + (file.size / (1024 * 1024)).toFixed(1) + " MB. O limite máximo permitido para vídeos de fundo contínuo é de 10 MB.");
                $('#imagesToAdd').val('');
                return;
            }

            var tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            var videoBlobUrl = URL.createObjectURL(file);

            tempVideo.onloadedmetadata = function() {
                URL.revokeObjectURL(videoBlobUrl);
                if (tempVideo.duration > 30.5) {
                    alert("O vídeo possui " + Math.round(tempVideo.duration) + " segundos. O tempo máximo permitido para vídeos de fundo contínuo é de 30 segundos.");
                    $('#imagesToAdd').val('');
                    return;
                }

                var reader = new FileReader();
                reader.onload = async function(e) {
                    var dataUrl = e.target.result;
                    var vidId = "bg_vid_" + Date.now();
                    try { await MediaDB.save(vidId, dataUrl); } catch(err){}

                    if (!configuracoes.images) configuracoes.images = [];
                    configuracoes.images.push({
                        id: vidId,
                        file: dataUrl,
                        name: file.name.replace(/\.[^/.]+$/, ""),
                        media_type: "video"
                    });
                    try {
                        localStorage.setItem('settings', JSON.stringify(configuracoes));
                        localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
                    } catch(err){}
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
            var reader = new FileReader();
            reader.onload = function(e) {
                var dataUrl = e.target.result;
                var img = new Image();
                img.onload = function() {
                    currentCropImage = img;
                    currentCropFileName = file.name.replace(/\.[^/.]+$/, "");

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
    $('#btnResetCrop').on('click', function() {
        $('#cropZoom').val(100);
        $('#cropZoomVal').text('100');
        $('#cropPanX').val(0);
        $('#cropPanXVal').text('0');
        $('#cropPanY').val(0);
        $('#cropPanYVal').text('0');
        desenharPreviewEnquadramento();
    });
    $('#btnConfirmCrop').on('click', async function() {
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

        var finalDataUrl = outCanvas.toDataURL('image/jpeg', 0.88);
        var bgId = "bg_img_" + Date.now();
        try { await MediaDB.save(bgId, finalDataUrl); } catch(e){}

        if (!configuracoes.images) configuracoes.images = [];
        configuracoes.images.push({
            id: bgId,
            file: finalDataUrl,
            name: currentCropFileName || "Fundo Personalizado",
            media_type: "image"
        });
        try {
            localStorage.setItem('settings', JSON.stringify(configuracoes));
            localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
        } catch(err){}

        reloadListOfImages();
        $('#cropAdjustModal').modal('hide');
        $('#imagesToAdd').val('');
        currentCropImage = null;
    });

    $("#fileImport").on('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(evt) {
            try {
                var imported = JSON.parse(evt.target.result);
                if (Array.isArray(imported)) {
                    dados = imported;
                    try { localStorage.setItem('data', JSON.stringify(sanitizarDadosParaJson(dados))); } catch(err){}
                    salvarDiretoNoDisco();
                    atualizaListasFromJSON(dados);
                    $('#importModal').modal('hide');
                    alert("Acervo de louvores importado com sucesso!");
                } else {
                    alert("O arquivo selecionado não contém uma estrutura válida de dados.");
                }
            } catch(err) {
                alert("Erro ao ler o arquivo JSON: " + err.message);
            }
        };
        reader.readAsText(file);
    });

    // Atalhos de navegação litúrgica
    $(document).keydown(function(e) {
        if ($('input:focus, textarea:focus, select:focus').length) return;

        if (e.which == 38 || e.which == 37) { // Seta para Cima ou Esquerda
            e.preventDefault();
            if (projecaoAtiva > 0) {
                projecaoAtiva--;
                mudaProjecaoAtiva();
            }
        } else if (e.which == 40 || e.which == 39) { // Seta para Baixo ou Direita
            e.preventDefault();
            var totalSlides = $('#livesongs tbody tr').length;
            if (projecaoAtiva < totalSlides - 1) {
                projecaoAtiva++;
                mudaProjecaoAtiva();
            }
        } else if (e.which == 27 || (e.which == 66 && !e.ctrlKey && !e.altKey && !e.metaKey)) { // ESC ou Tecla B (Blackout)
            e.preventDefault();
            toggleBlackout();
        } else if (e.which == 70 && !e.ctrlKey && !e.altKey && !e.metaKey) { // Tecla F (Congelar)
            e.preventDefault();
            toggleFreeze();
        }
    });

    // Inicia o sistema e remove a tela de carregamento
    carregaLouvores().finally(function() {
        hideLoading();
    });

    // Trava de segurança: garante a liberação da interface em no máximo 600ms
    setTimeout(function() {
        hideLoading();
    }, 600);

    // Inicia monitoramento contínuo das pastas automáticas
    setInterval(escanearPastasAutomaticas, 5000);
    window.addEventListener('focus', function() {
        if (typeof window.solicitarScanPastasDebounce === 'function') {
            window.solicitarScanPastasDebounce();
        } else {
            escanearPastasAutomaticas();
        }
    });

    // Vínculo do data.json via clique no badge de status
    $('#fileHandleStatus').css('cursor', 'pointer').off('click').on('click', function() {
        vincularDataJson();
    });
});
