# Relatório de Engenharia Reversa & Especificação Técnica de Melhorias
## Sistema: Projeção ICM v2 (`projectionICMv2`)

---

## 1. Identificação e Metadados do Projeto

| Parâmetro | Detalhe |
| :--- | :--- |
| **Nome do Software** | Projeção ICM (Versão 2) |
| **Repositório Git** | `https://github.com/chacalbl4ck/projectionICMv2.git` |
| **Autor Original** | Ítalo Carvalho Zaina |
| **Branch Analisada** | `main` (Commit `0c4308b` - *First Release*) |
| **Tecnologias Base** | HTML5, JavaScript (ES6+), CSS3/SCSS, jQuery 3.3.1, Bootstrap 4, Reveal.js, FontAwesome 5, PerfectScrollbar |
| **Domínio da Aplicação**| Projeção litúrgica multimídia para cultos da Igreja Cristã Maranata (Louvores, Bíblias, Avisos, Imagens) |
| **Ambiente de Execução**| Navegador Web (Mozilla Firefox nativo; Chrome/Edge com suporte a File System Access API) |
| **Política de Conteúdo**| **Projeto de uso interno/privado**: o acervo integral de louvores (`data.json`) e as versões bíblicas completas (`acf.js` e `nvi.js`) são ativos essenciais permanentes e **não serão removidos nem reduzidos**. |

---

## 2. Inventário Completo de Arquivos e Componentes

A estrutura física do repositório conta com **102 arquivos** totalizando aproximadamente **16,5 MB**, distribuídos conforme o levantamento abaixo:

```
projection-html5-icm-master/
├── index.html                    <-- Interface de Operação (Painel de Controle)
├── view.html                     <-- Interface de Apresentação (Telão / Janela Externa)
├── README.md                     <-- Documentação básica de instalação/uso
├── RELATORIO_ENGENHARIA_REVERSA.md <-- [Este Documento de Referência]
├── bible/                        <-- Bases de dados bíblicos em JavaScript puro
│   ├── acf.js                    <-- Almeida Corrigida Fiel (~4.02 MB)
│   └── nvi.js                    <-- Nova Versão Internacional (~4.03 MB)
├── css/                          <-- Estilos da aplicação
│   ├── bootstrap.min.css         <-- Bootstrap v4 base
│   ├── bootstrap-grid.min.css    <-- Grid flexbox Bootstrap
│   ├── bootstrap-reboot.min.css  <-- CSS reset
│   ├── fa-svg-with-js.css        <-- Estilos do FontAwesome SVG
│   ├── perfect-scrollbar.css     <-- Barras de rolagem customizadas
│   ├── reveal.css                <-- Framework Reveal.js (apresentação de slides)
│   ├── style.css                 <-- Estilos específicos do Painel (index.html)
│   ├── view.css                  <-- Estilos dos slides, cabeçalhos e chaves (view.html)
│   ├── theme/                    <-- Temas do Reveal.js (icm.css, ceia.css e SCSS)
│   └── themes/                   <-- [ÓRFÃO] Temas do jsTree (default e default-dark)
├── data/
│   └── data.json                 <-- Banco de dados principal de louvores (~1.81 MB)
├── docs/                         <-- Manuais, assets e documentação Jekyll/Markdown
│   └── ENGENHARIA_REVERSA.md     <-- Documento referencial de melhorias
├── fontes/                       <-- Tipografias personalizadas e WebFonts
│   ├── fonts.css                 <-- Declarações @font-face
│   ├── Futura_Extra_Black_BT.ttf <-- Fonte principal de letras
│   ├── TrajanPro-Regular.ttf     <-- Fonte de títulos (Maranata / Santa Ceia)
│   ├── Jester.ttf / scriptmt.ttf <-- Fontes complementares
│   └── icm.ttf / icm.woff / .svg <-- Fonte de ícones específicos da ICM
├── imagens/                      <-- Imagens de fundo, chaves musicais e bandeiras
└── js/                           <-- Scripts e bibliotecas
    ├── jquery-3.3.1.min.js       <-- jQuery v3.3.1
    ├── popper.min.js             <-- Utilitário de posicionamento Bootstrap
    ├── bootstrap.min.js          <-- Componentes interativos Bootstrap
    ├── reveal.js                 <-- Motor de apresentação de slides
    ├── perfect-scrollbar.js      <-- Rolagem fluida de painéis
    ├── fontawesome-all.min.js    <-- Acervo de ícones
    ├── jquery.selection.js       <-- Utilitário de inserção de tags em textarea
    ├── langs.js                  <-- Sistema de internacionalização (pt-br, en, it)
    ├── bible.js                  <-- Controlador do leitor bíblico
    ├── core.js                   <-- Núcleo de lógica do painel e controle de projeção
    └── jstree.js / jstree.min.js <-- [ÓRFÃO] Antiga biblioteca de árvore de arquivos
```

