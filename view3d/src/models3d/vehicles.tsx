// Mô hình 3D nhóm Phương tiện: xe đạp, ô tô, xe máy, máy bay, xe buýt, tàu hoả, xe tải, thuyền
import { useEffect, useMemo } from "react";
import { BackSide, BufferGeometry, Float32BufferAttribute } from "three";

import { Box, Capsule, Cone, Cylinder, Extrude, Lathe, Repeat, Sphere, Surface, Torus, Tube } from "./parts";
import { range, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture, label, speckle, stripes } from "./textures";

const TIRE = "#262626";
const SILVER = "#c3c8cf";
const DARK_GLASS = "#1d2530";
const HEAD_LIGHT = "#fff4d6";
const TAIL_LIGHT = "#ff2a2a";

/** Cung tròn tâm (cx, cy) bán kính r đi từ góc a0 tới a1 (radian) — vòm bánh xe trong biên dạng thân */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 12): V2[] =>
  range(n + 1).map((i): V2 => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

/** Vòm bánh xe khuyết vào mép dưới biên dạng thân (đi theo chiều z tăng), mép dưới ở độ cao bottom */
const wheelArch = (z: number, axle: number, r: number, bottom: number, n = 12): V2[] => {
  const t = Math.asin(Math.max(-1, Math.min(1, (bottom - axle) / r)));
  return arc(z, axle, r, Math.PI - t, t, n);
};

/**
 * Tấm phẳng (kính chắn gió, kính sau…) đặt trên đoạn a→b của biên dạng hông [z, y], đẩy ra ngoài theo
 * pháp tuyến một đoạn out; t0..t1 = phần của đoạn được phủ. Box của tấm: [rộng, dày, length].
 */
const pane = (a: V2, b: V2, out: number, t0 = 0, t1 = 1) => {
  const dz = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dz, dy);
  const [nz, ny] = [dy / len, -dz / len];
  const t = (t0 + t1) / 2;
  return {
    position: [0, a[1] + dy * t + ny * out, a[0] + dz * t + nz * out] as V3,
    rotation: [Math.atan2(nz, ny), 0, 0] as V3,
    length: len * (t1 - t0),
  };
};

/** Trụ (trục y) đặt dọc đoạn a→b: vị trí giữa, góc xoay, chiều dài */
const span = (a: V3, b: V3) => {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  return {
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3,
    rotation: [Math.atan2(d[2], d[1]), 0, -Math.asin(d[0] / len)] as V3,
    length: len,
  };
};

/** Đường xoắn lò xo quanh đoạn a→b (cho Tube): bán kính rr, số vòng turns */
const coil = (a: V3, b: V3, rr: number, turns: number): V3[] => {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  const u = d.map((v) => v / len);
  // p ⟂ u (lấy theo trục x), q = u × p
  const p = [1 - u[0] * u[0], -u[0] * u[1], -u[0] * u[2]];
  const pl = Math.hypot(p[0], p[1], p[2]);
  const pn = p.map((v) => v / pl);
  const q = [u[1] * pn[2] - u[2] * pn[1], u[2] * pn[0] - u[0] * pn[2], u[0] * pn[1] - u[1] * pn[0]];
  const n = turns * 10;
  return range(n + 1).map((i): V3 => {
    const t = i / n;
    const c = Math.cos(t * turns * Math.PI * 2) * rr;
    const s = Math.sin(t * turns * Math.PI * 2) * rr;
    return [a[0] + d[0] * t + pn[0] * c + q[0] * s, a[1] + d[1] * t + pn[1] * c + q[1] * s, a[2] + d[2] * t + pn[2] * c + q[2] * s];
  });
};

interface WheelProps {
  position: V3;
  /** Bán kính ngoài của lốp */
  r: number;
  /** Bề rộng lốp */
  w: number;
  /** Bán kính mâm so với lốp */
  rimRatio?: number;
  rim?: string;
  /** Số chấu mâm (0 = mâm đặc kiểu xe tải / máy bay) */
  spokes?: number;
}

/** Bánh xe trục ngang theo x: lốp cao su bo vai, lòng mâm tối, vành sáng, chấu mâm, chụp giữa */
const Wheel = ({ position, r, w, rimRatio = 0.64, rim = SILVER, spokes = 5 }: WheelProps) => {
  const ri = r * rimRatio;
  const sh = Math.min(w * 0.24, (r - ri) * 0.5);
  const tire: V2[] = [
    [ri * 0.97, -w * 0.4],
    [r - sh * 1.2, -w / 2],
    [r - sh * 0.35, -w / 2 + sh * 0.3],
    [r, -w / 2 + sh],
    [r, w / 2 - sh],
    [r - sh * 0.35, w / 2 - sh * 0.3],
    [r - sh * 1.2, w / 2],
    [ri * 0.97, w * 0.4],
  ];
  const face = w * 0.36;
  const mid = ri * 0.55;
  const arms = SIDES.flatMap((s) =>
    range(spokes).map((i) => {
      const a = (i / spokes) * Math.PI * 2;
      return { p: [Math.cos(a) * mid, s * face, -Math.sin(a) * mid] as V3, r: [0, a, 0] as V3 };
    }),
  );
  // Nhóm xoay để trục bánh (y cục bộ) nằm theo x
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <Lathe points={tire} color={TIRE} finish="rubber" seg={48} />
      <Cylinder r={ri * 0.97} h={w * 0.6} color="#2b2e33" finish="metal" seg={40} />
      {SIDES.map((s) => (
        <Torus
          key={s}
          r={ri * 0.93}
          tube={ri * 0.06}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, s * face, 0]}
          color={rim}
          finish="metal"
          seg={40}
          radialSeg={10}
        />
      ))}
      {spokes > 0 && (
        <Repeat at={arms} size={[ri * 0.95, w * 0.07, ri * 0.2]} radius={ri * 0.04} color={rim} finish="metal" />
      )}
      <Cylinder
        r={spokes > 0 ? ri * 0.24 : ri * 0.82}
        h={w * 0.8}
        color={rim}
        finish="metal"
        seg={32}
      />
      <Cylinder r={ri * 0.12} h={w * 0.84} color="#3a3d42" finish="chrome" seg={20} />
    </group>
  );
};

/** Bánh xe đạp trục theo x: lốp mảnh, vành, 32 nan hoa đan từ hai mặt bích moay-ơ */
const BikeWheel = ({ position, r = 0.34 }: { position: V3; r?: number }) => {
  const rim = r - 0.03;
  const hub = 0.022;
  const spokes = range(32).map((i) => {
    const a = (i / 32) * Math.PI * 2;
    const f = i % 2 ? 0.03 : -0.03;
    const len = Math.hypot(rim - hub, f);
    const c = (hub + rim) / 2;
    return {
      p: [Math.cos(a) * c, f / 2, -Math.sin(a) * c] as V3,
      s: [1, len, 1] as V3,
      r: [0, a, -Math.PI / 2 - Math.asin(f / len)] as V3,
    };
  });
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <Torus r={r - 0.016} tube={0.016} rotation={[Math.PI / 2, 0, 0]} color={TIRE} finish="rubber" seg={64} radialSeg={12} />
      <Torus r={rim + 0.004} tube={0.011} rotation={[Math.PI / 2, 0, 0]} color="#2b2e33" finish="metal" seg={64} radialSeg={8} />
      <Repeat at={spokes} shape="cylinder" size={[0.0022, 1, 1]} seg={6} color="#d4d8dd" finish="chrome" />
      <Cylinder r={0.024} h={0.1} color="#b9bec5" finish="metal" seg={20} />
      <Cylinder r={0.008} h={0.13} color="#3a3d42" finish="chrome" seg={12} />
    </group>
  );
};

/* ===== Xe đạp ===== */

const BIKE = "#177e89";

/** Xe đạp đua: khung kim cương, phuộc cong, ghi đông drop, giò đĩa + xích, yên, bình nước */
export const Bicycle = () => {
  const bb: V3 = [0, 0.27, -0.07];
  const seatTop: V3 = [0, 0.778, -0.22];
  const headTop: V3 = [0, 0.82, 0.297];
  const headBottom: V3 = [0, 0.655, 0.351];
  // Yên nhìn từ trên [x, z], mũi yên hướng +z; Extrude xoay nằm ngang nên trục y của hình = -z
  const half: V2[] = [
    [0.045, -0.121],
    [0.068, -0.1],
    [0.07, -0.065],
    [0.055, -0.02],
    [0.03, 0.03],
    [0.021, 0.09],
    [0.016, 0.128],
  ];
  const saddle: V2[] = [
    [0, -0.125],
    ...half,
    [0, 0.14],
    ...half.map(([x, z]): V2 => [-x, z]).reverse(),
  ].map(([x, z]): V2 => [x, -z]);
  const cogs = range(7).map((i) => ({
    p: [0.038 + i * 0.0045, 0, 0] as V3,
    s: [1 - i * 0.075, 1, 1 - i * 0.075] as V3,
    r: [0, 0, Math.PI / 2] as V3,
  }));
  return (
    <group>
      <BikeWheel position={[0, 0.34, -0.5]} />
      <BikeWheel position={[0, 0.34, 0.5]} />
      {/* Khung kim cương: ống trên, ống dưới, ống yên, ống cổ */}
      <Tube path={[[0, 0.742, -0.205], [0, 0.795, 0.3]]} r={0.016} color={BIKE} finish="gloss" />
      <Tube path={[bb, [0, 0.66, 0.343]]} r={0.022} color={BIKE} finish="gloss" />
      <Tube path={[bb, seatTop]} r={0.017} color={BIKE} finish="gloss" />
      <Tube path={[headTop, headBottom]} r={0.023} color={BIKE} finish="gloss" />
      {/* Gióng sau: hai cặp ống từ cụm yên và trục giữa chạy về đùi đĩa sau */}
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 0.018, 0.735, -0.212], [s * 0.05, 0.52, -0.37], [s * 0.064, 0.345, -0.497]]} r={0.009} color={BIKE} finish="gloss" />
          <Tube path={[[s * 0.03, 0.27, -0.09], [s * 0.058, 0.31, -0.3], [s * 0.064, 0.338, -0.497]]} r={0.011} color={BIKE} finish="gloss" />
          {/* Lưỡi phuộc cong về trước */}
          <Tube
            path={[[s * 0.032, 0.648, 0.354], [s * 0.044, 0.49, 0.405], [s * 0.05, 0.4, 0.458], [s * 0.05, 0.342, 0.5]]}
            r={0.012}
            taper={[1.15, 1, 0.75]}
            color={BIKE}
            finish="gloss"
          />
        </group>
      ))}
      <Box size={[0.08, 0.03, 0.05]} radius={0.012} position={[0, 0.65, 0.355]} rotation={[0.31, 0, 0]} color={BIKE} finish="gloss" />
      {/* Cọc yên + yên */}
      <Tube path={[seatTop, [0, 0.905, -0.258]]} r={0.0135} color="#2b2e33" finish="metal" />
      <Extrude shape={saddle} depth={0.03} bevel={0.012} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.925, -0.275]} color="#262626" finish="fabric" />
      {/* Pô tăng + ghi đông drop quấn băng */}
      <Tube path={[headTop, [0, 0.855, 0.287], [0, 0.872, 0.31], [0, 0.885, 0.39]]} r={0.014} color="#2b2e33" finish="metal" />
      <Tube
        path={[[-0.21, 0.885, 0.375], [-0.1, 0.885, 0.39], [0, 0.885, 0.392], [0.1, 0.885, 0.39], [0.21, 0.885, 0.375]]}
        r={0.012}
        color="#262626"
        finish="fabric"
      />
      {SIDES.map((s) => (
        <group key={s}>
          <Tube
            path={[[s * 0.21, 0.885, 0.375], [s * 0.215, 0.885, 0.43], [s * 0.215, 0.85, 0.48], [s * 0.215, 0.785, 0.468], [s * 0.215, 0.762, 0.42], [s * 0.215, 0.766, 0.37]]}
            r={0.012}
            color="#262626"
            finish="fabric"
          />
          {/* Tay phanh / tay đề */}
          <Box size={[0.03, 0.045, 0.07]} radius={0.012} position={[s * 0.215, 0.905, 0.445]} rotation={[-0.35, 0, 0]} color="#1f1f1f" finish="rubber" />
          <Tube path={[[s * 0.215, 0.9, 0.475], [s * 0.218, 0.84, 0.49], [s * 0.218, 0.79, 0.478]]} r={0.0055} color={SILVER} finish="chrome" />
        </group>
      ))}
      {/* Giò đĩa: trục giữa, hai đĩa xích, đùi, bàn đạp */}
      <Cylinder r={0.024} h={0.09} rotation={[0, 0, Math.PI / 2]} position={bb} color="#2b2e33" finish="metal" seg={20} />
      <group position={[0.066, bb[1], bb[2]]}>
        <Torus r={0.098} tube={0.006} rotation={[0, Math.PI / 2, 0]} color="#8a9099" finish="metal" seg={56} radialSeg={8} />
        <Torus r={0.072} tube={0.005} position={[-0.008, 0, 0]} rotation={[0, Math.PI / 2, 0]} color="#6d737b" finish="metal" seg={48} radialSeg={8} />
        <Repeat
          at={range(4).map((i) => ({ p: [0.004, 0, 0] as V3, r: [(i * Math.PI) / 2 + 0.4, 0, 0] as V3 }))}
          size={[0.008, 0.19, 0.014]}
          color="#2b2e33"
          finish="metal"
        />
      </group>
      {SIDES.map((s) => (
        <group key={s} position={bb} rotation={[s > 0 ? 0.52 : 0.52 + Math.PI, 0, 0]}>
          <Box size={[0.014, 0.028, 0.18]} radius={0.007} position={[s * 0.08, 0, 0.085]} color="#2b2e33" finish="metal" />
          <Box size={[0.085, 0.018, 0.065]} radius={0.006} position={[s * 0.125, 0, 0.17]} rotation={[-0.52 - (s > 0 ? 0 : Math.PI), 0, 0]} color="#1f1f1f" finish="matte" />
        </group>
      ))}
      {/* Líp, củ đề, xích */}
      <group position={[0, 0.34, -0.5]}>
        <Repeat at={cogs} shape="cylinder" size={[0.048, 0.003, 1]} seg={28} color="#a3a8b0" finish="metal" />
        <Box size={[0.016, 0.1, 0.035]} radius={0.007} position={[0.068, -0.075, 0.015]} rotation={[0.25, 0, 0]} color="#2b2e33" finish="metal" />
      </group>
      <Tube
        path={[
          [0.06, 0.368, -0.07],
          [0.06, 0.374, -0.28],
          [0.06, 0.386, -0.5],
          [0.06, 0.36, -0.54],
          [0.06, 0.3, -0.535],
          [0.06, 0.255, -0.49],
          [0.06, 0.22, -0.3],
          [0.06, 0.173, -0.08],
          [0.06, 0.2, 0.0],
          [0.06, 0.27, 0.028],
          [0.06, 0.34, 0.0],
        ]}
        closed
        r={0.0042}
        seg={64}
        radialSeg={6}
        color="#5f646b"
        finish="metal"
      />
      {/* Bình nước cam trên ống dưới */}
      <group position={[0, 0.478, 0.066]} rotation={[0.804, 0, 0]}>
        <Cylinder r={0.034} h={0.19} color="#fb8020" finish="plastic" seg={24} />
        <Cylinder r={0.02} rTop={0.012} h={0.035} position={[0, 0.11, 0]} color="#fafafa" finish="plastic" seg={16} />
      </group>
    </group>
  );
};

