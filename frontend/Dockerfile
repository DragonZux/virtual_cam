# HICAS frontend — giao diện hicascam (React build) trên nginx: cổng HTTPS duy nhất (chứng chỉ tự ký),
# chuyển /api (cả WebSocket) sang container backend và /view3d/ sang container view3d.
FROM node:20-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
# Tạo chứng chỉ tự ký trước khi nginx chạy (image nginx tự chạy các script trong /docker-entrypoint.d)
COPY docker/40-hicas-cert.sh /docker-entrypoint.d/40-hicas-cert.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-hicas-cert.sh && chmod +x /docker-entrypoint.d/40-hicas-cert.sh
COPY --from=build /web/dist /usr/share/nginx/html

# Cấu hình nginx (delimiter trong ngoặc kép: Docker không thay các biến $... của nginx)
COPY <<"EOF" /etc/nginx/conf.d/default.conf
# WebSocket qua proxy: /api/vision/ws (app khác nhận vật thể đang chọn), /api/vision/ws/publish (giao diện gửi)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 8443 ssl;
    http2 on;
    server_name _;
    ssl_certificate     /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;

    root /usr/share/nginx/html;
    index index.html;
    # Tải mô hình lên tới MAX_MODEL_MB (mặc định 1024 MB)
    client_max_body_size 1100m;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;

    # Giao diện (SPA): mọi route trả index.html; antd chèn <style> lúc chạy nên style cần 'unsafe-inline'
    location / {
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' wss://$http_host; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy no-referrer always;
        add_header Permissions-Policy "camera=(), microphone=()" always;
        try_files $uri $uri/ /index.html;
    }

    # File build có hash trong tên
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API + WebSocket sang backend (cùng mạng Docker)
    location /api/ {
        proxy_pass http://backend:8030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Tải mô hình lớn: chuyển thẳng sang backend; nạp mô hình / WebSocket có thể kéo dài
        proxy_request_buffering off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
    }

    # Tài liệu API (Swagger) và kiểm tra sống
    location ~ ^/(docs|redoc|openapi\.json|health)$ {
        proxy_pass http://backend:8030;
        proxy_set_header Host $host;
    }

    # Màn hình 3D (container view3d)
    location = /view3d {
        return 301 /view3d/;
    }
    location /view3d/ {
        proxy_pass http://view3d:80;
        proxy_set_header Host $host;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
}
EOF
EXPOSE 8443
