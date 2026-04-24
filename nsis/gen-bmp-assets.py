"""
Generate splash screen BMP for DraftCoach silent installer.
A single beautiful branded splash image (520x340) shown during
silent installation — like Discord, Riot Client, Spotify.
"""
from PIL import Image, ImageDraw, ImageFont
import os

BRAND_BG         = (1, 10, 19)
BRAND_CARD       = (30, 35, 40)
BRAND_GOLD       = (200, 155, 60)
BRAND_GOLD_BRIGHT = (240, 230, 210)
BRAND_BORDER     = (70, 55, 20)
BRAND_DIM        = (50, 50, 55)

SPLASH_W, SPLASH_H = 520, 340
PROGRESS_H = 4  # thin progress bar track
PROGRESS_Y = SPLASH_H - 50  # position from top

OUT_DIR = os.path.join(os.path.dirname(__file__), "assets")
ICON_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.png")
os.makedirs(OUT_DIR, exist_ok=True)


def get_font(size):
    for name in ["segoeui.ttf", "arial.ttf", "calibri.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


def get_bold_font(size):
    for name in ["segoeuib.ttf", "arialbd.ttf", "calibrib.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except (IOError, OSError):
            continue
    return get_font(size)


def get_light_font(size):
    for name in ["segoeuil.ttf", "segoeui.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except (IOError, OSError):
            continue
    return get_font(size)


def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def gen_splash():
    img = Image.new("RGB", (SPLASH_W, SPLASH_H), BRAND_BG)
    draw = ImageDraw.Draw(img)

    # ── Subtle radial gradient (lighter center) ──
    cx, cy = SPLASH_W // 2, SPLASH_H // 2 - 30
    max_r = 280
    for y in range(SPLASH_H):
        for x in range(SPLASH_W):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            t = min(dist / max_r, 1.0)
            base = lerp((12, 22, 35), BRAND_BG, t)
            img.putpixel((x, y), base)

    # ── Gold border (1px) ──
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, SPLASH_W - 1, SPLASH_H - 1], outline=BRAND_BORDER)

    # ── DraftCoach icon ──
    icon_size = 88
    try:
        icon = Image.open(ICON_PATH).convert("RGBA")
        icon = icon.resize((icon_size, icon_size), Image.LANCZOS)
        # Composite onto background
        icon_x = (SPLASH_W - icon_size) // 2
        icon_y = 45
        # Get the background color at icon position for compositing
        bg_crop = img.crop((icon_x, icon_y, icon_x + icon_size, icon_y + icon_size))
        bg_crop.paste(icon, mask=icon.split()[3])
        img.paste(bg_crop, (icon_x, icon_y))
    except Exception as e:
        print(f"  [WARN] Could not load icon: {e}")
        # Fallback diamond
        cx_i = SPLASH_W // 2
        cy_i = 89
        r = 35
        draw.polygon([
            (cx_i, cy_i - r), (cx_i + r - 6, cy_i),
            (cx_i, cy_i + r), (cx_i - r + 6, cy_i)
        ], fill=BRAND_GOLD, outline=BRAND_BORDER)

    # ── App Title ──
    font_title = get_bold_font(28)
    title = "DraftCoach"
    bbox = draw.textbbox((0, 0), title, font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((SPLASH_W - tw) // 2, 148), title, fill=BRAND_GOLD_BRIGHT, font=font_title)

    # ── Subtitle ──
    font_sub = get_light_font(13)
    sub = "AI-Powered Build Coach"
    bbox = draw.textbbox((0, 0), sub, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((SPLASH_W - tw) // 2, 185), sub, fill=BRAND_GOLD, font=font_sub)

    # ── "Installing..." text ──
    font_status = get_font(11)
    status = "Installing..."
    bbox = draw.textbbox((0, 0), status, font=font_status)
    tw = bbox[2] - bbox[0]
    draw.text(((SPLASH_W - tw) // 2, 230), status, fill=BRAND_DIM, font=font_status)

    # ── Progress bar track ──
    track_x = 60
    track_w = SPLASH_W - 120
    track_y = PROGRESS_Y
    # Dark track background
    draw.rectangle(
        [track_x, track_y, track_x + track_w, track_y + PROGRESS_H],
        fill=(15, 20, 28)
    )
    # Subtle border
    draw.rectangle(
        [track_x, track_y, track_x + track_w, track_y + PROGRESS_H],
        outline=BRAND_BORDER
    )

    # ── Version (bottom) ──
    font_ver = get_font(9)
    ver = "v1.1.0"
    bbox = draw.textbbox((0, 0), ver, font=font_ver)
    tw = bbox[2] - bbox[0]
    draw.text(((SPLASH_W - tw) // 2, SPLASH_H - 28), ver, fill=BRAND_DIM, font=font_ver)

    # ── Decorative gold particles ──
    import random
    random.seed(42)
    for _ in range(15):
        px = random.randint(30, SPLASH_W - 30)
        py = random.randint(210, 265)
        alpha = random.randint(15, 45)
        dot_color = tuple(int(c * alpha / 100) for c in BRAND_GOLD)
        size = random.choice([1, 1, 2])
        draw.ellipse([px, py, px + size, py + size], fill=dot_color)

    path = os.path.join(OUT_DIR, "splash.bmp")
    img.save(path, "BMP")
    print(f"  [OK] splash.bmp ({SPLASH_W}x{SPLASH_H})")


def gen_header():
    """150x57 header for MUI uninstaller."""
    W, H = 150, 57
    img = Image.new("RGB", (W, H), BRAND_BG)
    draw = ImageDraw.Draw(img)
    draw.line([(0, H - 2), (W, H - 2)], fill=BRAND_GOLD, width=2)
    font = get_bold_font(16)
    text = "DraftCoach"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(((W - tw) // 2, (H - th) // 2 - 4), text, fill=BRAND_GOLD, font=font)
    img.save(os.path.join(OUT_DIR, "header.bmp"), "BMP")
    print(f"  [OK] header.bmp ({W}x{H})")


def gen_sidebar():
    """164x314 sidebar for MUI uninstaller."""
    W, H = 164, 314
    img = Image.new("RGB", (W, H), BRAND_BG)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        color = lerp(BRAND_BG, BRAND_CARD, y / H)
        draw.line([(0, y), (W, y)], fill=color)
    draw.line([(W - 1, 0), (W - 1, H)], fill=BRAND_BORDER, width=2)
    font = get_bold_font(15)
    text = "DraftCoach"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 110), text, fill=BRAND_GOLD_BRIGHT, font=font)
    img.save(os.path.join(OUT_DIR, "sidebar.bmp"), "BMP")
    print(f"  [OK] sidebar.bmp ({W}x{H})")


if __name__ == "__main__":
    print("=" * 50)
    print("  DraftCoach Splash Installer Assets")
    print("=" * 50)
    gen_splash()
    gen_header()
    gen_sidebar()
    print("Done!")