---

## 3. Engenharia Reversa Detalhada dos Módulos

### 3.1. Painel de Controle Principal (`index.html`)

O `index.html` atua como a central de comando do operador e está particionado em 5 áreas funcionais estruturadas via Bootstrap Grid:

1. **Barra Superior (`<nav class="navbar">`):**
   - Configurações globais (`#btnAbrirConf`): temas, tamanhos de fonte, imagens de fundo e texto da tela padrão.
   - Criador de avisos rápidos (`#btnCreateWarn`).
   - Menu Dropdown Importar/Exportar:
     - `#linkFile`: Conexão direta ao arquivo físico via File System Access API.
     - `#import` e `#export`: Métodos legados de upload/download de `data.json`.
   - Seletor de Idioma (`[name="btn-translate"]`): Alternância entre Português, Inglês e Italiano.
   - Disparo do Telão (`#btnLaunchView`): Abre a janela de projeção externa.
2. **Coluna Esquerda - Árvore de Arquivos (`col-3`):**
   - Barra de ferramentas com botões para novo louvor, nova pasta, nova imagem e exclusão.
   - Campo de busca instantânea (`#treesearch`).
   - Container `#songList` preenchido dinamicamente com nós nativos `<details>` e `<summary>`.
3. **Coluna Central - Área de Trabalho em Abas (`col-6`):**
   - **Aba "Ao Vivo" (`#live`):** Tabela `#livesongs` exibindo a estrofe atual em projeção (destacada com classe `.active`) e estrofes subsequentes, com suporte a rolagem sincronizada.
   - **Aba "Edição" (`#edit`):** Editor de louvores contendo título e área de texto com barra de ferramentas WYSIWYG rápida para injeção de marcadores hinológicos (`BIS`, `CORO`, `FINAL`, `Contracanto`, `Repetições`).
   - **Aba "Bíblia" (`#bible`):** Interface de seleção hierárquica (Testamento -> Livro -> Capítulo -> Versículos Inicial e Final) e pré-visualização de texto.
4. **Coluna Direita Superior - Fila de Projeção (`col-3`):**
   - Tabela `#projections` listando todos os itens em fila com opção de exclusão unitária (`btn-x`) e ativação direta ao clicar.
5. **Coluna Direita Inferior - Miniatura de Retorno (`col-3`):**
   - `<iframe>` incorporando diretamente o arquivo `view.html`, garantindo que o operador veja exatamente o que o público vê no telão.

---

### 3.2. Núcleo Lógico e de Estado (`js/core.js`)

O arquivo `core.js` (1.066 linhas) é o controlador central da aplicação.

