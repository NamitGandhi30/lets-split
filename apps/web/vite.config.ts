import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // In dev, /functions/v1/* goes to the API running locally under Deno (pnpm dev:api).
  const apiDev = env.API_DEV_URL ?? "http://127.0.0.1:8787";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "Let's Split",
          short_name: "Let's Split",
          description: "Split trip expenses with friends. Settle up over UPI.",
          lang: "en-IN",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#0E0F12",
          theme_color: "#0E0F12",
          categories: ["finance", "travel"],
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          // API responses are cached by TanStack Query, never by the service worker.
          navigateFallbackDenylist: [/^\/functions\//],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        "/functions/v1": { target: apiDev, changeOrigin: true, rewrite: (p) => p.replace(/^\/functions\/v1/, "") },
      },
    },
    build: { target: "es2022", sourcemap: true },
  };
});
