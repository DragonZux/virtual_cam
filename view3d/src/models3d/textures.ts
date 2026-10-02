// Ảnh bề mặt vẽ bằng canvas lúc chạy (không tải file, hợp CSP của backend): sọc, đốm, nhãn chữ, màn hình…
// Cùng tham số trả lại cùng một texture nên gọi thẳng trong component cũng không tốn.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

import { range, seeded } from "./shapes";

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, CanvasTexture>();

/**
 * Texture vẽ tay bằng canvas cho mô hình cần hoạ tiết riêng: key phải là duy nhất theo tham số vẽ
 * (cùng key trả lại texture đã vẽ). Đã đặt sRGB + lặp ở mép.
 */
export const drawTexture = (key: string, width: number, height: number, draw: Draw): CanvasTexture => {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  cache.set(key, texture);
  return texture;
};

const FONT = '"Segoe UI", Arial, sans-serif';

/** Sọc xen kẽ a / b; vertical = sọc chạy dọc ảnh (quanh thân trụ / cầu theo chiều u) */
export const stripes = (a: string, b: string, count = 8, vertical = true, wobble = 0) =>
  drawTexture(`stripes:${a}:${b}:${count}:${vertical}:${wobble}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    const step = (vertical ? w : h) / count;
    const rand = seeded(count * 31 + 7);
    for (const i of range(count)) {
      ctx.beginPath();
      const start = i * step + step / 2;
      const width = step / 2;
      // wobble > 0: sọc lượn (ngựa vằn)
      const n = 16;
      const along = vertical ? h : w;
      const offset = range(n + 1).map(() => (rand() - 0.5) * wobble * step);
      const point = (t: number, x: number): [number, number] => (vertical ? [x, t] : [t, x]);
      range(n + 1).forEach((k) => {
        const [px, py] = point((k / n) * along, start + offset[k]);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      for (const k of range(n + 1).reverse()) {
        const [px, py] = point((k / n) * along, start + width + offset[k] * 0.6);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  });

/** Đốm tròn méo màu spot trên nền base (bò sữa, chó đốm, vỏ trứng…) */
export const spots = (base: string, spot: string, count = 12, seed = 1, minR = 0.05, maxR = 0.14) =>
  drawTexture(`spots:${base}:${spot}:${count}:${seed}:${minR}:${maxR}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = spot;
    const rand = seeded(seed);
    for (const _ of range(count)) {
      const cx = rand() * w;
      const cy = rand() * h;
      const r = (minR + rand() * (maxR - minR)) * w;
      // Vẽ cả bản lặp ở mép để texture khép kín khi quấn quanh vật
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          ctx.beginPath();
          const n = 10;
          range(n).forEach((k) => {
            const a = (k / n) * Math.PI * 2;
            const rr = r * (0.7 + rand() * 0.5);
            const px = cx + dx + Math.cos(a) * rr;
            const py = cy + dy + Math.sin(a) * rr * 0.8;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  });

/** Mảng đa giác màu patch ngăn bởi đường màu gap (hươu cao cổ) — Voronoi đơn giản, khép kín ở mép */
export const patches = (patch: string, gap: string, cells = 20, seed = 3, gapWidth = 0.06) =>
  drawTexture(`patches:${patch}:${gap}:${cells}:${seed}:${gapWidth}`, 256, 256, (ctx, w, h) => {
    const rand = seeded(seed);
    const points = range(cells).map(() => [rand() * w, rand() * h] as const);
    const image = ctx.createImageData(w, h);
    const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [pr, pg, pb] = parse(patch);
    const [gr, gg, gb] = parse(gap);
    const limit = gapWidth * w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let d1 = Infinity;
        let d2 = Infinity;
        for (const [px, py] of points) {
          const dx = Math.min(Math.abs(x - px), w - Math.abs(x - px));
          const dy = Math.min(Math.abs(y - py), h - Math.abs(y - py));
          const d = Math.hypot(dx, dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
        const edge = d2 - d1 < limit;
        const i = (y * w + x) * 4;
        image.data[i] = edge ? gr : pr;
        image.data[i + 1] = edge ? gg : pg;
        image.data[i + 2] = edge ? gb : pb;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

/** Chấm nhỏ nhiều màu trên nền (vỏ bánh mì, hạt dâu, vụn pizza, đá mài…) */
export const speckle = (base: string, dots: string[], count = 160, seed = 5, size = 0.012) =>
  drawTexture(`speckle:${base}:${dots.join(",")}:${count}:${seed}:${size}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(seed);
    for (const _ of range(count)) {
      ctx.fillStyle = dots[Math.floor(rand() * dots.length)];
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, size * w * (0.6 + rand()), size * w * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Chuyển màu thẳng qua các màu (dọc từ trên xuống, hoặc ngang) */
export const gradient = (colors: string[], vertical = true) =>
  drawTexture(`gradient:${colors.join(",")}:${vertical}`, 64, 256, (ctx, w, h) => {
    const g = vertical ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, 0);
    colors.forEach((c, i) => g.addColorStop(colors.length > 1 ? i / (colors.length - 1) : 0, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

/** Lưới ô vuông bo góc (phím bấm, gạch, bánh quế…): cols × rows ô màu cell trên nền base */
export const grid = (base: string, cell: string, cols: number, rows: number, gapRatio = 0.14) =>
  drawTexture(`grid:${base}:${cell}:${cols}:${rows}:${gapRatio}`, 512, Math.max(64, Math.round((512 * rows) / cols)), (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    const gap = Math.min(cw, ch) * gapRatio;
    ctx.fillStyle = cell;
    for (const r of range(rows)) {
      for (const c of range(cols)) {
        ctx.beginPath();
        ctx.roundRect(c * cw + gap / 2, r * ch + gap / 2, cw - gap, ch - gap, gap);
        ctx.fill();
      }
    }
  });

interface LabelOptions {
  bg?: string;
  fg?: string;
  /** Tỉ lệ rộng / cao của ảnh (mặt dán nhãn) */
  aspect?: number;
  /** Cỡ chữ so với chiều cao ảnh */
  size?: number;
  weight?: number;
  /** Viền trong cách mép */
  border?: string;
}

/** Nhãn chữ căn giữa (biển STOP, nhãn chai, bìa sách, hộp vật thể lạ…) */
export const label = (text: string, { bg = "#ffffff", fg = "#333333", aspect = 2, size = 0.42, weight = 700, border }: LabelOptions = {}) =>
  drawTexture(`label:${text}:${bg}:${fg}:${aspect}:${size}:${weight}:${border ?? ""}`, 512, Math.round(512 / aspect), (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = h * 0.05;
      ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = h * size;
    ctx.font = `${weight} ${fontSize}px ${FONT}`;
    // Chữ dài thì thu nhỏ cho vừa bề ngang
    const maxWidth = w * 0.86;
    const measured = ctx.measureText(text).width;
    if (measured > maxWidth) {
      fontSize *= maxWidth / measured;
      ctx.font = `${weight} ${fontSize}px ${FONT}`;
    }
    ctx.fillText(text, w / 2, h / 2 + fontSize * 0.04);
  });

/** Hình nền màn hình đang bật: desktop (laptop / tivi) hoặc phone (lưới biểu tượng ứng dụng) */
export const screen = (variant: "desktop" | "phone" = "desktop") =>
  drawTexture(`screen:${variant}`, variant === "phone" ? 256 : 512, variant === "phone" ? 512 : 320, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#ffb15c");
    g.addColorStop(0.55, "#fb8020");
    g.addColorStop(1, "#7a2e8c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Vệt sáng mềm
    const glow = ctx.createRadialGradient(w * 0.25, h * 0.3, 0, w * 0.25, h * 0.3, w * 0.6);
    glow.addColorStop(0, "rgba(255,255,255,0.45)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    if (variant === "phone") {
      ctx.font = `600 ${w * 0.16}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("09:41", w / 2, h * 0.17);
      const size = w * 0.15;
      for (const r of range(4)) {
        for (const c of range(4)) {
          ctx.fillStyle = `rgba(255,255,255,${0.55 + ((r + c) % 3) * 0.12})`;
          ctx.beginPath();
          ctx.roundRect(w * 0.12 + c * w * 0.2, h * 0.32 + r * w * 0.22, size, size, size * 0.28);
          ctx.fill();
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.roundRect(w * 0.08, h * 0.86, w * 0.84, w * 0.2, w * 0.08);
      ctx.fill();
    } else {
      // Thanh tác vụ + vài cửa sổ
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(0, h * 0.9, w, h * 0.1);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.beginPath();
      ctx.roundRect(w * 0.52, h * 0.16, w * 0.38, h * 0.5, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(251,128,32,0.55)";
      ctx.fillRect(w * 0.55, h * 0.24, w * 0.32, h * 0.05);
      ctx.fillRect(w * 0.55, h * 0.33, w * 0.22, h * 0.05);
      ctx.fillRect(w * 0.55, h * 0.42, w * 0.27, h * 0.05);
      for (const i of range(5)) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.roundRect(w * 0.04, h * 0.08 + i * h * 0.15, h * 0.1, h * 0.1, 6);
        ctx.fill();
      }
    }
  });

/** Mặt đồng hồ: vạch phút / giờ, số 12-3-6-9 */
export const clockFace = (face = "#fafafa", ink = "#333333", accent = "#fb8020") =>
  drawTexture(`clock:${face}:${ink}:${accent}`, 512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = face;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = ink;
    for (const i of range(60)) {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      ctx.lineWidth = major ? 10 : 4;
      const r1 = c * (major ? 0.78 : 0.84);
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1);
      ctx.lineTo(c + Math.sin(a) * c * 0.9, c - Math.cos(a) * c * 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.font = `600 ${w * 0.11}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (["12", "3", "6", "9"] as const).forEach((text, i) => {
      const a = (i / 4) * Math.PI * 2;
      ctx.fillText(text, c + Math.sin(a) * c * 0.62, c - Math.cos(a) * c * 0.62);
    });
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(c, c, w * 0.025, 0, Math.PI * 2);
    ctx.fill();
  });
