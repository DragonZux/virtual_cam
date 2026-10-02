// Mô hình 3D nhóm Phụ kiện: ba lô, ô dù, túi xách, cà vạt, vali
import { Box, Cylinder, Extrude, Lathe, Repeat, Sphere, Torus, Tube, type RepeatItem } from "./parts";
import { range, roundedRect, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture } from "./textures";

/** Thanh tròn từ a tới b cho Repeat shape="cylinder" có size = [bán kính, 1, _] */
const rod = (a: V3, b: V3): RepeatItem => {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...d);
  return {
    p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    s: [1, length, 1],
    r: [0, Math.atan2(d[2], -d[0]), Math.acos(d[1] / length)],
  };
};

/** Đa giác lồi bo tròn mọi góc bán kính r (thân túi hình thang, nút cà vạt) */
const roundCorners = (points: V2[], r: number, seg = 6): V2[] =>
  points.flatMap((p, i) => {
    const toward = (q: V2): V2 => {
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
    };
    const a = toward(points[(i + points.length - 1) % points.length]);
    const b = toward(points[(i + 1) % points.length]);
    const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    const cut = r / Math.tan(angle / 2);
    const bl = Math.hypot(a[0] + b[0], a[1] + b[1]);
    const dist = r / Math.sin(angle / 2);
    const c: V2 = [p[0] + ((a[0] + b[0]) / bl) * dist, p[1] + ((a[1] + b[1]) / bl) * dist];
    const start = Math.atan2(p[1] + a[1] * cut - c[1], p[0] + a[0] * cut - c[0]);
    let delta = Math.atan2(p[1] + b[1] * cut - c[1], p[0] + b[0] * cut - c[0]) - start;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return range(seg + 1).map((k): V2 => [c[0] + Math.cos(start + (delta * k) / seg) * r, c[1] + Math.sin(start + (delta * k) / seg) * r]);
  });

/** Mũi chỉ may cách đều dọc đường gấp khúc (mặt phẳng z cố định), mỗi mũi xoay theo hướng đường */
const stitches = (path: V2[], step: number, z: number, closed = true): RepeatItem[] => {
  const pts = closed ? [...path, path[0]] : path;
  const items: RepeatItem[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    let d = carry;
    for (; d < len; d += step) items.push({ p: [x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len, z], r: [0, 0, angle] });
    carry = d - len;
  }
  return items;
};