/* ===== Ô tô ===== */

const CAR = "#b3152a";

/** Ô tô hatchback: thân đùn từ biên dạng hông, khoang kính tối, đèn pha / hậu phát sáng, mâm 5 chấu */
export const Car = () => {
  const body: V2[] = [
    [-2.0, 0.29],
    ...wheelArch(-1.32, 0.35, 0.47, 0.26),
    ...wheelArch(1.32, 0.35, 0.47, 0.26),
    [1.98, 0.29],
    [2.06, 0.35],
    [2.09, 0.46],
    [2.07, 0.57],
    [2.0, 0.65],
    [1.88, 0.71],
    [1.5, 0.79],
    [1.2, 0.83],
    [1.0, 0.86],
    [0.5, 0.88],
    [-0.9, 0.91],
    [-1.6, 0.93],
    [-1.88, 0.92],
    [-2.0, 0.87],
    [-2.05, 0.75],
    [-2.07, 0.58],
    [-2.06, 0.42],
    [-2.03, 0.33],
  ];
  const cabin: V2[] = [
    [1.02, 0.84],
    [0.18, 1.35],
    [-0.15, 1.39],
    [-1.0, 1.375],
    [-1.5, 1.31],
    [-1.9, 0.93],
    [-1.9, 0.84],
  ];
  const windshield = pane(cabin[0], cabin[1], 0.084, 0.2, 0.93);
  const backlight = pane(cabin[4], cabin[5], 0.084, 0.08, 0.86);
  const frontWindow: V2[] = [
    [0.673, 0.99],
    [0.113, 1.33],
    [-0.3, 1.34],
    [-0.3, 0.99],
  ];
  const rearWindow: V2[] = [
    [-0.4, 0.99],
    [-0.4, 1.34],
    [-1.0, 1.33],
    [-1.22, 1.29],
    [-1.6, 0.99],
  ];
  // Khe cửa: cửa trước, giữa hai cửa, đuôi cửa sau (đoạn ngắn trên vòm bánh sau)
  const seams = SIDES.flatMap((s) => [
    { p: [s * 0.912, 0.63, 0.8] as V3 },
    { p: [s * 0.912, 0.63, -0.35] as V3 },
    { p: [s * 0.912, 0.9, -1.25] as V3, s: [1, 0.2, 1] as V3 },
  ]);
  const handles = SIDES.flatMap((s) => [0.15, -0.85].map((z): V3 => [s * 0.916, 0.84, z]));
  return (
    <group>
      {/* Thân và khoang cabin (đùn ngang theo bề rộng xe) */}
      <Extrude shape={body} depth={1.64} bevel={0.09} rotation={[0, -Math.PI / 2, 0]} color={CAR} finish="gloss" />
      <Extrude shape={cabin} depth={1.38} bevel={0.08} rotation={[0, -Math.PI / 2, 0]} color={CAR} finish="gloss" />
      {/* Kính chắn gió, kính sau, kính hông */}
      <Box size={[1.3, 0.01, windshield.length]} position={windshield.position} rotation={windshield.rotation} color={DARK_GLASS} finish="gloss" />
      <Box size={[1.16, 0.01, backlight.length]} position={backlight.position} rotation={backlight.rotation} color={DARK_GLASS} finish="gloss" />
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.774, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <Extrude shape={frontWindow} depth={0.008} color={DARK_GLASS} finish="gloss" />
          <Extrude shape={rearWindow} depth={0.008} color={DARK_GLASS} finish="gloss" />
        </group>
      ))}
      <Repeat at={seams} size={[0.006, 0.64, 0.008]} color="#5c0a15" finish="matte" />
      <Repeat at={handles} size={[0.014, 0.028, 0.13]} radius={0.006} color={SILVER} finish="chrome" />
      {/* Gương chiếu hậu */}
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.92, 0.99, 0.82]}>
          <Box size={[0.17, 0.1, 0.11]} radius={0.035} position={[s * 0.06, 0, 0]} color={CAR} finish="gloss" />
          <Box size={[0.13, 0.07, 0.01]} radius={0.004} position={[s * 0.065, 0, -0.056]} color={DARK_GLASS} finish="chrome" />
        </group>
      ))}
      {/* Mặt trước: đèn pha, lưới tản nhiệt, logo, biển số */}
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.58, 0.66, 2.08]} rotation={[-0.72, 0, 0]}>
          <Box size={[0.42, 0.11, 0.08]} radius={0.03} color="#1f1f1f" finish="gloss" />
          <Box size={[0.36, 0.06, 0.08]} radius={0.025} position={[0, 0, 0.012]} color={HEAD_LIGHT} finish="glow" />
        </group>
      ))}
      <Box size={[0.96, 0.2, 0.05]} radius={0.015} position={[0, 0.44, 2.17]} rotation={[0.08, 0, 0]} color="#1f1f1f" finish="gloss" />
      <Repeat at={[[0, 0.5, 2.196], [0, 0.38, 2.196]]} size={[0.9, 0.014, 0.012]} color={SILVER} finish="chrome" />
      <Cylinder r={0.045} h={0.02} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.6, 2.15]} color={SILVER} finish="chrome" seg={24} />
      <mesh position={[0, 0.44, 2.2]}>
        <planeGeometry args={[0.52, 0.11]} />
        <meshStandardMaterial map={label("30A-123.45", { bg: "#fafafa", fg: "#1f1f1f", aspect: 4.7, size: 0.62, border: "#1f1f1f" })} roughness={0.5} />
      </mesh>
      {/* Mặt sau: đèn hậu nối dải, biển số, cản dưới, ống xả */}
      {SIDES.map((s) => (
        <Box key={s} size={[0.42, 0.1, 0.06]} radius={0.025} position={[s * 0.56, 0.83, -2.1]} rotation={[0.4, 0, 0]} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.3} />
      ))}
      <Box size={[0.72, 0.024, 0.02]} position={[0, 0.85, -2.115]} rotation={[0.4, 0, 0]} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.1} />
      <mesh position={[0, 0.58, -2.162]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.52, 0.11]} />
        <meshStandardMaterial map={label("30A-123.45", { bg: "#fafafa", fg: "#1f1f1f", aspect: 4.7, size: 0.62, border: "#1f1f1f" })} roughness={0.5} />
      </mesh>
      <Box size={[1.5, 0.1, 0.06]} radius={0.03} position={[0, 0.27, -2.1]} color="#1f1f1f" finish="matte" />
      <Cylinder r={0.035} h={0.12} rotation={[Math.PI / 2, 0, 0]} position={[0.5, 0.25, -2.11]} color={SILVER} finish="chrome" seg={16} />
      {/* Ốp sườn đen, môi cản trước, hốc bánh tối */}
      <Box size={[1.845, 0.11, 1.7]} radius={0.04} position={[0, 0.225, 0]} color="#1f1f1f" finish="matte" />
      <Box size={[1.5, 0.07, 0.06]} radius={0.03} position={[0, 0.24, 2.06]} color="#1f1f1f" finish="matte" />
      {[-1.32, 1.32].map((z) => (
        <Cylinder
          key={z}
          r={0.372}
          h={1.74}
          open
          arcStart={-0.3}
          arc={Math.PI + 0.6}
          rotation={[0, 0, Math.PI / 2]}
          position={[0, 0.35, z]}
          color="#161616"
          finish="matte"
          doubleSide
        />
      ))}
      {/* Bánh xe */}
      {SIDES.flatMap((s) =>
        [-1.32, 1.32].map((z) => <Wheel key={`${s}${z}`} position={[s * 0.79, 0.35, z]} r={0.35} w={0.23} rimRatio={0.68} />),
      )}
    </group>
  );
};

/* ===== Xe máy ===== */

const MOTO = "#1f56b0";
const GRAPHITE = "#3a3d42";

