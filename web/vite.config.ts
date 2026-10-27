import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html: Electron loads it from disk and Android
// loads it into its WebView with an https base URL.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: "../dist", emptyOutDir: true },
});
