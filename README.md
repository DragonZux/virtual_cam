# Virtual Cam

Chỉ ngón trỏ hoặc chiếu chấm **laser đỏ** vào vật thể trước camera → web hiện tên và viền vật thể (YOLO26 segmentation). Web chạy độc lập trên một máy: chỉ mở được bằng `localhost` trên chính máy đó, không cho điện thoại hay máy khác truy cập.

- **Chỉ tay**: MediaPipe Hand Landmarker (CPU) tìm đầu ngón trỏ, chạy song song với YOLO.
- **Laser đỏ**: model ADVR YOLOv5l6 đã huấn luyện chuyên cho chấm laser (GPU nếu có).
- **Vật thể**: chọn một model YOLO segmentation đang chạy; mặc định `yolo26m-seg.pt`, GPU nếu có CUDA. Có thể tải model của bạn ở **Cài đặt**.

Mọi tính toán AI chạy ở backend; trình duyệt chỉ chụp khung, gửi lên, giữ để xác nhận và vẽ kết quả.

## Chạy bằng Docker (PC có GPU NVIDIA)

Ở thư mục gốc dự án:

```bash
docker compose up -d --build
docker compose logs -f        # chờ dòng "Detector ready"
```

| Địa chỉ | Dùng cho |
|---|---|
| http://localhost:8032 | Giao diện web (chỉ máy chạy Docker) |
| http://localhost:8032/settings | Tải thêm và chọn mô hình segmentation / laser |
| http://localhost:8032/test | Thử mô hình bằng ảnh hoặc video |
| http://localhost:8032/docs | Tài liệu API (Swagger) |

- Cần NVIDIA driver ≥ 570 + Docker Desktop bật WSL2 GPU (Windows) hoặc NVIDIA Container Toolkit (Linux).
- Lần chạy đầu container tự tải model còn thiếu vào `models/` và xuất model laser đỏ (vài phút, cần internet).
- Tuỳ chọn: sao chép `.env.example` thành `.env` ở thư mục gốc để đổi cổng `WEB_PORT`, `YOLO_MODEL`, `IMAGE_SIZE`… Không có `.env` vẫn chạy với mặc định.
- Cổng chỉ gắn vào `127.0.0.1` của máy host, nên máy khác trong mạng không vào được.
- Image ~13 GB (thư viện CUDA): xem ổ chứa dữ liệu Docker còn ≥ 20 GB trước khi build.
- Lệnh khác: `docker compose down` (tắt), `docker compose logs -f` (xem log).

## Tính năng

- **Tổng quan**: camera trực tiếp với lựa chọn riêng mô hình segmentation và laser, khung xương bàn tay, vòng "giữ để xác nhận", viền vật thể đang chọn và khung các vật thể khác; FPS, trạng thái bàn tay / laser, số vật thể, số lượt chọn; chụp ảnh, toàn màn hình, phím tắt (Space tạm dừng, S chụp ảnh, F toàn màn hình).
- **Thử nghiệm** (`/test`): chọn / kéo thả ảnh hoặc video, đổi mô hình, chỉnh confidence và lớp vật thể, xem độ tin cậy, điểm laser, thời gian xử lý. File phát trên trình duyệt, chỉ gửi từng khung để nhận diện. Camera dừng khi vào trang thử; kết quả thử không ghi vào lịch sử camera.
- **Quản lý mô hình** (`/settings`): tải YOLO segmentation `.pt`, YOLO laser detect `.pt` (một lớp chấm laser) hoặc ADVR `.torchscript` đúng định dạng Virtual Cam. File được nạp thử trước khi thêm; tải trùng tên tạo bản riêng. Giới hạn mặc định 1024 MB (`MAX_MODEL_MB`). Chỉ tải trọng số từ nguồn tin cậy.
- **Chọn bằng laser**: chọn **Laser** phía trên khung camera, chiếu chấm laser đỏ lên vật thể để camera thấy cả vật lẫn chấm, giữ yên để xác nhận.
- **Thử nghiệm**: kéo thả ảnh / video để thử mô hình; file phát trên trình duyệt, các khung được gửi tới máy chủ để nhận diện.
- **Quản lý mô hình AI**: chọn mô hình segmentation và mô hình laser đang chạy, hoặc tải lên file mới (`.pt` YOLO segmentation; `.pt` YOLO detect một lớp chấm laser hoặc `.torchscript` ADVR). File lưu trong `models/custom`, lựa chọn áp dụng cho toàn máy chủ và được nhớ khi khởi động lại. Chỉ tải mô hình từ nguồn tin cậy (`.pt` là pickle).
- **Lịch sử**: thống kê phiên, bảng lượt chọn, xuất CSV.
- **Cài đặt** (lưu trên từng trình duyệt): chọn vật thể trong 79 lớp COCO, ngưỡng tin cậy, vùng chấp nhận quanh đầu ngón tay, thời gian giữ, lớp hiển thị, chế độ gương, đọc tên bằng giọng nói.
- **Hướng dẫn**, giao diện **tiếng Việt / English**.

