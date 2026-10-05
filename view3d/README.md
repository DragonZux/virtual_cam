# HICAS 3D — màn hình 3D

App frontend **riêng** (không nằm trong giao diện camera): nghe WebSocket `/api/vision/ws` của HICAS, vật thể nào được **xác nhận** trên trang camera (chỉ tay / laser, giữ để xác nhận) thì hiện **mô hình 3D** của vật đó trên bệ xoay. Chỉ đọc kết quả: không mở camera, không gửi gì lên máy chủ. Dùng làm màn hình thứ hai (tivi, máy chiếu, máy khác trong mạng).

```
Trình duyệt camera ──/api/vision/ws/publish──► backend (SelectionHub) ──/api/vision/ws──► view3d
```

## Chạy

| Cách | Địa chỉ | Ghi chú |
|---|---|---|
| Docker (cùng image HICAS) | `https://<IP máy>:8033/view3d/` | Backend phục vụ bản build ở `/view3d/`, cùng cổng HTTPS 8033, không mở cổng mới |
| Phát triển | `http://localhost:5183` | `npm install` rồi `npm run dev` |
| Bản build | `http://localhost:5184` | `npm run build && npm run preview` |

`npm run dev` / `npm run preview` chuyển `/api` (cả WebSocket) tới backend `BACKEND_PROTOCOL://BACKEND_HOST:BACKEND_PORT`, mặc định `http://127.0.0.1:8030` (uvicorn khi phát triển). Đổi bằng `view3d/.env` (sao chép từ `.env.example`) hoặc biến môi trường, vd. nối tới máy chủ Docker / Jetson:

```powershell
$env:BACKEND_HOST="10.0.10.62"; $env:BACKEND_PORT="8033"; $env:BACKEND_PROTOCOL="https"; npm run dev
```

Proxy chấp nhận chứng chỉ tự ký nên trình duyệt không phải xác nhận gì.

### Nối thẳng tới máy chủ khác

Không qua proxy thì đặt địa chỉ WebSocket theo thứ tự ưu tiên:

1. `?ws=` trên địa chỉ trang (không lưu), vd. `http://localhost:5184/?ws=10.0.10.62:8033`;
2. **Cài đặt › Địa chỉ WebSocket** (lưu trên trình duyệt này);
3. `VITE_WS_URL` lúc build;
4. mặc định: `/api/vision/ws` cùng máy chủ đã mở trang.

Nhận `IP:cổng` (mặc định `wss://` vì máy chủ Docker chỉ mở HTTPS), `https://…`, `http://…` hoặc `ws(s)://…/api/vision/ws`. Với `wss://` chứng chỉ tự ký, mở `https://<IP>:8033` một lần và chọn **Nâng cao › Tiếp tục** — màn hình 3D tự hiện gợi ý này khi chưa nối được. Trang mở bằng HTTPS không nối được `ws://` (trình duyệt chặn); trang `/view3d/` do backend phục vụ chỉ nối được chính máy chủ đó (CSP).

## Trên màn hình

- **Thẻ vật thể**: tên đã dịch + tên lớp gốc, độ tin cậy, chỉ tay / laser, camera / ảnh thử, giờ chọn; viền cam khi đang chọn. Mỗi lần chọn có vòng sáng lan trên bệ.
- **Đang chọn / Vừa chọn / Xem thử**: camera bỏ chọn thì mặc định giữ vật vừa chọn (tắt ở Cài đặt › *Giữ vật thể vừa chọn*). Mất kết nối vẫn giữ vật vừa chọn, tự nối lại (0,5 giây, tăng dần tối đa 10 giây) và nhận snapshot mới.
- **Nhiều trình duyệt camera** cùng phát: tự theo phiên có lựa chọn mới nhất, hoặc ghim một phiên ở ô *Phiên camera* (phiên ngắt thì về tự động).
- **Gần đây**: bấm để xem lại mô hình; lần chọn mới trên camera đưa màn hình về trực tiếp. `?preview=<tên lớp>` mở sẵn một mô hình (giữ tới khi bấm *Quay lại trực tiếp*), Cài đặt › *Xem thử mô hình* chọn trong 79 lớp.
- Kéo để xoay, cuộn để phóng to; phím **F** toàn màn hình, **R** bật / tắt tự xoay; tiếng Việt / English.

## Mô hình 3D

- **Dựng sẵn cho cả 79 lớp COCO** mà máy chủ có thể trả (trừ `person`), bằng hình khối three.js trong `src/models3d/` — không tải file, chạy offline. Mọi mô hình được co về cùng cỡ và đặt lên bệ.
- Tên lớp của bộ dữ liệu khác được quy về lớp COCO (`sofa` → `couch`, `tvmonitor` → `tv`, `cell_phone` → `cell phone`…, xem `CLASS_ALIASES` trong `src/common/constants.ts`). Lớp chưa có mô hình hiện hộp quà dán nhãn tên vật thể.
- **Mô hình GLB riêng** thay mô hình dựng sẵn: chép file vào `public/models/` rồi khai báo trong `public/models/manifest.json`:

  ```json
  {
    "models": {
      "cup": "cup.glb",
      "teddy bear": { "file": "toys/teddy.glb", "rotation": [0, 90, 0] }
    }
  }
  ```

  Khoá là tên lớp (không phân biệt hoa / thường), `rotation` (độ, tuỳ chọn) xoay thêm nếu file quay sai hướng. Chỉ nhận glTF / GLB **không nén** Draco / Meshopt (hai bộ giải nén đó cần tải mã từ CDN / WebAssembly mà CSP chặn). File lỗi thì tự dùng lại mô hình dựng sẵn. Bản Docker đóng file vào image nên thêm mô hình xong cần build lại (`docker compose up -d --build`).

## Cấu trúc

```
src/
├── Services/SelectionStreamService.ts   WebSocket chỉ-đọc, tự nối lại → Observable
├── store/       stream (kết nối, phiên, vừa chọn, gần đây) · viewer (phiên theo dõi, xem thử, ?ws=) · setting (localStorage) · library (manifest GLB)
├── page/Viewer/ màn hình duy nhất: thanh trên, thẻ vật thể, gần đây, ngăn cài đặt
├── scene/       Stage (Canvas, ánh sáng, bệ, bóng), FitToView (co vật về cùng cỡ), CameraRig, GlbModel
└── models3d/    parts.tsx (hình khối + vật liệu), shapes.ts, textures.ts (ảnh canvas), mỗi nhóm COCO một file, index.ts (lớp → mô hình)
```

Cùng khung với `frontend/`: React 19 + TypeScript strict, Vite 7 + SWC, Ant Design 5, Redux Toolkit + redux-observable, i18next (vi mặc định, en), LESS modules, alias `@/*`; thêm three.js + @react-three/fiber + @react-three/drei. Không có router (một màn hình) nên bản build dùng đường dẫn tương đối, chạy được ở `/view3d/` lẫn gốc một máy chủ tĩnh khác.

Thêm mô hình cho lớp mới: viết component trong file nhóm ở `src/models3d/` (theo quy ước đầu `parts.tsx`: đơn vị ~ mét, trục y lên, mặt trước hướng +z) rồi thêm vào `BUILTIN` trong `src/models3d/index.ts`; thêm tên dịch vào `classes` của cả `translations/resources/vi` và `en`.

## Kiểm thử

```bash
npm run lint && npx tsc -b && npm run build
npm test        # Playwright (Chrome đã cài): logic thuần, màn hình với WebSocket giả lập, dựng thử đủ 79 lớp
```

Cổng: 5183 dev, 5184 preview, 5185 server riêng cho Playwright.
