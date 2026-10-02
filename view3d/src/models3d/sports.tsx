// Mô hình 3D nhóm Thể thao: đĩa ném, ván trượt tuyết đôi, ván trượt tuyết đơn, bóng đá, diều, gậy bóng chày, găng bóng chày, ván trượt, ván lướt sóng, vợt tennis
import { Euler, Quaternion, Vector3, type Texture } from "three";

import { Box, Cone, Cylinder, Extrude, Lathe, Repeat, Sphere, Torus, Tube, type Finish, type RepeatItem } from "./parts";
import { range, seeded, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture } from "./textures";

const FONT = '"Segoe UI", Arial, sans-serif';

/* ===== Hàm dựng dùng chung ===== */

const UP = new Vector3(0, 1, 0);

/** Góc xoay Euler đưa trục +y của khối về hướng dir */
const alignY = (dir: V3): V3 => {
  const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, new Vector3(...dir).normalize()));
  return [e.x, e.y, e.z];
};

/** Thanh trụ thẳng nối hai điểm a → b (nan, dây căng, thanh khung) */
const Rod = ({ a, b, r, color, finish = "plastic", seg = 8 }: { a: V3; b: V3; r: number; color: string; finish?: Finish; seg?: number }) => {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return (
    <Cylinder
      r={r}
      h={Math.hypot(...d)}
      position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]}
      rotation={alignY(d)}
      color={color}
      finish={finish}
      seg={seg}
    />
  );
};

/** Đường may khép kín hình chữ S trên mặt cầu bán kính 1 (bóng chày, bóng tennis); a + b = 1 nên điểm luôn nằm trên mặt cầu */
const seamPoint = (t: number, b = 0.3): V3 => {
  const a = 1 - b;
  return [a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t)];
};

/* ===== Ván dẹt có đầu vểnh: ván trượt tuyết, ván trượt ===== */

interface BoardSpec {
  /** Dài theo y (đuôi ở y = 0, mũi ở y = length), rộng nhất theo x (m) */
  length: number;
  width: number;
  /** Dày theo z, mặt trên hướng +z */
  thick: number;
  /** Nửa bề rộng tại độ cao y (m) */
  halfWidth: (y: number) => number;
  /** Chỗ bẻ phía mũi [y, góc vểnh thêm] theo y tăng dần; phía đuôi theo y giảm dần — đều vểnh về phía mặt trên (+z) */
  nose: [number, number][];
  tail: [number, number][];
}

interface BoardPiece {
  y0: number;
  y1: number;
  /** Khớp gập nằm ở mặt trên ván: vị trí thật, góc gập của khúc và y của khớp trên ván phẳng */
  joint: V3;
  angle: number;
  pivot: number;
}

/**
 * Chia ván thành khúc giữa phẳng + các khúc gập dần ở mũi / đuôi. Khúc gập kéo lùi thêm OVERLAP qua khớp
 * (phần thừa chìm vào khúc trước) để mặt dưới không hở khe chữ V ở chỗ gập.
 */
const OVERLAP = 0.006;

const boardPieces = ({ length, thick, nose, tail }: BoardSpec): BoardPiece[] => {
  const c1 = tail.length ? tail[0][0] : 0;
  const b1 = nose.length ? nose[0][0] : length;
  const pieces: BoardPiece[] = [{ y0: c1, y1: b1, joint: [0, c1, thick / 2], angle: 0, pivot: c1 }];
  let joint: V3 = [0, b1, thick / 2];
  let angle = 0;
  nose.forEach(([y, bend], k) => {
    angle += bend;
    const y1 = k + 1 < nose.length ? nose[k + 1][0] : length;
    pieces.push({ y0: y - OVERLAP, y1, joint, angle, pivot: y });
    joint = [0, joint[1] + (y1 - y) * Math.cos(angle), joint[2] + (y1 - y) * Math.sin(angle)];
  });
  joint = [0, c1, thick / 2];
  angle = 0;
  tail.forEach(([y, bend], k) => {
    angle -= bend;
    const y0 = k + 1 < tail.length ? tail[k + 1][0] : 0;
    pieces.push({ y0, y1: y + OVERLAP, joint, angle, pivot: y });
    joint = [0, joint[1] - (y - y0) * Math.cos(angle), joint[2] - (y - y0) * Math.sin(angle)];
  });
  return pieces;
};

/** Biên dạng khúc ván [y0, y1] trong toạ độ chuẩn hoá x, y ∈ [0, 1] — ảnh dán phủ đúng một lần cả tấm ván */
const pieceOutline = ({ length, width, halfWidth }: BoardSpec, y0: number, y1: number): V2[] => {
  const n = 28;
  // Dày điểm ở hai đầu khúc (mũi / đuôi tròn đổi bề rộng nhanh)
  const ys = range(n + 1).map((i) => y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / n)));
  const right = ys.map((y): V2 => [0.5 + halfWidth(y) / width, y / length]);
  const left = ys.map((y): V2 => [0.5 - halfWidth(y) / width, y / length]).reverse();
  const all = [...right, ...left];
  return all.filter((p, i) => {
    const q = all[(i + 1) % all.length];
    return Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6;
  });
};

/** Một lớp của tấm ván (thân ván hoặc lớp dán trên mặt): mỗi khúc là một Extrude chuẩn hoá rồi co giãn về cỡ thật */
const BoardLayer = ({ spec, depth, lift, map, color, finish }: { spec: BoardSpec; depth: number; lift: number; map?: Texture; color: string; finish: Finish }) => (
  <>
    {boardPieces(spec).map((piece, i) => (
      <group key={i} position={piece.joint} rotation={[piece.angle, 0, 0]}>
        <Extrude
          shape={pieceOutline(spec, piece.y0, piece.y1)}
          depth={depth}
          scale={[spec.width, spec.length, 1]}
          position={[-spec.width / 2, -piece.pivot, lift]}
          map={map}
          color={color}
          finish={finish}
        />
      </group>
    ))}
  </>
);

/* ===== Đĩa ném ===== */

