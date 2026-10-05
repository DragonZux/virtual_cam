// Mô hình 3D nhóm Đồ gia dụng: lò vi sóng, bếp gas liền lò nướng, máy nướng bánh mì, bồn rửa, tủ lạnh
import { BackSide } from "three";

import {
  Box,
  Capsule,
  Cylinder,
  Extrude,
  Lathe,
  Repeat,
  Sphere,
  Surface,
  Torus,
  Tube,
  type RepeatItem,
} from "./parts";
import { range, roundedRect, SIDES, type V2, type V3 } from "./shapes";
import { label } from "./textures";

const STEEL = "#c3c8ce";
const CHROME = "#d4d8dd";
const BLACK = "#1f1f1f";
const RUBBER = "#2b2b2b";

/** Dời biên dạng 2D (khoét ô kính lệch tâm cửa…) */
const shift = (points: V2[], dx: number, dy: number): V2[] => points.map(([x, y]): V2 => [x + dx, y + dy]);

/** Khoang trong nhìn qua cửa kính: hộp chỉ vẽ mặt trong (BackSide — Surface không có chế độ này), tự sáng nhẹ như đang bật đèn */
const Cavity = ({
  size,
  position,
  color,
  glow,
  intensity,
}: {
  size: V3;
  position: V3;
  color: string;
  glow: string;
  intensity: number;
}) => (
  <mesh position={position}>
    <boxGeometry args={size} />
    <meshStandardMaterial
      side={BackSide}
      color={color}
      emissive={glow}
      emissiveIntensity={intensity}
      roughness={0.55}
      metalness={0.1}
    />
  </mesh>
);

/** Màn hình số nhỏ đang sáng (đồng hồ của lò) */
const Display = ({ text, size, position }: { text: string; size: [number, number]; position: V3 }) => (
  <mesh position={position}>
    <planeGeometry args={size} />
    <Surface
      finish="screen"
      color="#ffffff"
      map={label(text, { bg: "#0b1216", fg: "#5cc8ff", aspect: size[0] / size[1], size: 0.62 })}
      emissiveIntensity={0.8}
    />
  </mesh>
);

/* ===== Lò vi sóng ===== */

