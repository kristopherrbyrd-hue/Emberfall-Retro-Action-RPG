"""Brand a freshly generated Capacitor Android project (standard library only)."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / 'android' / 'app' / 'src' / 'main'
manifest = ANDROID / 'AndroidManifest.xml'
if not manifest.exists():
    raise SystemExit('Android is missing: first run npx cap add android')
text = manifest.read_text()
if 'android:screenOrientation=' not in text:
    text = text.replace('<activity', '<activity android:screenOrientation="portrait"', 1)
manifest.write_text(text)

icons = ROOT / 'scripts' / 'android-icons'
for mipmap in icons.glob('mipmap-*'):
    dest = ANDROID / 'res' / mipmap.name
    dest.mkdir(parents=True, exist_ok=True)
    for icon in mipmap.glob('*.png'):
        shutil.copy2(icon, dest / icon.name)

values = ANDROID / 'res' / 'values'
values.mkdir(parents=True, exist_ok=True)
(values / 'emberfall_colors.xml').write_text('<resources><color name="emberfall_icon_background">#080807</color></resources>')
for f in (ANDROID / 'res' / 'mipmap-anydpi-v26').glob('ic_launcher*.xml'):
    f.write_text(f.read_text().replace('@color/ic_launcher_background','@color/emberfall_icon_background'))
print('Android portrait mode and Emberfall launcher icon configured.')