/** Hình in giữa đĩa: vòng cam, ngôi sao xanh than trên nền trắng */
const frisbeeLogo = () =>
  drawTexture("sports:frisbee-logo", 256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "#fb8020";
    ctx.lineWidth = w * 0.05;
    for (const r of [0.86, 0.7]) {
      ctx.beginPath();
      ctx.arc(c, c, c * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#1d3557";
    ctx.beginPath();
    range(10).forEach((i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = c * (i % 2 === 0 ? 0.52 : 0.22);
      if (i === 0) ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      else ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    });
    ctx.closePath();
    ctx.fill();
  });

/** Mặt cắt đĩa ném (khép kín): mặt dưới tấm đĩa → thành trong → mép cuộn → thành ngoài → mặt trên */
const FRISBEE: V2[] = [
  [0, 0.0345],
  [0.06, 0.0335],
  [0.1, 0.031],
  [0.118, 0.0285],
  [0.1215, 0.025],
  [0.1218, 0.012],
  [0.1205, 0.006],
  [0.1225, 0.0015],
  [0.127, 0],
  [0.1318, 0.0015],
  [0.1348, 0.0075],
  [0.1358, 0.016],
  [0.1346, 0.0245],
  [0.1305, 0.0302],
  [0.122, 0.0338],
  [0.1, 0.0362],
  [0.06, 0.0373],
  [0, 0.0378],
];

/** Đĩa ném nhựa xanh dựng nghiêng: mép cuộn dày, vòng gân trắng, hình in giữa đĩa */
export const Frisbee = () => (
  <group rotation={[0, 0.45, 0]}>
    <group rotation={[1.15, 0, 0]}>
      <Lathe points={FRISBEE} color="#2f7fe0" finish="plastic" seg={64} />
      <Torus r={0.098} tube={0.0012} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0366, 0]} color="#fafafa" finish="plastic" seg={64} radialSeg={6} />
      <Torus r={0.111} tube={0.0012} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0353, 0]} color="#fafafa" finish="plastic" seg={64} radialSeg={6} />
      <Cylinder r={0.062} h={0.0006} position={[0, 0.0379, 0]} map={frisbeeLogo()} color="#ffffff" finish="plastic" seg={48} />
    </group>
  </group>
);

/* ===== Ván trượt tuyết (đôi) ===== */

const SKI: BoardSpec = {
  length: 1.7,
  width: 0.1,
  thick: 0.016,
  halfWidth: (y) => {
    if (y < 0.05) return 0.044 * Math.sqrt(Math.max(0, 1 - ((0.05 - y) / 0.05) ** 2));
    if (y > 1.5) return 0.05 * Math.sqrt(Math.max(0, 1 - ((y - 1.5) / 0.2) ** 2));
    // Eo thắt ở giữa (sidecut), mũi xoè rộng hơn đuôi
    return y < 0.8 ? 0.035 + 0.016 * (0.8 - y) ** 2 : 0.035 + 0.0306 * (y - 0.8) ** 2;
  },
  nose: [
    [1.42, 0.1],
    [1.5, 0.18],
    [1.56, 0.22],
    [1.62, 0.2],
  ],
  tail: [
    [0.1, 0.1],
    [0.05, 0.14],
  ],
};