/** Lò vi sóng: vỏ inox, cửa đen có ô kính thấy khoang sáng đèn (đĩa xoay + bát canh), bảng phím, núm xoay, tay nắm */
export const Microwave = () => {
  const keys: V3[] = range(4).flatMap((row) =>
    range(3).map((col): V3 => [0.1725 + (col - 1) * 0.034, 0.222 - row * 0.024, 0.1775]),
  );
  const bowl: V2[] = [
    [0, 0],
    [0.032, 0],
    [0.037, 0.005],
    [0.056, 0.033],
    [0.059, 0.05],
    [0.0555, 0.051],
    [0.052, 0.036],
    [0.033, 0.011],
    [0, 0.009],
  ];
  return (
    <group>
      {/* Vỏ: nắp, đáy dày (nâng sàn khoang lên ngang mép ô kính), vách trái, khối điều khiển phải, vách sau — chừa khoang rỗng phía trước */}
      <Box
        size={[0.5, 0.008, 0.36]}
        radius={0.003}
        position={[0, 0.298, -0.01]}
        color={STEEL}
        finish="metal"
      />
      <Box
        size={[0.5, 0.034, 0.36]}
        radius={0.003}
        position={[0, 0.029, -0.01]}
        color={STEEL}
        finish="metal"
      />
      <Box size={[0.008, 0.248, 0.36]} position={[-0.246, 0.17, -0.01]} color={STEEL} finish="metal" />
      <Box size={[0.155, 0.248, 0.36]} position={[0.1725, 0.17, -0.01]} color={STEEL} finish="metal" />
      <Box size={[0.334, 0.248, 0.008]} position={[-0.0745, 0.17, -0.186]} color={STEEL} finish="metal" />
      <Cavity
        size={[0.335, 0.246, 0.349]}
        position={[-0.0735, 0.17, -0.0065]}
        color="#e3ddd0"
        glow="#ffcf7a"
        intensity={0.3}
      />
      {/* Đĩa xoay + bát canh (lệch về trước-trái để nhìn chéo qua ô kính vẫn thấy) */}
      <Cylinder
        r={0.13}
        h={0.005}
        position={[-0.0735, 0.0505, -0.01]}
        color="#f2efe9"
        finish="ceramic"
        seg={48}
      />
      <Lathe points={bowl} position={[-0.11, 0.053, 0.045]} color="#fb8020" finish="ceramic" />
      <Cylinder
        r={0.052}
        h={0.002}
        position={[-0.11, 0.091, 0.045]}
        color="#f3dfb0"
        finish="organic"
        seg={32}
      />
      {/* Cửa: khung đen khoét ô kính lệch trái, tay nắm dọc */}
      <Extrude
        shape={roundedRect(0.341, 0.282, 0.008)}
        holes={[shift(roundedRect(0.255, 0.205, 0.012), -0.02, 0.008)]}
        depth={0.018}
        bevel={0.0015}
        position={[-0.0775, 0.157, 0.179]}
        color={BLACK}
        finish="gloss"
      />
      <mesh position={[-0.0975, 0.165, 0.181]}>
        <planeGeometry args={[0.259, 0.209]} />
        <Surface color="#232a30" finish="glass" opacity={0.45} />
      </mesh>
      <Box
        size={[0.016, 0.2, 0.014]}
        radius={0.006}
        position={[0.0675, 0.157, 0.215]}
        color={STEEL}
        finish="metal"
      />
      <Repeat
        shape="cylinder"
        at={SIDES.map((side): RepeatItem => ({
          p: [0.0675, 0.157 + side * 0.08, 0.2],
          r: [Math.PI / 2, 0, 0],
        }))}
        size={[0.005, 0.025, 0]}
        color={STEEL}
        finish="metal"
      />
      {/* Bảng điều khiển: màn hình giờ, bàn phím số, nút dừng / chạy, núm hẹn giờ */}
      <Box
        size={[0.149, 0.276, 0.006]}
        radius={0.002}
        position={[0.1725, 0.157, 0.173]}
        color="#26282b"
        finish="gloss"
      />
      <Display text="12:00" size={[0.11, 0.03]} position={[0.1725, 0.262, 0.1765]} />
      <Repeat at={keys} size={[0.026, 0.016, 0.005]} radius={0.002} color="#4a4d52" finish="plastic" />
      <Box
        size={[0.044, 0.018, 0.005]}
        radius={0.002}
        position={[0.1495, 0.12, 0.1775]}
        color="#c0392b"
        finish="plastic"
      />
      <Box
        size={[0.044, 0.018, 0.005]}
        radius={0.002}
        position={[0.1955, 0.12, 0.1775]}
        color="#2e9e5a"
        finish="plastic"
      />
      <Cylinder
        r={0.025}
        h={0.014}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0.1725, 0.065, 0.183]}
        color={CHROME}
        finish="metal"
        seg={40}
      />
      <Box size={[0.004, 0.02, 0.003]} position={[0.1725, 0.075, 0.1905]} color={BLACK} finish="matte" />
      {/* Chân cao su */}
      <Repeat
        shape="cylinder"
        at={[
          [-0.21, 0.006, 0.14],
          [0.21, 0.006, 0.14],
          [-0.21, 0.006, -0.15],
          [0.21, 0.006, -0.15],
        ]}
        size={[0.012, 0.012, 0]}
        color={RUBBER}
        finish="rubber"
      />
      {/* Lưng: tấm che liền, hộp quạt nhô ra có khe gió, khe gió hông trái, dây điện + phích */}
      <Box
        size={[0.496, 0.278, 0.004]}
        radius={0.0015}
        position={[0, 0.157, -0.192]}
        color="#aeb3b9"
        finish="metal"
      />
      <Box
        size={[0.3, 0.17, 0.024]}
        radius={0.008}
        position={[0.04, 0.16, -0.204]}
        color="#aeb3b9"
        finish="metal"
      />
      <Repeat
        at={range(2).flatMap((row) =>
          range(11).map((col): V3 => [-0.08 + col * 0.024, 0.19 - row * 0.065, -0.2165]),
        )}
        size={[0.007, 0.05, 0.002]}
        radius={0.0008}
        color="#3a3d41"
        finish="matte"
      />
      <Repeat
        at={range(2).flatMap((row) =>
          range(10).map((col): V3 => [-0.2505, 0.25 - row * 0.05, -0.16 + col * 0.018]),
        )}
        size={[0.002, 0.04, 0.007]}
        radius={0.0008}
        color="#3a3d41"
        finish="matte"
      />
      <Tube
        path={[
          [0.16, 0.09, -0.21],
          [0.16, 0.085, -0.24],
          [0.15, 0.006, -0.262],
          [0.1, 0.004, -0.282],
          [0.04, 0.004, -0.284],
        ]}
        r={0.004}
        color={RUBBER}
        finish="rubber"
        seg={32}
        radialSeg={10}
      />
      <Box
        size={[0.03, 0.018, 0.022]}
        radius={0.003}
        position={[0.026, 0.009, -0.284]}
        color={RUBBER}
        finish="plastic"
      />
    </group>
  );
};