/** Mô tô naked: phuộc ống lồng, đĩa phanh kẹp cam, bình xăng, yên hai tầng, máy + ống xả crôm, phuộc sau lò xo cam */
export const Motorcycle = () => {
  const seat: V2[] = [
    [-0.08, 0.82],
    [-0.12, 0.88],
    [-0.32, 0.87],
    [-0.4, 0.92],
    [-0.62, 0.93],
    [-0.65, 0.88],
    [-0.56, 0.81],
    [-0.3, 0.79],
  ];
  const tail: V2[] = [
    [-0.3, 0.79],
    [-0.56, 0.81],
    [-0.65, 0.88],
    [-0.84, 0.9],
    [-0.86, 0.85],
    [-0.66, 0.73],
    [-0.3, 0.71],
  ];
  // Ốp két nước hai bên: tấm vát nhọn về sau
  const shroud: V2[] = [
    [0.42, 0.93],
    [0.26, 0.95],
    [0.1, 0.8],
    [0.28, 0.69],
    [0.41, 0.74],
  ];
  const muffler = span([0.21, 0.36, -0.38], [0.22, 0.52, -0.8]);
  const pegs = [
    ...SIDES.map((s): V3 => [s * 0.18, 0.42, -0.14]),
    ...SIDES.map((s): V3 => [s * 0.16, 0.52, -0.46]),
  ].map((p) => ({ p, r: [0, 0, Math.PI / 2] as V3 }));
  return (
    <group>
      <Wheel position={[0, 0.31, 0.7]} r={0.31} w={0.12} rimRatio={0.72} />
      <Wheel position={[0, 0.31, -0.72]} r={0.31} w={0.18} rimRatio={0.7} />
      {/* Đĩa phanh + heo phanh */}
      {SIDES.map((s) => (
        <group key={s}>
          <Cylinder r={0.15} h={0.006} rotation={[0, 0, Math.PI / 2]} position={[s * 0.072, 0.31, 0.7]} color="#b9bec5" finish="metal" seg={40} />
          <Box size={[0.035, 0.1, 0.06]} radius={0.012} position={[s * 0.088, 0.42, 0.64]} rotation={[0.5, 0, 0]} color="#fb8020" finish="plastic" />
        </group>
      ))}
      <Cylinder r={0.11} h={0.006} rotation={[0, 0, Math.PI / 2]} position={[0.105, 0.31, -0.72]} color="#b9bec5" finish="metal" seg={40} />
      <Box size={[0.03, 0.08, 0.05]} radius={0.01} position={[0.115, 0.22, -0.67]} rotation={[-0.6, 0, 0]} color="#fb8020" finish="plastic" />
      {/* Chắn bùn trước / sau */}
      <Cylinder r={0.345} h={0.14} open arcStart={0.5} arc={1.6} rotation={[0, 0, Math.PI / 2]} position={[0, 0.31, 0.7]} color={MOTO} finish="gloss" doubleSide />
      <Cylinder r={0.345} h={0.2} open arcStart={0.55} arc={1.1} rotation={[0, 0, Math.PI / 2]} position={[0, 0.31, -0.72]} color={GRAPHITE} finish="plastic" doubleSide />
      {/* Phuộc trước: ống crôm, vỏ dưới, hai càng kẹp */}
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 0.1, 1.0, 0.378], [s * 0.1, 0.6, 0.565]]} r={0.022} color="#d4d8dd" finish="chrome" />
          <Tube path={[[s * 0.1, 0.64, 0.546], [s * 0.1, 0.3, 0.704]]} r={0.032} color={GRAPHITE} finish="metal" />
        </group>
      ))}
      <Box size={[0.27, 0.035, 0.09]} radius={0.015} position={[0, 0.985, 0.385]} rotation={[-0.437, 0, 0]} color={GRAPHITE} finish="metal" />
      <Box size={[0.27, 0.035, 0.09]} radius={0.015} position={[0, 0.87, 0.438]} rotation={[-0.437, 0, 0]} color={GRAPHITE} finish="metal" />
      {/* Đèn pha tròn + đồng hồ */}
      <group position={[0, 0.86, 0.56]}>
        <Sphere r={0.095} scale={[1, 1, 0.85]} color="#1f1f1f" finish="gloss" />
        <Cylinder r={0.078} h={0.02} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.074]} color={HEAD_LIGHT} finish="glow" seg={32} />
        <Torus r={0.083} tube={0.008} position={[0, 0, 0.078]} color="#d4d8dd" finish="chrome" seg={40} radialSeg={8} />
      </group>
      <Box size={[0.15, 0.09, 0.035]} radius={0.012} position={[0, 1.04, 0.43]} rotation={[-0.55, 0, 0]} color="#1f1f1f" finish="gloss" />
      <Box size={[0.12, 0.06, 0.01]} radius={0.004} position={[0, 1.05, 0.447]} rotation={[-0.55, 0, 0]} color="#9fd8ff" finish="glow" emissiveIntensity={0.6} />
      {/* Ghi đông, tay nắm, tay phanh, gương */}
      <Tube path={[[-0.37, 1.07, 0.27], [-0.2, 1.05, 0.33], [0, 1.04, 0.35], [0.2, 1.05, 0.33], [0.37, 1.07, 0.27]]} r={0.012} color={GRAPHITE} finish="metal" />
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 0.29, 1.058, 0.305], [s * 0.4, 1.072, 0.26]]} r={0.02} color="#1f1f1f" finish="rubber" />
          <Tube path={[[s * 0.19, 1.055, 0.355], [s * 0.27, 1.06, 0.36], [s * 0.34, 1.065, 0.33]]} r={0.006} color="#b9bec5" finish="metal" />
          <Tube path={[[s * 0.22, 1.055, 0.33], [s * 0.26, 1.16, 0.32], [s * 0.3, 1.24, 0.31]]} r={0.007} color={GRAPHITE} finish="metal" />
          <Sphere r={1} scale={[0.065, 0.04, 0.018]} position={[s * 0.31, 1.26, 0.31]} color="#1f1f1f" finish="gloss" />
        </group>
      ))}
      {/* Khung: cổ lái, hai dầm chính, khung phụ đuôi, gắp sau */}
      <Tube path={[[0, 1.0, 0.383], [0, 0.85, 0.452]]} r={0.045} color={GRAPHITE} finish="metal" />
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 0.06, 0.93, 0.4], [s * 0.14, 0.86, 0.18], [s * 0.14, 0.72, -0.1], [s * 0.12, 0.5, -0.2]]} r={0.032} color="#9aa0a8" finish="metal" />
          <Tube path={[[s * 0.13, 0.74, -0.12], [s * 0.09, 0.77, -0.4], [s * 0.07, 0.79, -0.62]]} r={0.016} color="#9aa0a8" finish="metal" />
          <Tube path={[[s * 0.12, 0.5, -0.2], [s * 0.12, 0.42, -0.45], [s * 0.11, 0.33, -0.72]]} r={0.03} color="#9aa0a8" finish="metal" />
          {/* Phuộc sau: ty crôm + lò xo cam */}
          <Tube path={[[s * 0.115, 0.37, -0.6], [s * 0.1, 0.75, -0.44]]} r={0.013} color="#d4d8dd" finish="chrome" />
          <Tube path={coil([s * 0.113, 0.42, -0.58], [s * 0.102, 0.69, -0.465], 0.03, 6)} r={0.0075} seg={64} radialSeg={6} color="#fb8020" finish="plastic" />
        </group>
      ))}
      {/* Động cơ: hộp số, khối xi-lanh có cánh tản nhiệt, nắp bên, két nước */}
      <Box size={[0.34, 0.24, 0.44]} radius={0.05} position={[0, 0.45, 0.1]} color="#3f434a" finish="metal" />
      <group position={[0, 0.66, 0.2]} rotation={[-0.35, 0, 0]}>
        <Box size={[0.34, 0.26, 0.2]} radius={0.03} color="#3f434a" finish="metal" />
        <Repeat at={range(5).map((i): V3 => [0, -0.09 + i * 0.04, 0])} size={[0.37, 0.012, 0.22]} radius={0.004} color="#a3a8b0" finish="metal" />
        <Box size={[0.33, 0.06, 0.18]} radius={0.02} position={[0, 0.15, 0]} color="#c3c8cf" finish="chrome" />
      </group>
      {SIDES.map((s) => (
        <Cylinder key={s} r={0.1} h={0.04} rotation={[0, 0, Math.PI / 2]} position={[s * 0.18, 0.46, 0.08]} color="#b9bec5" finish="metal" seg={32} />
      ))}
      <Box size={[0.34, 0.3, 0.05]} radius={0.015} position={[0, 0.7, 0.38]} rotation={[-0.25, 0, 0]} color="#2b2e33" finish="matte" />
      {/* Bình xăng, ốp hông, nắp xăng */}
      <Sphere r={1} scale={[0.2, 0.14, 0.26]} position={[0, 0.95, 0.14]} rotation={[0.1, 0, 0]} color={MOTO} finish="gloss" />
      <Cylinder r={0.035} h={0.02} position={[0, 1.08, 0.2]} rotation={[0.1, 0, 0]} color="#d4d8dd" finish="chrome" seg={20} />
      {SIDES.map((s) => (
        <Extrude key={s} shape={shroud} depth={0.02} bevel={0.012} rotation={[0, -Math.PI / 2, 0]} position={[s * 0.17, 0, 0]} color={MOTO} finish="gloss" />
      ))}
      {/* Yên + đuôi xe, đèn hậu, biển số, xi-nhan */}
      <Extrude shape={tail} depth={0.14} bevel={0.04} rotation={[0, -Math.PI / 2, 0]} color={MOTO} finish="gloss" />
      <Extrude shape={seat} depth={0.2} bevel={0.04} rotation={[0, -Math.PI / 2, 0]} color="#262626" finish="fabric" />
      <Box size={[0.12, 0.03, 0.04]} radius={0.01} position={[0, 0.875, -0.885]} rotation={[0.3, 0, 0]} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.3} />
      <Tube path={[[0, 0.74, -0.72], [0, 0.66, -0.84]]} r={0.012} color={GRAPHITE} finish="metal" />
      <group position={[0, 0.59, -0.865]} rotation={[0, Math.PI, 0]}>
        <mesh rotation={[0.25, 0, 0]}>
          <planeGeometry args={[0.19, 0.14]} />
          <meshStandardMaterial map={label("29-B1 868.68", { bg: "#fafafa", fg: "#1f1f1f", aspect: 1.36, size: 0.2, border: "#1f1f1f" })} roughness={0.5} />
        </mesh>
      </group>
      <Tube path={[[-0.12, 0.69, -0.8], [0.12, 0.69, -0.8]]} r={0.007} color={GRAPHITE} finish="metal" />
      <Repeat at={SIDES.map((s): V3 => [s * 0.13, 0.69, -0.8])} size={[0.045, 0.026, 0.04]} radius={0.011} color="#ffa53a" finish="glow" emissiveIntensity={1} />
      {/* Ống xả: hai cổ pô crôm gom về bô bên phải */}
      <Tube path={[[0.06, 0.62, 0.34], [0.08, 0.45, 0.44], [0.1, 0.24, 0.32], [0.14, 0.2, 0.05], [0.2, 0.26, -0.22], [0.21, 0.36, -0.38]]} r={0.022} color="#d4d8dd" finish="chrome" />
      <Tube path={[[-0.06, 0.62, 0.34], [-0.04, 0.42, 0.43], [0.04, 0.22, 0.28], [0.13, 0.2, 0.05]]} r={0.02} color="#d4d8dd" finish="chrome" />
      <Cylinder r={0.06} rTop={0.066} rBottom={0.05} h={muffler.length} position={muffler.position} rotation={muffler.rotation} color="#c3c8cf" finish="chrome" seg={28} />
      <Cylinder r={0.045} h={0.03} position={[0.2205, 0.528, -0.815]} rotation={muffler.rotation} color="#1f1f1f" finish="metal" seg={20} />
      {/* Xích + nhông sau (bên trái), gác chân */}
      <Cylinder r={0.1} h={0.01} rotation={[0, 0, Math.PI / 2]} position={[-0.1, 0.31, -0.72]} color="#4a4e55" finish="metal" seg={36} />
      <Tube
        path={[[-0.1, 0.472, -0.08], [-0.1, 0.44, -0.4], [-0.1, 0.412, -0.72], [-0.1, 0.36, -0.8], [-0.1, 0.27, -0.79], [-0.1, 0.208, -0.72], [-0.1, 0.29, -0.4], [-0.1, 0.37, -0.08], [-0.1, 0.42, -0.03]]}
        closed
        r={0.007}
        seg={64}
        radialSeg={6}
        color="#5f646b"
        finish="metal"
      />
      <Repeat at={pegs} shape="cylinder" size={[0.014, 0.09, 1]} seg={12} color="#2b2e33" finish="rubber" />
    </group>
  );
};
/* ===== Máy bay ===== */

