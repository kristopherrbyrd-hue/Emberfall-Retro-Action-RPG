"""Keep Android version codes increasing in GitHub Actions.

Run after npx cap add android recreates the native project.
"""
import os
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
gradle = root / 'android' / 'app' / 'build.gradle'
if not gradle.exists():
    raise SystemExit('Expected android/app/build.gradle after cap add android')

run_number = int(os.environ.get('GITHUB_RUN_NUMBER', '1'))
if run_number < 1 or run_number >= 2_000_000_000:
    raise SystemExit('Invalid GitHub Actions run number')
version_code = 1000 + run_number
version_name = f'0.3.{run_number}'
source = gradle.read_text()

for setting, value in [('versionCode', str(version_code)),
                       ('versionName', f'"{version_name}"')]:
    source, count = re.subn(
        rf'(?m)^(\s*){setting}\s+(?:\d+|[\'\"]\S+[\'\"])\s*$',
        lambda m: f'{m.group(1)}{setting} {value}', source, count=1)
    if count != 1:
        raise SystemExit(f'Could not locate one Android Gradle {setting} field')

gradle.write_text(source)
print(f'Android update identity: versionCode={version_code}, versionName={version_name}')