/* ===== Bếp gas liền lò nướng ===== */

/** Bếp gas liền lò nướng: mặt bếp đen 4 họng (một họng đang cháy), kiềng gang, núm vặn, cửa lò kính sáng đèn, ngăn kéo */
export const Oven = () => {
  const burners: { x: number; z: number; s: number }[] = [
    { x: -0.19, z: 0.13, s: 1.15 },
    { x: 0.19, z: 0.13, s: 1 },
    { x: -0.19, z: -0.14, s: 0.9 },
    { x: 0.19, z: -0.14, s: 1 },
  ];
  const at = (y: number) => burners.map(({ x, z, s }): RepeatItem => ({ p: [x, y, z], s: [s, 1, s] }));
  // Kiềng gang: khung đứng trên mặt bếp + các thanh chống nồi chĩa vào từng họng
  const frame: RepeatItem[] = [];
  const arms: RepeatItem[] = [];
  SIDES.forEach((side) => {
    const bar = (x0: number, x1: number, z0: number, z1: number, list: RepeatItem[], y: number, h: number) =>
      list.push({
        p: [(side * (x0 + x1)) / 2, y, (z0 + z1) / 2],
        s: [Math.abs(x1 - x0) || 0.014, h, Math.abs(z1 - z0) || 0.014],
      });
    bar(0.015, 0.375, 0.3, 0.3, frame, 0.9325, 0.035);
    bar(0.015, 0.375, -0.3, -0.3, frame, 0.9325, 0.035);
    bar(0.015, 0.375, -0.005, -0.005, frame, 0.9325, 0.035);
    bar(0.022, 0.022, -0.307, 0.307, frame, 0.9325, 0.035);
    bar(0.368, 0.368, -0.307, 0.307, frame, 0.9325, 0.035);
    for (const z of [0.13, -0.14]) {
      bar(0.029, 0.16, z, z, arms, 0.944, 0.012);
      bar(0.22, 0.361, z, z, arms, 0.944, 0.012);
      bar(0.19, 0.19, z + 0.03, z > 0 ? 0.293 : -0.012, arms, 0.944, 0.012);
      bar(0.19, 0.19, z > 0 ? 0.002 : -0.293, z - 0.03, arms, 0.944, 0.012);
    }
  });
  const knobs = [-0.3, -0.21, -0.12, 0.12, 0.21, 0.3];
  const racks: RepeatItem[] = [0.4, 0.6].flatMap((y) => [
    ...range(12).map((i): RepeatItem => ({
      p: [-0.33 + i * 0.06, y, 0.22],
      s: [1, 0.15, 1],
      r: [Math.PI / 2, 0, 0],
    })),
    { p: [0, y, 0.292], s: [1, 0.7, 1], r: [0, 0, Math.PI / 2] },
  ]);
  const flame = { x: 0.19, z: 0.13 };
  return (
    <group>
      {/* Thân phía sau + chân lùi vào, mặt bếp men đen */}
      <Box size={[0.76, 0.845, 0.46]} position={[0, 0.4725, -0.09]} color={STEEL} finish="metal" />
      <Box size={[0.74, 0.05, 0.56]} position={[0, 0.025, -0.04]} color={RUBBER} finish="matte" />
      <Box size={[0.764, 0.02, 0.644]} radius={0.004} position={[0, 0.905, 0]} color={BLACK} finish="gloss" />
      {/* Phần trước: hai vách hông, dải điều khiển, khoang lò (rỗng), ngăn kéo */}
      {SIDES.map((side) => (
        <Box
          key={side}
          size={[0.012, 0.845, 0.16]}
          position={[side * 0.374, 0.4725, 0.22]}
          color={STEEL}
          finish="metal"
        />
      ))}
      <Box size={[0.736, 0.075, 0.16]} position={[0, 0.8575, 0.22]} color={STEEL} finish="metal" />
      <Box size={[0.736, 0.165, 0.16]} position={[0, 0.1325, 0.22]} color={STEEL} finish="metal" />
      <Cavity
        size={[0.734, 0.603, 0.158]}
        position={[0, 0.5175, 0.22]}
        color="#3a3532"
        glow="#ff8a2a"
        intensity={0.35}
      />
      <Repeat shape="cylinder" at={racks} size={[0.003, 1, 0]} color={CHROME} finish="chrome" seg={8} />
      {/* Cửa lò: khung inox, viền kính đen, ô kính, tay nắm ngang */}
      <Extrude
        shape={roundedRect(0.736, 0.6, 0.012)}
        holes={[roundedRect(0.56, 0.32, 0.02)]}
        depth={0.04}
        bevel={0.002}
        position={[0, 0.518, 0.3225]}
        color={STEEL}
        finish="metal"
      />
      <Extrude
        shape={roundedRect(0.562, 0.322, 0.02)}
        holes={[roundedRect(0.46, 0.24, 0.016)]}
        depth={0.01}
        bevel={0.001}
        position={[0, 0.518, 0.336]}
        color={BLACK}
        finish="gloss"
      />
      <mesh position={[0, 0.518, 0.334]}>
        <planeGeometry args={[0.464, 0.244]} />
        <Surface color="#2a2522" finish="glass" opacity={0.5} />
      </mesh>
      <Cylinder
        r={0.013}
        h={0.64}
        rotation={[0, 0, Math.PI / 2]}
        position={[0, 0.785, 0.39]}
        color={CHROME}
        finish="chrome"
        seg={24}
      />
      <Repeat
        shape="cylinder"
        at={SIDES.map((side): RepeatItem => ({ p: [side * 0.28, 0.785, 0.365], r: [Math.PI / 2, 0, 0] }))}
        size={[0.008, 0.042, 0]}
        color={CHROME}
        finish="chrome"
      />
      {/* Ngăn kéo dưới */}
      <Box
        size={[0.73, 0.15, 0.022]}
        radius={0.004}
        position={[0, 0.135, 0.311]}
        color={STEEL}
        finish="metal"
      />
      <Box
        size={[0.4, 0.012, 0.012]}
        radius={0.004}
        position={[0, 0.19, 0.33]}
        color={CHROME}
        finish="chrome"
      />
      {/* Bảng điều khiển: kính đen, núm vặn có gờ, đồng hồ */}
      <Box
        size={[0.72, 0.062, 0.004]}
        radius={0.002}
        position={[0, 0.8575, 0.302]}
        color={BLACK}
        finish="gloss"
      />
      <Display text="12:30" size={[0.1, 0.032]} position={[0, 0.8575, 0.3045]} />
      <Repeat
        shape="cylinder"
        at={knobs.map((x): RepeatItem => ({ p: [x, 0.8575, 0.3055], r: [Math.PI / 2, 0, 0] }))}
        size={[0.027, 0.003, 0]}
        color={RUBBER}
        finish="plastic"
        seg={32}
      />
      <Repeat
        shape="cylinder"
        at={knobs.map((x): RepeatItem => ({ p: [x, 0.8575, 0.318], r: [Math.PI / 2, 0, 0] }))}
        size={[0.021, 0.028, 0]}
        color={STEEL}
        finish="metal"
        seg={32}
      />
      <Repeat
        at={knobs.map((x, i): RepeatItem => ({ p: [x, 0.8575, 0.334], r: [0, 0, i === 4 ? -1.1 : 0] }))}
        size={[0.007, 0.034, 0.012]}
        radius={0.003}
        color={STEEL}
        finish="metal"
      />
      {/* Bốn họng gas: mâm, đầu đốt, nắp */}
      <Repeat
        shape="cylinder"
        at={at(0.919)}
        size={[0.058, 0.008, 0]}
        color="#3a3a3a"
        finish="metal"
        seg={40}
      />
      <Repeat
        shape="cylinder"
        at={at(0.926)}
        size={[0.042, 0.014, 0]}
        color="#2b2b2b"
        finish="metal"
        seg={40}
      />
      <Repeat
        shape="cylinder"
        at={at(0.936)}
        size={[0.035, 0.006, 0]}
        color="#151515"
        finish="matte"
        seg={40}
      />
      {/* Lửa xanh ở họng trước phải */}
      <Torus
        r={0.046}
        tube={0.003}
        rotation={[Math.PI / 2, 0, 0]}
        position={[flame.x, 0.931, flame.z]}
        color="#4d8dff"
        finish="glow"
      />
      <Repeat
        shape="sphere"
        at={range(18).map((i): RepeatItem => {
          const a = (i / 18) * Math.PI * 2;
          return {
            p: [flame.x + Math.cos(a) * 0.05, 0.937, flame.z + Math.sin(a) * 0.05],
            s: [0.004, 0.011, 0.004],
            r: [0, -a, -0.5],
          };
        })}
        size={[1, 1, 1]}
        color="#6aa8ff"
        finish="glow"
        seg={10}
      />
      <Repeat at={frame} color="#2a2a2a" finish="matte" />
      <Repeat at={arms} color="#2a2a2a" finish="matte" />
      {/* Mặt sau: tấm che có gân dập, khe thoát nhiệt, tem thông số, đầu nối gas */}
      <Box
        size={[0.62, 0.6, 0.004]}
        radius={0.0015}
        position={[0, 0.45, -0.322]}
        color="#b4b9bf"
        finish="metal"
      />
      <Repeat
        at={range(3).map((i): V3 => [0, 0.3 + i * 0.15, -0.3245])}
        size={[0.52, 0.012, 0.003]}
        radius={0.001}
        color="#a7acb2"
        finish="metal"
      />
      <Repeat
        at={range(14).map((i): V3 => [-0.26 + i * 0.04, 0.82, -0.3215])}
        size={[0.012, 0.05, 0.004]}
        radius={0.001}
        color="#3a3d41"
        finish="matte"
      />
      <Box size={[0.09, 0.05, 0.001]} position={[-0.2, 0.68, -0.3245]} color="#f4f4f2" finish="matte" />
      <Cylinder
        r={0.012}
        h={0.035}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0.24, 0.16, -0.338]}
        color="#b8913f"
        finish="metal"
        seg={16}
      />
      <Cylinder
        r={0.016}
        h={0.012}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0.24, 0.16, -0.36]}
        color="#b8913f"
        finish="metal"
        seg={6}
      />
    </group>
  );
};

