// Mô hình 3D nhóm Thiết bị điện tử: laptop, chuột, bàn phím, điện thoại, điều khiển, tivi
import { Box, Cylinder, Extrude, Repeat, Sphere, Surface, Torus, Tube } from "./parts";
import { ellipse, range, roundedRect, type V3 } from "./shapes";
import { screen } from "./textures";

const ALUMINIUM = "#a3a8b0";
const GRAPHITE = "#2e3136";

/** Laptop mở nắp ~105°: thân nhôm, bàn phím, touchpad, màn hình đang sáng */
export const Laptop = () => {
  const keys: V3[] = range(6).flatMap((row) =>
    range(14).map((col): V3 => [-0.1235 + col * 0.019, 0.0172, -0.083 + row * 0.0175]),
  );
  return (
    <group>
      <Box size={[0.32, 0.016, 0.22]} radius={0.006} position={[0, 0.008, 0]} color={ALUMINIUM} finish="metal" />
      <Box size={[0.282, 0.0012, 0.11]} position={[0, 0.0161, -0.04]} color="#1f1f1f" finish="matte" />
      <Repeat at={keys} size={[0.0165, 0.0018, 0.0152]} radius={0.002} color="#3a3d42" finish="matte" />
      <Box size={[0.115, 0.0012, 0.072]} radius={0.0005} position={[0, 0.0162, 0.062]} color="#b8bcc3" finish="metal" />
      {/* Bản lề ở mép sau; nắp ngả ra sau một chút */}
      <group position={[0, 0.016, -0.106]} rotation={[-0.27, 0, 0]}>
        <Box size={[0.32, 0.215, 0.007]} radius={0.003} position={[0, 0.1075, -0.0035]} color={ALUMINIUM} finish="metal" />
        <Box size={[0.312, 0.207, 0.001]} position={[0, 0.1075, 0.0005]} color="#141414" finish="gloss" />
        <mesh position={[0, 0.111, 0.0012]}>
          <planeGeometry args={[0.296, 0.185]} />
          <Surface finish="screen" color="#ffffff" map={screen("desktop")} />
        </mesh>
        <Sphere r={0.0016} position={[0, 0.207, 0.0012]} color="#2a2a2a" finish="gloss" />
      </group>
    </group>
  );
};

/** Chuột không dây: lưng cong (sau cao hơn trước), nút trái / phải, con lăn cam */
export const Mouse = () => (
  <group>
    {/* Nửa trước ngắn, nửa sau dài → đỉnh lưng lệch về sau như chuột thật */}
    <Sphere r={1} phiStart={0} phiLength={Math.PI} thetaLength={Math.PI / 2} scale={[0.031, 0.036, 0.05]} position={[0, 0.004, 0]} color="#f0f0f0" finish="plastic" doubleSide />
    <Sphere r={1} phiStart={Math.PI} phiLength={Math.PI} thetaLength={Math.PI / 2} scale={[0.031, 0.036, 0.066]} position={[0, 0.004, 0]} color="#f0f0f0" finish="plastic" doubleSide />
    <Cylinder r={1} h={1} scale={[0.031, 0.006, 0.05]} position={[0, 0.003, 0]} arcStart={-Math.PI / 2} arc={Math.PI} color="#d9d9d9" finish="matte" />
    <Cylinder r={1} h={1} scale={[0.031, 0.006, 0.066]} position={[0, 0.003, 0]} arcStart={Math.PI / 2} arc={Math.PI} color="#d9d9d9" finish="matte" />
    {/* Khe giữa hai nút chạy theo lưng chuột */}
    <Tube
      path={range(7).map((i): V3 => {
        const z = 0.004 + i * 0.0072;
        return [0, 0.004 + 0.036 * Math.sqrt(1 - (z / 0.05) ** 2), z];
      })}
      r={0.0009}
      color="#9a9a9a"
      finish="matte"
      seg={24}
      radialSeg={6}
    />
    <Cylinder r={0.0058} h={0.0045} rotation={[0, 0, Math.PI / 2]} position={[0, 0.0375, 0.022]} color="#fb8020" finish="rubber" seg={24} />
  </group>
);

/** Bàn phím đầy đủ: đế nghiêng, 5 hàng phím + phím cách, cụm phím số */
export const Keyboard = () => {
  const keys: { p: V3; s?: V3 }[] = [];
  const pitch = 0.019;
  // Hàng phím chữ (5 hàng × 14 phím)
  range(5).forEach((row) =>
    range(14).forEach((col) => keys.push({ p: [-0.205 + col * pitch, 0.0205, -0.042 + row * pitch] })),
  );
  // Hàng cuối: Ctrl / Alt… + phím cách dài
  [-0.205, -0.186, -0.167].forEach((x) => keys.push({ p: [x, 0.0205, 0.053] }));
  keys.push({ p: [-0.0815, 0.0205, 0.053], s: [8.2, 1, 1] });
  [0.0035, 0.0225, 0.0415].forEach((x) => keys.push({ p: [x, 0.0205, 0.053] }));
  // Cụm phím số
  range(5).forEach((row) => range(4).forEach((col) => keys.push({ p: [0.093 + col * pitch, 0.0205, -0.042 + row * pitch] })));
  range(4).forEach((row) => keys.push({ p: [0.093 + 5.6 * pitch, 0.0205, -0.042 + row * pitch * 1.3] }));
  return (
    <group rotation={[0.07, 0, 0]}>
      <Box size={[0.47, 0.018, 0.145]} radius={0.007} position={[0.008, 0.009, 0.004]} color={GRAPHITE} finish="matte" />
      <Repeat at={keys} size={[0.0165, 0.007, 0.0165]} radius={0.0022} color="#3f4349" finish="plastic" />
      {/* Đèn báo */}
      {[0.19, 0.2, 0.21].map((x, i) => (
        <Sphere key={x} r={0.0015} position={[x, 0.0185, -0.058]} color={i === 0 ? "#52c41a" : "#fb8020"} finish="glow" emissiveIntensity={1.2} />
      ))}
    </group>
  );
};

