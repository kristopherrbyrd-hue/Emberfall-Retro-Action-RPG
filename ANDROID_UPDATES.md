# Emberfall: permanent APK updates and saved games

An in-place APK update keeps Android app data (including the game's localStorage save slots) when all of the following stay true:

1. Every APK uses exactly the same application ID: `com.kristopherrbyrd.emberfall`.
2. Every APK is signed with the same permanent release signing key.
3. The next APK has a higher Android `versionCode`.
4. The game continues reading/migrating older save formats instead of replacing or renaming `SAVE_SLOT_KEYS`.

The Android workflow increments versionCode using the GitHub Actions run number. It makes a clear distinction between a **TEST** debug APK and a permanently signed **Update** APK.

## One-time signing setup

1. Generate a release keystore in a secure location, keeping private backups of the keystore and password. Use alias `emberfall`; set the keystore and key passwords to the same password. **Never commit a keystore, passwords, or base64-encoded keys to the public repository.**
2. In GitHub repository **Settings → Secrets and variables → Actions**, add two repository secrets:
   - `EMBERFALL_RELEASE_KEYSTORE`: the base64-encoded full contents of your .jks file, as one line.
   - `EMBERFALL_RELEASE_PASSWORD`: the keystore/key password.
3. Trigger the **Build Emberfall Android APK** workflow again. With both secrets present the artifact is `Emberfall-InPlace-Update-APK`. Without both it is `Emberfall-TEST-APK`.
4. **Uninstall the old debug-signed installation once** before installing the first permanently signed APK. Android cannot replace the debug-signed build with one signed by another key.
5. Keep secure backups of the keystore and password indefinitely. Losing the signing key may make future direct updates of this installation impossible.

After the initial signed installation, do not change the app ID or Capacitor local hostname/origin. Maintain backwards-compatible save loading and add migration tests when expanding `SavedRun.version`. Because local-only saves can still be lost due to device failure or uninstall, implement exportable save backups before players' progress becomes valuable.

**Status:** Workflow signing support is prepared. A repository owner must still configure the two GitHub Actions secrets: the connected assistant cannot manage those secrets.