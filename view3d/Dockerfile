# HICAS view3d — màn hình 3D (React + three.js build) trên nginx, phục vụ ở /view3d/ bằng cấu hình nginx mặc định.
# Không mở cổng ra ngoài: container frontend chuyển https://<máy>:8033/view3d/ sang đây.
FROM node:20-alpine AS build
WORKDIR /view3d
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# base "./" nên app chạy đúng dưới /view3d/; nginx mặc định phục vụ /usr/share/nginx/html
COPY --from=build /view3d/dist /usr/share/nginx/html/view3d
EXPOSE 80
