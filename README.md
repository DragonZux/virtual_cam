# HICAS

Chiếu chấm **laser đỏ** vào vật thể trước camera (webcam hoặc camera RTSP / MediaMTX) → web hiện tên và viền vật thể (YOLO26 segmentation). Web chạy trên một máy, mở bằng `https://localhost:8033` trên máy đó hoặc `https://<IP máy>:8033` từ máy khác trong mạng.

- **Chỉ tay** (chỉ còn ở API `pointer_mode=hand`, giao diện web không dùng): MediaPipe Hand Landmarker (CPU), chỉ nạp khi có khung chế độ này.
- **Laser đỏ**: model ADVR YOLOv5l6 đã huấn luyện chuyên cho chấm laser (GPU nếu có).
- **Vật thể**: chọn một model YOLO segmentation đang chạy; mặc định `yolo26m-seg.pt`, GPU nếu có CUDA. Có thể tải model của bạn ở **Cài đặt**.

Mọi tính toán AI chạy ở backend; trình duyệt chỉ chụp khung, gửi lên, giữ để xác nhận và vẽ kết quả.

## Chạy bằng Docker (PC có GPU NVIDIA)

Ở thư mục gốc dự án:

```bash
docker compose up -d --build
docker compose logs -f backend   # chờ dòng "Detector ready"
```

Compose (project `hicas-cam`) dựng **3 image / container**, cùng một mạng Docker:

| Image / container | Nội dung | Cổng |
|---|---|---|
| `hicas-cam-backend` | FastAPI + mô hình AI (YOLO, laser, TensorRT) trên GPU, đọc camera RTSP, gửi socket TCP (`backend/Dockerfile`) | 8030 chỉ trong mạng Docker |
| `hicas-cam-frontend` | nginx: giao diện hicascam, HTTPS tự ký, chuyển `/api` (cả WebSocket) sang backend và `/view3d/` sang view3d (cấu hình nginx viết trong `frontend/Dockerfile`) | **8033** (`WEB_PORT`) → 8443 |
| `hicas-cam-view3d` | nginx (cấu hình mặc định): màn hình 3D hicas3d ở `/view3d/` (`view3d/Dockerfile`) | 80 chỉ trong mạng Docker |

| Địa chỉ | Dùng cho |
|---|---|
| https://localhost:8033 | Giao diện web (máy khác: `https://<IP máy>:8033`) |
| https://localhost:8033/settings | Tải mô hình segmentation / laser mới, chọn vật thể cần nhận diện |
| https://localhost:8033/view3d/ | Màn hình 3D: mô hình 3D của vật thể đang chọn (app riêng, xem [view3d/README.md](view3d/README.md)) |
| https://localhost:8033/docs | Tài liệu API (Swagger) |

- Cần NVIDIA driver ≥ 570 + Docker Desktop bật WSL2 GPU (Windows) hoặc NVIDIA Container Toolkit (Linux).
- Lần chạy đầu backend tự tải model còn thiếu vào `models/` và xuất model laser đỏ (vài phút, cần internet). Giao diện mở được ngay, hiện "Đang khởi động" tới khi backend sẵn sàng.
- Tuỳ chọn: sao chép `.env.example` thành `.env` ở thư mục gốc để đổi cổng `WEB_PORT`, `YOLO_MODEL`, `IMAGE_SIZE`… Không có `.env` vẫn chạy với mặc định.
- Một cổng duy nhất **8033** (`WEB_PORT`), chỉ HTTPS (gõ `https://`, không phải `http://`), mở trên mọi IP của máy host. Chứng chỉ tự ký do container frontend tạo lần đầu (thêm IP / tên máy bằng `CERT_HOSTS` trong `.env`, đổi là tự tạo lại) và giữ trong volume `hicas-certs`; mỗi trình duyệt chọn **Nâng cao › Tiếp tục** một lần.
- Máy khác không vào được: xem hướng dẫn mạng nội bộ bên dưới.
- Image backend ~16 GB (thư viện CUDA, TensorRT 6 GB để chuyển mô hình ngay trong container); frontend / view3d chỉ vài chục MB. Xem ổ chứa dữ liệu Docker còn ≥ 25 GB trước khi build.
- Lệnh khác: `docker compose down` (tắt), `docker compose logs -f backend` / `frontend` / `view3d` (xem log từng phần), `docker compose up -d --build frontend` (chỉ build lại giao diện).
- Máy đã chạy bản một image cũ (project `virtual_cam`, container `virtual-cam`): chạy `docker compose -p virtual_cam down` **một lần** trước khi `docker compose up -d --build`, không thì container cũ vẫn giữ cổng 8033. Bản mới tạo chứng chỉ mới trong volume `hicas-certs` (mỗi trình duyệt chọn lại **Nâng cao › Tiếp tục**); dọn đồ cũ bằng `docker volume rm virtual-cam-certs` và `docker image rm virtual-cam:latest`.