const JET = "#f4f5f7";
const WING = "#c9ced6";
const ORANGE = "#fb8020";

/** Cánh chính bên phải nhìn từ trên [x, z]: mép trước vuốt 27°, mép sau gãy khúc ở gốc */
const WING_PLAN: V2[] = [
  [0.5, 4.5],
  [17.0, -4.0],
  [17.0, -5.4],
  [6.5, -3.2],
  [0.5, -3.2],
];
/** Cánh đuôi ngang bên phải [x, z] */
const STAB_PLAN: V2[] = [
  [0.2, -12.4],
  [6.2, -16.0],
  [6.2, -17.5],
  [0.2, -16.3],
];

/** Động cơ phản lực treo dưới cánh (trục theo z): vỏ, viền hút gió, quạt + cánh quạt, chóp, côn xả, giá treo */
const JetEngine = ({ position }: { position: V3 }) => {
  const nacelle: V2[] = [
    [0.6, -2.4],
    [0.78, -1.8],
    [0.98, -0.6],
    [1.05, 0.4],
    [1.02, 1.3],
    [0.95, 1.75],
    [0.86, 1.86],
    [0.8, 1.7],
    [0.8, 1.2],
  ];
  const blades = range(18).map((i) => {
    const a = (i / 18) * Math.PI * 2;
    return { p: [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 1.25] as V3, r: [0, 0, a - Math.PI / 2] as V3 };
  });
  return (
    <group position={position}>
      <Lathe points={nacelle} rotation={[Math.PI / 2, 0, 0]} color={JET} finish="gloss" seg={48} />
      <Torus r={0.86} tube={0.05} position={[0, 0, 1.83]} color="#c3c8cf" finish="chrome" seg={48} radialSeg={10} />
      <Cylinder r={0.8} h={0.04} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1.2]} color="#2b2e33" finish="metal" seg={40} />
      <Repeat at={blades} size={[0.13, 0.7, 0.02]} color="#6d737b" finish="metal" />
      <Cone r={0.26} h={0.45} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1.45]} color="#c3c8cf" finish="chrome" seg={24} />
      <Cone r={0.5} h={1.0} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2.9]} color="#8a9099" finish="metal" seg={24} />
      <Box size={[0.3, 0.9, 3.0]} radius={0.12} position={[0, 1.15, 0]} color={JET} finish="gloss" />
    </group>
  );
};

/** Máy bay chở khách thân hẹp đỗ trên càng: thân trắng đuôi vểnh, cánh vuốt sau có winglet, hai động cơ, đuôi đứng cam */
export const Airplane = () => {
  const spine: V3[] = [
    [0, 4, 13],
    [0, 4, 3],
    [0, 4, -6],
    [0, 4.08, -10],
    [0, 4.35, -14],
    [0, 4.8, -18],
  ];
  // Bán kính thân giữ nguyên tới ~60% chiều dài rồi thon dần về chóp đuôi
  const taper = range(26).map((i) => {
    const t = i / 25;
    return t <= 0.6 ? 1 : 1 - 0.87 * ((t - 0.6) / 0.4) ** 1.15;
  });
  const cabinWindows = SIDES.flatMap((s) =>
    range(28).map((i) => ({ p: [s * 1.915, 4.5, -5.2 + i * 0.56] as V3, r: [0, 0, s * 0.255] as V3 })),
  );
  // Kính buồng lái: các mảng trên mũi elip [phiStart, phiLength, thetaStart, thetaLength]
  const cockpit: [number, number, number, number][] = [
    [Math.PI * 1.5 - 0.46, 0.42, 0.8, 0.18],
    [Math.PI * 1.5 + 0.04, 0.42, 0.8, 0.18],
    [Math.PI * 1.5 - 0.98, 0.44, 0.86, 0.17],
    [Math.PI * 1.5 + 0.54, 0.44, 0.86, 0.17],
  ];
  const fin: V2[] = [
    [-7.8, 5.45],
    [-10.0, 6.0],
    [-14.9, 11.6],
    [-17.3, 11.6],
    [-17.6, 4.8],
    [-10.0, 5.0],
  ];
  const sharklet: V2[] = [
    [-4.2, 0.1],
    [-5.3, 0.1],
    [-6.0, 2.3],
    [-5.4, 2.4],
  ];
  const canoes = [4.5, 8, 11.5].map((x) => {
    const te = x <= 6.5 ? -3.2 : -3.2 - ((x - 6.5) * 2.2) / 10.5;
    return { p: [x, -0.3, te - 0.3] as V3, s: [0.18, 0.22, 1.3] as V3 };
  });
  const toTop = (plan: V2[]) => plan.map(([x, z]): V2 => [x, -z]);
  return (
    <group>
      {/* Thân: ống thon có đuôi vểnh lên, mũi nửa elip, bụng ốp cánh */}
      <Tube path={spine} r={1.98} taper={taper} seg={64} radialSeg={40} color={JET} finish="gloss" />
      <Sphere r={1} thetaLength={Math.PI / 2} scale={[1.98, 5.5, 1.98]} rotation={[Math.PI / 2, 0, 0]} position={[0, 4, 13]} color={JET} finish="gloss" seg={48} />
      {cockpit.map(([phiStart, phiLength, thetaStart, thetaLength]) => (
        <Sphere
          key={phiStart}
          r={1}
          phiStart={phiStart}
          phiLength={phiLength}
          thetaStart={thetaStart}
          thetaLength={thetaLength}
          scale={[2.0, 5.53, 2.0]}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 4, 13]}
          color={DARK_GLASS}
          finish="gloss"
          seg={24}
        />
      ))}
      <Repeat at={cabinWindows} size={[0.06, 0.36, 0.25]} radius={0.07} color="#26303d" finish="gloss" />
      <Sphere r={1} scale={[1.85, 0.75, 6.0]} position={[0, 2.45, 0.2]} color="#dfe2e6" finish="gloss" />
      {/* Cánh chính (nhị diện 5°) + winglet cam, đèn hàng hải; cánh trái lật gương */}
      {SIDES.map((s) => (
        <group key={s} scale={[s, 1, 1]}>
          <group position={[0, 2.75, 0]} rotation={[0, 0, 0.087]}>
            <Extrude shape={toTop(WING_PLAN)} depth={0.3} bevel={0.08} rotation={[-Math.PI / 2, 0, 0]} color={WING} finish="gloss" />
            <Extrude shape={sharklet} depth={0.12} bevel={0.04} rotation={[0, -Math.PI / 2, 0]} position={[16.95, 0, 0]} color={ORANGE} finish="gloss" />
            <Repeat at={canoes} shape="sphere" size={[1, 1, 1]} seg={16} color={WING} finish="gloss" />
            <Sphere r={0.13} position={[17.05, 0.05, -4.3]} color={s > 0 ? "#ff3030" : "#30ff60"} finish="glow" seg={12} />
          </group>
          {/* Cánh đuôi ngang */}
          <group position={[0, 4.45, 0]} rotation={[0, 0, 0.1]}>
            <Extrude shape={toTop(STAB_PLAN)} depth={0.22} bevel={0.06} rotation={[-Math.PI / 2, 0, 0]} color={WING} finish="gloss" />
          </group>
          <JetEngine position={[5.6, 1.65, 1.75]} />
          {/* Càng chính: trụ, trục ngang, thanh chống, hai bánh */}
          <Cylinder r={0.13} h={2.33} position={[3.8, 1.735, -1.2]} color="#b9bec5" finish="metal" seg={16} />
          <Cylinder r={0.09} h={0.95} rotation={[0, 0, Math.PI / 2]} position={[3.8, 0.57, -1.2]} color="#8a9099" finish="metal" seg={12} />
          <Tube path={[[3.8, 1.8, -1.2], [1.6, 2.6, -1.0]]} r={0.06} color="#8a9099" finish="metal" />
          <Wheel position={[3.45, 0.57, -1.2]} r={0.57} w={0.4} rimRatio={0.55} spokes={0} />
          <Wheel position={[4.15, 0.57, -1.2]} r={0.57} w={0.4} rimRatio={0.55} spokes={0} />
        </group>
      ))}
      {/* Đuôi đứng màu cam */}
      <Extrude shape={fin} depth={0.32} bevel={0.08} rotation={[0, -Math.PI / 2, 0]} color={ORANGE} finish="gloss" />
      {/* Càng mũi */}
      <Cylinder r={0.1} h={1.92} position={[0, 1.34, 15.3]} color="#b9bec5" finish="metal" seg={16} />
      <Cylinder r={0.06} h={0.62} rotation={[0, 0, Math.PI / 2]} position={[0, 0.38, 15.3]} color="#8a9099" finish="metal" seg={12} />
      {SIDES.map((s) => (
        <Wheel key={s} position={[s * 0.26, 0.38, 15.3]} r={0.38} w={0.26} rimRatio={0.55} spokes={0} />
      ))}
      {/* Đèn chớp chống va chạm trên lưng / dưới bụng */}
      <Sphere r={0.15} position={[0, 5.98, 2]} color="#ff3030" finish="glow" seg={12} />
      <Sphere r={0.15} position={[0, 1.72, 4]} color="#ff3030" finish="glow" seg={12} />
    </group>
  );
};
/* ===== Xe buýt ===== */

const BUS = "#f2f3f0";
const BUS_LIVERY = "#1f6fb2";

/** Chia đoạn [z0, z1] thành n ô kính cách nhau gap: tâm + bề rộng từng ô */
const bays = (z0: number, z1: number, n: number, gap = 0.12) => {
  const w = (z1 - z0 - gap * (n - 1)) / n;
  return range(n).map((i) => ({ z: z0 + w / 2 + i * (w + gap), w }));
};