#### A. Tabela de Variáveis de Estado Global
| Variável | Tipo | Finalidade |
| :--- | :--- | :--- |
| `dados` | `Array<Object>` | Estrutura hierárquica de pastas e louvores em memória. |
| `projecao` | `Array<Object>` | Fila ordenada de itens a serem projetados (`s`=louvor, `b`=bíblia, `i`=imagem, `w`=aviso). |
| `imagens` | `Array<Object>` | Lista de imagens carregadas em Base64 (`{name, image}`). |
| `avisos` | `Array<Object>` | Lista de avisos formatados (`{name, warning}`). |
| `pastaAtiva` / `louvorAtivo` | `Number` | Ponteiros para a pasta e o louvor selecionados na árvore. |
| `projecaoAtiva` | `Number` | Índice absoluto do slide/linha atualmente em exibição na aba "Ao Vivo". |
| `windowView` | `Window \| null` | Referência à janela pop-up externa da projeção. |
| `iframeView` | `Window` | Referência ao `contentWindow` do `<iframe>` de miniatura interna. |
| `viewSlides` | `String` | Buffer HTML contendo todas as seções `<section>` prontas para o Reveal.js. |
| `configuracoes` | `Object` | Objeto de configurações (temas, fontes, backgrounds, tela padrão). |
| `fileHandle` | `FileSystemFileHandle` | Permissão concedida pelo navegador para escrita contínua em disco via File System Access API. |

#### B. Mapa de Funções do `core.js`
* **Persistência & File System:**
  - `$("#linkFile").click()` (L22–34): Invoca `window.showOpenFilePicker` e vincula o arquivo `data.json` local.
  - `salvarDiretoNoDisco()` (L37–50): Escreve assincronamente os dados serializados via `fileHandle.createWritable()`.
  - `carregaLouvores()` (L52–69): Tenta ler do `localStorage('data')`. Caso não exista, dispara `fetch('data/data.json')`. Se bloqueado por CORS, abre o modal manual `#carregarModal`.
  - `$("#save").click()` (L372–392): Atualiza os campos do louvor ativo em memória, salva no `localStorage` e tenta gravação em disco.
* **Renderização da Árvore de Arquivos:**
  - `criarNoPasta(...)` (L97–142): Gera dinamicamente elementos semânticos `<details>` e `<summary>`, anexando listeners de clique simples (`selecionarItemDaLista`) e duplo clique (`adicionarAProjecao`).
  - `renderizarArvoreNativa(...)` (L144–177): Limpa e reconstrói as seções de Avisos, Imagens e Pastas de Louvores com suas respectivas bandeiras idiomáticas (`returnFlag`).
* **Compilação de Slides (`generateLiveList()` - L467–568):**
  - Converte as quebras de linha duplas (`\n\n`) em seções independentes do Reveal.js (`<section>`).
  - Interpola regras CSS em linha com estados dinâmicos (`data-state="showtitle..."` e blocos `<style>`).
  - Aplica o cálculo heurístico de escala de fonte baseado no comprimento de caracteres:
    - $> 350$ caracteres $\rightarrow$ `font-size: 60%`
    - $> 250$ caracteres $\rightarrow$ `font-size: 75%`
    - $> 150$ caracteres $\rightarrow$ `font-size: 90%`
    - $\le 150$ caracteres $\rightarrow$ `font-size: 100%`
* **Transmissão e Sincronização:**
  - `updateViewSlides()` (L570–585): Envia comando `reloadReveal` com o conteúdo completo de `viewSlides` para a janela externa e para o iframe.
  - `mudaSlide()` (L596–612): Envia comando `changeSlide` transmitindo o índice numérico do slide.
  - `$(document).on('keydown')` (L613–661): Captura setas direcionais (←, ↑, →, ↓) para navegação entre estrofes, tecla ESC para retornar à tela padrão, e atalho `Ctrl+S` para salvar.
* **Ciclo de Vida & Abertura da Janela:**
  - `startProjection()` (L672–685): Dispara `window.open("view.html", "_blank", ...)`.
  - `window.onload` (L1038–1049): Executa um timer de 2 segundos que chama automaticamente `startProjection()`.

---

