"""Generates Play Store graphics + the Android splash for EdgeFolio by Jenix.

Usage:  python make_assets.py <raw_screens_dir>
Outputs into this folder: icon-512.png, feature-graphic-1024x500.png, screenshots/*.png
and rewrites APK/mobile/android/app/src/main/res/drawable*/splash.png (dark 2026 theme).
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.join(HERE, '..', 'mobile')
LOGO = Image.open(os.path.join(MOBILE, 'resources', 'icon.png')).convert('RGBA')
BG = (7, 8, 13)
FONT_B = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_SB = 'C:/Windows/Fonts/seguisb.ttf'
FONT_R = 'C:/Windows/Fonts/segoeui.ttf'


def font(path, size):
    return ImageFont.truetype(path, size)


def aurora(w, h, strength=1.0):
    """Near-black canvas with blurred violet / indigo / cyan glows (matches the app)."""
    base = Image.new('RGB', (w, h), BG)
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    m = max(w, h)
    for (cx, cy, r, col) in [
        (0.05 * w, 0.0 * h, 0.55 * m, (124, 58, 237)),
        (0.95 * w, 0.08 * h, 0.45 * m, (79, 70, 229)),
        (0.85 * w, 1.0 * h, 0.5 * m, (6, 182, 212)),
    ]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=tuple(int(c * 0.30 * strength) for c in col))
    glow = glow.filter(ImageFilter.GaussianBlur(m * 0.16))
    return _add(base, glow)


def _add(a, b):
    from PIL import ImageChops
    return ImageChops.add(a, b)


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def logo_tile(size, glow=True):
    """White rounded tile with the EdgeFolio logo, plus a soft brand glow behind it."""
    pad = int(size * 0.35) if glow else 0
    out = Image.new('RGBA', (size + 2 * pad, size + 2 * pad), (0, 0, 0, 0))
    if glow:
        g = Image.new('RGBA', out.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).rounded_rectangle([pad, pad, pad + size, pad + size], radius=int(size * 0.24),
                                            fill=(110, 90, 245, 170))
        out = Image.alpha_composite(out, g.filter(ImageFilter.GaussianBlur(size * 0.14)))
    tile = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    lg = LOGO.resize((int(size * 0.80), int(size * 0.80)), Image.LANCZOS)
    tile.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    out.paste(tile, (pad, pad), rounded_mask((size, size), int(size * 0.24)))
    return out


def gradient_text(img, xy, text, fnt):
    """Draws text filled with the indigo→violet→cyan brand gradient."""
    d = ImageDraw.Draw(img)
    bbox = d.textbbox(xy, text, font=fnt)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    grad = Image.new('RGB', (w, 1))
    stops = [(99, 102, 241), (139, 92, 246), (34, 211, 238)]
    for x in range(w):
        t = x / max(1, w - 1) * 2
        a, b = (stops[0], stops[1]) if t < 1 else (stops[1], stops[2])
        f = t if t < 1 else t - 1
        grad.putpixel((x, 0), tuple(int(a[i] + (b[i] - a[i]) * f) for i in range(3)))
    grad = grad.resize((w, h))
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255)
    layer = Image.new('RGB', img.size)
    layer.paste(grad, (bbox[0], bbox[1]))
    img.paste(layer, (0, 0), mask)


# ---------- 512 icon (Play: 512x512, 32-bit PNG, full square — Play applies the mask) ----------
def make_icon():
    icon = Image.new('RGBA', (512, 512), (255, 255, 255, 255))
    lg = LOGO.resize((430, 430), Image.LANCZOS)
    icon.alpha_composite(lg, (41, 41))
    icon.save(os.path.join(HERE, 'icon-512.png'))


# ---------- feature graphic 1024x500 ----------
def make_feature():
    img = aurora(1024, 500, 1.3).convert('RGBA')
    t = logo_tile(220)
    img.alpha_composite(t, (70 - 77, 140 - 77))
    d = ImageDraw.Draw(img)
    d.text((340, 120), 'EdgeFolio', font=font(FONT_B, 92), fill=(244, 245, 251))
    gradient_text(img, (346, 232), 'by Jenix', font(FONT_SB, 40))
    d.text((346, 300), 'Attendance  •  Access Control  •  Payroll  •  HR', font=font(FONT_SB, 27), fill=(200, 204, 222))
    d.text((346, 345), 'Phone check-in with location, works with any face machine', font=font(FONT_R, 22), fill=(154, 160, 184))
    img.convert('RGB').save(os.path.join(HERE, 'feature-graphic-1024x500.png'))


# ---------- screenshots 1080x1920 (9:16) with caption ----------
SHOTS = [
    ('home', 'Check in from your phone', 'Live status, hours and leave at a glance'),
    ('company', 'Your company in one place', 'Share the code, invite staff, export attendance'),
    ('feed', 'See who is in today', 'Present, on tour, WFH and absent — live'),
    ('employees', 'Manage your team', 'Roles for owner, HR and employees'),
]


def mask_private(img, name):
    """Hides the real licence key and owner e-mail on the Company screen."""
    if name != 'company':
        return img
    d = ImageDraw.Draw(img)
    f = font(FONT_SB, 40)
    # y = vertical centre of the value line on a 1080x2400 capture (measured from the raw screen)
    for y, text in [(1087, 'EF-XXXX-XXXX-XXXX-XXXX'), (1281, 'owner@yourcompany.com (Sign in with Google)')]:
        col = img.getpixel((80, y))
        d.rectangle([95, y - 30, 860 if 'EF' in text else 1000, y + 30], fill=col)
        d.text((102, y - 26), text, font=f, fill=(244, 245, 251))
    return img


def make_screens(raw):
    out = os.path.join(HERE, 'screenshots')
    os.makedirs(out, exist_ok=True)
    for i, (name, title, sub) in enumerate(SHOTS, 1):
        shot = mask_private(Image.open(os.path.join(raw, name + '.png')).convert('RGB'), name)
        shot = shot.crop((0, 0, shot.width, shot.height - 140))  # drop the system nav bar
        canvas = aurora(1080, 1920, 1.4).convert('RGBA')
        d = ImageDraw.Draw(canvas)
        tf = font(FONT_B, 66)
        tw = d.textlength(title, font=tf)
        d.text(((1080 - tw) / 2, 90), title, font=tf, fill=(244, 245, 251))
        sf = font(FONT_R, 36)
        sw = d.textlength(sub, font=sf)
        d.text(((1080 - sw) / 2, 185), sub, font=sf, fill=(154, 160, 184))
        h = 1600
        w = int(shot.width * h / shot.height)
        s = shot.resize((w, h), Image.LANCZOS).convert('RGBA')
        x, y = (1080 - w) // 2, 290
        frame = Image.new('RGBA', (w + 16, h + 16), (0, 0, 0, 0))
        ImageDraw.Draw(frame).rounded_rectangle([0, 0, w + 15, h + 15], radius=64, fill=(40, 42, 58, 255))
        canvas.alpha_composite(frame, (x - 8, y - 8))
        canvas.paste(s, (x, y), rounded_mask((w, h), 56))
        canvas.convert('RGB').save(os.path.join(out, f'{i:02d}-{name}.png'))


# ---------- splash (Capacitor drawable*/splash.png, centre-cropped per density) ----------
def make_splash():
    sq = aurora(2732, 2732, 1.2).convert('RGBA')
    t = logo_tile(560)
    sq.alpha_composite(t, ((2732 - t.width) // 2, (2732 - t.height) // 2 - 120))
    d = ImageDraw.Draw(sq)
    f = font(FONT_B, 150)
    tw = d.textlength('EdgeFolio', font=f)
    d.text(((2732 - tw) / 2, 1366 + 260), 'EdgeFolio', font=f, fill=(244, 245, 251))
    f2 = font(FONT_SB, 72)
    tw2 = d.textlength('by Jenix', font=f2)
    gradient_text(sq, (int((2732 - tw2) / 2), 1366 + 450), 'by Jenix', f2)
    sq = sq.convert('RGB')
    sq.save(os.path.join(HERE, 'splash-2732.png'))
    res = os.path.join(MOBILE, 'android', 'app', 'src', 'main', 'res')
    for p in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):
        w, h = Image.open(p).size
        s = max(w, h) / 2732 * 1.0
        # scale so the shorter side keeps the logo comfortably inside, then centre-crop
        scale = max(w, h) / 2732
        big = sq.resize((int(2732 * scale), int(2732 * scale)), Image.LANCZOS)
        l, tp = (big.width - w) // 2, (big.height - h) // 2
        big.crop((l, tp, l + w, tp + h)).save(p)


if __name__ == '__main__':
    make_icon()
    make_feature()
    make_splash()
    if len(sys.argv) > 1:
        make_screens(sys.argv[1])
    print('done')
