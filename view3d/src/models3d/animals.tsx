// Mô hình 3D nhóm Động vật: chim, mèo, chó, ngựa, cừu, bò, voi, gấu, ngựa vằn, hươu cao cổ
import { useEffect, useMemo, type ReactNode } from "react";
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3, type CanvasTexture } from "three";

import { Cone, Cylinder, Extrude, Lathe, Repeat, Sphere, Surface, Torus, Tube, type PartProps, type RepeatItem, type SurfaceProps } from "./parts";
import { range, seeded, SIDES, type V2, type V3 } from "./shapes";
import { drawTexture, gradient, patches, spots, stripes } from "./textures";

/* ===== Linh kiện dùng chung ===== */

/** Một điểm trên trục khối mềm: [x, y, z, bán kính] */
type V4 = [number, number, number, number];

/** Catmull-Rom một chiều: giá trị giữa b và c tại t ∈ [0, 1] */
const cr = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

/** Ống qua đường cong mượt, bán kính đổi mượt theo từng điểm; pháp tuyến tính cả độ thon nên chỗ phình / đầu bo sáng tối đúng */
const softGeometry = (pts: V4[], round: [number, number], seg: number, radial: number) => {
  // Đầu bo tròn: thêm điểm theo một phần tư elip dọc hướng ống, bán kính về 0 ở mút
  const cap = (p: V4, q: V4, len: number): V4[] => {
    const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [0.4, 0.7, 0.88, 0.97, 1].map((s): V4 => [
      p[0] + (d[0] / l) * len * s,
      p[1] + (d[1] / l) * len * s,
      p[2] + (d[2] / l) * len * s,
      p[3] * Math.sqrt(1 - s * s),
    ]);
  };
  const all = [
    ...(round[0] > 0 ? cap(pts[0], pts[1], round[0]).reverse() : []),
    ...pts,
    ...(round[1] > 0 ? cap(pts[pts.length - 1], pts[pts.length - 2], round[1]) : []),
  ];
  const curve = new CatmullRomCurve3(all.map(([x, y, z]) => new Vector3(x, y, z)), false, "catmullrom", 0.5);
  const n = all.length - 1;
  const radiusAt = (u: number) => {
    // distance = 0 → three tự tính theo u
    const x = curve.getUtoTmapping(Math.min(1, Math.max(0, u)), 0) * n;
    const k = Math.min(n - 1, Math.floor(x));
    const r = (i: number) => all[Math.min(n, Math.max(0, i))][3];
    return Math.max(0, cr(r(k - 1), r(k), r(k + 1), r(k + 2), x - k));
  };
  const length = curve.getLength();
  const frames = curve.computeFrenetFrames(seg, false);
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const point = new Vector3();
  const dir = new Vector3();
  const nrm = new Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, point);
    const r = radiusAt(u);
    const u0 = Math.max(0, u - 0.5 / seg);
    const u1 = Math.min(1, u + 0.5 / seg);
    const slope = (radiusAt(u1) - radiusAt(u0)) / ((u1 - u0) * length);
    const T = frames.tangents[i];
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      // Cùng thứ tự đỉnh / chiều mặt như TubeGeometry của three
      const v = (j / radial) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      dir.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z);
      position.push(point.x + r * dir.x, point.y + r * dir.y, point.z + r * dir.z);
      nrm.copy(dir).addScaledVector(T, -slope).normalize();
      normal.push(nrm.x, nrm.y, nrm.z);
      uv.push(u, j / radial);
    }
  }
  const index: number[] = [];
  for (let i = 1; i <= seg; i++) {
    for (let j = 1; j <= radial; j++) {
      const a = (radial + 1) * (i - 1) + (j - 1);
      const b = (radial + 1) * i + (j - 1);
      const c = (radial + 1) * i + j;
      const d = (radial + 1) * (i - 1) + j;
      index.push(a, b, d, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
};

/**
 * Khối mềm (thân, đầu, cổ, chân, đuôi, vòi…): ống qua các điểm [x, y, z, bán kính], bán kính đổi mượt.
 * round = [đầu, cuối]: độ dài phần bo kín ở hai đầu (0 = để hở, giấu trong khối khác).
 * Texture: u chạy dọc ống, v quanh ống (sọc dọc của stripes = vòng quanh ống).
 */
const Soft = ({
  pts,
  round = [0, 0],
  seg = 48,
  radialSeg = 24,
  position,
  rotation,
  scale,
  ...surface
}: PartProps & { pts: V4[]; round?: [number, number]; seg?: number; radialSeg?: number }) => {
  const sig = JSON.stringify([pts, round, seg, radialSeg]);
  const geometry = useMemo(() => {
    const [p, r, s, rs] = JSON.parse(sig) as [V4[], [number, number], number, number];
    return softGeometry(p, r, s, rs);
  }, [sig]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} rotation={rotation} scale={scale}>
      <Surface {...surface} />
    </mesh>
  );
};

/** Hai bên: phần con dựng cho bên phải (x > 0), bên trái là ảnh soi gương */
const Mirror = ({ children }: { children: ReactNode }) => (
  <>
    {SIDES.map((s) => (
      <group key={s} scale={[s, 1, 1]}>
        {children}
      </group>
    ))}
  </>
);

/** Pháp tuyến (ny, nz) vuông góc trục khối mềm tại điểm i, trong mặt phẳng yz, hướng lên (cổ vươn lên → ra sau; đầu cúi → ra trước) */
const normalAt = (pts: V4[], i: number) => {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const l = Math.hypot(b[1] - a[1], b[2] - a[2]) || 1;
  return [(b[2] - a[2]) / l, (a[1] - b[1]) / l];
};

/** Đường sống dọc khối mềm nằm trong mặt phẳng giữa (vệt trắng trên mặt, bờm dựng): t ∈ [from, to], cách mặt lift, bán kính r */
const ridge = (pts: V4[], from: number, to: number, count: number, lift: number, r: number): V4[] =>
  range(count).map((i): V4 => {
    const x = Math.min(1, Math.max(0, from + ((to - from) * i) / (count - 1))) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(x));
    const f = x - k;
    const [a, b] = [pts[k], pts[k + 1]];
    const l = Math.hypot(b[1] - a[1], b[2] - a[2]) || 1;
    const d = a[3] + (b[3] - a[3]) * f + lift;
    const [y, z] = [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    return [0, y + ((b[2] - a[2]) / l) * d, z - ((b[1] - a[1]) / l) * d, r];
  });

/**
 * Khối phủ sống khối mềm (bờm dày): cùng trục nhưng dời lên theo pháp tuyến để mặt trên nhô cao thick,
 * bán kính k·r, lệch ngang dx (trước khi co x) để bờm buông về một bên
 */
const hood = (pts: V4[], k: number, thick: number, dx = 0): V4[] =>
  pts.map((p, i): V4 => {
    const [ny, nz] = normalAt(pts, i);
    const d = p[3] * (1 - k) + thick;
    return [dx, p[1] + ny * d, p[2] + nz * d, p[3] * k];
  });

/** Viền khép kín mượt qua các điểm điều khiển (Catmull-Rom): tai voi, cánh, đuôi chim, lá */
const smooth = (ctrl: V2[], per = 6): V2[] =>
  ctrl.flatMap((p1, i) => {
    const n = ctrl.length;
    const [p0, p2, p3] = [ctrl[(i - 1 + n) % n], ctrl[(i + 1) % n], ctrl[(i + 2) % n]];
    return range(per).map((k): V2 => [cr(p0[0], p1[0], p2[0], p3[0], k / per), cr(p0[1], p1[1], p2[1], p3[1], k / per)]);
  });

/** Lặp hoạ tiết rx × ry lần trên một ảnh: mảng da không bị kéo dãn trên ống dài (cổ hươu) */
const tiled = (key: string, base: CanvasTexture, rx: number, ry: number) =>
  drawTexture(`tiled:${key}:${rx}:${ry}`, base.image.width * rx, base.image.height * ry, (ctx, w, h) => {
    for (const i of range(rx)) {
      for (const j of range(ry)) ctx.drawImage(base.image, (i * w) / rx, (j * h) / ry, w / rx, h / ry);
    }
  });

/** Mắt bóng có chấm sáng, nhìn theo +z; turn = quay quanh trục y để nhìn sang bên; sclera = lòng trắng quanh con ngươi */
const Eye = ({ position, r, turn = 0, sclera }: { position: V3; r: number; turn?: number; sclera?: string }) => (
  <group position={position} rotation={[0, turn, 0]}>
    {sclera && <Sphere r={r} seg={20} color={sclera} finish="gloss" />}
    <group position={[0, 0, sclera ? r * 0.5 : 0]} scale={sclera ? 0.62 : 1}>
      <Sphere r={r} seg={20} color="#1f1f1f" finish="gloss" />
      <Sphere r={r * 0.3} seg={10} position={[0, r * 0.45, r * 0.78]} color="#fafafa" finish="gloss" emissive="#ffffff" emissiveIntensity={0.5} />
    </group>
  </group>
);

/** Tai hình lá mọc từ gốc toạ độ dọc +y (dài len, rộng 2w), dẹt theo z; inner = màu lòng tai ở mặt +z */
const Ear = ({ len, w, inner, position, rotation, ...surface }: SurfaceProps & { len: number; w: number; inner?: string; position: V3; rotation?: V3 }) => (
  <group position={position} rotation={rotation}>
    <Soft
      pts={[
        [0, 0, 0, w * 0.75],
        [0, len * 0.35, 0, w],
        [0, len * 0.72, 0, w * 0.55],
      ]}
      round={[0, len * 0.28]}
      scale={[1, 1, 0.42]}
      seg={24}
      radialSeg={20}
      {...surface}
    />
    {inner && (
      <Soft
        pts={[
          [0, len * 0.1, 0, w * 0.5],
          [0, len * 0.38, 0, w * 0.68],
          [0, len * 0.7, 0, w * 0.36],
        ]}
        round={[0, len * 0.2]}
        position={[0, 0, w * 0.24]}
        scale={[1, 1, 0.32]}
        seg={20}
        radialSeg={16}
        color={inner}
        finish="matte"
      />
    )}
  </group>
);

interface HoofSpec {
  r: number;
  h: number;
  color: string;
}

/** Chân trước + chân sau bên phải (soi gương sang trái); hoof = móng guốc ở chân */
const Legs = ({ front, hind, hoof, ...surface }: SurfaceProps & { front: V4[]; hind: V4[]; hoof?: HoofSpec }) => (
  <Mirror>
    {[front, hind].map((pts) => {
      const [x, , z] = pts[pts.length - 1];
      return (
        <group key={pts[0][2]}>
          {/* Đầu trên bo kín: chỗ đùi / vai nhô khỏi thân không hở lỗ */}
          <Soft pts={pts} round={[pts[0][3] * 1.1, 0]} radialSeg={20} {...surface} />
          {hoof && <Cylinder rTop={hoof.r * 0.8} rBottom={hoof.r} h={hoof.h} position={[x, hoof.h / 2, z]} color={hoof.color} finish="gloss" seg={24} />}
        </group>
      );
    })}
  </Mirror>
);

/** Dáng thú có guốc: điểm thân / cổ / đầu / đuôi trên mặt phẳng giữa, chân bên phải */
interface UngulateSpec {
  body: V4[];
  neck: V4[];
  head: V4[];
  front: V4[];
  hind: V4[];
  tail: V4[];
  /** Độ dài phần bo tròn hai đầu thân / đầu */
  bodyRound: [number, number];
  headRound: [number, number];
  /** Độ bẹt ngang (scale x) của thân, cổ, đầu, đuôi */
  widths: [number, number, number, number];
  hoof: HoofSpec;
}

/** Thú có guốc (ngựa, ngựa vằn, bò, hươu cao cổ) dựng theo thông số; tai, mắt, bờm, sừng… truyền qua children */
const Ungulate = ({
  spec,
  coat,
  neckCoat = coat,
  headCoat = coat,
  legCoat = coat,
  tailCoat,
  children,
}: {
  spec: UngulateSpec;
  coat: SurfaceProps;
  neckCoat?: SurfaceProps;
  headCoat?: SurfaceProps;
  legCoat?: SurfaceProps;
  tailCoat: SurfaceProps;
  children?: ReactNode;
}) => {
  const [bw, nw, hw, tw] = spec.widths;
  return (
    <group>
      <Soft pts={spec.body} round={spec.bodyRound} scale={[bw, 1, 1]} seg={64} radialSeg={32} {...coat} />
      <Soft pts={spec.neck} round={[0, 0.04]} scale={[nw, 1, 1]} radialSeg={28} {...neckCoat} />
      <Soft pts={spec.head} round={spec.headRound} scale={[hw, 1, 1]} radialSeg={28} {...headCoat} />
      <Legs front={spec.front} hind={spec.hind} hoof={spec.hoof} {...legCoat} />
      <Soft pts={spec.tail} round={[0.02, 0.05]} scale={[tw, 1, 1]} radialSeg={16} {...tailCoat} />
      {children}
    </group>
  );
};

/* ===== Chim ===== */

/** Chim cổ đỏ đậu trên cành: thân trứng nghiêng, mặt và ngực cam, cánh nâu, đuôi xoè, chân bám cành */
export const Bird = () => {
  const brown = "#7a6345";
  const orange = "#e0703a";
  const bark = "#6b4a32";
  const leg = "#9a7462";
  const wing = smooth([[0, 0.004], [0.02, 0.014], [0.05, 0.012], [0.08, 0.001], [0.062, -0.007], [0.03, -0.012], [0.008, -0.01]]);
  const tail = smooth([[-0.006, 0], [0.006, 0], [0.016, 0.05], [0.007, 0.058], [0, 0.054], [-0.007, 0.058], [-0.016, 0.05]], 4);
  const leaf = smooth([[0, 0], [0.014, 0.011], [0.034, 0.009], [0.05, 0], [0.034, -0.009], [0.014, -0.011]]);
  return (
    <group>
      {/* Cành nằm ngang, một nhánh con và lá */}
      <Soft
        pts={[
          [-0.1, 0.012, -0.01, 0.0075],
          [-0.035, 0.015, -0.002, 0.0085],
          [0.04, 0.016, 0.004, 0.008],
          [0.1, 0.019, 0, 0.0062],
        ]}
        round={[0.004, 0.005]}
        radialSeg={14}
        color={bark}
        finish="wood"
      />
      <Soft pts={[[0.055, 0.017, 0.004, 0.005], [0.075, 0.028, 0.03, 0.004], [0.086, 0.04, 0.05, 0.003]]} round={[0, 0.003]} radialSeg={10} color={bark} finish="wood" />
      <Extrude shape={leaf} depth={0.0015} position={[0.083, 0.042, 0.052]} rotation={[-1.3, 0.4, 0.3]} color="#6f9e4a" finish="organic" />
      <Extrude shape={leaf} depth={0.0015} position={[-0.097, 0.016, -0.01]} rotation={[-1.4, 2.6, 0]} color="#7fae55" finish="organic" />
      <Extrude shape={leaf} depth={0.0015} position={[0.097, 0.021, 0]} rotation={[-1.5, -0.5, 0]} color="#5f8f3f" finish="organic" />
      {/* Chân mảnh + ba ngón trước, một ngón sau bám quanh cành */}
      <Mirror>
        <Soft pts={[[0.011, 0.055, 0.004, 0.0028], [0.012, 0.038, 0.008, 0.0021], [0.012, 0.026, 0.006, 0.002]]} radialSeg={8} seg={12} color={leg} finish="matte" />
        {[-0.004, 0, 0.004].map((dx) => (
          <Tube key={dx} path={[[0.012, 0.026, 0.006], [0.012 + dx * 0.6, 0.024, 0.013], [0.012 + dx, 0.017, 0.015]]} r={0.0014} seg={10} radialSeg={6} color={leg} finish="matte" />
        ))}
        <Tube path={[[0.012, 0.026, 0.006], [0.012, 0.024, -0.004], [0.012, 0.018, -0.008]]} r={0.0014} seg={10} radialSeg={6} color={leg} finish="matte" />
      </Mirror>
      {/* Thân nghiêng ngẩng về trước: lưng nâu, ngực cam, bụng kem, đuôi xoè chúc xuống */}
      <group position={[0, 0.082, 0]} rotation={[-0.5, 0, 0]}>
        <Sphere r={1} scale={[0.031, 0.033, 0.05]} color={brown} finish="matte" />
        <Sphere r={1} position={[0, -0.003, 0.016]} scale={[0.029, 0.03, 0.036]} color={orange} finish="matte" />
        <Sphere r={1} position={[0, -0.013, -0.006]} scale={[0.025, 0.022, 0.036]} color="#eee5d4" finish="matte" />
        <Extrude shape={tail} depth={0.004} bevel={0.001} position={[0, 0.002, -0.04]} rotation={[-1.75, 0, 0]} color="#5a4733" finish="matte" />
      </group>
      {/* Cánh khép hai bên, đầu cánh bắt chéo trên đuôi */}
      <Mirror>
        <group position={[0.027, 0.098, 0.022]} rotation={[-0.5, Math.PI / 2 + 0.2, 0]}>
          <Extrude shape={wing} depth={0.005} bevel={0.0015} color="#6c573c" finish="matte" />
          <Extrude shape={wing} depth={0.004} bevel={0.001} position={[0.028, -0.002, 0.0015]} scale={[0.62, 0.6, 1]} color="#54432f" finish="matte" />
        </group>
      </Mirror>
      {/* Đầu: đỉnh nâu, mặt cam, mỏ nhọn */}
      <Sphere r={0.024} position={[0, 0.132, 0.036]} color={brown} finish="matte" />
      <Sphere r={0.0215} position={[0, 0.126, 0.044]} color={orange} finish="matte" />
      <Cone r={0.0045} h={0.014} position={[0, 0.128, 0.07]} rotation={[Math.PI / 2 - 0.1, 0, 0]} color="#3a3230" finish="gloss" seg={16} />
      <Mirror>
        <Eye position={[0.0155, 0.135, 0.05]} r={0.005} turn={1.0} />
      </Mirror>
    </group>
  );
};

/* ===== Mèo ===== */

/** Mèo mướp cam ngồi: thân sọc, ngực kem, tai nhọn lòng hồng, mắt xanh con ngươi dọc, ria, đuôi cuộn quanh chân */
export const Cat = () => {
  const fur = "#e39a52";
  const cream = "#f6e4c6";
  // Sọc mướp: chỗ to lượn nhiều, chỗ mảnh (chân, đuôi) lượn ít cho khỏi răng cưa
  const tabby = (count: number, vertical: boolean, wobble = 0.6): SurfaceProps => ({
    color: "#ffffff",
    map: stripes(fur, "#c06a2c", count, vertical, wobble),
    finish: "fur",
  });
  return (
    <group>
      {/* Thân ngồi hơi ngả sau + hai đùi sau xếp dưới đất */}
      <Soft
        pts={[
          [0, 0.06, -0.04, 0.095],
          [0, 0.12, -0.02, 0.1],
          [0, 0.19, 0.01, 0.08],
          [0, 0.24, 0.03, 0.06],
        ]}
        round={[0.06, 0.04]}
        scale={[0.95, 1, 1]}
        radialSeg={28}
        {...tabby(7, true)}
      />
      <Mirror>
        <Sphere r={1} position={[0.065, 0.065, -0.03]} scale={[0.055, 0.065, 0.09]} {...tabby(6, false)} />
        <Sphere r={1} position={[0.08, 0.013, 0.035]} scale={[0.022, 0.013, 0.04]} color={cream} finish="fur" />
        {/* Chân trước thẳng, bàn chân kem */}
        <Soft pts={[[0.035, 0.19, 0.05, 0.024], [0.037, 0.1, 0.07, 0.02], [0.038, 0.025, 0.08, 0.018]]} radialSeg={16} {...tabby(5, true, 0.2)} />
        <Sphere r={1} position={[0.038, 0.013, 0.09]} scale={[0.022, 0.014, 0.03]} color={cream} finish="fur" />
      </Mirror>
      <Sphere r={1} position={[0, 0.17, 0.06]} scale={[0.055, 0.075, 0.045]} color={cream} finish="fur" />
      {/* Đuôi dài cuộn quanh chân trước */}
      <Soft
        pts={[
          [0.03, 0.03, -0.11, 0.02],
          [0.1, 0.022, -0.1, 0.019],
          [0.14, 0.02, -0.02, 0.018],
          [0.12, 0.02, 0.07, 0.017],
          [0.06, 0.02, 0.12, 0.016],
        ]}
        round={[0, 0.025]}
        radialSeg={16}
        {...tabby(9, true, 0.2)}
      />
      {/* Đầu tròn rộng má, mõm kem, cằm, mũi hồng */}
      <Sphere r={1} position={[0, 0.292, 0.055]} scale={[0.078, 0.066, 0.064]} {...tabby(12, true, 0.4)} />
      <Sphere r={0.015} position={[0, 0.25, 0.1]} color={cream} finish="fur" />
      <Sphere r={1} position={[0, 0.283, 0.117]} scale={[0.011, 0.007, 0.007]} color="#e07f8a" finish="gloss" />
      <Mirror>
        <Sphere r={0.019} position={[0.016, 0.266, 0.108]} color={cream} finish="fur" />
        <Ear position={[0.045, 0.335, 0.045]} rotation={[0, 0, -0.3]} len={0.066} w={0.03} inner="#e9939b" color={fur} finish="fur" />
        {/* Mắt xanh lục, con ngươi dọc */}
        <group position={[0.03, 0.305, 0.104]} rotation={[0, 0.24, 0]}>
          <Sphere r={1} scale={[0.019, 0.017, 0.01]} color="#a4c63e" finish="gloss" />
          <Sphere r={1} position={[0, 0, 0.005]} scale={[0.0045, 0.014, 0.0065]} color="#1f1f1f" finish="gloss" />
          <Sphere r={0.0032} position={[0.0045, 0.0065, 0.0095]} color="#fafafa" finish="gloss" emissive="#ffffff" emissiveIntensity={0.5} />
        </group>
        {/* Ria */}
        {[0.006, 0, -0.006].map((dy) => (
          <Tube
            key={dy}
            path={[[0.024, 0.266, 0.118], [0.068, 0.271 + dy, 0.11], [0.105, 0.272 + dy * 2, 0.094]]}
            r={0.0011}
            seg={12}
            radialSeg={5}
            caps={false}
            color="#f5f3ee"
            finish="matte"
          />
        ))}
      </Mirror>
    </group>
  );
};

/* ===== Chó ===== */

/** Chó lông vàng đứng: tai cụp, mõm dài mũi đen, thè lưỡi, đuôi vểnh, vòng cổ đỏ có thẻ cam */
export const Dog = () => {
  const coat: SurfaceProps = { color: "#d79f5c", finish: "fur" };
  const light = "#ecc791";
  return (
    <group>
      <Soft
        pts={[
          [0, 0.48, -0.27, 0.13],
          [0, 0.48, -0.12, 0.125],
          [0, 0.46, 0.04, 0.155],
          [0, 0.46, 0.18, 0.165],
          [0, 0.49, 0.28, 0.14],
        ]}
        round={[0.1, 0.09]}
        scale={[0.78, 1, 1]}
        seg={56}
        radialSeg={28}
        {...coat}
      />
      <Legs
        front={[
          [0.07, 0.44, 0.19, 0.058],
          [0.085, 0.3, 0.22, 0.048],
          [0.085, 0.12, 0.23, 0.035],
          [0.085, 0.05, 0.24, 0.032],
        ]}
        hind={[
          [0.065, 0.46, -0.21, 0.07],
          [0.085, 0.33, -0.17, 0.062],
          [0.085, 0.18, -0.27, 0.04],
          [0.085, 0.05, -0.25, 0.032],
        ]}
        {...coat}
      />
      <Mirror>
        {/* Bắp đùi sau + vai nối chân vào thân; bàn chân sáng màu */}
        <Sphere r={1} position={[0.07, 0.42, -0.2]} scale={[0.07, 0.13, 0.11]} {...coat} />
        <Sphere r={1} position={[0.068, 0.42, 0.2]} scale={[0.065, 0.11, 0.08]} {...coat} />
        <Sphere r={1} position={[0.085, 0.028, 0.255]} scale={[0.042, 0.03, 0.055]} color={light} finish="fur" />
        <Sphere r={1} position={[0.085, 0.028, -0.235]} scale={[0.042, 0.03, 0.055]} color={light} finish="fur" />
      </Mirror>
      {/* Cổ, ngực sáng màu */}
      <Soft pts={[[0, 0.52, 0.26, 0.12], [0, 0.62, 0.34, 0.095], [0, 0.7, 0.38, 0.085]]} round={[0, 0.05]} scale={[0.9, 1, 1]} {...coat} />
      <Sphere r={1} position={[0, 0.45, 0.33]} scale={[0.09, 0.11, 0.07]} color={light} finish="fur" />
      {/* Đầu: sọ, mõm, mũi, hàm dưới, lưỡi */}
      <Sphere r={1} position={[0, 0.76, 0.4]} scale={[0.095, 0.095, 0.105]} {...coat} />
      <Soft pts={[[0, 0.73, 0.45, 0.06], [0, 0.715, 0.53, 0.05], [0, 0.705, 0.57, 0.045]]} round={[0, 0.03]} color={light} finish="fur" />
      <Sphere r={1} position={[0, 0.72, 0.605]} scale={[0.024, 0.017, 0.016]} color="#1f1f1f" finish="gloss" />
      <Soft pts={[[0, 0.68, 0.46, 0.04], [0, 0.668, 0.53, 0.03]]} round={[0, 0.02]} color={light} finish="fur" />
      <Soft pts={[[0, 0.672, 0.52, 0.016], [0, 0.652, 0.558, 0.018], [0, 0.632, 0.565, 0.013]]} round={[0, 0.012]} scale={[1.4, 1, 1]} color="#e47b8c" finish="organic" />
      <Mirror>
        <Sphere r={1} position={[0.1, 0.735, 0.38]} rotation={[0, 0, 0.25]} scale={[0.025, 0.075, 0.05]} color="#c4874a" finish="fur" />
        <Eye position={[0.045, 0.79, 0.485]} r={0.016} turn={0.4} />
      </Mirror>
      {/* Đuôi vểnh */}
      <Soft pts={[[0, 0.53, -0.34, 0.035], [0, 0.6, -0.43, 0.045], [0, 0.72, -0.47, 0.04], [0, 0.82, -0.44, 0.025]]} round={[0, 0.03]} {...coat} />
      {/* Vòng cổ đỏ + thẻ tên cam */}
      <Torus r={0.105} tube={0.014} position={[0, 0.57, 0.3]} rotation={[-0.894, 0, 0]} scale={[0.92, 1, 1]} color="#d9363e" finish="plastic" />
      <Cylinder r={0.022} h={0.006} position={[0, 0.48, 0.4]} rotation={[Math.PI / 2 - 0.3, 0, 0]} color="#fb8020" finish="metal" />
    </group>
  );
};

/* ===== Ngựa ===== */

const BAY = "#8a4b2a";
const HAIR = "#2a201b";

const HORSE: UngulateSpec = {
  body: [
    [0, 1.27, -0.6, 0.28],
    [0, 1.25, -0.4, 0.315],
    [0, 1.2, -0.1, 0.325],
    [0, 1.22, 0.18, 0.335],
    [0, 1.29, 0.4, 0.3],
  ],
  bodyRound: [0.24, 0.2],
  neck: [
    [0, 1.28, 0.33, 0.29],
    [0, 1.56, 0.55, 0.225],
    [0, 1.8, 0.75, 0.175],
    [0, 1.95, 0.89, 0.145],
  ],
  head: [
    [0, 1.99, 0.91, 0.115],
    [0, 1.9, 1.02, 0.125],
    [0, 1.76, 1.15, 0.092],
    [0, 1.62, 1.27, 0.083],
  ],
  headRound: [0.07, 0.085],
  // Chân trước thẳng có khuỷu gối; chân sau gập khớp kheo ra sau
  front: [
    [0.12, 1.12, 0.34, 0.125],
    [0.155, 0.9, 0.37, 0.105],
    [0.155, 0.68, 0.385, 0.075],
    [0.155, 0.52, 0.395, 0.066],
    [0.155, 0.36, 0.4, 0.05],
    [0.155, 0.21, 0.41, 0.057],
    [0.155, 0.135, 0.43, 0.05],
    [0.155, 0.08, 0.45, 0.048],
  ],
  hind: [
    [0.12, 1.15, -0.55, 0.14],
    [0.155, 0.93, -0.46, 0.13],
    [0.155, 0.73, -0.56, 0.087],
    [0.155, 0.56, -0.64, 0.068],
    [0.155, 0.38, -0.62, 0.05],
    [0.155, 0.21, -0.6, 0.057],
    [0.155, 0.135, -0.58, 0.05],
    [0.155, 0.08, -0.56, 0.048],
  ],
  tail: [
    [0, 1.48, -0.74, 0.05],
    [0, 1.45, -0.9, 0.075],
    [0, 1.22, -1.0, 0.1],
    [0, 0.95, -1.0, 0.09],
    [0, 0.68, -0.95, 0.05],
  ],
  widths: [0.8, 0.62, 0.74, 0.7],
  hoof: { r: 0.064, h: 0.09, color: "#3a3330" },
};

/** Ngựa nâu hồng: chân dài, ngực sâu, cổ cong vươn cao, bờm và đuôi đen buông, cẳng chân sẫm, vệt trắng trên mặt */
export const Horse = () => {
  // Sợi lông chạy vòng quanh bờm / đuôi (vuông góc trục)
  const hair: SurfaceProps = { color: "#ffffff", map: stripes(HAIR, "#3b2c24", 34, true, 0.5), finish: "fur" };
  return (
    <Ungulate
      spec={HORSE}
      coat={{ color: BAY, finish: "matte" }}
      legCoat={{ color: "#ffffff", map: gradient([BAY, BAY, BAY, "#4a3022", HAIR], false), finish: "matte" }}
      tailCoat={hair}
    >
      {/* Bắp vai + mông: chân mọc ra từ khối cơ */}
      <Mirror>
        <Sphere r={1} position={[0.12, 1.15, 0.32]} scale={[0.14, 0.3, 0.2]} color={BAY} finish="matte" />
        <Sphere r={1} position={[0.13, 1.1, -0.52]} scale={[0.15, 0.3, 0.26]} color={BAY} finish="matte" />
      </Mirror>
      {/* Bờm dày phủ sống cổ, buông sang phải; chỏm bờm trước trán */}
      <Soft pts={hood(HORSE.neck, 0.8, 0.05, 0.06)} round={[0.08, 0.1]} scale={[HORSE.widths[1], 1, 1]} radialSeg={28} {...hair} />
      <Soft pts={[[0, 2.08, 0.9, 0.04], [0, 2.05, 0.98, 0.042], [0, 1.98, 1.04, 0.025]]} round={[0.03, 0.03]} scale={[0.8, 1, 1]} color={HAIR} finish="fur" />
      {/* Mõm sẫm, vệt trắng dọc mặt, lỗ mũi */}
      <Sphere r={1} position={[0, 1.595, 1.295]} scale={[0.068, 0.075, 0.085]} color="#5c3a29" finish="matte" />
      <Soft pts={ridge(HORSE.head, 0.25, 0.95, 4, -0.012, 0.022)} round={[0.02, 0.02]} radialSeg={12} color="#f2ede4" finish="matte" />
      <Mirror>
        <Sphere r={1} position={[0.035, 1.59, 1.37]} rotation={[0.6, 0, 0]} scale={[0.012, 0.02, 0.01]} color="#1f1f1f" finish="gloss" />
        <Ear position={[0.055, 2.06, 0.92]} rotation={[0.2, 0, -0.18]} len={0.15} w={0.042} inner="#3a2a22" color={BAY} finish="matte" />
        <Eye position={[0.083, 1.915, 1.04]} r={0.027} turn={1.2} />
      </Mirror>
    </Ungulate>
  );
};

/* ===== Cừu ===== */

/** Các cụm lông xù phủ quanh elip tâm c, bán trục r (phân bố đều kiểu Fibonacci) */
const fleece = (n: number, c: V3, r: V3, seed: number): RepeatItem[] => {
  const rand = seeded(seed);
  return range(n).map((i): RepeatItem => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const ring = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const k = 0.85 + rand() * 0.35;
    return { p: [c[0] + Math.cos(a) * ring * r[0], c[1] + y * r[1], c[2] + Math.sin(a) * ring * r[2]], s: [k, k, k] };
  });
};