/** Xe buýt thành phố sàn thấp: thân trắng viền xanh, dải kính tối, cửa kính đôi, bảng tuyến phát sáng, gương "tai thỏ" */
export const Bus = () => {
  const body: V2[] = [
    [-5.88, 0.42],
    ...wheelArch(-2.6, 0.5, 0.72, 0.42),
    ...wheelArch(3.4, 0.5, 0.72, 0.42),
    [5.86, 0.42],
    [5.93, 0.55],
    [5.95, 1.0],
    [5.92, 1.2],
    [5.84, 2.7],
    [5.76, 2.84],
    [5.6, 2.88],
    [-5.75, 2.88],
    [-5.9, 2.8],
    [-5.95, 2.6],
    [-5.96, 0.6],
    [-5.93, 0.48],
  ];
  // Phần sơn xanh phía dưới: cùng biên dạng nới ra một chút, mép trên vát lên ở đầu xe
  const livery: V2[] = [
    [-5.892, 0.408],
    ...wheelArch(-2.6, 0.5, 0.705, 0.408),
    ...wheelArch(3.4, 0.5, 0.705, 0.408),
    [5.872, 0.408],
    [5.942, 0.55],
    [5.965, 0.98],
    [5.3, 1.13],
    [-5.972, 1.13],
    [-5.972, 0.6],
    [-5.942, 0.476],
  ];
  // Kính chắn gió và bảng tuyến nằm trên đoạn mặt trước (5.92, 1.2) → (5.84, 2.7)
  const windshield = pane([5.92, 1.2], [5.84, 2.7], 0.124, 0.03, 0.97);
  const sign = pane([5.92, 1.2], [5.84, 2.7], 0.13, 0.84, 0.97);
  const panes = [
    ...[...bays(-5.55, 0.08, 4), ...bays(1.52, 4.08, 2)].map(({ z, w }) => ({ p: [1.282, 1.95, z] as V3, s: [1, 1, w] as V3 })),
    ...[...bays(-5.55, 4.6, 8), ...bays(4.72, 5.45, 1)].map(({ z, w }) => ({ p: [-1.282, 1.95, z] as V3, s: [1, 1, w] as V3 })),
  ];
  const stripe = [
    ...[
      [-5.9, 0.16],
      [1.44, 4.16],
      [5.44, 5.92],
    ].map(([z0, z1]) => ({ p: [1.29, 1.27, (z0 + z1) / 2] as V3, s: [1, 1, z1 - z0] as V3 })),
    { p: [-1.29, 1.27, 0] as V3, s: [1, 1, 11.82] as V3 },
  ];
  const destination = label("32  TRUNG TÂM", { bg: "#1a1a1a", fg: "#ffb020", aspect: 7.5, size: 0.62 });
  return (
    <group>
      <Extrude shape={body} depth={2.31} bevel={0.12} rotation={[0, -Math.PI / 2, 0]} color={BUS} finish="gloss" />
      <Extrude shape={livery} depth={2.334} bevel={0.12} rotation={[0, -Math.PI / 2, 0]} color={BUS_LIVERY} finish="gloss" />
      <Repeat at={stripe} size={[0.012, 0.07, 1]} color={ORANGE} finish="gloss" />
      {/* Dải kính hông + hai cửa kính đôi bên phải */}
      <Repeat at={panes} size={[0.012, 1.2, 1]} color={DARK_GLASS} finish="gloss" />
      {[4.8, 0.8].map((z) => (
        <group key={z} position={[1.293, 1.47, z]}>
          <Box size={[0.012, 2.34, 1.26]} color="#9aa0a8" finish="metal" />
          {SIDES.map((s) => (
            <Box key={s} size={[0.012, 2.2, 0.55]} position={[0.004, 0, s * 0.3]} color={DARK_GLASS} finish="gloss" />
          ))}
        </group>
      ))}
      {/* Kính chắn gió, bảng tuyến, gạt mưa */}
      <Box size={[2.24, 0.012, windshield.length]} position={windshield.position} rotation={windshield.rotation} color={DARK_GLASS} finish="gloss" />
      <group position={sign.position} rotation={sign.rotation}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.9, sign.length * 0.9]} />
          <Surface finish="screen" color="#ffffff" map={destination} emissiveIntensity={0.9} />
        </mesh>
      </group>
      {SIDES.map((s) => (
        <Tube key={s} path={[[s * 0.1, 1.3, 6.09], [s * 0.45, 1.55, 6.085], [s * 0.75, 1.95, 6.07]]} r={0.018} color="#1f1f1f" finish="matte" />
      ))}
      {/* Gương "tai thỏ" vươn ra trước từ góc nóc */}
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 1.12, 2.86, 5.86], [s * 1.36, 2.82, 6.2], [s * 1.42, 2.55, 6.38]]} r={0.03} color="#2b2e33" finish="metal" />
          <Box size={[0.08, 0.42, 0.22]} radius={0.04} position={[s * 1.43, 2.33, 6.38]} color="#2b2e33" finish="plastic" />
        </group>
      ))}
      {/* Cản trước, đèn pha */}
      <Box size={[2.5, 0.34, 0.14]} radius={0.06} position={[0, 0.6, 6.06]} color="#3a3d42" finish="matte" />
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.92, 0.95, 6.075]}>
          <Box size={[0.42, 0.16, 0.06]} radius={0.04} color="#1f1f1f" finish="gloss" />
          <Box size={[0.36, 0.1, 0.06]} radius={0.03} position={[0, 0, 0.012]} color={HEAD_LIGHT} finish="glow" />
        </group>
      ))}
      {/* Đuôi xe: kính sau, số tuyến, đèn hậu dọc, lưới tản nhiệt máy */}
      <Box size={[2.0, 0.62, 0.012]} radius={0.004} position={[0, 2.2, -6.086]} color={DARK_GLASS} finish="gloss" />
      <mesh position={[0, 2.62, -6.094]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.5, 0.18]} />
        <Surface finish="screen" color="#ffffff" map={label("32", { bg: "#1a1a1a", fg: "#ffb020", aspect: 2.8, size: 0.7 })} emissiveIntensity={0.9} />
      </mesh>
      <Repeat at={SIDES.map((s): V3 => [s * 1.02, 1.05, -6.09])} size={[0.2, 0.62, 0.04]} radius={0.02} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.3} />
      <Box size={[1.5, 0.5, 0.02]} radius={0.008} position={[0, 0.95, -6.09]} color="#2b2e33" finish="matte" />
      <Repeat at={range(6).map((i): V3 => [0, 0.76 + i * 0.075, -6.1])} size={[1.4, 0.025, 0.012]} color="#5f646b" finish="metal" />
      <Box size={[2.5, 0.3, 0.14]} radius={0.06} position={[0, 0.55, -6.06]} color="#3a3d42" finish="matte" />
      {/* Cục điều hoà + hộp pin trên nóc */}
      <Box size={[1.8, 0.26, 3.2]} radius={0.1} position={[0, 3.11, 1.2]} color="#dfe2e6" finish="plastic" />
      <Box size={[2.0, 0.2, 3.0]} radius={0.08} position={[0, 3.08, -3.4]} color="#dfe2e6" finish="plastic" />
      {SIDES.flatMap((s) =>
        [-2.6, 3.4].map((z) => <Wheel key={`${s}${z}`} position={[s * 1.06, 0.5, z]} r={0.5} w={0.32} rimRatio={0.62} spokes={0} />),
      )}
    </group>
  );
};
/* ===== Tàu hoả ===== */

const TRAIN = "#f4f5f7";
const TRAIN_BLUE = "#1d4f9c";
/** Mặt cắt thân tàu là elip TA × TB, tâm ở độ cao TY; thân thẳng từ z = TZ0 tới TZ1, mũi dài TN */
const TA = 1.69;
const TB = 1.45;
const TY = 2.75;
const TZ0 = -9;
const TZ1 = 4;
const TN = 7;
const DROOP = 0.06;

/** Toạ độ u quanh thân (0 = đáy, 0.25 = hông +x, 0.5 = nóc) ứng với độ cao y so với tâm elip, phía +x */
const uAt = (y: number) => Math.acos(Math.max(-1, Math.min(1, -y / TB))) / (Math.PI * 2);
/** Dải [u0, u1] trên ảnh cho khoảng độ cao [y0, y1], phía side */
const uBand = (y0: number, y1: number, side: number): V2 => {
  const [a, b] = [uAt(y0), uAt(y1)];
  return side > 0 ? [Math.min(a, b), Math.max(a, b)] : [1 - Math.max(a, b), 1 - Math.min(a, b)];
};
/** Bán kính tương đối của mũi tàu ở khoảng s tính từ chân mũi */
const noseR = (s: number) => Math.max(0, 1 - (s / TN) ** 1.8) ** 0.75;
/** Điểm trên mặt mũi tàu (đã chúi xuống DROOP) ở góc u, khoảng s; lift = đẩy ra ngoài */
const noseAt = (u: number, s: number, lift = 0): V3 => {
  const phi = u * Math.PI * 2;
  const r = noseR(s) + lift;
  const zl = Math.cos(phi) * r * TB;
  return [Math.sin(phi) * r * TA, TY - s * Math.sin(DROOP) - zl * Math.cos(DROOP), TZ1 + s * Math.cos(DROOP) - zl * Math.sin(DROOP)];
};

/** Vẽ hai dải sọc xanh / cam chạy dọc thân và mũi */
const paintStripes = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  for (const side of SIDES) {
    const [b0, b1] = uBand(-0.56, -0.2, side);
    ctx.fillStyle = TRAIN_BLUE;
    ctx.fillRect(b0 * w, 0, (b1 - b0) * w, h);
    const [o0, o1] = uBand(-0.7, -0.63, side);
    ctx.fillStyle = ORANGE;
    ctx.fillRect(o0 * w, 0, (o1 - o0) * w, h);
  }
};

/** Ảnh thân tàu: nền trắng, sọc, hàng cửa sổ, cửa lên xuống (đầu ảnh = phía mũi) */
const trainBody = () =>
  drawTexture("vehicles:train-body", 1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = TRAIN;
    ctx.fillRect(0, 0, w, h);
    paintStripes(ctx, w, h);
    const row = (z: number) => (1 - (z - TZ0) / (TZ1 - TZ0)) * h;
    for (const side of SIDES) {
      const [w0, w1] = uBand(-0.02, 0.48, side);
      ctx.fillStyle = "#1f2733";
      for (const i of range(10)) {
        const z = -6.6 + i * 1.02;
        ctx.beginPath();
        ctx.roundRect(w0 * w, row(z + 0.31), (w1 - w0) * w, row(z - 0.31) - row(z + 0.31), 9);
        ctx.fill();
      }
      // Cửa lên xuống gần đuôi toa: viền xám + ô kính nhỏ
      const [d0, d1] = uBand(-1.05, 0.56, side);
      ctx.strokeStyle = "#9aa0a8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(d0 * w, row(-7.55), (d1 - d0) * w, row(-8.45) - row(-7.55), 8);
      ctx.stroke();
      const [g0, g1] = uBand(0.06, 0.44, side);
      ctx.fillStyle = "#1f2733";
      ctx.beginPath();
      ctx.roundRect(g0 * w, row(-7.72), (g1 - g0) * w, row(-8.28) - row(-7.72), 6);
      ctx.fill();
    }
  });

