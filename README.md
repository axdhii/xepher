# Xepher

A floating robot (the one from aadhil-portfolio) that sits on your screen on Windows and Android. Tap it and it turns into a movie-style hacking machine. It's all fake: nothing touches a network except the update check.

- **Windows**: a transparent always-on-top bubble. Click it to open the hacking console, drag it anywhere. `Ctrl+Shift+X` opens it.
- **Android**: a bubble floating over your other apps. Tap to open the console full screen, drag to move, back button to close.

## The console

A dark ops console for a simulated engagement against "Helix Dynamics", an invented company. Every tool, host, finding and record is made up.

- **Screens** (tabs): OPS (network topology, the defenders' alert feed, egress graph), RECON (host table, tap to target), PCAP (live packet capture), CRACK (GPU status board and recovered records), SESSIONS (open sessions and pulled files), CRYPTO (vault, key material, memory).
- **20 actions** in five groups: RECON (sweep, probe, audit, DNS map), ACCESS (breach, spray, tunnel), POST (elevate, harvest, pivot, exfil, anchor), CRYPTO (crack, encrypt, decrypt, keygen), OPSEC (relay+, scrub, drop, killswitch). They chain: probe and audit a host before breaching it, elevate before harvesting, pivot to reach deeper zones. You can also type them (`help`, `target <host>`, `clear`).
- **Detection** rises while sessions are open. At 100% the defenders cut every session. Relays slow it and scrubbing rolls it back.

CFG holds an optional GitHub token for updates; release builds already include one.

## One-time setup

1. **Install the apps** from this repo's Releases page:
   - Windows: run `Xepher-Setup-*.exe`. Windows SmartScreen will warn because the app isn't code-signed: click **More info → Run anyway**.
   - Android: download `Xepher.apk` on the phone and open it. Allow "install unknown apps" for your browser when asked. Open Xepher and allow **display over other apps**.
2. Updates work out of the box: release builds carry a read token from the `XEPHER_UPDATE_TOKEN` (or `XEPHER_GH_TOKEN`) repo secret.

## Updates

Every push to `main` builds a new release, and the installed apps pick it up on their own (they check at start and every 6 hours, using your GitHub token because the repo is private):

- **Windows** downloads it in the background, shows "Restart to update", and installs it on restart (or next time you quit).
- **Android** shows "Xepher x is out → Update", downloads it, and Android asks you to confirm the install. The first time, Android also asks you to allow Xepher to install apps. The bubble comes back by itself after the update.

## Developing

```
npm install
npm run dev        # the UI in a browser
npm test           # the fake attack scripts
npm run desktop    # the Windows app (needs Electron)
gradle -p android assembleRelease   # the APK (needs the Android SDK)
```

`web/` is the UI (React Three Fiber, single-file build; the console is in `web/src/hack/`), `desktop/` the Electron app, `android/` the overlay app.

## Known limits

- The Android APK is signed with a key kept in this repo. Fine for a private personal app; don't share the repo publicly without moving it to a secret.
- The GitHub token is kept in the app's private storage on each device, not in an OS keychain.
