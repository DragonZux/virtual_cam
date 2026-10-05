import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Backend nhận diện mà dev / preview server chuyển /api tới: đặt trong frontend/.env
  // hoặc biến môi trường (biến môi trường được ưu tiên hơn .env)
  const env = loadEnv(mode, process.cwd(), "");
  const backendProtocol = env.BACKEND_PROTOCOL?.trim() || "http";
  const backendHost = env.BACKEND_HOST?.trim() || "127.0.0.1";
  const backendPort = env.BACKEND_PORT?.trim() || "8030";
  const backendUrl = `${backendProtocol}://${backendHost}:${backendPort}`;

  return {
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
      // Nghe mọi IP của máy: máy khác trong mạng mở http://<IP máy>:5180
      host: "0.0.0.0",
      port: 5180,
      strictPort: true,
      // Dev: proxy /api → backend FastAPI (mặc định uvicorn :8030); 127.0.0.1 tránh chậm do thử IPv6 trước
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
          // Backend Docker / Jetson dùng HTTPS chứng chỉ tự ký
          secure: false,
        },
      },
    },
    // `npm run preview` phục vụ bản build (dist), dùng chung proxy /api ở trên
    preview: {
      host: "0.0.0.0",
      port: 5182,
      strictPort: true,
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
  };
});