/* ===== Máy nướng bánh mì ===== */

const TOASTER = "#8ec1dd";

/** Lát bánh mì: đáy vuông, đỉnh phồng tròn rộng hơn thân */
const bread = (w: number, h: number): V2[] => {
  const shoulder = h * 0.72;
  return [
    [-w * 0.44, 0],
    [w * 0.44, 0],
    [w * 0.465, shoulder * 0.55],
    ...range(17).map((i): V2 => {
      const a = (i / 16) * Math.PI;
      return [Math.cos(a) * w * 0.5, shoulder + Math.sin(a) * (h - shoulder)];
    }),
    [-w * 0.465, shoulder * 0.55],
  ];
};

/** Máy nướng bánh mì 2 ngăn: thân xanh pastel bo tròn, đế crôm, hai lát bánh nướng vàng nhô lên, cần gạt, núm chỉnh lửa */
export const Toaster = () => (
  <group>
    <Repeat
      shape="cylinder"
      at={[
        [-0.12, 0.003, 0.065],
        [0.12, 0.003, 0.065],
        [-0.12, 0.003, -0.065],
        [0.12, 0.003, -0.065],
      ]}
      size={[0.009, 0.006, 0]}
      color={RUBBER}
      finish="rubber"
    />
    <Box size={[0.29, 0.016, 0.17]} radius={0.006} position={[0, 0.014, 0]} color={CHROME} finish="chrome" />
    <Box size={[0.28, 0.165, 0.16]} radius={0.035} position={[0, 0.1045, 0]} color={TOASTER} finish="gloss" />
    {/* Hai khe có viền crôm, mỗi khe một lát bánh: vỏ nâu bọc ruột vàng */}
    {SIDES.map((side) => (
      <group key={side}>
        <Box
          size={[0.14, 0.004, 0.026]}
          radius={0.0019}
          position={[0, 0.1865, side * 0.026]}
          color="#141414"
          finish="matte"
        />
        <Extrude
          shape={roundedRect(0.152, 0.036, 0.012)}
          holes={[roundedRect(0.14, 0.026, 0.008)]}
          depth={0.002}
          bevel={0.0008}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.1878, side * 0.026]}
          color={CHROME}
          finish="chrome"
        />
        <group position={[0, side > 0 ? 0.13 : 0.12, side * 0.026]}>
          <Extrude shape={bread(0.112, 0.118)} depth={0.0115} color="#9a5b2c" finish="organic" />
          <Extrude
            shape={shift(bread(0.104, 0.11), 0, 0.004)}
            depth={0.0125}
            color="#dca35c"
            finish="organic"
          />
        </group>
      </group>
    ))}
    {/* Cần gạt bên phải, núm chỉnh độ nướng + hai nút phía trước, khay vụn bên trái */}
    <Box
      size={[0.004, 0.09, 0.014]}
      radius={0.0018}
      position={[0.1405, 0.105, 0]}
      color="#141414"
      finish="matte"
    />
    <Box
      size={[0.026, 0.014, 0.024]}
      radius={0.005}
      position={[0.153, 0.145, 0]}
      color={CHROME}
      finish="chrome"
    />
    <Cylinder
      r={0.014}
      h={0.012}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0.085, 0.085, 0.084]}
      color={CHROME}
      finish="chrome"
      seg={32}
    />
    <Box size={[0.003, 0.009, 0.003]} position={[0.085, 0.093, 0.0905]} color="#141414" finish="matte" />
    <Repeat
      at={[
        [0.085, 0.124, 0.0805],
        [0.085, 0.141, 0.0805],
      ]}
      size={[0.018, 0.009, 0.005]}
      radius={0.002}
      color={CHROME}
      finish="chrome"
    />
    <Box
      size={[0.06, 0.014, 0.003]}
      radius={0.005}
      position={[-0.05, 0.085, 0.0805]}
      color={CHROME}
      finish="chrome"
    />
    <Box
      size={[0.006, 0.01, 0.06]}
      radius={0.002}
      position={[-0.143, 0.032, 0]}
      color={CHROME}
      finish="chrome"
    />
  </group>
);

