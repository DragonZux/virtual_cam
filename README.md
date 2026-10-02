# Virtual Cam

Chỉ ngón trỏ hoặc chiếu chấm **laser đỏ** vào vật thể trước camera → web hiện tên và viền vật thể (YOLO26 segmentation). Web chạy trên một máy, mở bằng `https://localhost:8033` trên máy đó hoặc `https://<IP máy>:8033` từ máy khác trong mạng.

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
| https://localhost:8033 | Giao diện web (máy khác: `https://<IP máy>:8033`) |
| https://localhost:8033/settings | Tải thêm và chọn mô hình segmentation / laser |
| https://localhost:8033/test | Thử mô hình bằng ảnh hoặc video |
| https://localhost:8033/docs | Tài liệu API (Swagger) |

- Cần NVIDIA driver ≥ 570 + Docker Desktop bật WSL2 GPU (Windows) hoặc NVIDIA Container Toolkit (Linux).
- Lần chạy đầu container tự tải model còn thiếu vào `models/` và xuất model laser đỏ (vài phút, cần internet).
- Tuỳ chọn: sao chép `.env.example` thành `.env` ở thư mục gốc để đổi cổng `WEB_PORT`, `YOLO_MODEL`, `IMAGE_SIZE`… Không có `.env` vẫn chạy với mặc định.
- Một cổng duy nhất **8033** (`WEB_PORT`), chỉ HTTPS (gõ `https://`, không phải `http://`), mở trên mọi IP của máy host — trình duyệt chỉ cho mở camera ở `localhost` hoặc `https://`. Chứng chỉ tự ký, tạo lần đầu và giữ trong volume `virtual-cam-certs`; mỗi trình duyệt chọn **Nâng cao › Tiếp tục** một lần.
- Máy khác không vào được: xem hướng dẫn mạng nội bộ bên dưới.
- Image ~13 GB (thư viện CUDA): xem ổ chứa dữ liệu Docker còn ≥ 20 GB trước khi build.
- Lệnh khác: `docker compose down` (tắt), `docker compose logs -f` (xem log).

## Truy cập từ máy khác trong mạng nội bộ

Dùng **IP của máy chạy Docker**, không phải IP của máy đang mở trình duyệt. Xem IPv4 của Wi-Fi / Ethernet bằng `ipconfig`. Ví dụ máy chủ có IP `10.0.9.41` thì mọi máy khách mở `https://10.0.9.41:8033`; trang mô hình là `/settings`, trang thử ảnh là `/test`. Chỉ dùng `https://10.0.10.62:8033` nếu máy chạy Docker thực sự có IP `10.0.10.62`.

Trên Windows, với mạng Wi-Fi / Ethernet tin cậy đã đặt là **Private**, mở **PowerShell → Run as administrator** trên máy chủ rồi chạy một lần:

```powershell
New-NetFirewallRule -Name 'VirtualCam-LAN-HTTPS' -DisplayName 'Virtual Cam LAN HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8033 -Profile Private -RemoteAddress LocalSubnet,10.0.10.0/24
```

Quy tắc cho phép cổng HTTPS từ cùng subnet và từ dải nội bộ `10.0.10.0/24`. Nếu đổi `WEB_PORT`, thay `8033` tương ứng. Lỗi `Access is denied` nghĩa là PowerShell chưa có quyền Administrator.

Với subnet mask `255.255.255.0`, `10.0.9.x` và `10.0.10.x` là hai subnet khác nhau: router phải cho phép kết nối giữa chúng, hoặc máy khách cần nối vào cùng mạng với máy chủ. Mở firewall không tự tạo đường kết nối giữa hai subnet. Không cần mở cổng trên router ra Internet.

Kiểm tra từ **máy khách** bằng `Test-NetConnection 10.0.9.41 -Port 8033` (thay IP thực tế). Nếu `TcpTestSucceeded` là `True`, mở URL HTTPS và chấp nhận chứng chỉ tự ký của máy chủ bằng **Nâng cao → Tiếp tục** nếu trình duyệt hiển thị lựa chọn này. Kiểm tra `/health` trên chính máy chủ chỉ xác nhận ứng dụng đang chạy, chưa xác nhận được kết nối từ máy khác.

### Máy chủ LAN `10.0.10.62`

Máy chủ hiện tại là NVIDIA Jetson Orin (Linux ARM64), truy cập SSH bằng `hicas@10.0.10.62`. Dự án trên máy chủ nằm ở `/home/hicas/vu_nl/virtual_cam`; đây là bản chạy riêng với Docker Desktop trên máy Windows.

- Camera: `https://10.0.10.62:8033/`
- Quản lý mô hình: `https://10.0.10.62:8033/settings`
- Thử ảnh / video: `https://10.0.10.62:8033/test`

