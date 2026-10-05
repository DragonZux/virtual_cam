import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import type { Vector3 } from "three";

import type { CustomModel } from "@/common/types";
import { BRAND } from "@/theme/antdTheme";
import { CameraRig, type Focus } from "./CameraRig";
import { IdleMarker, Pedestal, SelectionPulse } from "./Effects";
import { ObjectView } from "./ObjectView";

interface Props {
  /** Tên lớp đang hiện; null = chưa có vật thể */
  name: string | null;
  /** File GLB riêng của lớp đang hiện, nếu có */
  custom?: CustomModel;
  autoRotate: boolean;
  /** Đổi giá trị = phát vòng sáng "vừa chọn" */
  pulse: number;
  /** File GLB riêng không mở được (đã tự dùng mô hình dựng sẵn) */
  onCustomError?: (url: string) => void;
  className?: string;
}

/** Ánh sáng studio: đèn chính + đèn viền ấm + môi trường dựng từ tấm sáng (không tải ảnh HDR từ CDN) */
const Lighting = () => (
  <>
    <ambientLight intensity={0.22} />
    <hemisphereLight args={["#ffffff", "#d9d9d9", 0.4]} />
    <directionalLight position={[4, 7, 5]} intensity={1.5} />
    <directionalLight position={[-5, 3, -3]} intensity={0.45} color={BRAND.softStrong} />
    <Environment resolution={256} frames={1} environmentIntensity={0.85}>
      {/* Nền xám sáng: kim loại / inox phản chiếu ra màu studio thay vì đen */}
      <color attach="background" args={["#9c9c9c"]} />
      <Lightformer form="rect" intensity={2.2} position={[0, 5, -5]} scale={[10, 3, 1]} />
      <Lightformer form="rect" intensity={1.3} position={[-5, 1.5, 2]} rotation-y={Math.PI / 2} scale={[8, 2.5, 1]} />
      <Lightformer form="rect" intensity={0.9} position={[5, 2.5, 3]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
      <Lightformer form="ring" intensity={0.8} color={BRAND.primary} position={[2, 4, 6]} scale={2.5} />
    </Environment>
  </>
);

/** Sân khấu 3D: vật trên bệ tròn, bóng đổ mềm, kéo để xoay, cuộn để phóng to */
export const Stage = ({ name, custom, autoRotate, pulse, onCustomError, className }: Props) => {
  const focus = useRef<Focus>({ height: 1.7, version: 0 });
  const onFit = useCallback((size: Vector3) => {
    focus.current = { height: size.y, version: focus.current.version + 1 };
  }, []);

  useEffect(() => {
    // Khối chờ lơ lửng quanh y = 1: nhìn thấp hơn một chút để thấy cả bệ
    if (!name) focus.current = { height: 1.7, version: focus.current.version + 1 };
  }, [name]);

  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      camera={{ position: [3, 1.9, 3.9], fov: 35, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Lighting />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={2.2}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.06}
        autoRotate={autoRotate}
        autoRotateSpeed={2.2}
        target={[0, 0.8, 0]}
      />
      <CameraRig focus={focus} />
      {name ? (
        <ObjectView key={`${name}|${custom?.url ?? ""}`} name={name} custom={custom} onFit={onFit} onCustomError={onCustomError} />
      ) : (
        <IdleMarker />
      )}
      {pulse > 0 && <SelectionPulse key={pulse} />}
      <Pedestal />
      <ContactShadows position={[0, 0, 0]} scale={5} blur={2.4} far={2.5} opacity={0.5} resolution={512} color="#3d3d3d" />
    </Canvas>
  );
};
