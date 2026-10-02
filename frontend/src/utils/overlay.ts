import type { FrameResult, SelectedObject } from "@/common/types";
import { BRAND } from "@/theme/antdTheme";

export interface OverlayOptions {
  /** Vẽ chấm laser + vòng tiến độ (lớp vẽ lại theo nhịp màn hình) */
  showPointer: boolean;
  showOutline: boolean;
  showBoxes: boolean;
  /** 0..1 — tiến độ giữ chấm laser để xác nhận lựa chọn */
  progress: number;
  /** Tên hiển thị của lớp (đã dịch) */
  label: (name: string) => string;
}

const COLORS = {
  ring: "rgba(255, 255, 255, 0.35)",
  pending: "#ffd166",
  selected: BRAND.primary,
  selectedFill: "rgba(251, 128, 32, 0.2)",
  box: "rgba(242, 242, 242, 0.8)",
  chip: "rgba(51, 51, 51, 0.85)",
  chipText: "#ffffff",
};

type Ctx = CanvasRenderingContext2D;

const chip = (ctx: Ctx, text: string, x: number, y: number, unit: number, color: string) => {
  ctx.font = `600 ${Math.round(12 * unit)}px "Segoe UI", Arial, sans-serif`;
  const padding = 7 * unit;
  const height = 21 * unit;
  const width = ctx.measureText(text).width + padding * 2;
  const left = Math.min(Math.max(x, 0), ctx.canvas.width - width);
  const top = Math.min(Math.max(y - height - 4 * unit, 0), ctx.canvas.height - height);
  ctx.fillStyle = COLORS.chip;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 5 * unit);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + padding, top + height / 2);
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

const drawBoxes = (ctx: Ctx, result: FrameResult, scale: number, unit: number, opts: OverlayOptions) => {
  ctx.save();
  ctx.setLineDash([6 * unit, 5 * unit]);
  ctx.lineWidth = 1.5 * unit;
  ctx.strokeStyle = COLORS.box;
  result.detections.forEach((detection, index) => {
    if (opts.showOutline && index === result.selected?.index) return;
    const [x1, y1, x2, y2] = detection.box.map((v) => v * scale);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    chip(ctx, `${opts.label(detection.name)} ${percent(detection.confidence)}`, x1, y1, unit, COLORS.chipText);
  });
  ctx.restore();
};

const drawSelected = (ctx: Ctx, selected: SelectedObject, scale: number, unit: number, opts: OverlayOptions) => {
  if (selected.polygon.length < 3) return;
  ctx.beginPath();
  selected.polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
  ctx.closePath();
  ctx.fillStyle = COLORS.selectedFill;
  ctx.fill();
  ctx.lineWidth = 3 * unit;
  ctx.strokeStyle = COLORS.selected;
  ctx.stroke();
  // Nhãn đặt ở điểm cao nhất của viền
  const [topX, topY] = selected.polygon.reduce((a, b) => (b[1] < a[1] ? b : a));
  chip(ctx, `${opts.label(selected.name)} ${percent(selected.confidence)}`, topX * scale, topY * scale, unit, COLORS.selected);
};

const drawTip = (ctx: Ctx, tip: [number, number], scale: number, unit: number, progress: number) => {
  const [x, y] = [tip[0] * scale, tip[1] * scale];
  const radius = 14 * unit;
  ctx.lineWidth = 3 * unit;
  ctx.strokeStyle = COLORS.ring;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (progress > 0) {
    ctx.strokeStyle = progress >= 1 ? COLORS.selected : COLORS.pending;
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
  ctx.fillStyle = progress >= 1 ? COLORS.selected : COLORS.pending;
  ctx.beginPath();
  ctx.arc(x, y, 3.5 * unit, 0, Math.PI * 2);
  ctx.fill();
};

/**
 * Vẽ kết quả nhận diện lên lớp canvas trong suốt đè trên video trực tiếp (video chạy mượt theo camera,
 * lớp này có thể nội suy theo nhịp màn hình). Canvas cùng tỉ lệ với video nên letterbox khớp video;
 * toạ độ máy chủ theo khung gửi đi → nhân `scale`.
 */
export const drawResult = (
  canvas: HTMLCanvasElement,
  frame: { width: number; height: number },
  result: FrameResult,
  opts: OverlayOptions,
) => {
  if (!frame.width || !frame.height) return;
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = frame.width / result.resolution.width;
  const unit = Math.max(1, frame.width / 640);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.showBoxes) drawBoxes(ctx, result, scale, unit, opts);
  if (opts.showOutline && result.selected) drawSelected(ctx, result.selected, scale, unit, opts);
  if (opts.showPointer && result.laser) {
    const [x, y] = result.laser.point.map((value) => value * scale);
    drawTip(ctx, result.laser.point, scale, unit, opts.progress);
    ctx.strokeStyle = "#ff6464";
    ctx.lineWidth = 2 * unit;
    ctx.beginPath();
    for (const direction of [-1, 1]) {
      ctx.moveTo(x + direction * 18 * unit, y);
      ctx.lineTo(x + direction * 24 * unit, y);
      ctx.moveTo(x, y + direction * 18 * unit);
      ctx.lineTo(x, y + direction * 24 * unit);
    }
    ctx.stroke();
  }
};
