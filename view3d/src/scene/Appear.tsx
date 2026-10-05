import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { Group } from "three";

const DURATION = 0.8;

/** Phóng to vượt nhẹ rồi về đúng cỡ */
const easeOutBack = (t: number) => {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Vật mới hiện lên: bật từ nhỏ ra kèm nửa vòng xoay (cha đổi key = chạy lại) */
export const Appear = ({ children }: { children: ReactNode }) => {
  const ref = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    startedAt.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - startedAt.current) / DURATION);
    group.scale.setScalar(Math.max(1e-3, easeOutBack(t)));
    group.rotation.y = -1.1 * (1 - t) ** 3;
  });

  return (
    <group ref={ref} scale={1e-3}>
      {children}
    </group>
  );
};