/** Mặt trên ván trượt tuyết: nền xanh than, dải trắng chỗ ngàm, chữ dọc, mũi tên đỏ cam; hàng trên cùng = màu thành ván */
const skiTop = () =>
  drawTexture("sports:ski-top", 64, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#1d2b4f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#eef1f5";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.4);
    ctx.lineTo(w, h * 0.37);
    ctx.lineTo(w, h * 0.63);
    ctx.lineTo(0, h * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8432e";
    for (const k of range(3)) {
      const y = h * (0.1 + k * 0.032);
      ctx.beginPath();
      ctx.moveTo(0, y + 16);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w, y + 16);
      ctx.lineTo(w, y + 28);
      ctx.lineTo(w / 2, y + 12);
      ctx.lineTo(0, y + 28);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save();
    ctx.translate(w / 2, h * 0.27);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#eef1f5";
    ctx.font = `800 ${w * 0.5}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ALPINE", 0, 0);
    ctx.restore();
    ctx.fillStyle = "#e8432e";
    ctx.fillRect(0, h * 0.7, w, h * 0.012);
    ctx.fillStyle = "#2a2d33";
    ctx.fillRect(0, 0, w, h * 0.022);
  });

/** Một chiếc ván trượt tuyết dựng đứng (đuôi ở y = 0, mặt trên hướng +z) kèm ngàm giày */
const Ski = () => (
  <group>
    <BoardLayer spec={SKI} depth={SKI.thick} lift={-SKI.thick / 2} map={skiTop()} color="#ffffff" finish="gloss" />
    {/* Ngàm giày: tấm đế, cụm mũi, cụm gót có cần bật, phanh hai bên */}
    <Box size={[0.05, 0.36, 0.008]} radius={0.003} position={[0, 0.78, 0.012]} color="#3a3f47" finish="matte" />
    <Box size={[0.056, 0.075, 0.034]} radius={0.01} position={[0, 0.935, 0.028]} color="#2a2d33" finish="plastic" />
    <Box size={[0.046, 0.035, 0.012]} radius={0.004} position={[0, 0.95, 0.048]} color="#e8432e" finish="plastic" />
    <Box size={[0.058, 0.11, 0.046]} radius={0.012} position={[0, 0.63, 0.031]} color="#2a2d33" finish="plastic" />
    <Box size={[0.03, 0.09, 0.012]} radius={0.004} position={[0, 0.6, 0.058]} rotation={[0.25, 0, 0]} color="#e8432e" finish="plastic" />
    {SIDES.map((s) => (
      <Box key={s} size={[0.006, 0.08, 0.006]} position={[s * 0.034, 0.7, 0.02]} rotation={[0.5, 0, 0]} color="#9aa1aa" finish="metal" />
    ))}
  </group>
);

/** Gậy trượt tuyết từ mũi chân `from` tới đỉnh tay cầm `to`: mũi thép, thân nhôm, bánh chặn tuyết, tay cầm có quai */
const SkiPole = ({ from, to }: { from: V3; to: V3 }) => {
  const d: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(...d);
  return (
    <group position={from} rotation={alignY(d)}>
      <Cone r={0.005} h={0.03} position={[0, 0.015, 0]} rotation={[Math.PI, 0, 0]} color="#c9ced6" finish="chrome" seg={12} />
      <Cylinder r={0.0085} h={len - 0.17} position={[0, 0.03 + (len - 0.17) / 2, 0]} color="#c3c9d1" finish="metal" seg={16} />
      <Cylinder r={0.042} h={0.007} position={[0, 0.1, 0]} color="#1f2329" finish="rubber" seg={24} />
      <Cylinder rTop={0.0155} rBottom={0.013} h={0.15} position={[0, len - 0.078, 0]} color="#22252b" finish="rubber" seg={16} />
      <Sphere r={0.016} scale={[1, 0.55, 1]} position={[0, len - 0.002, 0]} color="#e8432e" finish="plastic" seg={16} />
      <Torus r={0.04} tube={0.0035} position={[0.02, len - 0.05, 0]} rotation={[0, 0.3, 0]} color="#e8432e" finish="fabric" seg={32} radialSeg={6} />
    </group>
  );
};

/** Đôi ván trượt tuyết dựng chụm đầu hình chữ A (mũi cong vểnh), hai gậy bắt chéo ở giữa tựa lên ván */
export const Skis = () => (
  <group>
    {SIDES.map((s) => (
      <group key={s} position={[s * 0.16, 0, 0]} rotation={[-0.1, 0, s * 0.06]}>
        <Ski />
      </group>
    ))}
    <SkiPole from={[-0.12, 0, 0.09]} to={[0.075, 1.12, -0.086]} />
    <SkiPole from={[0.12, 0, 0.05]} to={[-0.075, 1.12, -0.086]} />
  </group>
);

/* ===== Ván trượt tuyết đơn ===== */

const SNOWBOARD: BoardSpec = {
  length: 1.55,
  width: 0.29,
  thick: 0.012,
  halfWidth: (y) => {
    const end = 0.2;
    const d = y < end ? (end - y) / end : y > 1.55 - end ? (y - (1.55 - end)) / end : 0;
    if (d > 0) return 0.145 * Math.max(0, 1 - d ** 2.6) ** (1 / 2.6);
    return 0.145 - 0.02 * Math.sin((Math.PI * (y - end)) / (1.55 - 2 * end));
  },
  nose: [
    [1.35, 0.12],
    [1.45, 0.18],
  ],
  tail: [
    [0.2, 0.12],
    [0.1, 0.18],
  ],
};

/** Hình in mặt ván: trời đêm chuyển xanh, mặt trời cam, hai lớp núi tuyết; hàng trên cùng = màu thành ván */
const snowboardTop = () =>
  drawTexture("sports:snowboard-top", 128, 768, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#14213d");
    sky.addColorStop(0.55, "#2b4c7e");
    sky.addColorStop(1, "#7fb8dd");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fb8020";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.3, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    const ridge = (base: number, peaks: [number, number][], color: string, snow?: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * base);
      peaks.forEach(([x, y]) => ctx.lineTo(w * x, h * y));
      ctx.lineTo(w, h * base);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      if (!snow) return;
      ctx.fillStyle = snow;
      peaks.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(w * x, h * y);
        ctx.lineTo(w * (x - 0.12), h * (y + 0.045));
        ctx.lineTo(w * (x - 0.03), h * (y + 0.035));
        ctx.lineTo(w * (x + 0.02), h * (y + 0.05));
        ctx.lineTo(w * (x + 0.12), h * (y + 0.045));
        ctx.closePath();
        ctx.fill();
      });
    };
    ridge(0.55, [[0.25, 0.42], [0.5, 0.5], [0.8, 0.4]], "#3a7ca5", "#e8f1f8");
    ridge(0.68, [[0.15, 0.56], [0.45, 0.64], [0.7, 0.53], [0.95, 0.62]], "#0b132b", "#f4f8fb");
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 0, w, h * 0.02);
  });

/** Ngàm ván đơn: đế, lưng cao ở mép gót, quai cổ chân cam và quai mũi (đặt chéo góc angle trên mặt ván) */
const SnowboardBinding = ({ y, angle }: { y: number; angle: number }) => (
  <group position={[0, y, 0.006]} rotation={[0, 0, angle]}>
    <Box size={[0.25, 0.115, 0.014]} radius={0.006} position={[0, 0, 0.007]} color="#23262c" finish="plastic" />
    <Box size={[0.026, 0.12, 0.17]} radius={0.011} position={[-0.115, 0, 0.09]} rotation={[0, -0.18, 0]} color="#23262c" finish="plastic" />
    <Torus r={0.058} tube={0.011} arc={Math.PI} rotation={[Math.PI / 2, Math.PI / 2, 0]} scale={[1, 1, 2]} position={[-0.035, 0, 0.014]} color="#fb8020" finish="rubber" seg={20} radialSeg={8} />
    <Torus r={0.058} tube={0.008} arc={Math.PI} rotation={[Math.PI / 2, Math.PI / 2, 0]} scale={[1, 1, 1.8]} position={[0.08, 0, 0.014]} color="#3a3d44" finish="rubber" seg={20} radialSeg={8} />
  </group>
);

/** Ván trượt tuyết đơn dựng đứng hơi ngả: mũi / đuôi tròn vểnh, hình in núi tuyết, hai ngàm có quai */
export const Snowboard = () => (
  <group rotation={[-0.12, 0, 0]}>
    <BoardLayer spec={SNOWBOARD} depth={SNOWBOARD.thick} lift={-SNOWBOARD.thick / 2} map={snowboardTop()} color="#ffffff" finish="gloss" />
    <SnowboardBinding y={0.515} angle={-0.12} />
    <SnowboardBinding y={1.035} angle={0.26} />
  </group>
);

/* ===== Bóng đá ===== */

/**
 * Da bóng đá cổ điển: 12 ngũ giác đen + 20 lục giác trắng của khối 32 mặt cắt cụt, đường may xám.
 * Mỗi điểm ảnh → hướng trên cầu (UV của SphereGeometry) → mặt khối mà tia từ tâm đi ra cắt trước.
 */
const footballSkin = () =>
  drawTexture("sports:football", 1024, 512, (ctx, w, h) => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const unit = (v: V3): V3 => {
      const l = Math.hypot(...v);
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    // Tâm ngũ giác = 12 đỉnh khối 20 mặt; tâm lục giác = tâm 20 mặt tam giác của nó (đỉnh khối 12 mặt đối ngẫu)
    const pent: V3[] = [];
    const hex: V3[] = [];
    for (const a of SIDES) {
      for (const b of SIDES) {
        pent.push(unit([0, a, b * phi]), unit([a, b * phi, 0]), unit([b * phi, 0, a]));
        hex.push(unit([0, a * phi, b / phi]), unit([a / phi, 0, b * phi]), unit([a * phi, b / phi, 0]));
        for (const c of SIDES) hex.push(unit([a, b, c]));
      }
    }
    // Khoảng cách tâm → mặt (cạnh đều): ngũ giác 2.3274, lục giác 2.2673
    const faces = [...pent.map((n) => ({ n, k: 1 / 2.3274, pent: true })), ...hex.map((n) => ({ n, k: 1 / 2.2673, pent: false }))];
    const image = ctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      const theta = ((py + 0.5) / h) * Math.PI;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      for (let px = 0; px < w; px++) {
        const az = ((px + 0.5) / w) * Math.PI * 2;
        const dx = -Math.cos(az) * st;
        const dz = Math.sin(az) * st;
        let best = -Infinity;
        let second = -Infinity;
        let isPent = false;
        for (const f of faces) {
          const s = (dx * f.n[0] + ct * f.n[1] + dz * f.n[2]) * f.k;
          if (s > best) {
            second = best;
            best = s;
            isPent = f.pent;
          } else if (s > second) second = s;
        }
        const edge = (best - second) / best;
        const [r, g, b] = edge < 0.006 ? [120, 120, 120] : isPent ? [31, 31, 31] : [250, 250, 250];
        const i = (py * w + px) * 4;
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

/** Quả bóng đá trắng – đen cổ điển */
export const SportsBall = () => <Sphere r={0.11} position={[0, 0.11, 0]} map={footballSkin()} color="#ffffff" finish="plastic" seg={64} />;

/* ===== Diều ===== */

/** Diều hình thoi 4 màu: viền dây, khung tre chữ thập phía sau, đuôi dài thắt nơ chạm đất, dây diều xuống ống cuộn */
export const Kite = () => {
  const top: V3 = [0, 0.9, 0];
  const right: V3 = [0.35, 0.62, 0];
  const bottom: V3 = [0, 0, 0];
  const left: V3 = [-0.35, 0.62, 0];
  const center: V3 = [0, 0.62, 0];
  const panels: [V3[], string][] = [
    [[center, top, left], "#e63946"],
    [[center, right, top], "#ffd166"],
    [[center, bottom, right], "#1d7fd1"],
    [[center, left, bottom], "#fb8020"],
  ];
  // Diều nâng cao 0.6 m, ngả ra sau, quay nhẹ về phía camera; đỉnh dưới của diều là gốc nhóm
  const pose = new Euler(-0.35, 0.25, 0);
  const lift: V3 = [0, 0.6, 0];
  const world = (p: V3): V3 => {
    const v = new Vector3(...p).applyEuler(pose);
    return [v.x + lift[0], v.y + lift[1], v.z + lift[2]];
  };
  const tail: V3[] = [
    lift,
    [0.05, 0.5, 0.03],
    [-0.03, 0.4, 0.05],
    [0.05, 0.3, 0.06],
    [-0.02, 0.2, 0.07],
    [0.05, 0.1, 0.08],
    [0.03, 0.03, 0.1],
    [0.07, 0.006, 0.16],
    [0.16, 0.006, 0.2],
    [0.25, 0.006, 0.16],
  ];
  const bows = [1, 2, 3, 4, 5];
  const bowColors = ["#e63946", "#ffd166", "#1d7fd1", "#fb8020", "#06a77d"];
  const bridle = world([0, 0.62, 0.09]);
  const spool: V3 = [0.32, 0.045, 0.42];
  return (
    <group>
      <group position={lift} rotation={[pose.x, pose.y, pose.z]}>
        {panels.map(([pts, color]) => (
          <Extrude key={color} shape={pts.map(([x, y]): V2 => [x, y])} depth={0.002} color={color} finish="fabric" doubleSide />
        ))}
        {/* Viền dây quanh mép diều */}
        {[top, right, bottom, left].map((p, i, all) => (
          <Rod key={i} a={p} b={all[(i + 1) % 4]} r={0.0035} color="#2b2d42" finish="matte" />
        ))}
        {/* Khung tre chữ thập phía sau */}
        <Rod a={[0, 0.9, -0.007]} b={[0, 0, -0.007]} r={0.005} color="#c8a26b" finish="wood" />
        <Rod a={[-0.35, 0.62, -0.007]} b={[0.35, 0.62, -0.007]} r={0.005} color="#c8a26b" finish="wood" />
        {/* Dây cương phía trước nối khung tới điểm buộc dây */}
        <Rod a={[0, 0.85, 0.001]} b={[0, 0.62, 0.09]} r={0.0015} color="#5c5c5c" finish="matte" />
        <Rod a={[0, 0.25, 0.001]} b={[0, 0.62, 0.09]} r={0.0015} color="#5c5c5c" finish="matte" />
      </group>
      {/* Đuôi diều thắt nơ, phần cuối nằm trên đất */}
      <Tube path={tail} r={0.0035} seg={64} radialSeg={6} color="#f3f3f3" finish="fabric" />
      {bows.map((k, i) => (
        <group key={k} position={tail[k]}>
          <Cone r={0.02} h={0.032} seg={4} position={[-0.016, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, 0.35]} color={bowColors[i]} finish="fabric" />
          <Cone r={0.02} h={0.032} seg={4} position={[0.016, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.35]} color={bowColors[i]} finish="fabric" />
          <Sphere r={0.006} color={bowColors[i]} finish="fabric" seg={10} />
        </group>
      ))}
      {/* Dây diều chùng xuống ống cuộn gỗ trên đất */}
      <Tube path={[bridle, [(bridle[0] + spool[0]) / 2, (bridle[1] + spool[1]) / 2 - 0.08, (bridle[2] + spool[2]) / 2], spool]} r={0.0022} seg={32} radialSeg={6} color="#5c5c5c" finish="matte" />
      <group position={spool} rotation={[0, 0.5, Math.PI / 2]}>
        <Cylinder r={0.03} h={0.07} color="#e9e4d8" finish="fabric" seg={24} />
        {SIDES.map((s) => (
          <Cylinder key={s} r={0.045} h={0.008} position={[0, s * 0.039, 0]} color="#a8743f" finish="wood" seg={24} />
        ))}
      </group>
    </group>
  );
};

/* ===== Gậy + bóng chày ===== */

/** Vân gỗ tần bì chạy dọc thân gậy (u của Lathe quanh thân → vạch dọc ảnh) */
const batWood = () =>
  drawTexture("sports:bat-wood", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#d9b27a";
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(19);
    for (const _ of range(46)) {
      ctx.strokeStyle = `rgba(${150 + rand() * 30}, ${100 + rand() * 20}, 55, ${0.25 + rand() * 0.35})`;
      ctx.lineWidth = 0.8 + rand() * 2.2;
      const x = rand() * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 14, h * 0.33, x + (rand() - 0.5) * 14, h * 0.66, x + (rand() - 0.5) * 8, h);
      ctx.stroke();
    }
  });

/** Băng quấn cán gậy: sọc chéo đen / xám (quấn xoắn quanh trụ) */
const gripTape = (base: string, line: string) =>
  drawTexture(`sports:grip:${base}:${line}`, 64, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    for (let y = -w; y < h + w; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - w * 0.7);
      ctx.stroke();
    }
  });

/** Nhãn khắc cháy trên thân gậy: chữ chạy dọc thân, nền trong suốt */
const batLabel = () =>
  drawTexture("sports:bat-label", 128, 256, (ctx, w, h) => {
    ctx.strokeStyle = "#5a3418";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.38, h * 0.46, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#5a3418";
    ctx.font = `800 ${w * 0.3}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SLUGGER", 0, 0);
    ctx.restore();
  });

