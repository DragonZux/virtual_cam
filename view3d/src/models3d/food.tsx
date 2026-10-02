// Mô hình 3D nhóm Thực phẩm: chuối, táo, bánh mì kẹp, cam, súp lơ xanh, cà rốt, bánh mì xúc xích, pizza, bánh donut, bánh kem
import { Euler, Quaternion, Vector3 } from "three";

import { Box, Capsule, Cone, Cylinder, Extrude, Lathe, Repeat, Sphere, Surface, Torus, Tube, type RepeatItem } from "./parts";
import { range, seeded, type V2, type V3 } from "./shapes";
import { drawTexture, speckle } from "./textures";

/* ===== Hàm dựng dùng chung ===== */

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);

/** Góc xoay Euler đưa trục +y của khối về hướng dir (cốm rắc, nắp cuống…) */
const alignY = (dir: V3): V3 => {
  const e = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(UP, new Vector3(...dir).normalize()));
  return [e.x, e.y, e.z];
};

/** Biên dạng lá: gốc ở x = 0, ngọn nhọn ở x = len, rộng nhất gần gốc */
const leafOutline = (len: number, width: number, n = 10): V2[] => {
  const edge = range(n + 1).map((i): V2 => {
    const t = i / n;
    return [t * len, (width / 2) * Math.sin(Math.PI * t) ** 0.85 * (1 - 0.3 * t)];
  });
  return [...edge, ...edge.slice(1, -1).reverse().map(([x, y]): V2 => [x, -y])];
};

interface LeafProps {
  len: number;
  width: number;
  color: string;
  position: V3;
  /** Quay quanh trục đứng: 0 = ngọn chĩa +x, -π/2 = chĩa ra trước (+z) */
  yaw?: number;
  /** Ngóc ngọn lên (> 0) / rủ xuống (< 0) */
  pitch?: number;
  /** Vặn phiến lá quanh gân giữa (0 = phiến nằm ngang, mặt lá hướng lên) */
  roll?: number;
}

/** Lá phẳng có gân giữa, gốc lá ở position */
const Leaf = ({ len, width, color, position, yaw = 0, pitch = 0, roll = 0 }: LeafProps) => (
  <group position={position} rotation={[0, yaw, 0]}>
    <group rotation={[0, 0, pitch]}>
      <group rotation={[roll - Math.PI / 2, 0, 0]}>
        <Extrude shape={leafOutline(len, width)} depth={len * 0.02} color={color} finish="organic" />
        <Box size={[len * 0.9, len * 0.03, len * 0.03]} position={[len * 0.45, 0, 0]} color="#9cbf5e" finish="organic" />
      </group>
    </group>
  </group>
);

/* ===== Chuối ===== */

