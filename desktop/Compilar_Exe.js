// =====================================================================
// Construtor do Executável ProjecaoICM.exe (Zero Dependências Externas)
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const fwDir = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319';
const csc = path.join(fwDir, 'csc.exe');

if (!fs.existsSync(csc)) {
    throw new Error('Compilador csc.exe (.NET Framework 4.x) não encontrado em ' + csc);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icm_build_'));
try {
    // 1) Compila e executa Gerar_Icone_ICM.cs para garantir imagens/ProjecaoICM.ico atualizado
    const icoExe = path.join(tmpDir, 'gerar_ico.exe');
    const icoPath = path.join(root, 'imagens', 'ProjecaoICM.ico');
    execFileSync(csc, [
        '/nologo',
        '/reference:' + path.join(fwDir, 'System.Drawing.dll'),
        '/out:' + icoExe,
        path.join(root, 'desktop', 'Gerar_Icone_ICM.cs')
    ], { cwd: root, stdio: 'inherit' });

    execFileSync(icoExe, [icoPath], { cwd: root, stdio: 'inherit' });

    // 2) Empacota arquivos de runtime em bundle ZIP usando System.IO.Compression nativo do Windows
    const zipCs = path.join(tmpDir, 'pack.cs');
    const zipExe = path.join(tmpDir, 'pack.exe');
    const bundleZip = path.join(tmpDir, 'app_bundle.zip');

    fs.writeFileSync(zipCs, [
        'using System;',
        'using System.IO;',
        'using System.IO.Compression;',
        'class Pack {',
        '  static void Main(string[] args) {',
        '    string root = Path.GetFullPath(args[0]);',
        '    string outZip = args[1];',
        '    string[] rootFiles = new string[] { "index.html", "view.html", "obs.html", "controle.html" };',
        '    string[] dirs = new string[] { "bible", "css", "data", "fontes", "imagens", "js" };',
        '    using (FileStream fs = new FileStream(outZip, FileMode.Create))',
        '    using (ZipArchive zip = new ZipArchive(fs, ZipArchiveMode.Create)) {',
        '      foreach (string rf in rootFiles) {',
        '        string p = Path.Combine(root, rf);',
        '        if (File.Exists(p)) zip.CreateEntryFromFile(p, rf, CompressionLevel.Optimal);',
        '      }',
        '      foreach (string d in dirs) {',
        '        string fullDir = Path.Combine(root, d);',
        '        if (!Directory.Exists(fullDir)) continue;',
        '        foreach (string f in Directory.GetFiles(fullDir, "*", SearchOption.AllDirectories)) {',
        '          string rel = f.Substring(root.Length + 1).Replace("\\\\", "/");',
        '          zip.CreateEntryFromFile(f, rel, CompressionLevel.Optimal);',
        '        }',
        '      }',
        '      string vk = Path.Combine(root, "videos", ".gitkeep");',
        '      if (File.Exists(vk)) zip.CreateEntryFromFile(vk, "videos/.gitkeep", CompressionLevel.Optimal);',
        '    }',
        '  }',
        '}'
    ].join('\n'), 'utf8');

    execFileSync(csc, [
        '/nologo',
        '/reference:' + path.join(fwDir, 'System.IO.Compression.dll'),
        '/reference:' + path.join(fwDir, 'System.IO.Compression.FileSystem.dll'),
        '/out:' + zipExe,
        zipCs
    ], { cwd: root, stdio: 'inherit' });

    execFileSync(zipExe, [root, bundleZip], { cwd: root, stdio: 'inherit' });
    const zipSizeMb = (fs.statSync(bundleZip).size / (1024 * 1024)).toFixed(2);
    console.log('Bundle compactado:', zipSizeMb, 'MB');

    // 3) Compila ProjecaoICM.exe com ícone oficial da ICM e bundle embutido
    const outExe = path.join(root, 'ProjecaoICM.exe');
    execFileSync(csc, [
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/win32icon:' + icoPath,
        '/resource:' + icoPath + ',app_icon.ico',
        '/resource:' + bundleZip + ',app_bundle.zip',
        '/reference:' + path.join(fwDir, 'System.dll'),
        '/reference:' + path.join(fwDir, 'System.Core.dll'),
        '/reference:' + path.join(fwDir, 'System.Drawing.dll'),
        '/reference:' + path.join(fwDir, 'System.Windows.Forms.dll'),
        '/reference:' + path.join(fwDir, 'System.Web.Extensions.dll'),
        '/reference:' + path.join(fwDir, 'System.IO.Compression.dll'),
        '/reference:' + path.join(fwDir, 'System.IO.Compression.FileSystem.dll'),
        '/out:' + outExe,
        path.join(root, 'desktop', 'ProjecaoICM.cs')
    ], { cwd: root, stdio: 'inherit' });

    const exeSizeMb = (fs.statSync(outExe).size / (1024 * 1024)).toFixed(2);
    console.log('Executavel criado:', outExe, '(' + exeSizeMb + ' MB)');
} finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}
