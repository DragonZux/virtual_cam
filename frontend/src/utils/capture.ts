import { DISPLAY_MAX_SIDE } from "@/common/constants";

const fitCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  // Gán width/height luôn xoá canvas → chỉ gán khi kích thước đổi
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
};

/**
 * Chụp khung hiện tại của video:
 * Vẽ trực tiếp vào kích thước cần dùng, không sao chép qua canvas 720p mỗi lần nhận diện.
 * Chế độ gương lật ngay từ đây nên toạ độ máy chủ trả về khớp đúng hình người dùng thấy.
 */
export const captureFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  mirror: boolean,
  maxSide = DISPLAY_MAX_SIDE,
): boolean => {
  const { videoWidth: width, videoHeight: height } = video;
  if (!width || !height) return false;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  fitCanvas(canvas, Math.max(16, Math.round(width * scale)), Math.max(16, Math.round(height * scale)));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return false;
  ctx.save();
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return true;
};

export const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
