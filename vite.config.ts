import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // デモサイト公開のときだけ生活情報タブを出す(npm run deploy:demo)。
  // ⚠ 通常のビルドでも必ず定義する。定義漏れの環境差で挙動が変わらないように。
  define: {
    __DEMO_LIFE_INFO__: JSON.stringify(process.env.DEMO_LIFE_INFO === "1"),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