### 3.3. Janela de Apresentação (`view.html`)

O arquivo `view.html` é um consumidor passivo de eventos:
* **Inicialização do Reveal.js (L47–55):**
  ```javascript
  Reveal.initialize({
    controls: false,
    progress: false,
    history: false,
    keyboard: true,
    center: true,
    transition: 'fade'
  });
  ```
* **Protocolo de Mensagens Recebidas (`window.addEventListener('message')`):**
  - `reloadReveal`: Injeta o HTML bruto na div `.slides`, reinicializa a instância do Reveal e executa `Reveal.sync()`.
  - `changeSlide`: Invoca `Reveal.slide(index, index, index)`.
  - `changeBg`: Atualiza o estilo `document.body.style.backgroundImage`.
  - `changeTheme`: Troca o stylesheet apontado pelo elemento `<link id="theme">`.
  - `changeFontSize`: Recalcula o tamanho da fonte proporcional à largura da janela (`(size + 2) + "vw"`).
* **Handshake com a Janela Pai (L119–126):**
  - No `$(document).ready()`, dispara via `window.opener.postMessage` a mensagem `opened`, avisando o painel que o telão está aberto e pronto para receber o estado atual.

---

### 3.4. Módulo Bíblico (`js/bible.js` e `bible/*.js`)

* **Estrutura dos Dados:**
  - `bible/acf.js` e `bible/nvi.js` carregam matrizes tridimensionais globais:
    $$\text{bibleacf} = [ \{ \text{abbrev}: "gn", \text{chapters}: [ ["v1", "v2", \dots], \dots ] \}, \dots ]$$
* **Operação de Busca e Navegação:**
  - `ajustarListasDaBiblia()`: Separa os 66 livros da Bíblia entre Velho Testamento (índices 0 a 38) e Novo Testamento (índices 39 a 65).
  - `selectBook()`: Popula os capítulos com base na contagem definida em `bookNames`.
  - `selectChapter()`: Carrega os versículos nas listas "Do" (`#listaDe`) e "Até" (`#listaAte`).
  - `#addBibleToProjection.click()`: Empacota a seleção no formato `{ b, c, from, to, type: "b" }` e envia para a fila de projeção.

---

### 3.5. Formato de Dados dos Louvores (`data/data.json`)

O arquivo `data/data.json` possui ~1,81 MB e estrutura hierárquica simples em JSON puro:

```json
[
  {
    "name": "Coletânea 2018",
    "type": "s",
    "lang": "pt",
    "songs": [
      {
        "title": "1 - O SANGUE DE JESUS TEM PODER",
        "content": "O SANGUE DE JESUS TEM PODER,\nPODER QUE A MIM PODE VALER,\n...\n\n<font color=\"yellow\"><i>CORO</i></font>\nDERRAMA DO TEU SANGUE SOBRE MIM, Ó SENHOR,\n..."
      }
    ]
  }
]
```

#### Notações e Tags Hinológicas Empregadas nas Letras:
* **Separador de Slide:** Quebra de linha dupla (`\n\n`).
* **Chave BIS:** `<blockquote class="chave-bis">...</blockquote>` ou `chave-bis-small`.
* **Repetições Numéricas:** `<blockquote class="chave-2x">` até `chave-6x` (e variantes `-small`).
* **Coro / Refrão:** `<font color="yellow"><i>CORO</i></font>`.
* **Final:** `<font color="yellow"><i>FINAL:</i></font>`.
* **Contracanto / Voz Secundária:** `<i><font color="#00ff00">...</font></i>`.
* **Indicação de Naipes:** `<font color="yellow"><i>(VARÕES)</i></font>` e `<font color="yellow"><i>(SERVAS)</i></font>`.

---

## 4. Diagnóstico Técnico de Vulnerabilidades e Gargalos

