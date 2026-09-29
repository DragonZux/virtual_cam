import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    preprocessorOptions: {
      less: { javascriptEnabled: true },
    },
  },
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    // Dev: proxy /api → backend FastAPI (serve.py / uvicorn :8030); 127.0.0.1 tránh chậm do thử IPv6 trước
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8030",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("antd") || id.includes("@ant-design")) return "@antd";
          if (id.includes("rxjs")) return "@rxjs";
        },
      },
    },
  },
});
