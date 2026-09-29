/**
 * Bám chấm laser qua nhiều khung (máy chủ xét từng khung độc lập):
 * - Chưa bám chấm nào: nhận ngay (máy chủ đã tự bỏ khung có hai chấm giống nhau), không làm chậm lúc bật laser.
 * - Chấm nhảy xa chỗ đang bám phải lặp lại ở cùng chỗ CONFIRM_FRAMES khung liền mới được nhận,
 *   nên một khung nhiễu (đèn LED, phản chiếu) không làm chấm / vật được chọn nhảy đi.
 * - Chấm gần chỗ đang bám thì nhận ngay; rung nhẹ được làm mượt, di chuyển thật thì bám theo không trễ.
 * - Mất chấm vài khung (tay rung, nhoè) vẫn giữ vị trí cũ tối đa MAX_MISSES khung rồi mới bỏ.
 * Vị trí ổn định cũng được gửi lên máy chủ (laser_hint) để ưu tiên ứng viên gần đó.
 */
export type LaserPoint = [number, number];

export interface LaserTrack {
  /** Vị trí ổn định (pixel của khung) đang hiển thị và gửi làm gợi ý; null = chưa bám được chấm nào */
  point: LaserPoint | null;
  /** Chấm ở chỗ khác đang chờ lặp lại đủ số khung */
  candidate: { point: LaserPoint; count: number } | null;
  /** Số khung liền không thấy chấm ở chỗ đang bám */
  misses: number;
}

export const EMPTY_LASER_TRACK: LaserTrack = { point: null, candidate: null, misses: 0 };

/** Bán kính "cùng một chấm" giữa hai khung, pixel ở khung cạnh dài 640 (khớp HINT_RADIUS của backend) */
export const LASER_GATE = 40;
export const CONFIRM_FRAMES = 2;
export const MAX_MISSES = 3;
/** Dịch chuyển dưới mức này (pixel ở khung 640) coi là rung tay → làm mượt; lớn hơn thì theo ngay */
const JITTER = 4;
/** Trọng số vị trí mới khi làm mượt rung tay (1 = không làm mượt) */
const SMOOTHING = 0.5;

export interface LaserStep {
  track: LaserTrack;
  /** Chấm của khung này trùng chỗ đang bám → vật máy chủ chọn ở khung này tin được */
  accepted: boolean;
}

const distance = (a: LaserPoint, b: LaserPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const advanceLaser = (prev: LaserTrack, raw: LaserPoint | null, longSide: number): LaserStep => {
  const gate = (LASER_GATE * longSide) / 640;
  if (raw && prev.point && distance(raw, prev.point) <= gate) {
    const jitter = distance(raw, prev.point) <= (JITTER * longSide) / 640;
    const point: LaserPoint = jitter
      ? [prev.point[0] + (raw[0] - prev.point[0]) * SMOOTHING, prev.point[1] + (raw[1] - prev.point[1]) * SMOOTHING]
      : raw;
    return { track: { point, candidate: null, misses: 0 }, accepted: true };
  }
  if (raw && !prev.point) return { track: { point: raw, candidate: null, misses: 0 }, accepted: true };
  const misses = prev.misses + 1;
  const keep = prev.point && misses <= MAX_MISSES ? prev.point : null;
  if (!raw) return { track: { point: keep, candidate: null, misses }, accepted: false };
  const count = prev.candidate && distance(raw, prev.candidate.point) <= gate ? prev.candidate.count + 1 : 1;
  if (count >= CONFIRM_FRAMES) return { track: { point: raw, candidate: null, misses: 0 }, accepted: true };
  return { track: { point: keep, candidate: { point: raw, count }, misses }, accepted: false };
};

/** Gợi ý gửi kèm khung tiếp theo (số nguyên) */
export const laserHint = (track: LaserTrack): LaserPoint | null =>
  track.point ? [Math.round(track.point[0]), Math.round(track.point[1])] : null;
