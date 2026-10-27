// What the UI needs from the device it runs on. The Windows app (desktop/preload.cjs)
// and the Android app (XepherBridge.java) each provide their half; a plain
// browser gets a fallback so the UI can be developed with `npm run dev`.

export type LocalEvent =
  | { type: "status"; text: string }
  | { type: "reply"; text: string; sessionId?: string }
  | { type: "error"; text: string };

type Desktop = {
  setExpanded(expanded: boolean): void;
  moveBy(dx: number, dy: number): void;
  dictate(): void; // opens Windows voice typing (Win+H) on the focused field
  openLink(url: string): void;
  hasClaude(): Promise<boolean>;
  runLocal(job: { repo: string; cloneUrl: string; prompt: string; sessionId?: string; fullAccess: boolean }, onEvent: (e: LocalEvent) => void): Promise<void>;
  onHookStatus(cb: (s: { busy: boolean; text: string }) => void): void;
  onHotkey(cb: () => void): void; // Ctrl+Shift+X: open Xepher and start listening
  hooksInstalled(): Promise<boolean>;
  installHooks(): Promise<void>;
};

type AndroidNative = {
  setExpanded(expanded: boolean): void;
  listen(): void; // answers through window.__xepherSpeech
  speak(text: string): void;
  openLink(url: string): void;
};

declare global {
  interface Window {
    xepherDesktop?: Desktop;
    XepherAndroid?: AndroidNative;
    __xepherSpeech?: (kind: "partial" | "final" | "error", text: string) => void;
    __xepherBack?: () => void; // Android back button
    __xepherFly?: (on: boolean, dir: number) => void; // Android bubble being dragged
  }
}

export const desktop = window.xepherDesktop;
const android = window.XepherAndroid;
export const platform: "desktop" | "android" | "web" = desktop ? "desktop" : android ? "android" : "web";

export function setExpanded(expanded: boolean) {
  desktop?.setExpanded(expanded);
  android?.setExpanded(expanded);
}

export function openLink(url: string) {
  if (desktop) desktop.openLink(url);
  else if (android) android.openLink(url);
  else window.open(url, "_blank");
}

export function speak(text: string) {
  const short = text.replace(/[`*#_>]/g, "").slice(0, 400);
  if (android) return android.speak(short);
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(short));
}

// Android: the system speech recogniser. Browser dev: Web Speech. Desktop uses
// Windows voice typing instead, which types into the input box (see App).
export function listen(onPartial: (text: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (android) {
      window.__xepherSpeech = (kind, text) => {
        if (kind === "partial") onPartial(text);
        else if (kind === "final") resolve(text);
        else reject(new Error(text));
      };
      android.listen();
      return;
    }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return reject(new Error("Speech recognition isn't available here."));
    const rec = new SR();
    rec.interimResults = true;
    let final = "";
    rec.onresult = (e: any) => {
      final = Array.from(e.results as ArrayLike<any>).map((r) => r[0].transcript).join("");
      onPartial(final);
    };
    rec.onerror = (e: any) => reject(new Error(e.error));
    rec.onend = () => resolve(final);
    rec.start();
  });
}
