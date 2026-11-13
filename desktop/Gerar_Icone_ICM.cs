// =====================================================================
// Gerador do Ícone Oficial do Projeção ICM (PNG + ICO Multi-Resolução)
// Usa diretamente a fonte vetorial oficial da Igreja Cristã Maranata (fontes/icm.ttf)
// =====================================================================
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;

class GerarIconeIcm
{
    static void Main(string[] args)
    {
        string baseDir = Directory.GetCurrentDirectory();
        string fontPath = Path.Combine(baseDir, "fontes", "icm.ttf");
        if (!File.Exists(fontPath))
            throw new FileNotFoundException("Fonte oficial não encontrada: " + fontPath);

        string outIco = args.Length > 0 ? args[0] : Path.Combine(baseDir, "imagens", "ProjecaoICM.ico");
        string previewDir = args.Length > 1 ? args[1] : null;

        string outIcoDir = Path.GetDirectoryName(Path.GetFullPath(outIco));
        if (!string.IsNullOrEmpty(outIcoDir) && !Directory.Exists(outIcoDir))
            Directory.CreateDirectory(outIcoDir);

        PrivateFontCollection pfc = new PrivateFontCollection();
        pfc.AddFontFile(fontPath);
        FontFamily icmFamily = pfc.Families[0];

        // Renderiza glifo oficial \uE900 (logo_vinho_bold) em canvas de alta resolução para recorte exato
        int rawSize = 1024;
        Bitmap rawBmp = new Bitmap(rawSize, rawSize, PixelFormat.Format32bppArgb);
        using (Graphics rg = Graphics.FromImage(rawBmp))
        {
            rg.Clear(Color.Transparent);
            rg.SmoothingMode = SmoothingMode.HighQuality;
            rg.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            using (Font f = new Font(icmFamily, 640f, FontStyle.Regular, GraphicsUnit.Pixel))
            using (Brush wb = new SolidBrush(Color.White))
            {
                StringFormat sf = new StringFormat();
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;
                rg.DrawString("\uE900", f, wb, new RectangleF(0, 0, rawSize, rawSize), sf);
            }
        }

        int minX = rawSize, minY = rawSize, maxX = -1, maxY = -1;
        for (int y = 0; y < rawSize; y++)
        {
            for (int x = 0; x < rawSize; x++)
            {
                if (rawBmp.GetPixel(x, y).A > 8)
                {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < minX || maxY < minY)
            throw new Exception("Falha ao renderizar o glifo \\uE900 de fontes/icm.ttf.");

        Rectangle tightRect = new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
        Bitmap master = RenderMasterBadge(512, rawBmp, tightRect);

        int[] sizes = new int[] { 256, 128, 64, 48, 32, 16 };
        SaveMultiSizeIco(master, sizes, outIco);
        Console.WriteLine("Icone gerado com sucesso: " + outIco);

        if (!string.IsNullOrEmpty(previewDir))
        {
            if (!Directory.Exists(previewDir)) Directory.CreateDirectory(previewDir);
            ResizeSquare(master, 256).Save(Path.Combine(previewDir, "icon_final_256.png"), ImageFormat.Png);
            ResizeSquare(master, 48).Save(Path.Combine(previewDir, "icon_final_48.png"), ImageFormat.Png);
        }
    }

    static Bitmap ResizeSquare(Bitmap src, int size)
    {
        Bitmap resized = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(resized))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            g.DrawImage(src, new Rectangle(0, 0, size, size), new Rectangle(0, 0, src.Width, src.Height), GraphicsUnit.Pixel);
        }
        return resized;
    }

