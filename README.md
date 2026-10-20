# Emberfall — Android APK

This version of Emberfall is independent of Replit. It's the original React + Phaser game, including the
previous image-transparency, movement and character customization updates, packaged using Capacitor 8.
Game assets and local saves work inside Android's embedded WebView. This is a **real installable Android app**,
not a Chrome home-screen shortcut. Rendering still uses the Phaser web engine inside the Android app.

## Fastest way: GitHub builds the APK

1. Extract this ZIP **on a computer** (or upload it into a GitHub Codespace) and add its contents to
   `kristopherrbyrd-hue/Emberfall-Retro-Action-RPG` on branch `main`.
   Include the hidden `.github` folder, not just the visible files.
2. Open the repository **Actions** tab and select **Build Emberfall Android APK**.
3. Select **Run workflow**, branch **main** (or wait for the first push-triggered build).
4. When the green check appears, open the workflow run and download the
   **Emberfall-Android-APK** artifact under **Artifacts**.
5. Unzip that build artifact, copy `app-debug.apk` to your Android phone, and open it to install.
   Android may ask you to approve installation from that file manager/browser.

No Replit account or running server is involved. The APK packages Emberfall's code and graphics.

### Import the ZIP using GitHub Codespaces (without installing desktop tools)

If your GitHub repo is empty, create a `README.md` on GitHub first so the `main` branch exists.
Then choose **Code > Codespaces > Create codespace on main**. Upload this ZIP through the
Codespaces file explorer. In the Codespaces terminal run (adjust the ZIP name if necessary):

```bash
unzip -qo Emberfall-Android-Source.zip -d .
rm Emberfall-Android-Source.zip
git add .
git commit -m "Import Emberfall Android project"
git push origin main
```

After the push, GitHub Actions starts building automatically. Codespaces is only needed once to
import the source; ongoing builds run directly on GitHub Actions.

## Build locally (Windows/Mac/Linux)

Prerequisites: Node.js 22+, Java 21, Android SDK and Android Studio.

```bash
npm install
npm run build
npx cap add android        # first time only
npx cap sync android
python3 scripts/setup_android.py
cd android
./gradlew assembleDebug  # Windows: gradlew.bat assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Development

- `npm run dev` runs the browser version locally.
- `npm run build` bundles the offline game into `dist`.
- `npm run typecheck` checks TypeScript.
- `npm run test` runs the existing game unit tests.
- `npx cap sync android` copies a new game bundle into the native Android project.
- Your in-game save slots use Android WebView's localStorage. **Back up saves before uninstalling the app**.

## Before publishing or regularly updating the app

The workflow generates **debug APKs** for testing. GitHub-hosted runners may sign separate builds with
different debug keys. An updated APK might not install over an earlier debug APK, and uninstalling clears local saves.
For permanent, updateable installs, set up a private Android release keystore and signed release builds.
Never commit signing keys or passwords to a public repository.

## Build status and limitations

- The source was migrated and configured for Android packaging.
- The Android project is generated on the build runner, not checked into this source ZIP.
- This environment doesn't have npm package downloads or the Android SDK, so a native APK could not be
  compiled or gameplay-tested here. The first GitHub Actions build will verify the Android packaging.
- The UI is currently portrait-oriented, matching the handheld game design.
- The game uses a web renderer inside a native Android APK, not a complete rewrite in Kotlin/Unity/Godot.