/** Vỏ chuối chín: cuống ngả xanh, thân vàng, chóp sẫm, lấm tấm đốm đường (u của Tube chạy dọc quả) */
const bananaPeel = () =>
  drawTexture("food:banana-peel", 256, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#b3b03a");
    g.addColorStop(0.12, "#efd23c");
    g.addColorStop(0.45, "#fcd935");
    g.addColorStop(0.85, "#f6cf2e");
    g.addColorStop(1, "#c9962a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(17);
    for (const _ of range(34)) {
      ctx.fillStyle = `rgba(110, 70, 25, ${0.25 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(w * (0.2 + rand() * 0.75), rand() * h, 1 + rand() * 2.2, 0.8 + rand() * 1.4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Trục một quả chuối: cung tròn võng ở giữa, bắt đầu từ chỗ nối cuống, chạy theo +x */
const BANANA_AXIS: V3[] = range(9).map((i): V3 => {
  const a = -0.62 + (i / 8) * 1.17;
  return [0.02 + 0.155 * (Math.sin(a) + Math.sin(0.62)), -0.014 + 0.155 * (Math.cos(0.62) - Math.cos(a)), 0];
});

/** Một quả chuối: gốc toạ độ ở đầu cuống (chỗ gắn vào nải), thân 6 cạnh thuôn hai đầu, núm đen ở chóp */
const BananaFinger = ({ position, rotation }: { position: V3; rotation: V3 }) => (
  <group position={position} rotation={rotation}>
    <Tube
      path={BANANA_AXIS}
      r={0.0175}
      taper={[0.4, 0.78, 0.95, 1, 1, 0.97, 0.86, 0.6, 0.28]}
      seg={48}
      radialSeg={6}
      map={bananaPeel()}
      color="#ffffff"
      finish="organic"
    />
    {/* Cuống cong nhẹ lên nải */}
    <Tube path={[[0.028, -0.02, 0], [0.014, -0.009, 0], [0.004, -0.001, 0], [-0.002, 0.006, 0]]} r={0.0052} taper={[1.1, 0.9, 0.85, 1]} radialSeg={8} seg={12} color="#9a9142" finish="organic" />
    <Sphere r={0.0055} position={BANANA_AXIS[8]} color="#3b2a1c" finish="matte" seg={12} />
  </group>
);

/** Nải 3 quả chuối chín: hai quả nằm dưới xoè nhẹ, một quả gác lên giữa, cuống chụm vào nải */
export const Banana = () => (
  <group>
    <BananaFinger position={[-0.09, 0.0603, 0]} rotation={[0.06, -0.16, 0]} />
    <BananaFinger position={[-0.09, 0.0603, 0]} rotation={[-0.06, 0.16, 0]} />
    <BananaFinger position={[-0.089, 0.0897, 0]} rotation={[0, 0.015, -0.03]} />
    {/* Nải: khúc cuống chung mập, mặt cắt xơ sáng màu */}
    <Tube path={[[-0.088, 0.056, 0], [-0.094, 0.08, 0], [-0.101, 0.097, 0]]} r={0.0118} taper={[0.9, 1, 1.04]} radialSeg={12} seg={12} caps={false} color="#7d6b3c" finish="organic" />
    <Cylinder r={0.0122} h={0.003} position={[-0.101, 0.097, 0]} rotation={alignY([-0.38, 0.92, 0])} color="#c2ad74" finish="matte" seg={16} />
  </group>
);

/* ===== Táo ===== */

/** Vỏ táo đỏ: hốc cuống vàng xanh, thân đỏ có vệt sọc dọc, đáy ửng vàng, chấm bì nhỏ (v của Lathe: dưới → trên) */
const appleSkin = () =>
  drawTexture("food:apple-skin", 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#a3993c");
    g.addColorStop(0.09, "#8c2a1d");
    g.addColorStop(0.3, "#b1202a");
    g.addColorStop(0.62, "#cd392e");
    g.addColorStop(0.86, "#d9663a");
    g.addColorStop(1, "#c49a46");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(23);
    for (const _ of range(60)) {
      const x = rand() * w;
      ctx.strokeStyle = rand() < 0.6 ? `rgba(115, 16, 22, ${0.12 + rand() * 0.18})` : `rgba(240, 150, 70, ${0.08 + rand() * 0.12})`;
      ctx.lineWidth = 1 + rand() * 4;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.08);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 10, h * 0.3, x + (rand() - 0.5) * 10, h * 0.6, x + (rand() - 0.5) * 8, h * (0.7 + rand() * 0.25));
      ctx.stroke();
    }
    for (const _ of range(160)) {
      ctx.fillStyle = `rgba(255, 225, 170, ${0.25 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(rand() * w, h * (0.1 + rand() * 0.82), 0.6 + rand() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Biên dạng quả táo: vai rộng hơn đáy, lõm sâu ở cuống, lõm nhẹ ở đáy */
const APPLE: V2[] = range(29).map((i): V2 => {
  const a = -Math.PI / 2 + (i / 28) * Math.PI;
  const r = 0.04 * Math.cos(a) * (1 + 0.09 * Math.sin(a));
  const top = 0.0125 * Math.exp(-(((Math.PI / 2 - a) / 0.36) ** 2));
  const bottom = 0.006 * Math.exp(-(((a + Math.PI / 2) / 0.3) ** 2));
  return [r, 0.0375 + 0.0375 * Math.sin(a) - top + bottom];
});

/** Quả táo đỏ bóng: cuống gỗ, một lá xanh */
export const Apple = () => (
  <group>
    <Lathe points={APPLE} map={appleSkin()} color="#ffffff" finish="organic" seg={56} />
    <Tube path={[[0, 0.058, 0], [0.0012, 0.071, 0], [0.0045, 0.083, 0.001]]} r={0.0018} taper={[1, 0.8]} radialSeg={8} seg={12} color="#5a3b1f" finish="wood" />
    <Leaf len={0.05} width={0.024} color="#4c8c2e" position={[0.002, 0.074, 0]} yaw={-0.75} pitch={0.18} roll={0.6} />
  </group>
);

/* ===== Bánh mì kẹp ===== */

const SANDWICH_HYP = 0.155;
const FLAT: V3 = [-Math.PI / 2, 0, 0];

/** Tam giác nửa lát bánh mì cắt chéo, nới thêm grow: cạnh huyền (mặt cắt) trên trục x, đỉnh vuông ở y = hyp / 2 */
const halfSlice = (grow = 0): V2[] => [
  [-SANDWICH_HYP / 2 - grow * 2.414, -grow],
  [SANDWICH_HYP / 2 + grow * 2.414, -grow],
  [0, SANDWICH_HYP / 2 + grow * 1.414],
];

/** Như halfSlice nhưng mép gợn sóng lồi ra tới amp (lá xà lách, giăm bông) */
const wavySlice = (grow: number, amp: number, wave: number, seed: number): V2[] => {
  const corners = halfSlice(grow);
  const rand = seeded(seed);
  return corners.flatMap((a, i) => {
    const b = corners[(i + 1) % 3];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const waves = Math.max(3, Math.round(len / wave));
    const n = waves * 6;
    // Pháp tuyến hướng ra ngoài (đa giác ngược chiều kim đồng hồ)
    const nx = (b[1] - a[1]) / len;
    const ny = -(b[0] - a[0]) / len;
    return range(n).map((k): V2 => {
      const t = k / n;
      const d = amp * (0.5 + 0.5 * Math.sin(t * waves * Math.PI * 2)) * (0.65 + 0.35 * rand());
      return [a[0] + (b[0] - a[0]) * t + nx * d, a[1] + (b[1] - a[1]) * t + ny * d];
    });
  });
};

/** Lát bánh mì tam giác: ruột trắng ngà, vỏ nâu chạy dọc hai cạnh góc vuông (mặt cắt để lộ ruột) */
const BreadSlice = ({ y }: { y: number }) => {
  const half = SANDWICH_HYP / 4;
  const off = 0.0042 / Math.SQRT2;
  return (
    <group>
      <Extrude shape={halfSlice()} depth={0.009} bevel={0.0025} rotation={FLAT} position={[0, y, 0]} color="#f2dbab" finish="organic" />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          size={[SANDWICH_HYP / Math.SQRT2 - 0.006, 0.0148, 0.0062]}
          radius={0.0026}
          position={[s * (half + off), y, -(half + off)]}
          rotation={[0, (-s * Math.PI) / 4, 0]}
          color="#b8743a"
          finish="organic"
        />
      ))}
    </group>
  );
};

/** Nửa bánh mì kẹp cắt chéo: bánh – xà lách – cà chua – phô mai – giăm bông – bánh; mặt cắt hướng +z */
const SandwichHalf = ({ position, rotation }: { position: V3; rotation: V3 }) => (
  <group position={position} rotation={rotation}>
    <BreadSlice y={0.007} />
    <Extrude shape={wavySlice(0.002, 0.0075, 0.016, 3)} depth={0.0016} bevel={0.0007} rotation={FLAT} position={[0, 0.0155, 0]} color="#7cb342" finish="organic" />
    <Repeat
      shape="cylinder"
      at={[[-0.044, 0.02, -0.02], [0, 0.02, -0.019], [0.044, 0.02, -0.02]]}
      size={[0.024, 0.006, 0]}
      seg={28}
      color="#e2382f"
      finish="organic"
    />
    <Extrude shape={halfSlice(0.0045)} depth={0.002} rotation={FLAT} position={[0, 0.024, 0]} color="#f6c445" finish="organic" />
    <Extrude shape={wavySlice(0.001, 0.0045, 0.022, 8)} depth={0.0028} bevel={0.0008} rotation={FLAT} position={[0, 0.0272, 0]} color="#f0a2a0" finish="organic" />
    <BreadSlice y={0.0364} />
  </group>
);

/** Bánh mì kẹp cắt chéo trên đĩa sứ: hai nửa chồng lệch, mặt cắt lộ các lớp nhân */
export const Sandwich = () => (
  <group>
    <Lathe
      points={[[0, 0.003], [0.085, 0.002], [0.09, 0], [0.098, 0], [0.1, 0.004], [0.122, 0.012], [0.13, 0.0145], [0.129, 0.0165], [0.12, 0.0148], [0.1, 0.0085], [0.09, 0.0075], [0, 0.0075]]}
      color="#f5f3ef"
      finish="ceramic"
      seg={64}
    />
    <SandwichHalf position={[0.006, 0.0075, 0.03]} rotation={[0, 0.3, 0]} />
    <SandwichHalf position={[-0.008, 0.051, 0.008]} rotation={[0, 0.75, 0]} />
  </group>
);

/* ===== Cam ===== */

/** Vỏ cam sần: chấm túi tinh dầu sáng / tối trên nền cam */
const orangePeel = () => speckle("#f28c1c", ["#e47d12", "#f8a33c", "#ee8616", "#d87410"], 1500, 31, 0.007);

/** Mặt cắt quả cam: viền vỏ, cùi trắng, 11 múi mọng có tép (vẽ tròn giữa ảnh — nắp Cylinder phủ trọn ảnh) */
const orangeFlesh = () =>
  drawTexture("food:orange-flesh", 512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = "#ea7d12";
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = "#fcefd6";
    ctx.beginPath();
    ctx.arc(c, c, c * 0.94, 0, Math.PI * 2);
    ctx.fill();
    const rand = seeded(13);
    const n = 11;
    for (const i of range(n)) {
      const a0 = (i / n) * Math.PI * 2 + 0.024;
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.024;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.885, a0, a1);
      ctx.arc(c, c, c * 0.08, a1, a0, true);
      ctx.closePath();
      const g = ctx.createRadialGradient(c, c, c * 0.08, c, c, c * 0.885);
      g.addColorStop(0, "#ffbd45");
      g.addColorStop(0.55, "#fca52c");
      g.addColorStop(1, "#f6860f");
      ctx.fillStyle = g;
      ctx.fill();
      // Tép cam: vệt sáng hướng tâm
      ctx.strokeStyle = "rgba(255, 226, 160, 0.5)";
      ctx.lineCap = "round";
      for (const _ of range(9)) {
        const a = a0 + 0.05 + rand() * (a1 - a0 - 0.1);
        const r0 = c * (0.2 + rand() * 0.45);
        const r1 = r0 + c * (0.08 + rand() * 0.12);
        ctx.lineWidth = 2 + rand() * 3;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
  });

/** Quả cam nguyên có lá + nửa quả bổ đôi nghiêng mặt cắt về phía trước */
export const Orange = () => (
  <group>
    <Sphere r={0.04} scale={[1, 0.93, 1]} position={[-0.032, 0.0372, -0.026]} map={orangePeel()} color="#ffffff" finish="organic" seg={48} />
    {/* Tai cam + cuống ngắn */}
    <Cone r={0.0062} h={0.0028} seg={5} position={[-0.032, 0.0748, -0.026]} color="#6f8a2e" finish="organic" />
    <Cylinder r={0.0016} h={0.006} seg={8} position={[-0.032, 0.0775, -0.026]} rotation={[0.2, 0, 0.15]} color="#6b6a2c" finish="organic" />
    <Leaf len={0.056} width={0.026} color="#2f6b2a" position={[-0.031, 0.077, -0.026]} yaw={-2.25} pitch={0.22} roll={0.35} />
    {/* Nửa quả bổ đôi: vỏ bán cầu + mặt cắt */}
    <group position={[0.03, 0.04, 0.032]} rotation={[0, 0.55, 0]}>
      <group rotation={[1.12, 0, 0]}>
        <Sphere r={0.04} thetaLength={Math.PI / 2} rotation={[Math.PI, 0, 0]} map={orangePeel()} color="#ffffff" finish="organic" doubleSide seg={48} />
        <Cylinder r={0.0392} h={0.0024} position={[0, -0.0014, 0]} map={orangeFlesh()} color="#ffffff" finish="organic" seg={48} />
      </group>
    </group>
  </group>
);

/* ===== Súp lơ xanh ===== */

/** Nụ súp lơ: nền xanh lấm tấm nụ sáng / tối */
const broccoliBuds = (base: string, seed: number) => speckle(base, ["#2a5a1c", "#5d9a3a", "#3f7a2a", "#6aa847"], 700, seed, 0.016);

/** Cây súp lơ xanh: thân xanh nhạt to, phân nhánh lên các chùm nụ xanh đậm xếp thành vòm */
export const Broccoli = () => {
  const rand = seeded(9);
  const clusters: { c: V3; r: number }[] = [
    { c: [0, 0.15, 0], r: 0.031 },
    ...range(6).map((i) => {
      const a = (i / 6) * Math.PI * 2 + 0.25;
      return { c: [Math.cos(a) * 0.05, 0.128, Math.sin(a) * 0.05] as V3, r: 0.028 };
    }),
    ...range(8).map((i) => {
      const a = (i / 8) * Math.PI * 2 + 0.6;
      return { c: [Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08] as V3, r: 0.0225 };
    }),
  ];
  const cores: RepeatItem[] = [];
  const buds: RepeatItem[][] = [[], []];
  const q = new Quaternion();
  const d = new Vector3();
  clusters.forEach(({ c, r }, k) => {
    cores.push({ p: c, s: [r * 0.86, r * 0.82, r * 0.86] });
    // Nụ phân bố quanh hướng ra ngoài của chùm (tính từ tâm vòm)
    q.setFromUnitVectors(UP, new Vector3(c[0], c[1] - 0.06, c[2]).normalize());
    range(12).forEach((i) => {
      const polar = Math.acos(1 - ((i + rand() * 0.7) / 12) * 1.5);
      const az = i * 2.4 + rand() * 0.6 + k;
      d.set(Math.sin(polar) * Math.cos(az), Math.cos(polar), Math.sin(polar) * Math.sin(az)).applyQuaternion(q);
      const br = r * (0.38 + rand() * 0.14);
      buds[(i + k) % 2].push({ p: [c[0] + d.x * r * 0.74, c[1] + d.y * r * 0.74, c[2] + d.z * r * 0.74], s: [br, br, br] });
    });
  });
  return (
    <group>
      <Lathe points={[[0, 0], [0.0175, 0], [0.0172, 0.02], [0.0178, 0.04], [0.021, 0.052], [0.027, 0.06], [0.03, 0.064], [0, 0.066]]} color="#93c060" finish="organic" />
      {clusters.map(({ c, r }, k) => (
        <Tube
          key={k}
          path={[[c[0] * 0.15, 0.056, c[2] * 0.15], [c[0] * 0.55, (0.056 + c[1]) / 2 - 0.006, c[2] * 0.55], [c[0] * 0.92, c[1] - r * 0.5, c[2] * 0.92]]}
          r={k === 0 ? 0.009 : 0.0072}
          taper={[1, 0.82, 0.68]}
          radialSeg={8}
          seg={12}
          caps={false}
          color="#8dbb57"
          finish="organic"
        />
      ))}
      <Repeat shape="sphere" at={cores} size={[1, 1, 1]} seg={14} color="#2e5f1f" finish="organic" />
      <Repeat shape="sphere" at={buds[0]} size={[1, 1, 1]} seg={12} map={broccoliBuds("#3d7a2a", 4)} color="#ffffff" finish="organic" />
      <Repeat shape="sphere" at={buds[1]} size={[1, 1, 1]} seg={12} map={broccoliBuds("#4b8a30", 6)} color="#ffffff" finish="organic" />
    </group>
  );
};

/* ===== Cà rốt ===== */

/** Hệ số bán kính dọc củ (65 mẫu): vai tròn, thuôn dần tới chóp, vài ngấn ngang */
const CARROT_TAPER = range(65).map((i) => {
  const t = i / 64;
  const body = t < 0.06 ? 0.84 + (t / 0.06) * 0.16 : 1 - 0.93 * ((t - 0.06) / 0.94) ** 1.3;
  const groove = [0.16, 0.27, 0.39, 0.5, 0.61, 0.72, 0.82].some((k) => Math.abs(t - k) < 0.008) ? 0.95 : 1;
  return body * groove;
});

/** Trục củ: hạ dần về chóp để mặt dưới củ nằm sát đất, hơi cong ngang */
const CARROT_AXIS: V3[] = [0, 0.25, 0.5, 0.75, 1].map((t): V3 => [
  0.19 * t,
  0.0165 * (CARROT_TAPER[Math.round(t * 64)] - CARROT_TAPER[0]),
  0.006 * Math.sin(Math.PI * t),
]);

/** Vỏ cà rốt: cam, đầu cuống sẫm hơn, vân ngang và rễ con mờ (u của Tube chạy dọc củ) */
const carrotSkin = () =>
  drawTexture("food:carrot-skin", 256, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#c95f17");
    g.addColorStop(0.05, "#ec7a1e");
    g.addColorStop(1, "#f28c2c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(29);
    for (const _ of range(40)) {
      ctx.strokeStyle = `rgba(150, 60, 12, ${0.15 + rand() * 0.25})`;
      ctx.lineWidth = 0.8 + rand() * 1.4;
      const x = w * (0.08 + rand() * 0.88);
      const y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y + h * (0.2 + rand() * 0.5));
      ctx.stroke();
    }
  });

/** Một củ cà rốt nằm ngang (gốc toạ độ ở đỉnh củ, chóp theo +x) kèm chùm lá cuống mảnh */
const CarrotRoot = ({ position, rotation, seed }: { position: V3; rotation: V3; seed: number }) => {
  const rand = seeded(seed);
  const stems = range(6).map((k): V3[] => {
    const side = (k - 2.5) * 0.011 + (rand() - 0.5) * 0.006;
    const lean = 0.025 + rand() * 0.03;
    const tall = 0.1 + rand() * 0.05;
    return [
      [-0.004, 0.004, side * 0.2],
      [-0.012 - lean * 0.3, tall * 0.45, side * 0.9],
      [-0.03 - lean, tall * 0.85, side * 2],
      [-0.055 - lean * 1.6, tall, side * 3.2],
    ];
  });
  // Lá lông chim: từng cặp lá nhỏ dẹt mọc hai bên nửa ngoài mỗi cuống, chĩa xiên lên, ngắn dần về ngọn
  const q = new Quaternion();
  const e = new Euler();
  const leaflets: RepeatItem[][] = [[], []];
  stems.forEach((path) =>
    range(11).forEach((i) => {
      const t = 0.3 + (i / 10) * 0.7;
      const f = t * (path.length - 1);
      const j = Math.min(path.length - 2, Math.floor(f));
      const a = new Vector3(...path[j]);
      const b = new Vector3(...path[j + 1]);
      const p = a.clone().lerp(b, f - j);
      const along = b.sub(a).normalize();
      const across = new Vector3().crossVectors(along, UP).normalize();
      const size = 0.012 * (1.15 - 0.6 * t) * (0.85 + rand() * 0.3);
      for (const s of [-1, 1]) {
        const dir = across.clone().multiplyScalar(s).addScaledVector(along, 0.6).addScaledVector(UP, 0.2).normalize();
        const c = p.clone().addScaledVector(dir, size * 0.55);
        e.setFromQuaternion(q.setFromUnitVectors(X_AXIS, dir));
        leaflets[(i + (s > 0 ? 1 : 0)) % 2].push({ p: [c.x, c.y, c.z], s: [size, size * 0.18, size * 0.42], r: [e.x, e.y, e.z] });
      }
    }),
  );
  return (
    <group position={position} rotation={rotation}>
      <Tube path={CARROT_AXIS} r={0.0165} taper={CARROT_TAPER} seg={64} radialSeg={20} map={carrotSkin()} color="#ffffff" finish="organic" />
      <Cylinder r={0.006} h={0.004} position={[-0.0128, 0.001, 0]} rotation={[0, 0, Math.PI / 2]} color="#7fa83a" finish="organic" seg={12} />
      {stems.map((path, k) => (
        <Tube key={k} path={path} r={0.0016} taper={[1, 0.7]} radialSeg={6} seg={16} color="#5e9a2e" finish="organic" />
      ))}
      <Repeat shape="sphere" at={leaflets[0]} size={[1, 1, 1]} seg={8} color="#4f8f2a" finish="organic" />
      <Repeat shape="sphere" at={leaflets[1]} size={[1, 1, 1]} seg={8} color="#5c9c33" finish="organic" />
    </group>
  );
};

/** Hai củ cà rốt tươi còn chùm lá, nằm xoè trên mặt bàn */
export const Carrot = () => (
  <group>
    <CarrotRoot position={[-0.075, 0.0139, 0.022]} rotation={[0, -0.14, 0]} seed={3} />
    <CarrotRoot position={[-0.066, 0.0139, -0.026]} rotation={[0, 0.2, 0]} seed={8} />
  </group>
);

/* ===== Bánh mì xúc xích ===== */

/**
 * Vỏ bánh mì dài: vàng nâu, lưng nướng sẫm hơn; mặt bổ (u ≈ 0.75 của Capsule) là ruột trắng ngà,
 * hai đầu ổ (v gần 0 / 1) vẫn là vỏ
 */
const bunCrust = () =>
  drawTexture("food:hotdog-bun", 256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#e2b878");
    g.addColorStop(0.22, "#d29550");
    g.addColorStop(0.42, "#b06a31");
    g.addColorStop(0.52, "#bf7d3e");
    g.addColorStop(0.575, "#e8c792");
    g.addColorStop(0.62, "#f6e6c4");
    g.addColorStop(0.87, "#f6e6c4");
    g.addColorStop(0.94, "#e2b878");
    g.addColorStop(1, "#e2b878");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const ends = ctx.createLinearGradient(0, 0, 0, h);
    ends.addColorStop(0, "rgba(207, 145, 79, 1)");
    ends.addColorStop(0.12, "rgba(207, 145, 79, 0)");
    ends.addColorStop(0.88, "rgba(207, 145, 79, 0)");
    ends.addColorStop(1, "rgba(207, 145, 79, 1)");
    ctx.fillStyle = ends;
    ctx.fillRect(w * 0.55, 0, w * 0.41, h);
  });

/** Đường sốt chạy ngoằn ngoèo trên lưng xúc xích */
const sauceLine = (phase: number, lift: number): V3[] =>
  range(41).map((i): V3 => {
    const x = -0.075 + (i / 40) * 0.15;
    const z = 0.0072 * Math.sin((i / 40) * Math.PI * 11 + phase);
    const axis = 0.034 + 0.003 * (x / 0.092) ** 2;
    return [x, axis + Math.sqrt(0.0128 ** 2 - z ** 2) + lift, z];
  });

/** Giấy lót kẻ ô đỏ – trắng, cols × rows ô vuông trên một mặt hộp */
const checker = (cols: number, rows: number) =>
  drawTexture(`food:checker:${cols}:${rows}`, 32 * cols, 32 * rows, (ctx, w, h) => {
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d62828";
    for (const r of range(rows)) {
      for (const c of range(cols)) {
        if ((r + c) % 2 === 0) ctx.fillRect(c * 32, r * 32, 32, 32);
      }
    }
  });

/** Bánh mì kẹp xúc xích trong khay giấy kẻ ô: ổ bánh bổ đôi hé miệng, xúc xích nhô hai đầu, sốt mù tạt và tương cà ngoằn ngoèo */
export const HotDog = () => (
  <group>
    {/* Khay giấy: đáy + bốn vách xiên ra ngoài */}
    <Box size={[0.19, 0.002, 0.07]} position={[0, 0.001, 0]} map={checker(16, 6)} color="#ffffff" finish="matte" />
    {[1, -1].map((s) => (
      <group key={s}>
        <Box size={[0.19, 0.022, 0.002]} position={[0, 0.0122, s * 0.0388]} rotation={[s * 0.35, 0, 0]} map={checker(16, 2)} color="#ffffff" finish="matte" />
        <Box size={[0.002, 0.022, 0.07]} position={[s * 0.0988, 0.0122, 0]} rotation={[0, 0, -s * 0.35]} map={checker(6, 2)} color="#ffffff" finish="matte" />
      </group>
    ))}
    <group position={[0, 0.002, 0]}>
      {/* Hai má bánh ngả ra ngoài, lộ ruột (má sau là ảnh soi gương của má trước); khúc đáy nối liền hai má */}
      {[1, -1].map((s) => (
        <Capsule
          key={s}
          r={0.021}
          length={0.108}
          scale={[0.9, 1, 0.85 * s]}
          rotation={[0.5 * s, 0, Math.PI / 2]}
          position={[0, 0.019, s * 0.0185]}
          map={bunCrust()}
          color="#ffffff"
          finish="matte"
          seg={32}
        />
      ))}
      <Capsule r={0.017} length={0.1} scale={[0.6, 1, 1.25]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.0105, 0]} color="#ddb072" finish="matte" seg={32} />
      <Tube path={[[-0.092, 0.037, 0], [-0.045, 0.0345, 0], [0, 0.034, 0], [0.045, 0.0345, 0], [0.092, 0.037, 0]]} r={0.0128} radialSeg={20} color="#b04e2a" finish="organic" />
      <Tube path={sauceLine(0, 0.0012)} r={0.0026} seg={64} radialSeg={8} color="#f2c230" finish="gloss" />
      <Tube path={sauceLine(Math.PI, 0.0022)} r={0.0024} seg={64} radialSeg={8} color="#c8281e" finish="gloss" />
    </group>
  </group>
);

