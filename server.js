// =====================================================================
// Servidor Local + Ponte Wi-Fi em Tempo Real (Zero Dependências Externas)
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo'
};

function obterIpsLocais() {
    const nets = os.networkInterfaces();
    const list = [];
    Object.keys(nets).forEach((name) => {
        const ifaces = nets[name] || [];
        ifaces.forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
                const addr = iface.address;
                // Ignora IPs link-local APIPA (169.254.x.x) se houver LAN válida
                list.push({ name, address: addr, isApipa: addr.startsWith('169.254.') });
            }
        });
    });
    const validos = list.filter((i) => !i.isApipa);
    const selecionados = validos.length > 0 ? validos : list;
    return selecionados.map((i) => i.address);
}

function isLoopbackAddress(addr) {
    if (!addr) return false;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readJsonBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const limit = maxBytes || 65536;
        let received = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            received += chunk.length;
            if (received > limit) {
                reject(new Error('PayloadTooLarge'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
                reject(new Error('InvalidJSON'));
            }
        });
        req.on('error', reject);
    });
}

function createAppServer(options) {
    const opts = options || {};
    const rootDir = path.resolve(opts.rootDir || __dirname);
    const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;

    let pinEnabled = (typeof opts.pinEnabled === 'boolean') ? opts.pinEnabled : true;
    let accessPin = opts.pin ? String(opts.pin) : String(crypto.randomInt(1000, 10000));

    const hostClients = new Set();
    const remoteClients = new Set();

    let latestState = {
        activeSlide: 0,
        totalSlides: 0,
        isBlackout: false,
        isFrozen: false,
        telaoConnected: false,
        slides: [],
        queue: [],
        updatedAt: Date.now()
    };

    let latestLibrary = {
        songs: [],
        warnings: [],
        media: [],
        updatedAt: Date.now()
    };

    function enviarSse(res, eventName, dataObj) {
        try {
            res.write('event: ' + eventName + '\ndata: ' + JSON.stringify(dataObj) + '\n\n');
        } catch (e) {}
    }

    function broadcastRemotes(eventName, dataObj) {
        remoteClients.forEach((clientRes) => enviarSse(clientRes, eventName, dataObj));
    }

    function broadcastHosts(eventName, dataObj) {
        hostClients.forEach((clientRes) => enviarSse(clientRes, eventName, dataObj));
    }

    function notificarStatusParaHost() {
        broadcastHosts('remotes', {
            count: remoteClients.size,
            pinEnabled,
            pin: accessPin
        });
    }

    function isRemoteAuthorized(req, parsedUrl) {
        if (!pinEnabled) return true;
        const headerPin = req.headers['x-remote-pin'];
        const queryPin = parsedUrl.searchParams.get('pin');
        const provided = String(headerPin || queryPin || '').trim();
        return provided.length > 0 && provided === accessPin;
    }

    function serveStaticFile(req, res, pathname) {
        let reqPath = decodeURIComponent(pathname || '/');
        if (reqPath === '/') reqPath = '/index.html';

        const resolved = path.resolve(rootDir, '.' + reqPath);
        if (resolved !== rootDir && !resolved.startsWith(rootPrefix)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Acesso negado');
            return;
        }

        const rel = path.relative(rootDir, resolved);
        const baseName = path.basename(resolved).toLowerCase();
        // Protege scripts de servidor/lote e arquivos ocultos (.git, etc.)
        if (rel.startsWith('..') || baseName.startsWith('.') || baseName === 'server.js' || baseName === 'iniciar_com_wifi.bat') {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Acesso restrito');
            return;
        }

        fs.stat(resolved, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Arquivo não encontrado');
                return;
            }

            const ext = path.extname(resolved).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const rangeHeader = req.headers.range;

            if (rangeHeader) {
                const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
                if (match) {
                    const start = match[1] ? parseInt(match[1], 10) : 0;
                    const end = match[2] ? Math.min(stats.size - 1, parseInt(match[2], 10)) : stats.size - 1;
                    if (start <= end && start < stats.size) {
                        res.writeHead(206, {
                            'Content-Range': 'bytes ' + start + '-' + end + '/' + stats.size,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': (end - start) + 1,
                            'Content-Type': contentType
                        });
                        fs.createReadStream(resolved, { start, end }).pipe(res);
                        return;
                    }
                }
            }

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(resolved).pipe(res);
        });
    }

    const server = http.createServer(async (req, res) => {
        const parsedUrl = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
        const pathname = parsedUrl.pathname;
        const isLocalHost = isLoopbackAddress(req.socket && req.socket.remoteAddress);

        // API de Informações (apenas PC local recebe o PIN e IPs LAN completos)
        if (pathname === '/api/info' && req.method === 'GET') {
            if (!isLocalHost) {
                return sendJson(res, 403, { ok: false, error: 'Acesso permitido apenas no painel local.' });
            }
            const addrInfo = server.address();
            const port = addrInfo && addrInfo.port ? addrInfo.port : (opts.port || 3000);
            return sendJson(res, 200, {
                ok: true,
                port,
                ips: obterIpsLocais(),
                pin: accessPin,
                pinEnabled,
                remotesCount: remoteClients.size,
                hostConnected: hostClients.size > 0
            });
        }

        // Configurar / Regenerar PIN pelo painel local
        if (pathname === '/api/pin' && req.method === 'POST') {
            if (!isLocalHost) {
                return sendJson(res, 403, { ok: false, error: 'Apenas o operador local pode alterar o PIN.' });
            }
            try {
                const body = await readJsonBody(req, 4096);
                if (typeof body.pinEnabled === 'boolean') {
                    pinEnabled = body.pinEnabled;
                }
                if (body.regenerate) {
                    accessPin = String(crypto.randomInt(1000, 10000));
                } else if (typeof body.pin === 'string' && /^\d{4,6}$/.test(body.pin.trim())) {
                    accessPin = body.pin.trim();
                }
                notificarStatusParaHost();
                return sendJson(res, 200, { ok: true, pin: accessPin, pinEnabled });
            } catch (e) {
                return sendJson(res, 400, { ok: false, error: 'Dados inválidos.' });
            }
        }

        // Verificação rápida de PIN para tela de login do celular
        if (pathname === '/api/remote-check' && req.method === 'GET') {
            if (!isRemoteAuthorized(req, parsedUrl)) {
                return sendJson(res, 401, { ok: false, pinRequired: true, error: 'PIN incorreto.' });
            }
            return sendJson(res, 200, {
                ok: true,
                pinEnabled,
                hostConnected: hostClients.size > 0,
                state: latestState
            });
        }

        // Stream SSE em tempo real (Host Painel <-> Remotes Celulares)
        if (pathname === '/api/events' && req.method === 'GET') {
            const role = parsedUrl.searchParams.get('role') || 'remote';
            if (role === 'host') {
                if (!isLocalHost) {
                    return sendJson(res, 403, { ok: false, error: 'Registro de host permitido apenas localmente.' });
                }
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive'
                });
                hostClients.add(res);
                notificarStatusParaHost();
                const pingTimer = setInterval(() => {
                    try { res.write(': ping\n\n'); } catch (e) {}
                }, 20000);
                req.on('close', () => {
                    clearInterval(pingTimer);
                    hostClients.delete(res);
                    broadcastRemotes('host_status', { hostConnected: hostClients.size > 0 });
                });
                broadcastRemotes('host_status', { hostConnected: true });
                return;
            }

            if (!isRemoteAuthorized(req, parsedUrl)) {
                return sendJson(res, 401, { ok: false, pinRequired: true, error: 'PIN inválido ou ausente.' });
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive'
            });
            remoteClients.add(res);
            enviarSse(res, 'state', latestState);
            enviarSse(res, 'host_status', { hostConnected: hostClients.size > 0 });
            notificarStatusParaHost();

            const pingTimer = setInterval(() => {
                try { res.write(': ping\n\n'); } catch (e) {}
            }, 20000);

            req.on('close', () => {
                clearInterval(pingTimer);
                remoteClients.delete(res);
                notificarStatusParaHost();
            });
            return;
        }

        // Recebe snapshot de estado do Painel (PC) e replica para celulares
        if (pathname === '/api/state') {
            if (req.method === 'POST') {
                if (!isLocalHost) {
                    return sendJson(res, 403, { ok: false, error: 'Apenas o painel local publica estado.' });
                }
                try {
                    const body = await readJsonBody(req, 512 * 1024);
                    latestState = Object.assign({}, latestState, body, { updatedAt: Date.now() });
                    broadcastRemotes('state', latestState);
                    return sendJson(res, 200, { ok: true, remotesCount: remoteClients.size });
                } catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'Estado inválido.' });
                }
            }
            if (req.method === 'GET') {
                if (!isLocalHost && !isRemoteAuthorized(req, parsedUrl)) {
                    return sendJson(res, 401, { ok: false, pinRequired: true });
                }
                return sendJson(res, 200, { ok: true, hostConnected: hostClients.size > 0, state: latestState });
            }
        }

        // Catálogo enxuto pesquisável pelo celular (hinos, avisos, mídias)
        if (pathname === '/api/library') {
            if (req.method === 'POST') {
                if (!isLocalHost) {
                    return sendJson(res, 403, { ok: false, error: 'Apenas o painel local atualiza acervo.' });
                }
                try {
                    const body = await readJsonBody(req, 4 * 1024 * 1024);
                    latestLibrary = {
                        songs: Array.isArray(body.songs) ? body.songs : [],
                        warnings: Array.isArray(body.warnings) ? body.warnings : [],
                        media: Array.isArray(body.media) ? body.media : [],
                        updatedAt: Date.now()
                    };
                    broadcastRemotes('library_updated', { updatedAt: latestLibrary.updatedAt });
                    return sendJson(res, 200, { ok: true });
                } catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'Acervo inválido.' });
                }
            }
            if (req.method === 'GET') {
                if (!isLocalHost && !isRemoteAuthorized(req, parsedUrl)) {
                    return sendJson(res, 401, { ok: false, pinRequired: true });
                }
                return sendJson(res, 200, { ok: true, library: latestLibrary });
            }
        }

        // Recebe comandos remotos do celular e repassa ao Painel (PC)
        if (pathname === '/api/command' && req.method === 'POST') {
            if (!isLocalHost && !isRemoteAuthorized(req, parsedUrl)) {
                return sendJson(res, 401, { ok: false, pinRequired: true, error: 'PIN inválido.' });
            }
            if (hostClients.size === 0) {
                return sendJson(res, 503, { ok: false, error: 'O painel principal (index.html) não está aberto no computador.' });
            }
            try {
                const body = await readJsonBody(req, 65536);
                if (!body || !body.type) {
                    return sendJson(res, 400, { ok: false, error: 'Comando inválido.' });
                }
                const cmdPacket = Object.assign({}, body, { receivedAt: Date.now() });
                broadcastHosts('command', cmdPacket);
                return sendJson(res, 200, { ok: true });
            } catch (e) {
                return sendJson(res, 400, { ok: false, error: 'JSON de comando inválido.' });
            }
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            return serveStaticFile(req, res, pathname);
        }

        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    });

    server.getRemotePin = () => ({ pin: accessPin, pinEnabled });
    return server;
}

