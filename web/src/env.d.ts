declare module "*.css";
// Baked in at build time from a repo secret (see .github/workflows/build.yml).
interface ImportMeta { env: { VITE_XEPHER_TOKEN?: string } }