/** Cừu lông xù màu kem, mặt và chân đen, tai cụp ngang */
export const Sheep = () => {
  const wool = "#f1ebdc";
  const face = "#2f2925";
  const puffs = fleece(72, [0, 0.7, -0.02], [0.27, 0.26, 0.42], 11);
  const cap: V3[] = [
    [0, 0.955, 0.44],
    [0.045, 0.94, 0.43],
    [-0.045, 0.94, 0.43],
    [0, 0.93, 0.49],
    [0.03, 0.915, 0.39],
    [-0.03, 0.915, 0.39],
  ];
  return (
    <group>
      {/* Lõi lông + hai lớp cụm lông xen màu */}
      <Sphere r={1} position={[0, 0.7, -0.02]} scale={[0.29, 0.28, 0.44]} color={wool} finish="fur" />
      <Repeat at={puffs.filter((_, i) => i % 2 === 0)} shape="sphere" size={[0.11, 1, 1]} seg={14} color={wool} finish="fur" />
      <Repeat at={puffs.filter((_, i) => i % 2 === 1)} shape="sphere" size={[0.11, 1, 1]} seg={14} color="#e7dfcc" finish="fur" />
      <Legs
        front={[
          [0.12, 0.55, 0.26, 0.05],
          [0.12, 0.3, 0.27, 0.038],
          [0.12, 0.18, 0.275, 0.032],
          [0.12, 0.06, 0.28, 0.03],
        ]}
        hind={[
          [0.12, 0.55, -0.3, 0.06],
          [0.12, 0.35, -0.27, 0.045],
          [0.12, 0.22, -0.32, 0.033],
          [0.12, 0.06, -0.31, 0.03],
        ]}
        hoof={{ r: 0.036, h: 0.06, color: "#24201d" }}
        color={face}
        finish="matte"
      />
      {/* Đầu đen thuôn, chỏm lông trên trán */}
      <Soft
        pts={[
          [0, 0.88, 0.42, 0.085],
          [0, 0.83, 0.5, 0.09],
          [0, 0.74, 0.6, 0.065],
          [0, 0.69, 0.65, 0.05],
        ]}
        round={[0.06, 0.05]}
        scale={[0.85, 1, 1]}
        color={face}
        finish="matte"
      />
      <Repeat at={cap} shape="sphere" size={[0.05, 1, 1]} seg={14} color={wool} finish="fur" />
      <Mirror>
        <Ear position={[0.07, 0.87, 0.46]} rotation={[0.3, 0, -1.9]} len={0.12} w={0.032} inner="#8a5f5a" color={face} finish="matte" />
        <Eye position={[0.06, 0.85, 0.54]} r={0.022} turn={0.9} sclera="#efe8d8" />
      </Mirror>
      {/* Đuôi ngắn */}
      <Sphere r={0.07} position={[0, 0.68, -0.5]} color={wool} finish="fur" />
    </group>
  );
};

