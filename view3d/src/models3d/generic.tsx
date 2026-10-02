import { Box, Sphere, Torus } from "./parts";
import { label } from "./textures";

/** Lớp chưa có mô hình (mô hình YOLO riêng của bạn…): hộp quà bọc nhãn tên vật thể */
export const GenericObject = ({ name }: { name: string }) => {
  const tag = label(name, { bg: "#fafafa", fg: "#333333", aspect: 2.4, size: 0.46, border: "#fb8020" });
  return (
    <group>
      <Box size={[0.6, 0.46, 0.46]} radius={0.04} position={[0, 0.23, 0]} color="#f2f2f2" finish="matte" />
      {/* Dải băng cam quấn quanh hộp */}
      <Box size={[0.62, 0.47, 0.08]} position={[0, 0.235, 0]} color="#fb8020" finish="plastic" />
      <Box size={[0.08, 0.47, 0.47]} position={[0.18, 0.235, 0]} color="#fb8020" finish="plastic" />
      {/* Nhãn tên phía trước */}
      <mesh position={[-0.07, 0.23, 0.2325]}>
        <planeGeometry args={[0.36, 0.15]} />
        <meshStandardMaterial map={tag} roughness={0.6} />
      </mesh>
      {/* Nơ trên nắp */}
      <Torus r={0.07} tube={0.022} position={[0.13, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} color="#fb8020" />
      <Torus r={0.07} tube={0.022} position={[0.23, 0.5, 0]} rotation={[0, -Math.PI / 4, 0]} color="#fb8020" />
      <Sphere r={0.035} position={[0.18, 0.48, 0]} color="#f36c00" />
    </group>
  );
};
