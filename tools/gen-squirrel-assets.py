import os
from PIL import Image, ImageDraw, ImageFont, ImageSequence

BASE_DIR = r"C:\Users\n3tgg\.openclaw2\workspace\DraftCoach\assets"
PNG_PATH = os.path.join(BASE_DIR, "icon.png")
ICO_PATH = os.path.join(BASE_DIR, "icon.ico")
GIF_PATH = os.path.join(BASE_DIR, "splash.gif")
BG_COLOR = (1, 10, 19) # #010A13 Navy

# 1. Generate multi-resolution ICO
print("Generating icon.ico...")
img = Image.open(PNG_PATH).convert("RGBA")
icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save(ICO_PATH, format="ICO", sizes=icon_sizes)
print("Finished saving icon.ico")

# 2. Generate animated GIF splash screen (1-second pulse or simple loading effect)
print("Generating splash.gif...")
# Splash screen dimensions (typically around 600x400 or just square for discord-like)
W, H = 300, 300
frames = []
logo_size = 150

# Pre-resize logo to keep anti-aliasing high quality
logo = img.resize((logo_size, logo_size), Image.LANCZOS)
x_off = (W - logo_size) // 2
y_off = (H - logo_size) // 2 - 20 # shift up slightly

# Create a fading in pulse animation
num_frames = 30
for i in range(num_frames):
    frame = Image.new("RGBA", (W, H), BG_COLOR + (255,))
    d = ImageDraw.Draw(frame)
    # Paste logo
    frame.paste(logo, (x_off, y_off), logo)
    
    # Draw loading bar
    alpha = int(255 * (i / num_frames))
    bar_w = 200
    bar_h = 4
    bx = (W - bar_w) // 2
    by = H - 40
    
    # Background bar
    d.rectangle([bx, by, bx+bar_w, by+bar_h], fill=(30, 40, 45, 255))
    # Glowing progress bar
    progress_w = int(bar_w * (i / num_frames))
    if progress_w > 0:
        d.rectangle([bx, by, bx+progress_w, by+bar_h], fill=(200, 155, 60, 255)) # Gold
    
    # text
    try:
        f = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 12)
    except:
        f = ImageFont.load_default()
        
    text = "Installing DraftCoach..."
    bb = d.textbbox((0,0), text, font=f)
    tw = bb[2] - bb[0]
    d.text(((W - tw) // 2, by - 20), text, fill=(240, 230, 210, alpha), font=f)

    # Convert to P mode for GIF
    frame_p = frame.convert('P', palette=Image.ADAPTIVE, colors=256)
    frames.append(frame_p)

frames[0].save(
    GIF_PATH,
    save_all=True,
    append_images=frames[1:],
    optimize=False,
    duration=33, # ~30fps
    loop=0
)
print("Finished saving splash.gif")
