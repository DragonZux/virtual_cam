import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Vector3, type PerspectiveCamera } from "three";

import { FIT_RADIUS } from "./FitToView";

/** Vật đang hiện: chiều cao sau khi co giãn; version tăng mỗi lần đổi vật */
export interface Focus {
  height: number;
  version: number;
}

/** Phần của OrbitControls (drei, makeDefault) mà rig dùng */
type Controls = { target: Vector3; update: () => void };

/** Khoảng trống quanh vật so với bán kính hộp bao */
const MARGIN = 1.5;
/** Canh lại camera trong bấy nhiêu giây sau khi đổi vật / đổi cỡ khung, sau đó để người xem tự xoay / phóng */
const SETTLE_SECONDS = 1.4;

/** Đưa camera nhìn vào giữa vật và lùi đủ xa để vật vừa khung (cả màn hình dọc của điện thoại) */
export const CameraRig = ({ focus }: { focus: RefObject<Focus> }) => {
  const controls = useThree((state) => state.controls) as unknown as Controls | null;
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const settle = useRef({ until: 0, version: -1, aspect: 0 });
  const offset = useRef(new Vector3());

  // Màn hình hẹp: thẻ vật thể nằm dưới đáy (viewer.module.less @tablet) → đẩy hình lên cho khỏi bị che
  useEffect(() => {
    const lift = size.width < 992 ? Math.min(0.2, 150 / Math.max(1, size.height)) : 0;
    if (lift) camera.setViewOffset(size.width, size.height, 0, size.height * lift, size.width, size.height);
    else camera.clearViewOffset();
  }, [camera, size]);

  useFrame(({ clock }, delta) => {
    if (!controls) return;
    const now = clock.elapsedTime;
    const aspect = size.width / Math.max(1, size.height);
    const s = settle.current;
    if (s.version !== focus.current.version || Math.abs(s.aspect - aspect) > 0.01) {
      s.version = focus.current.version;
      s.aspect = aspect;
      s.until = now + SETTLE_SECONDS;
    }
    if (now > s.until) return;
    const k = 1 - Math.exp(-delta * 4.5);
    const halfV = (camera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const distance = (FIT_RADIUS * MARGIN) / Math.sin(Math.min(halfV, halfH));
    controls.target.y += (focus.current.height / 2 - controls.target.y) * k;
    const dir = offset.current.copy(camera.position).sub(controls.target);
    dir.setLength(dir.length() + (distance - dir.length()) * k);
    camera.position.copy(controls.target).add(dir);
    controls.update();
  });

  return null;
};