/** Điện thoại thông minh đứng nghiêng: viền kim loại, màn hình bật, cụm camera sau */
export const CellPhone = () => (
  <group rotation={[-0.18, 0, 0]} position={[0, 0.075, 0]}>
    <Box size={[0.072, 0.15, 0.0082]} radius={0.004} color="#3b3f45" finish="metal" />
    <Box size={[0.0695, 0.1475, 0.001]} radius={0.0004} position={[0, 0, 0.0038]} color="#0d0d0d" finish="gloss" />
    <mesh position={[0, -0.0005, 0.0044]}>
      <planeGeometry args={[0.0655, 0.142]} />
      <Surface finish="screen" color="#ffffff" map={screen("phone")} />
    </mesh>
    <Box size={[0.016, 0.0045, 0.0006]} radius={0.0002} position={[0, 0.0665, 0.0048]} color="#050505" finish="gloss" />
    {/* Mặt lưng + cụm camera */}
    <Box size={[0.0695, 0.1475, 0.001]} radius={0.0004} position={[0, 0, -0.0038]} color="#5f6670" finish="gloss" />
    <Box size={[0.028, 0.03, 0.0026]} radius={0.006} position={[-0.0165, 0.0535, -0.0049]} color="#4b5058" finish="gloss" />
    {[
      [-0.0225, 0.06],
      [-0.0105, 0.06],
      [-0.0225, 0.047],
    ].map(([x, y]) => (
      <group key={`${x}${y}`} position={[x, y, -0.0064]} rotation={[Math.PI / 2, 0, 0]}>
        <Cylinder r={0.0047} h={0.0014} color="#1a1a1a" finish="chrome" seg={24} />
        <Cylinder r={0.0028} h={0.0016} color="#0b1a2e" finish="glass" opacity={0.85} seg={24} />
      </group>
    ))}
    {/* Nút bấm bên hông */}
    <Box size={[0.0016, 0.018, 0.003]} radius={0.0007} position={[0.0367, 0.03, 0]} color="#5a5f66" finish="metal" />
    <Box size={[0.0016, 0.012, 0.003]} radius={0.0007} position={[-0.0367, 0.035, 0]} color="#5a5f66" finish="metal" />
  </group>
);

/** Điều khiển từ xa nằm trên bàn: nút nguồn đỏ, vòng điều hướng, bàn số */
export const Remote = () => {
  const numbers: V3[] = range(4).flatMap((row) =>
    range(3).map((col): V3 => [(col - 1) * 0.0135, 0.0217, 0.014 + row * 0.0125]),
  );
  return (
    <group>
      <Extrude
        shape={roundedRect(0.048, 0.19, 0.016)}
        depth={0.016}
        bevel={0.003}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.0095, 0]}
        color="#2b2d31"
        finish="plastic"
      />
      <Cylinder r={0.0055} h={0.003} position={[-0.012, 0.0217, -0.075]} color="#d9363e" finish="plastic" seg={20} />
      <Repeat at={[[0.006, 0.0217, -0.075], [0.016, 0.0217, -0.075]]} size={[0.006, 0.003, 0.004]} radius={0.0012} color="#4b4f56" finish="plastic" />
      <Torus r={0.0125} tube={0.0032} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.0212, -0.045]} color="#4b4f56" finish="plastic" />
      <Cylinder r={0.0068} h={0.0035} position={[0, 0.0217, -0.045]} color="#fb8020" finish="plastic" seg={24} />
      <Repeat at={numbers} size={[0.0095, 0.0032, 0.0082]} radius={0.0018} color="#d9d9d9" finish="plastic" />
      <Repeat at={[[-0.012, 0.0217, -0.018], [0.012, 0.0217, -0.018]]} size={[0.008, 0.0032, 0.014]} radius={0.002} color="#6b7078" finish="plastic" />
    </group>
  );
};

/** Tivi màn phẳng trên chân đế giữa */
export const Tv = () => (
  <group>
    {/* Đế + cổ */}
    <Extrude shape={ellipse(0.2, 0.09, 48)} depth={0.012} bevel={0.004} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0.02]} color="#3a3d42" finish="metal" />
    <Box size={[0.07, 0.16, 0.025]} radius={0.008} position={[0, 0.09, -0.005]} color="#45494f" finish="metal" />
    {/* Màn hình */}
    <group position={[0, 0.5, 0]}>
      <Box size={[1.12, 0.65, 0.035]} radius={0.01} color="#1c1d20" finish="plastic" />
      <Box size={[0.42, 0.3, 0.02]} radius={0.008} position={[0, -0.02, -0.025]} color="#26282c" finish="matte" />
      <mesh position={[0, 0.005, 0.0181]}>
        <planeGeometry args={[1.09, 0.615]} />
        <Surface finish="screen" color="#ffffff" map={screen("desktop")} />
      </mesh>
      <Sphere r={0.004} position={[0.5, -0.316, 0.016]} color="#fb8020" finish="glow" emissiveIntensity={1} />
    </group>
  </group>
);