/** Biên dạng gậy bóng chày gỗ: núm cán → cán nhỏ → thân phình → đầu gậy bo tròn */
const BAT: V2[] = [
  [0, 0],
  [0.012, 0.0005],
  [0.0175, 0.003],
  [0.0185, 0.007],
  [0.017, 0.012],
  [0.0125, 0.017],
  [0.0115, 0.025],
  [0.0115, 0.12],
  [0.012, 0.22],
  [0.0135, 0.32],
  [0.017, 0.4],
  [0.022, 0.47],
  [0.027, 0.54],
  [0.0305, 0.62],
  [0.0325, 0.7],
  [0.033, 0.78],
  [0.0325, 0.815],
  [0.03, 0.832],
  [0.024, 0.84],
  [0.012, 0.8425],
  [0, 0.843],
];

/** Mũi chỉ đỏ hình chữ V dọc hai bên đường may của bóng chày bán kính R */
const baseballStitches = (R: number, n: number): RepeatItem[] => {
  const p = new Vector3();
  const t1 = new Vector3();
  const side = new Vector3();
  const dir = new Vector3();
  const pos = new Vector3();
  return range(n).flatMap((k) => {
    const t = (k / n) * Math.PI * 2;
    p.set(...seamPoint(t));
    t1.set(...seamPoint(t + 0.002)).sub(p).normalize();
    side.crossVectors(p, t1).normalize();
    return SIDES.map((s): RepeatItem => {
      dir.copy(side).multiplyScalar(s).addScaledVector(t1, 0.6).normalize();
      pos.copy(p).multiplyScalar(R * 1.004).addScaledVector(side, s * R * 0.075);
      return { p: [pos.x, pos.y, pos.z], r: alignY([dir.x, dir.y, dir.z]) };
    });
  });
};