/** Biên dạng nhìn từ trước của túi vải mềm: đáy phẳng ở y = 0 bo góc rBottom, đỉnh bo tròn rTop */
const packOutline = (w: number, h: number, rTop: number, rBottom: number, seg = 10): V2[] => {
  const corner = (cx: number, cy: number, r: number, start: number) =>
    range(seg + 1).map((i): V2 => {
      const a = start + (i / seg) * (Math.PI / 2);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  return [
    ...corner(w / 2 - rBottom, rBottom, rBottom, -Math.PI / 2),
    ...corner(w / 2 - rTop, h - rTop, rTop, 0),
    ...corner(-w / 2 + rTop, h - rTop, rTop, Math.PI / 2),
    ...corner(-w / 2 + rBottom, rBottom, rBottom, Math.PI),
  ];
};

/** Dải dày t chạy theo đường cong Bézier bậc ba p0 → p3 (quai đeo nhìn nghiêng): biên dạng khép kín cho Extrude */
const bentStrip = (p0: V2, p1: V2, p2: V2, p3: V2, t: number, n = 24): V2[] => {
  const at = (u: number): V2 => {
    const v = 1 - u;
    const k = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
    return [
      k[0] * p0[0] + k[1] * p1[0] + k[2] * p2[0] + k[3] * p3[0],
      k[0] * p0[1] + k[1] * p1[1] + k[2] * p2[1] + k[3] * p3[1],
    ];
  };
  const pts = range(n + 1).map((i) => at(i / n));
  const side = (sign: number) =>
    pts.map(([x, y], i): V2 => {
      const [ax, ay] = pts[Math.max(0, i - 1)];
      const [bx, by] = pts[Math.min(n, i + 1)];
      const l = Math.hypot(bx - ax, by - ay);
      return [x - ((by - ay) / l) * sign * (t / 2), y + ((bx - ax) / l) * sign * (t / 2)];
    });
  return [...side(1), ...side(-1).reverse()];
};

const NAVY = "#2c3e5a";
const STRAP = "#24282f";
const ZIP = "#1c1f24";
const PULL = "#fb8020";
/** Chai nước nhựa trong túi bên ba lô: thân, vai thu, cổ */
const BOTTLE: V2[] = [
  [0, 0],
  [0.022, 0],
  [0.024, 0.006],
  [0.024, 0.17],
  [0.02, 0.2],
  [0.0125, 0.214],
  [0.0125, 0.226],
  [0, 0.226],
];

/** Ba lô vải xanh navy: thân bo tròn, túi trước, khoá kéo tay kéo cam, quai xách, hai quai đeo sau lưng, túi bên có chai nước */
export const Backpack = () => {
  // Thân: biên dạng 0.24 × 0.40 + vát 0.03 → 0.30 × 0.46, dày 0.18; mép ngoài sau vát = packOutline(0.3, 0.46, …)
  const mainZip = packOutline(0.3, 0.46, 0.13, 0.07)
    .filter(([, y]) => y > 0.16)
    .map(([x, y]): V3 => [x * 1.012, y + 0.003, 0.045]);
  const pocketZip = packOutline(0.17, 0.16, 0.05, 0.02)
    .filter(([, y]) => y > 0.07)
    .map(([x, y]): V3 => [x, 0.055 + y, 0.139]);
  // Quai đeo: dải cong (z, y) từ đỉnh lưng vòng ra sau rồi về góc đáy
  const strap = bentStrip([-0.088, 0.43], [-0.2, 0.43], [-0.19, 0.1], [-0.1, 0.045], 0.008);
  return (
    <group>
      <Extrude shape={packOutline(0.24, 0.4, 0.1, 0.04)} depth={0.12} bevel={0.03} position={[0, 0.03, 0]} color={NAVY} finish="fabric" />
      {/* Đáy gia cố màu đậm */}
      <Box size={[0.28, 0.05, 0.168]} radius={0.022} position={[0, 0.025, 0]} color="#1f2a3b" finish="fabric" />
      {/* Khoá kéo ngăn chính chạy vòng đỉnh + tay kéo */}
      <Tube path={mainZip} r={0.0045} color={ZIP} finish="plastic" radialSeg={8} />
      <Box size={[0.006, 0.022, 0.012]} radius={0.002} position={[0.1525, 0.37, 0.045]} color="#3a3f47" finish="metal" />
      <Box size={[0.004, 0.036, 0.012]} radius={0.0018} position={[0.155, 0.345, 0.045]} rotation={[0, 0, 0.08]} color={PULL} finish="plastic" />
      <Box size={[0.022, 0.006, 0.012]} radius={0.002} position={[-0.055, 0.4555, 0.045]} rotation={[0, 0, -0.42]} color="#3a3f47" finish="metal" />
      <Box size={[0.036, 0.004, 0.012]} radius={0.0018} position={[-0.075, 0.445, 0.05]} rotation={[0.5, 0, -0.42]} color={PULL} finish="plastic" />
      {/* Túi trước + khoá kéo + miếng da logo */}
      <Extrude shape={packOutline(0.17, 0.16, 0.05, 0.02)} depth={0.03} bevel={0.018} position={[0, 0.055, 0.105]} color="#263751" finish="fabric" />
      <Tube path={pocketZip} r={0.0038} color={ZIP} finish="plastic" radialSeg={8} />
      <Box size={[0.012, 0.04, 0.004]} radius={0.0018} position={[0.072, 0.175, 0.142]} rotation={[0, 0, 0.12]} color={PULL} finish="plastic" />
      <Box size={[0.056, 0.026, 0.004]} radius={0.002} position={[0, 0.115, 0.14]} color="#b98654" finish="matte" />
      {/* Quai xách trên đỉnh */}
      <Tube
        path={[
          [-0.04, 0.45, -0.035],
          [-0.03, 0.49, -0.035],
          [0.03, 0.49, -0.035],
          [0.04, 0.45, -0.035],
        ]}
        r={0.008}
        color={STRAP}
        finish="fabric"
        radialSeg={10}
      />
      {/* Lưng: hai đệm êm + hai quai đeo bản dẹt cong ra sau */}
      <Repeat at={SIDES.map((s): V3 => [s * 0.065, 0.25, -0.097])} size={[0.1, 0.28, 0.03]} radius={0.014} color="#3a4150" finish="fabric" />
      {SIDES.map((s) => (
        // Quai dựng theo mặt cắt dọc (z, y) rồi đùn theo x; nghiêng quanh z để chân quai choãi ra hai bên
        <group key={s} position={[s * 0.13, 0, 0]} rotation={[0, 0, s * 0.2]}>
          <Extrude shape={strap} depth={0.05} bevel={0.006} rotation={[0, -Math.PI / 2, 0]} color={STRAP} finish="fabric" />
        </group>
      ))}
      {/* Túi lưới bên phải + chai nước */}
      <Box size={[0.052, 0.15, 0.12]} radius={0.016} position={[0.16, 0.1, 0]} color="#22324a" finish="fabric" />
      <Lathe points={BOTTLE} position={[0.158, 0.04, 0]} color="#7cc3d6" finish="plastic" seg={24} />
      <Cylinder r={0.0135} h={0.022} position={[0.158, 0.265, 0]} color={PULL} finish="plastic" seg={20} />
    </group>
  );
};

/** Ô dù mở: 8 tấm vải đỏ / kem xen kẽ căng giữa các nan, gọng, cán, tay cầm gỗ cong chữ J, dựng nghiêng */
export const Umbrella = () => {
  const R = 0.6; // bán kính mặt cầu của tán
  const squash = 0.78; // tán hơi dẹt theo chiều cao
  const theta = 1.05; // góc mở từ đỉnh tới mép tán
  const apex = 1.0; // độ cao đỉnh tán so với khúc cong của tay cầm
  const cy = apex - R * squash;
  const on = (phi: number, t: number, k = 1): V3 => [
    -R * k * Math.cos(phi) * Math.sin(t),
    cy + R * k * squash * Math.cos(t),
    R * k * Math.sin(phi) * Math.sin(t),
  ];
  const angles = range(8).map((i) => (i / 8) * Math.PI * 2);
  // Nan: mỗi nan 4 đoạn thẳng ngay dưới tấm vải
  const ribs = angles.flatMap((phi) => {
    const pts = range(5).map((j) => on(phi, 0.1 + (j / 4) * (theta - 0.1), 0.985));
    return range(4).map((j) => rod(pts[j], pts[j + 1]));
  });
  const runnerY = apex - 0.3;
  const stretchers = angles.map((phi) => rod([0, runnerY, 0], on(phi, 0.6, 0.985)));
  return (
    <group rotation={[0.24, 0, -0.26]}>
      {angles.map((phi, i) => (
        <Sphere
          key={i}
          r={R}
          seg={1}
          phiStart={phi}
          phiLength={Math.PI / 4}
          thetaLength={theta}
          scale={[1, squash, 1]}
          position={[0, cy, 0]}
          color={i % 2 ? "#f1ece2" : "#c8322c"}
          finish="fabric"
          doubleSide
        />
      ))}
      <Repeat shape="cylinder" size={[0.0032, 1, 0]} seg={6} at={ribs} color="#3a3d42" finish="metal" />
      <Repeat shape="cylinder" size={[0.0026, 1, 0]} seg={6} at={stretchers} color="#5b6068" finish="metal" />
      {/* Đầu nan bịt nhựa ở mép tán */}
      <Repeat shape="sphere" size={[0.009, 0, 0]} seg={8} at={angles.map((phi) => on(phi, theta + 0.012))} color="#2a2c30" finish="plastic" />
      {/* Cán, con chạy, chóp trên đỉnh */}
      <Cylinder r={0.0065} h={apex - 0.13} position={[0, (apex + 0.13) / 2, 0]} color="#3d4148" finish="metal" seg={12} />
      <Cylinder r={0.013} h={0.07} position={[0, runnerY, 0]} color="#2a2c30" finish="plastic" seg={16} />
      <Cylinder r={0.022} h={0.022} position={[0, apex + 0.005, 0]} color="#2a2c30" finish="plastic" seg={20} />
      <Cylinder rTop={0.0035} rBottom={0.008} h={0.075} position={[0, apex + 0.05, 0]} color="#c9ccd1" finish="chrome" seg={12} />
      {/* Tay cầm gỗ cong chữ J */}
      <Cylinder r={0.011} h={0.03} position={[0, 0.2, 0]} color="#c9ccd1" finish="chrome" seg={16} />
      <Tube
        path={[
          [0, 0.19, 0],
          [0, 0.05, 0],
          [0.008, -0.03, 0],
          [0.04, -0.072, 0],
          [0.08, -0.068, 0],
          [0.1, -0.035, 0],
          [0.098, -0.005, 0],
        ]}
        r={0.016}
        color="#7a4a2a"
        finish="wood"
      />
    </group>
  );
};

const LEATHER = "#94512a";
const GOLD = "#d2a64e";

/** Túi xách da bò: thân hình thang, nắp trước có khoá xoay vàng, hai quai cong, đường chỉ may, đinh đế */
export const Handbag = () => {
  const front = 0.068; // mặt trước phẳng: đùn 0.1 / 2 + vát 0.018
  const flap = roundCorners(
    [
      [-0.142, 0.118],
      [0.142, 0.118],
      [0.128, 0.246],
      [-0.128, 0.246],
    ],
    0.026,
  );
  const flapSeam = roundCorners(
    [
      [-0.132, 0.128],
      [0.132, 0.128],
      [0.12, 0.24],
      [-0.12, 0.24],
    ],
    0.02,
  );
  const bodySeam = roundCorners(
    [
      [-0.155, 0.014],
      [0.155, 0.014],
      [0.118, 0.228],
      [-0.118, 0.228],
    ],
    0.024,
  );
  const handle = (z: number): V3[] => [
    [-0.085, 0.245, z],
    [-0.083, 0.3, z],
    [-0.056, 0.362, z],
    [0, 0.382, z],
    [0.056, 0.362, z],
    [0.083, 0.3, z],
    [0.085, 0.245, z],
  ];
  const feet: V3[] = SIDES.flatMap((sx) => SIDES.map((sz): V3 => [sx * 0.12, -0.02, sz * 0.035]));
  return (
    <group position={[0, 0.03, 0]}>
      <Extrude
        shape={roundCorners(
          [
            [-0.17, 0],
            [0.17, 0],
            [0.13, 0.24],
            [-0.13, 0.24],
          ],
          0.035,
        )}
        depth={0.1}
        bevel={0.018}
        color={LEATHER}
        finish="matte"
      />
      {/* Đường chỉ quanh mặt trước và mặt sau thân */}
      <Repeat at={[...stitches(bodySeam, 0.011, front + 0.0006), ...stitches(bodySeam, 0.011, -front - 0.0006)]} size={[0.006, 0.0016, 0.0012]} color="#e7cfa5" finish="matte" />
      {/* Nắp trước + chỉ may + khoá xoay */}
      <Extrude shape={flap} depth={0.005} bevel={0.0025} position={[0, 0, front + 0.004]} color="#7f4422" finish="matte" />
      <Repeat at={stitches(flapSeam, 0.011, front + 0.0095)} size={[0.006, 0.0016, 0.0012]} color="#e7cfa5" finish="matte" />
      <Box size={[0.058, 0.032, 0.008]} radius={0.003} position={[0, 0.112, front + 0.008]} color={GOLD} finish="metal" />
      <Cylinder r={0.01} h={0.012} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.112, front + 0.016]} color={GOLD} finish="chrome" seg={20} />
      <Box size={[0.004, 0.016, 0.004]} position={[0, 0.112, front + 0.023]} color="#b88a35" finish="metal" />
      {/* Hai quai cong, khoen vàng và đai da giữ quai */}
      {SIDES.map((s) => (
        <Tube key={s} path={handle(s * 0.032)} r={0.0085} color="#7f4422" finish="matte" />
      ))}
      {SIDES.flatMap((sx) =>
        SIDES.map((sz) => (
          <Torus key={`${sx}:${sz}`} r={0.012} tube={0.0028} position={[sx * 0.085, 0.262, sz * 0.032]} color={GOLD} finish="chrome" seg={24} radialSeg={8} />
        )),
      )}
      <Repeat at={SIDES.flatMap((sx) => SIDES.map((sz): V3 => [sx * 0.085, 0.255, sz * 0.032]))} size={[0.022, 0.012, 0.016]} radius={0.004} color="#7f4422" finish="matte" />
      {/* Đinh đế */}
      <Repeat shape="cylinder" size={[0.008, 0.022, 0]} seg={16} at={feet} color={GOLD} finish="chrome" />
    </group>
  );
};

