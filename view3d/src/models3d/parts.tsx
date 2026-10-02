// Linh kiện dựng mô hình 3D bằng hình khối three.js — không tải file, chạy offline.
// Quy ước mọi mô hình: đơn vị ~ mét theo kích thước thật, trục y hướng lên, mặt trước hướng +z,
// vật đặt trên mặt y = 0, căn giữa x / z (FitToView vẫn tự co giãn và đặt lại vật lên bệ).
import { RoundedBox } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  FrontSide,
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { V2, V3 } from "./shapes";

/* ===== Bề mặt ===== */

/** Kiểu bề mặt dùng chung để mọi mô hình đồng bộ độ bóng / kim loại */
export type Finish =
  | "plastic" // nhựa bóng vừa
  | "gloss" // sơn bóng (thân xe, đồ gia dụng)
  | "matte" // nhựa / sơn mờ
  | "metal" // kim loại xước
  | "chrome" // kim loại bóng như gương
  | "rubber" // cao su, lốp xe
  | "fabric" // vải, nỉ, da mềm
  | "fur" // lông thú, bông
  | "wood" // gỗ
  | "ceramic" // sứ, men
  | "organic" // vỏ trái cây, rau, bánh
  | "glass" // thuỷ tinh trong
  | "screen" // màn hình đang sáng (dùng với map)
  | "glow"; // đèn phát sáng

const FINISHES: Record<
  Exclude<Finish, "glass" | "screen" | "glow">,
  { roughness: number; metalness: number; clearcoat?: number }
> = {
  plastic: { roughness: 0.38, metalness: 0 },
  gloss: { roughness: 0.3, metalness: 0.1, clearcoat: 1 },
  matte: { roughness: 0.82, metalness: 0 },
  metal: { roughness: 0.32, metalness: 0.9 },
  chrome: { roughness: 0.1, metalness: 1 },
  rubber: { roughness: 0.92, metalness: 0 },
  fabric: { roughness: 0.96, metalness: 0 },
  fur: { roughness: 1, metalness: 0 },
  wood: { roughness: 0.62, metalness: 0 },
  ceramic: { roughness: 0.16, metalness: 0, clearcoat: 0.6 },
  organic: { roughness: 0.45, metalness: 0, clearcoat: 0.25 },
};

export interface SurfaceProps {
  /** Màu chính; có map thì để trắng (map nhân với màu) */
  color?: string;
  finish?: Finish;
  /** Ảnh bề mặt vẽ bằng canvas (textures.ts) */
  map?: Texture | null;
  /** < 1 = trong suốt */
  opacity?: number;
  /** Vẽ cả hai mặt: mặt phẳng, hình hở (lá, cánh, vải mỏng) */
  doubleSide?: boolean;
  /** Mặt phẳng từng tam giác, kiểu low-poly */
  flat?: boolean;
  /** Màu tự phát sáng thêm (đèn báo, màn hình nhỏ) */
  emissive?: string;
  emissiveIntensity?: number;
}

/** Vật liệu theo kiểu bề mặt — đặt làm con của <mesh> */
export const Surface = ({
  color = "#d9d9d9",
  finish = "plastic",
  map = null,
  opacity = 1,
  doubleSide = false,
  flat = false,
  emissive,
  emissiveIntensity,
}: SurfaceProps) => {
  const side = doubleSide ? DoubleSide : FrontSide;
  if (finish === "glass") {
    // Kính giả bằng độ trong suốt + phản chiếu môi trường: rẻ, không cần lượt vẽ transmission
    return (
      <meshPhysicalMaterial
        color={color}
        roughness={0.05}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.05}
        transparent
        opacity={opacity < 1 ? opacity : 0.32}
        depthWrite={false}
        envMapIntensity={1.6}
        side={side}
      />
    );
  }
  if (finish === "screen") {
    return (
      <meshStandardMaterial
        color={color}
        map={map}
        emissive="#ffffff"
        emissiveMap={map}
        emissiveIntensity={emissiveIntensity ?? 0.55}
        roughness={0.18}
        metalness={0.05}
        side={side}
      />
    );
  }
  if (finish === "glow") {
    return (
      <meshStandardMaterial
        color={color}
        emissive={emissive ?? color}
        emissiveIntensity={emissiveIntensity ?? 1.6}
        toneMapped={false}
        side={side}
      />
    );
  }
  const { roughness, metalness, clearcoat } = FINISHES[finish];
  const common = {
    color,
    map,
    roughness,
    metalness,
    transparent: opacity < 1,
    opacity,
    side,
    flatShading: flat,
    emissive: emissive ?? "#000000",
    emissiveIntensity: emissiveIntensity ?? 1,
  };
  return clearcoat ? (
    <meshPhysicalMaterial {...common} clearcoat={clearcoat} clearcoatRoughness={0.18} />
  ) : (
    <meshStandardMaterial {...common} />
  );
};

