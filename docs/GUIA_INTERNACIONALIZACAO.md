# Guia de Internacionalização e Multi-idiomas (i18n)

> Este documento registra o funcionamento da funcionalidade original de múltiplos idiomas do sistema Projeção ICM, como reativá-la e como adicionar novos idiomas/traduções.

---

## 1. Visão Geral da Arquitetura de Idiomas

Originalmente, o sistema contava com suporte a três idiomas:
- **Português (`pt-br`)**: Padrão do sistema.
- **Inglês (`en`)**: Para igrejas no exterior de língua inglesa.
- **Italiano (`it`)**: Para a Missão Cristã Maranata na Itália (MEMDI).

### Como funcionava a tradução dinâmica:
1. **Atributo `data-lang-str`**: No arquivo `index.html`, os elementos da interface recebiam o atributo `data-lang-str="chave_de_traducao"`.
2. **Dicionário em `js/langs.js`**: O arquivo definia um objeto `TRANSLATIONS` indexado pelo código do idioma (`pt-br`, `en`, `it`) e pelas chaves de tradução.
3. **Persistência**: O idioma escolhido ficava salvo no `localStorage` sob a chave `config` (`{ lang: "pt-br" }`).
4. **Função `translate(lang)`**: Varria todos os elementos com `[data-lang-str]` no DOM e substituía o texto (`innerText`), o HTML (`innerHTML`), o `placeholder` ou o `title` conforme definido no dicionário.
5. **Seletor no Navbar**: Um dropdown com as bandeiras dos países permitia ao operador alternar o idioma instantaneamente em tempo de execução via evento `click` nos botões com `name="btn-translate"`.
6. **Múltiplos Logos no Telão (`view.html`)**: O telão continha headers específicos para cada idioma (`winetitle-en`, `winetitle-it`, `whitelogo-en`, etc.), permitindo exibir o logotipo com a denominação local (ex: logotipo da ICM internacional).

---

## 2. Passo a Passo para Reativar a Função de Idiomas

Caso queira reativar a funcionalidade no futuro, siga os passos abaixo:

### Passo 1: Recriar o arquivo `js/langs.js`
Crie novamente o arquivo `js/langs.js` com a estrutura completa fornecida na **Seção 4** deste guia.

### Passo 2: Importar o script no `index.html`
No final de `index.html`, antes de `js/core.js`, adicione a tag `<script>` (observe que o carregamento bíblico agora ocorre sob demanda via `js/bible.js`):
```html
<script src="js/bible.js"></script>
<script src="js/langs.js"></script> <!-- ADICIONE ESTA LINHA -->
<script src="js/core.js"></script>
```

### Passo 3: Restaurar o seletor de idiomas no Navbar do `index.html`
No arquivo `index.html`, dentro de `<ul class="navbar-nav align-items-center">` (por volta da linha 70), adicione novamente o menu suspenso:
```html
<li class="nav-item dropdown mr-1">
  <a class="nav-link dropdown-toggle" href="#" id="dropdown01" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" data-lang-str="language">Idioma</a>
  <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdown01">
    <button class="dropdown-item" href="#" name="btn-translate" data-lang="pt-br"><img src="imagens/brazil.svg" class="flag"> Português</button>
    <button class="dropdown-item" href="#" name="btn-translate" data-lang="en"><img src="imagens/united-states.svg" class="flag"> English</button>
    <button class="dropdown-item" href="#" name="btn-translate" data-lang="it"><img src="imagens/italy.svg" class="flag"> Italiano</button>
  </div>
</li>
```

*(Opcional: coloque as imagens SVG das bandeiras `brazil.svg`, `united-states.svg` e `italy.svg` na pasta `imagens/`)*.

### Passo 4: Reconectar o `js/core.js` ao dicionário `TRANSLATIONS`
Em `js/core.js`, volte a utilizar `TRANSLATIONS[config.lang]` nas mensagens dinâmicas:

1. **Exclusão de músicas e pastas (`#deleteFromTree`):**
```javascript
if(tipo === "song"){
    $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delSong_msg_start']+"<strong>"+selecionado.textContent+"</strong> ?");
} else if(tipo === "folder") {
    $('#excluirModal').find('.modal-body p').html(TRANSLATIONS[config.lang]['delFolder_msg_start']+"<strong>"+selecionado.textContent+"</strong>" + TRANSLATIONS[config.lang]['delFolder_msg_end']);
}
```

