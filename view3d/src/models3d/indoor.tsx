// Mô hình 3D nhóm Đồ dùng trong nhà: sách, đồng hồ, bình hoa, kéo, gấu bông, máy sấy tóc, bàn chải đánh răng
import { Box, Capsule, Cylinder, Extrude, Lathe, Repeat, Sphere, Surface, Torus, Tube } from "./parts";
import { ellipse, range, seeded, SIDES, type V2, type V3 } from "./shapes";
import { clockFace, drawTexture, speckle, stripes } from "./textures";

const SERIF = 'Georgia, "Times New Roman", serif';
const CHROME = "#d4d8dd";

/** Góc xoay (thứ tự XYZ) đưa trục +y của vật về hướng dir: hoa, lá, tay gấu… */
const aim = ([x, y, z]: V3): V3 => {
  const n = Math.hypot(x, y, z) || 1;
  return [Math.atan2(z, y), 0, -Math.asin(x / n)];
};

/* ===== Sách ===== */

const PAPER = "#f1e9d6";
const BOARD = 0.0025;

/** Bìa trước: rãnh bản lề cạnh gáy, khung nhũ, tên sách, hoạ tiết, tác giả */
const coverArt = (bg: string, ink: string, title: string, author: string) =>
  drawTexture(`indoor:cover:${bg}:${ink}:${title}:${author}`, 320, 480, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(w * 0.035, 0, w * 0.014, h);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.12, h * 0.06, w * 0.8, h * 0.88);
    ctx.lineWidth = 2;
    ctx.strokeRect(w * 0.15, h * 0.08, w * 0.74, h * 0.84);
    const cx = w * 0.52;
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${w * 0.15}px ${SERIF}`;
    ctx.fillText(title, cx, h * 0.29, w * 0.64);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, h * 0.53, w * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.53 - w * 0.07);
    ctx.lineTo(cx + w * 0.05, h * 0.53);
    ctx.lineTo(cx, h * 0.53 + w * 0.07);
    ctx.lineTo(cx - w * 0.05, h * 0.53);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - w * 0.2, h * 0.39, w * 0.4, 3);
    ctx.font = `400 ${w * 0.065}px ${SERIF}`;
    ctx.fillText(author, cx, h * 0.8, w * 0.6);
  });

/** Bìa sau (nhìn từ phía sau, gáy ở bên phải): đoạn giới thiệu + mã vạch */
const backArt = (bg: string, ink: string) =>
  drawTexture(`indoor:back:${bg}:${ink}`, 320, 480, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(w * 0.951, 0, w * 0.014, h);
    ctx.fillStyle = ink;
    ctx.font = `700 ${w * 0.07}px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.fillText("★★★★★", w * 0.47, h * 0.12);
    ctx.globalAlpha = 0.5;
    for (const i of range(14))
      ctx.fillRect(w * 0.12, h * (0.18 + i * 0.034), w * (i % 5 === 4 ? 0.38 : 0.7), h * 0.008);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(w * 0.5, h * 0.76, w * 0.34, h * 0.14);
    ctx.fillStyle = "#1f1f1f";
    const rand = seeded(5);
    for (let x = w * 0.53; x < w * 0.81;) {
      const bar = 1 + Math.floor(rand() * 3);
      ctx.fillRect(x, h * 0.775, bar, h * 0.095);
      x += bar + 1 + Math.floor(rand() * 3);
    }
  });