/* ===== Hình khối ===== */

export interface PartProps extends SurfaceProps {
  position?: V3;
  rotation?: V3;
  scale?: V3 | number;
}

const split = ({ position, rotation, scale, ...surface }: PartProps) => ({
  transform: { position, rotation, scale },
  surface,
});

/** Giải phóng geometry tự tạo khi đổi tham số / gỡ mô hình */
const useDisposable = <T extends BufferGeometry>(geometry: T): T => {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
};

/** Một bản sao trong Repeat: vị trí, hoặc { p: vị trí, s: co giãn, r: xoay } */
export type RepeatItem = V3 | { p: V3; s?: V3; r?: V3 };

/**
 * Nhiều khối giống nhau (phím bấm, nút, cửa sổ xe, chân ghế, hạt…) vẽ gộp một lần bằng InstancedMesh.
 * shape: "box" (size, radius bo cạnh) | "cylinder" (size = [bán kính, cao, _]) | "sphere" (size = [bán kính, _, _]).
 */
export const Repeat = ({
  at,
  shape = "box",
  size = [1, 1, 1],
  radius = 0,
  seg = 16,
  ...surface
}: SurfaceProps & { at: RepeatItem[]; shape?: "box" | "cylinder" | "sphere"; size?: V3; radius?: number; seg?: number }) => {
  const ref = useRef<InstancedMesh>(null);
  const sig = JSON.stringify([shape, size, radius, seg]);
  const geometry = useDisposable(
    useMemo(() => {
      const [kind, [x, y, z], r, segments] = JSON.parse(sig) as ["box" | "cylinder" | "sphere", V3, number, number];
      if (kind === "cylinder") return new CylinderGeometry(x, x, y, segments);
      if (kind === "sphere") return new SphereGeometry(x, segments, Math.max(6, Math.round(segments * 0.75)));
      return r > 0 ? new RoundedBoxGeometry(x, y, z, 2, Math.min(r, Math.min(x, y, z) / 2 - 1e-4)) : new BoxGeometry(x, y, z);
    }, [sig]),
  );
  const atSig = JSON.stringify(at);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const items = JSON.parse(atSig) as RepeatItem[];
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const euler = new Euler();
    const scale = new Vector3();
    items.forEach((item, i) => {
      const { p, s = [1, 1, 1], r = [0, 0, 0] } = Array.isArray(item) ? { p: item } : item;
      matrix.compose(position.set(...p), rotation.setFromEuler(euler.set(...r)), scale.set(...s));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [atSig, geometry]);
  return (
    <instancedMesh key={at.length} ref={ref} args={[geometry, undefined, at.length]}>
      <Surface {...surface} />
    </instancedMesh>
  );
};

/** Hộp size = [rộng x, cao y, sâu z]; radius > 0 = bo tròn cạnh */
export const Box = ({ size = [1, 1, 1], radius = 0, ...props }: PartProps & { size?: V3; radius?: number }) => {
  const { transform, surface } = split(props);
  const r = Math.min(radius, Math.min(...size) / 2 - 1e-3);
  return r > 0 ? (
    <RoundedBox args={size} radius={r} smoothness={4} {...transform}>
      <Surface {...surface} />
    </RoundedBox>
  ) : (
    <mesh {...transform}>
      <boxGeometry args={size} />
      <Surface {...surface} />
    </mesh>
  );
};

/** Trụ đứng theo trục y, tâm ở giữa chiều cao; rTop / rBottom khác nhau = trụ côn; open = không nắp */
export const Cylinder = ({
  r = 0.5,
  rTop,
  rBottom,
  h = 1,
  seg = 32,
  open = false,
  arcStart = 0,
  arc = Math.PI * 2,
  ...props
}: PartProps & {
  r?: number;
  rTop?: number;
  rBottom?: number;
  h?: number;
  seg?: number;
  open?: boolean;
  arcStart?: number;
  arc?: number;
}) => {
  const { transform, surface } = split(props);
  return (
    <mesh {...transform}>
      <cylinderGeometry args={[rTop ?? r, rBottom ?? r, h, seg, 1, open, arcStart, arc]} />
      <Surface {...surface} />
    </mesh>
  );
};

/** Cầu (hoặc một phần cầu theo phi / theta) */
export const Sphere = ({
  r = 0.5,
  seg = 32,
  phiStart = 0,
  phiLength = Math.PI * 2,
  thetaStart = 0,
  thetaLength = Math.PI,
  ...props
}: PartProps & {
  r?: number;
  seg?: number;
  phiStart?: number;
  phiLength?: number;
  thetaStart?: number;
  thetaLength?: number;
}) => {
  const { transform, surface } = split(props);
  return (
    <mesh {...transform}>
      <sphereGeometry
        args={[r, seg, Math.max(8, Math.round(seg * 0.75)), phiStart, phiLength, thetaStart, thetaLength]}
      />
      <Surface {...surface} />
    </mesh>
  );
};

/** Vòng xuyến nằm trong mặt phẳng xy (xoay [π/2, 0, 0] để nằm ngang); arc < 2π = cung */
export const Torus = ({
  r = 0.5,
  tube = 0.1,
  arc = Math.PI * 2,
  seg = 48,
  radialSeg = 16,
  ...props
}: PartProps & { r?: number; tube?: number; arc?: number; seg?: number; radialSeg?: number }) => {
  const { transform, surface } = split(props);
  return (
    <mesh {...transform}>
      <torusGeometry args={[r, tube, radialSeg, seg, arc]} />
      <Surface {...surface} />
    </mesh>
  );
};

/** Nón đứng theo trục y, đỉnh hướng +y, tâm ở giữa chiều cao */
export const Cone = ({
  r = 0.5,
  h = 1,
  seg = 32,
  open = false,
  ...props
}: PartProps & { r?: number; h?: number; seg?: number; open?: boolean }) => {
  const { transform, surface } = split(props);
  return (
    <mesh {...transform}>
      <coneGeometry args={[r, h, seg, 1, open]} />
      <Surface {...surface} />
    </mesh>
  );
};

/** Viên nhộng theo trục y: length là phần thân thẳng (tổng cao = length + 2r) */
export const Capsule = ({
  r = 0.2,
  length = 0.6,
  seg = 24,
  ...props
}: PartProps & { r?: number; length?: number; seg?: number }) => {
  const { transform, surface } = split(props);
  return (
    <mesh {...transform}>
      <capsuleGeometry args={[r, length, 8, seg]} />
      <Surface {...surface} />
    </mesh>
  );
};

/** Hình tròn xoay quanh trục y từ biên dạng [bán kính, độ cao] đi từ dưới lên (chai, cốc, bình, trái cây…) */
export const Lathe = ({ points, seg = 48, ...props }: PartProps & { points: V2[]; seg?: number }) => {
  const { transform, surface } = split(props);
  const sig = JSON.stringify([points, seg]);
  const geometry = useDisposable(
    useMemo(() => {
      const [profile, segments] = JSON.parse(sig) as [V2[], number];
      // Bán kính 0 ở hai đầu bị three.js coi là suy biến → giữ tối thiểu một chút để pháp tuyến không lỗi
      return new LatheGeometry(
        profile.map(([x, y]) => new Vector2(Math.max(x, 1e-4), y)),
        segments,
      );
    }, [sig]),
  );
  return (
    <mesh geometry={geometry} {...transform}>
      <Surface doubleSide {...surface} />
    </mesh>
  );
};

/**
 * Ống tròn chạy qua các điểm path (đường cong mượt): quai, dây, khung xe, chuối, vòi…
 * taper = hệ số bán kính đặt đều dọc ống (vd. [0.3, 1, 1, 0.5]); caps = bịt hai đầu bằng nửa cầu.
 */
export const Tube = ({
  path,
  r = 0.05,
  taper,
  seg = 64,
  radialSeg = 16,
  closed = false,
  caps = true,
  ...props
}: PartProps & {
  path: V3[];
  r?: number;
  taper?: number[];
  seg?: number;
  radialSeg?: number;
  closed?: boolean;
  caps?: boolean;
}) => {
  const { transform, surface } = split(props);
  const sig = JSON.stringify([path, r, taper ?? null, seg, radialSeg, closed]);
  const { geometry, ends } = useMemo(() => {
    const [points, radius, factors, segments, radial, loop] = JSON.parse(sig) as [
      V3[],
      number,
      number[] | null,
      number,
      number,
      boolean,
    ];
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(...p)),
      loop,
      "catmullrom",
      0.5,
    );
    const tube = new TubeGeometry(curve, segments, radius, radial, loop);
    const scaleAt = (t: number) => {
      if (!factors?.length) return 1;
      if (factors.length === 1) return factors[0];
      const x = t * (factors.length - 1);
      const i = Math.min(factors.length - 2, Math.floor(x));
      return factors[i] + (factors[i + 1] - factors[i]) * (x - i);
    };
    if (factors?.length) {
      const pos = tube.attributes.position;
      const center = new Vector3();
      const v = new Vector3();
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        curve.getPointAt(t, center);
        const k = scaleAt(t);
        for (let j = 0; j <= radial; j++) {
          const index = i * (radial + 1) + j;
          v.fromBufferAttribute(pos, index).sub(center).multiplyScalar(k).add(center);
          pos.setXYZ(index, v.x, v.y, v.z);
        }
      }
      pos.needsUpdate = true;
      tube.computeBoundingSphere();
    }
    return {
      geometry: tube,
      ends: [0, 1].map((t) => ({ p: curve.getPointAt(t).toArray() as V3, r: radius * scaleAt(t) })),
    };
  }, [sig]);
  useDisposable(geometry);
  return (
    <group {...transform}>
      <mesh geometry={geometry}>
        <Surface {...surface} />
      </mesh>
      {caps &&
        !closed &&
        ends.map(
          (end, i) =>
            end.r > 1e-3 && (
              <mesh key={i} position={end.p}>
                <sphereGeometry args={[end.r, radialSeg, Math.max(6, radialSeg / 2)]} />
                <Surface {...surface} />
              </mesh>
            ),
        )}
    </group>
  );
};

