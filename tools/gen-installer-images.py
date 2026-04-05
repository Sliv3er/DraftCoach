"""Generate branded BMP images for NSIS installer (sidebar 164x314, header 150x57)."""
from PIL import Image, ImageDraw, ImageFont
import os, math

ASSETS_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'installer')
ICON_PATH = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icon.png')

BG = (1, 10, 19)
CARD = (30, 35, 40)
GOLD = (200, 155, 60)
GOLD_B = (240, 230, 210)
GOLD_D = (120, 90, 40)
BORDER = (70, 55, 20)
TEAL = (30, 40, 45)
TXT = (240, 230, 210)
DIM = (91, 90, 86)

def corners(d, w, h, c, s=12, t=2, m=8):
    for cx, cy, dx, dy in [
        (m,m,1,0),(m,m,0,1),(w-m,m,-1,0),(w-m,m,0,1),
        (m,h-m,1,0),(m,h-m,0,-1),(w-m,h-m,-1,0),(w-m,h-m,0,-1)]:
        d.line([(cx,cy),(cx+dx*s,cy+dy*s)], fill=c, width=t)

def hexgrid(d, w, h, c, sp=30, r=6):
    for row in range(-1, h//sp+2):
        for col in range(-1, w//sp+2):
            cx = col*sp + (sp//2 if row%2 else 0)
            cy = row*sp
            pts = [(cx+r*math.cos(math.pi/3*i-math.pi/6), cy+r*math.sin(math.pi/3*i-math.pi/6)) for i in range(6)]
            d.polygon(pts, outline=c)

def sidebar(path):
    W, H = 164, 314
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    hexgrid(d, W, H, (15, 22, 30))
    try:
        logo = Image.open(ICON_PATH).convert('RGBA').resize((80,80), Image.LANCZOS)
        img.paste(logo, ((W-80)//2, 40), logo)
    except: pass
    d.line([(20,140),(W-20,140)], fill=GOLD, width=1)
    d.ellipse([(W//2-3,137),(W//2+3,143)], fill=GOLD)
    try:
        fl = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 15)
        fs = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 9)
    except:
        fl = fs = ImageFont.load_default()
    for txt_str, y, col, f in [("DRAFT",155,TXT,fl),("COACH",173,GOLD,fl),("v1.0",195,DIM,fs)]:
        bb = d.textbbox((0,0), txt_str, font=f)
        d.text(((W-(bb[2]-bb[0]))//2, y), txt_str, fill=col, font=f)
    corners(d, W, H, TEAL, 10, 1, 6)
    d.line([(20,H-20),(W-20,H-20)], fill=GOLD_D, width=1)
    bb = d.textbbox((0,0), "AI-POWERED", font=fs)
    d.text(((W-(bb[2]-bb[0]))//2, H-35), "AI-POWERED", fill=DIM, font=fs)
    img.save(path, 'BMP')
    print(f"  sidebar: {path}")

def header(path):
    W, H = 150, 57
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    for y in range(H):
        r = int(BG[0]+(CARD[0]-BG[0])*(y/H)*0.3)
        g = int(BG[1]+(CARD[1]-BG[1])*(y/H)*0.3)
        b = int(BG[2]+(CARD[2]-BG[2])*(y/H)*0.3)
        d.line([(0,y),(W,y)], fill=(r,g,b))
    try:
        logo = Image.open(ICON_PATH).convert('RGBA').resize((32,32), Image.LANCZOS)
        img.paste(logo, (8,(H-32)//2), logo)
    except: pass
    try:
        f = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 11)
        fs = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 8)
    except:
        f = fs = ImageFont.load_default()
    d.text((46,14), "DRAFTCOACH", fill=TXT, font=f)
    d.text((46,30), "Setup Wizard", fill=DIM, font=fs)
    d.line([(0,H-2),(W,H-2)], fill=GOLD_D, width=1)
    d.line([(0,H-1),(W,H-1)], fill=BORDER, width=1)
    corners(d, W, H, TEAL, 6, 1, 4)
    img.save(path, 'BMP')
    print(f"  header:  {path}")

if __name__ == '__main__':
    os.makedirs(ASSETS_DIR, exist_ok=True)
    print("Generating NSIS installer images...")
    sidebar(os.path.join(ASSETS_DIR, 'installer-sidebar.bmp'))
    sidebar(os.path.join(ASSETS_DIR, 'uninstaller-sidebar.bmp'))
    header(os.path.join(ASSETS_DIR, 'installer-header.bmp'))
    header(os.path.join(ASSETS_DIR, 'uninstaller-header.bmp'))
    print("Done!")
