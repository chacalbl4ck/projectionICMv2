// =====================================================================
// Projeção ICM v2.2 - Executável Desktop Autônomo (Servidor HTTP/SSE + UI Tray)
// =====================================================================
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Projeção ICM")]
[assembly: AssemblyDescription("Sistema de Projeção e Transmissão Litúrgica - Igreja Cristã Maranata")]
[assembly: AssemblyProduct("Projeção ICM HTML5")]
[assembly: AssemblyCompany("ICM - Leopoldina / MG")]
[assembly: AssemblyVersion("2.2.0.0")]
[assembly: AssemblyFileVersion("2.2.0.0")]

namespace ProjecaoICMDesktop
{
    public class ParsedHttpRequest
    {
        public string Method;
        public string RawUrl;
        public string PathName;
        public Dictionary<string, string> Query;
        public Dictionary<string, string> Headers;
        public byte[] BodyBytes;
    }

    public class ProjectionHttpServer : IDisposable
    {
        private static readonly Dictionary<string, string> MimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "application/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".gif", "image/gif" },
            { ".webp", "image/webp" },
            { ".ico", "image/x-icon" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" },
            { ".ttf", "font/ttf" },
            { ".eot", "application/vnd.ms-fontobject" },
            { ".otf", "font/otf" },
            { ".mp4", "video/mp4" },
            { ".avi", "video/x-msvideo" }
        };

        private readonly string _rootDir;
        private readonly string _rootPrefix;
        private readonly object _sync = new object();
        private readonly List<Stream> _hostClients = new List<Stream>();
        private readonly List<Stream> _remoteClients = new List<Stream>();

        private Dictionary<string, object> _latestState;
        private Dictionary<string, object> _latestLibrary;
        private string _accessPin;
        private bool _pinEnabled;

        private TcpListener _listener;
        private Thread _acceptThread;
        private volatile bool _running;
        private int _port;

        public Action OnStatusChanged;

        public ProjectionHttpServer(string rootDir, string fixedPin, bool pinEnabled)
        {
            _rootDir = Path.GetFullPath(rootDir);
            _rootPrefix = _rootDir.EndsWith(Path.DirectorySeparatorChar.ToString())
                ? _rootDir
                : _rootDir + Path.DirectorySeparatorChar;
            _pinEnabled = pinEnabled;
            _accessPin = string.IsNullOrEmpty(fixedPin) ? GeneratePin() : fixedPin;

            _latestState = new Dictionary<string, object>
            {
                { "activeSlide", 0 },
                { "totalSlides", 0 },
                { "isBlackout", false },
                { "isFrozen", false },
                { "telaoConnected", false },
                { "slides", new object[0] },
                { "queue", new object[0] },
                { "updatedAt", UnixNowMs() }
            };

            _latestLibrary = new Dictionary<string, object>
            {
                { "songs", new object[0] },
                { "warnings", new object[0] },
                { "media", new object[0] },
                { "updatedAt", UnixNowMs() }
            };
        }

        public int Port { get { return _port; } }

        public string Pin
        {
            get { lock (_sync) { return _accessPin; } }
        }

        public bool PinEnabled
        {
            get { lock (_sync) { return _pinEnabled; } }
        }

        public int RemotesCount
        {
            get { lock (_sync) { return _remoteClients.Count; } }
        }

        public bool HostConnected
        {
            get { lock (_sync) { return _hostClients.Count > 0; } }
        }

        public void RegeneratePin()
        {
            lock (_sync)
            {
                _accessPin = GeneratePin();
            }
            NotifyHostStatus();
            RaiseStatusChanged();
        }

        public void SetPinEnabled(bool enabled)
        {
            lock (_sync)
            {
                _pinEnabled = enabled;
            }
            NotifyHostStatus();
            RaiseStatusChanged();
        }

        private static string GeneratePin()
        {
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                byte[] b = new byte[4];
                rng.GetBytes(b);
                uint val = BitConverter.ToUInt32(b, 0) % 9000u + 1000u;
                return val.ToString();
            }
        }

        private static long UnixNowMs()
        {
            return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
        }

        private static JavaScriptSerializer CreateSerializer()
        {
            JavaScriptSerializer js = new JavaScriptSerializer();
            js.MaxJsonLength = 16 * 1024 * 1024;
            return js;
        }

        public static bool IsLoopbackAddress(string addr)
        {
            if (string.IsNullOrEmpty(addr)) return false;
            return addr == "127.0.0.1" || addr == "::1" || addr == "::ffff:127.0.0.1";
        }