### Kết nối giữa các container

Trình duyệt chỉ kết nối tới **một địa chỉ của frontend**. Ví dụ mở `https://10.0.9.41:8033` thì API tự dùng `https://10.0.9.41:8033/api` và WebSocket tự dùng `wss://10.0.9.41:8033/api/vision/ws`. nginx chuyển tiếp trong mạng Docker tới `backend:8030` và `view3d:80`. Không thay các tên service này hoặc `127.0.0.1` trong healthcheck bằng IP LAN. Healthcheck chỉ kiểm tra API sống; trạng thái nhận diện thật ở `/api/vision/status` phải là `ready`.

Nếu build backend dừng ở `exporting layers` / `unpacking`, chờ Docker xuất và giải nén thư viện CUDA. `context canceled` nghĩa là build bị huỷ, không phải lỗi `/health`. Chạy lại `docker compose --progress plain build backend` sẽ dùng các lớp đã cache.

## Truy cập từ máy khác trong mạng nội bộ

Dùng **IP của máy chạy Docker**, không phải IP của máy đang mở trình duyệt. Xem IPv4 của Wi-Fi / Ethernet bằng `ipconfig`. Ví dụ máy chủ có IP `10.0.9.41` thì mọi máy khách mở `https://10.0.9.41:8033`; trang mô hình là `/settings`, trang thử ảnh là `/test`. Chỉ dùng `https://10.0.10.62:8033` nếu máy chạy Docker thực sự có IP `10.0.10.62`.

Trên Windows, với mạng Wi-Fi / Ethernet tin cậy đã đặt là **Private**, mở **PowerShell → Run as administrator** trên máy chủ rồi chạy một lần:

```powershell
New-NetFirewallRule -Name 'HICAS-LAN-HTTPS' -DisplayName 'HICAS LAN HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8033 -Profile Private -RemoteAddress LocalSubnet,10.0.10.0/24
```

Quy tắc cho phép cổng HTTPS từ cùng subnet và từ dải nội bộ `10.0.10.0/24`. Nếu đổi `WEB_PORT`, thay `8033` tương ứng. Lỗi `Access is denied` nghĩa là PowerShell chưa có quyền Administrator.

Với subnet mask `255.255.255.0`, `10.0.9.x` và `10.0.10.x` là hai subnet khác nhau: router phải cho phép kết nối giữa chúng, hoặc máy khách cần nối vào cùng mạng với máy chủ. Mở firewall không tự tạo đường kết nối giữa hai subnet. Không cần mở cổng trên router ra Internet.

Kiểm tra từ **máy khách** bằng `Test-NetConnection 10.0.9.41 -Port 8033` (thay IP thực tế). Nếu `TcpTestSucceeded` là `True`, mở URL HTTPS và chấp nhận chứng chỉ tự ký của máy chủ bằng **Nâng cao → Tiếp tục** nếu trình duyệt hiển thị lựa chọn này. Kiểm tra `/health` trên chính máy chủ chỉ xác nhận ứng dụng đang chạy, chưa xác nhận được kết nối từ máy khác.

### Máy chủ LAN `10.0.10.62`

Máy chủ là NVIDIA Jetson Orin (Linux ARM64, JetPack 6), truy cập SSH bằng `hicas@10.0.10.62`. Dự án trên máy chủ nằm ở `/home/hicas/vu_nl/virtual_cam`; đây là bản chạy riêng với Docker Desktop trên máy Windows. Máy này chạy **HTTP** (camera RTSP do backend đọc nên không cần HTTPS), ba cổng đặt trong `.env` (`WEB_PORT`, `BACKEND_PORT`, `VIEW3D_PORT`):

- Giao diện: `http://10.0.10.62:8333/` (quản lý mô hình `/settings`, màn hình 3D cũng có ở `/view3d/`)
- Backend: `http://10.0.10.62:8336/` — API ở `/api/...`, Swagger ở `/docs` (gốc `/` không có trang)
- Màn hình 3D: `http://10.0.10.62:8339/`

`docker-compose.override.yml` của máy (không commit, ghi trong `.git/info/exclude`) gộp cấu hình Jetson, mở cổng backend / view3d và thay cấu hình nginx bằng bản HTTP trong `.hicas-local/` (`nginx-frontend.conf`, `nginx-view3d.conf`).

