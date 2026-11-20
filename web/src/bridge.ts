// What the UI needs from the device it runs on. The Windows app (desktop/preload.cjs)
// and the Android app (XepherBridge.java) each provide their half; a plain
// browser gets a fallback so the UI can be developed with `npm run dev`.

type Desktop = {
  setExpanded(expanded: boolean): void;
  moveBy(dx: number, dy: number): void;
  onHotkey(cb: () => void): void; // Ctrl+Shift+X: open Xepher
  checkUpdates(repo: string, token: string): void; // downloads in the background
  onUpdateReady(cb: (version: string) => void): void;
  installUpdate(): void; // restarts into the new version
};

type AndroidNative = {
  setExpanded(expanded: boolean): void;
  version(): number; // versionCode, which is the build number in the release tag
  installUpdate(assetApiUrl: string, token: string): void; // answers through window.__xepherUpdate
};

declare global {
  interface Window {
    xepherDesktop?: Desktop;
    XepherAndroid?: AndroidNative;
    __xepherBack?: () => void; // Android back button
    __xepherUpdate?: (status: string) => void; // Android update progress / errors
    __xepherFly?: (on: boolean, dir: number) => void; // Android bubble being dragged
  }
}

export const desktop = window.xepherDesktop;
export const android = window.XepherAndroid;
export const platform: "desktop" | "android" | "web" = desktop ? "desktop" : android ? "android" : "web";

export function setExpanded(expanded: boolean) {
  desktop?.setExpanded(expanded);
  android?.setExpanded(expanded);
}

