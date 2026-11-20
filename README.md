# Xepher

A floating robot (the one from aadhil-portfolio) that sits on your screen on Windows and Android. Tap it and it turns into a movie-style hacking machine. It's all fake: nothing touches a network except the update check.

- **Windows**: a transparent always-on-top bubble. Click it to open the hacking console, drag it anywhere. `Ctrl+Shift+X` opens it.
- **Android**: a bubble floating over your other apps. Tap to open the console full screen, drag to move, back button to close.

## The console

Opening it plays a breach sequence, then shows a terminal, a network map (your proxies, the target, and a red trace creeping back towards you), the target's vault (scrambles when encrypted, resolves when decrypted), a memory hex dump, the target's IDS log reacting to what you do, and a traffic graph.

15 buttons run fake attacks with realistic output: CONNECT, DISCONNECT, SCAN (nmap), BRUTEFORCE (hydra), BYPASS (firewall), ESCALATE (root), INJECT (sqlmap), ENCRYPT and DECRYPT (openssl, hashcat), EXFILTRATE, TRACEROUTE, PROXY CHAIN, WIPE LOGS, BOTNET and SELF-DESTRUCT. You can also type them (`help` lists the commands). Some need a live connection first. Stay connected too long, or make too much noise, and the trace reaches you and drops the link; proxies slow it and wiping logs rolls it back.

CFG has beeps, the robot voice ("access granted"), and the GitHub token used for updates.

## One-time setup

1. **Install the apps** from this repo's Releases page:
   - Windows: run `Xepher-Setup-*.exe`. Windows SmartScreen will warn because the app isn't code-signed: click **More info → Run anyway**.
   - Android: download `Xepher.apk` on the phone and open it. Allow "install unknown apps" for your browser when asked. Open Xepher and allow **display over other apps**.
2. For updates: github.com → Settings → Developer settings → Personal access tokens → **Tokens (classic)**, tick `repo`, and paste it into Xepher's CFG.

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