/* ===== Bồn rửa ===== */

const NAVY = "#33506b";
const QUARTZ = "#ecebe6";
const BRASS = "#b89357";

/** Tủ bồn rửa bếp: mặt đá, chậu inox âm (vành, đáy, lỗ thoát), vòi cổ ngỗng tay gạt, hai cánh tủ xanh than tay nắm đồng */
export const Sink = () => (
  <group>
    {/* Thân tủ rỗng phía trên để chứa chậu: hai vách, lưng, đáy, chân lùi */}
    <Box size={[0.78, 0.09, 0.52]} position={[0, 0.045, -0.03]} color={RUBBER} finish="matte" />
    {SIDES.map((side) => (
      <Box
        key={side}
        size={[0.018, 0.77, 0.58]}
        position={[side * 0.391, 0.475, -0.01]}
        color={NAVY}
        finish="matte"
      />
    ))}
    <Box size={[0.764, 0.77, 0.012]} position={[0, 0.475, -0.294]} color={NAVY} finish="matte" />
    <Box size={[0.764, 0.018, 0.57]} position={[0, 0.099, -0.01]} color={NAVY} finish="matte" />
    {/* Mặt trước: tấm che chậu + hai cánh kiểu shaker có tay nắm */}
    <Box size={[0.784, 0.13, 0.02]} radius={0.003} position={[0, 0.795, 0.29]} color={NAVY} finish="matte" />
    {SIDES.map((side) => (
      <group key={side} position={[side * 0.197, 0.412, 0.29]}>
        <Box size={[0.388, 0.62, 0.02]} radius={0.003} color={NAVY} finish="matte" />
        <Extrude
          shape={roundedRect(0.388, 0.62, 0.003)}
          holes={[roundedRect(0.29, 0.52, 0.004)]}
          depth={0.008}
          bevel={0.0015}
          position={[0, 0, 0.014]}
          color={NAVY}
          finish="matte"
        />
        <Cylinder
          r={0.006}
          h={0.16}
          position={[-side * 0.165, 0.2, 0.048]}
          color={BRASS}
          finish="metal"
          seg={16}
        />
        <Repeat
          shape="cylinder"
          at={SIDES.map((end): RepeatItem => ({
            p: [-side * 0.165, 0.2 + end * 0.065, 0.034],
            r: [Math.PI / 2, 0, 0],
          }))}
          size={[0.004, 0.03, 0]}
          color={BRASS}
          finish="metal"
        />
      </group>
    ))}
    {/* Mặt đá 4 tấm quanh lỗ chậu + gờ chắn sau */}
    <Box size={[0.82, 0.04, 0.12]} position={[0, 0.88, 0.26]} color={QUARTZ} finish="ceramic" />
    <Box size={[0.82, 0.04, 0.13]} position={[0, 0.88, -0.235]} color={QUARTZ} finish="ceramic" />
    {SIDES.map((side) => (
      <Box
        key={side}
        size={[0.13, 0.04, 0.37]}
        position={[side * 0.345, 0.88, 0.015]}
        color={QUARTZ}
        finish="ceramic"
      />
    ))}
    <Box size={[0.82, 0.08, 0.02]} position={[0, 0.94, -0.29]} color={QUARTZ} finish="ceramic" />
    {/* Chậu inox: vành nổi, bốn vách, đáy, lỗ thoát */}
    <Extrude
      shape={roundedRect(0.6, 0.41, 0.03)}
      holes={[roundedRect(0.546, 0.356, 0.02)]}
      depth={0.004}
      bevel={0.001}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.9025, 0.015]}
      color={STEEL}
      finish="metal"
    />
    <Box size={[0.546, 0.2, 0.006]} position={[0, 0.8, 0.19]} color={STEEL} finish="metal" />
    <Box size={[0.546, 0.2, 0.006]} position={[0, 0.8, -0.16]} color={STEEL} finish="metal" />
    {SIDES.map((side) => (
      <Box
        key={side}
        size={[0.006, 0.2, 0.356]}
        position={[side * 0.27, 0.8, 0.015]}
        color={STEEL}
        finish="metal"
      />
    ))}
    <Box size={[0.546, 0.006, 0.356]} position={[0, 0.703, 0.015]} color={STEEL} finish="metal" />
    <Cylinder r={0.038} h={0.003} position={[0, 0.7075, 0.03]} color={CHROME} finish="chrome" seg={32} />
    <Cylinder r={0.028} h={0.003} position={[0, 0.708, 0.03]} color="#2a2a2a" finish="matte" seg={32} />
    <Repeat
      at={[
        { p: [0, 0.7095, 0.03], s: [1, 1, 1] },
        { p: [0, 0.7095, 0.03], s: [1, 1, 1], r: [0, Math.PI / 2, 0] },
      ]}
      size={[0.056, 0.002, 0.004]}
      color={CHROME}
      finish="chrome"
    />
    {/* Vòi cổ ngỗng: đế, thân, cổ cong, đầu vòi, tay gạt */}
    <Cylinder r={0.028} h={0.012} position={[0, 0.906, -0.215]} color={CHROME} finish="chrome" seg={32} />
    <Cylinder
      r={0.019}
      rTop={0.016}
      h={0.09}
      position={[0, 0.955, -0.215]}
      color={CHROME}
      finish="chrome"
      seg={32}
    />
    <Tube
      path={[
        [0, 0.99, -0.215],
        [0, 1.12, -0.215],
        [0, 1.205, -0.19],
        [0, 1.232, -0.12],
        [0, 1.2, -0.058],
        [0, 1.13, -0.035],
      ]}
      r={0.0125}
      color={CHROME}
      finish="chrome"
      seg={64}
      radialSeg={16}
    />
    <Cylinder r={0.0155} h={0.026} position={[0, 1.115, -0.035]} color={CHROME} finish="chrome" seg={24} />
    <Cylinder r={0.011} h={0.0015} position={[0, 1.1015, -0.035]} color="#3a3d41" finish="matte" seg={24} />
    <Sphere r={0.01} position={[0.02, 0.975, -0.215]} color={CHROME} finish="chrome" seg={16} />
    <Capsule
      r={0.0055}
      length={0.065}
      rotation={[0, 0, -1.25]}
      position={[0.052, 0.988, -0.215]}
      color={CHROME}
      finish="chrome"
    />
  </group>
);

