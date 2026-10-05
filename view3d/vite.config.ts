import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Backend nhận diện mà dev / preview server chuyển /api (cả WebSocket) tới: đặt trong view3d/.env
  // hoặc biến môi trường (biến môi trường được ưu tiên hơn .env)
  const env = loadEnv(mode, process.cwd(), "");
  const backendProtocol = env.BACKEND_PROTOCOL?.trim() || "http";
  const backendHost = env.BACKEND_HOST?.trim() || "127.0.0.1";
  const backendPort = env.BACKEND_PORT?.trim() || "8030";
  const backendUrl = `${backendProtocol}://${backendHost}:${backendPort}`;

  return {
    // Đường dẫn tương đối: cùng một bản build chạy được ở /view3d/ của backend lẫn ở gốc một máy chủ tĩnh khác
    base: "./",
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
      // Nghe mọi IP của máy: tivi / máy khác trong mạng mở http://<IP máy>:5183
      host: "0.0.0.0",
      port: 5183,
      strictPort: true,
      // Chỉ cần WebSocket /api/vision/ws của backend; 127.0.0.1 tránh chậm do thử IPv6 trước
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
      port: 5184,
      strictPort: true,
    },
    build: {
      // three.js một khối ~700 kB (chưa nén) — tách riêng để trình duyệt cache lâu
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/three/")) return "@three";
            if (id.includes("@react-three") || id.includes("three-stdlib")) return "@r3f";
            if (id.includes("antd") || id.includes("@ant-design")) return "@antd";
            if (id.includes("rxjs")) return "@rxjs";
          },
        },
      },
    },
  };
});
