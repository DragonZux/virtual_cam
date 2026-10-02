import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Box3, Matrix4, Vector3, type Group, type InstancedMesh, type Mesh } from "three";

/** Nửa đường chéo hộp bao sau khi co giãn — camera canh khung theo cỡ này */
export const FIT_RADIUS = 1;

interface Props {
  children: ReactNode;
  /** Báo kích thước sau khi co giãn (để camera nhìn vào giữa vật) */
  onFit?: (size: Vector3) => void;
}

/**
 * Co giãn vật về cùng một cỡ (đường chéo hộp bao = 2 × FIT_RADIUS), đặt lên mặt y = 0 và căn giữa x / z:
 * mô hình dựng sẵn hay file GLB ở đơn vị nào cũng vừa khung. Đo một lần khi gắn (cha đổi key để đo lại).
 */
export const FitToView = ({ children, onFit }: Props) => {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const report = useRef(onFit);

  useEffect(() => {
    report.current = onFit;
  });

  useLayoutEffect(() => {
    const frame = outer.current;
    const content = inner.current;
    if (!frame || !content) return;
    content.position.set(0, 0, 0);
    content.scale.setScalar(1);
    frame.updateWorldMatrix(true, true);
    // Đo trong hệ toạ độ của khung (bỏ qua hiệu ứng co giãn của cha đang chạy)
    const toFrame = new Matrix4().copy(frame.matrixWorld).invert();
    const relative = new Matrix4();
    const bounds = new Box3();
    const part = new Box3();
    content.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
      // InstancedMesh: hộp bao gộp mọi bản sao; mesh thường: hộp của geometry
      const instanced = object as InstancedMesh;
      if (instanced.isInstancedMesh) {
        if (!instanced.boundingBox) instanced.computeBoundingBox();
      } else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const local = instanced.isInstancedMesh ? instanced.boundingBox : mesh.geometry.boundingBox;
      if (!local || local.isEmpty()) return;
      part.copy(local).applyMatrix4(relative.multiplyMatrices(toFrame, mesh.matrixWorld));
      bounds.union(part);
    });
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new Vector3());
    const scale = (FIT_RADIUS * 2) / Math.max(size.length(), 1e-6);
    const center = bounds.getCenter(new Vector3());
    content.scale.setScalar(scale);
    content.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    report.current?.(size.multiplyScalar(scale));
  }, []);

  return (
    <group ref={outer}>
      <group ref={inner}>{children}</group>
    </group>
  );
};
