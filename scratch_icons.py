import os
from PIL import Image

src = r"C:\Users\QuocB\.gemini\antigravity\brain\4d3bbdee-de0d-4897-bb2f-e66684b37264\hemavision_app_icon_1778682296159.png"
dst_dir = r"c:\xampp\htdocs\HEMA_AI\frontend-next\public\icons"

os.makedirs(dst_dir, exist_ok=True)

img = Image.open(src)
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(dst_dir, "icon-192x192.png"))

img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(dst_dir, "icon-512x512.png"))

# Tạo apple-icon
img_180 = img.resize((180, 180), Image.Resampling.LANCZOS)
img_180.save(r"c:\xampp\htdocs\HEMA_AI\frontend-next\src\app\apple-icon.png")

print("Icons generated successfully!")