    static GraphicsPath RoundedRect(RectangleF bounds, float radius)
    {
        float d = radius * 2f;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static Bitmap RenderMasterBadge(int size, Bitmap rawGlyph, Rectangle tightRect)
    {
        Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.Clear(Color.Transparent);
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            float pad = size * 0.035f;
            RectangleF cardRect = new RectangleF(pad, pad, size - 2 * pad, size - 2 * pad);
            float radius = size * 0.21f;

            using (GraphicsPath clipPath = RoundedRect(cardRect, radius))
            {
                g.SetClip(clipPath);

                using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                    cardRect,
                    Color.FromArgb(255, 10, 26, 62),
                    Color.FromArgb(255, 22, 62, 138),
                    42f))
                {
                    ColorBlend cb = new ColorBlend();
                    cb.Colors = new Color[] {
                        Color.FromArgb(255, 8, 20, 48),
                        Color.FromArgb(255, 20, 56, 128),
                        Color.FromArgb(255, 11, 28, 66)
                    };
                    cb.Positions = new float[] { 0f, 0.55f, 1f };
                    bgBrush.InterpolationColors = cb;
                    g.FillRectangle(bgBrush, cardRect);
                }

                // Ondas azuis inspiradas no papel de parede oficial da projeção (imagens/fundo.jpg)
                using (GraphicsPath wave1 = new GraphicsPath())
                {
                    wave1.AddBezier(
                        new PointF(cardRect.Left, cardRect.Bottom * 0.72f),
                        new PointF(size * 0.35f, size * 0.52f),
                        new PointF(size * 0.65f, size * 0.85f),
                        new PointF(cardRect.Right, size * 0.44f));
                    wave1.AddLine(cardRect.Right, cardRect.Bottom, cardRect.Left, cardRect.Bottom);
                    wave1.CloseFigure();
                    using (SolidBrush wb1 = new SolidBrush(Color.FromArgb(40, 96, 165, 250)))
                        g.FillPath(wb1, wave1);
                }

                using (GraphicsPath wave2 = new GraphicsPath())
                {
                    wave2.AddBezier(
                        new PointF(cardRect.Left, size * 0.28f),
                        new PointF(size * 0.32f, size * 0.14f),
                        new PointF(size * 0.72f, size * 0.38f),
                        new PointF(cardRect.Right, size * 0.16f));
                    wave2.AddLine(cardRect.Right, cardRect.Top, cardRect.Left, cardRect.Top);
                    wave2.CloseFigure();
                    using (SolidBrush wb2 = new SolidBrush(Color.FromArgb(24, 255, 255, 255)))
                        g.FillPath(wb2, wave2);
                }

                g.ResetClip();

                float borderW = size * 0.022f;
                RectangleF borderRect = new RectangleF(
                    cardRect.X + borderW * 0.5f,
                    cardRect.Y + borderW * 0.5f,
                    cardRect.Width - borderW,
                    cardRect.Height - borderW);
                using (GraphicsPath borderPath = RoundedRect(borderRect, radius - borderW * 0.4f))
                using (LinearGradientBrush goldBrush = new LinearGradientBrush(
                    borderRect,
                    Color.FromArgb(255, 252, 211, 77),
                    Color.FromArgb(255, 217, 119, 6),
                    45f))
                using (Pen goldPen = new Pen(goldBrush, borderW))
                {
                    g.DrawPath(goldPen, borderPath);
                }
            }

            float maxLogoW = size * 0.80f;
            float maxLogoH = size * 0.68f;
            float scale = Math.Min(maxLogoW / tightRect.Width, maxLogoH / tightRect.Height);
            float drawW = tightRect.Width * scale;
            float drawH = tightRect.Height * scale;
            float drawX = (size - drawW) * 0.5f;
            float drawY = (size - drawH) * 0.50f;

            RectangleF shadowDest = new RectangleF(drawX, drawY + size * 0.012f, drawW, drawH);
            ColorMatrix shadowCm = new ColorMatrix(new float[][] {
                new float[] {0, 0, 0, 0, 0},
                new float[] {0, 0, 0, 0, 0},
                new float[] {0, 0, 0, 0, 0},
                new float[] {0, 0, 0, 0.52f, 0},
                new float[] {0, 0, 0, 0, 1}
            });
            using (ImageAttributes shadowAttr = new ImageAttributes())
            {
                shadowAttr.SetColorMatrix(shadowCm);
                g.DrawImage(rawGlyph, new PointF[] {
                    new PointF(shadowDest.Left, shadowDest.Top),
                    new PointF(shadowDest.Right, shadowDest.Top),
                    new PointF(shadowDest.Left, shadowDest.Bottom)
                }, tightRect, GraphicsUnit.Pixel, shadowAttr);
            }

