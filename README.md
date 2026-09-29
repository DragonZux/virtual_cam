# Virtual Cam

Chỉ ngón trỏ hoặc chiếu chấm laser vào vật thể trước camera → web hiện tên vật thể (YOLO26 segmentation). Chỉ tay dùng MediaPipe; laser đỏ dùng model ADVR YOLOv5l6 đã huấn luyện chuyên chấm laser; laser xanh dùng OpenCV. Mỗi người dùng camera trên thiết bị của chính mình; máy chủ nhận diện chung cho mọi trình duyệt.

## Chọn vật thể bằng laser

1. Mở web, chọn **Laser** phía trên khung camera (hoặc trong Cài đặt → Nhận diện).
2. Chọn **Laser đỏ** hoặc **Laser xanh lá** đúng với bút đang dùng, bật camera.
3. Trong Cài đặt, bật các loại vật thể cần nhận diện. Mặc định chỉ có laptop, mouse, keyboard; muốn chọn cốc/chai… cần bật thêm.
4. Chiếu chấm laser lên vật thể để camera nhìn thấy cả vật thể lẫn chấm sáng. Giữ yên theo thời gian xác nhận; tên, viền vật thể, lịch sử và đọc tên hoạt động như chế độ chỉ tay.
5. Nếu chưa thấy điểm, thử đưa vật thể gần camera hơn. **Ngưỡng sáng của laser** chỉ áp dụng cho laser xanh. Chọn **Chỉ tay** để quay lại cách cũ.

Chuẩn bị model laser đỏ một lần: cài `requirements.txt`, chạy `python scripts/prepare_laser_model.py` (hoặc `scripts/setup.bat`). Script tải trọng số đã fine-tune, kiểm tra checksum và xuất `models/laser-advr-yolov5l6.torchscript` (~305 MB). Không cần huấn luyện lại, không nạp file này qua mục model đồ vật ở Cài đặt. Docker dùng cùng thư mục `models/` được mount vào `/models`.

`backend/services/laser_model.py` chạy YOLOv5l6 trên GPU nếu có, hoặc CPU; nạp một lần ở luồng khởi động, kích thước toàn ảnh mặc định 1280 và confidence 0.55. Khi đã bám chấm, AI tìm trong vùng 384×384 quanh `laser_hint`, giữ tỉ lệ pixel gần bằng lần quét toàn ảnh để bảo toàn chấm nhỏ. Nếu không có chấm đủ confidence trong bán kính bám, quét lại toàn ảnh ngay trong cùng request. Cấu hình `LASER_MODEL`, `LASER_IMAGE_SIZE`, `LASER_CONFIDENCE`, `LASER_CROP_SIZE` độc lập với YOLO đồ vật; `LASER_CROP_SIZE=0` tắt tìm theo vùng. Không có model hoặc model hỏng thì API báo 503 cho laser đỏ, không âm thầm quay về dò màu; chỉ tay và laser xanh vẫn hoạt động. `/api/vision/status` trả `laser_model` và `laser_error`, giao diện hiển thị tình trạng sẵn sàng.

`services/pointing.py` đối chiếu tọa độ laser với mask YOLO, ưu tiên vật nhỏ chứa điểm khi mask chồng nhau. Sai số mép laser là 4px ở khung cạnh dài 640px (tăng theo độ phân giải), độc lập vùng chấp nhận ngón tay. Backend không giữ trạng thái laser giữa các trình duyệt; `laser_hint` chỉ ưu tiên một chấm thực sự được phát hiện ở khung hiện tại.

Laser xanh vẫn dùng `backend/services/laser.py`: lọc HSV, độ sáng, tương phản và hình dạng; lõi trắng cần quầng xanh rõ. Thanh ngưỡng sáng chỉ điều chỉnh nhánh này. Model ADVR được huấn luyện cho laser đỏ, chưa dùng để suy luận laser xanh.

Laser gửi JPEG cạnh dài tối đa 1280px, chất lượng 0.94 để giữ chấm nhỏ; chỉ tay giữ 640px/0.82. Chế độ laser bỏ qua suy luận MediaPipe cho từng khung, vẫn dùng YOLO hiện tại. Chuyển chế độ/màu/ngưỡng sáng sẽ huỷ khung đang chờ và đặt lại xác nhận. Cài đặt lưu riêng trên trình duyệt.