/** Ảnh mũi tàu: sọc chạy tiếp tới chóp, kính buồng lái giọt nước trên đỉnh, hốc đèn tối (đáy ảnh = chân mũi) */
const trainNose = () =>
  drawTexture("vehicles:train-nose", 1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = TRAIN;
    ctx.fillRect(0, 0, w, h);
    paintStripes(ctx, w, h);
    const at = (s: number) => (1 - s / TN) * h;
    ctx.fillStyle = "#1f2733";
    ctx.beginPath();
    ctx.ellipse(0.5 * w, at(3.2), 0.115 * w, (at(2.3) - at(4.1)) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const u of [0.2, 0.8]) {
      ctx.beginPath();
      ctx.ellipse(u * w, at(5.35), 0.04 * w, (at(4.95) - at(5.75)) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Giá chuyển hướng: khung, xà nhún, hai trục bánh thép có gờ, hộp trục */
const Bogie = ({ z }: { z: number }) => {
  const axles = [-1.25, 1.25];
  const wheels = axles.flatMap((dz) => SIDES.map((s) => ({ p: [s * 0.75, 0.84, z + dz] as V3, r: [0, 0, Math.PI / 2] as V3 })));
  const flanges = axles.flatMap((dz) => SIDES.map((s) => ({ p: [s * 0.675, 0.84, z + dz] as V3, r: [0, 0, Math.PI / 2] as V3 })));
  return (
    <group>
      <Repeat at={wheels} shape="cylinder" size={[0.43, 0.13, 1]} seg={32} color="#8a9099" finish="metal" />
      <Repeat at={flanges} shape="cylinder" size={[0.465, 0.025, 1]} seg={32} color="#6d737b" finish="metal" />
      <Repeat at={axles.map((dz) => ({ p: [0, 0.84, z + dz] as V3, r: [0, 0, Math.PI / 2] as V3 }))} shape="cylinder" size={[0.08, 2.15, 1]} seg={12} color="#5f646b" finish="metal" />
      <Repeat at={axles.flatMap((dz) => SIDES.map((s): V3 => [s * 1.07, 0.84, z + dz]))} size={[0.18, 0.26, 0.32]} radius={0.04} color="#2b2e33" finish="matte" />
      <Repeat at={SIDES.map((s): V3 => [s * 1.0, 0.98, z])} size={[0.16, 0.3, 3.1]} radius={0.05} color="#3a3d42" finish="matte" />
      <Box size={[2.1, 0.22, 0.7]} radius={0.05} position={[0, 1.12, z]} color="#3a3d42" finish="matte" />
    </group>
  );
};

/** Tàu cao tốc đầu máy mũi dài trên đoạn ray: thân elip trắng sọc xanh – cam, kính lái giọt nước, cần lấy điện */
export const Train = () => {
  const nose: V2[] = range(15).map((i): V2 => {
    const s = (i / 14) * TN;
    return [noseR(s), s];
  });
  const sleepers = range(38).map((i): V3 => [0, 0.19, -10.2 + i * 0.6]);
  return (
    <group>
      {/* Đoạn ray: nền đá, tà vẹt, hai ray */}
      <Extrude
        shape={[[-2.2, 0], [2.2, 0], [1.75, 0.12], [-1.75, 0.12]]}
        depth={23}
        position={[0, 0, 0.9]}
        color="#ffffff"
        map={speckle("#9a958e", ["#7d7871", "#b3aea6", "#6b665f"], 900, 7, 0.02)}
        finish="matte"
      />
      <Repeat at={sleepers} size={[2.6, 0.14, 0.26]} color="#b5b1aa" finish="matte" />
      {SIDES.map((s) => (
        <Box key={s} size={[0.075, 0.15, 23]} position={[s * 0.7175, 0.335, 0.9]} color="#9aa0a8" finish="metal" />
      ))}
      <Bogie z={1.2} />
      <Bogie z={-6.8} />
      {/* Thân toa: trụ elip hở hai đầu, phủ ảnh cửa sổ + sọc; mũi xoay tròn cùng cách trải ảnh */}
      <Cylinder
        r={1}
        h={TZ1 - TZ0 + 0.15}
        open
        seg={64}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[TA, 1, TB]}
        position={[0, TY, (TZ0 + TZ1 + 0.15) / 2]}
        color="#ffffff"
        map={trainBody()}
        finish="gloss"
        doubleSide
      />
      <Lathe
        points={nose}
        seg={64}
        rotation={[Math.PI / 2 + DROOP, 0, 0]}
        scale={[TA, 1, TB]}
        position={[0, TY, TZ1]}
        color="#ffffff"
        map={trainNose()}
        finish="gloss"
      />
      {SIDES.map((s) => (
        <Sphere key={s} r={1} scale={[0.17, 0.07, 0.24]} position={noseAt(s > 0 ? 0.2 : 0.8, 5.35, 0.005)} color={HEAD_LIGHT} finish="glow" seg={16} />
      ))}
      {/* Đuôi toa: vách, hành lang nối (xếp nếp cao su), móc nối */}
      <Cylinder r={1} h={0.08} seg={64} rotation={[Math.PI / 2, 0, 0]} scale={[TA, 1, TB]} position={[0, TY, TZ0 + 0.04]} color="#e6e8eb" finish="gloss" />
      <Box size={[1.3, 2.3, 0.4]} radius={0.12} position={[0, 2.8, TZ0 - 0.15]} color="#4a4e55" finish="rubber" />
      <Repeat at={range(4).map((i): V3 => [0, 2.8, TZ0 - 0.04 - i * 0.09])} size={[1.36, 2.36, 0.03]} radius={0.012} color="#2b2e33" finish="rubber" />
      <Cylinder r={0.09} h={0.7} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.05, TZ0 - 0.2]} color="#5f646b" finish="metal" seg={16} />
      <Box size={[0.32, 0.26, 0.2]} radius={0.04} position={[0, 1.05, TZ0 - 0.58]} color="#3a3d42" finish="metal" />
      {/* Gầm: hộp thiết bị giữa hai giá */}
      <Box size={[1.7, 0.42, 6.0]} radius={0.06} position={[0, 1.38, -2.8]} color="#3a3d42" finish="matte" />
      {/* Cần lấy điện một tay trên nóc */}
      <group position={[0, TY + TB - 0.02, -6.4]}>
        <Box size={[1.0, 0.1, 1.3]} radius={0.04} color="#5f646b" finish="metal" />
        <Repeat at={[[-0.3, 0.12, -0.4], [0.3, 0.12, -0.4], [0, 0.12, 0.4]]} shape="cylinder" size={[0.06, 0.16, 1]} seg={10} color="#c9a46b" finish="ceramic" />
        <Tube path={[[0, 0.22, -0.45], [0, 0.6, 0.35]]} r={0.04} color="#9aa0a8" finish="metal" />
        <Tube path={[[0, 0.6, 0.35], [0, 0.95, -0.3]]} r={0.03} color="#9aa0a8" finish="metal" />
        <Box size={[1.4, 0.05, 0.12]} radius={0.02} position={[0, 0.97, -0.3]} color="#2b2e33" finish="metal" />
        {SIDES.map((s) => (
          <Tube key={s} path={[[s * 0.69, 0.97, -0.3], [s * 0.82, 0.93, -0.3], [s * 0.88, 0.84, -0.3]]} r={0.018} color="#9aa0a8" finish="metal" />
        ))}
      </group>
    </group>
  );
};
/* ===== Xe tải ===== */

const TRUCK = "#2e7d4f";
const CARGO = "#f2f3f0";

/** Xe tải thùng cabin lật: cabin xanh có kính chắn gió, gương lớn, lưới tản nhiệt; thùng hàng trắng gân sóng, bánh sau kép */
export const Truck = () => {
  const cab: V2[] = [
    [1.9, 0.78],
    ...wheelArch(2.75, 0.45, 0.58, 0.78),
    [3.52, 0.78],
    [3.58, 0.95],
    [3.6, 1.6],
    [3.56, 1.72],
    [3.42, 2.62],
    [3.3, 2.76],
    [3.1, 2.8],
    [1.98, 2.8],
    [1.9, 2.72],
  ];
  const windshield = pane([3.56, 1.72], [3.42, 2.62], 0.084, 0.05, 0.95);
  const doorWindow: V2[] = [
    [3.36, 1.85],
    [3.26, 2.6],
    [2.3, 2.6],
    [2.3, 1.85],
  ];
  const seams = SIDES.flatMap((s) => [2.22, 3.44].map((z): V3 => [s * 1.002, 1.85, z]));
  const ribs = stripes(CARGO, "#e2e5e9", 28, true);
  const tag = label("GIAO HÀNG NHANH", { bg: CARGO, fg: TRUCK, aspect: 6, size: 0.6, weight: 800 });
  const wheels: [number, number, number][] = [
    [0.97, 2.75, 0.26],
    [0.8, -2.05, 0.24],
    [1.06, -2.05, 0.24],
  ];
  return (
    <group>
      {/* Cabin */}
      <Extrude shape={cab} depth={1.84} bevel={0.08} rotation={[0, -Math.PI / 2, 0]} color={TRUCK} finish="gloss" />
      <Box size={[1.7, 0.012, windshield.length]} position={windshield.position} rotation={windshield.rotation} color={DARK_GLASS} finish="gloss" />
      {SIDES.map((s) => (
        <Extrude key={s} shape={doorWindow} depth={0.008} rotation={[0, -Math.PI / 2, 0]} position={[s * 1.004, 0, 0]} color={DARK_GLASS} finish="gloss" />
      ))}
      <Repeat at={seams} size={[0.006, 1.75, 0.008]} color="#1b4a2f" finish="matte" />
      <Repeat at={SIDES.map((s): V3 => [s * 1.008, 1.72, 2.42])} size={[0.016, 0.03, 0.16]} radius={0.007} color={SILVER} finish="chrome" />
      <Repeat at={SIDES.map((s): V3 => [s * 0.95, 0.6, 2.02])} size={[0.2, 0.05, 0.34]} radius={0.02} color="#2b2e33" finish="metal" />
      {/* Mặt trước: lưới tản nhiệt, đèn pha, cản, gạt mưa, đèn nóc */}
      <Box size={[1.5, 0.42, 0.04]} radius={0.015} position={[0, 1.27, 3.68]} color="#1f1f1f" finish="gloss" />
      <Repeat at={[1.15, 1.27, 1.39].map((y): V3 => [0, y, 3.705])} size={[1.42, 0.03, 0.012]} color={SILVER} finish="chrome" />
      {SIDES.map((s) => (
        <group key={s} position={[s * 0.74, 0.98, 3.665]}>
          <Box size={[0.4, 0.17, 0.06]} radius={0.03} color="#1f1f1f" finish="gloss" />
          <Box size={[0.34, 0.11, 0.06]} radius={0.025} position={[0, 0, 0.012]} color={HEAD_LIGHT} finish="glow" />
        </group>
      ))}
      <Box size={[2.08, 0.26, 0.22]} radius={0.06} position={[0, 0.68, 3.62]} color="#3a3d42" finish="matte" />
      <Repeat at={SIDES.map((s): V3 => [s * 0.7, 0.66, 3.735])} shape="cylinder" size={[0.06, 0.02, 1]} seg={16} color={HEAD_LIGHT} finish="glow" />
      {SIDES.map((s) => (
        <Tube key={s} path={[[s * 0.08, 1.8, 3.62], [s * 0.4, 2.0, 3.59], [s * 0.66, 2.3, 3.55]]} r={0.016} color="#1f1f1f" finish="matte" />
      ))}
      <Repeat at={[-0.3, 0, 0.3].map((x): V3 => [x, 2.89, 3.18])} size={[0.12, 0.04, 0.06]} radius={0.015} color="#ffa53a" finish="glow" emissiveIntensity={1} />
      {/* Gương chiếu hậu lớn */}
      {SIDES.map((s) => (
        <group key={s}>
          <Tube path={[[s * 1.0, 2.25, 3.3], [s * 1.2, 2.3, 3.36], [s * 1.27, 2.22, 3.38]]} r={0.022} color="#2b2e33" finish="metal" />
          <Box size={[0.07, 0.4, 0.2]} radius={0.03} position={[s * 1.28, 2.0, 3.38]} color="#2b2e33" finish="plastic" />
          <Box size={[0.07, 0.16, 0.18]} radius={0.03} position={[s * 1.24, 1.68, 3.42]} color="#2b2e33" finish="plastic" />
        </group>
      ))}
      {/* Thùng hàng: thân gân sóng, dải cam, chữ, cửa sau hai cánh */}
      <Box size={[2.36, 2.28, 5.45]} radius={0.05} position={[0, 2.16, -0.975]} color="#ffffff" map={ribs} finish="plastic" />
      <Repeat at={SIDES.map((s): V3 => [s * 1.186, 1.3, -0.975])} size={[0.012, 0.16, 5.3]} color={ORANGE} finish="gloss" />
      {SIDES.map((s) => (
        <mesh key={s} position={[s * 1.187, 2.25, -0.9]} rotation={[0, (s * Math.PI) / 2, 0]}>
          <planeGeometry args={[3.6, 0.6]} />
          <meshStandardMaterial map={tag} roughness={0.45} />
        </mesh>
      ))}
      <Box size={[0.02, 2.14, 0.012]} position={[0, 2.16, -3.703]} color="#9aa0a8" finish="matte" />
      <Repeat at={[-0.85, -0.25, 0.25, 0.85].map((x): V3 => [x, 2.16, -3.725])} shape="cylinder" size={[0.022, 2.0, 1]} seg={10} color={SILVER} finish="chrome" />
      {/* Khung gầm, bình dầu, thanh chắn hông, chắn bùn, cản sau, đèn hậu */}
      <Box size={[0.9, 0.22, 6.9]} radius={0.03} position={[0, 0.86, -0.15]} color="#2b2e33" finish="metal" />
      <Box size={[2.2, 0.08, 5.3]} position={[0, 0.99, -0.975]} color="#2b2e33" finish="metal" />
      <Cylinder r={0.22} h={0.9} rotation={[Math.PI / 2, 0, 0]} position={[0.86, 0.72, 0.95]} color="#c3c8cf" finish="chrome" seg={28} />
      <Box size={[0.4, 0.36, 0.6]} radius={0.04} position={[-0.86, 0.72, 0.95]} color="#2b2e33" finish="plastic" />
      {SIDES.flatMap((s) =>
        [0.55, 0.78].map((y) => (
          <Tube key={`${s}${y}`} path={[[s * 1.12, y, -1.45], [s * 1.12, y, 0.4]]} r={0.025} color="#b9bec5" finish="metal" />
        )),
      )}
      <Repeat at={SIDES.map((s): V3 => [s * 0.93, 0.48, -2.62])} size={[0.6, 0.5, 0.025]} color="#1f1f1f" finish="rubber" />
      <Box size={[2.3, 0.2, 0.1]} radius={0.03} position={[0, 0.86, -3.62]} color="#2b2e33" finish="metal" />
      <Box size={[2.0, 0.14, 0.12]} radius={0.03} position={[0, 0.5, -3.55]} color="#b9bec5" finish="metal" />
      <Repeat at={SIDES.map((s): V3 => [s * 0.85, 0.86, -3.675])} size={[0.32, 0.12, 0.03]} radius={0.02} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.3} />
      <Repeat at={SIDES.map((s): V3 => [s * 0.55, 0.86, -3.675])} size={[0.14, 0.12, 0.03]} radius={0.02} color="#ffa53a" finish="glow" />
      {SIDES.flatMap((s) =>
        wheels.map(([x, z, w]) => <Wheel key={`${s}${x}${z}`} position={[s * x, 0.45, z]} r={0.45} w={w} rimRatio={0.56} spokes={0} />),
      )}
    </group>
  );
};