/** Sọc chéo 45° lặp kín theo chiều ngang: nền xanh navy, sọc cam + bạc, chu kỳ period px */
const drawTieStripes = (ctx: CanvasRenderingContext2D, w: number, h: number, period: number) => {
  ctx.fillStyle = "#1f2f4f";
  ctx.fillRect(0, 0, w, h);
  const band = (from: number, to: number, color: string) => {
    ctx.fillStyle = color;
    for (let c = -Math.ceil(h / period + 1) * period; c <= w; c += period) {
      ctx.beginPath();
      ctx.moveTo(c + from * period, 0);
      ctx.lineTo(c + to * period, 0);
      ctx.lineTo(c + to * period + h, h);
      ctx.lineTo(c + from * period + h, h);
      ctx.closePath();
      ctx.fill();
    }
  };
  band(0, 0.24, "#e9782a");
  band(0.34, 0.41, "#c9ccd2");
};

/** Sọc của bản cà vạt: 1 ô ảnh = 1 dm (cà vạt dựng theo dm), chu kỳ 2.5 cm */
const tieStripes = () => drawTexture("accessories:tie-stripes", 256, 256, (ctx, w, h) => drawTieStripes(ctx, w, h, w / 4));

/** Sọc của vòng cổ: ảnh dài quấn đúng một lần quanh cung vòng (14 chu kỳ ~ 2.5 cm), cao bằng bản vòng */
const loopStripes = () => drawTexture("accessories:tie-loop", 896, 82, (ctx, w, h) => drawTieStripes(ctx, w, h, w / 14));