/* ===== Tủ lạnh ===== */

const FRIDGE = "#eef0f0";

/** Tủ lạnh hai cửa ngăn đá trên: thân trắng, khe cửa, tay nắm dọc inox, tấm chắn chân; lưng có giàn nóng và máy nén */
export const Refrigerator = () => (
  <group>
    {/* Thân + chân */}
    <Box size={[0.7, 1.73, 0.62]} radius={0.008} position={[0, 0.885, -0.04]} color={FRIDGE} finish="gloss" />
    <Repeat
      shape="cylinder"
      at={[
        [-0.31, 0.01, 0.22],
        [0.31, 0.01, 0.22],
        [-0.31, 0.01, -0.3],
        [0.31, 0.01, -0.3],
      ]}
      size={[0.018, 0.02, 0]}
      color={RUBBER}
      finish="rubber"
    />
    {/* Tấm chắn chân có khe gió */}
    <Box
      size={[0.66, 0.062, 0.012]}
      radius={0.003}
      position={[0, 0.054, 0.273]}
      color="#3a3d41"
      finish="matte"
    />
    <Repeat
      at={range(16).map((i): V3 => [-0.285 + i * 0.038, 0.054, 0.2795])}
      size={[0.024, 0.03, 0.002]}
      radius={0.001}
      color="#1f2124"
      finish="matte"
    />
    {/* Cửa ngăn đá + cửa ngăn mát, gioăng tối ở khe giữa */}
    <Box size={[0.7, 0.51, 0.06]} radius={0.014} position={[0, 1.487, 0.3]} color={FRIDGE} finish="gloss" />
    <Box size={[0.7, 1.13, 0.06]} radius={0.014} position={[0, 0.655, 0.3]} color={FRIDGE} finish="gloss" />
    <Box size={[0.69, 0.012, 0.012]} position={[0, 1.226, 0.276]} color="#2b2d30" finish="rubber" />
    {/* Tay nắm dọc bên phải mỗi cửa */}
    <Box size={[0.028, 0.26, 0.03]} radius={0.01} position={[0.3, 1.4, 0.374]} color={STEEL} finish="metal" />
    <Box size={[0.028, 0.4, 0.03]} radius={0.01} position={[0.3, 1.0, 0.374]} color={STEEL} finish="metal" />
    <Repeat
      shape="cylinder"
      at={[1.29, 1.51, 0.83, 1.17].map((y): RepeatItem => ({ p: [0.3, y, 0.345], r: [Math.PI / 2, 0, 0] }))}
      size={[0.009, 0.03, 0]}
      color={STEEL}
      finish="metal"
    />
    <Box
      size={[0.07, 0.014, 0.003]}
      radius={0.002}
      position={[-0.25, 1.69, 0.3315]}
      color={STEEL}
      finish="metal"
    />
    {/* Lưng: tấm tối, giàn nóng (ống dọc + dây ngang), máy nén, ống đồng */}
    <Box size={[0.66, 1.5, 0.004]} position={[0, 0.95, -0.352]} color="#6b6f75" finish="matte" />
    <Repeat
      shape="cylinder"
      at={range(15).map((i): V3 => [-0.28 + i * 0.04, 0.98, -0.372])}
      size={[0.005, 1.0, 0]}
      color={RUBBER}
      finish="metal"
      seg={10}
    />
    <Repeat
      shape="cylinder"
      at={range(26).map((i): RepeatItem => ({ p: [0, 0.49 + i * 0.039, -0.379], r: [0, 0, Math.PI / 2] }))}
      size={[0.0018, 0.6, 0]}
      color={RUBBER}
      finish="metal"
      seg={6}
    />
    {SIDES.map((side) => (
      <Box
        key={side}
        size={[0.03, 1.05, 0.024]}
        position={[side * 0.31, 0.98, -0.363]}
        color="#3a3d41"
        finish="metal"
      />
    ))}
    <Sphere
      r={1}
      scale={[0.09, 0.075, 0.07]}
      position={[0.16, 0.13, -0.36]}
      color={RUBBER}
      finish="gloss"
      seg={32}
    />
    <Tube
      path={[
        [0.16, 0.2, -0.37],
        [0.1, 0.32, -0.38],
        [0, 0.42, -0.375],
        [-0.28, 0.48, -0.372],
      ]}
      r={0.005}
      color="#b87333"
      finish="metal"
      seg={32}
      radialSeg={10}
    />
  </group>
);