            g.DrawImage(rawGlyph, new RectangleF(drawX, drawY, drawW, drawH), tightRect, GraphicsUnit.Pixel);
        }
        return bmp;
    }

    static void SaveMultiSizeIco(Bitmap master, int[] sizes, string outIco)
    {
        // Tamanhos <= 128 usam DIB BMP 32-bit padrão Win32 (totalmente compatível com bandeja/NotifyIcon e Explorer)
        // Tamanho >= 256 usa PNG comprimido (padrão Vista/Windows 10/11)
        byte[][] entryBlobs = new byte[sizes.Length][];
        for (int i = 0; i < sizes.Length; i++)
        {
            int s = sizes[i];
            using (Bitmap resized = ResizeSquare(master, s))
            using (MemoryStream ms = new MemoryStream())
            {
                if (s >= 256)
                {
                    resized.Save(ms, ImageFormat.Png);
                }
                else
                {
                    WriteIconDibEntry(ms, resized);
                }
                entryBlobs[i] = ms.ToArray();
            }
        }

        using (FileStream fs = new FileStream(outIco, FileMode.Create, FileAccess.Write))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)sizes.Length);

            int offset = 6 + (sizes.Length * 16);
            for (int i = 0; i < sizes.Length; i++)
            {
                byte dim = (byte)(sizes[i] >= 256 ? 0 : sizes[i]);
                bw.Write(dim);
                bw.Write(dim);
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)entryBlobs[i].Length);
                bw.Write((uint)offset);
                offset += entryBlobs[i].Length;
            }
            for (int i = 0; i < sizes.Length; i++)
            {
                bw.Write(entryBlobs[i]);
            }
        }
    }

    static void WriteIconDibEntry(Stream dest, Bitmap bmp)
    {
        int w = bmp.Width;
        int h = bmp.Height;
        int andStride = ((w + 31) / 32) * 4;
        BinaryWriter bw = new BinaryWriter(dest);

        // BITMAPINFOHEADER (40 bytes)
        bw.Write((uint)40);          // biSize
        bw.Write((int)w);            // biWidth
        bw.Write((int)(h * 2));      // biHeight (XOR + AND)
        bw.Write((ushort)1);         // biPlanes
        bw.Write((ushort)32);        // biBitCount (BGRA)
        bw.Write((uint)0);           // biCompression (BI_RGB)
        bw.Write((uint)(w * h * 4)); // biSizeImage
        bw.Write((int)0);            // biXPelsPerMeter
        bw.Write((int)0);            // biYPelsPerMeter
        bw.Write((uint)0);           // biClrUsed
        bw.Write((uint)0);           // biClrImportant

        // XOR bitmap (linhas de baixo para cima em BGRA)
        for (int y = h - 1; y >= 0; y--)
        {
            for (int x = 0; x < w; x++)
            {
                Color c = bmp.GetPixel(x, y);
                bw.Write(c.B);
                bw.Write(c.G);
                bw.Write(c.R);
                bw.Write(c.A);
            }
        }

        // AND mask 1-bpp (linhas de baixo para cima, padding de 4 bytes)
        byte[] andRow = new byte[andStride];
        for (int y = h - 1; y >= 0; y--)
        {
            Array.Clear(andRow, 0, andStride);
            for (int x = 0; x < w; x++)
            {
                if (bmp.GetPixel(x, y).A == 0)
                {
                    andRow[x >> 3] |= (byte)(0x80 >> (x & 7));
                }
            }
            bw.Write(andRow);
        }
        bw.Flush();
    }
}