### 4.1. Bloqueio Agressivo de Pop-up (Crítico)
* **Local:** `js/core.js` (linhas 1038–1049).
* **Causa:** O método `window.open` é chamado automaticamente dentro de um temporizador de 2 segundos após o `window.onload`.
* **Consequência:** Todos os navegadores baseados em Chromium e Gecko categorizam essa chamada como pop-up não solicitado e bloqueiam a janela, exibindo um alerta na barra de endereços e impedindo o funcionamento imediato do sistema.

### 4.2. Falha de CORS ao Abrir por Duplo Clique em Arquivo Local (`file:///`)
* **Local:** `js/core.js` (linhas 59–69).
* **Causa:** `fetch('data/data.json')` executado sob o protocolo `file:///`.
* **Consequência:** Bloqueio de segurança padrão do Chrome e Edge. O usuário é obrigado a importar manualmente o arquivo a cada inicialização, a menos que utilize o Firefox ou execute via servidor HTTP local.

### 4.3. Risco Crítico de Esgotamento do `localStorage` (QuotaExceededError)
* **Local:** `js/core.js` (linhas 211, 343, 378, 456).
* **Causa:** A base de hinos (`1.8 MB`) e as imagens carregadas em Base64 são salvas repetidamente no `localStorage`.
* **Consequência:** A cota de armazenamento padrão do navegador varia entre 5 MB e 10 MB. Duas ou três fotos de alta resolução enviadas pelo operador provocam uma exceção `DOMException: QuotaExceededError`, corrompendo ou impedindo a gravação de novos hinos.

### 4.4. Fragilidade de Segurança e Origem Insegura no `postMessage`
* **Local:** `js/core.js` (linhas 577, 584, 603, 610) e `view.html` (linha 57).
* **Causa:** As mensagens são enviadas com destino curinga `"*"` e a janela receptora não verifica `event.origin`.
* **Consequência:** Qualquer script ou frame de terceiros carregado no mesmo contexto de navegação pode interceptar os dados projetados ou forjar comandos de projeção.

### 4.5. Injeção Direta de HTML sem Sanitização (Risco de XSS)
* **Local:** `js/core.js` (linhas 480, 503, 509) e `view.html` (linha 104).
* **Causa:** Concatenação direta de strings dos campos `title` e `content` diretamente na propriedade `innerHTML`.
* **Consequência:** Se um louvor importar código malicioso (tags `<img src=x onerror=...>` ou `<script>`), o código será executado com privilégios totais na máquina do operador.

### 4.6. Desperdício de Recursos de Memória no Startup
* **Local:** `index.html` (linhas 541–542).
* **Causa:** Inclusão direta de `bible/nvi.js` (4.03 MB) e `bible/acf.js` (4.02 MB) via tags `<script>`.
* **Consequência:** Mais de 8 MB de texto JavaScript são compilados pelo motor V8 imediatamente no carregamento da página, mesmo que o operador nunca utilize a aba de Bíblia durante o culto.

### 4.7. Limitação Estrutural da Busca do Painel
* **Local:** `js/core.js` (linhas 280–290).
* **Causa:** O filtro de busca itera apenas sobre `$("#songList li")`, verificando o texto visível no elemento da lista (que contém unicamente o título do louvor).
* **Consequência:** Não é possível buscar louvores por estrofes, refrões ou palavras-chave conhecidas da letra.

---

## 5. Especificação Técnica e Plano de Ação das Melhorias

Abaixo encontram-se as especificações completas e prontas para implementação das melhorias prioritárias.

---

### Melhoria 1: Migração para a API Nativa `BroadcastChannel`
* **Objetivo:** Desacoplar a dependência frágil de `window.opener` e `windowView.postMessage`, permitindo que múltiplos clientes (janela do telão, tela do púlpito, miniatura do painel e OBS Studio) se sincronizem instantaneamente de forma bidirecional.
* **Especificação do Canal:** Criar o canal global `'projecao_icm_channel'`.
* **Formato dos Pacotes:**
  ```typescript
  interface BroadcastMessage {
    action: 'RELOAD_SLIDES' | 'CHANGE_SLIDE' | 'CHANGE_THEME' | 'CHANGE_FONT_SIZE' | 'BLACKOUT' | 'FREEZE';
    payload: any;
    timestamp: number;
  }
  ```