**Jetson phải dùng `backend/Dockerfile.jetson`**. PyTorch CUDA dành cho PC có thể cài thành công, nhận tên GPU Orin, nhưng vẫn báo `no kernel image is available for execution on the device` vì thiếu kernel `sm_87`. Dockerfile Jetson giữ bộ torch / torchvision / numpy tương thích JetPack từ image nền. Engine TensorRT cần được tạo trên máy đích.

Thiết lập lần đầu trên một máy Jetson mới:

```bash
cp docker-compose.jetson.yml docker-compose.override.yml
# Đặt WEB_PORT và CERT_HOSTS trong .env cho máy chủ này.
docker compose up -d --build
```

Image nền mặc định là `ultralytics/ultralytics:8.4.166-jetson-jetpack6`. Máy `10.0.10.62` có thể đặt `JETSON_BASE_IMAGE=virtual-cam:lan-https-20261001-085420` trong `.env` để tái sử dụng bộ thư viện đã kiểm tra CUDA trên máy này. Không chuyển image PC từ Windows sang Jetson.

Cập nhật / kiểm tra trên máy chủ đã có override:

```bash
cd /home/hicas/vu_nl/virtual_cam
docker compose up -d --build
docker compose ps
docker compose logs --tail 60 backend
curl http://localhost:8336/api/vision/status
```

Không ghi đè `docker-compose.override.yml` của máy này bằng `docker-compose.jetson.yml` (sẽ mất ba cổng HTTP). Bản sao cấu hình trước khi chuyển sang HTTP nằm ở `/home/hicas/vu_nl/virtual_cam-deployments/http-20261002`.

## Tính năng

Web (giao diện **hicascam**) chỉ có hai trang, camera là **camera RTSP / MediaMTX** và chọn vật thể **bằng chấm laser đỏ** (không còn webcam, chế độ chỉ tay, trang thử nghiệm, lịch sử, hướng dẫn, đọc tên bằng giọng nói).