/** Gậy bóng chày gỗ dựng chéo (cán quấn băng, nhãn khắc) và quả bóng chày khâu chỉ đỏ dưới chân */
export const BaseballBat = () => {
  const R = 0.0366;
  return (
    <group>
      <group rotation={[0, 0.35, -0.72]}>
        <Lathe points={BAT} map={batWood()} color="#ffffff" finish="wood" seg={40} />
        <Cylinder r={0.0124} h={0.19} position={[0, 0.12, 0]} open map={gripTape("#26282c", "#4a4d53")} color="#ffffff" finish="rubber" seg={24} doubleSide />
        <Cylinder rBottom={0.0309} rTop={0.0328} h={0.085} position={[0, 0.66, 0]} open arcStart={-0.55} arc={1.1} map={batLabel()} color="#ffffff" opacity={0.99} finish="wood" seg={12} />
      </group>
      {/* Bóng chày: da trắng ngà, rãnh may, mũi chỉ đỏ */}
      <group position={[0.3, R, 0.13]} rotation={[0.4, 0.6, 0.2]}>
        <Sphere r={R} color="#f4f1e8" finish="matte" seg={40} />
        <Tube path={range(48).map((k) => seamPoint((k / 48) * Math.PI * 2).map((v) => v * R * 1.001) as V3)} closed r={0.0007} seg={64} radialSeg={6} color="#d9d2bf" finish="matte" />
        <Repeat at={baseballStitches(R, 44)} size={[0.0012, 0.0062, 0.0012]} color="#d32f2f" finish="fabric" />
      </group>
    </group>
  );
};

/* ===== Găng bóng chày ===== */

const LEATHER = "#b4662a";
const LACE = "#6a3313";

/**
 * Găng bắt bóng chày bằng da (lòng găng hướng +z, ngón hướng lên): lòng găng khum sâu, 4 ngón múp mọc từ mu găng
 * vượt lên trên mép lòng rồi khum về trước, dây buộc đầu ngón, ngón cái, lưới đan, viền mép, quai cổ tay có nhãn
 */
