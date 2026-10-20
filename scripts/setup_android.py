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
# Android 15+ draws edge-to-edge by default. CSS safe-area values can be
# zero in a WebView, so apply real system-bar insets to the native container.
activity = ROOT / 'android' / 'app' / 'src' / 'main' / 'java'
activities = list(activity.rglob('MainActivity.java'))
if len(activities) != 1:
    raise SystemExit(f'Expected one MainActivity.java, found {len(activities)}')
main_activity = activities[0]
package = next(line for line in main_activity.read_text().splitlines()
               if line.startswith('package '))
main_activity.write_text(f'''{package}

import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    protected void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {{
            Insets safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        }});
        ViewCompat.requestApplyInsets(content);
    }}
}}
''')
print('Android safe-area insets, portrait mode and launcher icon configured.')