Giới hạn: model đỏ vẫn có thể nhận nhầm LED/phản sáng. Trên ba ảnh thử, bản YOLOv5l6 ở 1280 chọn đúng chấm laser cả ba, nhưng trên bàn phím LED có confidence gần chấm thật (0.754 so với 0.787); đây không phải phép đo độ chính xác tổng quát. CPU chạy model lớn chậm hơn đáng kể. Chỉ gọi tên các lớp model đồ vật hỗ trợ và đang bật; tìm thấy laser trên tủ không đồng nghĩa model đồ vật nhận ra loại tủ đó.

Nguồn: [Davide Torielli / IIT — trọng số ADVR trên Zenodo](https://zenodo.org/records/10471835), CC BY 4.0; [mã nguồn nhóm tác giả](https://github.com/ADVRHumanoids/nn_laser_spot_tracking). Trọng số gốc `yolov5l6_e200_b8_tvt302010_laser_v5.pt`, MD5 `21b8e90b7707cb91054547c6558301e3`. Chuyển định dạng dùng [YOLOv5 v7.0](https://github.com/ultralytics/yolov5/tree/v7.0), GPL-3.0. TorchScript tránh xung đột package `models` của YOLOv5 cũ với backend; không cần ROS hoặc runtime YOLOv5 trong ứng dụng.

API `POST /api/vision/frame` thêm query `pointer_mode=hand|laser` (mặc định `hand`), `laser_color=red|green` (mặc định `red`), `laser_brightness=160..250` (mặc định `200`, chỉ cho xanh), `laser_hint=x,y`. Response có `laser: {point: [x,y], color, score} | null`; `score` là confidence của model đỏ hoặc điểm màu/độ sáng của nhánh xanh, không phải xác suất hiệu chuẩn. `tip` chỉ dành cho ngón tay; trong chế độ laser, `hand_detected=false`, `landmarks=[]`, `tip=null`.

## Thử bằng ảnh / video

Không cần camera: ở trang Tổng quan, kéo thả ảnh hoặc video vào thẻ **Ảnh / video thử** (hoặc bấm **Dùng ảnh / video** trên khung camera). File phát ngay trong khung camera và được nhận diện y như camera — chỉ tay, laser, giữ để xác nhận, lịch sử, chụp ảnh đều dùng được; video tự lặp lại, Tạm dừng dừng cả video. Ảnh tĩnh được vẽ lại 15 lần/giây nên "giữ để xác nhận" vẫn chạy.

File tải lên được **lưu thẳng vào `C:\Users\<tên>\Documents\virtual_cam`** của máy chạy máy chủ (tên thêm mốc thời gian, không ghi đè) và hiện trong danh sách của thẻ để bấm thử lại. Nhận JPG, PNG, WEBP, BMP, GIF, MP4, WEBM, MOV, M4V, OGV, tối đa 500 MB (`MAX_UPLOAD_MB`). Đổi thư mục: `UPLOAD_DIR` trong `backend/.env` (chạy trên Windows) hoặc `UPLOAD_HOST_DIR` trong `.env` gốc (Docker — `scripts/start.ps1` tự đặt về `%USERPROFILE%\Documents\virtual_cam` và mount vào container).

Video nên là MP4 (H.264) hoặc WEBM để trình duyệt phát được. API: `GET /api/media` (danh sách, thư mục lưu), `POST /api/media?name=<tên file>` (body là file thô), `GET /api/media/<tên>` (phát lại, hỗ trợ tua).

## Thêm mô hình nhận diện

Cài đặt → **Mô hình nhận diện**: kéo thả file YOLO `.pt` của Ultralytics (mô hình phân đoạn *segment* hoặc phát hiện vật thể *detect*, vd. tự huấn luyện hoặc `yolov8n-oiv7.pt` 600 lớp Open Images). Máy chủ nạp thử, rồi **mọi mô hình đang bật cùng chạy trên mỗi khung**:

- Danh sách vật thể ở Cài đặt / Tổng quan tự cập nhật thành hợp các lớp của các mô hình đang bật (lớp mới nằm ở nhóm "Khác"). Cùng tên lớp — không phân biệt hoa / thường, vd. `laptop` (COCO) và `Laptop` (Open Images) — là một vật thể; hai mô hình cùng thấy một vật thì giữ kết quả tin cậy hơn.
- Mô hình *detect* không có viền mask: viền vật thể lấy theo khung, luật chọn bằng ngón tay / laser giữ nguyên.
- Bật / tắt từng mô hình (tắt thì giải phóng GPU, vẫn giữ file; luôn còn ít nhất một mô hình bật), xoá mô hình tải thêm. Trạng thái nhớ trong `models.json`; file `.pt` chép tay vào thư mục cũng được nhận ở lần khởi động sau.
- File lưu ở `C:\Users\<tên>\Documents\virtual_cam\models` (`CUSTOM_MODEL_DIR`, tối đa `MAX_MODEL_MB` = 500 MB). Mỗi mô hình bật thêm làm mỗi khung chậm thêm.

**An toàn:** file `.pt` là pickle — nạp nó là chạy được mã tuỳ ý trên máy chủ. Vì vậy chỉ **chính máy chạy máy chủ** (mở bằng `http://localhost`) mới thêm / bật tắt / xoá được mô hình (`MODEL_ADMIN=local`); điện thoại / máy khác qua cổng HTTPS LAN chỉ xem. Docker map cổng HTTP về `127.0.0.1` vì lý do này. Chỉ tải lên mô hình từ nguồn tin cậy.

API: `GET /api/models`, `POST /api/models?name=<file>.pt` (body là file thô), `PATCH /api/models/<id>` (`{"enabled": true|false}`), `DELETE /api/models/<id>`; `GET /api/vision/status` có thêm `models`.

```
virtual_cam/
├── backend/     FastAPI: nhận khung JPEG → bàn tay + vật thể được chỉ (YOLO GPU + MediaPipe CPU chạy song song)
├── frontend/    React 19 + TypeScript + Vite + Ant Design + Redux Toolkit / redux-observable
├── desktop/     Bản desktop độc lập với web: finger_select.py (cửa sổ OpenCV, Logitech C930e /dev/video3 trên Linux,
│                bắt buộc GPU), segment.py (thử laser đỏ), camera_test.py, setup.sh (Linux)
├── models/      hand_landmarker.task, yolo26*-seg.pt — không commit (web mặc định yolo26m-seg.pt, finger_select.py
│                dùng yolo26l-seg.pt; scripts tự tải model còn thiếu)
├── docker/      Dockerfile, docker-compose.yml (một container web + API + GPU), docker-compose.cpu.yml (máy không GPU)
├── scripts/     setup.bat, run_web.bat (chạy trên Windows), start_docker.bat → start.ps1 (Docker tự theo máy)
└── requirements.txt (mọi thư viện Python: web, desktop, test — pip install -r requirements.txt), README.md, .env.example
```

## Tính năng

- **Tổng quan**: camera trực tiếp (hoặc ảnh / video tải lên để thử) với khung xương bàn tay, vòng “giữ để xác nhận” quanh đầu ngón trỏ, viền vật thể đang chọn và khung các vật thể khác; FPS, trạng thái bàn tay, số vật thể, số lượt chọn; chụp ảnh khung hình, toàn màn hình, phím tắt (Space tạm dừng, S chụp ảnh, F toàn màn hình). Tab bị ẩn thì tự ngừng gửi khung.
- **Lịch sử**: thống kê phiên (tổng lượt, vật thể chọn nhiều nhất, độ tin cậy trung bình, thời gian phiên), bảng lượt chọn, xuất CSV mở được bằng Excel.
- **Cài đặt** (lưu trên từng trình duyệt): chọn vật thể trong 79 lớp COCO (tìm không dấu), ngưỡng tin cậy, vùng chấp nhận quanh đầu ngón tay, thời gian giữ để xác nhận, lớp hiển thị, chế độ gương, đọc tên vật thể bằng giọng nói, địa chỉ cho điện thoại.
- **Hướng dẫn**, giao diện **tiếng Việt / English**, dùng được trên điện thoại (HTTPS trong mạng LAN).

## Chạy bằng Docker (một container, tự chọn GPU / CPU theo máy)

Bấm đúp **`scripts\start_docker.bat`** (hoặc `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`). Script tự:

1. Bật Docker Desktop nếu chưa chạy; tải `hand_landmarker.task` / model YOLO trong `YOLO_MODEL` (mặc định `yolo26m-seg.pt`) vào `models/` nếu thiếu.
2. Lấy IP LAN (cho điện thoại) và chọn cổng trống (mặc định 8032/8033, trùng thì lấy cặp khác) → ghi `.env`.
3. Dò GPU: có NVIDIA + Docker dùng được GPU → PyTorch CUDA (`cu128`…), không thì CPU (`docker/docker-compose.cpu.yml`, ảnh YOLO 480px).
4. Kiểm dung lượng ổ chứa dữ liệu Docker (build đầy đủ bản GPU cần ~20 GB, chỉ đổi code ~3 GB) và RAM trống trước khi build.
5. Build, chạy, chờ bộ nhận diện sẵn sàng, in địa chỉ và mở trình duyệt.

Chỉ chạy CPU (máy không có GPU NVIDIA, hoặc muốn nhường GPU cho việc khác): bấm đúp **`scripts\start_docker_cpu.bat`** hoặc gõ `.\start_cpu.ps1` trong thư mục `scripts` — giống `start.ps1 -Cpu`: PyTorch bản CPU (image nhẹ hơn, cần ~6 GB trống), không xin GPU, ảnh YOLO 480px (chậm hơn GPU; muốn nhanh hơn thêm `-ImageSize 320`). Chạy lại `start_docker.bat` để quay về GPU.

Tham số: `-Cpu` (ép CPU), `-PublicHost 192.168.1.10`, `-ImageSize 480`, `-Force` (bỏ qua kiểm tra dung lượng / RAM), `-NoBrowser`. Chạy lại bao nhiêu lần cũng được (sau khi sửa code chỉ build lại phần code, vài phút). Sau khi script đã ghi `.env`, lệnh tay `docker compose up -d --build` / `docker compose down` / `docker compose logs -f` chạy ở thư mục gốc cũng dùng đúng chế độ đó (`.env` trỏ `COMPOSE_FILE` vào `docker/`).

| Địa chỉ | Dùng cho |
|---|---|
| http://localhost:8032 | Máy chạy Docker |
| https://`LAN_IP`:8033 | Điện thoại / máy khác cùng Wi-Fi (chứng chỉ tự ký: chọn *Nâng cao → Tiếp tục*) |
| http://localhost:8032/docs | Tài liệu API (Swagger) |

Một image duy nhất (`docker/Dockerfile`, build context là thư mục gốc, loại trừ file theo `docker/Dockerfile.dockerignore`): bước 1 build giao diện React bằng Node, bước 2 là Python + PyTorch CUDA (`cu128`) + FastAPI; `backend/serve.py` phục vụ cả web lẫn API và cổng HTTPS cho điện thoại. `docker/docker-compose.yml` xin GPU NVIDIA (cần NVIDIA driver + Docker Desktop có WSL2 GPU); máy không có GPU dùng thêm `docker/docker-compose.cpu.yml` (script tự chọn). Thư mục `models/` mount vào container (chỉ đọc).

Image ~12 GB (thư viện CUDA): trước khi build xem ổ chứa dữ liệu Docker (máy này là `G:\DockerDesktopWSL`) còn ≥ 20 GB và đóng bớt ứng dụng nặng. Dockerfile dùng cache mount cho pip nên build lại sau khi hỏng không phải tải lại wheel.

## Chạy trực tiếp trên Windows (không Docker)

```bat
scripts\setup.bat              :: tạo .cam, cài thư viện (CUDA nếu có GPU), tải model vào models\, build giao diện
scripts\run_web.bat            :: http://localhost:8030 — tự mở trình duyệt
scripts\run_web.bat --lan      :: thêm https://<IP LAN>:8031 cho điện thoại (chứng chỉ tự ký trong backend/data/certs)
```

Lần đầu mở cổng LAN, Windows Firewall hỏi quyền cho Python — chọn *Allow* cho mạng Private.

## Phát triển

```bash
cd backend
..\.cam\Scripts\python.exe -m uvicorn main:app --reload --port 8030    # http://localhost:8030/docs

cd frontend
npm install
npm run dev                  # http://localhost:5180 (proxy /api → :8030)
```

Sau khi sửa frontend, chạy `npm run build` để `scripts\run_web.bat` / backend phục vụ bản mới (Docker: `docker compose up -d --build`).

## Cổng

| Cổng | Dùng cho |
|---|---|
| 8030 / 8031 | `scripts\run_web.bat` (HTTP / HTTPS LAN) |
| 8032 / 8033 | Docker (HTTP / HTTPS LAN, map vào 8030 / 8031 trong container) |
| 5180 | Vite dev |

Đã chọn để không trùng các dự án khác trên máy (8000, 8010, 8020, 8080, 8090, 8443, 8888, 3000–3333, 5173, 27017…). Đổi được qua `.env` (Docker: `WEB_PORT`, `LAN_HTTPS_PORT`; backend: `PORT`, `LAN_PORT`).

## Kiểm thử

```bash
cd backend && ..\.cam\Scripts\python.exe -m pytest        # API, chọn vật thể, tải ảnh / video, chứng chỉ, phục vụ SPA (không cần model)
cd backend && ..\.cam\Scripts\python.exe -m pytest -m model   # chạy YOLO + MediaPipe thật (~20 giây)
cd frontend && npm run lint && npm test && npm run build
```

## Kiến trúc & quy ước

Backend: `main.py` → `routers/vision.py` (HTTP: `GET /api/vision/status`, `POST /api/vision/frame` nhận ảnh JPEG thô + `targets` / `conf` / `tolerance`) → `services/detector.py` (một model dùng chung, khoá một khung một lúc, bàn tay chạy CPU song song YOLO trên GPU) → `services/pointing.py` (cùng luật với `find_object_at_point` của `finger_select.py`: bỏ vật mà đầu ngón trỏ nằm ngoài mép quá `tolerance`, còn lại chọn vật đầu ngón tay nằm sâu bên trong nhất, bằng nhau thì vật nhỏ hơn). `routers/models.py` + `services/model_store.py` quản lý mô hình tải thêm (Detector giữ danh sách mô hình, chạy lần lượt trên GPU rồi gộp kết quả). `routers/media.py` + `services/media.py` lưu / liệt kê / phát lại ảnh, video thử trong `UPLOAD_DIR`. Schema ở `models.py`, cấu hình `core/config.py` (pydantic-settings, `.env`). `serve.py` chạy HTTP + HTTPS LAN trong một tiến trình và phục vụ luôn `frontend/dist`.

Frontend: `Services/VisionService.ts` (RxJS ajax qua `HttpClient`, không axios/fetch) → `store/<feature>/{Slice,Epics,Selector}` (`vision`, `history`, `setting`) → `page/<Feature>`. Component không gọi API trực tiếp; mọi text qua `t()` (vi/en trong `translations/`); style bằng `.module.less`, import qua `@/`.

Luồng khung hình: `useFrameLoop` chụp khi camera có khung mới (`requestVideoFrameCallback`, có dự phòng cho trình duyệt cũ), thu xuống cạnh dài tối đa 640px (chỉ tay) hoặc 1280px (laser) và nén JPEG → `analyzeFrameRequest` → epic gọi API → `advanceTracking` (giữ để xác nhận, giữ tên thêm 500 ms) → `addSelection`. Tối đa hai request đang chờ, nhịp gửi theo thời gian xử lý máy chủ; bỏ phản hồi cũ, thử lại có khoảng nghỉ khi máy chủ bận. Tạm dừng, đổi camera/chế độ gương/chế độ chỉ/màu hoặc ngưỡng laser, mất kết nối hoặc ẩn tab sẽ huỷ vòng gửi và bỏ cả JPEG chưa nén xong của vòng cũ.

Khi thời gian xử lý trung bình vượt 250 ms, vòng gửi chỉ giữ một request để tránh tích ảnh cũ trong hàng chờ; khi máy chủ nhanh trở lại, tự cho phép hai request để gửi gối đầu. Timer bỏ qua các khung chưa đến lượt gửi và dùng bộ đếm khung video để ước lượng nhịp camera. Phần số liệu FPS được tách khỏi trang Tổng quan, nên mỗi kết quả không render lại thẻ ảnh/video, lịch sử và các điều khiển bên cạnh.

Video hiển thị trực tiếp theo tốc độ camera. `useOverlay` vẽ bàn tay và vòng tiến độ theo nhịp màn hình, nội suy ngắn giữa các kết quả; viền/nhãn vật thể ở canvas riêng, chỉ vẽ lại khi thay đổi. Nội suy chỉ tác động hình hiển thị, không đổi quyết định chọn vật thể; kết quả quá cũ tự ẩn. Chụp ảnh ghép video và hai lớp vẽ đang thấy, cạnh dài tối đa 1280px. FPS trên bảng là tốc độ **nhận diện**, không phải FPS video.

Backend giữ nguyên model, kích thước suy luận YOLO và độ chính xác tính toán. Chỉ chuyển bounding box về CPU một lần; mask chỉ lấy đường viền khi có điểm chỉ (ngón trỏ hoặc laser) ở gần vật thể, kể cả sai số mép tương ứng. Luật chọn bằng ngón tay được giữ nguyên; laser ưu tiên mask nhỏ nhất chứa điểm.

Laser đỏ ưu tiên suy luận vùng nhỏ quanh `laser_hint` của chính trình duyệt đang gửi khung. Vùng được dịch vào trong ảnh khi sát mép; tọa độ trả về luôn theo toàn ảnh. Chưa có gợi ý, gợi ý ngoài ảnh hoặc mất dấu thì quét toàn khung; chấm ngoài bán kính bám trong vùng nhỏ không được chặn bước tìm lại. Laser xanh cũng dò vùng nhỏ quanh gợi ý rồi quét lại toàn khung khi cần. Backend không lưu vị trí của trình duyệt trước. Model laser đỏ và YOLO vật thể dùng GPU lần lượt dưới cùng khóa để hạn chế bộ nhớ và tránh chồng suy luận. Khởi động làm nóng cả ảnh ngang, ảnh dọc và vùng bám.

Tìm theo vùng giảm thời gian khi chấm đang được bám ổn định; khi mất dấu sẽ tốn thêm một lần suy luận vùng nhỏ trước lần quét toàn ảnh. Thay đổi ngữ cảnh ảnh có thể làm confidence khác với quét toàn ảnh, nên cần thử trên cảnh thực tế; có thể đặt `LASER_CROP_SIZE=0` để so sánh.

Kiểm tra trình duyệt dùng camera giả lập, không mở webcam thật: `cd frontend && npm test` (Windows dùng Chrome đã cài; Linux cần `npx playwright install chromium`). Đo luồng camera với máy chủ đang chạy: `node scripts/benchmark-camera.mjs http://127.0.0.1:8032`. Chạy phép đo riêng, tránh cùng lúc chạy test model/build để số đo CPU/GPU không bị nhiễu.

Đo model AI laser đỏ: `.cam\Scripts\python.exe scripts\benchmark_laser_model.py <ảnh-laser-1.jpg> <ảnh-laser-2.jpg> --iterations 20`. Script dùng cùng model, luân phiên quét toàn ảnh và tìm theo vùng, báo median/p95 cho bắt đầu, bám chấm và tìm lại khi gợi ý sai; kèm tọa độ/confidence để đối chiếu. Số đo này chỉ tính bước tìm laser, chưa gồm YOLO đồ vật, truyền ảnh hay FPS camera.

Đo ngày 29/09/2026 trên RTX 3050 Laptop 6GB, ba ảnh laser đã tải lên, 20 mẫu mỗi cách và chạy luân phiên: median tìm laser khi đang bám giảm từ 159–178 ms xuống 44–46 ms. Đo riêng cả xử lý backend (giải mã JPEG + laser + YOLO26m-seg 640 + chọn vật) giảm từ 234–244 ms xuống 115–139 ms, nhanh hơn khoảng 1,7–2,1 lần; tọa độ khác tối đa 1px và kết quả chọn vật giống nhau trên ba ảnh. Đây là phép đo ảnh tĩnh, chưa gồm mạng/trình duyệt và không đại diện độ chính xác hay FPS camera thực tế. Khi phải tìm lại toàn ảnh, bước tìm laser tăng từ 146–175 ms lên 213–218 ms do chạy thêm vùng nhỏ trước.

Khung hình camera chỉ dùng để nhận diện rồi bỏ — không lưu ảnh/video; chỉ file người dùng chủ động tải lên ở thẻ Ảnh / video thử mới được lưu vào `UPLOAD_DIR`. Cài đặt nằm trong `localStorage`, lịch sử chỉ trong tab (tải lại trang là mất).

## Đồng bộ với finger_select.py

Web không import `desktop/finger_select.py`; các giá trị tương ứng nằm ở:

| `finger_select.py` | Web |
|---|---|
| `YOLO_MODEL`, `IMG_SIZE` | `YOLO_MODEL`, `IMAGE_SIZE` trong `.env` (backend: `core/config.py`) |
| `CONF`, `FINGER_TOLERANCE_PX`, `TARGET_NAMES` | `DEFAULT_CONFIDENCE`, `DEFAULT_TOLERANCE_PX`, `DEFAULT_TARGETS` (mỗi trình duyệt chỉnh lại được ở Cài đặt) |
| `find_object_at_point`, `get_index_tip` | `backend/services/pointing.py` |
| `HOLD_TIME` | `HOLD_MS` trong `frontend/src/common/constants.ts` |
| `draw_hand`, viền, tên vật thể | `frontend/src/utils/overlay.ts` (vẽ trên trình duyệt) |

Khác biệt cố ý: MediaPipe ở web chạy chế độ IMAGE (không tracking) vì một máy chủ phục vụ nhiều trình duyệt cùng lúc; camera là của từng trình duyệt thay cho `CAMERA`.