/** Nửa góc khe hở phía trước của vòng cổ cà vạt (chỗ chui vào nút thắt) */
const GAP = 0.42;

/** Cà vạt sọc chéo đã thắt: vòng cổ, nút thắt, bản trước nhọn, đuôi hẹp phía sau có đai giữ */
export const Tie = () => {
  // Hình cà vạt tính theo dm rồi thu 0.1 lần để hoạ tiết sọc đủ mịn (UV của Extrude = toạ độ hình)
  const blade: V2[] = [
    [-0.19, 0],
    [0.19, 0],
    [0.43, -4.55],
    [0, -4.98],
    [-0.43, -4.55],
  ];
  const tail: V2[] = [
    [-0.13, 0],
    [0.13, 0],
    [0.22, -3.9],
    [0, -4.1],
    [-0.22, -3.9],
  ];
  const knot = roundCorners(
    [
      [-0.17, 0],
      [0.17, 0],
      [0.3, 0.56],
      [-0.3, 0.56],
    ],
    0.08,
  );
  const stripes = tieStripes();
  const neck = 0.064; // bán kính vòng cổ
  const arc = Math.PI * 2 - 2 * GAP;
  return (
    <group rotation={[-0.06, 0.22, 0]}>
      <group position={[0, 0.535, 0]} scale={0.1}>
        <Extrude shape={blade} depth={0.05} bevel={0.02} position={[0, -0.05, 0.12]} color="#ffffff" map={stripes} finish="fabric" />
        <Extrude shape={tail} depth={0.04} bevel={0.015} position={[0.06, -0.12, 0.02]} color="#ffffff" map={stripes} finish="fabric" />
        <Extrude shape={knot} depth={0.2} bevel={0.06} position={[0, -0.08, 0.17]} color="#ffffff" map={stripes} finish="fabric" />
      </group>
      {/* Đai giữ đuôi sau bản trước */}
      <Box size={[0.05, 0.012, 0.017]} radius={0.003} position={[0, 0.29, 0.004]} color="#1f2f4f" finish="fabric" />
      {/* Vòng cổ: bản vải hẹp vòng ra sau như đang ôm cổ, phía sau cao hơn, hở phía trước chỗ chui vào nút */}
      <group position={[0, 0.572, 0.016 - neck]} rotation={[-0.2, 0, 0]}>
        <Cylinder r={neck} h={0.032} open arcStart={GAP} arc={arc} color="#ffffff" map={loopStripes()} finish="fabric" doubleSide seg={48} />
        {SIDES.map((s) => (
          <Torus
            key={s}
            r={neck}
            tube={0.0022}
            arc={arc}
            rotation={[Math.PI / 2, 0, Math.PI / 2 + GAP]}
            position={[0, s * 0.016, 0]}
            color="#1f2f4f"
            finish="fabric"
            seg={48}
            radialSeg={6}
          />
        ))}
      </group>
    </group>
  );
};