/* ===== Bò ===== */

const COW: UngulateSpec = {
  body: [
    [0, 1.05, -0.62, 0.4],
    [0, 1.03, -0.35, 0.44],
    [0, 1.0, -0.05, 0.47],
    [0, 1.02, 0.25, 0.45],
    [0, 1.08, 0.48, 0.38],
  ],
  bodyRound: [0.2, 0.2],
  neck: [
    [0, 1.1, 0.45, 0.36],
    [0, 1.16, 0.7, 0.3],
    [0, 1.22, 0.86, 0.25],
  ],
  head: [
    [0, 1.37, 0.92, 0.18],
    [0, 1.28, 1.06, 0.18],
    [0, 1.12, 1.22, 0.14],
    [0, 0.99, 1.32, 0.13],
  ],
  headRound: [0.08, 0.06],
  front: [
    [0.22, 0.95, 0.42, 0.13],
    [0.225, 0.6, 0.44, 0.1],
    [0.225, 0.4, 0.45, 0.08],
    [0.225, 0.22, 0.46, 0.065],
    [0.225, 0.12, 0.47, 0.068],
    [0.225, 0.075, 0.48, 0.065],
  ],
  hind: [
    [0.22, 1.0, -0.5, 0.17],
    [0.225, 0.68, -0.44, 0.12],
    [0.225, 0.45, -0.52, 0.08],
    [0.225, 0.22, -0.5, 0.065],
    [0.225, 0.12, -0.49, 0.068],
    [0.225, 0.075, -0.48, 0.065],
  ],
  tail: [
    [0, 1.38, -0.7, 0.04],
    [0, 1.35, -0.84, 0.032],
    [0, 1.1, -0.9, 0.026],
    [0, 0.7, -0.88, 0.024],
  ],
  widths: [0.8, 0.8, 0.85, 1],
  hoof: { r: 0.08, h: 0.08, color: "#3f3936" },
};

