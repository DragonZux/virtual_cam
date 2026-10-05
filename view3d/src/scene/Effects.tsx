import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";

import { BRAND } from "@/theme/antdTheme";

/** Vòng sáng lan ra trên bệ mỗi lần camera chọn vật thể mới (cha đổi key = chạy lại) */
export const SelectionPulse = () => {
  const ring = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const startedAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!ring.current || !material.current) return;
    startedAt.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - startedAt.current) / 1.4);
    ring.current.scale.setScalar(0.6 + t * 1.5);
    material.current.opacity = 0.7 * (1 - t) ** 1.5;
    ring.current.visible = t < 1;
  });

  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
      <ringGeometry args={[0.95, 1, 96]} />
      <meshBasicMaterial ref={material} color={BRAND.primary} transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

/** Bệ tròn dưới vật: đĩa trắng mờ + viền cam (bóng đổ vẽ đè lên ở mặt y = 0) */
export const Pedestal = () => (
  <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
      <circleGeometry args={[1.5, 96]} />
      <meshStandardMaterial color="#ffffff" roughness={0.85} transparent opacity={0.7} depthWrite={false} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
      <ringGeometry args={[1.47, 1.5, 128]} />
      <meshBasicMaterial color={BRAND.primary} transparent opacity={0.6} toneMapped={false} depthWrite={false} />
    </mesh>
  </group>
);

/** Chưa có vật thể: khối đa diện khung lưới lơ lửng, xoay chậm */
export const IdleMarker = () => {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.45;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.25;
    ref.current.position.y = 1 + Math.sin(clock.elapsedTime * 1.3) * 0.07;
  });

  return (
    <group ref={ref} position={[0, 1, 0]}>
      <mesh>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color={BRAND.primary} wireframe transparent opacity={0.75} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color={BRAND.softStrong} roughness={0.35} flatShading />
      </mesh>
    </group>
  );
};

/** Đang tải file GLB: khối bát diện xoay nhanh */
export const LoadingMarker = () => {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 2.5;
  });
  return (
    <mesh ref={ref} position={[0, 0.6, 0]}>
      <octahedronGeometry args={[0.35, 0]} />
      <meshStandardMaterial color={BRAND.primary} wireframe />
    </mesh>
  );
};