Cổng 8033 trên Jetson dùng HTTPS. Chứng chỉ có IP `10.0.10.62` và lưu trong volume `virtual-cam-certs`; mô hình vẫn lưu trong thư mục `models/` trên máy chủ.

Bản triển khai HTTPS dùng lại image Jetson đang hoạt động để giữ các thư viện CUDA tương thích, bổ sung hỗ trợ TLS và giao diện đã build. Cấu hình Compose trên máy chủ trỏ tới bản triển khai tại `/home/hicas/vu_nl/virtual_cam-deployments/lan-https-20261001-085420`; thư mục này có Dockerfile, mã đóng gói, bản sao cấu hình cũ và `compose.rollback.yml`. Dockerfile ở gốc kho mã dành cho PC; quy trình cập nhật Jetson được ghi trong `DEPLOYMENT.md` trên máy chủ.

Xem trạng thái trên máy chủ:

```bash
cd /home/hicas/vu_nl/virtual_cam
docker compose ps
docker compose logs --tail 60 virtual-cam
```

## Tính năng

- **Tổng quan**: camera trực tiếp với lựa chọn riêng mô hình segmentation và laser, khung xương bàn tay, vòng "giữ để xác nhận", viền vật thể đang chọn và khung các vật thể khác; FPS, trạng thái bàn tay / laser, số vật thể, số lượt chọn; chụp ảnh, toàn màn hình, phím tắt (Space tạm dừng, S chụp ảnh, F toàn màn hình).
- **Thử nghiệm** (`/test`): chọn / kéo thả ảnh hoặc video, đổi mô hình, chỉnh confidence và lớp vật thể, xem độ tin cậy, điểm laser, thời gian xử lý. Ảnh chỉ gửi nhận diện **một lần**, giữ nguyên kết quả; đổi ảnh / mô hình / thông số hoặc bấm **Phân tích lại** mới gửi lại. Video gửi theo từng khung. Camera dừng khi vào trang thử; kết quả thử không ghi vào lịch sử camera.
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
| `WebSocket` | `/api/vision/ws` | Nhận trạng thái vật thể đã xác nhận từ các phiên trình duyệt |
| `WebSocket` | `/api/vision/ws/publish` | Frontend tự gửi lựa chọn sau bước giữ để xác nhận |
| `GET` / `POST` | `/api/models` | Danh sách mô hình / tải lên mô hình mới |
| `POST` | `/api/models/activate` | Chọn mô hình segmentation hoặc laser đang chạy |
| `GET` | `/api/models` | Danh sách mô hình, loại, dung lượng, lựa chọn hiện tại và giới hạn tải |
| `POST` | `/api/models?kind=segmentation&name=custom.pt` | Body là file nhị phân; `kind=laser` cho mô hình laser. Kiểm tra rồi lưu, chưa tự chuyển mô hình |
| `POST` | `/api/models/activate` | JSON `{"id":"<id từ danh sách>"}`; nạp, kiểm tra và lưu lựa chọn, trả trạng thái mới |

Query của `POST /api/vision/frame` (đều không bắt buộc): `targets` (tên lớp, cách nhau dấu phẩy, không phân biệt hoa / thường; `person` luôn bị loại), `conf` (0.05–0.95), `tolerance` (0–100 px), `pointer_mode` (`hand` | `laser`), `laser_hint` (`x,y` chấm laser đang bám ở khung trước), `model_revision` (phiên bản mô hình client đang dùng; lệch thì máy chủ bỏ khung).

Kết quả: `selected` (vật được chỉ: tên, độ tin cậy, viền `polygon`), `detections`, `tip` + `landmarks` (chế độ tay), `laser: {point, score}` (chế độ laser), `processing_ms`, `resolution`. Mã lỗi: 400 / 413 / 415 dữ liệu không hợp lệ, 429 đang xử lý khung khác, 503 đang khởi động hoặc thiếu model laser đỏ.

### Nhận vật thể đang chọn qua WebSocket

Ứng dụng khác kết nối **`wss://<IP máy chủ>:8033/api/vision/ws`** để nhận vật thể **đã xác nhận** trên thẻ “Vật thể đang chọn”. Khi phát triển bằng HTTP, dùng `ws://localhost:8030/api/vision/ws`. Đây là WebSocket chuẩn, dùng client WebSocket (không dùng giao thức Socket.IO). Trình duyệt camera tự gửi trạng thái từ `tracking.held`, sau bước giữ tay / ổn định laser; không cần thay đổi luồng gửi ảnh JPEG.

Ngay khi kết nối, server gửi trạng thái của tất cả phiên đang phát:

```json
{"type":"selection.snapshot","sessions":[]}
```

`sessions` chứa các bản tin theo mẫu dưới đây nếu đã có phiên trình duyệt kết nối. Bản tin tiếp theo được gửi khi tên vật thể, độ tin cậy hiển thị, chế độ chỉ hoặc nguồn hình thay đổi:

```json
{
  "type": "selection.changed",
  "session_id": "8cbb5965-c15f-4db9-a746-3f7efb3e6cac",
  "selected": {"name": "bottle", "confidence": 0.94},
  "pointer_mode": "hand",
  "source": "camera",
  "connected": true,
  "timestamp": 1790816400000
}
```

- `name`: tên lớp gốc của mô hình; `confidence`: 0–1, làm tròn theo phần trăm hiển thị. `pointer_mode`: `hand` hoặc `laser`; `source`: `camera` hoặc `media` (ảnh / video thử).
- `selected: null`: chưa xác nhận, lựa chọn đã hết thời gian giữ, camera dừng, hoặc giao diện xóa kết quả khi đổi mô hình / ẩn tab. Ảnh tĩnh xác nhận ngay sau một lần phân tích.
- `session_id`: riêng cho mỗi kết nối phát của trình duyệt; thay đổi khi kết nối lại. Theo dõi theo mã này để nhiều camera không ghi đè nhau.
- `connected: false` kèm `selected: null`: server đã phát hiện phiên trình duyệt ngắt kết nối; bên nhận xóa phiên đó. `timestamp` là thời gian server, Unix milliseconds.
- Khi nhận `selection.snapshot`, **thay toàn bộ trạng thái đang giữ** bằng `sessions`. Snapshot cũng có thể xuất hiện để đồng bộ lại nếu bên nhận xử lý chậm.

Ví dụ chạy trong console của trang Virtual Cam (kết nối cùng máy chủ và cổng):

```js
const socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/vision/ws`);
const sessions = new Map();
socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.type === "selection.snapshot") {
    sessions.clear();
    for (const session of event.sessions) sessions.set(session.session_id, session);
  } else if (event.type === "selection.changed") {
    if (event.connected) sessions.set(event.session_id, event);
    else sessions.delete(event.session_id);
  }
  console.table([...sessions.values()].map((s) => ({
    session: s.session_id,
    object: s.selected?.name ?? "Chưa chọn",
    confidence: s.selected?.confidence ?? null,
    source: s.source,
  })));
};
socket.onclose = () => { sessions.clear(); console.log("Đã ngắt kết nối WebSocket"); };
```

Frontend tự kết nối lại (đợi 0,5 giây, tăng dần tối đa 10 giây) và gửi trạng thái mới nhất. Ứng dụng nhận bên ngoài cần tự kết nối lại khi socket đóng, xóa trạng thái cũ và nhận snapshot mới. Với chứng chỉ tự ký, trình duyệt cần chấp nhận chứng chỉ ở trang HTTPS trước; client Python / thiết bị cần tin cậy chứng chỉ máy chủ.

WebSocket dùng chung cổng và phạm vi mạng với API hiện tại, không có đăng nhập. Trạng thái chỉ lưu trong bộ nhớ của **một tiến trình server**, đúng với `serve.py` / Docker hiện tại; nếu chạy nhiều worker hoặc nhiều máy chủ thì cần thêm cơ chế chia sẻ trạng thái và phát sự kiện giữa các tiến trình. Gọi riêng `POST /api/vision/frame` không phát sự kiện lựa chọn đã xác nhận vì bước xác nhận hiện nằm ở trình duyệt.

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
npm run dev                  # http://localhost:5180 (proxy /api → backend BACKEND_HOST:BACKEND_PORT, mặc định 127.0.0.1:8030)
npm run build && npm run preview   # bản build: http://localhost:5182 (cùng proxy /api → backend)
npm run lint && npx tsc -b && npm run build
```

Đổi backend nhận diện cho frontend: sao chép `frontend/.env.example` thành `frontend/.env` rồi đặt `BACKEND_HOST` (IP), `BACKEND_PORT`, `BACKEND_PROTOCOL` (`http` / `https`), ví dụ `BACKEND_HOST=10.0.9.81` + `BACKEND_PORT=8030`; backend Docker / Jetson thì `BACKEND_PROTOCOL=https`, `BACKEND_PORT=8033` (proxy chấp nhận chứng chỉ tự ký, có cả WebSocket). Có thể truyền thẳng khi chạy, ưu tiên hơn `.env`: `$env:BACKEND_HOST="10.0.9.82"; npm run preview`. Proxy chạy ở dev / preview server nên đổi IP chỉ cần chạy lại `npm run dev` / `npm run preview`, không phải build lại. `VITE_API_URL` chỉ dùng khi trình duyệt phải gọi thẳng backend khác origin; khi đó backend cần thêm origin của web vào `CORS_ORIGINS`.

## Cổng

| Cổng | Dùng cho |
|---|---|
| 8030 | Backend khi phát triển (uvicorn) |
| 8033 | Docker, HTTPS (map vào 8031 trong container) |
| 5180 | Vite dev |
| 5182 | `npm run preview` (bản build, proxy /api → backend `BACKEND_HOST`) |
