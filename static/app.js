"use strict";
const $ = (id) => document.getElementById(id);
const names = {laptop: "Máy tính xách tay", mouse: "Chuột máy tính", keyboard: "Bàn phím"};
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const video = $("camera-video"), output = $("camera-stream"), ctx = output.getContext("2d");
const capture = document.createElement("canvas"), captureCtx = capture.getContext("2d");
let media = null, paused = false, generation = 0, controller = null, ready = false;
let events = [], selectionCount = 0, held = null, heldAt = 0, startedAt = null;
let lastEventVersion = -1, delays = [], activeMs = 0, lastTick = 0, toastTimer;
const viewTitles = {
  live: ["Tổng quan", "Không gian theo dõi", "Theo dõi chuyển động. Nhận diện vật thể ngay trong tầm tay."],
  history: ["Lịch sử lựa chọn", "Những lần chạm của bạn", "Mỗi lựa chọn là một khoảnh khắc. Xem lại ngay tại đây."],
  guide: ["Hướng dẫn", "Bắt đầu từ một ngón tay", "Ba bước đơn giản để khám phá không gian của bạn."],
};

function text(id, value) { $(id).textContent = value; }
function icon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("icon");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${kind}`); svg.append(use); return svg;
}
function toast(message) {
  text("toast", message); $("toast").hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").hidden = true, 4500);
}
function status(label, phase = "") {
  text("connection-label", label); $("connection").className = `status-pill ${phase}`;
}
function overlay(title, message, allowStart = false) {
  $("video-overlay").hidden = false;
  text("overlay-title", title); text("overlay-message", message);
  $("start-camera").hidden = !allowStart;
}
function badge(label, live = false) {
  $("live-badge").replaceChildren(Object.assign(document.createElement("span"), {className: "dot"}), document.createTextNode(label));
  $("live-badge").classList.toggle("live", live);
}
function setView(view) {
  if (!viewTitles[view]) view = "live";
  for (const name of Object.keys(viewTitles)) $(name + "-view").hidden = name !== view;
  document.querySelectorAll(".nav-item").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  const [breadcrumb, title, description] = viewTitles[view];
  text("breadcrumb-current", breadcrumb); text("page-title", title); text("page-description", description);
  history.replaceState(null, "", `#${view}`);
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
window.addEventListener("hashchange", () => setView(location.hash.slice(1)));
setView(location.hash.slice(1));
text("today", new Intl.DateTimeFormat("vi-VN", {day: "2-digit", month: "long", year: "numeric"}).format(new Date()));