Khung camera chỉ dùng để nhận diện rồi bỏ, không lưu. Cài đặt hiển thị / độ nhạy nằm trong `localStorage`, lịch sử chỉ trong tab. Mô hình đang chạy dùng chung toàn máy chủ; file tải thêm nằm trong `models/custom/{segmentation,laser}`, lựa chọn lưu ở `models/custom/active.json` và được khôi phục khi khởi động. Chuyển mô hình thất bại giữ nguyên mô hình trước; danh sách lớp tự cập nhật khi chuyển thành công.

## API

| Phương thức | Đường dẫn | Dùng cho |
|---|---|---|
| `GET` | `/api/vision/status` | Trạng thái (`starting` / `ready` / `error`), thiết bị, model, danh sách lớp, mặc định, tình trạng model laser |
| `POST` | `/api/vision/frame` | Body là ảnh JPEG thô (`Content-Type: image/jpeg`), trả kết quả nhận diện |
| `GET` / `POST` | `/api/models` | Danh sách mô hình / tải lên mô hình mới |
| `POST` | `/api/models/activate` | Chọn mô hình segmentation hoặc laser đang chạy |
| `GET` | `/api/models` | Danh sách mô hình, loại, dung lượng, lựa chọn hiện tại và giới hạn tải |
| `POST` | `/api/models?kind=segmentation&name=custom.pt` | Body là file nhị phân; `kind=laser` cho mô hình laser. Kiểm tra rồi lưu, chưa tự chuyển mô hình |
| `POST` | `/api/models/activate` | JSON `{"id":"<id từ danh sách>"}`; nạp, kiểm tra và lưu lựa chọn, trả trạng thái mới |

Query của `POST /api/vision/frame` (đều không bắt buộc): `targets` (tên lớp, cách nhau dấu phẩy, không phân biệt hoa / thường; `person` luôn bị loại), `conf` (0.05–0.95), `tolerance` (0–100 px), `pointer_mode` (`hand` | `laser`), `laser_hint` (`x,y` chấm laser đang bám ở khung trước), `model_revision` (phiên bản mô hình client đang dùng; lệch thì máy chủ bỏ khung).

Kết quả: `selected` (vật được chỉ: tên, độ tin cậy, viền `polygon`), `detections`, `tip` + `landmarks` (chế độ tay), `laser: {point, score}` (chế độ laser), `processing_ms`, `resolution`. Mã lỗi: 400 / 413 / 415 dữ liệu không hợp lệ, 429 đang xử lý khung khác, 503 đang khởi động hoặc thiếu model laser đỏ.

## Model laser đỏ

