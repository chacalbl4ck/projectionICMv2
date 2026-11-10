// ==========================================
// MÓDULO: REMOTE (Controle Remoto via Wi-Fi no Celular + QR Offline)
// ==========================================

(function() {
    var wifiEventSource = null;
    var wifiInfo = {
        active: false,
        port: 3000,
        ips: [],
        selectedIp: '',
        pin: '',
        pinEnabled: true,
        remotesCount: 0
    };
    var pendingStateTimer = null;
    var lastStateSentAt = 0;
    var lastVideoSignature = '';
    var pendingLibraryTimer = null;

    function isHttpServerMode() {
        return window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:');
    }

    // ------------------------------------------
    // GERADOR DE QR CODE OFFLINE (ISO/IEC 18004 - Byte Mode, ECC-L, Versões 1..6)
    // ------------------------------------------
    var QRGen = (function() {
        var EXP = new Array(512);
        var LOG = new Array(256);
        var x = 1;
        for (var i = 0; i < 255; i++) {
            EXP[i] = x;
            EXP[i + 255] = x;
            LOG[x] = i;
            x = (x << 1) ^ (x & 128 ? 0x11d : 0);
        }

        function gfMul(a, b) {
            if (a === 0 || b === 0) return 0;
            return EXP[LOG[a] + LOG[b]];
        }

        function rsGenPoly(ecLen) {
            var poly = [1];
            for (var i = 0; i < ecLen; i++) {
                var next = new Array(poly.length + 1).fill(0);
                var root = EXP[i];
                for (var j = 0; j < poly.length; j++) {
                    next[j] ^= poly[j];
                    next[j + 1] ^= gfMul(poly[j], root);
                }
                poly = next;
            }
            return poly;
        }

        function rsRemainder(data, ecLen) {
            var gen = rsGenPoly(ecLen);
            var rem = data.slice().concat(new Array(ecLen).fill(0));
            for (var i = 0; i < data.length; i++) {
                var factor = rem[i];
                if (factor !== 0) {
                    for (var j = 0; j < gen.length; j++) {
                        rem[i + j] ^= gfMul(gen[j], factor);
                    }
                }
            }
            return rem.slice(data.length);
        }

        // Especificações ECC-L para versões 1..6: [tamanho, capacidadeBytes, totalDataBytes, ecPorBloco, blocos, alinhamentos]
        var SPECS = [
            null,
            { size: 21, cap: 17, dataBytes: 19, ecBytes: 7, blocks: 1, align: [] },
            { size: 25, cap: 32, dataBytes: 34, ecBytes: 10, blocks: 1, align: [6, 18] },
            { size: 29, cap: 53, dataBytes: 55, ecBytes: 15, blocks: 1, align: [6, 22] },
            { size: 33, cap: 78, dataBytes: 80, ecBytes: 20, blocks: 1, align: [6, 26] },
            { size: 37, cap: 106, dataBytes: 108, ecBytes: 26, blocks: 1, align: [6, 30] },
            { size: 41, cap: 134, dataBytes: 136, ecBytes: 18, blocks: 2, align: [6, 34] }
        ];

        function encodeDataBytes(text) {
            var utf8 = [];
            for (var i = 0; i < text.length; i++) {
                var c = text.charCodeAt(i);
                if (c < 0x80) utf8.push(c);
                else if (c < 0x800) {
                    utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
                } else {
                    utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                }
            }

            var ver = 1;
            while (ver < SPECS.length && utf8.length > SPECS[ver].cap) ver++;
            if (ver >= SPECS.length) ver = SPECS.length - 1;
            var spec = SPECS[ver];
            var payload = utf8.slice(0, spec.cap);

            var bits = [];
            function pushBits(val, len) {
                for (var b = len - 1; b >= 0; b--) bits.push((val >> b) & 1);
            }

            pushBits(4, 4); // Modo Byte (0100)
            pushBits(payload.length, 8);
            for (var k = 0; k < payload.length; k++) pushBits(payload[k], 8);

            var maxBits = spec.dataBytes * 8;
            var term = Math.min(4, maxBits - bits.length);
            pushBits(0, term);
            while (bits.length % 8 !== 0) bits.push(0);

            var codewords = [];
            for (var p = 0; p < bits.length; p += 8) {
                var byteVal = 0;
                for (var q = 0; q < 8; q++) byteVal = (byteVal << 1) | bits[p + q];
                codewords.push(byteVal);
            }

            var padIdx = 0;
            while (codewords.length < spec.dataBytes) {
                codewords.push(padIdx % 2 === 0 ? 0xec : 0x11);
                padIdx++;
            }

            // Divide em blocos e intercala dados + EC
            var dataPerBlock = Math.floor(spec.dataBytes / spec.blocks);
            var dataBlocks = [];
            var ecBlocks = [];
            var offset = 0;
            for (var b = 0; b < spec.blocks; b++) {
                var block = codewords.slice(offset, offset + dataPerBlock);
                offset += dataPerBlock;
                dataBlocks.push(block);
                ecBlocks.push(rsRemainder(block, spec.ecBytes));
            }

            var finalBytes = [];
            for (var cIdx = 0; cIdx < dataPerBlock; cIdx++) {
                for (var bIdx = 0; bIdx < spec.blocks; bIdx++) finalBytes.push(dataBlocks[bIdx][cIdx]);
            }
            for (var eIdx = 0; eIdx < spec.ecBytes; eIdx++) {
                for (var bIdx2 = 0; bIdx2 < spec.blocks; bIdx2++) finalBytes.push(ecBlocks[bIdx2][eIdx]);
            }

            var finalBits = [];
            for (var f = 0; f < finalBytes.length; f++) {
                for (var bit = 7; bit >= 0; bit--) finalBits.push((finalBytes[f] >> bit) & 1);
            }
            return { version: ver, spec: spec, bits: finalBits };
        }

        function createMatrix(ver, spec) {
            var n = spec.size;
            var mat = [];
            var isFunc = [];
            for (var r = 0; r < n; r++) {
                mat.push(new Array(n).fill(0));
                isFunc.push(new Array(n).fill(false));
            }

            function setFunc(r, c, val) {
                if (r < 0 || r >= n || c < 0 || c >= n) return;
                mat[r][c] = val ? 1 : 0;
                isFunc[r][c] = true;
            }

            function drawFinder(top, left) {
                for (var dr = -1; dr <= 7; dr++) {
                    for (var dc = -1; dc <= 7; dc++) {
                        var rr = top + dr, cc = left + dc;
                        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
                        var inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
                        var dark = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
                        setFunc(rr, cc, dark);
                    }
                }
            }

            drawFinder(0, 0);
            drawFinder(0, n - 7);
            drawFinder(n - 7, 0);

            if (spec.align.length >= 2) {
                var aPos = spec.align[spec.align.length - 1];
                for (var dr = -2; dr <= 2; dr++) {
                    for (var dc = -2; dc <= 2; dc++) {
                        var darkA = (Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
                        setFunc(aPos + dr, aPos + dc, darkA);
                    }
                }
            }

            for (var i = 8; i < n - 8; i++) {
                setFunc(6, i, i % 2 === 0);
                setFunc(i, 6, i % 2 === 0);
            }

            // Módulo escuro fixo e áreas reservadas de informação de formato
            setFunc(n - 8, 8, true);
            for (var k = 0; k < 9; k++) {
                if (k !== 6) {
                    isFunc[8][k] = true;
                    isFunc[k][8] = true;
                }
            }
            for (var m = 0; m < 8; m++) {
                isFunc[8][n - 1 - m] = true;
                isFunc[n - 1 - m][8] = true;
            }

            return { n: n, mat: mat, isFunc: isFunc };
        }

        function computeFormatBits(maskIdx) {
            // ECC-L = 01 (bits: 01xxx)
            var data = (1 << 3) | maskIdx;
            var rem = data << 10;
            for (var i = 4; i >= 0; i--) {
                if ((rem >> (i + 10)) & 1) rem ^= (0x537 << i);
            }
            return ((data << 10) | rem) ^ 0x5412;
        }

        function applyFormatAndMask(grid, bits, maskIdx) {
            var n = grid.n;
            var mat = grid.mat.map(function(row) { return row.slice(); });
            var isFunc = grid.isFunc;

            var bitIdx = 0;
            for (var right = n - 1; right >= 1; right -= 2) {
                if (right === 6) right = 5;
                for (var step = 0; step < n; step++) {
                    var upward = (((right + 1) & 2) === 0);
                    var r = upward ? (n - 1 - step) : step;
                    for (var cOff = 0; cOff < 2; cOff++) {
                        var c = right - cOff;
                        if (!isFunc[r][c]) {
                            var rawBit = (bitIdx < bits.length) ? bits[bitIdx++] : 0;
                            var flip = false;
                            if (maskIdx === 0) flip = ((r + c) % 2 === 0);
                            else if (maskIdx === 1) flip = (r % 2 === 0);
                            else if (maskIdx === 2) flip = (c % 3 === 0);
                            else if (maskIdx === 3) flip = ((r + c) % 3 === 0);
                            else if (maskIdx === 4) flip = ((Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0);
                            else if (maskIdx === 5) flip = (((r * c) % 2) + ((r * c) % 3) === 0);
                            else if (maskIdx === 6) flip = ((((r * c) % 2) + ((r * c) % 3)) % 2 === 0);
                            else flip = ((((r + c) % 2) + ((r * c) % 3)) % 2 === 0);
                            mat[r][c] = rawBit ^ (flip ? 1 : 0);
                        }
                    }
                }
            }

            var fmt = computeFormatBits(maskIdx);
            for (var i = 0; i <= 5; i++) mat[8][i] = (fmt >> (14 - i)) & 1;
            mat[8][7] = (fmt >> 8) & 1;
            mat[8][8] = (fmt >> 7) & 1;
            mat[7][8] = (fmt >> 6) & 1;
            for (var j = 9; j <= 14; j++) mat[14 - j][8] = (fmt >> (14 - j)) & 1;

            for (var b = 0; b < 8; b++) mat[8][n - 1 - b] = (fmt >> b) & 1;
            for (var b2 = 0; b2 < 7; b2++) mat[n - 1 - b2][8] = (fmt >> (14 - b2)) & 1;
            mat[n - 8][8] = 1;

            return mat;
        }

        function scorePenalty(mat) {
            var n = mat.length;
            var penalty = 0;
            for (var r = 0; r < n; r++) {
                var runLen = 1;
                for (var c = 1; c < n; c++) {
                    if (mat[r][c] === mat[r][c - 1]) {
                        runLen++;
                        if (runLen === 5) penalty += 3;
                        else if (runLen > 5) penalty++;
                    } else runLen = 1;
                }
            }
            for (var c2 = 0; c2 < n; c2++) {
                var runLen2 = 1;
                for (var r2 = 1; r2 < n; r2++) {
                    if (mat[r2][c2] === mat[r2 - 1][c2]) {
                        runLen2++;
                        if (runLen2 === 5) penalty += 3;
                        else if (runLen2 > 5) penalty++;
                    } else runLen2 = 1;
                }
            }
            for (var r3 = 0; r3 < n - 1; r3++) {
                for (var c3 = 0; c3 < n - 1; c3++) {
                    var sum = mat[r3][c3] + mat[r3][c3 + 1] + mat[r3 + 1][c3] + mat[r3 + 1][c3 + 1];
                    if (sum === 0 || sum === 4) penalty += 3;
                }
            }
            return penalty;
        }

        function generateMatrix(text) {
            var encoded = encodeDataBytes(String(text || ''));
            var grid = createMatrix(encoded.version, encoded.spec);
            var bestMat = null;
            var bestScore = Infinity;
            for (var m = 0; m < 8; m++) {
                var candidate = applyFormatAndMask(grid, encoded.bits, m);
                var s = scorePenalty(candidate);
                if (s < bestScore) {
                    bestScore = s;
                    bestMat = candidate;
                }
            }
            return bestMat;
        }

        function drawToCanvas(canvas, text, pixelSize) {
            if (!canvas || !text) return;
            var mat = generateMatrix(text);
            var n = mat.length;
            var quiet = 4;
            var totalMods = n + quiet * 2;
            var px = pixelSize || 220;
            var modSize = Math.max(3, Math.floor(px / totalMods));
            var realPx = totalMods * modSize;

            canvas.width = realPx;
            canvas.height = realPx;
            var ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, realPx, realPx);
            ctx.fillStyle = '#000000';
            for (var r = 0; r < n; r++) {
                for (var c = 0; c < n; c++) {
                    if (mat[r][c]) {
                        ctx.fillRect((c + quiet) * modSize, (r + quiet) * modSize, modSize, modSize);
                    }
                }
            }
        }

        return { generateMatrix: generateMatrix, drawToCanvas: drawToCanvas };
    })();

    function stripHtmlToPlain(htmlStr) {
        var str = String(htmlStr || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|tr)>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"');
        return str.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    }

    function construirSnapshotRemoto() {
        var slides = [];
        var rows = document.querySelectorAll('#livesongs > tbody > tr');
        rows.forEach(function(row, idx) {
            var rId = parseInt(row.getAttribute('data-id'), 10);
            var slideIdx = isNaN(rId) ? idx : rId;
            var cells = row.querySelectorAll('td');
            var colTitle = cells[0] ? stripHtmlToPlain(cells[0].innerHTML) : ('Slide ' + (slideIdx + 1));
            var isVideo = row.getAttribute('data-video-row') === 'true';
            var hasImg = !!(cells[1] && cells[1].querySelector('img'));
            var colBody = '';

            if (isVideo) {
                var labelEl = row.querySelector('.vid-time-label');
                colBody = labelEl ? ('Vídeo (' + labelEl.textContent + ')') : 'Vídeo';
            } else if (hasImg) {
                colBody = 'Imagem em tela cheia';
            } else if (cells[1]) {
                colBody = stripHtmlToPlain(cells[1].innerHTML);
            }

            var isTelaPadrao = (colTitle === 'Tela Padrão' && !colBody);
            var vidTelemetry = null;
            if (isVideo) {
                var slider = row.querySelector('.vid-progress-slider');
                var btnToggle = row.querySelector('.btn-vid-toggle');
                var isPaused = !btnToggle || !btnToggle.innerHTML || btnToggle.innerHTML.indexOf('fa-pause') === -1;
                vidTelemetry = {
                    currentTime: slider ? (parseFloat(slider.value) || 0) : 0,
                    duration: slider ? (parseFloat(slider.max) || 0) : 0,
                    paused: isPaused
                };
            }

            slides.push({
                index: slideIdx,
                title: colTitle || (isTelaPadrao ? 'Tela Padrão' : 'Slide'),
                text: colBody || (isTelaPadrao ? 'Tela Padrão ICM' : ''),
                isVideo: isVideo,
                isImage: hasImg,
                isTelaPadrao: isTelaPadrao,
                video: vidTelemetry
            });
        });

        var queue = [];
        var qRows = document.querySelectorAll('#projections > tbody > tr');
        qRows.forEach(function(qRow, qIdx) {
            var td = qRow.querySelector('td');
            var gotoIdx = td ? parseInt(td.getAttribute('data-goto'), 10) : 0;
            var labelText = td ? stripHtmlToPlain(td.innerHTML) : ('Item ' + (qIdx + 1));
            queue.push({
                index: qIdx,
                label: labelText,
                gotoSlide: isNaN(gotoIdx) ? 0 : gotoIdx
            });
        });

        return {
            activeSlide: (typeof projecaoAtiva === 'number') ? projecaoAtiva : 0,
            totalSlides: slides.length,
            isBlackout: (typeof isBlackout !== 'undefined') ? !!isBlackout : false,
            isFrozen: (typeof isFrozen !== 'undefined') ? !!isFrozen : false,
            telaoConnected: (typeof telaoConnected !== 'undefined') ? !!telaoConnected : false,
            slides: slides,
            queue: queue,
            updatedAt: Date.now()
        };
    }

    function construirCatalogoRemoto() {
        var songs = [];
        var warnings = [];
        var media = [];

        if (typeof dados !== 'undefined' && Array.isArray(dados)) {
            dados.forEach(function(pasta, folderIdx) {
                if (!pasta) return;
                var fName = pasta.name || ('Pasta ' + (folderIdx + 1));
                if (Array.isArray(pasta.songs)) {
                    pasta.songs.forEach(function(s, sIdx) {
                        if (!s) return;
                        songs.push({
                            tipo: 'song',
                            folderId: folderIdx,
                            itemId: sIdx,
                            folder: fName,
                            title: s.title || ('Louvor ' + (sIdx + 1))
                        });
                    });
                }
                if (Array.isArray(pasta.warnings)) {
                    pasta.warnings.forEach(function(w, wIdx) {
                        if (!w) return;
                        warnings.push({
                            tipo: 'warning',
                            folderId: folderIdx,
                            itemId: wIdx,
                            folder: fName,
                            title: w.name || (w.warning && w.warning.content ? w.warning.content.title : 'Aviso')
                        });
                    });
                }
                if (Array.isArray(pasta.media)) {
                    pasta.media.forEach(function(m, mIdx) {
                        if (!m) return;
                        media.push({
                            tipo: 'media',
                            folderId: folderIdx,
                            itemId: mIdx,
                            folder: fName,
                            title: m.name || m.fileName || 'Mídia',
                            mediaType: m.type || 'image'
                        });
                    });
                }
            });
        }

        if (typeof avisos !== 'undefined' && Array.isArray(avisos)) {
            avisos.forEach(function(w, wIdx) {
                if (!w) return;
                warnings.push({
                    tipo: 'warning',
                    folderId: -1,
                    itemId: wIdx,
                    folder: 'Avisos (Geral)',
                    title: w.name || (w.warning && w.warning.content ? w.warning.content.title : 'Aviso')
                });
            });
        }

        if (typeof imagens !== 'undefined' && Array.isArray(imagens)) {
            imagens.forEach(function(m, mIdx) {
                if (!m) return;
                media.push({
                    tipo: 'image',
                    folderId: -1,
                    itemId: mIdx,
                    folder: 'Mídias (Geral)',
                    title: m.name || m.fileName || 'Mídia',
                    mediaType: m.type || 'image'
                });
            });
        }

        if (typeof autoVideosFiles !== 'undefined' && Array.isArray(autoVideosFiles)) {
            autoVideosFiles.forEach(function(v, vIdx) {
                if (!v) return;
                media.push({
                    tipo: 'auto-video',
                    folderId: -1,
                    itemId: vIdx,
                    folder: 'Vídeos (Automático)',
                    title: v.name || v.fileName || 'Vídeo',
                    mediaType: 'video'
                });
            });
        }

        if (typeof autoImagensFiles !== 'undefined' && Array.isArray(autoImagensFiles)) {
            autoImagensFiles.forEach(function(im, iIdx) {
                if (!im) return;
                media.push({
                    tipo: 'auto-image',
                    folderId: -1,
                    itemId: iIdx,
                    folder: 'Imagens (Automático)',
                    title: im.name || im.fileName || 'Imagem',
                    mediaType: 'image'
                });
            });
        }

        return { songs: songs, warnings: warnings, media: media };
    }

    function enviarEstadoRemoto(imediato) {
        if (!isHttpServerMode()) return;

        function disparar() {
            pendingStateTimer = null;
            lastStateSentAt = Date.now();
            var snap = construirSnapshotRemoto();
            fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snap)
            }).catch(function() {});
        }

        if (imediato) {
            if (pendingStateTimer) {
                clearTimeout(pendingStateTimer);
                pendingStateTimer = null;
            }
            disparar();
            return;
        }

        var elapsed = Date.now() - lastStateSentAt;
        if (elapsed >= 350) {
            disparar();
        } else if (!pendingStateTimer) {
            pendingStateTimer = setTimeout(disparar, 350 - elapsed);
        }
    }

    function notificarEstadoRemoto(isVideoTickOnly) {
        if (!isHttpServerMode()) return;
        if (isVideoTickOnly) {
            var activeRow = document.querySelector('#livesongs tr[data-video-row="true"][data-id="' + projecaoAtiva + '"]');
            if (activeRow) {
                var slider = activeRow.querySelector('.vid-progress-slider');
                var btnT = activeRow.querySelector('.btn-vid-toggle');
                var sig = projecaoAtiva + '|' + (slider ? Math.floor(parseFloat(slider.value) || 0) : 0) + '|' + (btnT && btnT.innerHTML.indexOf('fa-pause') !== -1);
                if (sig === lastVideoSignature) return;
                lastVideoSignature = sig;
            }
            enviarEstadoRemoto(false);
        } else {
            enviarEstadoRemoto(true);
        }
    }
    window.notificarEstadoRemoto = notificarEstadoRemoto;

    function notificarCatalogoRemoto() {
        if (!isHttpServerMode()) return;
        if (pendingLibraryTimer) clearTimeout(pendingLibraryTimer);
        pendingLibraryTimer = setTimeout(function() {
            pendingLibraryTimer = null;
            var cat = construirCatalogoRemoto();
            fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cat)
            }).catch(function() {});
        }, 120);
    }
    window.notificarCatalogoRemoto = notificarCatalogoRemoto;

    function executarComandoRemoto(cmd) {
        if (!cmd || !cmd.type) return;
        var totalSlides = $('#livesongs > tbody > tr').length;

        switch (cmd.type) {
            case 'NEXT_SLIDE':
                if (projecaoAtiva < totalSlides - 1) {
                    projecaoAtiva++;
                    mudaProjecaoAtiva();
                }
                break;

            case 'PREV_SLIDE':
                if (projecaoAtiva > 0) {
                    projecaoAtiva--;
                    mudaProjecaoAtiva();
                }
                break;

            case 'GOTO_SLIDE':
                var idx = parseInt(cmd.slideIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < totalSlides) {
                    projecaoAtiva = idx;
                    mudaProjecaoAtiva();
                }
                break;

            case 'GOTO_TELAPADRAO':
                if (totalSlides > 0) {
                    projecaoAtiva = 0;
                    mudaProjecaoAtiva();
                }
                break;

            case 'TOGGLE_BLACKOUT':
                if (typeof toggleBlackout === 'function') {
                    toggleBlackout(typeof cmd.value === 'boolean' ? cmd.value : undefined);
                }
                break;

            case 'TOGGLE_FREEZE':
                if (typeof toggleFreeze === 'function') {
                    toggleFreeze(typeof cmd.value === 'boolean' ? cmd.value : undefined);
                }
                break;

            case 'VIDEO_CONTROL':
                if (typeof enviarComandoControleVideo === 'function') {
                    var targetSlide = (typeof cmd.slideIndex === 'number') ? cmd.slideIndex : projecaoAtiva;
                    enviarComandoControleVideo(targetSlide, cmd.command, cmd.value);
                }
                break;

            case 'GOTO_QUEUE_ITEM':
                var qIdx = parseInt(cmd.queueIndex, 10);
                if (!isNaN(qIdx)) {
                    var td = document.querySelector('#projections tbody tr[data-id="' + qIdx + '"] td:first-child');
                    var gotoIdx = td ? parseInt(td.getAttribute('data-goto'), 10) : NaN;
                    if (!isNaN(gotoIdx) && gotoIdx >= 0 && gotoIdx < totalSlides) {
                        projecaoAtiva = gotoIdx;
                        mudaProjecaoAtiva();
                    }
                }
                break;

            case 'REMOVE_QUEUE_ITEM':
                var rIdx = parseInt(cmd.queueIndex, 10);
                if (!isNaN(rIdx) && Array.isArray(projecao) && rIdx >= 0 && rIdx < projecao.length) {
                    projecao.splice(rIdx, 1);
                    if (projecao.length === 0) projecaoAtiva = 0;
                    if (typeof reloadProjectionList === 'function') reloadProjectionList();
                }
                break;

            case 'ADD_LIBRARY_ITEM':
                adicionarItemRemotoAFila(cmd);
                break;

            case 'REQUEST_STATE':
                enviarEstadoRemoto(true);
                break;

            case 'REQUEST_LIBRARY':
                notificarCatalogoRemoto();
                break;
        }
    }

    function adicionarItemRemotoAFila(cmd) {
        var tipo = cmd.tipo;
        var fId = parseInt(cmd.folderId, 10);
        var iId = parseInt(cmd.itemId, 10);
        if (isNaN(iId)) return;

        if (tipo === 'song') {
            if (!isNaN(fId) && dados[fId] && dados[fId].songs && dados[fId].songs[iId]) {
                projecao.push({ id: iId, folderId: fId, type: 's' });
                if (typeof reloadProjectionList === 'function') reloadProjectionList();
            }
            return;
        }

        var itemObj = null;
        if (tipo === 'warning') {
            itemObj = (!isNaN(fId) && fId >= 0 && dados[fId] && dados[fId].warnings) ? dados[fId].warnings[iId] : avisos[iId];
        } else if (tipo === 'media') {
            itemObj = (!isNaN(fId) && fId >= 0 && dados[fId] && dados[fId].media) ? dados[fId].media[iId] : imagens[iId];
        } else if (tipo === 'image') {
            itemObj = imagens[iId];
        } else if (tipo === 'auto-video') {
            itemObj = autoVideosFiles[iId];
        } else if (tipo === 'auto-image') {
            itemObj = autoImagensFiles[iId];
        }

        if (itemObj && typeof adicionarAProjecao === 'function') {
            var fakeItem = Object.assign({}, itemObj);
            if (!isNaN(fId)) fakeItem.folderId = fId;
            adicionarAProjecao(null, null, fakeItem, tipo, iId);
        }
    }

    function atualizarModalWifiUI() {
        var modoHttp = isHttpServerMode();
        var badgeServer = $('#wifiModalServerBadge');
        var boxOnline = $('#wifiOnlineArea');
        var boxOffline = $('#wifiOfflineGuide');

        if (!modoHttp) {
            if (badgeServer.length) {
                badgeServer.removeClass('badge-success').addClass('badge-warning').text('Modo Arquivo Local (file:///)');
            }
            boxOnline.hide();
            boxOffline.show();
            return;
        }

        if (badgeServer.length) {
            badgeServer.removeClass('badge-warning badge-secondary').addClass('badge-success').text('Servidor Wi-Fi Ativo');
        }
        boxOffline.hide();
        boxOnline.show();

        var count = wifiInfo.remotesCount || 0;
        var countText = count === 0 ? 'Nenhum celular conectado' : (count === 1 ? '1 celular conectado' : count + ' celulares conectados');
        $('#wifiModalConnectedText').text(countText);

        var badgeBtn = $('#wifiClientCountBadge');
        if (badgeBtn.length) {
            if (count > 0) badgeBtn.text(count).show();
            else badgeBtn.hide();
        }

        var ipSelect = $('#wifiSelectIp');
        if (ipSelect.length) {
            var ips = (wifiInfo.ips && wifiInfo.ips.length > 0) ? wifiInfo.ips : [window.location.hostname || 'localhost'];
            if (!wifiInfo.selectedIp || ips.indexOf(wifiInfo.selectedIp) === -1) {
                wifiInfo.selectedIp = ips[0];
            }
            var curOpts = ipSelect.find('option').map(function() { return this.value; }).get();
            if (JSON.stringify(curOpts) !== JSON.stringify(ips)) {
                ipSelect.empty();
                ips.forEach(function(ip) {
                    ipSelect.append('<option value="' + ip + '">' + ip + '</option>');
                });
            }
            ipSelect.val(wifiInfo.selectedIp);
        }

        $('#wifiCheckRequirePin').prop('checked', !!wifiInfo.pinEnabled);
        $('#wifiPinDisplay').text(wifiInfo.pinEnabled ? (wifiInfo.pin || '----') : 'Desativado');

        var baseIp = wifiInfo.selectedIp || window.location.hostname || 'localhost';
        var portPart = wifiInfo.port ? (':' + wifiInfo.port) : '';
        var pinQuery = (wifiInfo.pinEnabled && wifiInfo.pin) ? ('?pin=' + encodeURIComponent(wifiInfo.pin)) : '';
        var targetUrl = 'http://' + baseIp + portPart + '/controle.html' + pinQuery;

        $('#wifiRemoteUrlInput').val(targetUrl);
        $('#wifiTestLocalLink').attr('href', '/controle.html' + pinQuery);

        var qrCanvas = document.getElementById('wifiQrCanvas');
        if (qrCanvas) {
            try {
                QRGen.drawToCanvas(qrCanvas, targetUrl, 220);
            } catch (e) {
                console.warn('Falha ao renderizar QR Code:', e);
            }
        }
    }

    function carregarInfoServidorWifi() {
        if (!isHttpServerMode()) {
            atualizarModalWifiUI();
            return Promise.resolve();
        }
        return fetch('/api/info', { cache: 'no-store' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.ok) {
                    wifiInfo.active = true;
                    wifiInfo.port = data.port;
                    wifiInfo.ips = Array.isArray(data.ips) ? data.ips : [];
                    wifiInfo.pin = data.pin || '';
                    wifiInfo.pinEnabled = !!data.pinEnabled;
                    wifiInfo.remotesCount = data.remotesCount || 0;
                    atualizarModalWifiUI();
                }
            })
            .catch(function() {});
    }

    function iniciarConexaoSseHost() {
        if (!isHttpServerMode() || !window.EventSource) return;
        if (wifiEventSource) {
            try { wifiEventSource.close(); } catch (e) {}
        }

        wifiEventSource = new EventSource('/api/events?role=host');
        wifiEventSource.addEventListener('open', function() {
            enviarEstadoRemoto(true);
            notificarCatalogoRemoto();
        });
        wifiEventSource.addEventListener('remotes', function(ev) {
            try {
                var d = JSON.parse(ev.data);
                wifiInfo.remotesCount = d.count || 0;
                if (typeof d.pinEnabled === 'boolean') wifiInfo.pinEnabled = d.pinEnabled;
                if (d.pin) wifiInfo.pin = d.pin;
                atualizarModalWifiUI();
            } catch (e) {}
        });
        wifiEventSource.addEventListener('command', function(ev) {
            try {
                var cmd = JSON.parse(ev.data);
                executarComandoRemoto(cmd);
            } catch (e) {}
        });
    }

    // Expõe helpers para testes unitários e acesso global controlado
    window.__remoteWifiHooks = {
        QRGen: QRGen,
        construirSnapshotRemoto: construirSnapshotRemoto,
        construirCatalogoRemoto: construirCatalogoRemoto,
        executarComandoRemoto: executarComandoRemoto
    };

    $(document).ready(function() {
        if (isHttpServerMode()) {
            carregarInfoServidorWifi().then(function() {
                iniciarConexaoSseHost();
                setTimeout(function() {
                    enviarEstadoRemoto(true);
                    notificarCatalogoRemoto();
                }, 400);
            });
        } else {
            atualizarModalWifiUI();
        }

        $('#btnWifiRemote').off('click').on('click', function() {
            carregarInfoServidorWifi().finally(function() {
                $('#wifiRemoteModal').modal('show');
            });
        });

        $('#wifiSelectIp').off('change').on('change', function() {
            wifiInfo.selectedIp = $(this).val();
            atualizarModalWifiUI();
        });

        $('#btnCopyWifiUrl').off('click').on('click', function() {
            var input = document.getElementById('wifiRemoteUrlInput');
            if (!input) return;
            input.select();
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(input.value);
                } else {
                    document.execCommand('copy');
                }
                var btn = $(this);
                btn.html('<i class="fas fa-check"></i> Copiado!');
                setTimeout(function() { btn.html('<i class="fas fa-copy"></i> Copiar'); }, 1500);
            } catch (e) {}
        });

        $('#btnRegenerateWifiPin').off('click').on('click', function() {
            if (!isHttpServerMode()) return;
            fetch('/api/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ regenerate: true })
            })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (d && d.ok) {
                    wifiInfo.pin = d.pin;
                    wifiInfo.pinEnabled = !!d.pinEnabled;
                    atualizarModalWifiUI();
                }
            }).catch(function() {});
        });

        $('#wifiCheckRequirePin').off('change').on('change', function() {
            if (!isHttpServerMode()) return;
            var enabled = !!$(this).is(':checked');
            fetch('/api/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinEnabled: enabled })
            })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (d && d.ok) {
                    wifiInfo.pin = d.pin;
                    wifiInfo.pinEnabled = !!d.pinEnabled;
                    atualizarModalWifiUI();
                }
            }).catch(function() {});
        });
    });
})();
