// Synthetic camera only. Usage: node scripts/benchmark-camera.mjs http://127.0.0.1:8032
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  channel: process.platform === "win32" ? "chrome" : undefined,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.cameraBenchmark = { videoCopies: 0, copiedPixels: 0, longTasks: 0, longTaskMs: 0, encoderMs: [] };
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      const start = performance.now();
      encode.call(this, (blob) => {
        if (type === "image/jpeg") window.cameraBenchmark.encoderMs.push(performance.now() - start);
        callback(blob);
      }, type, quality);
    };
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      // Detached opaque canvases are the upload/display-copy path, excluding the visible overlay.
      if (!this.canvas.isConnected && (args[0] instanceof HTMLVideoElement || args[0] instanceof HTMLCanvasElement)) {
        window.cameraBenchmark.videoCopies++;
        window.cameraBenchmark.copiedPixels += this.canvas.width * this.canvas.height;
      }
      return original.apply(this, args);
    };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.cameraBenchmark.longTasks++;
        window.cameraBenchmark.longTaskMs += entry.duration;
      }
    }).observe({ type: "longtask", buffered: false });
  });
  const startupProcessing = [];
  page.on("response", async (response) => {
    if (response.url().includes("/vision/frame") && response.ok() && startupProcessing.length < 5) {
      startupProcessing.push((await response.json()).processing_ms);
    }
  });
  await page.goto(process.argv[2] ?? "http://127.0.0.1:8032");
  await page.getByRole("button", { name: /Bật camera|Start camera/ }).click();
  await page.waitForResponse((response) => response.url().includes("/vision/frame") && response.ok());
  await page.waitForTimeout(2000);
  const times = [];
  const responses = [];
  const requests = new Map();
  const statuses = {};
  const intervals = [];
  let lastRequestAt = 0;
  const onRequest = (request) => {
    if (request.url().includes("/vision/frame")) {
      const now = performance.now();
      if (lastRequestAt) intervals.push(now - lastRequestAt);
      lastRequestAt = now;
      requests.set(request, now);
    }
  };
  const onResponse = async (response) => {
    const start = requests.get(response.request());
    if (start === undefined) return;
    times.push(performance.now() - start);
    statuses[response.status()] = (statuses[response.status()] ?? 0) + 1;
    if (response.ok()) responses.push((await response.json()).processing_ms);
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  const before = await page.evaluate(() => ({
    ...window.cameraBenchmark, frames: document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames,
  }));
  const started = performance.now();
  await page.waitForTimeout(10000);
  const seconds = (performance.now() - started) / 1000;
  const after = await page.evaluate(() => ({
    ...window.cameraBenchmark, frames: document.querySelector("video").getVideoPlaybackQuality().totalVideoFrames,
  }));
  page.off("request", onRequest);
  page.off("response", onResponse);
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  console.log(JSON.stringify({
    url: page.url(), seconds: +seconds.toFixed(1), samples: times.length,
    video_fps: +((after.frames - before.frames) / seconds).toFixed(1),
    inference_fps: +(times.length / seconds).toFixed(1),
    round_trip_median_ms: +median(times).toFixed(1), processing_median_ms: median(responses),
    request_interval_median_ms: +median(intervals).toFixed(1),
    request_interval_p95_ms: +intervals.sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)].toFixed(1),
    processing_p95_ms: responses.sort((a, b) => a - b)[Math.floor(responses.length * 0.95)],
    response_statuses: statuses,
    startup_processing_ms: startupProcessing,
    jpeg_median_ms: +median(after.encoderMs).toFixed(1),
    jpeg_p95_ms: +after.encoderMs.sort((a, b) => a - b)[Math.floor(after.encoderMs.length * 0.95)].toFixed(1),
    copies_per_request: +((after.videoCopies - before.videoCopies) / times.length).toFixed(2),
    copied_megapixels_per_second: +((after.copiedPixels - before.copiedPixels) / seconds / 1e6).toFixed(2),
    long_tasks: after.longTasks - before.longTasks, long_task_ms: +(after.longTaskMs - before.longTaskMs).toFixed(1),
  }, null, 2));
} finally {
  await browser.close();
}