/** Gáy sách (quấn quanh nửa trụ, u đi từ bìa sau → bìa trước): vạch nhũ hai đầu, tên sách chạy dọc */
const spineArt = (bg: string, ink: string, title: string) =>
  drawTexture(`indoor:spine:${bg}:${ink}:${title}`, 96, 640, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;
    for (const y of [0.045, 0.07, 0.92, 0.945]) ctx.fillRect(0, h * y, w, h * 0.008);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${w * 0.3}px ${SERIF}`;
    ctx.fillText(title, 0, 0, h * 0.7);
    ctx.restore();
  });

/** Vân mép giấy: các đường mảnh song song với bìa, tối dần sát bìa */
const pageEdge = () =>
  drawTexture("indoor:pages", 256, 64, (ctx, w, h) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(11);
    const n = 40;
    for (const i of range(n)) {
      ctx.fillStyle = `rgba(140, 118, 84, ${0.12 + rand() * 0.22})`;
      ctx.fillRect((i + rand() * 0.6) * (w / n), 0, 1.5, h);
    }
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, "rgba(110, 90, 60, 0.3)");
    shade.addColorStop(0.1, "rgba(110, 90, 60, 0)");
    shade.addColorStop(0.9, "rgba(110, 90, 60, 0)");
    shade.addColorStop(1, "rgba(110, 90, 60, 0.3)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
  });

interface HardcoverProps {
  /** Rộng (x) × cao (y) × dày (z) */
  w: number;
  h: number;
  t: number;
  color: string;
  ink: string;
  title: string;
  author: string;
}

/** Sách bìa cứng tâm ở gốc: bìa trước hướng +z, gáy tròn bên -x, mép giấy bên +x */
const Hardcover = ({ w, h, t, color, ink, title, author }: HardcoverProps) => {
  const bulge = 0.0055; // gáy phồng ra ngoài mép tấm bìa
  const x0 = -w / 2 + bulge;
  const bw = w - bulge;
  const bx = x0 + bw / 2;
  const inset = 0.0035; // khối giấy thụt vào so với bìa
  const pt = t - BOARD * 2 - 0.0006;
  const ph = h - inset * 2;
  const px0 = x0 - 0.002;
  const pw = w / 2 - inset - px0;
  const edge = pageEdge();
  return (
    <group>
      {SIDES.map((side) => (
        <Box
          key={side}
          size={[bw, h, BOARD]}
          radius={0.0008}
          position={[bx, 0, side * (t / 2 - BOARD / 2)]}
          color={color}
          finish="matte"
        />
      ))}
      <Cylinder
        r={1}
        h={h}
        open
        arcStart={Math.PI}
        arc={Math.PI}
        scale={[bulge, 1, t / 2]}
        position={[x0, 0, 0]}
        color="#ffffff"
        map={spineArt(color, ink, title)}
        finish="matte"
        doubleSide
        seg={24}
      />
      {/* Khối giấy + gáy giấy tròn */}
      <Box size={[pw, ph, pt]} position={[px0 + pw / 2, 0, 0]} color={PAPER} finish="matte" />
      <Cylinder
        r={1}
        h={ph}
        arcStart={Math.PI}
        arc={Math.PI}
        scale={[bulge - 0.003, 1, pt / 2]}
        position={[px0, 0, 0]}
        color={PAPER}
        finish="matte"
        seg={24}
      />
      {/* Vân giấy: mép trước, đầu và chân sách */}
      <mesh position={[w / 2 - inset + 0.0002, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[pt, ph]} />
        <Surface color="#ffffff" map={edge} finish="matte" />
      </mesh>
      {SIDES.map((side) => (
        <mesh
          key={side}
          position={[px0 + pw / 2, side * (ph / 2 + 0.0002), 0]}
          rotation={[(-side * Math.PI) / 2, 0, Math.PI / 2]}
        >
          <planeGeometry args={[pt, pw]} />
          <Surface color="#ffffff" map={edge} finish="matte" />
        </mesh>
      ))}
      {/* Mặt in của bìa trước / sau */}
      <mesh position={[bx, 0, t / 2 + 0.0002]}>
        <planeGeometry args={[bw - 0.002, h - 0.002]} />
        <Surface color="#ffffff" map={coverArt(color, ink, title, author)} finish="matte" />
      </mesh>
      <mesh position={[bx, 0, -t / 2 - 0.0002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[bw - 0.002, h - 0.002]} />
        <Surface color="#ffffff" map={backArt(color, ink)} finish="matte" />
      </mesh>
    </group>
  );
};

/** Sách bìa cứng đứng hơi xoay trên một cuốn nằm: bìa in tên sách, gáy tròn, mép giấy màu kem */
export const Book = () => (
  <group>
    {/* Cuốn nằm dưới: bìa lên trên, gáy quay ra trước */}
    <group position={[0, 0.019, 0]} rotation={[0, Math.PI / 2 + 0.1, 0]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Hardcover
          w={0.19}
          h={0.255}
          t={0.038}
          color="#2f5d4a"
          ink="#e8d8a8"
          title="ATLAS"
          author="WORLD MAPS"
        />
      </group>
    </group>
    <group position={[0.012, 0.038 + 0.1175, -0.012]} rotation={[0, -0.12, 0]}>
      <Hardcover
        w={0.155}
        h={0.235}
        t={0.03}
        color="#203a5c"
        ink="#e2c275"
        title="STORIES"
        author="COLLECTED TALES"
      />
    </group>
  </group>
);

/* ===== Đồng hồ ===== */

const CLOCK_RED = "#c8342c";

/** Kim đồng hồ thon dần, gốc ở tâm; angle (rad) tính theo chiều kim đồng hồ từ số 12 */
const Hand = ({
  angle,
  length,
  width,
  z,
  color,
}: {
  angle: number;
  length: number;
  width: number;
  z: number;
  color: string;
}) => (
  <Extrude
    shape={[
      [-width / 2, -length * 0.2],
      [width / 2, -length * 0.2],
      [width * 0.3, length],
      [0, length + width],
      [-width * 0.3, length],
    ]}
    depth={0.0012}
    rotation={[0, 0, -angle]}
    position={[0, 0, z]}
    color={color}
    finish="metal"
  />
);

/** Đồng hồ báo thức hai chuông: thân tròn đỏ, mặt số kính vòm, kim 10:10, chuông crôm, chân đứng */
export const Clock = () => {
  const R = 0.062;
  const D = 0.044;
  const cy = 0.094; // tâm mặt số cách mặt bàn
  const shell: V2[] = [
    [0, 0],
    [R - 0.009, 0],
    [R - 0.003, 0.002],
    [R, 0.008],
    [R, D - 0.004],
    [R - 0.0015, D],
  ];
  // Chìa cánh bướm: elip thắt eo ở giữa
  const butterfly = range(40).map((i): V2 => {
    const a = (i / 40) * Math.PI * 2;
    return [Math.cos(a) * 0.0125, Math.sin(a) * 0.0068 * (0.45 + 0.55 * Math.abs(Math.cos(a)))];
  });
  return (
    <group position={[0, cy, 0]}>
      <Lathe
        points={shell}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -D / 2]}
        color={CLOCK_RED}
        finish="gloss"
        seg={64}
      />
      <mesh position={[0, 0, D / 2 - 0.003]}>
        <circleGeometry args={[R - 0.0015, 64]} />
        <Surface color="#ffffff" map={clockFace("#fbf8f1", "#2b2b2b", CLOCK_RED)} finish="matte" />
      </mesh>
      <Torus r={R - 0.0005} tube={0.0055} position={[0, 0, D / 2]} color={CHROME} finish="chrome" seg={64} />
      <Hand
        angle={((10 + 10 / 60) / 12) * Math.PI * 2}
        length={0.028}
        width={0.0048}
        z={D / 2 - 0.0018}
        color="#2b2b2b"
      />
      <Hand
        angle={(10 / 60) * Math.PI * 2}
        length={0.042}
        width={0.0036}
        z={D / 2 - 0.0004}
        color="#2b2b2b"
      />
      <Hand
        angle={(35 / 60) * Math.PI * 2}
        length={0.046}
        width={0.0012}
        z={D / 2 + 0.0009}
        color={CLOCK_RED}
      />
      <Cylinder
        r={0.0038}
        h={0.003}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, D / 2 + 0.0022]}
        color={CHROME}
        finish="chrome"
        seg={20}
      />
      {/* Kính vòm */}
      <Sphere
        r={1}
        thetaLength={Math.PI / 2}
        scale={[R - 0.004, 0.011, R - 0.004]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, D / 2]}
        color="#ffffff"
        finish="glass"
        seg={48}
      />
      {/* Hai chuông + búa gõ */}
      {SIDES.map((side) => (
        <group key={side} position={[side * 0.05, 0.054, -0.004]} rotation={[0, 0, -side * 0.62]}>
          <Sphere r={0.031} thetaLength={Math.PI / 2} color={CHROME} finish="chrome" doubleSide />
          <Torus r={0.031} tube={0.0016} rotation={[Math.PI / 2, 0, 0]} color={CHROME} finish="chrome" />
          <Sphere r={0.0045} position={[0, 0.033, 0]} color={CHROME} finish="chrome" seg={16} />
          <Cylinder r={0.0025} h={0.022} position={[0, -0.008, 0]} color={CHROME} finish="metal" seg={12} />
        </group>
      ))}
      <Cylinder
        r={0.0018}
        h={0.024}
        position={[0, R + 0.006, -0.004]}
        color={CHROME}
        finish="metal"
        seg={12}
      />
      <Sphere r={0.0055} position={[0, R + 0.018, -0.004]} color={CHROME} finish="chrome" seg={16} />
      {/* Hai chân choãi */}
      {SIDES.map((side) => (
        <group key={side}>
          <Tube
            path={[
              [side * 0.034, -R + 0.016, -0.004],
              [side * 0.052, -cy + 0.009, -0.004],
            ]}
            r={0.0038}
            color={CHROME}
            finish="chrome"
            seg={8}
            radialSeg={12}
          />
          <Sphere
            r={0.0085}
            position={[side * 0.053, -cy + 0.0085, -0.004]}
            color={CHROME}
            finish="chrome"
            seg={20}
          />
        </group>
      ))}
      {/* Mặt sau: nắp dập viền, hai chìa lên dây cót hình cánh bướm, núm hẹn giờ */}
      <Cylinder
        r={R - 0.012}
        h={0.002}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -D / 2 - 0.0008]}
        color={CHROME}
        finish="metal"
        seg={48}
      />
      <Torus
        r={R - 0.013}
        tube={0.0018}
        position={[0, 0, -D / 2 - 0.0018]}
        color={CHROME}
        finish="chrome"
        seg={48}
        radialSeg={8}
      />
      {SIDES.map((side) => (
        <group key={side} position={[side * 0.022, -0.016, -D / 2]} rotation={[0, 0, side * 0.5]}>
          <Cylinder
            r={0.0026}
            h={0.012}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, -0.006]}
            color={CHROME}
            finish="metal"
            seg={12}
          />
          <Extrude
            shape={butterfly}
            depth={0.0016}
            bevel={0.0006}
            position={[0, 0, -0.0125]}
            color={CHROME}
            finish="chrome"
          />
        </group>
      ))}
      <Cylinder
        r={0.0065}
        h={0.007}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.03, -D / 2 - 0.004]}
        color={CHROME}
        finish="chrome"
        seg={20}
      />
    </group>
  );
};

/* ===== Bình hoa ===== */

const STEM = "#4f8a3a";

/** Men gốm (v theo thứ tự điểm biên dạng, trên = miệng): xanh cô-ban, men kem chảy thành giọt tròn đầu, chân đế mộc */
const glaze = () =>
  drawTexture("indoor:glaze", 512, 256, (ctx, w, h) => {
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, "#3f74a3");
    body.addColorStop(0.6, "#25517e");
    body.addColorStop(1, "#1c3f63");
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);
    // Dải men kem mép lượn nhẹ (tần số nguyên để khép kín quanh thân)
    ctx.fillStyle = "#efe8d8";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 4) {
      const a = (x / w) * Math.PI * 2;
      ctx.lineTo(x, h * (0.25 + 0.018 * Math.sin(a * 5) + 0.012 * Math.sin(a * 11 + 1)));
    }
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();
    // Giọt men chảy: dải bo tròn đầu, vẽ lặp hai mép để liền khi quấn quanh
    const rand = seeded(29);
    for (const _ of range(11)) {
      const x = rand() * w;
      const width = 7 + rand() * 12;
      const length = h * (0.05 + rand() * 0.2);
      for (const dx of [-w, 0, w]) {
        ctx.beginPath();
        ctx.roundRect(x + dx - width / 2, h * 0.22, width, length + h * 0.03, width / 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#c8ad8c";
    ctx.fillRect(0, h * 0.865, w, h * 0.135);
  });

/** Lá hình mũi mác dài, gốc ở gốc toạ độ, mọc theo +y */
const leaf = (length: number, width: number): V2[] => {
  const n = 10;
  const right = range(n + 1).map((i): V2 => {
    const t = i / n;
    return [(width / 2) * Math.sin(Math.PI * t) ** 0.7 * (1 - 0.35 * t), length * t];
  });
  return [
    ...right,
    ...right
      .slice(1, -1)
      .reverse()
      .map(([x, y]): V2 => [-x, y]),
  ];
};

/** Hoa tulip ở đầu cành: đài xanh, nụ trong, ba cánh ngoài ôm lấy */
const Tulip = ({ at, dir, color }: { at: V3; dir: V3; color: string }) => (
  <group position={at} rotation={aim(dir)}>
    <Sphere r={0.0055} position={[0, 0.002, 0]} color={STEM} finish="organic" seg={16} />
    <Sphere
      r={1}
      scale={[0.0135, 0.021, 0.0135]}
      position={[0, 0.02, 0]}
      color={color}
      finish="organic"
      seg={24}
    />
    {range(3).map((k) => (
      <group key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
        <Sphere
          r={1}
          scale={[0.0125, 0.026, 0.0062]}
          position={[0, 0.023, 0.0078]}
          rotation={[0.14, 0, 0]}
          color={color}
          finish="organic"
          seg={24}
        />
      </group>
    ))}
  </group>
);

/** Bình gốm men chảy cắm năm bông tulip và hai lá */
export const Vase = () => {
  const outer: V2[] = [
    [0, 0.003],
    [0.036, 0.001],
    [0.041, 0.006],
    [0.043, 0.016],
    [0.053, 0.034],
    [0.064, 0.058],
    [0.071, 0.086],
    [0.072, 0.114],
    [0.066, 0.143],
    [0.054, 0.17],
    [0.04, 0.193],
    [0.031, 0.213],
    [0.0295, 0.23],
    [0.033, 0.246],
    [0.04, 0.258],
    [0.0428, 0.264],
  ];
  const lip: V2[] = [
    [0.0428, 0.264],
    [0.0418, 0.2665],
    [0.0398, 0.2668],
    [0.0382, 0.2645],
    [0.032, 0.252],
    [0.027, 0.234],
    [0.0265, 0.214],
    [0.03, 0.2],
    [0, 0.198],
  ];
  const flowers: { path: V3[]; color: string }[] = [
    {
      path: [
        [0, 0.2, 0],
        [0.003, 0.31, 0.006],
        [0.01, 0.425, 0.018],
      ],
      color: "#d8343f",
    },
    {
      path: [
        [-0.004, 0.2, 0.002],
        [-0.018, 0.3, 0.012],
        [-0.058, 0.39, 0.03],
      ],
      color: "#f2c230",
    },
    {
      path: [
        [0.004, 0.2, -0.002],
        [0.022, 0.29, 0.004],
        [0.066, 0.365, 0.022],
      ],
      color: "#ec7aa0",
    },
    {
      path: [
        [0, 0.2, -0.004],
        [-0.006, 0.3, -0.022],
        [-0.024, 0.395, -0.058],
      ],
      color: "#8e4fb5",
    },
    {
      path: [
        [0.003, 0.2, -0.003],
        [0.012, 0.3, -0.02],
        [0.042, 0.372, -0.05],
      ],
      color: "#fafafa",
    },
  ];
  return (
    <group>
      <Lathe points={outer} color="#ffffff" map={glaze()} finish="ceramic" seg={64} />
      <Lathe points={lip} color="#efe8d8" finish="ceramic" seg={64} />
      {flowers.map(({ path, color }) => {
        const end = path[path.length - 1];
        const prev = path[path.length - 2];
        return (
          <group key={color}>
            <Tube path={path} r={0.0026} color={STEM} finish="organic" seg={24} radialSeg={8} />
            <Tulip at={end} dir={[end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]]} color={color} />
          </group>
        );
      })}
      {/* Lá tulip vươn ra từ miệng bình */}
      <group position={[0.014, 0.232, 0.012]} rotation={aim([0.5, 1, 0.55])}>
        <Extrude
          shape={leaf(0.13, 0.03)}
          depth={0.0012}
          rotation={[0, 0.45, 0]}
          color="#4c7d3a"
          finish="organic"
        />
      </group>
      <group position={[-0.014, 0.232, -0.01]} rotation={aim([-0.55, 1, -0.4])}>
        <Extrude
          shape={leaf(0.12, 0.028)}
          depth={0.0012}
          rotation={[0, 0.6, 0]}
          color="#4c7d3a"
          finish="organic"
        />
      </group>
    </group>
  );
};

/* ===== Kéo ===== */

/** Kéo văn phòng mở hé dựng nghiêng: hai lưỡi thép, chốt xoay, hai vòng tay cầm nhựa cam to nhỏ */
export const Scissors = () => {
  // Một nửa kéo (lưỡi trên): lưỡi hướng +x, chốt ở gốc, chuôi kim loại chạy về tay cầm phía dưới-sau
  const half: V2[] = [
    [0.112, 0.0008],
    [0.095, 0.0042],
    [0.065, 0.0075],
    [0.035, 0.0098],
    [0.012, 0.0108],
    [0.002, 0.0098],
    [-0.007, 0.0062],
    [-0.016, 0.0004],
    [-0.034, -0.0052],
    [-0.037, -0.0115],
    [-0.022, -0.0112],
    [-0.008, -0.0088],
    [0.004, -0.0058],
    [0.03, -0.0042],
    [0.07, -0.0026],
    [0.1, -0.0008],
  ];
  // Dải mài sắc dọc lưỡi cắt, nằm trên mặt ngoài của lưỡi
  const edge: V2[] = [
    [0.006, -0.0056],
    [0.03, -0.0042],
    [0.07, -0.0026],
    [0.1, -0.0008],
    [0.111, 0.0006],
    [0.1, 0.0016],
    [0.07, 0.0004],
    [0.03, -0.0014],
    [0.006, -0.0028],
  ];
  const flip = (points: V2[]) => points.map(([x, y]): V2 => [x, -y]);
  const pieces = [
    {
      side: 1,
      outline: half,
      bevel: edge,
      loop: { c: [-0.062, -0.019] as V2, rx: 0.027, ry: 0.0175, hx: 0.0195, hy: 0.0105 },
    },
    {
      side: -1,
      outline: flip(half),
      bevel: flip(edge),
      loop: { c: [-0.06, 0.0185] as V2, rx: 0.022, ry: 0.017, hx: 0.015, hy: 0.0102 },
    },
  ];
  return (
    <group rotation={[0, 0, 1.0]}>
      {pieces.map(({ side, outline, bevel, loop }) => (
        <group key={side} rotation={[0, 0, side * 0.2]} position={[0, 0, side * 0.0016]}>
          <Extrude shape={outline} depth={0.0022} bevel={0.0005} color={CHROME} finish="chrome" />
          <Extrude
            shape={bevel}
            depth={0.0002}
            position={[0, 0, side * 0.0017]}
            color="#eef0f2"
            finish="metal"
          />
          {/* Tay cầm nhựa: ống bọc chuôi + vòng xỏ ngón */}
          <Box
            size={[0.017, 0.0095, 0.0085]}
            radius={0.0035}
            position={[-0.04, -side * 0.0108, 0]}
            rotation={[0, 0, side * 0.5]}
            color="#fb8020"
            finish="plastic"
          />
          <Extrude
            shape={ellipse(loop.rx, loop.ry, 40)}
            holes={[ellipse(loop.hx, loop.hy, 40)]}
            depth={0.0065}
            bevel={0.0014}
            position={[loop.c[0], loop.c[1], 0]}
            rotation={[0, 0, -side * 0.22]}
            color="#fb8020"
            finish="plastic"
          />
        </group>
      ))}
      <Cylinder
        r={0.0042}
        h={0.0088}
        rotation={[Math.PI / 2, 0, 0]}
        color={CHROME}
        finish="chrome"
        seg={20}
      />
      <Sphere
        r={1}
        thetaLength={Math.PI / 2}
        scale={[0.0036, 0.0016, 0.0036]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.0044]}
        color="#b9bec5"
        finish="metal"
        seg={20}
      />
    </group>
  );
};

/* ===== Gấu bông ===== */

const FUR = "#a8703f";
const FUR_LIGHT = "#e6c9a0";
const BEAR_DARK = "#2a1d16";

/** Gấu bông ngồi: thân, bụng sáng màu, đầu, tai, mõm, mũi, mắt, tay, chân có đệm, nơ cổ cam */
export const TeddyBear = () => {
  // Lông: chấm nhỏ sáng / tối nhẹ trên nền trắng (nhân với màu lông)
  const fur = speckle("#ffffff", ["#ebe0d3", "#f8f3ee", "#e2d4c4"], 1800, 17, 0.0035);
  const furLight = speckle("#ffffff", ["#f1e8de", "#ebe0d2"], 1200, 23, 0.0035);
  return (
    <group>
      {/* Thân + bụng */}
      <Sphere
        r={1}
        scale={[0.085, 0.098, 0.078]}
        position={[0, 0.098, -0.005]}
        color={FUR}
        map={fur}
        finish="fur"
        seg={40}
      />
      <Sphere
        r={1}
        scale={[0.055, 0.063, 0.03]}
        position={[0, 0.09, 0.056]}
        color={FUR_LIGHT}
        map={furLight}
        finish="fur"
        seg={32}
      />
      <Sphere r={0.016} position={[0, 0.05, -0.08]} color={FUR} map={fur} finish="fur" seg={20} />
      {/* Đầu */}
      <group position={[0, 0.23, 0.008]}>
        <Sphere r={0.072} color={FUR} map={fur} finish="fur" seg={40} />
        <Sphere
          r={1}
          scale={[0.034, 0.027, 0.03]}
          position={[0, -0.018, 0.054]}
          color={FUR_LIGHT}
          map={furLight}
          finish="fur"
          seg={32}
        />
        <Sphere
          r={1}
          scale={[0.013, 0.009, 0.008]}
          position={[0, -0.004, 0.082]}
          color={BEAR_DARK}
          finish="gloss"
          seg={20}
        />
        {/* Miệng khâu chỉ: sống mũi + nụ cười */}
        <Cylinder
          r={0.0011}
          h={0.01}
          position={[0, -0.016, 0.0835]}
          rotation={[-0.25, 0, 0]}
          color={BEAR_DARK}
          finish="matte"
          seg={8}
        />
        <Torus
          r={0.0085}
          tube={0.0012}
          arc={Math.PI}
          position={[0, -0.0128, 0.0825]}
          rotation={[-0.35, 0, Math.PI]}
          color={BEAR_DARK}
          finish="matte"
          seg={16}
          radialSeg={6}
        />
        {SIDES.map((side) => (
          <group key={side}>
            <Sphere
              r={0.0085}
              position={[side * 0.027, 0.022, 0.058]}
              color={BEAR_DARK}
              finish="gloss"
              seg={20}
            />
            {/* Tai: ngoài lông, trong sáng màu */}
            <group position={[side * 0.052, 0.057, -0.01]} rotation={[0, 0, -side * 0.35]}>
              <Sphere r={1} scale={[0.03, 0.029, 0.015]} color={FUR} map={fur} finish="fur" seg={28} />
              <Sphere
                r={1}
                scale={[0.019, 0.018, 0.008]}
                position={[0, -0.002, 0.009]}
                color={FUR_LIGHT}
                map={furLight}
                finish="fur"
                seg={24}
              />
            </group>
          </group>
        ))}
      </group>
      {/* Tay buông xuôi ra trước, chân duỗi về trước có đệm bàn chân */}
      {SIDES.map((side) => (
        <group key={side}>
          <Capsule
            r={0.024}
            length={0.055}
            position={[side * 0.0825, 0.12, 0.03]}
            rotation={aim([-side * 0.025, 0.07, -0.04])}
            color={FUR}
            map={fur}
            finish="fur"
          />
          <group position={[side * 0.05, 0.032, 0.03]} rotation={[0, side * 0.28, 0]}>
            <Capsule
              r={0.03}
              length={0.05}
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, 0, 0.04]}
              color={FUR}
              map={fur}
              finish="fur"
            />
            <Sphere
              r={1}
              scale={[0.021, 0.023, 0.0065]}
              position={[0, 0.002, 0.093]}
              color={FUR_LIGHT}
              map={furLight}
              finish="fur"
              seg={28}
            />
          </group>
        </group>
      ))}
      {/* Nơ cổ */}
      <group position={[0, 0.168, 0.054]} rotation={[-0.35, 0, 0]}>
        {SIDES.map((side) => (
          <Sphere
            key={side}
            r={1}
            scale={[0.021, 0.013, 0.0075]}
            position={[side * 0.017, 0, 0]}
            rotation={[0, 0, side * 0.28]}
            color="#fb8020"
            finish="plastic"
            seg={24}
          />
        ))}
        <Sphere r={0.0075} position={[0, 0, 0.002]} color="#e8711a" finish="plastic" seg={16} />
      </group>
    </group>
  );
};

/* ===== Máy sấy tóc ===== */

const DRIER = "#d9668a";
const DRIER_DARK = "#2e2f33";

/** Máy sấy tóc dựng đứng trên tay cầm: thân trụ hồng, đầu thổi dẹt, lưới hút gió sau, công tắc trượt, dây điện */
export const HairDrier = () => {
  // Thân dọc trục y (sau → trước), xoay -π/2 quanh z để đầu thổi hướng +x
  const barrel: V2[] = [
    [0.03, 0],
    [0.039, 0.002],
    [0.044, 0.01],
    [0.046, 0.03],
    [0.0465, 0.07],
    [0.045, 0.12],
    [0.042, 0.15],
    [0.038, 0.17],
    [0.036, 0.178],
  ];
  const axis: V3 = [0, 0, -Math.PI / 2];
  return (
    // Cả máy ngả +0.22 rad để tay cầm (nghiêng -0.22 so với thân) đứng thẳng trên mặt bàn
    <group position={[-0.08, 0.137, 0]} rotation={[0, 0, 0.22]}>
      <Lathe points={barrel} rotation={axis} color={DRIER} finish="gloss" seg={48} />
      <Torus
        r={0.0435}
        tube={0.002}
        rotation={[0, Math.PI / 2, 0]}
        position={[0.004, 0, 0]}
        color={CHROME}
        finish="chrome"
      />
      {/* Lưới hút gió phía sau */}
      <Cylinder
        r={0.041}
        h={0.004}
        rotation={axis}
        position={[0.001, 0, 0]}
        color={DRIER_DARK}
        finish="matte"
        seg={48}
      />
      {[0.012, 0.022, 0.032].map((r) => (
        <Torus
          key={r}
          r={r}
          tube={0.0019}
          rotation={[0, Math.PI / 2, 0]}
          position={[-0.0012, 0, 0]}
          color="#55575d"
          finish="plastic"
          seg={40}
          radialSeg={8}
        />
      ))}
      <Sphere
        r={1}
        scale={[0.0035, 0.0075, 0.0075]}
        position={[-0.001, 0, 0]}
        color={CHROME}
        finish="chrome"
        seg={20}
      />
      {/* Cổ + đầu thổi dẹt */}
      <Torus
        r={0.0362}
        tube={0.0018}
        rotation={[0, Math.PI / 2, 0]}
        position={[0.178, 0, 0]}
        color={CHROME}
        finish="chrome"
      />
      <Cylinder
        rTop={0.034}
        rBottom={0.0362}
        h={0.012}
        rotation={axis}
        position={[0.184, 0, 0]}
        color={DRIER_DARK}
        finish="plastic"
        seg={40}
      />
      <Cylinder
        rTop={0.026}
        rBottom={0.0335}
        h={0.05}
        rotation={axis}
        scale={[0.55, 1, 1]}
        position={[0.215, 0, 0]}
        color={DRIER_DARK}
        finish="plastic"
        seg={40}
      />
      <Box
        size={[0.003, 0.021, 0.044]}
        radius={0.001}
        position={[0.2399, 0, 0]}
        color="#141414"
        finish="matte"
      />
      {/* Tay cầm: gốc dưới thân, nghiêng ra sau — trong khung này trục đã song song mặt bàn (mặt bàn ở y = -0.124) */}
      <group position={[0.075, -0.03, 0]} rotation={[0, 0, -0.22]}>
        <Capsule
          r={0.019}
          length={0.082}
          scale={[1, 1, 0.8]}
          position={[0, -0.06, 0]}
          color={DRIER}
          finish="gloss"
        />
        <Cylinder
          r={0.0198}
          h={0.012}
          scale={[1, 1, 0.82]}
          position={[0, -0.118, 0]}
          color={DRIER_DARK}
          finish="plastic"
          seg={32}
        />
        {/* Rãnh + hai nút trượt (tốc độ, nhiệt) bên hông, nút gió mát phía trước */}
        <Box
          size={[0.012, 0.044, 0.003]}
          radius={0.0014}
          position={[0, -0.054, 0.0142]}
          color={DRIER_DARK}
          finish="matte"
        />
        <Repeat
          at={[
            [0, -0.042, 0.0162],
            [0, -0.066, 0.0162],
          ]}
          size={[0.0092, 0.008, 0.0035]}
          radius={0.0015}
          color="#f4f1ee"
          finish="plastic"
        />
        <Box
          size={[0.004, 0.016, 0.009]}
          radius={0.0018}
          position={[0.0184, -0.024, 0]}
          color={CHROME}
          finish="chrome"
        />
        {/* Dây điện: chụp chống gập, cuộn trên mặt bàn ra sau, phích cắm */}
        <Cylinder
          rTop={0.0042}
          rBottom={0.0062}
          h={0.022}
          rotation={[0, 0, Math.PI / 2]}
          position={[-0.0265, -0.113, 0]}
          color={DRIER_DARK}
          finish="rubber"
          seg={16}
        />
        <Tube
          path={[
            [-0.033, -0.113, 0],
            [-0.05, -0.119, -0.004],
            [-0.07, -0.1208, -0.02],
            [-0.08, -0.1208, -0.05],
            [-0.065, -0.1208, -0.08],
            [-0.035, -0.1208, -0.09],
            [-0.008, -0.1208, -0.086],
          ]}
          r={0.0032}
          color={DRIER_DARK}
          finish="rubber"
          seg={48}
          radialSeg={10}
        />
        <Box
          size={[0.024, 0.016, 0.018]}
          radius={0.003}
          position={[0.004, -0.116, -0.086]}
          color={DRIER_DARK}
          finish="plastic"
        />
        <Repeat
          shape="cylinder"
          at={SIDES.map((side) => ({
            p: [0.022, -0.116, -0.086 + side * 0.005] as V3,
            r: [0, 0, Math.PI / 2] as V3,
          }))}
          size={[0.0018, 0.016, 0]}
          color={CHROME}
          finish="chrome"
          seg={10}
        />
      </group>
    </group>
  );
};

/* ===== Bàn chải đánh răng ===== */

const BRUSH = "#2b88d8";

/** Bàn chải đánh răng dựng nghiêng: cán nhựa có đệm cao su, đầu lông hai màu, kem đánh răng sọc */
export const Toothbrush = () => {
  const tufts = range(8).flatMap((i) => [-1, 0, 1].map((j): V3 => [0.1555 + i * 0.0034, 0.0078, j * 0.0036]));
  return (
    <group rotation={[0, 0, 0.8]}>
      <Tube
        path={[
          [0, 0, 0],
          [0.05, 0.002, 0],
          [0.1, 0.001, 0],
          [0.135, -0.002, 0],
          [0.152, 0, 0],
        ]}
        r={0.0062}
        taper={[0.75, 1, 1, 0.8, 0.5, 0.48]}
        scale={[1, 0.78, 1.05]}
        color={BRUSH}
        finish="gloss"
      />
      {/* Đệm cao su ở cán + gờ chặn ngón cái */}
      <Sphere
        r={1}
        scale={[0.036, 0.0036, 0.0066]}
        position={[0.052, 0.0033, 0]}
        color="#bfe6fb"
        finish="rubber"
        seg={32}
      />
      <Repeat
        at={range(4).map((i): V3 => [0.112 + i * 0.0045, 0.0042, 0])}
        size={[0.0018, 0.0016, 0.0062]}
        radius={0.0006}
        color="#bfe6fb"
        finish="rubber"
      />
      <Box
        size={[0.032, 0.0062, 0.0118]}
        radius={0.0028}
        position={[0.166, 0.0001, 0]}
        color={BRUSH}
        finish="gloss"
      />
      <Repeat
        shape="cylinder"
        at={tufts.filter(([, , z]) => z !== 0)}
        size={[0.0012, 0.011, 0]}
        color="#f3f6f9"
        finish="plastic"
        seg={8}
      />
      <Repeat
        shape="cylinder"
        at={tufts.filter(([, , z]) => z === 0)}
        size={[0.0012, 0.011, 0]}
        color="#3d9be0"
        finish="plastic"
        seg={8}
      />
      {/* Kem đánh răng sọc uốn lượn trên đầu lông */}
      <Tube
        path={[
          [0.153, 0.0166, 0],
          [0.16, 0.0178, 0.0008],
          [0.166, 0.0168, -0.0008],
          [0.172, 0.0178, 0.0008],
          [0.179, 0.0168, 0],
          [0.182, 0.0192, 0],
        ]}
        r={0.0034}
        taper={[0.6, 1, 1, 1, 0.8, 0.45]}
        color="#ffffff"
        map={stripes("#fafafa", "#36a3e6", 6, false)}
        finish="gloss"
        seg={48}
        radialSeg={12}
      />
    </group>
  );
};