function startCliServer(preferredPort) {
    let port = parseInt(preferredPort || process.env.PORT || '3000', 10);
    const maxPort = port + 10;

    function tentarEscutar(currentPort) {
        const srv = createAppServer({ port: currentPort });
        srv.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE' && currentPort < maxPort) {
                tentarEscutar(currentPort + 1);
            } else {
                console.error('Erro ao iniciar servidor Wi-Fi:', err);
                process.exit(1);
            }
        });
        srv.listen(currentPort, '0.0.0.0', () => {
            const ips = obterIpsLocais();
            const info = srv.getRemotePin();
            console.log('');
            console.log('==========================================================');
            console.log(' PROJECAO ICM v2.2.1 - SERVIDOR DE CONTROLE WI-FI ATIVO');
            console.log('==========================================================');
            console.log(' Painel no PC:       http://localhost:' + currentPort + '/index.html');
            if (ips.length > 0) {
                ips.forEach((ip) => {
                    console.log(' Celular (Wi-Fi):    http://' + ip + ':' + currentPort + '/controle.html?pin=' + info.pin);
                });
            } else {
                console.log(' Celular (Wi-Fi):    http://<IP-DESTE-PC>:' + currentPort + '/controle.html');
            }
            console.log(' PIN de Acesso:      ' + info.pin);
            console.log('==========================================================');
            console.log(' Mantenha esta janela aberta durante a transmissao.');
            console.log('');
        });
    }

    tentarEscutar(port);
}

if (require.main === module) {
    startCliServer();
}

module.exports = { createAppServer, obterIpsLocais, isLoopbackAddress };
