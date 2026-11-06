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
        atualizaListaArquivos(localData);
        return;
    }

    try {
        const response = await fetch('data/data.json');
        if (!response.ok) throw new Error("Arquivo não encontrado");
        
        const data = await response.text();
        atualizaListaArquivos(data);
    } catch (error) {
        console.warn("CORS bloqueou. Carregamento manual necessário.", error);
        $('#carregarModal').modal('toggle');
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

function returnFlag(lang_code){
    var htmlflag = '&nbsp;<img src="imagens/';
    switch(lang_code){
        case "pt": { htmlflag+='brazil'; break; }
        case "en": { htmlflag+='united-states'; break; }
        case "it": { htmlflag+='italy'; break; } 
    }
    return htmlflag+='.svg" class="flag-sm">';
}

// ==========================================
// 2. RENDERIZAÇÃO DA ÁRVORE NATIVA
// ==========================================
function criarNoPasta(titulo, itens, tipo, iconePasta, iconeItem, category, folderId) {
    const details = document.createElement('details');
    details.open = true;
    
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
        
        li.innerHTML = `<i class="fas ${iconeItem}"></i> ${nomeItem}`;
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

function renderizarArvoreNativa(dadosLouvores, listaAvisos, listaImagens) {
    const container = document.getElementById('songList');
    container.innerHTML = ''; 

    if (listaAvisos && listaAvisos.length > 0) {
        const noAvisos = criarNoPasta('Avisos', listaAvisos, 'warning', 'fa-clipboard', 'fa-exclamation-triangle', 'warning');
        container.appendChild(noAvisos);
    }

    if (listaImagens && listaImagens.length > 0) {
        const noImagens = criarNoPasta('Imagens', listaImagens, 'image', 'fa-images', 'fa-file-image', 'image');
        container.appendChild(noImagens);
    }

    $('#listaDePastas').html("");
    dadosLouvores.forEach((pasta, indexPasta) => {
        if (pasta.type === "s") {
            const iconeBandeira = returnFlag(pasta.lang);
            const pastaNode = criarNoPasta(`${pasta.name} ${iconeBandeira}`, pasta.songs, 'song', 'fa-folder', 'fa-file-alt', 'song', indexPasta);
            container.appendChild(pastaNode);
        }
        $('#listaDePastas').append('<a class="dropdown-item" data-id="'+indexPasta+'">'+pasta.name+'</a>');
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
    if (tipo === 'song') {
        const folderId = elementoLi.closest('details').dataset.folderId;
        projecao.push({ id: itemId, folderId: parseInt(folderId), type: "s" });
    } else if (tipo === 'image') {
        projecao.push({ id: itemId, type: "i" });
    } else if (tipo === 'warning') {
        projecao.push({ id: itemId, type: "w" });
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
            var imagem = imagens[item.id];
            $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-image"></i>&nbsp;'+imagem.name+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'); 
        }
        if(item.type == "w") {
            var aviso = avisos[item.id];
            $('#projections tbody').append('<tr data-id="'+i+'"><td><i class="fas fa-exclamation-triangle"></i>&nbsp;'+aviso.name+'</td><td class="btn-mini"><button class="btn btn-danger btn-x">-</button></td></tr>'); 
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

$("#treesearch").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $("#songList li").each(function() {
        if ($(this).text().toLowerCase().indexOf(value) > -1) {
            $(this).show();
            $(this).closest('details').prop('open', true);
        } else {
            $(this).hide();
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
        $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delSong_msg_start']+"<strong>"+selecionado.textContent+"</strong> ?");
    } else if(tipo === "folder") {
        $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delFolder_msg_start']+"<strong>"+selecionado.textContent+"</strong>" + TRANSLATIONS[config.lang]['delFolder_msg_end']);
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
        } else if(tipo === "image"){
            imagens.splice(itemId, 1);
        } else if(tipo === "warning"){
            avisos.splice(itemId, 1);
        }
    }
    
    ref_selected = "0_0";
    
    localStorage.setItem('warnings', JSON.stringify(avisos));
    localStorage.setItem('images', JSON.stringify(imagens));
    localStorage.setItem('data', JSON.stringify(dados));
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
    var lang = $('#selectLangFolder').val();
    dados.push({name: name, type: "s", lang: lang, songs: []});
    atualizaListasFromJSON(dados);
    $('#makeFolderModal').modal('toggle');
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
    $('#newWarningModal').find('.modal-body').css({
        width:'auto', height:'auto', 'max-height':'100%'
    });
    $('#newWarningModal').modal('toggle');
});

$("#confirmCreateWarning").click(function(){ 
    var name = $('#warningName').val();
    var title = $('.warning-title').html();
    var body = $('.warning-body').html();
    var content = {title: title, body: body};

    avisos.push({name: name, warning: {content: content, type: "regular"}});
    localStorage.setItem('warnings', JSON.stringify(avisos));
    atualizaListasFromJSON(dados);

    $('#newWarningModal').modal('toggle');
});


$("#btnLaunchView").click(function(){
    startProjection(); 
});

$("#newImage").click(function(){
    $('#newImageModal').modal('toggle');
});

$("#confirmCreateImage").click(function(){ 
    var name = $('#imageName').val();
    var file = $("#fileimage").prop('files')[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var base64 = e.target.result;
            imagens.push({name: name, image: base64});
            atualizaListasFromJSON(dados);
        }
        reader.readAsDataURL(file);
    }
    $('#newImageModal').modal('toggle');
});

// ==========================================
// 6. ENCAIXE AUTOMÁTICO DE TEXTO NA TELA
// ==========================================
function generateLiveList(){ 
    var telaPadraoPainel = '<td>'+TRANSLATIONS[config.lang]['default_screen']+'</td><td></td>';
    $("#livesongs tbody").html(""); 
    $('#livesongs tbody').append('<tr data-id="0">'+telaPadraoPainel+'</tr>');
    viewSlides="<section"+getBackgroundForSection(1)+telaPadrao;
    var f = 1;
    
    $.each(projecao, function(i, item) { 
        if(item.type == "s"){
            var lang = "-"+dados[item.folderId].lang;
            if(lang == '-pt'){ lang = ""; }
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
            for (var i = item.from; i <= item.to; i++) {
                var label = bible[item.b].name+" "+(item.c+1)+":"+(i+1);
                var scripture = bible[item.b].chapters[item.c][i];
                var refverse = "b"+item.b+"c"+item.c+"v"+i;
                $('#livesongs tbody').append('<tr data-id="'+f+'"><td>'+label+'</td><td>'+scripture+'</td></tr>');
                viewSlides+="<section"+getBackgroundForSection(3)+" data-state=\"scriptures "+refverse+"\" data-background-transition=\"none\">\n<style>\n."+refverse+" footer.scripturetitle small:after{ content: \""+label+"\"; }\n."+refverse+" footer.scripturetitle{ display: block; }\n</style>\n<p>"+scripture+"</p>\n</section>\n";
                f++;
            }
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao; 
        }
        
        if(item.type == "i"){
            var imagem = imagens[item.id];
            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-image"></i>&nbsp;'+imagem.name+'</td><td><img class="responsive-img" src='+imagem.image+'></td></tr>');
            viewSlides+="<section data-background=\"#000000\">\n<img src="+imagem.image+">\n</section>\n";
            f++;
            $('#livesongs tbody').append('<tr data-id="'+f+'">'+telaPadraoPainel+'</tr>');
            f++;
            viewSlides+="<section"+getBackgroundForSection(1)+telaPadrao; 
        }
        
        if(item.type == "w"){
            var aviso = avisos[item.id];
            $("#projections tbody tr[data-id='"+i+"'] td:first-child").attr("data-goto", f);
            $('#livesongs tbody').append('<tr data-id="'+f+'"><td><i class="fas fa-exclamation-triangle"></i>&nbsp;'+aviso.name+'</td><td><strong>'+aviso.warning.content.title+'</strong><br>'+aviso.warning.content.body+'</td></tr>');
            viewSlides+="<section data-background=\"imagens/madeira_bg.jpg\">\n<table class=\"reveal warning-table\">\n<tr height=\"10vh\">\n<td class=\"warning-title\" width=\"80%\">"+aviso.warning.content.title+"</td>\n<td width=\"20%\"><div id=\"fancypart\" class=\"warning-logo\"><i class=\""+TRANSLATIONS[config.lang]['logo_icon']+"\"></i></div></td>\n</tr>\n<tr>\n<td colspan=\"2\">\n<div style=\"display: table;\">\n<div class=\"warning-body\">"+aviso.warning.content.body+"</div>\n</div>\n</td>\n</tr>\n</table>\n</section>\n";
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
    if (typeof(windowView)!='undefined' && !windowView.closed) {
        windowView.postMessage(JSON.stringify( {
            host: 'projection-html5',
            function: 'reloadReveal',
            url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
            data: viewSlides
        } ), "*");
    }
    iframeView.postMessage(JSON.stringify( {
        host: 'projection-html5',
        function: 'reloadReveal',
        url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
        data: viewSlides
    } ), "*");
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
    if (typeof(windowView)!='undefined' && !windowView.closed) {
        windowView.postMessage(JSON.stringify( {
            host: 'projection-html5',
            function: 'changeSlide',
            url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
            data: projecaoAtiva
        } ), "*"); 
    }
    iframeView.postMessage(JSON.stringify( {
        host: 'projection-html5',
        function: 'changeSlide',
        url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
        data: projecaoAtiva
    } ), "*"); 
}

$(document).on('keydown', function(e) {
    var rows = $('#livesongs > tbody > tr');
    var tag = e.target.tagName.toLowerCase();
    var tabName = $('#guias a[aria-selected="true"]').attr('aria-controls');
    
    if (tabName == "live" && tag != "input" && tag != "textarea" && tag != "a"){
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
// 7. DETECÇÃO DE POPUP BLOQUEADO 
// ==========================================
function startProjection() { 
    if (typeof(windowView) =='undefined' || windowView == null || windowView.closed) {
        windowView = window.open("view.html", "_blank", "directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,channelmode=yes, fullscreen=yes");
        
        // Se após tentar abrir o objeto não existir ou continuar fechado, o bloqueador agiu.
        if(!windowView || windowView.closed || typeof windowView.closed == 'undefined') {
            document.getElementById("loader").style.display = "none";
            document.querySelector("#loading h5").innerHTML = "⚠️ Popup Bloqueado!<br><br>O seu navegador impediu a abertura da tela de projeção.<br>Por favor, permita os popups para este site (geralmente na barra de endereços acima).<br><br><button class='btn btn-light mt-3' onclick='location.reload()'>Permiti. Recarregar Sistema</button>";
            document.getElementById("loading").style.display = "flex"; 
            return false;
        }
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
    var title = '<i class="fas fa-info-circle"></i>&nbsp;'+TRANSLATIONS[config.lang]['btn_about']['title'];
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-header > h5').html(title);
    $('#modalNotImplemented > .modal-dialog > .modal-content > .modal-body').html('<p><strong>Desenvolvido por:</strong> Ítalo Carvalho Zaina</p><p><strong>Revisores:</strong></p><ul><li>Ítalo</li><li>Sinvaldo</li><li>Geff</li></ul><h5>Contatos</h5><p><strong><i class="fas fa-envelope"></i></strong> <a href="MAILTO:italoczaina@gmail.com">italoczaina@gmail.com</a></p><p><strong><i class="fab fa-skype"></i></strong> <a href="skype:italozo?chat">italozo</a></p>');
    $('#modalNotImplemented').modal('toggle');
});

function setTelaPadraoHtml(tipo) {
    if (tipo === 1) {
        telaPadrao = ">\n<h1>"+TRANSLATIONS[config.lang]['maranata_title']+"</h1>\n<h3>"+TRANSLATIONS[config.lang]['maranata_slogan']+"</h3>\n</section>\n";
    } else if (tipo === 2) {
        telaPadrao = " data-state=\"show_backlay1\">\n<style>\n.show_backlay1 header.backlay1-"+config.lang+" .backlay_1-"+config.lang+"{display: block}\n</style>\n<h1>Santa Ceia</h1><br>\n</section>\n";
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
        $("#image_"+bg.id).css("background", "url('imagens/"+bg.image_file+"')");
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
            if (typeof(windowView)!='undefined' && !windowView.closed) {
                windowView.postMessage(JSON.stringify( {
                    host: 'projection-html5',
                    function: 'changeTheme',
                    url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
                    data: theme.file
                } ), "*"); 
            }
            iframeView.postMessage(JSON.stringify( {
                host: 'projection-html5',
                function: 'changeTheme',
                url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
                data: theme.file
            } ), "*"); 
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
    $("#image_1").css("background", "url('imagens/"+imagem+"')");
}

function changeFontSize(){
    if (typeof(windowView)!='undefined' && !windowView.closed) {
        windowView.postMessage(JSON.stringify( {
            host: 'projection-html5',
            function: 'changeFontSize',
            url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
            data: configuracoes.fontSize
        } ), "*"); 
    }
    iframeView.postMessage(JSON.stringify( {
        host: 'projection-html5',
        function: 'changeFontSize',
        url: window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search,
        data: configuracoes.fontSize
    } ), "*"); 
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
        setBackground(1,1,old.color, old.image_file);
    } else {
        $("#image_1").hide();
        $("#color_1").show();
        setBackground(1,2,old.color, old.image_file);
    }
    generateLiveList();
});

$('input[type=radio][name=imgColor_2]').change(function() { 
    var old = getBackground(2); 
    if(this.value == 1){ 
        $("#image_2").show();
        $("#color_2").hide();
        setBackground(2,1,old.color, old.image_file);
    } else {
        $("#image_2").hide();
        $("#color_2").show();
        setBackground(2,2,old.color, old.image_file);
    }
    generateLiveList();
});

$('input[type=radio][name=imgColor_3]').change(function() { 
    var old = getBackground(3); 
    if(this.value == 1){ 
        $("#image_3").show();
        $("#color_3").hide();
        setBackground(3,1,old.color, old.image_file);
    } else {
        $("#image_3").hide();
        $("#color_3").show();
        setBackground(3,2,old.color, old.image_file);
    }
    generateLiveList();
});

$('#selectImageModal').on('show.bs.modal', function (e) {
    reloadListOfImages();
});

function reloadListOfImages(){
    $('#images').html("");
    configuracoes.images.forEach(function (imagem){
        $('#images').append('<div style="background: url(\'imagens/'+imagem.file+'\');" data-file="'+imagem.file+'"></div>');
    });

    $("div#images > div").click(function (){
        var tipo = parseInt($("div#images").attr("data-type"));
        var old = getBackground(tipo);
        var file = $(this).attr("data-file");
        setBackground(tipo,1,old.color, file);
        $("#image_"+tipo).css("background", "url('imagens/"+file+"')");
        generateLiveList();
        $('#selectImageModal').modal('toggle');
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
                resp = " data-background=\"imagens/"+bg.image_file+"\"";
            } else{
                resp = " data-background=\""+bg.color+"\"";
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

function setBackground(id, tipo, cor, arquivo){
    configuracoes.backgrounds.forEach(function (bg){ 
        if(bg.id == id){ 
            bg.type = tipo;
            bg.color = cor;
            bg.image_file = arquivo;
        } 
    });
    localStorage.setItem('settings', JSON.stringify(configuracoes));
}

$('input[type="color"]').change(function (){
    var tipo = parseInt($(this).attr("id").split("_")[1]);
    var old = getBackground(tipo);
    var color = $(this).val();
    setBackground(tipo,2,color, old.file);
    generateLiveList();
});

$('#addNewImage').click(function(){
    var filename = $('#imagesToAdd')[0].files[0].name;
    configuracoes.images.push({file: filename});
    localStorage.setItem('settings', JSON.stringify(configuracoes));
    reloadListOfImages();
    $('#imagesToAdd').val('');
});

// Ao inicializar a janela, chama a proteção de verificação do bloqueador
window.onload = function() {
    setTimeout(function afterTwoSeconds() {
        defaultConfigurations();
        carregaLouvores().then(() => {
            let abriu = startProjection();
            if(abriu) {
                reloadProjectionList();
                document.getElementById("loading").style.display = "none";
            }
        });
    }, 2000);
};

(function(){
    window.addEventListener( 'message', function( event ) { 
        var data = JSON.parse( event.data ); 
        if(data.host === 'projection-html5-painel' && data.function === 'opened'){
            recarrega(data.data);
        }
    } );

    function recarrega(data) {
        reloadProjectionList();
        changeFontSize();
        changeTheme();
    }
})()

var ps = new PerfectScrollbar('#scrollblock');