* **Implementação no Painel (`core.js`):**
  ```javascript
  const canalProjecao = new BroadcastChannel('projecao_icm_channel');

  function enviarComando(action, payload) {
    canalProjecao.postMessage({ action, payload, timestamp: Date.now() });
  }

  function mudaSlide() {
    enviarComando('CHANGE_SLIDE', projecaoAtiva);
  }

  function updateViewSlides() {
    enviarComando('RELOAD_SLIDES', viewSlides);
  }
  ```
* **Implementação na Janela Telão (`view.html`):**
  ```javascript
  const canalReceptor = new BroadcastChannel('projecao_icm_channel');

  canalReceptor.onmessage = (event) => {
    const { action, payload } = event.data;
    switch(action) {
      case 'RELOAD_SLIDES':
        reloadReveal(payload);
        break;
      case 'CHANGE_SLIDE':
        Reveal.slide(payload, payload, payload);
        break;
      case 'CHANGE_THEME':
        document.getElementById('theme').setAttribute('href', 'css/theme/' + payload + '.css');
        break;
      case 'CHANGE_FONT_SIZE':
        changeFontSize(payload);
        break;
      case 'BLACKOUT':
        toggleBlackout(payload);
        break;
    }
  };
  ```

---

### Melhoria 2: Remoção do Pop-up Automático e Launcher Seguro
* **Objetivo:** Evitar o bloqueio pelo navegador e garantir 100% de confiabilidade na abertura do telão.
* **Ações:**
  1. Remover o bloco `setTimeout` em `window.onload` (`core.js:1038–1049`).
  2. Transformar o botão `#btnLaunchView` em um launcher destacado com estado visual (indicador verde quando o telão estiver conectado via `BroadcastChannel`).
  3. Adicionar detecção automática: ao receber qualquer mensagem do telão informando que foi aberto, o botão do painel muda para "Telão Conectado".

---

### Melhoria 3: Substituição de `localStorage` por `IndexedDB`
* **Objetivo:** Superar a barreira de 5 MB do `localStorage` e evitar erros de cota com imagens e bancos de dados grandes.
* **Arquitetura de Dados:**
  - Banco de Dados: `ProjecaoICM_DB` (versão 1).
  - Tabela 1: `louvores` (chave: `id`, índice: `title`, `lang`).
  - Tabela 2: `imagens` (chave: `id`, campos: `name`, `blob` ou `dataUrl`).
  - Tabela 3: `configuracoes` (chave: `chave`, valor: `conteudo`).
* **Vantagens:** Armazenamento seguro de mais de 500 MB de louvores e apresentações de alta definição sem travar a interface.

---

### Melhoria 4: Sistema de Busca Avançada Full-Text (Título + Conteúdo)
* **Objetivo:** Permitir ao operador encontrar louvores digitando qualquer frase da letra ou do refrão.
* **Implementação:**
  1. No momento do carregamento da base (`atualizaListaArquivos`), indexar os termos das letras em memória:
     ```javascript
     let indiceBusca = [];
     dados.forEach((pasta, pIdx) => {
       pasta.songs.forEach((song, sIdx) => {
         indiceBusca.push({
           folderId: pIdx,
           songId: sIdx,
           title: song.title.toLowerCase(),
           content: song.content.toLowerCase()
         });
       });
     });
     ```
  2. Ao digitar no campo `#treesearch`, verificar tanto no `title` quanto no `content`:
     ```javascript
     $("#treesearch").on("input", function() {
       const termo = $(this).val().toLowerCase().trim();
       if (!termo) {
         $("#songList li").show();
         return;
       }
       $("#songList li").each(function() {
         const pIdx = $(this).closest('details').data('folderId');
         const sIdx = $(this).data('id');
         const item = dados[pIdx]?.songs[sIdx];
         if (item) {
           const match = item.title.toLowerCase().includes(termo) || item.content.toLowerCase().includes(termo);
           $(this).toggle(match);
           if (match) $(this).closest('details').prop('open', true);
         }
       });
     });
     ```