- **Tổng quan** (`/`): hàng trên là **Vật thể đang chọn** (viền cam khi đã xác nhận, kèm độ tin cậy), **Điểm laser**, **Vật thể trong khung**; bên dưới là camera chiếm toàn chiều ngang (khung 16:10, tối đa 80% chiều cao màn hình) với vòng "giữ để xác nhận", viền vật thể đang chọn và khung các vật thể khác. Chụp ảnh, toàn màn hình, phím tắt (Space tạm dừng, S chụp ảnh, F toàn màn hình).
- **Camera RTSP**: ô chọn trên khung camera liệt kê các camera đã thêm; chọn là **máy chủ chạy camera đó** (mỗi lúc một camera, thay camera đang chạy). Camera chạy trên máy chủ: đóng / tải lại trang vẫn nhận diện, chỉ **Tắt camera** mới dừng; máy chủ khởi động lại thì chạy tiếp camera đã chọn. **+ Thêm camera RTSP…** (hoặc nút **Thêm camera RTSP** trên khung camera) để nhập tên và địa chỉ như khi xem bằng `ffplay rtsp://10.0.9.41:8554/camera` (dán cả lệnh `ffplay …` cũng được). Trình duyệt không mở được `rtsp://` nên **máy chủ** đọc luồng (OpenCV/FFmpeg, RTSP qua TCP), **tự nhận diện khung mới nhất** và đẩy cả hình (JPEG) lẫn kết quả (bbox, viền, chấm laser) về trang qua một WebSocket (xem [Camera máy chủ](#camera-máy-chủ-apicamera)). Địa chỉ phải truy cập được từ máy chủ (trong Docker: dùng IP LAN của máy chạy MediaMTX, không dùng `localhost`). Tài khoản / mật khẩu trong URL không hiện trên khung hình và không ghi log.
- **Cài đặt** (`/settings`):
  - **Quản lý mô hình AI**: mỗi loại (segmentation, laser) một dòng là mô hình đang chạy (mô hình cũ không hiện), nút **Cập nhật** để chọn file mới cho đúng loại đó. Cả hai loại nhận `.pt`, `.torchscript` hoặc `.engine` (segmentation: Ultralytics YOLO segmentation, `.torchscript` xuất bằng Ultralytics; laser: ADVR `.torchscript`, YOLO detect một lớp `.pt`). **Tải lên là dùng ngay** thay mô hình cùng loại; nạp lỗi thì bỏ file và giữ mô hình cũ. Máy có GPU NVIDIA + TensorRT thì sau đó **tự chuyển sang TensorRT FP16** và đổi sang engine khi xong (xem [Chuyển sang TensorRT ngay trên máy chủ](#chuyển-sang-tensorrt-ngay-trên-máy-chủ)). File lưu trong `models/custom`, giới hạn mặc định 1024 MB (`MAX_MODEL_MB`). Chỉ tải mô hình từ nguồn tin cậy (`.pt` là pickle).
  - **Camera RTSP**: dòng đầu cho biết **máy chủ đang nhận diện camera nào** (kể cả camera do trình duyệt khác chọn) kèm nút **Tắt camera**; danh sách link (tên + địa chỉ) — thêm, sửa, xoá, **Kết nối** (máy chủ chạy camera đó, chuyển sang Tổng quan), nhãn **Đang nhận diện** / **Đã tạm dừng** ở camera đang chạy. Danh sách **lưu trên từng trình duyệt** (`localStorage`); camera đang chạy lưu trên máy chủ.
  - **Kết nối socket**: nút **Test kết nối** — gửi `ping` trên WebSocket camera của trang; backend ghi một dòng log (`Test kết nối từ frontend — máy <IP> qua /api/camera/ws`) và trả địa chỉ backend thật để hiện trên trang. Màn hình 3D có nút tương tự (qua `/api/vision/ws`). App khác nhận vật thể đang chọn: xem [Nhận vật thể đang chọn qua WebSocket](#nhận-vật-thể-đang-chọn-qua-websocket).
  - **Vật thể cần nhận diện**: danh sách lớp **đọc từ mô hình segmentation đang chạy** (`classes` của `GET /api/vision/status`, bỏ "person"); đổi mô hình là danh sách đổi theo. Lớp COCO có tên tiếng Việt và nhóm sẵn, lớp của mô hình tự huấn luyện vào nhóm "Khác" với tên gốc. Lựa chọn lưu trên trình duyệt; lớp không còn trong mô hình mới bị bỏ, không còn lớp nào thì dùng mặc định máy chủ (`DEFAULT_TARGETS`).
  - Ngưỡng tin cậy, thời gian giữ để xác nhận, viền / khung hiển thị, lật ngang hình camera.
- Giao diện **tiếng Việt / English**.

Khung camera chỉ dùng để nhận diện rồi bỏ, không lưu. Cài đặt hiển thị / độ nhạy nằm trong `localStorage` và được gửi cho máy chủ khi mở camera. Mô hình đang chạy dùng chung toàn máy chủ; file tải thêm nằm trong `models/custom/{segmentation,laser}`, lựa chọn lưu ở `models/custom/active.json` và được khôi phục khi khởi động. Chuyển mô hình thất bại giữ nguyên mô hình trước; danh sách lớp tự cập nhật khi chuyển thành công.

## API

| Phương thức | Đường dẫn | Dùng cho |
|---|---|---|
| `GET` | `/api/vision/status` | Trạng thái (`starting` / `ready` / `error`), thiết bị, model, danh sách lớp, mặc định, tình trạng model laser |
| `GET` | `/api/camera` | Camera máy chủ đang chạy: `{status: off/connecting/live/reconnecting, url (không mật khẩu), name, detect, error, width, height}` |
| `PUT` | `/api/camera` | JSON `{"url":"rtsp://…","name":"Cam cửa"}` — chạy camera này thay camera đang chạy, chờ khung đầu tiên (400 địa chỉ sai, 502 không có hình) |
| `DELETE` | `/api/camera` | Tắt camera |
| `PUT` | `/api/camera/detect` | JSON `{"detect":false}` — tạm dừng / tiếp tục nhận diện (hình vẫn chạy) |
| `WebSocket` | `/api/camera/ws` | Xem camera: trạng thái, hình JPEG, kết quả nhận diện (xem bên dưới) |
| `POST` | `/api/vision/frame` | Body là ảnh JPEG thô (`Content-Type: image/jpeg`), trả kết quả nhận diện một khung (cho client ngoài; giao diện web không dùng) |
| `WebSocket` | `/api/vision/ws` | Nhận trạng thái vật thể đã xác nhận của các luồng camera |
| `WebSocket` | `/api/vision/ws/publish` | Client ngoài tự gửi lựa chọn đã xác nhận (giao diện web không dùng) |
| `GET` / `POST` | `/api/models` | Danh sách mô hình / tải lên mô hình mới |
| `POST` | `/api/models/activate` | Chọn mô hình segmentation hoặc laser đang chạy |
| `GET` | `/api/models` | Danh sách mô hình, loại, dung lượng, lựa chọn hiện tại và giới hạn tải |
| `POST` | `/api/models?kind=segmentation&name=custom.pt` | Body là file nhị phân (`.pt`, `.torchscript`, `.engine`); `kind=laser` cho mô hình laser. Nạp và **dùng ngay** thay mô hình cùng loại; `convert=true` thì sau đó chuyển TensorRT FP16 |
| `POST` | `/api/models/activate` | JSON `{"id":"<id từ danh sách>"}`; nạp, kiểm tra và lưu lựa chọn, trả trạng thái mới |
| `POST` | `/api/models/convert` | JSON `{"id":"<id .pt / .torchscript>"}`; build TensorRT FP16 ở nền (202), xong tự chọn engine. Tiến độ ở `conversions` của `GET /api/models`; `POST /api/models?...&convert=true` tải lên rồi chuyển luôn |
| `GET` | `/api/sockets` | `{websocket_path, tcp: [{id, host, port, enabled, status, error, sent, last_sent}]}` — WebSocket có sẵn và trạng thái các máy đích TCP |
| `PUT` | `/api/sockets/tcp` | JSON `{"targets":[{"host":"192.168.1.20","port":5000,"enabled":true}]}` — thay toàn bộ danh sách máy đích TCP (tối đa 8), lưu trên máy chủ |

Query của `POST /api/vision/frame` (đều không bắt buộc): `targets` (tên lớp, cách nhau dấu phẩy, không phân biệt hoa / thường; `person` luôn bị loại), `conf` (0.05–0.95), `tolerance` (0–100 px), `pointer_mode` (`hand` | `laser`), `laser_hint` (`x,y` chấm laser đang bám ở khung trước), `model_revision` (phiên bản mô hình client đang dùng; lệch thì máy chủ bỏ khung).

Kết quả: `selected` (vật được chỉ: tên, độ tin cậy, viền `polygon`), `detections`, `tip` + `landmarks` (chế độ tay), `laser: {point, score}` (chế độ laser), `processing_ms`, `resolution`. Mã lỗi: 400 / 413 / 415 dữ liệu không hợp lệ, 429 đang xử lý khung khác, 503 đang khởi động hoặc thiếu model laser đỏ.

### Camera máy chủ (`/api/camera`)

```
RTSP ─► máy chủ đọc luồng (chỉ giữ khung mới nhất) — một camera một lúc, chạy cả khi không ai mở trang
          ├─► nhận diện: luôn lấy khung MỚI NHẤT, khung đến lúc GPU bận bị bỏ → bám laser + giữ để xác nhận
          │     ├─► kết quả ─► các trang đang xem (vẽ bbox / viền / chấm laser)
          │     └─► vật đã xác nhận ─► /api/vision/ws (view3d, app khác)
          └─► hình JPEG ─► các trang đang xem (gửi xong khung trước mới lấy khung mới nhất: mạng chậm thì bỏ khung)
```

Chọn / tắt / tạm dừng bằng REST ở bảng trên; lựa chọn (địa chỉ, tên, tạm dừng, tuỳ chọn nhận diện) lưu ở `backend/data/camera.json` (có mật khẩu camera, không commit) để máy chủ khởi động lại chạy tiếp. Trang web chỉ xem: đóng tab không dừng nhận diện; mọi trang thấy cùng một camera, cùng trạng thái tạm dừng. Hình chạy theo nhịp camera, không chờ nhận diện; lớp vẽ dùng kết quả gần nhất (trễ hơn hình đúng bằng thời gian nhận diện). Tuỳ chọn nhận diện dùng chung, là của trang gửi gần nhất.

WebSocket `/api/camera/ws` — trình duyệt → máy chủ (JSON): `{"type":"options","targets":[…]|null,"confidence":0.8|null,"dwell_ms":300}`, `{"type":"state","video":false}` (tab ẩn: ngừng gửi hình / kết quả cho trang này). Máy chủ → trình duyệt: bản tin binary là một khung JPEG (cạnh dài tối đa 1280); `{"type":"camera", …GET /api/camera}` ngay khi kết nối và mỗi khi camera đổi trạng thái; `{"type":"result","result":<như POST /api/vision/frame>,"tracking":{"held":…,"pending":{"name","elapsed_ms"}|null},"latency_ms"}`.

### Nhận vật thể đang chọn qua WebSocket

Ứng dụng khác kết nối **`wss://<IP máy chủ>:8033/api/vision/ws`** để nhận vật thể **đã xác nhận** trên thẻ “Vật thể đang chọn”. Khi phát triển bằng HTTP, dùng `ws://localhost:8030/api/vision/ws`. Đây là WebSocket chuẩn, dùng client WebSocket (không dùng giao thức Socket.IO). Máy chủ tự phát vật thể đã xác nhận (sau bước giữ / ổn định chấm laser) của camera đang chạy, kể cả khi không ai mở trang camera; mỗi lần chạy một camera là một `session_id`. Gửi `{"type":"ping","source":"<tên app>"}` trên socket này thì backend ghi log và trả `{"type":"pong","backend","client","server"}` (dùng để test kết nối); các bản tin khác bị bỏ qua.

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
  "pointer_mode": "laser",
  "source": "camera",
  "connected": true,
  "timestamp": 1790816400000
}
```

- `name`: tên lớp gốc của mô hình; `confidence`: 0–1, làm tròn theo phần trăm hiển thị. `pointer_mode`: `laser` (giao diện web chỉ dùng laser; `hand` chỉ khi app khác gọi API chế độ chỉ tay); `source`: `camera`.
- `selected: null`: chưa xác nhận, lựa chọn đã hết thời gian giữ, camera dừng, hoặc giao diện xóa kết quả khi đổi mô hình / ẩn tab.
- `session_id`: riêng cho mỗi kết nối phát của trình duyệt; thay đổi khi kết nối lại. Theo dõi theo mã này để nhiều camera không ghi đè nhau.
- `connected: false` kèm `selected: null`: server đã phát hiện phiên trình duyệt ngắt kết nối; bên nhận xóa phiên đó. `timestamp` là thời gian server, Unix milliseconds.
- Khi nhận `selection.snapshot`, **thay toàn bộ trạng thái đang giữ** bằng `sessions`. Snapshot cũng có thể xuất hiện để đồng bộ lại nếu bên nhận xử lý chậm.
- **TCP socket**: thêm máy đích bằng `PUT /api/sockets/tcp` (giao diện không còn phần này; lưu ở `backend/data/sockets.json`, tối đa 8); máy chủ là bên kết nối tới và gửi đúng các bản tin trên, **mỗi bản tin một dòng JSON** (UTF-8, kết thúc `
`), bắt đầu bằng `selection.snapshot` mỗi lần kết nối (lại). Thử nhanh bằng `nc -lk 5000` (Linux / macOS) hoặc một server TCP bất kỳ đọc theo dòng.

Ví dụ chạy trong console của trang HICAS (kết nối cùng máy chủ và cổng):

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

Tạm dừng nhận diện thì báo `selected: null`; tắt / đổi camera thì phiên cũ báo `connected: false`. Ứng dụng nhận bên ngoài cần tự kết nối lại khi socket đóng, xóa trạng thái cũ và nhận snapshot mới. Với chứng chỉ tự ký, trình duyệt cần chấp nhận chứng chỉ ở trang HTTPS trước; client Python / thiết bị cần tin cậy chứng chỉ máy chủ.

WebSocket dùng chung cổng và phạm vi mạng với API hiện tại, không có đăng nhập. Trạng thái chỉ lưu trong bộ nhớ của **một tiến trình server**, đúng với `serve.py` / Docker hiện tại; nếu chạy nhiều worker hoặc nhiều máy chủ thì cần thêm cơ chế chia sẻ trạng thái và phát sự kiện giữa các tiến trình. Gọi riêng `POST /api/vision/frame` không phát sự kiện lựa chọn đã xác nhận vì bước xác nhận chỉ chạy trong luồng camera (`services/live_tracking.py`).

### Màn hình 3D (`view3d/`)

App frontend riêng, không chung với giao diện camera: nghe `/api/vision/ws` và hiện **mô hình 3D** của vật thể vừa được xác nhận (dựng sẵn cho cả 79 lớp COCO, thay được bằng file GLB riêng). Bản Docker mở ở `https://<IP máy>:8033/view3d/` (cùng cổng 8033); khi phát triển chạy `npm install && npm run dev` trong `view3d/` → `http://localhost:5183` (proxy `/api` → backend như `frontend/`). Nối tới máy chủ khác bằng `?ws=<IP:cổng>`. Chi tiết: [view3d/README.md](view3d/README.md).

## Model laser đỏ

`docker/prepare_laser_model.py` (container tự gọi lần chạy đầu) tải trọng số đã fine-tune, kiểm tra checksum và xuất `models/laser-advr-yolov5l6.torchscript` (~305 MB). `backend/services/laser_model.py` chạy ở 1280px, confidence 0.55; khi có `laser_hint` chỉ tìm trong vùng 384×384 quanh đó, mất dấu thì quét lại toàn ảnh trong cùng request. Cấu hình: `LASER_MODEL`, `LASER_IMAGE_SIZE`, `LASER_CONFIDENCE`, `LASER_CROP_SIZE` (`0` = luôn quét toàn ảnh). Thiếu model thì chế độ laser báo 503, chỉ tay vẫn chạy. Model vẫn có thể nhận nhầm LED / phản sáng.

Nguồn: [Davide Torielli / IIT — trọng số ADVR trên Zenodo](https://zenodo.org/records/10471835), CC BY 4.0; [mã nguồn nhóm tác giả](https://github.com/ADVRHumanoids/nn_laser_spot_tracking). Trọng số gốc `yolov5l6_e200_b8_tvt302010_laser_v5.pt`, MD5 `21b8e90b7707cb91054547c6558301e3`. Chuyển định dạng dùng [YOLOv5 v7.0](https://github.com/ultralytics/yolov5/tree/v7.0), GPL-3.0.

## Chạy model TensorRT

Backend hỗ trợ model vật thể Ultralytics segmentation `.engine`, laser Ultralytics detect một lớp `.engine`, và engine ADVR YOLOv5 có đầu vào cố định `[1, 3, H, W]`, đầu ra đã giải mã `[1, N, 6]` (`xywh`, objectness, class score). FE vẫn gửi JPEG và nhận cùng cấu trúc JSON.

- Chép `yolo26m-seg.engine` và `laser-advr-yolov5l6.engine` vào `models/`, mở **Cài đặt → Quản lý mô hình AI** và chọn từng engine. Có thể upload `.engine` với loại model tương ứng; engine được nạp thử trước khi lưu. Lựa chọn lưu ở `models/custom/active.json` và được ưu tiên hơn tên model mặc định trong `.env`.
- Engine segmentation cần metadata do Ultralytics export tạo ra (`task=segment`, tên lớp). Engine ADVR thuần đặt ở thư mục gốc cần tên bắt đầu bằng `laser-advr-`; tên khác thì upload dưới loại **Laser**. Đầu vào/đầu ra ADVR phải ở dạng float16 hoặc float32 và bộ nhớ tuyến tính.
- Engine ADVR cố định chạy **toàn ảnh**: resize giữ tỷ lệ và thêm viền đến đúng kích thước engine, sau đó quy đổi vị trí chấm về ảnh gốc. Engine `1280×1280` không chạy được nhánh crop `384×384`; `LASER_CROP_SIZE` chỉ áp dụng cho TorchScript. `laser_hint` vẫn ưu tiên ứng viên gần vị trí trước đó.
- Cần GPU NVIDIA CUDA và runtime TensorRT tương thích engine. `requirements.txt` cài TensorRT CUDA 12 bản 11.3 trên Windows/Linux x86_64; Jetson dùng runtime tương ứng JetPack. Engine của Windows không dùng trực tiếp cho Docker Linux/Jetson: build lại trên môi trường đích. Chạy Windows và Docker chung thư mục `models/`: nếu mô hình đang chọn là engine của bên kia (nạp lỗi), máy chủ tự chạy mô hình mặc định `YOLO_MODEL` / `LASER_MODEL` và giữ nguyên lựa chọn trong `active.json`; muốn TensorRT trong Docker thì bấm **Chuyển TensorRT** ngay trong giao diện của container. Model `.pt` và `.torchscript` vẫn có thể chọn lại trong giao diện.
- Container không tự tải hoặc xuất engine bị thiếu khi khởi động. Phải cung cấp engine đúng cho máy đó (hoặc chuyển trong giao diện, xem dưới) trước khi cấu hình `YOLO_MODEL` / `LASER_MODEL` trỏ tới `.engine`.

### Chuyển sang TensorRT ngay trên máy chủ

**Cài đặt → Quản lý mô hình AI**: tích **Chuyển sang TensorRT (FP16) sau khi tải lên** (mặc định bật khi máy chủ có GPU NVIDIA + TensorRT), hoặc bấm **Chuyển TensorRT** ở mô hình `.pt` / `.torchscript` đã có (kể cả mô hình mặc định trong `models/`).

- Máy chủ build engine **FP16** cho đúng GPU, hệ điều hành và bản TensorRT của nó, ở tiến trình con (`services/tensorrt_export.py`, mỗi lúc một mô hình). Xong thì engine được nạp thử và **tự chọn chạy luôn**; lỗi thì giữ mô hình đang chạy và báo lý do trong Cài đặt.
- Segmentation / laser `.pt` Ultralytics: export Ultralytics `format=engine`, `quantize=16`, ảnh vuông `IMAGE_SIZE` / `LASER_IMAGE_SIZE`, giữ metadata lớp trong engine. Laser ADVR `.torchscript`: TorchScript → ONNX tĩnh `[1, 3, LASER_IMAGE_SIZE, LASER_IMAGE_SIZE]` → engine thuần đầu ra `[1, N, 6]`.
- TensorRT 11 bỏ cờ FP16 của builder nên FP16 được đổi sẵn trong ONNX bằng NVIDIA ModelOpt AutoCast (`nvidia-modelopt[onnx]` trong `requirements.txt`).
- Engine lưu ở `models/custom/<loại>/<tên>-fp16.engine`, không ghi đè engine cũ; file gốc vẫn còn để chọn lại.
- Build mất vài phút (laser ADVR 1280 lâu hơn) và cần nhiều RAM: máy ít RAM có thể lỗi `LLVM ERROR: out of memory` — đóng bớt ứng dụng rồi bấm chuyển lại. Trong lúc build, nhận diện vẫn chạy nhưng chậm hơn vì dùng chung GPU.

Thử trực tiếp trên Windows bằng Python đã có PyTorch CUDA và TensorRT (kiểm tra `torch.cuda.is_available()` trả `True`):

```powershell
.\.cam\Scripts\python.exe -c "import torch, tensorrt; print(torch.cuda.is_available(), tensorrt.__version__)"
cd frontend
npm run build
cd ..
.\.cam\Scripts\python.exe backend/serve.py --host 127.0.0.1 --port 8030 --https-port 0
```

Mở `http://localhost:8030`, chọn hai engine trong Cài đặt rồi thử camera hoặc ảnh ở `/test`. Nếu `.cam` đang cài PyTorch CPU thì dùng Python có CUDA hoặc cài PyTorch CUDA vào môi trường đó. So sánh `yolo26m-seg.engine` với chính `yolo26m-seg.pt` trên cùng ảnh, không so với bản `n` để kết luận mức tăng tốc TensorRT.

## Cấu trúc

```
virtual_cam/
├── backend/            FastAPI: đọc camera RTSP, nhận diện chấm laser đỏ + vật thể được chỉ; khi chạy không Docker phục vụ luôn frontend/dist
│                       Dockerfile (+ Dockerfile.dockerignore) — image backend, build từ thư mục gốc
├── frontend/           Giao diện hicascam: React 19 + TypeScript + Vite + Ant Design + Redux Toolkit / redux-observable
│                       Dockerfile (kèm cấu hình nginx), docker/40-hicas-cert.sh — image nginx HTTPS
├── view3d/             Màn hình 3D hicas3d: nghe /api/vision/ws, hiện mô hình 3D của vật thể đang chọn (three.js); Dockerfile
├── models/             hand_landmarker.task, yolo26*-seg.pt, laser-advr-yolov5l6.torchscript — không commit
├── docker/             init_models.py (tải model còn thiếu khi backend chạy), prepare_laser_model.py (xuất model laser đỏ)
├── docker-compose.yml  3 service backend / frontend / view3d cho PC có GPU NVIDIA
└── requirements.txt    mọi thư viện Python (web, test)
```

Backend: `routers/camera.py` (REST + WebSocket `/api/camera`) → `services/live_stream.py` (`LiveHub`: camera đang chạy, lưu `data/camera.json`; `RtspStream` của `services/rtsp_stream.py` + vòng nhận diện khung mới nhất + gửi hình cho từng trang đang xem) → `services/live_tracking.py` (bám chấm laser, giữ để xác nhận) → `services/selection_stream.py` (`/api/vision/ws`). Nhận diện: `routers/vision.py` → `services/detector.py` (khoá một khung một lúc; laser đỏ chạy GPU lần lượt với YOLO; bàn tay chỉ khi API gọi `pointer_mode=hand`) → `services/pointing.py` (ngón tay: bỏ vật mà đầu ngón nằm ngoài mép quá `tolerance`, còn lại chọn vật đầu ngón nằm sâu nhất, bằng nhau thì vật nhỏ hơn; laser: mask nhỏ nhất chứa chấm). `core/spa.py` phục vụ `frontend/dist`; `serve.py` chạy web + API trên một cổng HTTP.

Frontend: `Services/VisionService.ts` → `store/{vision,setting,model}` → `page/{Live,Settings}`. Camera: `useCamera` xem qua `Services/LiveService.ts` (WebSocket `/api/camera/ws`, tự nối lại), vẽ khung JPEG mới nhất vào `<video>` (giải mã chậm thì bỏ khung giữa) và đưa trạng thái camera + kết quả vào `store/vision`; Kết nối / Tắt / Tạm dừng gọi `Services/CameraService.ts` (REST). `useOverlay` vẽ kết quả (chế độ gương lật toạ độ bằng `mirrorResult`), nội suy mượt bằng `utils/smoothing.ts`.

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
| 5183 | `view3d/` dev (màn hình 3D, proxy /api → backend) |
| 5184 | `view3d/` `npm run preview` (bản build màn hình 3D) |