function renderHistory() {
  if (lastEventVersion === selectionCount) return;
  lastEventVersion = selectionCount;
  $("history-empty").hidden = events.length > 0;
  $("history-body").replaceChildren();
  if (!events.length) return;
  $("recent-events").replaceChildren();
  events.forEach((event, index) => {
    const time = new Date(event.time).toLocaleTimeString("vi-VN");
    const confidence = `${Math.round(event.confidence * 100)}%`;
    const row = document.createElement("tr");
    [String(event.id).padStart(2, "0"), names[event.name] || event.name, time, confidence].forEach(value => {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    });
    $("history-body").append(row);
    if (index >= 3) return;
    const item = document.createElement("div"); item.className = "recent-event";
    const mark = document.createElement("div"); mark.className = "event-icon"; mark.append(icon(event.name in names ? event.name : "target"));
    const detail = document.createElement("div");
    const name = document.createElement("div"); name.className = "event-name"; name.textContent = names[event.name] || event.name;
    const caption = document.createElement("div"); caption.className = "event-subtitle"; caption.textContent = "Đã chọn bằng ngón trỏ";
    detail.append(name, caption);
    const clock = document.createElement("span"); clock.className = "event-time"; clock.textContent = time;
    const score = document.createElement("span"); score.className = "event-confidence"; score.textContent = confidence;
    item.append(mark, detail, clock, score); $("recent-events").append(item);
  });
}
function renderResult(result) {
  const now = performance.now();
  if (result.selected) {
    if (!held || held.name !== result.selected.name) {
      events.unshift({...result.selected, polygon: undefined, id: ++selectionCount, time: Date.now()});
      events = events.slice(0, 50);
    }
    held = result.selected; heldAt = now;
  } else if (now - heldAt > 500) held = null;
  text("fps", delays.length ? (1000 / (delays.reduce((a,b) => a+b, 0) / delays.length)).toFixed(1) : "—");
  text("hand-state", result.hand_detected ? "Đã nhận diện" : "Chưa thấy tay");
  text("hand-note", result.hand_detected ? "Đang theo dõi đầu ngón trỏ" : "Đưa bàn tay vào khung hình");
  text("object-count", result.detections.length);
  text("selection-count", selectionCount);
  text("selected-name", held ? names[held.name] || held.name : "Chưa có lựa chọn");
  text("selection-kicker", held ? "ĐÃ CHỌN BẰNG NGÓN TRỎ" : "SẴN SÀNG NHẬN DIỆN");
  text("selected-description", held ? "Vật thể tại vị trí đầu ngón trỏ của bạn." : "Đưa ngón trỏ vào vùng vật thể để xem kết quả tại đây.");
  $("selected-icon").replaceChildren(icon(held && held.name in names ? held.name : "target"));
  document.querySelector(".selection-panel").classList.toggle("has-selection", !!held);
  const confidence = held ? Math.round(held.confidence * 100) : 0;
  text("confidence", held ? `${confidence}%` : "—");
  $("confidence-fill").style.width = `${confidence}%`;
  for (const row of document.querySelectorAll("[data-target]")) {
    const count = result.detections.filter(object => object.name === row.dataset.target).length;
    row.classList.toggle("detected", count > 0);
    row.querySelector(".target-count").textContent = count ? `${count} vật thể` : "—";
  }
  text("resolution", `${result.resolution.width} × ${result.resolution.height}`);
  text("stream-label", `Đang nhận diện · ${result.processing_ms} ms`);
  renderHistory();
}
function drawResult(result) {
  output.width = capture.width; output.height = capture.height;
  ctx.drawImage(capture, 0, 0);
  const points = result.landmarks.map(point => [point.x * output.width, point.y * output.height]);
  ctx.lineWidth = 2; ctx.strokeStyle = "#64e0b0";
  if (points.length === 21) {
    ctx.beginPath();
    for (const [a,b] of connections) { ctx.moveTo(...points[a]); ctx.lineTo(...points[b]); }
    ctx.stroke();
    ctx.fillStyle = "#f4fffa";
    for (const p of points) { ctx.beginPath(); ctx.arc(...p, 3, 0, Math.PI*2); ctx.fill(); }
  }
  if (result.tip) { ctx.beginPath(); ctx.arc(...result.tip, 13, 0, Math.PI*2); ctx.stroke(); }
  const polygon = result.selected?.polygon;
  if (polygon?.length) {
    ctx.beginPath(); ctx.moveTo(...polygon[0]);
    for (const point of polygon.slice(1)) ctx.lineTo(...point);
    ctx.closePath(); ctx.fillStyle = "#47d69b22"; ctx.fill(); ctx.stroke();
  }
  output.hidden = false; video.hidden = true;
}
function clearLiveMetrics() {
  held = null; delays = [];
  renderResult({hand_detected: false, detections: [], selected: null, resolution: {width: "—", height: "—"}, processing_ms: 0});
  text("fps", "—"); text("object-count", "—"); text("hand-state", "Đang chờ");
}
function stopCamera(showMessage = true) {
  generation++; controller?.abort(); controller = null;
  if (media) media.getTracks().forEach(track => track.stop());
  media = null; video.srcObject = null; paused = false;
  output.hidden = true; video.hidden = true;
  $("pause-button").disabled = true; $("stop-camera").disabled = true;
  $("camera-select").disabled = true;
  clearLiveMetrics(); badge("CAMERA ĐÃ TẮT"); text("stream-label", "Camera chưa bật");
  if (showMessage) {
    status(ready ? "Sẵn sàng" : "Đang kết nối");
    overlay("Camera đã tắt", "Bật lại camera để tiếp tục phiên theo dõi của riêng bạn.", true);
  }
}
function cameraError(error) {
  const messages = {
    NotAllowedError: "Quyền camera chưa được cấp. Cho phép camera trong cài đặt trang của trình duyệt rồi thử lại.",
    NotFoundError: "Không tìm thấy camera. Hãy kết nối webcam hoặc thử trên thiết bị có camera.",
    NotReadableError: "Không mở được camera. Hãy đóng ứng dụng khác đang sử dụng camera và thử lại.",
    OverconstrainedError: "Camera đã chọn không còn khả dụng. Hãy tải lại trang để chọn camera khác.",
  };
  return messages[error.name] || error.message || "Không thể mở camera. Hãy thử lại.";
}
async function startCamera(deviceId = "") {
  stopCamera(false);
  const run = generation;
  $("start-camera").disabled = true;
  overlay("Đang mở camera của bạn", "Cho phép truy cập camera khi trình duyệt yêu cầu.");
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera trình duyệt cần HTTPS hoặc localhost. Hãy dùng địa chỉ HTTPS của máy chủ khi mở trên điện thoại hoặc máy khác.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {
      width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 30, max: 30},
      ...(deviceId ? {deviceId: {exact: deviceId}} : {facingMode: "environment"}),
    }});
    if (generation !== run) { stream.getTracks().forEach(track => track.stop()); return; }
    media = stream; video.srcObject = stream; await video.play();
    if (generation !== run) return;
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
    $("camera-select").replaceChildren();
    cameras.forEach((camera, index) => {
      const option = new Option(camera.label || `Camera ${index+1}`, camera.deviceId);
      $("camera-select").append(option);
    });
    $("camera-select").value = stream.getVideoTracks()[0].getSettings().deviceId;
    $("camera-select").disabled = cameras.length < 2;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (generation === run) { stopCamera(false); status("Mất kết nối camera", "error"); overlay("Camera đã ngắt kết nối", "Kiểm tra thiết bị và bật lại camera.", true); }
    });
    $("stop-camera").disabled = false; $("pause-button").disabled = false;
    $("pause-button").replaceChildren(icon("pause"), document.createTextNode("Tạm dừng"));
    $("video-overlay").hidden = true; video.hidden = false;
    if (!startedAt) startedAt = Date.now();
    lastTick = performance.now();
    processFrame(run);
  } catch (error) {
    if (generation !== run) return;
    stopCamera(false); status("Chưa mở được camera", "error");
    overlay("Cần kết nối camera", cameraError(error), true);
  } finally { $("start-camera").disabled = false; }
}
async function processFrame(run) {
  if (run !== generation || !media || paused) return;
  if (!ready || video.readyState < 2) {
    badge("ĐANG KHỞI ĐỘNG"); text("stream-label", "Đang chờ bộ nhận diện");
    setTimeout(() => processFrame(run), 400); return;
  }
  const tick = performance.now();
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  capture.width = Math.max(16, Math.round(video.videoWidth * scale));
  capture.height = Math.max(16, Math.round(video.videoHeight * scale));
  captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
  const blob = await new Promise(resolve => capture.toBlob(resolve, "image/jpeg", .82));
  if (run !== generation || paused) return;
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 15000);
  let retryDelay = 0;
  try {
    if (!blob) throw new Error("Không lấy được hình camera.");
    const response = await fetch("/api/frame", {method: "POST", headers: {"Content-Type": "image/jpeg"}, body: blob, signal: controller.signal});
    const result = await response.json();
    if (run !== generation || paused) return;
    if (!response.ok) {
      retryDelay = response.status === 429 ? 600 + Math.random()*500 : 1500;
      throw new Error(result.message || "Máy chủ chưa sẵn sàng.");
    }
    const end = performance.now();
    delays.push(end - lastTick); delays = delays.slice(-20); lastTick = end; activeMs += end - tick;
    drawResult(result); renderResult(result);
    $("video-overlay").hidden = true;
    badge("TRỰC TIẾP", true); status("Đang nhận diện", "live");
  } catch (error) {
    if (run !== generation || paused) return;
    retryDelay = retryDelay || 1500;
    status("Đang kết nối lại", "error"); badge("TẠM GIÁN ĐOẠN");
    text("fps", "—"); text("stream-label", "Đang thử kết nối lại…");
    overlay("Đang chờ máy chủ", error.name === "AbortError" ? "Máy chủ phản hồi chậm. Đang tự động thử lại…" : error.message);
  } finally {
    clearTimeout(timeout);
    if (run === generation && media && !paused) setTimeout(() => processFrame(run), Math.max(retryDelay, 45 - (performance.now() - tick)));
  }
}
$("start-camera").addEventListener("click", () => startCamera($("camera-select").value));
$("stop-camera").addEventListener("click", () => stopCamera());
$("camera-select").addEventListener("change", () => startCamera($("camera-select").value));
$("pause-button").addEventListener("click", () => {
  if (!media) return;
  paused = !paused; generation++; controller?.abort();
  $("pause-button").replaceChildren(icon(paused ? "play" : "pause"), document.createTextNode(paused ? "Tiếp tục" : "Tạm dừng"));
  if (paused) {
    overlay("Đã tạm dừng nhận diện", "Camera vẫn bật. Nhấn Tiếp tục để nhận diện hoặc Tắt camera để ngắt thiết bị.");
    status("Đã tạm dừng"); badge("TẠM DỪNG"); text("stream-label", "Không gửi khung hình");
  } else {
    $("video-overlay").hidden = true; lastTick = performance.now(); delays = []; processFrame(generation);
  }
});
$("fullscreen-button").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($("video-stage").requestFullscreen) await $("video-stage").requestFullscreen();
    else toast("Trình duyệt này chưa hỗ trợ chế độ toàn màn hình.");
  } catch { toast("Không thể mở toàn màn hình trên trình duyệt này."); }
});
async function pollStatus() {
  try {
    const response = await fetch("/api/status", {signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error();
    const info = await response.json(); ready = info.phase === "ready";
    text("device-label", `${info.device} · ${info.model} · ${info.image_size}px`);
    if (!media) {
      status(ready ? "Sẵn sàng" : info.phase === "error" ? "Lỗi máy chủ" : "Đang khởi động", info.phase === "error" ? "error" : "");
      if (info.phase === "error") overlay("Bộ nhận diện chưa sẵn sàng", info.message, true);
    }
  } catch {
    ready = false; status("Mất kết nối máy chủ", "error");
    text("device-label", "Không kết nối được máy chủ nhận diện");
    if (media && !paused) overlay("Mất kết nối máy chủ", "Giữ trang này mở. Hệ thống sẽ tự kết nối lại.");
  } finally { setTimeout(pollStatus, 3000); }
}
setInterval(() => {
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  text("session-time", `Phiên của bạn · ${String(Math.floor(elapsed/60)).padStart(2,"0")}:${String(elapsed%60).padStart(2,"0")}`);
}, 1000);
window.addEventListener("pagehide", () => stopCamera(false));
pollStatus();
