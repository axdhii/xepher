# Xepher

A floating robot (the one from aadhil-portfolio) that sits on your screen on Windows and Android and drives Claude Code with your Claude subscription. No API key.

- **Windows**: a transparent always-on-top bubble. Click it to open the panel, drag it anywhere. `Ctrl+Shift+X` opens it and starts listening.
- **Android**: a bubble floating over your other apps. Tap to open, drag to move, back button to close.
- **Voice**: the mic button. Windows uses Windows voice typing (the same as `Win+H`), Android uses the phone's speech recognition. Replies are read out loud (turn it off in settings).
- **Face**: thinking while Claude works, talking while it answers, sleepy when nothing is happening, a happy face when it's done, a head shake when something fails.

## What you can say or type

| Say | What happens |
| --- | --- |
| "create project weather app" | Makes a private GitHub repo `weather-app` and switches to it |
| "add existing repo kastay" | Brings one of your repos into Xepher |
| "open kastay" / "switch to kastay" | Switches project |
| "show my projects" | Opens the project list |
| "set link to https://claude.ai/project/..." | Saves a claude.ai project link for the current project |
| "open claude" | Opens that link (a floating window on Windows, the Claude app on Android) |
| anything else | Sent to Claude Code as a task on the current project |

Projects are your GitHub repos with the `xepher` topic, so Windows and Android always show the same list.

## Where commands run

- **On the laptop** (Windows, when Claude Code is installed and "Run commands on this laptop" is on): Xepher clones the project into `%USERPROFILE%\Xepher\<name>`, pulls, runs `claude -p` there with live status, then commits and pushes. The conversation continues between commands (`--resume`).
- **In the cloud** (Android always; Windows when the laptop option is off): Xepher starts the `Xepher run` workflow in this repo. GitHub Actions runs Claude Code with your subscription token on the project, commits and pushes. Works with the laptop off. Live status and the reply come back through a comment on the "Xepher log" issue in this repo, which Xepher reads.

Either way the change ends up on GitHub.

## One-time setup

1. **GitHub token.** github.com → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate. Tick `repo` and `workflow`. Copy it.
2. **Claude token.** On the laptop run `claude setup-token` and copy the token it prints (it uses your subscription).
3. **Secrets on this repo.** This repo → Settings → Secrets and variables → Actions → New repository secret:
   - `CLAUDE_CODE_OAUTH_TOKEN` = the Claude token
   - `XEPHER_GH_TOKEN` = the GitHub token
4. **Install the apps** from this repo's Releases page (built automatically on every push):
   - Windows: run `Xepher-Setup-*.exe`. Windows SmartScreen will warn because the app isn't code-signed: click **More info → Run anyway**.
   - Android: download `Xepher.apk` on the phone and open it. Allow "install unknown apps" for your browser when asked. Open Xepher, allow **display over other apps** and the **microphone**.
5. In Xepher, open settings (⚙), paste the GitHub token. The cloud runner repo fills itself in as `<you>/xepher`.
6. Windows only, optional: "Show my terminal Claude sessions too" adds hooks to `~/.claude/settings.json` so the robot also reacts while you use Claude Code in a terminal. A backup is saved next to it as `settings.json.before-xepher`.

## Updates

Every push to `main` builds a new release, and the installed apps pick it up on their own (they check at start and every 6 hours, using your GitHub token because the repo is private):

- **Windows** downloads it in the background, shows "Restart to update", and installs it on restart (or next time you quit).
- **Android** shows "Xepher x is out → Update", downloads it, and Android asks you to confirm the install. The first time, Android also asks you to allow Xepher to install apps. The bubble comes back by itself after the update.

## Developing

```
npm install
npm run dev        # the UI in a browser
npm test           # parser, GitHub comment format, hooks merge, Claude output parsing
npm run desktop    # the Windows app (needs Electron)
gradle -p android assembleRelease   # the APK (needs the Android SDK)
```

`web/` is the UI (React Three Fiber, single-file build), `desktop/` the Electron app and the local Claude runner, `android/` the overlay app, `cloud/` the script the Actions workflow runs.

## Known limits

- Cloud commands take about a minute to start (GitHub spins up a runner) and use Actions minutes (2,000 free a month on private repos).
- The Android APK is signed with a key kept in this repo. Fine for a private personal app; don't share the repo publicly without moving it to a secret.
- The GitHub token is kept in the app's private storage on each device, not in an OS keychain.
- Signing in to claude.ai with Google may be blocked inside the Windows floating window; email sign-in works.