/* ===== Thuyền ===== */

const HULL = "#f6f7f8";
const BOAT_BLUE = "#1f6fb2";
const CUSHION = "#efe9dc";
const GALVANIZED = "#9aa0a8";
/** Thân thuyền dài BL từ vách đuôi (z = BZ0) tới mũi; thuyền đặt cao BOAT_Y trên rơ-moóc */
const BZ0 = -3.0;
const BL = 6.4;
const BOAT_Y = 0.5;
/** Ảnh thân trải theo độ cao: v = y / HULL_V */
const HULL_V = 1.5;
const FLOOR_Y = 0.62;

/** Mặt cắt thân ở vị trí t (0 = vách đuôi, 1 = mũi): z, nửa bề ngang, sống đáy, mép mạn, gờ đáy (chine) */
const station = (t: number) => {
  const hb = t <= 0.55 ? 1.15 : 1.15 * Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2.2) ** 0.6;
  const keel = t <= 0.6 ? 0.15 : 0.15 + 0.8 * ((t - 0.6) / 0.4) ** 2;
  const sheer = 1.05 + 0.25 * t * t;
  const chine = keel + (0.22 + 0.33 * t) * (sheer - keel);
  return { z: BZ0 + BL * t, hb, keel, sheer, chine };
};

/** Mặt cắt từ mép mạn trái → sống đáy → mép mạn phải: đáy chữ V, gờ hất nước, mạn hơi loe */
const hullRing = (t: number): V2[] => {
  const { hb, keel, sheer, chine } = station(t);
  const half: V2[] = [
    [0, keel],
    [0.44 * hb, keel + 0.47 * (chine - keel)],
    [0.88 * hb, chine],
    [0.93 * hb, chine + 0.015],
    [0.985 * hb, (chine + sheer) / 2],
    [hb, sheer],
  ];
  return [
    ...half
      .slice(1)
      .reverse()
      .map(([x, y]): V2 => [-x, y]),
    ...half,
  ];
};

/** Các mặt cắt từ t0 tới mũi, dày dần về phía mũi (thân đổi dáng nhanh ở đó) */
const hullStations = (t0: number, n: number) => range(n + 1).map((i) => t0 + (1 - t0) * (1 - (1 - i / n) ** 1.6));

const buildGeometry = (position: number[], uv: number[], index: number[]) => {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};

/** Vỏ thân dựng từ các mặt cắt, mặt ngoài hướng ra ngoài; uv = (t, độ cao) để vẽ sọc mớn nước */
const hullShell = () => {
  const ts = hullStations(0, 72);
  const p = hullRing(0).length;
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  ts.forEach((t) => {
    const { z } = station(t);
    hullRing(t).forEach(([x, y]) => {
      position.push(x, y, z);
      uv.push(t, y / HULL_V);
    });
  });
  for (let i = 0; i < ts.length - 1; i++) {
    for (let j = 0; j < p - 1; j++) {
      const a = i * p + j;
      const b = a + p;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return buildGeometry(position, uv, index);
};

/** Vách đuôi phẳng: quạt tam giác từ tâm, mặt hướng về -z */
const hullTransom = () => {
  const ring = hullRing(0);
  const { keel, sheer } = station(0);
  const mid = (keel + sheer) / 2;
  const position = [0, mid, BZ0, ...ring.flatMap(([x, y]) => [x, y, BZ0])];
  const uv = [0, mid / HULL_V, ...ring.flatMap(([, y]) => [0, y / HULL_V])];
  const index = [...range(ring.length - 1).flatMap((j) => [0, j + 2, j + 1]), 0, 1, ring.length];
  return buildGeometry(position, uv, index);
};

/** Boong mũi khum nhẹ từ vách cabin (t = 0,5) tới mũi */
const foreDeck = () => {
  const ts = hullStations(0.5, 40);
  const k = 16;
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  ts.forEach((t) => {
    const { z, hb, sheer } = station(t);
    range(k + 1).forEach((i) => {
      const u = -1 + (2 * i) / k;
      position.push(u * hb, sheer + 0.07 * (hb / 1.15) * (1 - u * u), z);
      uv.push((u + 1) / 2, t);
    });
  });
  for (let i = 0; i < ts.length - 1; i++) {
    for (let j = 0; j < k; j++) {
      const a = i * (k + 1) + j;
      const b = a + k + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return buildGeometry(position, uv, index);
};

/** Geometry tự dựng: tạo một lần mỗi lần gắn mô hình, giải phóng khi gỡ */
const useBuilt = (build: () => BufferGeometry) => {
  const geometry = useMemo(() => build(), [build]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
};

/** Ảnh thân theo độ cao: sơn chống hà xanh than dưới mớn nước, sọc đỏ mớn nước, sọc xanh dọc mạn */
const hullPaint = () =>
  drawTexture("vehicles:boat-hull", 64, 512, (ctx, w, h) => {
    const row = (y: number) => (1 - y / HULL_V) * h;
    const band = (y0: number, y1: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, row(y1), w, row(y0) - row(y1));
    };
    band(0, HULL_V, HULL);
    band(0, 0.4, "#1d2a44");
    band(0.4, 0.45, "#c62f2f");
    band(0.78, 0.87, BOAT_BLUE);
    band(0.9, 0.915, GALVANIZED);
  });

/** Điểm dọc mép mạn bên s ở các vị trí ts: inset = lùi vào trong, dy = nâng lên */
const along = (s: number, ts: number[], inset = 0, dy = 0): V3[] =>
  ts.map((t) => {
    const { z, hb, sheer } = station(t);
    return [s * Math.max(hb - inset, 0), sheer + dy, z];
  });

/** Ghế lái / ghế phụ: chân trụ, đệm ngồi, tựa lưng ngả sau */
const BoatSeat = ({ position }: { position: V3 }) => (
  <group position={position}>
    <Cylinder r={0.05} h={0.36} position={[0, 0.18, 0]} color={SILVER} finish="chrome" seg={16} />
    <Cylinder r={0.16} h={0.03} position={[0, 0.015, 0]} color={SILVER} finish="chrome" seg={24} />
    <Box size={[0.52, 0.04, 0.47]} radius={0.015} position={[0, 0.35, 0]} color={BOAT_BLUE} finish="plastic" />
    <Box size={[0.5, 0.12, 0.45]} radius={0.05} position={[0, 0.42, 0]} color={CUSHION} finish="fabric" />
    <Box size={[0.5, 0.42, 0.1]} radius={0.05} position={[0, 0.7, -0.22]} rotation={[-0.15, 0, 0]} color={CUSHION} finish="fabric" />
  </group>
);

/** Máy treo đuôi (mặt hướng -z): giá kẹp, vỏ trên / dưới, thân trục, tấm chống xoáy, hộp số, chân vịt ba cánh */
const Outboard = () => (
  <group position={[0, 0, BZ0 - 0.3]}>
    <Box size={[0.3, 0.3, 0.16]} radius={0.03} position={[0, 1.0, 0.22]} color="#2b2e33" finish="metal" />
    <Box size={[0.38, 0.26, 0.5]} radius={0.08} position={[0, 1.12, 0]} color="#1c1d20" finish="plastic" />
    <Box size={[0.42, 0.42, 0.62]} radius={0.14} position={[0, 1.44, 0]} color="#1c1d20" finish="gloss" />
    <Box size={[0.426, 0.035, 0.5]} radius={0.012} position={[0, 1.38, 0]} color={SILVER} finish="chrome" />
    <Box size={[0.17, 0.72, 0.26]} radius={0.05} position={[0, 0.62, 0]} color="#1c1d20" finish="plastic" />
    <Box size={[0.36, 0.025, 0.42]} radius={0.01} position={[0, 0.27, -0.04]} color="#2b2e33" finish="metal" />
    <Capsule r={0.075} length={0.32} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.14, -0.02]} color="#1c1d20" finish="plastic" />
    <Box size={[0.03, 0.2, 0.14]} radius={0.01} position={[0, -0.03, 0.02]} color="#1c1d20" finish="plastic" />
    <group position={[0, 0.14, -0.3]}>
      <Cylinder r={0.045} h={0.12} rotation={[Math.PI / 2, 0, 0]} color={SILVER} finish="metal" seg={20} />
      <Cone r={0.045} h={0.07} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.095]} color={SILVER} finish="metal" seg={20} />
      {range(3).map((i) => (
        <group key={i} rotation={[0, 0, (i / 3) * Math.PI * 2]}>
          <Box size={[0.2, 0.13, 0.012]} radius={0.005} position={[0.13, 0, 0]} rotation={[0.45, 0, 0]} color={SILVER} finish="metal" />
        </group>
      ))}
    </group>
  </group>
);