/* ===== Pizza ===== */

/** Mặt pizza: sốt cà chua, phô mai chảy loang có vệt cháy xém, lá oregano (vẽ tròn giữa ảnh cho nắp Cylinder) */
const pizzaTop = () =>
  drawTexture("food:pizza-top", 512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = "#c63a1f";
    ctx.fillRect(0, 0, w, w);
    const rand = seeded(41);
    const cheese = ["#f6d27a", "#f8dc8f", "#f1c862", "#f9e3a3"];
    for (const _ of range(70)) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * c * 0.82;
      ctx.fillStyle = cheese[Math.floor(rand() * cheese.length)];
      ctx.beginPath();
      ctx.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r, 18 + rand() * 30, 14 + rand() * 24, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const _ of range(40)) {
      ctx.fillStyle = `rgba(196, 112, 40, ${0.35 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.arc(c + (rand() - 0.5) * c * 1.5, c + (rand() - 0.5) * c * 1.5, 3 + rand() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const _ of range(160)) {
      ctx.fillStyle = rand() < 0.7 ? "#3f5f22" : "#6b8a35";
      ctx.fillRect(c + (rand() - 0.5) * c * 1.7, c + (rand() - 0.5) * c * 1.7, 2 + rand() * 2, 1 + rand() * 2);
    }
  });

/** Viền bánh nướng: vàng nâu, đốm bọt cháy (ảnh dài theo vòng Torus) */
const pizzaCrust = () =>
  drawTexture("food:pizza-crust", 1024, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#e2ac62");
    g.addColorStop(0.5, "#c98a45");
    g.addColorStop(1, "#e2ac62");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(43);
    for (const _ of range(150)) {
      ctx.fillStyle = `rgba(${90 + rand() * 40}, ${50 + rand() * 20}, 20, ${0.35 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 2 + rand() * 6, 1.5 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Vân gỗ thớt */
const woodGrain = (base: string, line: string, seed: number) =>
  drawTexture(`food:wood:${base}:${line}:${seed}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(seed);
    for (const _ of range(26)) {
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.15 + rand() * 0.3;
      ctx.lineWidth = 1 + rand() * 2.5;
      const y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + rand()) * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

/** Điểm theo bán kính + góc θ quanh trục đứng (θ = 0 hướng +z, π/2 hướng +x như Cylinder) */
const polar = (r: number, theta: number, y: number): V3 => [Math.sin(theta) * r, y, Math.cos(theta) * r];

/** Phần pizza hình quạt (θ từ start, mở góc arc): bột, mặt sốt phô mai, viền nướng bo tròn hai đầu, mặt cắt lộ bột — đáy ở y = 0 */
const PizzaSector = ({ start, arc }: { start: number; arc: number }) => (
  <group>
    <Cylinder r={0.14} h={0.006} position={[0, 0.003, 0]} arcStart={start} arc={arc} color="#ecc98d" finish="organic" seg={64} />
    <Cylinder r={0.128} h={0.003} position={[0, 0.0075, 0]} arcStart={start} arc={arc} map={pizzaTop()} color="#ffffff" finish="organic" seg={64} />
    <group rotation={[0, start - Math.PI / 2, 0]}>
      <Torus
        r={0.137}
        tube={0.0135}
        arc={arc}
        scale={[1, 1, 0.75]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.0102, 0]}
        map={pizzaCrust()}
        color="#ffffff"
        finish="organic"
        seg={Math.max(8, Math.round(arc * 9))}
        radialSeg={14}
      />
    </group>
    {[start, start + arc].map((a) => (
      <group key={a}>
        <Sphere r={0.0135} scale={[1, 0.75, 1]} position={polar(0.137, a, 0.0102)} map={pizzaCrust()} color="#ffffff" finish="organic" seg={14} />
        <Box size={[0.126, 0.0085, 0.0012]} position={polar(0.064, a, 0.0047)} rotation={[0, a - Math.PI / 2, 0]} color="#e9b866" finish="organic" />
      </group>
    ))}
  </group>
);

/** Pizza pepperoni trên thớt gỗ: một miếng đang được nhấc lên kéo theo sợi phô mai, ô liu, lá húng */
export const Pizza = () => {
  const wedge = Math.PI / 4;
  const mid = 0.65 + Math.PI;
  const a0 = mid - wedge / 2;
  const a1 = mid + wedge / 2;
  const lift = 0.3;
  const shift: V3 = [Math.sin(mid) * 0.045, 0, Math.cos(mid) * 0.045];
  const top = 0.009;
  /** Điểm trong khung miếng bánh (tia giữa miếng = +z, đầu nhọn ở gốc) → khung pizza */
  const slicePoint = (p: V3): V3 => {
    const v = new Vector3(...p).applyEuler(new Euler(-lift, 0, 0)).applyEuler(new Euler(0, mid, 0));
    return [v.x + shift[0], v.y, v.z + shift[2]];
  };
  const pepperoni = [
    [0.04, 2.1],
    [0.045, 4.3],
    [0.08, 1.55],
    [0.085, 2.55],
    [0.088, 3.45],
    [0.082, 4.35],
    [0.086, 5.25],
    [0.095, 6.05],
    [0.05, 5.6],
    [0.03, 3.3],
  ].map(([r, a]) => polar(r, a, top + 0.0015));
  const olives: V3[] = [polar(0.062, 1.95, top + 0.0011), polar(0.1, 3.05, top + 0.0011), polar(0.064, 4.85, top + 0.0011), polar(0.1, 5.65, top + 0.0011)];
  const basil: [V3, number][] = [
    [polar(0.065, 3.0, top + 0.0002), 0.4],
    [polar(0.02, 5.4, top + 0.0002), 2.2],
    [polar(0.07, 5.95, top + 0.0002), 4.1],
    [polar(0.052, 1.35, top + 0.0002), 1.0],
  ];
  // Sợi phô mai: từ mép cắt của phần còn lại tới mép tương ứng của miếng đang nhấc, võng ở giữa
  const strings = [
    [0.045, a0],
    [0.09, a0],
    [0.06, a1],
    [0.105, a1],
  ].map(([r, a]): V3[] => {
    const p1 = polar(r, a, top);
    const p2 = slicePoint(polar(r, a - mid, top));
    const sag = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) * 0.22;
    return [p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 - sag, (p1[2] + p2[2]) / 2], p2];
  });
  const wood = woodGrain("#c9935c", "#8a5a30", 7);
  return (
    <group>
      {/* Thớt gỗ tròn có cán */}
      <Cylinder r={0.178} h={0.016} position={[0, 0.008, 0]} map={wood} color="#ffffff" finish="wood" seg={64} />
      <Box size={[0.05, 0.016, 0.11]} radius={0.007} position={polar(0.21, 0.65 + Math.PI / 2, 0.008)} rotation={[0, 0.65 + Math.PI / 2, 0]} map={wood} color="#ffffff" finish="wood" />
      <group position={[0, 0.016, 0]}>
        <PizzaSector start={a1} arc={Math.PI * 2 - wedge} />
        <Repeat shape="cylinder" at={pepperoni} size={[0.0165, 0.003, 0]} seg={24} color="#b3352a" finish="organic" />
        {olives.map((p, i) => (
          <Torus key={i} r={0.0048} tube={0.0021} rotation={[Math.PI / 2, 0, 0]} position={p} color="#2b2b2b" finish="gloss" seg={16} radialSeg={8} />
        ))}
        {basil.map(([p, yaw], i) => (
          <Leaf key={i} len={0.03} width={0.016} color="#3f8f3a" position={p} yaw={yaw} />
        ))}
        {/* Miếng bánh đang nhấc: đầu nhọn tì trên thớt, phía viền nâng lên */}
        <group position={shift} rotation={[0, mid, 0]}>
          <group rotation={[-lift, 0, 0]}>
            <PizzaSector start={-wedge / 2} arc={wedge} />
            <Repeat shape="cylinder" at={[polar(0.06, 0.02, top + 0.0015), polar(0.1, -0.16, top + 0.0015)]} size={[0.0165, 0.003, 0]} seg={24} color="#b3352a" finish="organic" />
            <Torus r={0.0048} tube={0.0021} rotation={[Math.PI / 2, 0, 0]} position={polar(0.1, 0.19, top + 0.0011)} color="#2b2b2b" finish="gloss" seg={16} radialSeg={8} />
          </group>
        </group>
        {strings.map((path, i) => (
          <Tube key={i} path={path} r={0.0015} taper={[1, 0.55, 1]} radialSeg={6} seg={14} color="#f6d77a" finish="organic" />
        ))}
      </group>
    </group>
  );
};

/* ===== Bánh donut ===== */

/** Bột donut chiên: vàng nâu, vòng sáng quanh mép ngoài (v = 0 / 1 của Torus) */
const donutDough = () =>
  drawTexture("food:donut-dough", 64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f0d39a");
    g.addColorStop(0.08, "#d89a52");
    g.addColorStop(0.25, "#b8732f");
    g.addColorStop(0.5, "#c98444");
    g.addColorStop(0.75, "#c07a3a");
    g.addColorStop(0.92, "#d89a52");
    g.addColorStop(1, "#f0d39a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

const SPRINKLES = ["#fafafa", "#ffd43b", "#4dabf7", "#69db7c", "#fb8020", "#b197fc"];

/** Cốm rắc nằm trên mặt men: vị trí trên Torus men + hướng tiếp tuyến ngẫu nhiên */
const donutSprinkles = (ring: number, tube: number, y: number): RepeatItem[][] => {
  const rand = seeded(5);
  const groups: RepeatItem[][] = SPRINKLES.map(() => []);
  const n = new Vector3();
  const tangent = new Vector3();
  range(78).forEach((i) => {
    const theta = rand() * Math.PI * 2;
    const phi = 0.45 + rand() * 2.35;
    n.set(Math.cos(phi) * Math.cos(theta), Math.sin(phi), Math.cos(phi) * Math.sin(theta));
    // Hướng ngẫu nhiên nhưng nghiêng về nằm ngang để cốm trông như nằm trên mặt men
    tangent.set(rand() - 0.5, (rand() - 0.5) * 0.3, rand() - 0.5).cross(n).cross(n).normalize();
    const lift = tube + 0.0007;
    groups[i % SPRINKLES.length].push({
      p: [(ring + lift * Math.cos(phi)) * Math.cos(theta), y + lift * Math.sin(phi), (ring + lift * Math.cos(phi)) * Math.sin(theta)],
      r: alignY([tangent.x, tangent.y, tangent.z]),
    });
  });
  return groups;
};

/** Bánh donut phủ men hồng bóng, giọt men chảy ở mép, cốm rắc nhiều màu */
export const Donut = () => {
  const ring = 0.034;
  const rand = seeded(15);
  // Giọt men loang xuống mép ngoài: khối dẹt áp sát thành bánh, nửa trên chìm vào lớp men
  const drops: RepeatItem[] = range(13).map((i) => {
    const a = (i / 13) * Math.PI * 2 + rand() * 0.3;
    const s = 0.0045 + rand() * 0.003;
    return { p: [Math.cos(a) * 0.0508, 0.0192, Math.sin(a) * 0.0508], s: [s * 1.6, s * (0.85 + rand() * 0.45), s * 0.5], r: [0, Math.PI / 2 - a, 0] };
  });
  return (
    <group>
      <Torus r={ring} tube={0.0185} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0185, 0]} map={donutDough()} color="#ffffff" finish="organic" seg={64} radialSeg={28} />
      <Torus r={ring} tube={0.0189} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0225, 0]} color="#f48fb1" finish="gloss" seg={64} radialSeg={28} />
      <Repeat shape="sphere" at={drops} size={[1, 1, 1]} seg={14} color="#f48fb1" finish="gloss" />
      {donutSprinkles(ring, 0.0189, 0.0225).map((at, i) => (
        <Repeat key={i} shape="cylinder" at={at} size={[0.0011, 0.0062, 0]} seg={8} color={SPRINKLES[i]} finish="plastic" />
      ))}
    </group>
  );
};

/* ===== Bánh kem ===== */

/** Mặt cắt bánh kem: sô-cô-la phủ, kem, các lớp gato – kem – mứt dâu; lớp kem thành bánh ở mép ngoài (phải: side = 1, trái: side = -1) */
const cakeLayers = (side: 1 | -1) =>
  drawTexture(`food:cake-layers:${side}`, 256, 256, (ctx, w, h) => {
    const bands: [number, string][] = [
      [0, "#4a2516"],
      [0.055, "#fbf1e1"],
      [0.11, "#f2cf86"],
      [0.34, "#fdf5e6"],
      [0.41, "#c92a40"],
      [0.45, "#f2cf86"],
      [0.67, "#fdf5e6"],
      [0.74, "#c92a40"],
      [0.78, "#f2cf86"],
    ];
    bands.forEach(([y0, color], i) => {
      const y1 = i + 1 < bands.length ? bands[i + 1][0] : 1;
      ctx.fillStyle = color;
      ctx.fillRect(0, y0 * h, w, (y1 - y0) * h + 1);
    });
    // Lỗ khí li ti trong gato
    const rand = seeded(side === 1 ? 51 : 52);
    ctx.fillStyle = "rgba(190, 140, 60, 0.35)";
    for (const _ of range(220)) {
      const y = rand();
      const inSponge = (y > 0.12 && y < 0.33) || (y > 0.46 && y < 0.66) || y > 0.79;
      if (inSponge) {
        ctx.beginPath();
        ctx.arc(rand() * w, y * h, 0.8 + rand() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#fbf1e1";
    ctx.fillRect(side === 1 ? w * 0.955 : 0, h * 0.055, w * 0.045, h * 0.945);
  });

/** Kẹo sọc xoắn của nến */
const candleStripes = () =>
  drawTexture("food:candle", 64, 256, (ctx, w, h) => {
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f06292";
    for (let y = -w; y < h + w; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - w * 0.8);
      ctx.lineTo(w, y - w * 0.8 + 14);
      ctx.lineTo(0, y + 14);
      ctx.closePath();
      ctx.fill();
    }
  });

/** Hạt dâu trên quả dâu tây */
const strawberrySkin = () => speckle("#d8283a", ["#f5d76e", "#f0c75a"], 140, 61, 0.008);

/** Quả dâu tây dựng đứng (chóp lên trên), đài lá xanh ở chân */
const Strawberry = ({ position, rotation = [0, 0, 0] }: { position: V3; rotation?: V3 }) => (
  <group position={position} rotation={rotation}>
    <Lathe
      points={[[0, 0], [0.008, 0.001], [0.0125, 0.006], [0.0135, 0.012], [0.012, 0.019], [0.0085, 0.026], [0.004, 0.031], [0, 0.0325]]}
      map={strawberrySkin()}
      color="#ffffff"
      finish="organic"
      seg={24}
    />
    <Repeat
      shape="sphere"
      at={range(6).map((i): RepeatItem => {
        const a = (i / 6) * Math.PI * 2;
        return { p: [Math.cos(a) * 0.0075, 0.0028, Math.sin(a) * 0.0075], s: [0.0072, 0.0016, 0.0032], r: [0, -a, -0.35] };
      })}
      size={[1, 1, 1]}
      seg={8}
      color="#4c8c2e"
      finish="organic"
    />
  </group>
);

/** Bánh kem sinh nhật trên đế sứ: phủ kem, sô-cô-la chảy, dâu tây, kem bắt hoa, một cây nến đang cháy; khuyết một miếng lộ các lớp */
export const Cake = () => {
  const radius = 0.1;
  const base = 0.067;
  const height = 0.089;
  const gap = 0.9;
  const t1 = 0.65 - gap / 2;
  const t2 = 0.65 + gap / 2;
  const inGap = (a: number) => {
    const x = (((a - t1) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return x < gap;
  };
  const rand = seeded(71);
  const drips = range(30)
    .map((i) => (i / 30) * Math.PI * 2 + rand() * 0.08)
    .filter((a) => !inGap(a - 0.06) && !inGap(a + 0.06))
    .map((a) => ({ a, len: 0.012 + rand() * 0.03 }));
  const ringAngles = range(10)
    .map((i) => t2 + 0.22 + (i / 9) * (Math.PI * 2 - gap - 0.44))
    .filter((a) => !inGap(a));
  const topY = base + height;
  return (
    <group>
      {/* Đế bánh sứ có chân */}
      <Lathe
        points={[[0, 0.002], [0.058, 0], [0.062, 0.004], [0.05, 0.012], [0.022, 0.03], [0.017, 0.045], [0.02, 0.055], [0.05, 0.0595], [0.13, 0.0625], [0.137, 0.066], [0.135, 0.0685], [0.12, 0.067], [0, 0.067]]}
        color="#e6efe9"
        finish="ceramic"
        seg={64}
      />
      {/* Thân bánh khuyết một miếng + hai mặt cắt */}
      <Cylinder r={radius} h={height - 0.004} position={[0, base + (height - 0.004) / 2, 0]} arcStart={t2} arc={Math.PI * 2 - gap} color="#fbf1e1" finish="organic" seg={64} />
      <Cylinder r={radius + 0.0018} h={0.008} position={[0, topY - 0.004, 0]} arcStart={t2} arc={Math.PI * 2 - gap} color="#4a2516" finish="gloss" seg={64} />
      {(
        [
          [t2, 1],
          [t1, -1],
        ] as const
      ).map(([a, side]) => (
        <mesh key={side} position={[Math.sin(a) * radius * 0.5, base + height / 2, Math.cos(a) * radius * 0.5]} rotation={[0, side === 1 ? a - Math.PI / 2 : a + Math.PI / 2, 0]}>
          <planeGeometry args={[radius, height]} />
          <Surface map={cakeLayers(side)} color="#ffffff" finish="organic" />
        </mesh>
      ))}
      {/* Sô-cô-la chảy xuống thành bánh */}
      <Repeat
        shape="cylinder"
        at={drips.map(({ a, len }): RepeatItem => ({ p: [Math.sin(a) * (radius + 0.0012), topY - 0.004 - len / 2, Math.cos(a) * (radius + 0.0012)], s: [1, len, 1] }))}
        size={[0.0052, 1, 0]}
        seg={12}
        color="#4a2516"
        finish="gloss"
      />
      <Repeat
        shape="sphere"
        at={drips.map(({ a, len }): V3 => [Math.sin(a) * (radius + 0.0012), topY - 0.004 - len, Math.cos(a) * (radius + 0.0012)])}
        size={[0.006, 0, 0]}
        seg={12}
        color="#4a2516"
        finish="gloss"
      />
      {/* Kem bắt hoa + dâu tây quanh mép */}
      <Repeat
        shape="sphere"
        at={ringAngles.filter((_, i) => i % 2 === 0).map((a): RepeatItem => ({ p: [Math.sin(a) * 0.078, topY + 0.006, Math.cos(a) * 0.078], s: [1, 0.85, 1] }))}
        size={[0.0115, 0, 0]}
        seg={16}
        color="#fdf6ea"
        finish="organic"
      />
      {ringAngles
        .filter((_, i) => i % 2 === 1)
        .map((a) => (
          <Strawberry key={a} position={[Math.sin(a) * 0.076, topY - 0.001, Math.cos(a) * 0.076]} rotation={[0, a, 0.12]} />
        ))}
      {/* Nến sọc xoắn đang cháy */}
      <group position={[Math.sin(0.65 + Math.PI) * 0.03, topY, Math.cos(0.65 + Math.PI) * 0.03]}>
        <Cylinder r={0.0045} h={0.055} position={[0, 0.0275, 0]} map={candleStripes()} color="#ffffff" finish="plastic" seg={16} />
        <Cylinder r={0.0008} h={0.008} position={[0, 0.058, 0]} color="#2a2a2a" finish="matte" seg={6} />
        <Sphere r={0.0056} scale={[1, 1.9, 1]} position={[0, 0.0685, 0]} color="#ffa63d" finish="glow" emissiveIntensity={2} seg={16} />
        <Sphere r={0.003} scale={[1, 1.7, 1]} position={[0, 0.0665, 0]} color="#fff3c4" finish="glow" emissiveIntensity={2.4} seg={12} />
      </group>
    </group>
  );
};