/**
 * Mặt bò lang: đỉnh đầu và quanh hai mắt đen, vệt trắng dọc giữa mặt. Trên khối mềm của đầu (nằm trong mặt phẳng yz):
 * x ảnh = gáy → mõm; y ảnh 0 / 1 = má phải, 0.25 = giữa mặt, 0.5 = má trái, 0.75 = cằm.
 */
const cowFace = (white: string, black: string) =>
  drawTexture(`cow-face:${white}:${black}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = black;
    const marks: [number, number, number, number][] = [
      [0.24, 0.05, 0.27, 0.16],
      [0.22, 0.45, 0.25, 0.14],
      [0.02, 0.25, 0.1, 0.42],
    ];
    for (const [cx, cy, rx, ry] of marks) {
      for (const dy of [-h, 0, h]) {
        ctx.beginPath();
        ctx.ellipse(cx * w, cy * h + dy, rx * w, ry * h, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

/** Bò sữa lang đen trắng: thân hộp tròn, mặt trắng mảng đen quanh mắt, mõm hồng, sừng ngắn, tai ngang, bầu vú, đuôi chùm, chuông vàng */
export const Cow = () => {
  const white = "#f5f2ec";
  const black = "#262626";
  const pink = "#eaa9a3";
  const teats: V2[] = [
    [0.06, -0.24],
    [-0.06, -0.24],
    [0.06, -0.36],
    [-0.06, -0.36],
  ];
  return (
    <Ungulate
      spec={COW}
      coat={{ color: "#ffffff", map: spots(white, black, 11, 7, 0.08, 0.17), finish: "matte" }}
      neckCoat={{ color: "#ffffff", map: spots(white, black, 6, 21, 0.1, 0.2), finish: "matte" }}
      headCoat={{ color: "#ffffff", map: cowFace(white, black), finish: "matte" }}
      legCoat={{ color: white, finish: "matte" }}
      tailCoat={{ color: white, finish: "matte" }}
    >
      {/* Chùm lông cuối đuôi */}
      <Soft pts={[[0, 0.74, -0.88, 0.03], [0, 0.6, -0.875, 0.055]]} round={[0.02, 0.07]} color="#2a2a2a" finish="fur" />
      {/* Bầu vú + núm */}
      <Sphere r={1} position={[0, 0.62, -0.3]} scale={[0.15, 0.12, 0.16]} color={pink} finish="matte" />
      {teats.map(([x, z]) => (
        <Cylinder key={`${x}${z}`} rTop={0.016} rBottom={0.013} h={0.07} position={[x, 0.51, z]} color={pink} finish="matte" seg={12} />
      ))}
      {/* Mõm hồng, lỗ mũi */}
      <Sphere r={1} position={[0, 0.955, 1.35]} scale={[0.16, 0.105, 0.115]} color={pink} finish="matte" />
      <Mirror>
        <Sphere r={1} position={[0.062, 0.97, 1.455]} scale={[0.022, 0.016, 0.012]} color="#3a2a2a" finish="gloss" />
        {/* Sừng cong lên, tai đen chĩa ngang */}
        <Soft
          pts={[
            [0.11, 1.45, 0.93, 0.045],
            [0.2, 1.5, 0.94, 0.035],
            [0.25, 1.58, 0.97, 0.022],
            [0.24, 1.65, 1.0, 0.012],
          ]}
          round={[0, 0.02]}
          radialSeg={14}
          color="#eee3c8"
          finish="ceramic"
        />
        <Ear position={[0.13, 1.36, 0.9]} rotation={[0.2, 0, -1.75]} len={0.21} w={0.058} inner={pink} color={black} finish="matte" />
        <Eye position={[0.145, 1.31, 1.08]} r={0.034} turn={1.1} sclera={white} />
      </Mirror>
      {/* Vòng cổ + chuông */}
      <group position={[0, 1.19, 0.8]} rotation={[-0.3, 0, 0]} scale={[0.8, 1, 1]}>
        <Torus r={0.272} tube={0.022} color="#8a3a2a" finish="fabric" />
      </group>
      <Lathe
        points={[
          [0, 0.7],
          [0.05, 0.705],
          [0.056, 0.72],
          [0.045, 0.76],
          [0.03, 0.8],
          [0.012, 0.818],
          [0, 0.82],
        ]}
        position={[0, 0.105, 0.885]}
        color="#d4a531"
        finish="metal"
      />
    </Ungulate>
  );
};

/* ===== Voi ===== */

/** Voi châu Phi xám: thân to, chân cột, tai lớn xoè, vòi dài cong lên ở mút, ngà trắng, đuôi chùm */
export const Elephant = () => {
  const skin = "#8d9095";
  const coat: SurfaceProps = { color: skin, finish: "matte" };
  // Nếp nhăn vòng: chân thưa và mờ, vòi dày hơn
  const wrinkles = (count: number, shade: string): SurfaceProps => ({ color: "#ffffff", map: stripes(skin, shade, count, true, 0.5), finish: "matte" });
  const feet: V2[] = [
    [0.5, 0.6],
    [-0.5, 0.6],
    [0.5, -0.95],
    [-0.5, -0.95],
  ];
  // Ba móng trước mỗi bàn chân
  const nails = feet.flatMap(([x, z]) =>
    [-0.6, 0, 0.6].map((a): RepeatItem => ({ p: [x + 0.32 * Math.sin(a), 0.075, z + 0.32 * Math.cos(a)], s: [0.075, 0.06, 0.045], r: [0, a, 0] })),
  );
  const ear = smooth([[0, 0.35], [0.3, 0.55], [0.75, 0.48], [1.05, 0.15], [1.1, -0.35], [0.9, -0.85], [0.55, -1.2], [0.25, -1.2], [0.12, -0.85], [0.04, -0.4], [0, 0]]);
  return (
    <group>
      <Soft
        pts={[
          [0, 2.1, -1.2, 0.82],
          [0, 2.12, -0.8, 0.95],
          [0, 2.12, -0.25, 1.0],
          [0, 2.22, 0.3, 1.0],
          [0, 2.32, 0.7, 0.86],
        ]}
        round={[0.42, 0.32]}
        scale={[0.8, 1, 1]}
        seg={64}
        radialSeg={32}
        {...coat}
      />
      <Legs
        front={[
          [0.46, 2.0, 0.5, 0.38],
          [0.48, 1.3, 0.55, 0.33],
          [0.49, 0.7, 0.58, 0.3],
          [0.5, 0.25, 0.6, 0.3],
          [0.5, 0.12, 0.6, 0.32],
        ]}
        hind={[
          [0.44, 2.05, -0.95, 0.42],
          [0.46, 1.35, -0.9, 0.35],
          [0.48, 0.7, -0.95, 0.3],
          [0.5, 0.25, -0.95, 0.3],
          [0.5, 0.12, -0.95, 0.32],
        ]}
        hoof={{ r: 0.345, h: 0.13, color: "#7c7f84" }}
        {...wrinkles(12, "#878a8f")}
      />
      <Repeat at={nails} shape="sphere" size={[1, 1, 1]} seg={14} color="#d9d2c3" finish="ceramic" />
      {/* Đầu + trán gồ */}
      <Sphere r={1} position={[0, 2.8, 1.2]} scale={[0.6, 0.7, 0.6]} {...coat} />
      <Sphere r={1} position={[0, 3.08, 1.3]} scale={[0.44, 0.36, 0.4]} {...coat} />
      {/* Vòi có nếp nhăn vòng */}
      <Soft
        pts={[
          [0, 2.62, 1.55, 0.32],
          [0, 2.25, 1.88, 0.25],
          [0, 1.7, 2.03, 0.2],
          [0, 1.15, 2.07, 0.16],
          [0, 0.68, 2.1, 0.125],
          [0, 0.4, 2.24, 0.1],
          [0, 0.44, 2.45, 0.085],
        ]}
        round={[0, 0.06]}
        seg={64}
        {...wrinkles(24, "#82858a")}
      />
      <Mirror>
        {/* Ngà + bao ngà */}
        <Soft
          pts={[
            [0.32, 2.25, 1.68, 0.075],
            [0.36, 1.9, 1.95, 0.07],
            [0.35, 1.62, 2.25, 0.055],
            [0.29, 1.6, 2.52, 0.03],
          ]}
          round={[0, 0.035]}
          color="#f1e9d6"
          finish="ceramic"
        />
        <Sphere r={0.105} position={[0.31, 2.22, 1.72]} {...coat} />
        {/* Tai xoè */}
        <group position={[0.42, 2.95, 1.05]} rotation={[0.05, 0.5, 0]}>
          <Extrude shape={ear} depth={0.06} bevel={0.025} {...coat} />
        </group>
        <Eye position={[0.52, 2.9, 1.48]} r={0.045} turn={1.0} />
      </Mirror>
      {/* Đuôi + chùm lông */}
      <Soft pts={[[0, 2.55, -1.55, 0.06], [0, 2.3, -1.68, 0.05], [0, 1.8, -1.72, 0.035], [0, 1.45, -1.7, 0.03]]} radialSeg={14} {...coat} />
      <Soft pts={[[0, 1.5, -1.7, 0.03], [0, 1.35, -1.7, 0.055]]} round={[0, 0.1]} color="#2e2e2e" finish="fur" />
    </group>
  );
};

/* ===== Gấu ===== */

/** Gấu nâu đứng bốn chân: thân nặng có bướu vai, chân to, đầu tròn tai tròn, mõm sáng, mũi đen, móng vuốt */
export const Bear = () => {
  const fur = "#6e4a2d";
  const paw = "#4a301b";
  const coat: SurfaceProps = { color: fur, finish: "fur" };
  // [x, z, nửa dài] của bàn chân trước / sau
  const paws: V3[] = [
    [0.27, 0.5, 0.2],
    [-0.27, 0.5, 0.2],
    [0.27, -0.46, 0.22],
    [-0.27, -0.46, 0.22],
  ];
  const claws = paws.flatMap(([x, z, d]) =>
    [-0.075, -0.025, 0.025, 0.075].map((dx): RepeatItem => ({ p: [x + dx, 0.035, z + d * 0.92], s: [0.016, 0.014, 0.035] })),
  );
  return (
    <group>
      {/* Thân: lưng cao nhất ở vai (bướu), thấp dần về mông */}
      <Soft
        pts={[
          [0, 0.78, -0.62, 0.36],
          [0, 0.8, -0.35, 0.41],
          [0, 0.84, -0.05, 0.45],
          [0, 0.9, 0.22, 0.47],
          [0, 0.86, 0.45, 0.38],
        ]}
        round={[0.24, 0.2]}
        scale={[0.9, 1, 1]}
        seg={64}
        radialSeg={32}
        {...coat}
      />
      {/* Bắp vai + mông tròn: chân mọc ra từ khối cơ thay vì cắm vào thân */}
      <Mirror>
        <Sphere r={1} position={[0.2, 0.8, 0.34]} scale={[0.18, 0.3, 0.23]} {...coat} />
        <Sphere r={1} position={[0.19, 0.75, -0.5]} scale={[0.2, 0.32, 0.3]} {...coat} />
      </Mirror>
      <Legs
        front={[
          [0.2, 0.8, 0.36, 0.18],
          [0.26, 0.55, 0.4, 0.165],
          [0.27, 0.3, 0.42, 0.14],
          [0.27, 0.1, 0.44, 0.13],
        ]}
        hind={[
          [0.18, 0.78, -0.52, 0.19],
          [0.24, 0.5, -0.5, 0.18],
          [0.27, 0.28, -0.55, 0.145],
          [0.27, 0.1, -0.5, 0.13],
        ]}
        color="#ffffff"
        map={gradient([fur, fur, "#55381f", paw], false)}
        finish="fur"
      />
      {paws.map(([x, z, d]) => (
        <Sphere key={`${x}${z}`} r={1} position={[x, 0.065, z]} scale={[0.15, 0.075, d]} color={paw} finish="fur" />
      ))}
      <Repeat at={claws} shape="sphere" size={[1, 1, 1]} seg={10} color="#e6dcc5" finish="ceramic" />
      {/* Cổ, đầu tròn, mõm sáng, mũi đen */}
      <Soft pts={[[0, 0.9, 0.45, 0.33], [0, 0.9, 0.7, 0.27]]} scale={[0.9, 1, 1]} {...coat} />
      <Sphere r={1} position={[0, 0.92, 0.82]} scale={[0.27, 0.25, 0.27]} {...coat} />
      <Soft pts={[[0, 0.88, 0.92, 0.13], [0, 0.84, 1.08, 0.1]]} round={[0, 0.07]} scale={[0.95, 1, 1]} color="#a98458" finish="fur" />
      <Sphere r={1} position={[0, 0.87, 1.15]} scale={[0.06, 0.04, 0.04]} color="#1f1f1f" finish="gloss" />
      <Mirror>
        <Sphere r={1} position={[0.17, 1.15, 0.75]} scale={[0.075, 0.075, 0.04]} {...coat} />
        <Sphere r={1} position={[0.17, 1.15, 0.775]} scale={[0.045, 0.045, 0.02]} color="#3e2716" finish="fur" />
        <Eye position={[0.1, 0.985, 1.04]} r={0.03} turn={0.45} />
      </Mirror>
      {/* Đuôi cụt */}
      <Sphere r={0.06} position={[0, 0.95, -0.85]} {...coat} />
    </group>
  );
};

/* ===== Ngựa vằn ===== */

const ZEBRA: UngulateSpec = {
  body: [
    [0, 1.1, -0.55, 0.3],
    [0, 1.08, -0.35, 0.33],
    [0, 1.04, -0.05, 0.345],
    [0, 1.06, 0.2, 0.345],
    [0, 1.12, 0.4, 0.3],
  ],
  bodyRound: [0.15, 0.2],
  neck: [
    [0, 1.16, 0.38, 0.26],
    [0, 1.42, 0.56, 0.22],
    [0, 1.64, 0.7, 0.185],
    [0, 1.8, 0.78, 0.16],
  ],
  head: [
    [0, 1.84, 0.79, 0.13],
    [0, 1.76, 0.92, 0.14],
    [0, 1.6, 1.07, 0.105],
    [0, 1.45, 1.2, 0.095],
  ],
  headRound: [0.08, 0.09],
  front: [
    [0.16, 0.95, 0.34, 0.12],
    [0.165, 0.75, 0.37, 0.095],
    [0.165, 0.56, 0.385, 0.07],
    [0.165, 0.44, 0.395, 0.064],
    [0.165, 0.3, 0.4, 0.05],
    [0.165, 0.18, 0.41, 0.055],
    [0.165, 0.12, 0.425, 0.05],
    [0.165, 0.075, 0.44, 0.047],
  ],
  hind: [
    [0.16, 0.98, -0.5, 0.14],
    [0.165, 0.79, -0.42, 0.12],
    [0.165, 0.62, -0.5, 0.082],
    [0.165, 0.47, -0.57, 0.066],
    [0.165, 0.32, -0.55, 0.05],
    [0.165, 0.18, -0.54, 0.055],
    [0.165, 0.12, -0.52, 0.05],
    [0.165, 0.075, -0.5, 0.047],
  ],
  tail: [
    [0, 1.3, -0.66, 0.035],
    [0, 1.25, -0.84, 0.03],
    [0, 1.0, -0.9, 0.025],
    [0, 0.78, -0.88, 0.022],
  ],
  widths: [0.84, 0.7, 0.76, 1],
  hoof: { r: 0.06, h: 0.08, color: "#2b2725" },
};

const ZEBRA_WHITE = "#f2efe8";
const ZEBRA_BLACK = "#242424";

/** Ngựa vằn: dáng ngựa chắc hơn, sọc đen trắng khắp thân / cổ / chân / mặt, bờm dựng sọc, mõm đen, đuôi chùm đen */
export const Zebra = () => {
  // Sọc vòng quanh từng khối; chân mảnh lượn ít cho khỏi răng cưa
  const coat = (count: number, wobble = 0.55, vertical = true): SurfaceProps => ({
    color: "#ffffff",
    map: stripes(ZEBRA_WHITE, ZEBRA_BLACK, count, vertical, wobble),
    finish: "matte",
  });
  return (
    <Ungulate spec={ZEBRA} coat={coat(13)} neckCoat={coat(8)} headCoat={coat(9)} legCoat={coat(11, 0.2)} tailCoat={{ color: ZEBRA_WHITE, finish: "matte" }}>
      {/* Mông: hai bắp đùi sọc ngang nối với sọc chân */}
      <Mirror>
        <Sphere r={1} position={[0.14, 1.0, -0.5]} scale={[0.155, 0.28, 0.25]} {...coat(9, 0.45, false)} />
      </Mirror>
      {/* Bờm dựng sọc, chùm đuôi đen, mõm đen */}
      <Soft pts={ridge(ZEBRA.neck, 0, 1, 6, -0.03, 0.075)} round={[0.04, 0.06]} scale={[0.32, 1, 1]} {...coat(10)} />
      <Soft pts={[[0, 0.8, -0.88, 0.024], [0, 0.62, -0.87, 0.045]]} round={[0.02, 0.08]} color={ZEBRA_BLACK} finish="fur" />
      <Sphere r={1} position={[0, 1.43, 1.22]} scale={[0.08, 0.085, 0.095]} color="#2a2a2a" finish="matte" />
      <Mirror>
        <Sphere r={1} position={[0.04, 1.42, 1.3]} rotation={[0.6, 0, 0]} scale={[0.013, 0.02, 0.01]} color="#141414" finish="gloss" />
        <Ear
          position={[0.06, 1.92, 0.8]}
          rotation={[0.15, 0, -0.22]}
          len={0.19}
          w={0.055}
          inner="#e8e4dc"
          color="#ffffff"
          map={gradient([ZEBRA_WHITE, ZEBRA_WHITE, ZEBRA_BLACK], false)}
          finish="matte"
        />
        <Eye position={[0.092, 1.78, 0.93]} r={0.028} turn={1.2} />
      </Mirror>
    </Ungulate>
  );
};

/* ===== Hươu cao cổ ===== */

const GIRAFFE: UngulateSpec = {
  body: [
    [0, 1.97, -0.7, 0.32],
    [0, 2.04, -0.44, 0.4],
    [0, 2.14, -0.1, 0.44],
    [0, 2.26, 0.22, 0.45],
    [0, 2.38, 0.46, 0.38],
  ],
  bodyRound: [0.22, 0.2],
  neck: [
    [0, 2.45, 0.4, 0.3],
    [0, 2.95, 0.68, 0.21],
    [0, 3.55, 0.95, 0.16],
    [0, 4.15, 1.17, 0.13],
    [0, 4.45, 1.27, 0.12],
  ],
  head: [
    [0, 4.57, 1.26, 0.14],
    [0, 4.53, 1.43, 0.145],
    [0, 4.4, 1.65, 0.11],
    [0, 4.27, 1.82, 0.1],
  ],
  headRound: [0.09, 0.09],
  front: [
    [0.22, 2.2, 0.36, 0.15],
    [0.23, 1.85, 0.38, 0.115],
    [0.23, 1.45, 0.4, 0.08],
    [0.23, 1.1, 0.41, 0.07],
    [0.23, 0.7, 0.42, 0.055],
    [0.23, 0.25, 0.43, 0.055],
    [0.23, 0.17, 0.44, 0.065],
    [0.23, 0.1, 0.46, 0.06],
  ],
  hind: [
    [0.16, 2.02, -0.57, 0.17],
    [0.22, 1.65, -0.47, 0.135],
    [0.22, 1.3, -0.57, 0.085],
    [0.22, 1.0, -0.68, 0.07],
    [0.22, 0.6, -0.65, 0.055],
    [0.22, 0.25, -0.62, 0.055],
    [0.22, 0.17, -0.61, 0.065],
    [0.22, 0.1, -0.59, 0.06],
  ],
  tail: [
    [0, 2.18, -0.79, 0.045],
    [0, 2.0, -0.96, 0.035],
    [0, 1.6, -1.02, 0.025],
    [0, 1.3, -1.0, 0.02],
  ],
  widths: [0.78, 0.8, 0.75, 1],
  hoof: { r: 0.078, h: 0.1, color: "#3d3129" },
};

/** Hươu cao cổ: cổ và chân rất dài, lưng dốc, da mảng nâu cam viền kem, sừng nhung hai núm, đuôi chùm */
export const Giraffe = () => {
  const coat = patches("#b86b30", "#f1e1c0", 20, 4, 0.028);
  // Chân: mảng da lặp 4 lần dọc ống, nhạt dần về kem ở cẳng chân
  const legs = drawTexture("giraffe-legs", 1024, 256, (ctx, w, h) => {
    for (const i of range(4)) ctx.drawImage(coat.image, (i * w) / 4, 0, w / 4, h);
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0.42, "rgba(241,225,192,0)");
    fade.addColorStop(0.82, "rgba(241,225,192,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
  });
  const tan = "#d9a866";
  return (
    <Ungulate
      spec={GIRAFFE}
      coat={{ color: "#ffffff", map: coat, finish: "matte" }}
      neckCoat={{ color: "#ffffff", map: tiled("giraffe", coat, 2, 1), finish: "matte" }}
      legCoat={{ color: "#ffffff", map: legs, finish: "matte" }}
      headCoat={{ color: tan, finish: "matte" }}
      tailCoat={{ color: tan, finish: "matte" }}
    >
      {/* Bờm ngắn dọc gáy, chùm đuôi, mõm sáng */}
      <Soft pts={ridge(GIRAFFE.neck, 0.05, 1, 7, -0.02, 0.05)} round={[0.04, 0.04]} scale={[0.3, 1, 1]} color="#8a5a2e" finish="fur" />
      <Soft pts={[[0, 1.36, -1.0, 0.022], [0, 1.2, -0.99, 0.045]]} round={[0.02, 0.09]} color="#2f241c" finish="fur" />
      <Sphere r={1} position={[0, 4.26, 1.83]} scale={[0.085, 0.09, 0.1]} color="#e3cfaa" finish="matte" />
      <Mirror>
        {/* Sừng nhung có chóp đen */}
        <Soft pts={[[0.065, 4.64, 1.27, 0.036], [0.08, 4.84, 1.24, 0.03]]} radialSeg={14} color={tan} finish="matte" />
        <Sphere r={0.047} position={[0.082, 4.86, 1.24]} color="#3b2a20" finish="fur" />
        <Ear position={[0.11, 4.62, 1.29]} rotation={[0.3, 0, -1.6]} len={0.21} w={0.052} inner="#f0dcc0" color={tan} finish="matte" />
        <Eye position={[0.11, 4.575, 1.47]} r={0.037} turn={1.0} />
        <Sphere r={1} position={[0.05, 4.28, 1.92]} rotation={[0.6, 0, 0]} scale={[0.013, 0.021, 0.01]} color="#3a2a22" finish="gloss" />
      </Mirror>
    </Ungulate>
  );
};