2. **Tela Padrão no painel (`generateLiveList`):**
```javascript
var telaPadraoPainel = '<td>'+TRANSLATIONS[config.lang]['default_screen']+'</td><td></td>';
```

3. **Tela Padrão e Santa Ceia (`setTelaPadraoHtml`):**
```javascript
function setTelaPadraoHtml(tipo) {
    if (tipo === 1) {
        telaPadrao = ">\n<h1>"+TRANSLATIONS[config.lang]['maranata_title']+"</h1>\n<h3>"+TRANSLATIONS[config.lang]['maranata_slogan']+"</h3>\n</section>\n";
    } else if (tipo === 2) {
        telaPadrao = " data-state=\"show_backlay1\">\n<style>\n.show_backlay1 header.backlay1-"+config.lang+" .backlay_1-"+config.lang+"{display: block}\n</style>\n<h1>Santa Ceia</h1><br>\n</section>\n";
    } else {
        telaPadrao = ">\n</section>\n";
    }
}
```

4. **Sobre (`#btnAbout`):**
```javascript
var title = '<i class="fas fa-info-circle"></i>&nbsp;'+TRANSLATIONS[config.lang]['btn_about']['title'];
```

5. **Avisos no Telão:**
```javascript
viewSlides+="<section data-background=\"imagens/madeira_bg.jpg\">\n<table class=\"reveal warning-table\">\n<tr height=\"10vh\">\n<td class=\"warning-title\" width=\"80%\">"+aviso.warning.content.title+"</td>\n<td width=\"20%\"><div id=\"fancypart\" class=\"warning-logo\"><i class=\""+TRANSLATIONS[config.lang]['logo_icon']+"\"></i></div></td>\n</tr>\n...
```

6. **Indicadores de Vínculo de Arquivo e Alterações Salvas (`atualizarIndicadorVinculo` e `marcarAlteracoesPendentes`):**
```javascript
// Exemplo de integração com os novos elementos da interface v2.0.0:
$('#fileHandleStatus').html(arquivoVinculado 
    ? '<i class="fas fa-link"></i> ' + TRANSLATIONS[config.lang]['status_linked']
    : '<i class="fas fa-unlink"></i> ' + TRANSLATIONS[config.lang]['status_unlinked']);

$('#statusSalvar').html(temAlteracoesPendentes
    ? '<i class="fas fa-circle text-warning"></i> ' + TRANSLATIONS[config.lang]['status_unsaved']
    : '<i class="fas fa-check-circle text-success"></i> ' + TRANSLATIONS[config.lang]['status_saved']);
```

---

## 3. Como Adicionar um Novo Idioma (ex: Espanhol `es`)

Para traduzir o sistema para um novo idioma (como Espanhol, Francês ou Alemão), siga estes 3 passos:

### 1. Adicionar o bloco de tradução em `js/langs.js`
Dentro do objeto `TRANSLATIONS`, adicione uma nova chave com a sigla do idioma (ex: `'es'`):