/** Rơ-moóc kéo thuyền: khung mạ kẽm, càng kéo + khớp nối, bánh dẫn hướng, cột tời, bánh + chắn bùn, ván đỡ bọc thảm */
const BoatTrailer = () => (
  <group>
    {/* Khung: hai dầm dọc, thanh ngang, càng kéo, thanh giằng chéo */}
    <Repeat at={SIDES.map((s): V3 => [s * 0.55, 0.45, -0.2])} size={[0.1, 0.12, 4.8]} radius={0.015} color={GALVANIZED} finish="metal" />
    <Repeat at={[-2.55, -0.6, 1.0, 2.1].map((z): V3 => [0, 0.45, z])} size={[1.2, 0.1, 0.1]} radius={0.015} color={GALVANIZED} finish="metal" />
    <Box size={[0.12, 0.12, 2.3]} radius={0.015} position={[0, 0.45, 3.1]} color={GALVANIZED} finish="metal" />
    {SIDES.map((s) => {
      const b = span([s * 0.55, 0.45, 2.1], [0, 0.45, 3.6]);
      return <Cylinder key={s} r={0.04} h={b.length} position={b.position} rotation={b.rotation} color={GALVANIZED} finish="metal" seg={12} />;
    })}
    {/* Khớp nối cầu kéo + bánh dẫn hướng có tay quay */}
    <Box size={[0.16, 0.12, 0.34]} radius={0.03} position={[0, 0.47, 4.3]} color="#2b2e33" finish="metal" />
    <Sphere r={0.06} position={[0, 0.43, 4.38]} color={SILVER} finish="chrome" seg={16} />
    <Cylinder r={0.04} h={0.5} position={[0.12, 0.38, 3.85]} color="#2b2e33" finish="metal" seg={16} />
    <Cylinder r={0.012} h={0.14} rotation={[0, 0, Math.PI / 2]} position={[0.18, 0.64, 3.85]} color="#2b2e33" finish="metal" seg={8} />
    <Wheel position={[0.12, 0.1, 3.85]} r={0.1} w={0.06} rimRatio={0.6} spokes={0} />
    {/* Cột tời: con lăn chặn mũi, trống tời + tay quay, dây đai tới khuy mũi */}
    <Box size={[0.08, 1.0, 0.08]} radius={0.012} position={[0, 0.95, 3.6]} color={GALVANIZED} finish="metal" />
    <Cylinder r={0.06} h={0.2} rotation={[0, 0, Math.PI / 2]} position={[0, 1.45, 3.52]} color="#1f1f1f" finish="rubber" seg={20} />
    <Cylinder r={0.06} h={0.16} rotation={[0, 0, Math.PI / 2]} position={[0, 1.15, 3.68]} color="#2b2e33" finish="metal" seg={20} />
    <Tube path={[[0.09, 1.15, 3.68], [0.14, 1.15, 3.68], [0.14, 1.03, 3.78]]} r={0.012} color={SILVER} finish="chrome" />
    <Tube path={[[0, 1.21, 3.66], [0, 1.53, 3.32]]} r={0.012} color={BOAT_BLUE} finish="fabric" caps={false} />
    {/* Ván đỡ bọc thảm nghiêng theo đáy chữ V + giá đỡ, con lăn sống đáy */}
    {SIDES.map((s) => (
      <Box key={s} size={[0.14, 0.07, 3.4]} radius={0.015} position={[s * 0.42, 0.74, -0.6]} rotation={[0, 0, s * 0.29]} color="#3d4a5c" finish="fabric" />
    ))}
    <Repeat at={SIDES.flatMap((s) => [-2.0, 0.9].map((z): V3 => [s * 0.42, 0.6, z]))} size={[0.06, 0.22, 0.06]} color={GALVANIZED} finish="metal" />
    <Cylinder r={0.06} h={0.22} rotation={[0, 0, Math.PI / 2]} position={[0, 0.59, 1.0]} color="#1f1f1f" finish="rubber" seg={20} />
    {/* Trục, nhíp, bánh xe, chắn bùn */}
    <Cylinder r={0.04} h={1.9} rotation={[0, 0, Math.PI / 2]} position={[0, 0.33, -0.6]} color="#2b2e33" finish="metal" seg={12} />
    <Repeat at={SIDES.map((s): V3 => [s * 0.55, 0.37, -0.6])} size={[0.06, 0.06, 0.9]} radius={0.02} color="#2b2e33" finish="metal" />
    {SIDES.map((s) => (
      <group key={s}>
        <Wheel position={[s * 0.95, 0.33, -0.6]} r={0.33} w={0.2} rimRatio={0.6} spokes={0} />
        <Cylinder
          r={0.42}
          h={0.28}
          open
          arc={Math.PI}
          rotation={[0, 0, Math.PI / 2]}
          position={[s * 0.95, 0.33, -0.6]}
          color={GALVANIZED}
          finish="metal"
          doubleSide
        />
        <Box size={[0.3, 0.04, 0.04]} position={[s * 0.75, 0.45, -0.6]} color={GALVANIZED} finish="metal" />
      </group>
    ))}
    {/* Đèn hậu */}
    <Repeat at={SIDES.map((s): V3 => [s * 0.62, 0.52, -2.62])} size={[0.16, 0.1, 0.04]} radius={0.015} color={TAIL_LIGHT} finish="glow" emissiveIntensity={1.3} />
  </group>
);

/** Xuồng máy cabin trên rơ-moóc: thân chữ V sơn mớn nước, cabin kính tối, buồng lái hở có ghế + vô lăng, lan can mũi, máy treo đuôi */
export const Boat = () => {
  const shell = useBuilt(hullShell);
  const transom = useBuilt(hullTransom);
  const deck = useBuilt(foreDeck);
  const paint = hullPaint();
  const rail = [0, 0.15, 0.3, 0.45, 0.55, 0.65, 0.75, 0.83, 0.9, 0.95, 0.98, 1];
  const cabin: V2[] = [
    [0.2, FLOOR_Y],
    [1.85, FLOOR_Y],
    [1.85, 1.38],
    [1.3, 1.78],
    [0.35, 1.8],
    [0.2, 1.76],
  ];
  const windshield = pane([1.85, 1.38], [1.3, 1.78], 0.045, 0.08, 0.92);
  const sideWindow: V2[] = [
    [0.45, 1.4],
    [1.6, 1.4],
    [1.25, 1.66],
    [0.45, 1.66],
  ];
  const pulpitT = [0.7, 0.78, 0.86, 0.92, 0.96];
  const bowTip = station(0.985);
  const pulpit: V3[] = [
    ...along(1, pulpitT, 0.1, 0.55),
    [0, bowTip.sheer + 0.55, bowTip.z],
    ...along(-1, [...pulpitT].reverse(), 0.1, 0.55),
  ];
  const stanchions = SIDES.flatMap((s) => along(s, [0.7, 0.82, 0.92], 0.1, 0.275));
  const navLight = station(0.93);
  const bowCleat = station(0.88);
  return (
    <group>
      <BoatTrailer />
      <group position={[0, BOAT_Y, 0]}>
        {/* Thân: vỏ ngoài sơn mớn nước, lòng thân sáng màu, vách đuôi, boong mũi */}
        <mesh geometry={shell}>
          <Surface color="#ffffff" map={paint} finish="gloss" />
        </mesh>
        <mesh geometry={shell}>
          <meshStandardMaterial color="#e3e6ea" roughness={0.6} side={BackSide} />
        </mesh>
        <mesh geometry={transom}>
          <Surface color="#ffffff" map={paint} finish="gloss" doubleSide />
        </mesh>
        <mesh geometry={deck}>
          <Surface color={HULL} finish="gloss" />
        </mesh>
        {/* Viền mép mạn: nẹp chống va xám, nẹp trên trắng quanh buồng lái, nẹp vách đuôi */}
        {SIDES.map((s) => (
          <group key={s}>
            <Tube path={along(s, rail, -0.012, -0.03)} r={0.035} color="#3a3d42" finish="rubber" seg={96} />
            <Tube path={along(s, [0, 0.1, 0.2, 0.3, 0.4, 0.5], 0.03, 0.01)} r={0.045} color={HULL} finish="gloss" />
          </group>
        ))}
        <Box size={[2.3, 0.06, 0.1]} radius={0.02} position={[0, station(0).sheer + 0.01, BZ0 + 0.04]} color={HULL} finish="gloss" />
        {/* Buồng lái: sàn chống trượt, vách cabin, ghế băng đuôi */}
        <Box
          size={[2.02, 0.04, 3.15]}
          position={[0, FLOOR_Y, BZ0 + 0.05 + 3.15 / 2]}
          color="#ffffff"
          map={speckle("#e9ebee", ["#d5d9de", "#f7f8f9"], 700, 11, 0.008)}
          finish="matte"
        />
        <Box size={[2.08, 0.5, 0.04]} position={[0, FLOOR_Y + 0.25, 0.18]} color={HULL} finish="gloss" />
        <Box size={[2.0, 0.38, 0.55]} radius={0.04} position={[0, FLOOR_Y + 0.19, BZ0 + 0.32]} color={HULL} finish="gloss" />
        <Box size={[1.9, 0.1, 0.5]} radius={0.04} position={[0, FLOOR_Y + 0.43, BZ0 + 0.32]} color={CUSHION} finish="fabric" />
        <Box size={[1.9, 0.34, 0.1]} radius={0.04} position={[0, FLOOR_Y + 0.66, BZ0 + 0.1]} color={CUSHION} finish="fabric" />
        {/* Cabin: kính chắn gió, cửa sổ hông, cửa trượt, tay vịn nóc, cột đèn neo */}
        <Extrude shape={cabin} depth={1.56} bevel={0.04} rotation={[0, -Math.PI / 2, 0]} color={HULL} finish="gloss" />
        <Box size={[1.36, 0.012, windshield.length]} position={windshield.position} rotation={windshield.rotation} color={DARK_GLASS} finish="gloss" />
        {SIDES.map((s) => (
          <Extrude key={s} shape={sideWindow} depth={0.008} rotation={[0, -Math.PI / 2, 0]} position={[s * 0.824, 0, 0]} color={DARK_GLASS} finish="gloss" />
        ))}
        <Box size={[0.56, 0.86, 0.02]} radius={0.008} position={[0, FLOOR_Y + 0.5, 0.15]} color={DARK_GLASS} finish="gloss" />
        <Box size={[0.03, 0.2, 0.03]} radius={0.01} position={[0.22, FLOOR_Y + 0.5, 0.135]} color={SILVER} finish="chrome" />
        {SIDES.map((s) => (
          <Tube key={s} path={[[s * 0.55, 1.84, 0.45], [s * 0.55, 1.91, 0.55], [s * 0.55, 1.91, 1.15], [s * 0.55, 1.84, 1.25]]} r={0.015} color={SILVER} finish="chrome" />
        ))}
        <Cylinder r={0.02} h={0.5} position={[0, 2.09, 0.45]} color={SILVER} finish="chrome" seg={12} />
        <Sphere r={0.04} position={[0, 2.36, 0.45]} color="#ffffff" finish="glow" seg={12} />
        {/* Bàn lái mạn phải (-x khi mũi hướng +z): thân, mặt đồng hồ nghiêng, màn hình định vị, vô lăng, kính chắn nhỏ */}
        <group position={[-0.5, FLOOR_Y, -0.3]}>
          <Box size={[0.62, 0.78, 0.5]} radius={0.06} position={[0, 0.39, 0]} color={HULL} finish="gloss" />
          <Box size={[0.56, 0.03, 0.34]} radius={0.01} position={[0, 0.8, 0]} rotation={[-0.45, 0, 0]} color="#2b2e33" finish="matte" />
          <Box size={[0.22, 0.02, 0.14]} radius={0.006} position={[-0.12, 0.83, 0.03]} rotation={[-0.45, 0, 0]} color="#3a7bd5" finish="glow" emissiveIntensity={0.5} />
          <Cylinder r={0.02} h={0.16} rotation={[Math.PI / 2 - 0.5, 0, 0]} position={[0.1, 0.86, -0.1]} color="#2b2e33" finish="metal" seg={10} />
          <group position={[0.1, 0.9, -0.17]} rotation={[-0.5, 0, 0]}>
            <Torus r={0.15} tube={0.015} color="#1f1f1f" finish="rubber" seg={40} radialSeg={10} />
            <Cylinder r={0.03} h={0.04} rotation={[Math.PI / 2, 0, 0]} color={SILVER} finish="chrome" seg={16} />
            {range(3).map((i) => (
              <group key={i} rotation={[0, 0, (i / 3) * Math.PI * 2 + Math.PI / 2]}>
                <Box size={[0.012, 0.13, 0.01]} position={[0, 0.075, 0]} color={SILVER} finish="chrome" />
              </group>
            ))}
          </group>
          <Box size={[0.6, 0.24, 0.01]} position={[0, 1.0, 0.16]} rotation={[-0.35, 0, 0]} color="#cfe3f2" finish="glass" />
        </group>
        <BoatSeat position={[0.5, FLOOR_Y, -1.05]} />
        <BoatSeat position={[-0.5, FLOOR_Y, -1.05]} />
        {/* Mũi: lan can, cọc lan can, đèn hàng hải đỏ mạn trái (+x) / xanh mạn phải, cọc buộc dây */}
        <Tube path={pulpit} r={0.016} color={SILVER} finish="chrome" seg={96} />
        <Repeat at={stanchions} shape="cylinder" size={[0.014, 0.55, 1]} seg={10} color={SILVER} finish="chrome" />
        {SIDES.map((s) => (
          <Sphere
            key={s}
            r={0.035}
            position={[s * navLight.hb * 0.6, navLight.sheer + 0.04, navLight.z]}
            color={s > 0 ? "#ff3030" : "#30ff60"}
            finish="glow"
            seg={12}
          />
        ))}
        <Repeat
          at={[[0, bowCleat.sheer + 0.08, bowCleat.z], ...SIDES.map((s): V3 => [s * 0.95, station(0).sheer + 0.06, BZ0 + 0.25])]}
          size={[0.04, 0.03, 0.16]}
          radius={0.01}
          color={SILVER}
          finish="chrome"
        />
        <Outboard />
      </group>
    </group>
  );
};
