Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Runtime.Serialization;

public static class BlueprintPreview {
  static GraphicsPath Rounded(float x, float y, float w, float h, float r) {
    var p = new GraphicsPath();
    r = Math.Max(1, Math.Min(r, Math.Min(w, h) / 2));
    p.AddArc(x, y, r * 2, r * 2, 180, 90);
    p.AddArc(x + w - r * 2, y, r * 2, r * 2, 270, 90);
    p.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2, 0, 90);
    p.AddArc(x, y + h - r * 2, r * 2, r * 2, 90, 90);
    p.CloseFigure();
    return p;
  }

  static void Line(Graphics g, Color c, float width, float x1, float y1, float x2, float y2) {
    using (var p = new Pen(c, width)) g.DrawLine(p, x1, y1, x2, y2);
  }

  static void DrawScreen(Graphics g, float x, float y, float w, float h) {
    using (var screen = Rounded(x, y, w, h, Math.Min(12, w * .04f)))
    using (var fill = new SolidBrush(Color.FromArgb(8, 8, 8)))
    using (var border = new Pen(Color.FromArgb(230, 230, 230), 1.5f)) {
      g.FillPath(fill, screen);
      g.DrawPath(border, screen);
    }
    var pad = Math.Max(7, w * .035f);
    var headerH = Math.Max(18, h * .105f);
    using (var header = new SolidBrush(Color.FromArgb(18, 18, 18))) g.FillRectangle(header, x + 2, y + 2, w - 4, headerH);
    using (var font = new Font("Consolas", Math.Max(6, Math.Min(10, w * .032f)), FontStyle.Bold))
    using (var brush = new SolidBrush(Color.White)) g.DrawString("Telegram", font, brush, x + pad, y + headerH * .38f);
    for (int i = 0; i < 3; i++) {
      using (var brush = new SolidBrush(i == 0 ? Color.White : Color.FromArgb(105, 105, 105)))
        g.FillEllipse(brush, x + w - pad * (3.6f - i), y + headerH * .42f, 3.5f, 3.5f);
    }

    var contentY = y + headerH + pad * .45f;
    var contentH = h - headerH - pad * 1.2f;
    if (w >= 230) {
      var railW = w * .29f;
      using (var rail = new SolidBrush(Color.FromArgb(14, 14, 14))) g.FillRectangle(rail, x + 2, contentY, railW, contentH);
      Line(g, Color.FromArgb(90, 90, 90), 1, x + railW, contentY, x + railW, contentY + contentH);
      for (int i = 0; i < 5; i++) {
        var rowY = contentY + 8 + i * Math.Max(15, contentH * .145f);
        using (var avatar = new SolidBrush(i == 0 ? Color.White : Color.FromArgb(96, 96, 96)))
          g.FillEllipse(avatar, x + pad, rowY, Math.Max(6, pad * .85f), Math.Max(6, pad * .85f));
        using (var pen = new Pen(Color.FromArgb(i == 0 ? 235 : 100, 235, 235, 235), 2))
          g.DrawLine(pen, x + pad * 2.2f, rowY + 3, x + railW - pad * .7f, rowY + 3);
        using (var pen = new Pen(Color.FromArgb(82, 82, 82), 1.5f))
          g.DrawLine(pen, x + pad * 2.2f, rowY + 8, x + railW - pad * 1.5f, rowY + 8);
      }
      var chatX = x + railW + pad;
      var chatW = w - railW - pad * 2;
      for (int i = 0; i < 5; i++) {
        var bw = chatW * (i % 2 == 0 ? .66f : .52f);
        var bx = i % 2 == 0 ? chatX : x + w - pad - bw;
        var by = contentY + 9 + i * (contentH * .16f);
        using (var bubble = Rounded(bx, by, bw, Math.Max(11, contentH * .115f), 5))
        using (var fill = new SolidBrush(i % 2 == 0 ? Color.FromArgb(38, 38, 38) : Color.FromArgb(225, 225, 225)))
          g.FillPath(fill, bubble);
        using (var pen = new Pen(i % 2 == 0 ? Color.FromArgb(100, 100, 100) : Color.White, 1))
          g.DrawLine(pen, bx + 5, by + 5, bx + Math.Max(8, bw * .65f), by + 5);
      }
      using (var pen = new Pen(Color.FromArgb(130, 130, 130), 1))
        g.DrawLine(pen, chatX, contentY + contentH - 8, x + w - pad * 2, contentY + contentH - 8);
    } else {
      for (int i = 0; i < 6; i++) {
        var rowY = contentY + 6 + i * Math.Max(15, contentH * .14f);
        using (var avatar = new SolidBrush(i == 0 ? Color.White : Color.FromArgb(96, 96, 96)))
          g.FillEllipse(avatar, x + pad, rowY, Math.Max(7, pad), Math.Max(7, pad));
        using (var pen = new Pen(Color.FromArgb(i == 0 ? 235 : 120, 235, 235, 235), 2))
          g.DrawLine(pen, x + pad * 2.5f, rowY + 3, x + w * .62f, rowY + 3);
        using (var pen = new Pen(Color.FromArgb(80, 80, 80), 1.4f))
          g.DrawLine(pen, x + pad * 2.5f, rowY + 8, x + w * .78f, rowY + 8);
      }
      var bubbleY = contentY + contentH - 17;
      using (var bubble = Rounded(x + pad, bubbleY, w - pad * 2, 12, 5))
      using (var fill = new SolidBrush(Color.FromArgb(36, 36, 36))) g.FillPath(fill, bubble);
    }
  }

  static Bitmap Frame(float w, float h, float r, string label, int frameIndex) {
    const int W = 1200, H = 340;
    var bmp = new Bitmap(W, H, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(bmp)) {
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
      g.Clear(Color.Black);
      using (var faint = new Pen(Color.FromArgb(22, 255, 255, 255), 1)) {
        for (int k = -4; k < 16; k++) g.DrawLine(faint, k * 90, 8, k * 90 + 230, 308);
        for (int k = -2; k < 24; k++) g.DrawLine(faint, 0, k * 24, 1200, k * 24 - 132);
      }
      using (var card = Rounded(4, 4, 1192, 332, 16))
      using (var border = new Pen(Color.FromArgb(100, 255, 255, 255), 1.5f)) g.DrawPath(border, card);

      using (var logo = Rounded(64, 49, 38, 42, 11))
      using (var logoPen = new Pen(Color.White, 5)) g.DrawPath(logoPen, logo);
      Line(g, Color.White, 4, 80, 74, 80, 87);
      using (var metaFont = new Font("Consolas", 14, FontStyle.Bold))
      using (var metaBrush = new SolidBrush(Color.FromArgb(205, 205, 205)))
        g.DrawString("SOFTWARE DEVELOPER  |  ADAMA, ETHIOPIA", metaFont, metaBrush, 126, 68);
      using (var nameFont = new Font("Georgia", 58, FontStyle.Bold))
      using (var white = new SolidBrush(Color.White)) g.DrawString("Olani Shambel", nameFont, white, 70, 101);
      using (var roleFont = new Font("Consolas", 19, FontStyle.Bold))
      using (var light = new SolidBrush(Color.FromArgb(230, 230, 230))) g.DrawString("Flutter  |  Web  |  AI", roleFont, light, 70, 190);
      using (var subFont = new Font("Consolas", 13))
      using (var muted = new SolidBrush(Color.FromArgb(166, 166, 166)))
        g.DrawString("BUILDING PRODUCTS FROM INTERFACE TO INFRASTRUCTURE", subFont, muted, 70, 228);

      var scale = .78f;
      w *= scale; h *= scale; r *= scale;
      const float deviceCenterX = 900;
      var x = deviceCenterX - w / 2;
      var y = 30 + (208 - h) / 2;
      using (var outer = Rounded(x, y, w, h, r)) {
        using (var black = new SolidBrush(Color.FromArgb(7, 7, 7))) g.FillPath(black, outer);
        using (var clip = (GraphicsPath)outer.Clone()) {
          g.SetClip(clip);
          using (var hatch = new Pen(Color.FromArgb(48, 255, 255, 255), 1))
            for (float hx = x - h; hx < x + w + h; hx += 12) g.DrawLine(hatch, hx, y + h, hx + h, y);
          g.ResetClip();
        }
        using (var outline = new Pen(Color.FromArgb(245, 245, 245), 2)) g.DrawPath(outline, outer);
      }
      var bezel = Math.Max(12, Math.Min(22, w * .075f));
      if (w > 285) {
        using (var stand = new SolidBrush(Color.FromArgb(135, 135, 135))) {
          var points = new[] { new PointF(deviceCenterX - 18, y + h), new PointF(deviceCenterX + 18, y + h), new PointF(deviceCenterX + 28, y + h + 16), new PointF(deviceCenterX - 28, y + h + 16) };
          g.FillPolygon(stand, points);
          g.FillRectangle(stand, deviceCenterX - 45, y + h + 16, 90, 4);
        }
      }
      DrawScreen(g, x + bezel, y + bezel, w - bezel * 2, h - bezel * 2);
      using (var mono = new Font("Consolas", 11, FontStyle.Bold))
      using (var brush = new SolidBrush(Color.White)) {
        var labelText = "FIG. 1  |  ONE CODEBASE  |  " + label.ToUpperInvariant();
        var size = g.MeasureString(labelText, mono);
        g.DrawString(labelText, mono, brush, deviceCenterX - size.Width / 2, 270);
      }
      using (var strip = new SolidBrush(Color.FromArgb(5, 5, 5))) g.FillRectangle(strip, 0, 310, W, 30);
      using (var hatch = new Pen(Color.FromArgb(72, 255, 255, 255), 1))
        for (int hx = -30; hx < W; hx += 9) g.DrawLine(hatch, hx, 339, hx + 30, 310);
      Line(g, Color.FromArgb(115, 255, 255, 255), 1, 0, 310, W, 310);
      Line(g, Color.FromArgb(115, 255, 255, 255), 1, 0, 339, W, 339);
    }
    return bmp;
  }

  static PropertyItem Property(int id, short type, byte[] value) {
    var item = (PropertyItem)FormatterServices.GetUninitializedObject(typeof(PropertyItem));
    item.Id = id; item.Type = type; item.Len = value.Length; item.Value = value;
    return item;
  }

  public static void Render(string path) {
    var names = new[] { "iOS", "Android", "iPad", "MacBook", "iMac", "Windows" };
    var widths = new[] { 182f, 190f, 292f, 358f, 378f, 364f };
    var heights = new[] { 256f, 260f, 232f, 220f, 218f, 220f };
    var radii = new[] { 34f, 28f, 24f, 20f, 18f, 12f };
    var frames = new System.Collections.Generic.List<Bitmap>();
    for (int state = 0; state < names.Length; state++) {
      int next = (state + 1) % names.Length;
      for (int step = 0; step < 5; step++) {
        float t = step / 5f;
        t = t * t * (3 - 2 * t);
        frames.Add(Frame(widths[state] + (widths[next] - widths[state]) * t,
          heights[state] + (heights[next] - heights[state]) * t,
          radii[state] + (radii[next] - radii[state]) * t, names[state], frames.Count));
      }
    }
    var gif = ImageCodecInfo.GetImageEncoders().First(codec => codec.MimeType == "image/gif");
    var delay = Property(0x5100, 4, Enumerable.Range(0, frames.Count).SelectMany(_ => BitConverter.GetBytes(12)).ToArray());
    var loop = Property(0x5101, 3, BitConverter.GetBytes((short)0));
    frames[0].SetPropertyItem(delay); frames[0].SetPropertyItem(loop);
    using (var parameters = new EncoderParameters(1)) {
      parameters.Param[0] = new EncoderParameter(Encoder.SaveFlag, (long)EncoderValue.MultiFrame);
      frames[0].Save(path, gif, parameters);
      parameters.Param[0] = new EncoderParameter(Encoder.SaveFlag, (long)EncoderValue.FrameDimensionTime);
      for (int i = 1; i < frames.Count; i++) frames[0].SaveAdd(frames[i], parameters);
      parameters.Param[0] = new EncoderParameter(Encoder.SaveFlag, (long)EncoderValue.Flush);
      frames[0].SaveAdd(parameters);
    }
    foreach (var frame in frames) frame.Dispose();
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing.dll, System.Core.dll
  [BlueprintPreview]::Render((Join-Path $PSScriptRoot '..\assets\olani-profile-hero.gif'))