/**
 * Hình phẳng đùn dày: biên dạng [x, y] trong mặt phẳng xy, đùn theo z và căn giữa độ dày
 * (biển báo, lưỡi dao / kéo, lá, đế, vợt…). holes = các lỗ khoét; bevel > 0 = vát mép.
 */
export const Extrude = ({
  shape,
  holes,
  depth = 0.1,
  bevel = 0,
  curveSeg = 12,
  ...props
}: PartProps & { shape: V2[]; holes?: V2[][]; depth?: number; bevel?: number; curveSeg?: number }) => {
  const { transform, surface } = split(props);
  const sig = JSON.stringify([shape, holes ?? [], depth, bevel, curveSeg]);
  const geometry = useDisposable(
    useMemo(() => {
      const [outline, cuts, d, b, curves] = JSON.parse(sig) as [V2[], V2[][], number, number, number];
      const s = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
      s.holes = cuts.map((hole) => new Path(hole.map(([x, y]) => new Vector2(x, y))));
      const g = new ExtrudeGeometry(s, {
        depth: d,
        bevelEnabled: b > 0,
        bevelSize: b,
        bevelThickness: b,
        bevelSegments: 3,
        curveSegments: curves,
      });
      g.translate(0, 0, -d / 2);
      return g;
    }, [sig]),
  );
  return (
    <mesh geometry={geometry} {...transform}>
      <Surface {...surface} />
    </mesh>
  );
};