const SHELL = "#2f6f89";

/** Vali kéo vỏ cứng: hai nửa vỏ có gân dọc, đường khoá kéo, cần kéo rút đang kéo lên, quai xách, 4 bánh xoay đôi, thẻ hành lý cam */
export const Suitcase = () => {
  const W = 0.42;
  const H = 0.62;
  const base = 0.075; // chừa chỗ cho bánh xe
  const cy = base + H / 2;
  const top = base + H;
  const ribs: V3[] = [-0.135, -0.045, 0.045, 0.135].flatMap((x) => SIDES.map((s): V3 => [x, cy, s * 0.13]));
  const corners: V3[] = SIDES.flatMap((sx) => SIDES.map((sz): V3 => [sx * 0.165, 0.062, sz * 0.085]));
  const wheels: RepeatItem[] = corners.flatMap(([x, , z]) =>
    SIDES.map((s): RepeatItem => ({ p: [x + s * 0.011, 0.027, z], r: [0, 0, Math.PI / 2] })),
  );
  return (
    <group>
      {/* Hai nửa vỏ + dải khoá kéo ở giữa */}
      {SIDES.map((s) => (
        <Box key={s} size={[W, H, 0.125]} radius={0.045} position={[0, cy, s * 0.0655]} color={SHELL} finish="gloss" />
      ))}
      <Extrude shape={roundedRect(W - 0.006, H - 0.006, 0.042)} depth={0.012} position={[0, cy, 0]} color="#1f2329" finish="matte" />
      <Repeat at={ribs} size={[0.032, 0.5, 0.016]} radius={0.006} color={SHELL} finish="gloss" />
      {/* Khoá số bên hông */}
      <Box size={[0.008, 0.05, 0.034]} radius={0.003} position={[W / 2 + 0.002, cy + 0.12, 0]} color="#2a2c30" finish="plastic" />
      {/* Cần kéo rút: hộp chân, hai ống nhôm, tay nắm */}
      <Box size={[0.27, 0.014, 0.05]} radius={0.006} position={[0, top + 0.004, -0.085]} color="#2a2c30" finish="plastic" />
      <Repeat at={SIDES.map((s): V3 => [s * 0.105, top + 0.19, -0.085])} size={[0.02, 0.38, 0.013]} radius={0.004} color="#b9bec5" finish="metal" />
      <Box size={[0.27, 0.034, 0.036]} radius={0.015} position={[0, top + 0.385, -0.085]} color="#2a2c30" finish="rubber" />
      {/* Quai xách trên đỉnh + quai bên hông */}
      <Repeat at={SIDES.map((s): V3 => [s * 0.07, top + 0.004, 0.05])} size={[0.032, 0.014, 0.036]} radius={0.006} color="#2a2c30" finish="plastic" />
      <Tube
        path={[
          [-0.07, top + 0.004, 0.05],
          [-0.058, top + 0.032, 0.05],
          [0.058, top + 0.032, 0.05],
          [0.07, top + 0.004, 0.05],
        ]}
        r={0.011}
        color="#2a2c30"
        finish="rubber"
      />
      <Tube
        path={[
          [W / 2 - 0.004, cy + 0.07, -0.065],
          [W / 2 + 0.026, cy + 0.055, -0.065],
          [W / 2 + 0.026, cy - 0.055, -0.065],
          [W / 2 - 0.004, cy - 0.07, -0.065],
        ]}
        r={0.01}
        color="#2a2c30"
        finish="rubber"
      />
      {/* Thẻ hành lý cam treo trên quai */}
      <Tube
        path={[
          [0.03, top + 0.03, 0.05],
          [0.045, top + 0.012, 0.11],
          [0.06, top - 0.03, 0.134],
        ]}
        r={0.0025}
        color="#1f1f1f"
        finish="rubber"
        radialSeg={6}
      />
      <Box size={[0.06, 0.09, 0.005]} radius={0.008} position={[0.068, top - 0.08, 0.136]} rotation={[0, 0, 0.14]} color="#f07a24" finish="plastic" />
      {/* Bánh xoay: ổ bánh ở 4 góc + bánh đôi */}
      <Repeat at={corners} size={[0.056, 0.036, 0.056]} radius={0.012} color="#2a2c30" finish="plastic" />
      <Repeat shape="cylinder" size={[0.026, 0.014, 0]} seg={24} at={wheels} color="#1f1f1f" finish="rubber" />
    </group>
  );
};