export const BaseballGlove = () => {
  const fingers = [
    { x0: -0.044, x1: -0.055, top: 0.3, r: 0.0215 },
    { x0: -0.007, x1: -0.011, top: 0.318, r: 0.0215 },
    { x0: 0.03, x1: 0.035, top: 0.308, r: 0.0205 },
    { x0: 0.064, x1: 0.077, top: 0.282, r: 0.0195 },
  ].map(({ x0, x1, top, r }) => ({
    r,
    path: [
      [x0, 0.075, -0.058],
      [x0 + (x1 - x0) * 0.4, 0.17, -0.054],
      [x0 + (x1 - x0) * 0.8, top - 0.06, -0.034],
      [x1, top - 0.014, -0.006],
      [x1, top, 0.008],
    ] as V3[],
  }));
  const tips = fingers.map(({ path }) => path[path.length - 1]);
  // Viền da cuộn quanh mép lòng găng (cung dưới, từ gốc ngón cái vòng qua đáy sang ngón út)
  const rim = range(19).map((i): V3 => {
    const t = Math.PI * (0.98 + (i / 18) * 0.98);
    return [Math.cos(t) * 0.096, 0.115 + Math.sin(t) * 0.104, 0.002];
  });
  // Lưới đan kiểu rổ giữa ngón cái và ngón trỏ: ba quai ngang + hai dây dọc
  const webStraps = [0.19, 0.225, 0.26];
  return (
    <group rotation={[-0.08, 0.5, 0]}>
      {/* Lòng găng: nửa vỏ elip mở về phía trước (mặt ngoài là mu găng), lót trong sẫm hơn, đệm gót dưới đáy */}
      <Sphere r={1} thetaLength={Math.PI / 2} rotation={[-Math.PI / 2, 0, 0]} scale={[0.097, 0.034, 0.105]} position={[0, 0.115, 0]} color={LEATHER} finish="fabric" doubleSide seg={40} />
      <Sphere r={1} thetaLength={Math.PI / 2} rotation={[-Math.PI / 2, 0, 0]} scale={[0.092, 0.029, 0.1]} position={[0, 0.115, 0.001]} color="#9a521f" finish="fabric" doubleSide seg={40} />
      <Sphere r={1} scale={[0.066, 0.03, 0.02]} position={[0.004, 0.058, -0.014]} rotation={[-0.55, 0, 0]} color="#b86c2e" finish="fabric" seg={32} />
      {fingers.map(({ path, r }, i) => (
        <group key={i}>
          <Tube path={path} r={r} taper={[1, 1, 1, 0.95, 0.9]} seg={28} radialSeg={14} color={LEATHER} finish="fabric" />
          {/* Mặt trong ngón chạy xuống lòng găng, che mép trên của lòng */}
          <Tube path={[[path[1][0] * 0.95, 0.165, -0.017], [path[2][0], 0.215, -0.019], [path[3][0], 0.262, -0.014]]} r={r * 0.82} seg={16} radialSeg={12} color={LEATHER} finish="fabric" />
        </group>
      ))}
      {/* Ngón cái ôm mép trái lòng găng */}
      <Tube path={[[-0.064, 0.045, -0.03], [-0.098, 0.1, -0.012], [-0.113, 0.17, 0.008], [-0.108, 0.235, 0.026]]} r={0.023} taper={[1, 1, 0.95, 0.85]} seg={24} radialSeg={14} color={LEATHER} finish="fabric" />
      {webStraps.map((y, i) => (
        <Box key={y} size={[0.05 - i * 0.004, 0.024, 0.008]} radius={0.004} position={[-0.082, y, 0.004 - i * 0.004]} rotation={[0.2, 0, 0.12]} color="#a95c24" finish="fabric" />
      ))}
      {[-0.094, -0.07].map((x) => (
        <Tube key={x} path={[[x - 0.004, 0.175, 0.01], [x, 0.225, 0.006], [x + 0.004, 0.278, -0.003]]} r={0.0026} seg={16} radialSeg={6} color={LACE} finish="fabric" />
      ))}
      {/* Dây buộc qua đầu ngón cái, mép lưới và đầu bốn ngón */}
      <Tube path={[[-0.108, 0.255, 0.024], [-0.095, 0.285, 0.006], [-0.072, 0.292, 0.004], ...tips.map(([x, y, z]): V3 => [x, y + 0.013, z + 0.004])]} r={0.0032} seg={48} radialSeg={6} color={LACE} finish="fabric" />
      {/* Viền da cuộn quanh mép dưới lòng găng */}
      <Tube path={rim} r={0.0075} seg={48} radialSeg={10} color="#c98443" finish="fabric" />
      {/* Quai cổ tay phía sau có nhãn tròn */}
      <Box size={[0.13, 0.034, 0.014]} radius={0.007} position={[0.008, 0.05, -0.078]} rotation={[0.2, 0, 0]} color="#8f4a1c" finish="fabric" />
      <Cylinder r={0.012} h={0.004} position={[0.035, 0.051, -0.087]} rotation={[Math.PI / 2 + 0.2, 0, 0]} color="#fb8020" finish="plastic" seg={20} />
    </group>
  );
};

/* ===== Ván trượt ===== */

const SKATEBOARD: BoardSpec = {
  length: 0.81,
  width: 0.21,
  thick: 0.012,
  halfWidth: (y) => {
    const d = y < 0.105 ? (0.105 - y) / 0.105 : y > 0.705 ? (y - 0.705) / 0.105 : 0;
    return 0.105 * Math.max(0, 1 - d ** 2.3) ** (1 / 2.3);
  },
  nose: [
    [0.66, 0.16],
    [0.72, 0.14],
  ],
  tail: [
    [0.15, 0.16],
    [0.09, 0.14],
  ],
};