`docker/prepare_laser_model.py` (container tự gọi lần chạy đầu) tải trọng số đã fine-tune, kiểm tra checksum và xuất `models/laser-advr-yolov5l6.torchscript` (~305 MB). `backend/services/laser_model.py` chạy ở 1280px, confidence 0.55; khi có `laser_hint` chỉ tìm trong vùng 384×384 quanh đó, mất dấu thì quét lại toàn ảnh trong cùng request. Cấu hình: `LASER_MODEL`, `LASER_IMAGE_SIZE`, `LASER_CONFIDENCE`, `LASER_CROP_SIZE` (`0` = luôn quét toàn ảnh). Thiếu model thì chế độ laser báo 503, chỉ tay vẫn chạy. Model vẫn có thể nhận nhầm LED / phản sáng.

Nguồn: [Davide Torielli / IIT — trọng số ADVR trên Zenodo](https://zenodo.org/records/10471835), CC BY 4.0; [mã nguồn nhóm tác giả](https://github.com/ADVRHumanoids/nn_laser_spot_tracking). Trọng số gốc `yolov5l6_e200_b8_tvt302010_laser_v5.pt`, MD5 `21b8e90b7707cb91054547c6558301e3`. Chuyển định dạng dùng [YOLOv5 v7.0](https://github.com/ultralytics/yolov5/tree/v7.0), GPL-3.0.

## Cấu trúc

```
virtual_cam/
├── backend/            FastAPI: nhận khung JPEG → đầu ngón trỏ / chấm laser đỏ + vật thể được chỉ; phục vụ luôn frontend/dist
├── frontend/           React 19 + TypeScript + Vite + Ant Design + Redux Toolkit / redux-observable
├── models/             hand_landmarker.task, yolo26*-seg.pt, laser-advr-yolov5l6.torchscript — không commit
├── docker/             init_models.py (tải model còn thiếu khi container chạy), prepare_laser_model.py (xuất model laser đỏ)
├── Dockerfile, docker-compose.yml, .dockerignore   Docker cho PC có GPU NVIDIA
└── requirements.txt    mọi thư viện Python (web, test)
```

Backend: `main.py` → `routers/vision.py` → `services/detector.py` (khoá một khung một lúc; bàn tay chạy CPU song song YOLO; laser đỏ chạy GPU lần lượt với YOLO) → `services/pointing.py` (ngón tay: bỏ vật mà đầu ngón nằm ngoài mép quá `tolerance`, còn lại chọn vật đầu ngón nằm sâu nhất, bằng nhau thì vật nhỏ hơn; laser: mask nhỏ nhất chứa chấm). `core/spa.py` phục vụ `frontend/dist`; `serve.py` chạy web + API trên một cổng HTTP.

Frontend: `Services/VisionService.ts` → `store/{vision,history,setting}` → `page/<Feature>`. Luồng khung: `useFrameLoop` chụp và nén JPEG (640px chỉ tay / 1280px laser) → `visionEpics` gọi API → `utils/tracking.ts` (giữ để xác nhận) / `utils/laserTrack.ts` (bám chấm laser, gửi `laser_hint`) → `history`. `useOverlay` vẽ kết quả, nội suy mượt bằng `utils/smoothing.ts`.

## Phát triển & kiểm thử

Cần môi trường Python có `requirements.txt` (vd. `.cam`) và Node.js 20+.

```bash
cd backend
..\.cam\Scripts\python.exe -m uvicorn main:app --reload --port 8030    # API: http://localhost:8030/docs
..\.cam\Scripts\python.exe -m pytest              # không cần model
..\.cam\Scripts\python.exe -m pytest -m model     # YOLO + MediaPipe thật

cd frontend
npm run dev                  # http://localhost:5180 (proxy /api → :8030)
npm run lint && npx tsc -b && npm run build
```

## Cổng

| Cổng | Dùng cho |
|---|---|
| 8030 | Backend khi phát triển (uvicorn) |
| 8032 | Docker (map vào 8030 trong container) |
| 5180 | Vite dev |