```javascript
let TRANSLATIONS = {
  // ... 'en', 'pt-br', 'it' ...
  'es': {
    'navbrand': 'Proyección ICM',
    'version': 'Versión ' + VERSION,
    'btn_change_bgimage': {
      'title': 'Cambiar imagen de fondo'
    },
    'btn_create_warning': {
      'title': 'Crear aviso'
    },
    'language': 'Idioma',
    'files': 'Archivos',
    'search': {
      'placeholder': 'Buscar louvor ou letra...'
    },
    'btn_create_song': {
      'title': 'Crear música'
    },
    'btn_create_folder': {
      'title': 'Crear carpeta'
    },
    'btn_del_file_folder': {
      'title': 'Eliminar carpeta/archivo'
    },
    'load_data': 'Cargar datos',
    'load_body': {
      'html': 'Cargue manualmente su archivo <strong>(data.json)</strong> de su carpeta <strong>("/data")</strong>.<input type="file" name="filedata" id="filedata">'
    },
    'cancel': 'Cancelar',
    'delete': 'Eliminar',
    'create_folder': 'Crear carpeta',
    'create': 'Crear',
    'folder_name': {
      'placeholder': 'Nombre de la carpeta'
    },
    'tab_live': 'En Vivo',
    'tab_edition': 'Edición',
    'tab_bible': 'Biblia',
    'default_screen': 'Pantalla Estándar',
    'maranata_title': 'MARANATA',
    'maranata_slogan': '¡El Señor Jesús viene!',
    'title': 'Título:',
    'content': 'Contenido:',
    'btn_save': {
      'html': '<i class="fas fa-save"></i> Guardar'
    },
    'btn_export': {
      'html': '<i class="fas fa-download"></i> Exportar'
    },
    'bible_version': 'Versión:',
    'bible_old_testament': 'Antiguo Testamento',
    'bible_new_testament': 'Nuevo Testamento',
    'bible_chapter': 'Capítulo',
    'bible_from': 'De',
    'bible_to': 'Hasta',
    'bible_preview': 'Vista Previa',
    'btn_bible_add': {
      'html': '<i class="fas fa-plus fa-fw"></i> Añadir',
      'title': 'Añadir a la lista de proyección'
    },
    'delSong_msg_start': '¿Realmente desea eliminar la música ',
    'delFolder_msg_start': '¿Realmente desea eliminar la carpeta ',
    'delFolder_msg_end': ' y todo su contenido?',
    'list_projection': 'Lista para proyección',
    'empty_projection_list_msg': 'Lista vacía. Haga doble clic en el himno para añadir',
    'need_export_msg': {
      'html': '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>Uno o más louvores han sido editados, no olvide <strong>Exportar</strong> y reemplazar <strong>data.json</strong> en <strong>/data</strong>'
    },
    'projection': 'Proyección',
    'select_image': 'Seleccionar Imagen',
    'import_export': 'Importar/Exportar',
    'btn_menu_import': {
      'html': '<i class="fas fa-upload"></i> Importar...',
    },
    'btn_menu_export': {
      'html': '<i class="fas fa-download"></i> Exportar...',
    },
    'btn_start_view': {
      'title': 'Abrir pantalla de proyección'
    },
    'btn_create_image': {
      'title': 'Nueva imagen'
    },
    'not_implemented': 'Función no implementada.',
    'new_image': 'Nueva Imagen',
    'image_name': {
      'placeholder': 'Nombre de la imagen'
    },
    'btn_about': {
      'title': 'Acerca de'
    },
    'images': 'Imágenes',
    'warnings': 'Avisos',
    'new_warning': 'Nuevo aviso',
    'warning_name': {
      'placeholder': 'Nombre del aviso'
    },
    'warning': 'Aviso',
    'logo_icon': 'icon-logo_bold',
    'link_data_file': 'Vincular data.json',
    'status_saved': 'Guardado',
    'status_unsaved': 'Cambios no guardados',
    'status_linked': 'Vinculado',
    'status_unlinked': 'No vinculado',
    'obs_output': 'Salida OBS',
    'btn_preview_media': 'Previsualizar',
    'rename_folder': 'Renombrar carpeta'
  }
};
```

### 2. Adicionar a opção no Dropdown do `index.html`
No menu suspenso `#dropdown01`:
```html
<button class="dropdown-item" href="#" name="btn-translate" data-lang="es">
  <img src="imagens/spain.svg" class="flag"> Español
</button>
```

### 3. (Opcional) Cabeçalhos de Telão para o novo idioma em `view.html`
Se o novo idioma exigir logotipo próprio ou posicionamento diferente de títulos:
```html
<!-- es Headers -->
<header class="winetitle-es"><div id="titulo"></div><div id="logo" style="background-color:white"><i class="icon-logo_bold"></i></div></header>
<header class="winetitle2-es"><div id="titulo"><br></div><div id="logo" style="background-color:white"><i class="icon-logo_bold"></i></div></header>    
<header class="whitelogo-es"><div id="logo" style="float:right"><i class="icon-logo_bold_white"></i></div></header>
<header class="backlay1-es"><div class="backlay_1-es"><i class="logo_tela_padrao icon-logo_bold_white"></i></div></header>
```

---

## 4. Código-Fonte Original de Referência (`js/langs.js`)

Abaixo está o código-fonte integral original do `js/langs.js` para restauração imediata:

```javascript
var config = { lang: "pt-br" };
if(localStorage.getItem("config") === null){  
  localStorage.setItem('config', JSON.stringify(config));
} else {
  config = JSON.parse(localStorage.getItem("config"));
}
let DEFAULT_LANG = config.lang;
let DATA_LANG_ELEMENTS = document.querySelectorAll('[data-lang-str]');
let VERSION = '1.0.0';
let TRANSLATIONS = {
  'en': {
    'navbrand': 'Projection MCC',
    'version': 'Version '+VERSION,
    'btn_change_bgimage': {
      'title': 'Change background image'
    },
    'btn_create_warning': {
      'title': 'Create warning'
    },
    'language': 'Language',
    'files': 'Files',
    'search': {
      'placeholder':'Search'
    },
    'btn_create_song': {
      'title': 'Create song'
    },
    'btn_create_folder': {
      'title': 'Create folder'
    },
    'btn_del_file_folder': {
      'title': 'Delete file/folder'
    },
    'load_data': 'Load data',
    'load_body': {
      'html': 'The Mozilla Firefox browser was not detected, in which case you should manually open your data file <strong>(data.json)</strong> which is in your folder <strong>("/data")</strong>.<input type="file" name="filedata" id="filedata">'
    },
    'cancel': 'Cancel',
    'delete': 'Delete',
    'create_folder': 'Create folder',
    'create': 'Create',
    'folder_name': {
      'placeholder': 'Folder name'
    },
    'tab_live': 'Live',
    'tab_edition': 'Edition',
    'tab_bible': 'Bible',
    'default_screen': 'Standard Screen',
    'maranata_title': 'MARANATHA',
    'maranata_slogan': 'The Lord Jesus is coming!',
    'title': 'Title:',
    'content': 'Content:',
    'btn_save': {
      'html': '<i class="fas fa-save"></i> Save'
    },
    'btn_export': {
      'html': '<i class="fas fa-download"></i> Export'
    },
    'bible_version': 'Version:',
    'bible_old_testament': 'Old Testament',
    'bible_new_testament': 'New Testament',
    'bible_chapter': 'Chapter',
    'bible_from': 'From',
    'bible_to': 'To',
    'bible_preview': 'Preview',
    'btn_bible_add': {
      'html': '<i class="fas fa-plus fa-fw"></i> Add',
      'title': 'Add to projection list'
    },
    'delSong_msg_start': 'Do you really want to delete the music ',
    'delFolder_msg_start': 'Do you really want to delete the folder ',
    'delFolder_msg_end': ' and all its content ?',
    'list_projection': 'List to projection',
    'empty_projection_list_msg': 'Empty list. Double click on the song to add',
    'need_export_msg': {
      'html': '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>One or more songs from your list have been edited, do not forget to <strong>Export</strong> and replace <strong>data.json</strong> in your folder <strong>/data</strong>'
    },
    'projection': 'Projection',
    'select_image': 'Select Image',
    'import_export': 'Import/Export',
    'btn_menu_import': {
      'html': '<i class="fas fa-upload"></i> Import...',
    },
    'btn_menu_export': {
      'html': '<i class="fas fa-download"></i> Export...',
    },
    'btn_start_view': {
      'title': 'Open projection screen'
    },
    'btn_create_image': {
      'title': 'New image'
    },
    'not_implemented':'Function not implemented.',
    'new_image': 'New Image',
    'image_name': {
      'placeholder': 'Image name'
    },
    'btn_about': {
      'title': 'About'
    },
    'images': 'Images',
    'warnings': 'Warnings',
    'new_warning': 'New warning',
    'warning_name': {
      'placeholder': 'Warning name'
    },
    'warning':'Warning',
    'logo_icon':'icon-logo_usa',
    'link_data_file': 'Link data.json',
    'status_saved': 'Saved',
    'status_unsaved': 'Unsaved changes',
    'status_linked': 'Linked',
    'status_unlinked': 'Not linked',
    'obs_output': 'OBS Output',
    'btn_preview_media': 'Preview',
    'rename_folder': 'Rename folder'
  },
  'pt-br': {
    'navbrand': 'Projeção ICM',
    'version': 'Versão '+VERSION,
    'btn_change_bgimage': {
      'title': 'Alterar imagem de fundo'
    },
    'btn_create_warning': {
      'title': 'Criar aviso'
    },
    'language': 'Idioma',
    'files': 'Arquivos',
    'search': {
      'placeholder':'Pesquisar'
    },
    'btn_create_song': {
      'title': 'Criar música'
    },
    'btn_create_folder': {
      'title': 'Criar pasta'
    },
    'btn_del_file_folder': {
      'title': 'Apagar pasta/arquivo'
    },
    'load_data': 'Carregar dados',
    'load_body': {
      'html': 'Não foi detectado o navegador Mozilla Firefox, neste caso você deverá abrir manualmente seu arquivo de dados <strong>(data.json)</strong> que esta em sua pasta <strong>("/data")</strong>.<input type="file" name="filedata" id="filedata">'
    },
    'cancel': 'Cancelar',
    'delete': 'Apagar',
    'create_folder': 'Criar pasta',
    'create': 'Criar',
    'folder_name': {
      'placeholder': 'Nome da pasta'
    },
    'tab_live': 'Ao Vivo',
    'tab_edition': 'Edição',
    'tab_bible': 'Bíblia',
    'default_screen': 'Tela Padrão',
    'maranata_title': 'MARANATA',
    'maranata_slogan': 'O Senhor Jesus vem!',
    'title': 'Título:',
    'content': 'Conteúdo:',
    'btn_save': {
      'html': '<i class="fas fa-save"></i> Salvar'
    },
    'btn_export': {
      'html': '<i class="fas fa-download"></i> Exportar'
    },
    'bible_version': 'Versão:',
    'bible_old_testament': 'Velho testamento',
    'bible_new_testament': 'Novo testamento',
    'bible_chapter': 'Capítulo',
    'bible_from': 'Do',
    'bible_to': 'Até',
    'bible_preview': 'Pré-visualização',
    'btn_bible_add': {
      'html': '<i class="fas fa-plus fa-fw"></i> Adicionar',
      'title': 'Adicionar a lista de projeção'
    },
    'delSong_msg_start': 'Deseja realmente apagar a música ',
    'delFolder_msg_start': 'Deseja realmente apagar a pasta ',
    'delFolder_msg_end': ' e todo o seu conteúdo ?',
    'list_projection': 'Lista para projeção',
    'empty_projection_list_msg': 'Lista vazia. Dê um duplo clique sobre o louvor para adicionar',
    'need_export_msg': {
      'html': '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>Um ou mais louvores de sua lista foram editados, não esqueça de <strong>Exportar</strong> e substituir o <strong>data.json</strong> em sua pasta <strong>/data</strong>'
    },
    'projection': 'Projeção',
    'select_image': 'Selecionar Imagem',
    'import_export': 'Importar/Exportar',
    'btn_menu_import': {
      'html': '<i class="fas fa-upload"></i> Importar...',
    },
    'btn_menu_export': {
      'html': '<i class="fas fa-download"></i> Exportar...',
    },
    'btn_start_view': {
      'title': 'Abrir tela de projeção'
    },
    'btn_create_image': {
      'title': 'Nova imagem'
    },
    'not_implemented':'Função não implementada.',
    'new_image': 'Nova Imagem',
    'image_name': {
      'placeholder': 'Nome da imagem'
    },
    'btn_about': {
      'title': 'Sobre'
    },
    'images': 'Imagens',
    'warnings': 'Avisos',
    'new_warning': 'Novo aviso',
    'warning_name': {
      'placeholder': 'Nome do aviso'
    },
    'warning':'Aviso',
    'logo_icon':'icon-logo_bold',
    'link_data_file': 'Vincular data.json',
    'status_saved': 'Salvo',
    'status_unsaved': 'Alterações não salvas',
    'status_linked': 'Vinculado',
    'status_unlinked': 'Não vinculado',
    'obs_output': 'Saída OBS',
    'btn_preview_media': 'Visualizar',
    'rename_folder': 'Renomear pasta'
  },
  'it': {
    'navbrand': 'Proiezione MEMDI',
    'version': 'Versione '+VERSION,
    'btn_change_bgimage': {
      'title': 'Cambia immagine di sfondo'
    },
    'btn_create_warning': {
      'title': 'Crea un avvertimento'
    },
    'language': 'Lingua',
    'files': 'Archivios',
    'search': {
      'placeholder':'Per cercare'
    },
    'btn_create_song': {
      'title': 'Crea musica'
    },
    'btn_create_folder': {
      'title': 'Crea cartella'
    },
    'btn_del_file_folder': {
      'title': 'Elimina musica/cartella'
    },
    'load_data': 'Carica i dati',
    'load_body': {
      'html': 'l browser Mozilla Firefox non è stato rilevato, nel qual caso è necessario aprire manualmente il file di dati <strong>(data.json)</strong> cosa c\'è nel tuo cartella <strong>("/data")</strong>.<input type="file" name="filedata" id="filedata">'
    },
    'cancel': 'Annullare',
    'delete': 'Cancellare',
    'create_folder': 'Crea cartella',
    'create': 'Creare',
    'folder_name': {
      'placeholder': 'Nome della cartella'
    },
    'tab_live': 'Vivere',
    'tab_edition': 'Edizione',
    'tab_bible': 'Bibbia',
    'default_screen': 'Schermo standard',
    'maranata_title': 'MARANATA',
    'maranata_slogan': 'Il Signore Gesù viene!',
    'title': 'Titolo:',
    'content': 'Contenuto:',
    'btn_save': {
      'html': '<i class="fas fa-save"></i> Salvare'
    },
    'btn_export': {
      'html': '<i class="fas fa-download"></i> Esportazione'
    },
    'bible_version': 'Versione:',
    'bible_old_testament': 'Vecchio testamento',
    'bible_new_testament': 'Nuovo testamento',
    'bible_chapter': 'Capitolo',
    'bible_from': 'Di',
    'bible_to': 'A',
    'bible_preview': 'Anteprima',
    'btn_bible_add': {
      'html': '<i class="fas fa-plus fa-fw"></i> Aggiungi',
      'title': 'Aggiungi alla lista di proiezione'
    },
    'delSong_msg_start': 'Vuoi davvero eliminare la musica ',
    'delFolder_msg_start': 'Vuoi davvero eliminare la cartella ',
    'delFolder_msg_end': ' e todo o seu conteúdo ?',
    'list_projection': 'Lista di proiezione',
    'empty_projection_list_msg': 'Lista vuota. Fai doppio clic sulla canzone da aggiungere',
    'need_export_msg': {
      'html': '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>Uno o più brani della tua lista sono stati modificati, non dimenticarti di <strong>Esportare</strong> e sostituire il <strong>data.json</strong> nel tuo cartella <strong>/data</strong>'
    },
    'projection': 'Proiezione',
    'select_image': 'Seleziona immagine',
    'import_export': 'Importare/Esportare',
    'btn_menu_import': {
      'html': '<i class="fas fa-upload"></i> Importare...',
    },
    'btn_menu_export': {
      'html': '<i class="fas fa-download"></i> Esportare...',
    },
    'btn_start_view': {
      'title': 'Apri lo schermo di proiezione'
    },
    'btn_create_image': {
      'title': 'Nuova immagine'
    },
    'not_implemented':'Funzione não implementata.',
    'new_image': 'Nuova immagine',
    'image_name': {
      'placeholder': 'Nome dell\'immagine'
    },
    'btn_about': {
      'title': 'Informazioni'
    },
    'images': 'Immagini',
    'warnings': 'Avvertenze',
    'new_warning': 'Nuovo avviso',
    'warning_name': {
      'placeholder': 'Nome dell\'avviso'
    },
    'warning':'Avviso',
    'logo_icon':'icon-logo_ita',
    'link_data_file': 'Collega data.json',
    'status_saved': 'Salvato',
    'status_unsaved': 'Modifiche non salvate',
    'status_linked': 'Collegato',
    'status_unlinked': 'Non collegato',
    'obs_output': 'Uscita OBS',
    'btn_preview_media': 'Anteprima',
    'rename_folder': 'Rinomina cartella'
  }
};

const translate = (lang = null) => {
  if (lang === null) {
    lang = DEFAULT_LANG;
  }
  let DEFAULT_LANG_LENGTH = Object.keys(TRANSLATIONS[DEFAULT_LANG]).length;
  if (TRANSLATIONS[lang]) {
    let LANG_LENGTH = Object.keys(TRANSLATIONS[lang]).length;
    if (LANG_LENGTH < DEFAULT_LANG_LENGTH) {
      console.log("Tradução incompleta");
    }
    DATA_LANG_ELEMENTS.forEach((el) => {
      let STR = el.getAttribute('data-lang-str');
      if (TRANSLATIONS[lang][STR]) {        
        if(typeof TRANSLATIONS[lang][STR] == "string"){
          el.innerText = (TRANSLATIONS[lang][STR]);
        } else {
          if((TRANSLATIONS[lang][STR]).html){
            el.innerHTML = (TRANSLATIONS[lang][STR]).html;
          }
          if((TRANSLATIONS[lang][STR]).title){
            el.title = (TRANSLATIONS[lang][STR]).title;
          }
          if((TRANSLATIONS[lang][STR]).placeholder){
            el.placeholder = (TRANSLATIONS[lang][STR]).placeholder;
          } 
        }        
      }
    });
  } else {
    console.log("Não há tradução");
  }
}

let BTNS_TRANSLATE = document.querySelectorAll('[name=btn-translate]');
BTNS_TRANSLATE.forEach((btn) => {
  btn.addEventListener('click', (ev) => {
    translate(btn.getAttribute('data-lang'));
    config.lang = btn.getAttribute('data-lang');
    localStorage.setItem('config', JSON.stringify(config));
  });
});

translate();
```
