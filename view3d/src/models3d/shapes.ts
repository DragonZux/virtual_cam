// Kiểu toạ độ và hàm dựng biên dạng dùng chung cho các mô hình (không phải component)

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Hai phía trái / phải: SIDES.map((s) => <Leg position={[0.2 * s, 0, 0]} />) */
export const SIDES = [-1, 1] as const;

/** [0, 1, …, n - 1] */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Số ngẫu nhiên có hạt giống (mulberry32): mô hình giống hệt nhau mỗi lần mở */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ===== Biên dạng 2D cho Extrude / Lathe ===== */

/** Đa giác đều n cạnh bán kính r (biển STOP: n = 8, rotation = π/8) */
export const polygon = (n: number, r: number, rotation = 0): V2[] =>
  range(n).map((i) => {
    const a = rotation + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

/** Elip rx × ry tâm (cx, cy) */
export const ellipse = (rx: number, ry: number, n = 48, cx = 0, cy = 0): V2[] =>
  range(n).map((i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** Chữ nhật w × h bo góc bán kính rr, tâm ở gốc */
export const roundedRect = (w: number, h: number, rr: number, seg = 6): V2[] => {
  const r = Math.min(rr, w / 2, h / 2);
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (Math.PI * 3) / 2],
  ];
  return corners.flatMap(([cx, cy, start]) =>
    range(seg + 1).map((i): V2 => {
      const a = start + (i / seg) * (Math.PI / 2);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }),
  );
};
