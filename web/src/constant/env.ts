export const APP_VERSION = __APP_VERSION__ || "dev";

export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";

export const CONNECTOR_DOWNLOAD_URL = import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL || "https://github.com/928522282/infinite-canvas/releases/latest/download/Infinite-Canvas-Connector-Windows-x64.exe";

// Official plugin registry URL: CI publishes to plugins-dist for jsDelivr delivery; an environment variable may override it for self-hosting.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";