/** Hình in mặt dưới ván: nền tím chuyển hồng, mặt trời vàng, sọc chéo, sao; hàng trên cùng = gỗ ép ở thành ván */
const deckGraphic = () =>
  drawTexture("sports:deck-graphic", 128, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#3a0ca3");
    g.addColorStop(0.5, "#7209b7");
    g.addColorStop(1, "#f72585");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.5, w * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fafafa";
    for (const k of range(4)) {
      const y = h * (0.26 + k * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - w * 0.5);
      ctx.lineTo(w, y - w * 0.5 + 9);
      ctx.lineTo(0, y + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#4cc9f0";
    for (const [x, y, r] of [
      [0.3, 0.75, 0.12],
      [0.7, 0.84, 0.08],
      [0.5, 0.12, 0.1],
    ]) {
      ctx.beginPath();
      range(10).forEach((i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = w * r * (i % 2 === 0 ? 1 : 0.42);
        ctx.lineTo(w * x + Math.cos(a) * rr, h * y + Math.sin(a) * rr);
      });
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#dcb88a";
    ctx.fillRect(0, 0, w, h * 0.015);
    ctx.fillStyle = "#3f6fb0";
    ctx.fillRect(0, h * 0.005, w, h * 0.004);
  });

/** Giấy nhám dán mặt ván */
const gripSand = () =>
  drawTexture("sports:grip-sand", 128, 512, (ctx, w, h) => {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(11);
    for (const _ of range(2600)) {
      const v = 30 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(rand() * w, rand() * h, 1.2, 1.2);
    }
  });

/** Bánh xe ván trượt (trục theo y, bo tròn hai mép, lỗ ổ bi ở giữa) */
const WHEEL: V2[] = [
  [0.0085, -0.016],
  [0.022, -0.016],
  [0.0262, -0.0135],
  [0.0272, -0.008],
  [0.0272, 0.008],
  [0.0262, 0.0135],
  [0.022, 0.016],
  [0.0085, 0.016],
];

/** Cụm trục bánh dưới ván (dir = hướng tâm ván theo y): đế, cao su đệm cam, càng, trục, hai bánh có ổ bi */
const Truck = ({ y, dir }: { y: number; dir: 1 | -1 }) => (
  <group position={[0, y, -0.006]}>
    <Box size={[0.056, 0.08, 0.008]} radius={0.002} position={[0, 0, -0.004]} color="#a7adb5" finish="metal" />
    <Cylinder r={0.011} h={0.018} rotation={[Math.PI / 2, 0, 0]} position={[0, dir * 0.006, -0.017]} color="#fb8020" finish="rubber" seg={16} />
    <Box size={[0.13, 0.03, 0.026]} radius={0.009} position={[0, dir * 0.012, -0.034]} color="#b9bfc7" finish="metal" />
    <Cylinder r={0.004} h={0.2} rotation={[0, 0, Math.PI / 2]} position={[0, dir * 0.012, -0.044]} color="#d0d5db" finish="chrome" seg={10} />
    {SIDES.map((s) => (
      <group key={s} position={[s * 0.083, dir * 0.012, -0.044]} rotation={[0, 0, Math.PI / 2]}>
        <Lathe points={WHEEL} color="#f3e6cc" finish="plastic" seg={32} />
        <Cylinder r={0.0088} h={0.031} color="#8d949c" finish="metal" seg={16} />
      </group>
    ))}
  </group>
);

/** Ván trượt dựng nghiêng trên cạnh: mặt dưới in hình hướng ra trước, hai cụm trục bánh; mặt trên dán giấy nhám */
export const Skateboard = () => (
  <group rotation={[Math.PI - 0.16, 0, 0]}>
    <group rotation={[0, 0, -Math.PI / 2]}>
      <group position={[0, -SKATEBOARD.length / 2, 0]}>
        <BoardLayer spec={SKATEBOARD} depth={SKATEBOARD.thick} lift={-SKATEBOARD.thick / 2} map={deckGraphic()} color="#ffffff" finish="gloss" />
        <BoardLayer spec={SKATEBOARD} depth={0.0009} lift={0.00065} map={gripSand()} color="#ffffff" finish="rubber" />
        <Truck y={0.2} dir={1} />
        <Truck y={0.61} dir={-1} />
      </group>
    </group>
  </group>
);

/* ===== Ván lướt sóng ===== */

const SURF_LENGTH = 1.85;

/** Nửa bề rộng ván lướt sóng (m): đuôi vuông bo góc, rộng nhất trước giữa ván, mũi nhọn */
const surfHalfWidth = (y: number) => {
  if (y < 0.04) return 0.11 + Math.sqrt(Math.max(0, 0.04 ** 2 - (0.04 - y) ** 2));
  if (y < 0.85) return 0.15 + 0.1 * Math.sin(((y - 0.04) / 0.81) * (Math.PI / 2)) ** 0.9;
  return 0.25 * Math.max(0, Math.cos(((y - 0.85) / (SURF_LENGTH - 0.85)) * (Math.PI / 2))) ** 0.8;
};

/** Biên dạng (m) theo nửa bề rộng hw(y), y ∈ [y0, y1]; scale thu hẹp bề ngang */
const surfOutline = (y0: number, y1: number, scale = 1): V2[] => {
  const ys = range(49).map((i) => y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos((Math.PI * i) / 48)));
  const right = ys.map((y): V2 => [surfHalfWidth(y) * scale, y]);
  const left = ys.map((y): V2 => [-surfHalfWidth(y) * scale, y]).reverse();
  return [...right, ...left].filter((p, i, all) => {
    const q = all[(i + 1) % all.length];
    return Math.abs(p[0] - q[0]) > 1e-6 || Math.abs(p[1] - q[1]) > 1e-6;
  });
};

/** Hình in mặt ván lướt: xanh ngọc chuyển xanh biển, hai sọc trắng ngang, chấm cam */
const surfDeck = () =>
  drawTexture("sports:surf-deck", 128, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#22b5c4");
    g.addColorStop(1, "#0e4f7a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f7f3ea";
    ctx.fillRect(0, h * 0.2, w, h * 0.022);
    ctx.fillRect(0, h * 0.245, w, h * 0.012);
    ctx.fillStyle = "#fb8020";
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.62, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });

/** Biên dạng vây ván lướt: chân vây theo x (về phía mũi là +x), cao theo y, mép sau cong vát */
const FIN: V2[] = [
  [0, 0],
  [0.11, 0],
  [0.104, 0.028],
  [0.086, 0.062],
  [0.058, 0.092],
  [0.025, 0.111],
  [-0.004, 0.117],
  [-0.012, 0.11],
  [-0.004, 0.08],
  [0.008, 0.045],
  [0.01, 0.016],
];

/** Ván lướt sóng dựng đứng trên đuôi: thân trắng ngà bo tròn mép, mặt in màu có sống gỗ giữa, ba vây phía dưới */
export const Surfboard = () => {
  const core = 0.024;
  const bevel = 0.018;
  const top = core / 2 + bevel;
  const inlay0 = 0.12;
  const inlay1 = SURF_LENGTH - 0.06;
  const inlay = surfOutline(inlay0, inlay1, 0.8).map(([x, y]): V2 => [x / 0.4 + 0.5, (y - inlay0) / (inlay1 - inlay0)]);
  return (
    <group rotation={[-0.12, 0.35, 0]}>
      <Extrude shape={surfOutline(0, SURF_LENGTH)} depth={core} bevel={bevel} curveSeg={4} color="#f7f3ea" finish="gloss" />
      <Extrude shape={inlay} depth={0.0012} scale={[0.4, inlay1 - inlay0, 1]} position={[-0.2, inlay0, top + 0.0007]} map={surfDeck()} color="#ffffff" finish="gloss" />
      <Box size={[0.0035, SURF_LENGTH - 0.12, 0.0008]} position={[0, SURF_LENGTH / 2 - 0.02, top + 0.0017]} color="#8a5a2b" finish="wood" />
      <Box size={[0.0035, SURF_LENGTH - 0.12, 0.0008]} position={[0, SURF_LENGTH / 2 - 0.02, -top - 0.0003]} color="#8a5a2b" finish="wood" />
      {/* Ba vây dưới đuôi: vây giữa + hai vây bên chụm nhẹ */}
      {(
        [
          [0, 0.045, 0],
          [-0.165, 0.2, 0.06],
          [0.165, 0.2, -0.06],
        ] as const
      ).map(([x, y, toe]) => (
        <group key={x} position={[x, y, -top + 0.002]} rotation={[0, 0, toe]}>
          <Extrude shape={FIN} depth={0.006} bevel={0.0015} rotation={[-Math.PI / 2, -Math.PI / 2, 0]} color="#2b2f36" finish="gloss" />
        </group>
      ))}
    </group>
  );
};

/* ===== Vợt tennis ===== */

/** Bọc cán vợt: quấn chéo trắng, rãnh xám nhạt */
const racketGrip = () => gripTape("#f4f4f2", "#cfd2d6");

/** Vợt tennis dựng chéo: khung elip xanh, lưới dây đan, cổ vợt chữ V, cán bọc trắng; quả bóng tennis lông vàng xanh bên cạnh */
export const TennisRacket = () => {
  const center = 0.5;
  const a = 0.104;
  const b = 0.136;
  const strings: RepeatItem[] = [
    ...range(16).map((i): RepeatItem => {
      const x = (i - 7.5) * 0.0124;
      return { p: [x, center, 0.0011], s: [1, 2 * b * Math.sqrt(1 - (x / a) ** 2), 1] };
    }),
    ...range(19).map((j): RepeatItem => {
      const y = (j - 9) * 0.0134;
      return { p: [0, center + y, -0.0011], s: [1, 2 * a * Math.sqrt(1 - (y / b) ** 2), 1], r: [0, 0, Math.PI / 2] };
    }),
  ];
  const arm = (s: number): V3[] => [
    [s * 0.08, 0.389, 0],
    [s * 0.055, 0.31, 0],
    [s * 0.026, 0.248, 0],
    [s * 0.012, 0.215, 0],
  ];
  const BALL = 0.0335;
  return (
    <group>
      <group rotation={[0, 0.3, -0.55]}>
        {/* Khung đầu vợt: Torus co giãn thành elip, tiết diện dẹt như dầm vợt thật */}
        <Torus r={1} tube={0.075} scale={[0.118, 0.152, 0.14]} position={[0, center, 0]} color="#2563c9" finish="gloss" seg={64} radialSeg={12} />
        {/* Dải chống va ở đỉnh đầu vợt: cung xoay trước rồi mới co giãn theo elip khung */}
        <group position={[0, center, 0]} scale={[0.119, 0.153, 0.11]}>
          <Torus r={1} tube={0.085} arc={1.5} rotation={[0, 0, Math.PI / 2 - 0.75]} color="#1b1d22" finish="matte" seg={24} radialSeg={10} />
        </group>
        <Repeat shape="cylinder" at={strings} size={[0.0011, 1, 0]} seg={6} color="#f1efe4" finish="plastic" />
        {/* Cổ vợt chữ V + khâu nối cán */}
        {SIDES.map((s) => (
          <Tube key={s} path={arm(s)} r={0.0088} seg={20} radialSeg={10} color="#2563c9" finish="gloss" />
        ))}
        <Cylinder rTop={0.0135} rBottom={0.017} h={0.04} position={[0, 0.205, 0]} color="#fb8020" finish="gloss" seg={16} />
        {/* Cán bát giác bọc vải + núm đuôi */}
        <Cylinder r={0.0168} h={0.19} position={[0, 0.095, 0]} map={racketGrip()} color="#ffffff" finish="fabric" seg={8} />
        <Cylinder r={0.0185} h={0.012} position={[0, 0.006, 0]} color="#1b1d22" finish="plastic" seg={8} />
      </group>
      {/* Bóng tennis: lông vàng xanh, đường rãnh trắng */}
      <group position={[0.3, BALL, 0.1]} rotation={[0.3, 0.8, 0.5]}>
        <Sphere r={BALL} color="#d4e346" finish="fur" seg={40} />
        <Tube path={range(48).map((k) => seamPoint((k / 48) * Math.PI * 2, 0.28).map((v) => v * BALL * 1.002) as V3)} closed r={0.0013} seg={64} radialSeg={6} color="#f5f5ec" finish="fabric" />
      </group>
    </group>
  );
};