---

### Melhoria 5: Controles Litúrgicos de Pânico (Blackout e Freeze)
* **Objetivo:** Permitir ao operador apagar o telão imediatamente durante momentos solenes (orações, pregações) ou congelar a projeção enquanto navega para selecionar o próximo louvor.
* **Atalhos e Comportamento:**
  - **Tecla [B] ou [F12] (Blackout):** Alterna uma camada preta sobreposta (`opacity: 1` / `pointer-events: none`) no telão via comando `'BLACKOUT'`, preservando o slide atual para retomada imediata.
  - **Tecla [F] (Freeze):** Congela as mensagens enviadas para o telão, permitindo ao operador navegar livremente na aba "Ao Vivo" sem que o público veja as trocas até pressionar [F] novamente.

---

### Melhoria 6: Saída Transparente para OBS Studio / Streaming (Lower Thirds)
* **Objetivo:** Permitir transmitir cultos online integrando as letras diretamente no software de transmissão (OBS Studio, vMix).
* **Novo Arquivo:** Criar `projectionICMV2/obs.html`.
* **Características:**
  - Fundo 100% transparente: `body { background-color: transparent !important; }`.
  - Exibição em **Lower Third** (terço inferior da tela, 2 linhas grandes com sombra forte e outline para alta legibilidade sobre o vídeo da câmera).
  - Escuta o mesmo canal `BroadcastChannel('projecao_icm_channel')`.

---

### Melhoria 7: Otimização Bíblica e Carregamento Sob Demanda (Lazy-Loading)
* **Objetivo:** Eliminar os 8 MB de carga estática no carregamento inicial do painel.
* **Ação:**
  - Carregar `bible/acf.js` e `bible/nvi.js` dinamicamente apenas quando o operador clicar pela primeira vez na aba "Bíblia" (`#bible-tab`).
  ```javascript
  $('#bible-tab').one('click', async function() {
    if (typeof bibleacf === 'undefined') {
      await carregarScriptAssincrono('bible/acf.js');
      await carregarScriptAssincrono('bible/nvi.js');
      loadBible();
      ajustarListasDaBiblia();
    }
  });
  ```

---

### Melhoria 8: Limpeza de Dependências Órfãs
* **Ação:**
  - Remover do repositório os arquivos `js/jstree.js` (303 KB) e `js/jstree.min.js` (138 KB).
  - Remover as pastas `css/themes/default/` e `css/themes/default-dark/` (imagens PNG e CSS legados).
  - Remover do `<head>` de `index.html` a importação de `css/themes/default/style.min.css`.

---

## 6. Ordem de Execução Recomendada

Para a continuidade dos trabalhos de desenvolvimento, recomenda-se a seguinte ordem de sprints:

1. **Sprint 1 (Estabilidade Base):**
   - Implementação do `BroadcastChannel` (Melhoria 1).
   - Eliminação do pop-up automático temporizado (Melhoria 2).
   - Limpeza das dependências órfãs do jstree (Melhoria 8).
2. **Sprint 2 (Operação de Culto):**
   - Sistema de busca em tempo real por título + letra (Melhoria 4).
   - Atalhos de Blackout e Freeze (Melhoria 5).
3. **Sprint 3 (Performance & Streaming):**
   - Criação da view `obs.html` para transmissão em Lower Third (Melhoria 6).
   - Lazy-loading das bases bíblicas (Melhoria 7).
   - Migração para `IndexedDB` (Melhoria 3).