        public static List<string> ObterIpsLocais()
        {
            List<string> valid = new List<string>();
            List<string> apipa = new List<string>();
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    IPInterfaceProperties props = ni.GetIPProperties();
                    foreach (UnicastIPAddressInformation ua in props.UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ua.Address))
                        {
                            string ip = ua.Address.ToString();
                            if (ip.StartsWith("169.254.")) apipa.Add(ip);
                            else if (!valid.Contains(ip)) valid.Add(ip);
                        }
                    }
                }
            }
            catch { }
            return valid.Count > 0 ? valid : apipa;
        }

        public void Start(int preferredPort)
        {
            int maxPort = preferredPort + 10;
            for (int p = preferredPort; p <= maxPort; p++)
            {
                TcpListener candidate = null;
                try
                {
                    candidate = new TcpListener(IPAddress.Any, p);
                    candidate.Start();
                    _listener = candidate;
                    _port = p;
                    _running = true;
                    _acceptThread = new Thread(AcceptLoop);
                    _acceptThread.IsBackground = true;
                    _acceptThread.Start();
                    return;
                }
                catch (SocketException)
                {
                    if (candidate != null) try { candidate.Stop(); } catch { }
                    if (p == maxPort) throw;
                }
            }
        }

        public void Stop()
        {
            _running = false;
            if (_listener != null)
            {
                try { _listener.Stop(); } catch { }
            }
            lock (_sync)
            {
                foreach (Stream s in _hostClients) try { s.Dispose(); } catch { }
                foreach (Stream s in _remoteClients) try { s.Dispose(); } catch { }
                _hostClients.Clear();
                _remoteClients.Clear();
            }
        }

        public void Dispose()
        {
            Stop();
        }

        private void RaiseStatusChanged()
        {
            Action cb = OnStatusChanged;
            if (cb != null)
            {
                try { cb(); } catch { }
            }
        }

        private void AcceptLoop()
        {
            while (_running)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(delegate { HandleTcpClient(client); });
                }
                catch
                {
                    if (!_running) break;
                }
            }
        }

        private void HandleTcpClient(TcpClient client)
        {
            string remoteAddr = "127.0.0.1";
            try
            {
                client.ReceiveTimeout = 30000;
                client.SendTimeout = 15000;
                IPEndPoint ep = client.Client.RemoteEndPoint as IPEndPoint;
                if (ep != null) remoteAddr = ep.Address.ToString();
                using (client)
                using (NetworkStream stream = client.GetStream())
                {
                    ProcessConnection(stream, remoteAddr, false);
                }
            }
            catch { }
        }

        public void ProcessConnection(Stream stream, string remoteAddr, bool skipSseBlockingLoop)
        {
            ParsedHttpRequest req = ReadHttpRequest(stream);
            if (req == null) return;

            bool isLocalHost = IsLoopbackAddress(remoteAddr);
            string pathName = req.PathName;

            if (pathName == "/api/info" && req.Method == "GET")
            {
                if (!isLocalHost)
                {
                    SendJson(stream, 403, new Dictionary<string, object> {
                        { "ok", false }, { "error", "Acesso permitido apenas no painel local." }
                    });
                    return;
                }
                lock (_sync)
                {
                    SendJson(stream, 200, new Dictionary<string, object> {
                        { "ok", true },
                        { "port", _port },
                        { "ips", ObterIpsLocais().ToArray() },
                        { "pin", _accessPin },
                        { "pinEnabled", _pinEnabled },
                        { "remotesCount", _remoteClients.Count },
                        { "hostConnected", _hostClients.Count > 0 }
                    });
                }
                return;
            }

            if (pathName == "/api/pin" && req.Method == "POST")
            {
                if (!isLocalHost)
                {
                    SendJson(stream, 403, new Dictionary<string, object> {
                        { "ok", false }, { "error", "Apenas o operador local pode alterar o PIN." }
                    });
                    return;
                }
                try
                {
                    JavaScriptSerializer js = CreateSerializer();
                    string rawJson = req.BodyBytes != null && req.BodyBytes.Length > 0 ? Encoding.UTF8.GetString(req.BodyBytes) : "{}";
                    Dictionary<string, object> body = js.Deserialize<Dictionary<string, object>>(rawJson) ?? new Dictionary<string, object>();
                    lock (_sync)
                    {
                        if (body.ContainsKey("pinEnabled") && body["pinEnabled"] is bool)
                            _pinEnabled = (bool)body["pinEnabled"];
                        object regObj;
                        bool regen = body.TryGetValue("regenerate", out regObj) && regObj is bool && (bool)regObj;
                        if (regen)
                        {
                            _accessPin = GeneratePin();
                        }
                        else if (body.ContainsKey("pin") && body["pin"] is string)
                        {
                            string candidatePin = ((string)body["pin"]).Trim();
                            if (Regex.IsMatch(candidatePin, @"^\d{4,6}$"))
                                _accessPin = candidatePin;
                        }
                    }
                    NotifyHostStatus();
                    RaiseStatusChanged();
                    lock (_sync)
                    {
                        SendJson(stream, 200, new Dictionary<string, object> {
                            { "ok", true }, { "pin", _accessPin }, { "pinEnabled", _pinEnabled }
                        });
                    }
                }
                catch
                {
                    SendJson(stream, 400, new Dictionary<string, object> {
                        { "ok", false }, { "error", "Dados inválidos." }
                    });
                }
                return;
            }

            if (pathName == "/api/remote-check" && req.Method == "GET")
            {
                if (!IsRemoteAuthorized(req))
                {
                    SendJson(stream, 401, new Dictionary<string, object> {
                        { "ok", false }, { "pinRequired", true }, { "error", "PIN incorreto." }
                    });
                    return;
                }
                lock (_sync)
                {
                    SendJson(stream, 200, new Dictionary<string, object> {
                        { "ok", true },
                        { "pinEnabled", _pinEnabled },
                        { "hostConnected", _hostClients.Count > 0 },
                        { "state", _latestState }
                    });
                }
                return;
            }

            if (pathName == "/api/events" && req.Method == "GET")
            {
                string role;
                if (!req.Query.TryGetValue("role", out role) || string.IsNullOrEmpty(role))
                    role = "remote";

                if (role == "host")
                {
                    if (!isLocalHost)
                    {
                        SendJson(stream, 403, new Dictionary<string, object> {
                            { "ok", false }, { "error", "Registro de host permitido apenas localmente." }
                        });
                        return;
                    }
                    WriteSseHeaders(stream);
                    lock (_sync) { _hostClients.Add(stream); }
                    NotifyHostStatus();
                    BroadcastRemotes("host_status", new Dictionary<string, object> { { "hostConnected", true } });
                    RaiseStatusChanged();

                    if (skipSseBlockingLoop) return;
                    RunSseKeepAliveLoop(stream);
                    lock (_sync) { _hostClients.Remove(stream); }
                    bool anyHost;
                    lock (_sync) { anyHost = _hostClients.Count > 0; }
                    BroadcastRemotes("host_status", new Dictionary<string, object> { { "hostConnected", anyHost } });
                    RaiseStatusChanged();
                    return;
                }

                if (!IsRemoteAuthorized(req))
                {
                    SendJson(stream, 401, new Dictionary<string, object> {
                        { "ok", false }, { "pinRequired", true }, { "error", "PIN inválido ou ausente." }
                    });
                    return;
                }

                WriteSseHeaders(stream);
                Dictionary<string, object> snapCopy;
                bool hostUp;
                lock (_sync)
                {
                    _remoteClients.Add(stream);
                    snapCopy = _latestState;
                    hostUp = _hostClients.Count > 0;
                }
                SendSseEvent(stream, "state", snapCopy);
                SendSseEvent(stream, "host_status", new Dictionary<string, object> { { "hostConnected", hostUp } });
                NotifyHostStatus();
                RaiseStatusChanged();

                if (skipSseBlockingLoop) return;
                RunSseKeepAliveLoop(stream);
                lock (_sync) { _remoteClients.Remove(stream); }
                NotifyHostStatus();
                RaiseStatusChanged();
                return;
            }

            if (pathName == "/api/state")
            {
                if (req.Method == "POST")
                {
                    if (!isLocalHost)
                    {
                        SendJson(stream, 403, new Dictionary<string, object> {
                            { "ok", false }, { "error", "Apenas o painel local publica estado." }
                        });
                        return;
                    }
                    try
                    {
                        JavaScriptSerializer js = CreateSerializer();
                        string rawJson = req.BodyBytes != null && req.BodyBytes.Length > 0 ? Encoding.UTF8.GetString(req.BodyBytes) : "{}";
                        Dictionary<string, object> body = js.Deserialize<Dictionary<string, object>>(rawJson) ?? new Dictionary<string, object>();
                        Dictionary<string, object> snapshot;
                        int remotes;
                        lock (_sync)
                        {
                            Dictionary<string, object> nextState = new Dictionary<string, object>(_latestState);
                            foreach (KeyValuePair<string, object> kv in body)
                            {
                                nextState[kv.Key] = kv.Value;
                            }
                            nextState["updatedAt"] = UnixNowMs();
                            _latestState = nextState;
                            snapshot = _latestState;
                            remotes = _remoteClients.Count;
                        }
                        BroadcastRemotes("state", snapshot);
                        SendJson(stream, 200, new Dictionary<string, object> { { "ok", true }, { "remotesCount", remotes } });
                    }
                    catch
                    {
                        SendJson(stream, 400, new Dictionary<string, object> { { "ok", false }, { "error", "Estado inválido." } });
                    }
                    return;
                }
                if (req.Method == "GET")
                {
                    if (!isLocalHost && !IsRemoteAuthorized(req))
                    {
                        SendJson(stream, 401, new Dictionary<string, object> { { "ok", false }, { "pinRequired", true } });
                        return;
                    }
                    lock (_sync)
                    {
                        SendJson(stream, 200, new Dictionary<string, object> {
                            { "ok", true }, { "hostConnected", _hostClients.Count > 0 }, { "state", _latestState }
                        });
                    }
                    return;
                }
            }

            if (pathName == "/api/library")
            {
                if (req.Method == "POST")
                {
                    if (!isLocalHost)
                    {
                        SendJson(stream, 403, new Dictionary<string, object> {
                            { "ok", false }, { "error", "Apenas o painel local atualiza acervo." }
                        });
                        return;
                    }
                    try
                    {
                        JavaScriptSerializer js = CreateSerializer();
                        string rawJson = req.BodyBytes != null && req.BodyBytes.Length > 0 ? Encoding.UTF8.GetString(req.BodyBytes) : "{}";
                        Dictionary<string, object> body = js.Deserialize<Dictionary<string, object>>(rawJson) ?? new Dictionary<string, object>();
                        long ts = UnixNowMs();
                        lock (_sync)
                        {
                            _latestLibrary = new Dictionary<string, object> {
                                { "songs", body.ContainsKey("songs") ? body["songs"] : new object[0] },
                                { "warnings", body.ContainsKey("warnings") ? body["warnings"] : new object[0] },
                                { "media", body.ContainsKey("media") ? body["media"] : new object[0] },
                                { "updatedAt", ts }
                            };
                        }
                        BroadcastRemotes("library_updated", new Dictionary<string, object> { { "updatedAt", ts } });
                        SendJson(stream, 200, new Dictionary<string, object> { { "ok", true } });
                    }
                    catch
                    {
                        SendJson(stream, 400, new Dictionary<string, object> { { "ok", false }, { "error", "Acervo inválido." } });
                    }
                    return;
                }
                if (req.Method == "GET")
                {
                    if (!isLocalHost && !IsRemoteAuthorized(req))
                    {
                        SendJson(stream, 401, new Dictionary<string, object> { { "ok", false }, { "pinRequired", true } });
                        return;
                    }
                    lock (_sync)
                    {
                        SendJson(stream, 200, new Dictionary<string, object> { { "ok", true }, { "library", _latestLibrary } });
                    }
                    return;
                }
            }

            if (pathName == "/api/command" && req.Method == "POST")
            {
                if (!isLocalHost && !IsRemoteAuthorized(req))
                {
                    SendJson(stream, 401, new Dictionary<string, object> {
                        { "ok", false }, { "pinRequired", true }, { "error", "PIN inválido." }
                    });
                    return;
                }
                bool hasHost;
                lock (_sync) { hasHost = _hostClients.Count > 0; }
                if (!hasHost)
                {
                    SendJson(stream, 503, new Dictionary<string, object> {
                        { "ok", false }, { "error", "O painel principal (index.html) não está aberto no computador." }
                    });
                    return;
                }
                try
                {
                    JavaScriptSerializer js = CreateSerializer();
                    string rawJson = req.BodyBytes != null && req.BodyBytes.Length > 0 ? Encoding.UTF8.GetString(req.BodyBytes) : "{}";
                    Dictionary<string, object> body = js.Deserialize<Dictionary<string, object>>(rawJson);
                    if (body == null || !body.ContainsKey("type") || body["type"] == null || string.IsNullOrEmpty(body["type"].ToString()))
                    {
                        SendJson(stream, 400, new Dictionary<string, object> { { "ok", false }, { "error", "Comando inválido." } });
                        return;
                    }
                    body["receivedAt"] = UnixNowMs();
                    BroadcastHosts("command", body);
                    SendJson(stream, 200, new Dictionary<string, object> { { "ok", true } });
                }
                catch
                {
                    SendJson(stream, 400, new Dictionary<string, object> { { "ok", false }, { "error", "JSON de comando inválido." } });
                }
                return;
            }

            if (req.Method == "GET" || req.Method == "HEAD")
            {
                ServeStaticFile(req, stream);
                return;
            }

            SendJson(stream, 405, new Dictionary<string, object> { { "ok", false }, { "error", "Method Not Allowed" } });
        }

        private bool IsRemoteAuthorized(ParsedHttpRequest req)
        {
            lock (_sync)
            {
                if (!_pinEnabled) return true;
                string provided = "";
                string hdr;
                if (req.Headers.TryGetValue("x-remote-pin", out hdr) && !string.IsNullOrEmpty(hdr))
                    provided = hdr.Trim();
                else if (req.Query.TryGetValue("pin", out hdr) && !string.IsNullOrEmpty(hdr))
                    provided = hdr.Trim();
                return provided.Length > 0 && provided == _accessPin;
            }
        }

        private void NotifyHostStatus()
        {
            Dictionary<string, object> payload;
            lock (_sync)
            {
                payload = new Dictionary<string, object> {
                    { "count", _remoteClients.Count },
                    { "pinEnabled", _pinEnabled },
                    { "pin", _accessPin }
                };
            }
            BroadcastHosts("remotes", payload);
        }

        private void BroadcastHosts(string eventName, object dataObj)
        {
            BroadcastToList(_hostClients, eventName, dataObj);
        }

        private void BroadcastRemotes(string eventName, object dataObj)
        {
            BroadcastToList(_remoteClients, eventName, dataObj);
        }

        private void BroadcastToList(List<Stream> targets, string eventName, object dataObj)
        {
            List<Stream> snapshot;
            lock (_sync) { snapshot = new List<Stream>(targets); }
            if (snapshot.Count == 0) return;

            byte[] frame = BuildSseFrame(eventName, dataObj);
            foreach (Stream s in snapshot)
            {
                try
                {
                    s.Write(frame, 0, frame.Length);
                    s.Flush();
                }
                catch
                {
                    lock (_sync) { targets.Remove(s); }
                }
            }
        }

        private void SendSseEvent(Stream s, string eventName, object dataObj)
        {
            byte[] frame = BuildSseFrame(eventName, dataObj);
            s.Write(frame, 0, frame.Length);
            s.Flush();
        }

        private static byte[] BuildSseFrame(string eventName, object dataObj)
        {
            JavaScriptSerializer js = CreateSerializer();
            string frame = "event: " + eventName + "\ndata: " + js.Serialize(dataObj) + "\n\n";
            return Encoding.UTF8.GetBytes(frame);
        }

        private void RunSseKeepAliveLoop(Stream stream)
        {
            byte[] ping = Encoding.UTF8.GetBytes(": ping\n\n");
            while (_running)
            {
                Thread.Sleep(15000);
                if (!_running) break;
                try
                {
                    stream.Write(ping, 0, ping.Length);
                    stream.Flush();
                }
                catch
                {
                    break;
                }
            }
        }

        private void ServeStaticFile(ParsedHttpRequest req, Stream stream)
        {
            string reqPath = req.PathName;
            if (string.IsNullOrEmpty(reqPath) || reqPath == "/") reqPath = "/index.html";
            string relPath = reqPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);

            string resolved;
            try
            {
                resolved = Path.GetFullPath(Path.Combine(_rootDir, relPath));
            }
            catch
            {
                SendText(stream, 403, "Acesso negado");
                return;
            }

            if (!resolved.StartsWith(_rootPrefix, StringComparison.OrdinalIgnoreCase) && !string.Equals(resolved, _rootDir, StringComparison.OrdinalIgnoreCase))
            {
                SendText(stream, 403, "Acesso negado");
                return;
            }

            string baseName = Path.GetFileName(resolved).ToLowerInvariant();
            string ext = Path.GetExtension(resolved).ToLowerInvariant();
            string relLower = resolved.Substring(_rootPrefix.Length).ToLowerInvariant();
            if (baseName.StartsWith(".") || relLower.StartsWith("desktop" + Path.DirectorySeparatorChar) || relLower.StartsWith(".git") ||
                baseName == "server.js" || baseName == "iniciar_com_wifi.bat" || ext == ".exe" || ext == ".cs" || ext == ".ps1")
            {
                SendText(stream, 403, "Acesso restrito");
                return;
            }

            if (!File.Exists(resolved))
            {
                SendText(stream, 404, "Arquivo não encontrado");
                return;
            }

            FileInfo fi = new FileInfo(resolved);
            string contentType;
            if (!MimeTypes.TryGetValue(ext, out contentType)) contentType = "application/octet-stream";

            string rangeHeader;
            if (req.Headers.TryGetValue("range", out rangeHeader) && !string.IsNullOrEmpty(rangeHeader))
            {
                Match m = Regex.Match(rangeHeader, @"bytes=(\d*)-(\d*)");
                if (m.Success && fi.Length > 0)
                {
                    long start = string.IsNullOrEmpty(m.Groups[1].Value) ? 0 : long.Parse(m.Groups[1].Value);
                    long end = string.IsNullOrEmpty(m.Groups[2].Value) ? fi.Length - 1 : Math.Min(fi.Length - 1, long.Parse(m.Groups[2].Value));
                    if (start <= end && start < fi.Length)
                    {
                        long len = (end - start) + 1;
                        string head = "HTTP/1.1 206 Partial Content\r\n" +
                            "Content-Range: bytes " + start + "-" + end + "/" + fi.Length + "\r\n" +
                            "Accept-Ranges: bytes\r\n" +
                            "Content-Length: " + len + "\r\n" +
                            "Content-Type: " + contentType + "\r\n" +
                            "Connection: close\r\n\r\n";
                        byte[] hb = Encoding.ASCII.GetBytes(head);
                        stream.Write(hb, 0, hb.Length);
                        if (req.Method != "HEAD")
                            CopyFileSlice(resolved, stream, start, len);
                        stream.Flush();
                        return;
                    }
                }
            }

            string okHead = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: " + contentType + "\r\n" +
                "Content-Length: " + fi.Length + "\r\n" +
                "Accept-Ranges: bytes\r\n" +
                "Connection: close\r\n\r\n";
            byte[] okBytes = Encoding.ASCII.GetBytes(okHead);
            stream.Write(okBytes, 0, okBytes.Length);
            if (req.Method != "HEAD")
                CopyFileSlice(resolved, stream, 0, fi.Length);
            stream.Flush();
        }

        private static void CopyFileSlice(string filePath, Stream dest, long start, long count)
        {
            byte[] buf = new byte[65536];
            using (FileStream fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                fs.Seek(start, SeekOrigin.Begin);
                long remaining = count;
                while (remaining > 0)
                {
                    int toRead = (int)Math.Min(buf.Length, remaining);
                    int n = fs.Read(buf, 0, toRead);
                    if (n <= 0) break;
                    dest.Write(buf, 0, n);
                    remaining -= n;
                }
            }
        }

        private static void WriteSseHeaders(Stream stream)
        {
            string head = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: text/event-stream; charset=utf-8\r\n" +
                "Cache-Control: no-cache, no-transform\r\n" +
                "Connection: keep-alive\r\n\r\n";
            byte[] bytes = Encoding.ASCII.GetBytes(head);
            stream.Write(bytes, 0, bytes.Length);
            stream.Flush();
        }

        private static void SendJson(Stream stream, int code, object payload)
        {
            JavaScriptSerializer js = CreateSerializer();
            byte[] body = Encoding.UTF8.GetBytes(js.Serialize(payload));
            string head = "HTTP/1.1 " + code + " " + StatusText(code) + "\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Cache-Control: no-store\r\n" +
                "Content-Length: " + body.Length + "\r\n" +
                "Connection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(head);
            stream.Write(hb, 0, hb.Length);
            stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        private static void SendText(Stream stream, int code, string text)
        {
            byte[] body = Encoding.UTF8.GetBytes(text);
            string head = "HTTP/1.1 " + code + " " + StatusText(code) + "\r\n" +
                "Content-Type: text/plain; charset=utf-8\r\n" +
                "Content-Length: " + body.Length + "\r\n" +
                "Connection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(head);
            stream.Write(hb, 0, hb.Length);
            stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        private static string StatusText(int code)
        {
            switch (code)
            {
                case 200: return "OK";
                case 206: return "Partial Content";
                case 400: return "Bad Request";
                case 401: return "Unauthorized";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 405: return "Method Not Allowed";
                case 503: return "Service Unavailable";
                default: return "OK";
            }
        }

        private static ParsedHttpRequest ReadHttpRequest(Stream stream)
        {
            MemoryStream headerBuf = new MemoryStream();
            byte[] tmp = new byte[4096];
            int headerEnd = -1;

            while (headerBuf.Length < 65536)
            {
                int n = stream.Read(tmp, 0, tmp.Length);
                if (n <= 0) break;
                headerBuf.Write(tmp, 0, n);
                byte[] cur = headerBuf.GetBuffer();
                int len = (int)headerBuf.Length;
                for (int i = 0; i <= len - 4; i++)
                {
                    if (cur[i] == 13 && cur[i + 1] == 10 && cur[i + 2] == 13 && cur[i + 3] == 10)
                    {
                        headerEnd = i;
                        break;
                    }
                }
                if (headerEnd >= 0) break;
            }

            if (headerEnd < 0) return null;

            byte[] all = headerBuf.ToArray();
            string headerText = Encoding.ASCII.GetString(all, 0, headerEnd);
            string[] lines = headerText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            if (lines.Length == 0) return null;

            string[] parts = lines[0].Split(' ');
            if (parts.Length < 2) return null;

            ParsedHttpRequest req = new ParsedHttpRequest();
            req.Method = parts[0].Trim().ToUpperInvariant();
            req.RawUrl = parts[1].Trim();
            req.Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            req.Query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            for (int i = 1; i < lines.Length; i++)
            {
                int idx = lines[i].IndexOf(':');
                if (idx > 0)
                {
                    string hk = lines[i].Substring(0, idx).Trim();
                    string hv = lines[i].Substring(idx + 1).Trim();
                    req.Headers[hk] = hv;
                }
            }

            int qIdx = req.RawUrl.IndexOf('?');
            string rawPath = qIdx >= 0 ? req.RawUrl.Substring(0, qIdx) : req.RawUrl;
            string rawQuery = qIdx >= 0 ? req.RawUrl.Substring(qIdx + 1) : "";
            try { req.PathName = Uri.UnescapeDataString(rawPath); }
            catch { req.PathName = rawPath; }

            if (!string.IsNullOrEmpty(rawQuery))
            {
                string[] pairs = rawQuery.Split('&');
                foreach (string pair in pairs)
                {
                    if (string.IsNullOrEmpty(pair)) continue;
                    int eq = pair.IndexOf('=');
                    string k = eq >= 0 ? pair.Substring(0, eq) : pair;
                    string v = eq >= 0 ? pair.Substring(eq + 1) : "";
                    try
                    {
                        k = Uri.UnescapeDataString(k.Replace('+', ' '));
                        v = Uri.UnescapeDataString(v.Replace('+', ' '));
                    }
                    catch { }
                    req.Query[k] = v;
                }
            }

            int contentLength = 0;
            string clStr;
            if (req.Headers.TryGetValue("content-length", out clStr))
            {
                int.TryParse(clStr, out contentLength);
            }
            if (contentLength > 4 * 1024 * 1024) contentLength = 4 * 1024 * 1024;

            if (contentLength > 0)
            {
                byte[] body = new byte[contentLength];
                int bodyOffsetInAll = headerEnd + 4;
                int already = Math.Min(contentLength, all.Length - bodyOffsetInAll);
                if (already > 0)
                    Buffer.BlockCopy(all, bodyOffsetInAll, body, 0, already);

                int readTotal = already;
                while (readTotal < contentLength)
                {
                    int n = stream.Read(body, readTotal, contentLength - readTotal);
                    if (n <= 0) break;
                    readTotal += n;
                }
                req.BodyBytes = body;
            }
            else
            {
                req.BodyBytes = new byte[0];
            }

            return req;
        }
    }

    public class MainForm : Form
    {
        private readonly ProjectionHttpServer _server;
        private readonly string _webRoot;
        private readonly IContainer _components = new Container();
        private readonly NotifyIcon _trayIcon;
        private readonly Label _lblStatus;
        private readonly Label _lblWifiCount;
        private readonly Label _lblPin;
        private readonly TextBox _txtPanelUrl;
        private readonly TextBox _txtWifiUrl;
        private readonly TextBox _txtObsUrl;
        private readonly Button _btnTogglePin;
        private string _currentWifiUrl;

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern uint RegisterWindowMessage(string lpString);
        private static readonly uint WM_TASKBARCREATED = RegisterWindowMessage("TaskbarCreated");

        public MainForm(ProjectionHttpServer server, string webRoot, Icon appIcon, Icon trayIconImg)
        {
            _server = server;
            _webRoot = webRoot;

            this.Text = "Projeção ICM v2.2";
            this.Icon = appIcon;
            this.ShowInTaskbar = true;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.ClientSize = new Size(510, 430);
            this.BackColor = Color.FromArgb(14, 24, 48);
            this.ForeColor = Color.White;
            this.Font = new Font("Segoe UI", 9.5f);

            // Cabeçalho com Logo Oficial da ICM
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 76;
            header.BackColor = Color.FromArgb(9, 18, 38);

            PictureBox picLogo = new PictureBox();
            picLogo.Size = new Size(52, 52);
            picLogo.Location = new Point(16, 12);
            picLogo.SizeMode = PictureBoxSizeMode.Zoom;
            if (appIcon != null) picLogo.Image = appIcon.ToBitmap();

            Label lblTitle = new Label();
            lblTitle.Text = "Projeção ICM HTML5  v2.2";
            lblTitle.Font = new Font("Segoe UI", 13.5f, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(251, 191, 36);
            lblTitle.AutoSize = true;
            lblTitle.Location = new Point(80, 14);

            _lblStatus = new Label();
            _lblStatus.Text = string.Format("● Servidor local ativo na porta {0}", _server.Port);
            _lblStatus.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            _lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
            _lblStatus.AutoSize = true;
            _lblStatus.Location = new Point(82, 42);

            header.Controls.Add(picLogo);
            header.Controls.Add(lblTitle);
            header.Controls.Add(_lblStatus);
            this.Controls.Add(header);

            // Área Principal
            int y = 92;
            Label l1 = MakeSectionLabel("Painel do Operador:", 18, y);
            _txtPanelUrl = MakeUrlBox(string.Format("http://localhost:{0}/index.html", _server.Port), 18, y + 22, 354);
            Button btnOpenPanel = MakeButton("Abrir Painel", 380, y + 20, 112, 28, Color.FromArgb(37, 99, 235));
            btnOpenPanel.Click += delegate { LaunchBrowser(_txtPanelUrl.Text); };
            this.Controls.AddRange(new Control[] { l1, _txtPanelUrl, btnOpenPanel });

            y += 64;
            Label l2 = MakeSectionLabel("Saída OBS Studio (Navegador 1920x1080):", 18, y);
            _txtObsUrl = MakeUrlBox(string.Format("http://localhost:{0}/obs.html", _server.Port), 18, y + 22, 354);
            Button btnCopyObs = MakeButton("Copiar OBS", 380, y + 20, 112, 28, Color.FromArgb(8, 145, 178));
            btnCopyObs.Click += delegate {
                Clipboard.SetText(_txtObsUrl.Text);
                btnCopyObs.Text = "Copiado!";
                System.Windows.Forms.Timer t = new System.Windows.Forms.Timer();
                t.Interval = 1500;
                t.Tick += delegate { btnCopyObs.Text = "Copiar OBS"; t.Stop(); t.Dispose(); };
                t.Start();
            };
            this.Controls.AddRange(new Control[] { l2, _txtObsUrl, btnCopyObs });

            y += 64;
            Label l3 = MakeSectionLabel("Controle Remoto pelo Celular (Wi-Fi):", 18, y);
            _txtWifiUrl = MakeUrlBox("", 18, y + 22, 354);
            Button btnCopyWifi = MakeButton("Copiar Link", 380, y + 20, 112, 28, Color.FromArgb(16, 185, 129));
            btnCopyWifi.Click += delegate {
                Clipboard.SetText(_txtWifiUrl.Text);
                btnCopyWifi.Text = "Copiado!";
                System.Windows.Forms.Timer t = new System.Windows.Forms.Timer();
                t.Interval = 1500;
                t.Tick += delegate { btnCopyWifi.Text = "Copiar Link"; t.Stop(); t.Dispose(); };
                t.Start();
            };
            this.Controls.AddRange(new Control[] { l3, _txtWifiUrl, btnCopyWifi });

            y += 64;
            Panel pinPanel = new Panel();
            pinPanel.Location = new Point(18, y);
            pinPanel.Size = new Size(474, 54);
            pinPanel.BackColor = Color.FromArgb(24, 38, 72);

            _lblPin = new Label();
            _lblPin.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            _lblPin.ForeColor = Color.FromArgb(251, 191, 36);
            _lblPin.AutoSize = true;
            _lblPin.Location = new Point(12, 7);

            _lblWifiCount = new Label();
            _lblWifiCount.Font = new Font("Segoe UI", 8.8f);
            _lblWifiCount.ForeColor = Color.FromArgb(203, 213, 225);
            _lblWifiCount.AutoSize = true;
            _lblWifiCount.Location = new Point(14, 31);

            Button btnNewPin = MakeButton("Novo PIN", 268, 12, 94, 30, Color.FromArgb(71, 85, 105));
            btnNewPin.Click += delegate { _server.RegeneratePin(); };

            _btnTogglePin = MakeButton("Desativar PIN", 368, 12, 96, 30, Color.FromArgb(71, 85, 105));
            _btnTogglePin.Click += delegate { _server.SetPinEnabled(!_server.PinEnabled); };

            pinPanel.Controls.AddRange(new Control[] { _lblPin, _lblWifiCount, btnNewPin, _btnTogglePin });
            this.Controls.Add(pinPanel);

            // Rodapé de ações
            y += 72;
            Button btnTelao = MakeButton("Abrir Telão", 18, y, 110, 36, Color.FromArgb(59, 130, 246));
            btnTelao.Click += delegate { LaunchBrowser(string.Format("http://localhost:{0}/view.html", _server.Port)); };

            Button btnFolder = MakeButton("Pasta Sistema", 136, y, 116, 36, Color.FromArgb(51, 65, 85));
            btnFolder.Click += delegate {
                try { Process.Start("explorer.exe", _webRoot); } catch { }
            };

            Button btnHideTray = MakeButton("Bandeja", 260, y, 112, 36, Color.FromArgb(71, 85, 105));
            btnHideTray.Click += delegate { HideToTray(); };

            Button btnClose = MakeButton("Encerrar", 380, y, 112, 36, Color.FromArgb(185, 28, 28));
            btnClose.Click += delegate { Application.Exit(); };

            this.Controls.AddRange(new Control[] { btnTelao, btnFolder, btnHideTray, btnClose });

            // Ícone na bandeja do sistema (System Tray) vinculado a Container + TaskbarCreated
            Icon safeTrayIcon = trayIconImg ?? appIcon ?? SystemIcons.Application;
            _trayIcon = new NotifyIcon(_components);
            _trayIcon.Icon = safeTrayIcon;
            _trayIcon.Text = string.Format("Projeção ICM v2.2 (Porta {0})", _server.Port);

            ContextMenuStrip menu = new ContextMenuStrip(_components);
            menu.Items.Add("Abrir Painel de Controle", null, delegate { LaunchBrowser(_txtPanelUrl.Text); });
            menu.Items.Add("Abrir Telão", null, delegate { LaunchBrowser(string.Format("http://localhost:{0}/view.html", _server.Port)); });
            menu.Items.Add("Mostrar Janela do Servidor", null, delegate { RestoreWindow(); });
            menu.Items.Add("Ocultar na Bandeja", null, delegate { HideToTray(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Encerrar Projeção ICM", null, delegate { Application.Exit(); });
            _trayIcon.ContextMenuStrip = menu;
            _trayIcon.DoubleClick += delegate { RestoreWindow(); };
            _trayIcon.MouseClick += delegate(object sender, MouseEventArgs me) {
                if (me.Button == MouseButtons.Left) RestoreWindow();
            };
            _trayIcon.Visible = true;

            _server.OnStatusChanged = delegate {
                if (!this.IsDisposed && this.IsHandleCreated)
                {
                    try { this.BeginInvoke((MethodInvoker)RefreshStatusUi); } catch { }
                }
            };

            this.Shown += delegate {
                try
                {
                    _trayIcon.Visible = false;
                    _trayIcon.Visible = true;
                }
                catch { }
            };

            this.FormClosing += delegate {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
                _components.Dispose();
                _server.Stop();
            };

            RefreshStatusUi();
        }

        protected override void WndProc(ref Message m)
        {
            if (WM_TASKBARCREATED != 0 && m.Msg == (int)WM_TASKBARCREATED && _trayIcon != null)
            {
                try
                {
                    _trayIcon.Visible = false;
                    _trayIcon.Visible = true;
                }
                catch { }
            }
            base.WndProc(ref m);
        }

        private void HideToTray()
        {
            this.Hide();
            try
            {
                _trayIcon.ShowBalloonTip(2500, "Projeção ICM v2.2", "Servidor ativo na bandeja do sistema (clique no ícone ou em ^ próximo ao relógio).", ToolTipIcon.Info);
            }
            catch { }
        }

        private void RestoreWindow()
        {
            this.Show();
            this.ShowInTaskbar = true;
            this.WindowState = FormWindowState.Normal;
            this.Activate();
        }

        public void RefreshStatusUi()
        {
            List<string> ips = ProjectionHttpServer.ObterIpsLocais();
            string ipHost = ips.Count > 0 ? ips[0] : "127.0.0.1";
            bool pinOn = _server.PinEnabled;
            string pin = _server.Pin;
            _currentWifiUrl = pinOn
                ? string.Format("http://{0}:{1}/controle.html?pin={2}", ipHost, _server.Port, pin)
                : string.Format("http://{0}:{1}/controle.html", ipHost, _server.Port);
            _txtWifiUrl.Text = _currentWifiUrl;

            _lblPin.Text = pinOn ? ("PIN Wi-Fi: " + pin) : "PIN Wi-Fi: Desativado";
            _btnTogglePin.Text = pinOn ? "Desativar PIN" : "Ativar PIN";
            int count = _server.RemotesCount;
            string mobileTxt = count == 0 ? "Nenhum celular conectado" : (count == 1 ? "1 celular conectado" : count + " celulares conectados");
            string hostTxt = _server.HostConnected ? "Painel conectado" : "Aguardando painel";
            _lblWifiCount.Text = string.Format("{0} • {1}", mobileTxt, hostTxt);
        }

        private static Label MakeSectionLabel(string text, int x, int y)
        {
            Label l = new Label();
            l.Text = text;
            l.Location = new Point(x, y);
            l.AutoSize = true;
            l.ForeColor = Color.FromArgb(203, 213, 225);
            l.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            return l;
        }

        private static TextBox MakeUrlBox(string text, int x, int y, int w)
        {
            TextBox tb = new TextBox();
            tb.Text = text;
            tb.Location = new Point(x, y);
            tb.Width = w;
            tb.ReadOnly = true;
            tb.BackColor = Color.FromArgb(30, 41, 59);
            tb.ForeColor = Color.White;
            tb.BorderStyle = BorderStyle.FixedSingle;
            return tb;
        }

        private static Button MakeButton(string text, int x, int y, int w, int h, Color bg)
        {
            Button b = new Button();
            b.Text = text;
            b.Location = new Point(x, y);
            b.Size = new Size(w, h);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = bg;
            b.ForeColor = Color.White;
            b.Font = new Font("Segoe UI", 8.8f, FontStyle.Bold);
            b.Cursor = Cursors.Hand;
            return b;
        }

        public static void LaunchBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch { }
        }
    }

    static class Program
    {
        private const string BundleVersion = "2.2.0";

        [STAThread]
        static int Main(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--self-test")
                {
                    return RunSelfTest();
                }
            }

            bool createdNew;
            string portFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ProjecaoICM",
                ".active_port");
            using (Mutex singleInstance = new Mutex(true, "ProjecaoICM_v22_DesktopApp_Mutex", out createdNew))
            {
                if (!createdNew)
                {
                    int activePort = 3000;
                    try
                    {
                        if (File.Exists(portFile))
                            int.TryParse(File.ReadAllText(portFile).Trim(), out activePort);
                    }
                    catch { }
                    if (activePort <= 0) activePort = 3000;
                    MainForm.LaunchBrowser(string.Format("http://localhost:{0}/index.html", activePort));
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                string webRoot = ResolveWebRoot();
                ProjectionHttpServer server = new ProjectionHttpServer(webRoot, null, true);
                try
                {
                    server.Start(3000);
                    try
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(portFile));
                        File.WriteAllText(portFile, server.Port.ToString());
                    }
                    catch { }
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Não foi possível iniciar o servidor local na porta 3000.\n\nDetalhe: " + ex.Message,
                        "Projeção ICM",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return 1;
                }

                Icon appIcon = LoadEmbeddedAppIcon(new Size(48, 48));
                Icon trayIconImg = LoadEmbeddedAppIcon(SystemInformation.SmallIconSize);

                MainForm form = new MainForm(server, webRoot, appIcon, trayIconImg);
                // Abre automaticamente o painel no navegador padrão (o qual abrirá o Telão automaticamente)
                form.Shown += delegate {
                    MainForm.LaunchBrowser(string.Format("http://localhost:{0}/index.html", server.Port));
                };

                Application.Run(form);
                try { if (File.Exists(portFile)) File.Delete(portFile); } catch { }
                GC.KeepAlive(singleInstance);
                return 0;
            }
        }

        public static Icon LoadEmbeddedAppIcon(Size desiredSize)
        {
            try
            {
                using (Stream icoStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app_icon.ico"))
                {
                    if (icoStream != null)
                    {
                        return new Icon(icoStream, desiredSize);
                    }
                }
            }
            catch { }

            try
            {
                Icon assoc = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (assoc != null) return assoc;
            }
            catch { }

            return SystemIcons.Application;
        }

        public static string ResolveWebRoot()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            if (File.Exists(Path.Combine(exeDir, "index.html")) &&
                File.Exists(Path.Combine(exeDir, "view.html")) &&
                File.Exists(Path.Combine(exeDir, "data", "data.json")))
            {
                return exeDir;
            }

            string appDataRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ProjecaoICM",
                "app");
            ExtractEmbeddedBundle(appDataRoot);
            return appDataRoot;
        }

        public static void ExtractEmbeddedBundle(string targetDir)
        {
            string stampFile = Path.Combine(targetDir, ".bundle_version");
            if (File.Exists(stampFile) &&
                File.ReadAllText(stampFile).Trim() == BundleVersion &&
                File.Exists(Path.Combine(targetDir, "index.html")))
            {
                return;
            }

            if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

            using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app_bundle.zip"))
            {
                if (resStream == null)
                    throw new InvalidOperationException("Recurso embutido app_bundle.zip não encontrado no executável.");

                using (ZipArchive zip = new ZipArchive(resStream, ZipArchiveMode.Read))
                {
                    string targetPrefix = Path.GetFullPath(targetDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue;
                        string destPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
                        if (!destPath.StartsWith(targetPrefix, StringComparison.OrdinalIgnoreCase)) continue;

                        string parent = Path.GetDirectoryName(destPath);
                        if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);

                        // Preserva alterações locais do usuário em data.json se já existirem no computador
                        if (entry.FullName.Replace('\\', '/').Equals("data/data.json", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                            continue;

                        entry.ExtractToFile(destPath, true);
                    }
                }
            }

            File.WriteAllText(stampFile, BundleVersion);
        }

        // =====================================================================
        // Suíte de auto-verificação em processo (EXE --self-test)
        // =====================================================================
        private static string DispatchMockHttp(ProjectionHttpServer srv, string method, string url, string remoteIp, Dictionary<string, string> headers, string body, bool isSse)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append(method).Append(" ").Append(url).Append(" HTTP/1.1\r\n");
            sb.Append("Host: localhost:3000\r\n");
            if (headers != null)
            {
                foreach (KeyValuePair<string, string> kv in headers)
                    sb.Append(kv.Key).Append(": ").Append(kv.Value).Append("\r\n");
            }
            byte[] bodyBytes = string.IsNullOrEmpty(body) ? new byte[0] : Encoding.UTF8.GetBytes(body);
            if (bodyBytes.Length > 0)
                sb.Append("Content-Length: ").Append(bodyBytes.Length).Append("\r\n");
            sb.Append("\r\n");

            byte[] headBytes = Encoding.ASCII.GetBytes(sb.ToString());
            MemoryStream reqStream = new MemoryStream();
            reqStream.Write(headBytes, 0, headBytes.Length);
            if (bodyBytes.Length > 0) reqStream.Write(bodyBytes, 0, bodyBytes.Length);
            reqStream.Position = 0;

            DualMockStream dual = new DualMockStream(reqStream);
            srv.ProcessConnection(dual, remoteIp, isSse);
            return Encoding.UTF8.GetString(dual.WrittenBytes);
        }

        private class DualMockStream : Stream
        {
            private readonly MemoryStream _read;
            private readonly MemoryStream _write = new MemoryStream();
            public DualMockStream(MemoryStream readStream) { _read = readStream; }
            public byte[] WrittenBytes { get { return _write.ToArray(); } }
            public override bool CanRead { get { return true; } }
            public override bool CanSeek { get { return false; } }
            public override bool CanWrite { get { return true; } }
            public override long Length { get { return _read.Length; } }
            public override long Position { get { return _read.Position; } set { _read.Position = value; } }
            public override void Flush() { }
            public override int Read(byte[] buffer, int offset, int count) { return _read.Read(buffer, offset, count); }
            public override long Seek(long offset, SeekOrigin origin) { throw new NotSupportedException(); }
            public override void SetLength(long value) { throw new NotSupportedException(); }
            public override void Write(byte[] buffer, int offset, int count) { _write.Write(buffer, offset, count); }
        }

        private static void AssertTrue(bool cond, string msg)
        {
            if (!cond) throw new Exception("SELF-TEST ASSERT FAILED: " + msg);
        }

        private static int RunSelfTest()
        {
            try
            {
                Console.WriteLine("1) Verificando ícone Win32 e recurso app_icon.ico embutido no EXE...");
                Icon ico = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
                AssertTrue(ico != null && ico.Width > 0 && ico.Height > 0, "Icone Win32 não encontrado no EXE");
                Icon traySmall = LoadEmbeddedAppIcon(SystemInformation.SmallIconSize);
                AssertTrue(traySmall != null && traySmall.Width > 0 && traySmall.Height > 0, "app_icon.ico SmallIconSize inválido");
                Icon winLarge = LoadEmbeddedAppIcon(new Size(48, 48));
                AssertTrue(winLarge != null && winLarge.Width == 48 && winLarge.Height == 48, "app_icon.ico 48x48 inválido");
                Console.WriteLine("   PASS: Icones embutidos OK (Tray=" + traySmall.Width + "x" + traySmall.Height + ", Win=" + winLarge.Width + "x" + winLarge.Height + ")");

                Console.WriteLine("2) Verificando recurso app_bundle.zip e extração portátil...");
                string tempRoot = Path.Combine(Path.GetTempPath(), "projecao_icm_selftest_" + Guid.NewGuid().ToString("N"));
                try
                {
                    ExtractEmbeddedBundle(tempRoot);
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "index.html")), "index.html ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "view.html")), "view.html ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "obs.html")), "obs.html ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "controle.html")), "controle.html ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "data", "data.json")), "data/data.json ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "bible", "acf.js")), "bible/acf.js ausente no bundle");
                    AssertTrue(File.Exists(Path.Combine(tempRoot, "imagens", "ProjecaoICM.ico")), "ProjecaoICM.ico ausente no bundle");

                    Console.WriteLine("   PASS: Bundle completo extraído e validado.");

                    Console.WriteLine("3) Testando servidor HTTP/SSE embutido em processo...");
                    using (ProjectionHttpServer srv = new ProjectionHttpServer(tempRoot, "4242", true))
                    {
                        string r1 = DispatchMockHttp(srv, "GET", "/api/info", "192.168.1.50", null, null, false);
                        AssertTrue(r1.StartsWith("HTTP/1.1 403"), "/api/info remoto deveria retornar 403");

                        string r2 = DispatchMockHttp(srv, "GET", "/api/info", "127.0.0.1", null, null, false);
                        AssertTrue(r2.StartsWith("HTTP/1.1 200") && r2.Contains("\"pin\":\"4242\""), "/api/info local invalido");

                        string r3 = DispatchMockHttp(srv, "GET", "/api/remote-check?pin=0000", "192.168.1.50", null, null, false);
                        AssertTrue(r3.StartsWith("HTTP/1.1 401"), "PIN errado deveria retornar 401");

                        string r4 = DispatchMockHttp(srv, "GET", "/api/remote-check?pin=4242", "192.168.1.50", null, null, false);
                        AssertTrue(r4.StartsWith("HTTP/1.1 200") && r4.Contains("\"ok\":true"), "PIN valido deveria retornar 200");

                        string rBlock1 = DispatchMockHttp(srv, "GET", "/server.js", "127.0.0.1", null, null, false);
                        AssertTrue(rBlock1.StartsWith("HTTP/1.1 403"), "server.js deveria estar bloqueado");

                        string rBlock2 = DispatchMockHttp(srv, "GET", "/../win.ini", "127.0.0.1", null, null, false);
                        AssertTrue(rBlock2.StartsWith("HTTP/1.1 403"), "Path traversal deveria estar bloqueado");

                        string rControle = DispatchMockHttp(srv, "GET", "/controle.html", "192.168.1.50", null, null, false);
                        AssertTrue(rControle.StartsWith("HTTP/1.1 200") && rControle.Contains("Controle ICM"), "controle.html falhou");

                        Dictionary<string, string> rangeHdr = new Dictionary<string, string> { { "Range", "bytes=0-31" } };
                        string rRange = DispatchMockHttp(srv, "GET", "/imagens/chaves-bis.png", "127.0.0.1", rangeHdr, null, false);
                        AssertTrue(rRange.StartsWith("HTTP/1.1 206") && rRange.Contains("Content-Range: bytes 0-31/"), "Range 206 falhou");

                        string rNoHost = DispatchMockHttp(srv, "POST", "/api/command", "192.168.1.50",
                            new Dictionary<string, string> { { "x-remote-pin", "4242" } }, "{\"type\":\"NEXT_SLIDE\"}", false);
                        AssertTrue(rNoHost.StartsWith("HTTP/1.1 503"), "Sem host deveria retornar 503");

                        // Conecta SSE Host + Remote e testa state/command/library/pin
                        string hostSseResp = DispatchMockHttp(srv, "GET", "/api/events?role=host", "127.0.0.1", null, null, true);
                        AssertTrue(hostSseResp.Contains("text/event-stream") && hostSseResp.Contains("event: remotes"), "SSE host falhou");

                        string remoteSseResp = DispatchMockHttp(srv, "GET", "/api/events?role=remote&pin=4242", "192.168.1.50", null, null, true);
                        AssertTrue(remoteSseResp.Contains("text/event-stream") && remoteSseResp.Contains("event: state"), "SSE remote falhou");

                        string rPostState = DispatchMockHttp(srv, "POST", "/api/state", "127.0.0.1", null, "{\"activeSlide\":4}", false);
                        AssertTrue(rPostState.StartsWith("HTTP/1.1 200"), "POST /api/state falhou");

                        string rCmd = DispatchMockHttp(srv, "POST", "/api/command", "192.168.1.50",
                            new Dictionary<string, string> { { "x-remote-pin", "4242" } }, "{\"type\":\"NEXT_SLIDE\"}", false);
                        AssertTrue(rCmd.StartsWith("HTTP/1.1 200"), "POST /api/command falhou");

                        string rLib = DispatchMockHttp(srv, "POST", "/api/library", "127.0.0.1", null, "{\"songs\":[{\"title\":\"Hino 1\"}]}", false);
                        AssertTrue(rLib.StartsWith("HTTP/1.1 200"), "POST /api/library falhou");
                        string rLibGet = DispatchMockHttp(srv, "GET", "/api/library?pin=4242", "192.168.1.50", null, null, false);
                        AssertTrue(rLibGet.StartsWith("HTTP/1.1 200") && rLibGet.Contains("Hino 1"), "GET /api/library falhou");

                        string rPin = DispatchMockHttp(srv, "POST", "/api/pin", "127.0.0.1", null, "{\"pin\":\"9191\",\"pinEnabled\":true}", false);
                        AssertTrue(rPin.StartsWith("HTTP/1.1 200") && rPin.Contains("9191"), "POST /api/pin falhou");
                        string rOld = DispatchMockHttp(srv, "GET", "/api/remote-check?pin=4242", "192.168.1.50", null, null, false);
                        AssertTrue(rOld.StartsWith("HTTP/1.1 401"), "PIN antigo deveria falhar");
                        string rNew = DispatchMockHttp(srv, "GET", "/api/remote-check?pin=9191", "192.168.1.50", null, null, false);
                        AssertTrue(rNew.StartsWith("HTTP/1.1 200"), "Novo PIN deveria funcionar");
                    }
                    Console.WriteLine("   PASS: Todas as rotas HTTP/SSE do executável validadas.");
                }
                finally
                {
                    try { if (Directory.Exists(tempRoot)) Directory.Delete(tempRoot, true); } catch { }
                }
                Console.WriteLine("EXE SELF-TEST PASSED!");
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("EXE SELF-TEST FAILED: " + ex);
                return 1;
            }
        }
    }
}
