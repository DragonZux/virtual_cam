import { useEffect, useState, type ReactNode } from "react";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

import type { CustomModel } from "@/common/types";
import { LoadingMarker } from "./Effects";

/**
 * GLTFLoader gốc của three.js, không bật Draco / Meshopt: hai bộ giải nén đó cần tải mã từ CDN / WebAssembly
 * mà CSP của backend chặn. Mỗi URL chỉ tải một lần; lỗi thì bỏ khỏi cache để lần mở trang sau thử lại.
 */
const cache = new Map<string, Promise<Object3D>>();

const loadScene = (url: string): Promise<Object3D> => {
  let pending = cache.get(url);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
};

const toRadians = (degrees: [number, number, number]) =>
  degrees.map((d) => (d * Math.PI) / 180) as [number, number, number];

interface Props {
  model: CustomModel;
  /** Mô hình dựng sẵn hiện thay khi file lỗi */
  fallback: ReactNode;
  /** Bọc mô hình đã tải (FitToView) */
  wrap: (content: ReactNode) => ReactNode;
  onError?: (url: string) => void;
}

/** File GLB / glTF riêng (manifest): đang tải → khối chờ, lỗi → mô hình dựng sẵn */
export const GlbModel = ({ model, fallback, wrap, onError }: Props) => {
  const [state, setState] = useState<{ url: string; scene: Object3D | null; failed: boolean }>({
    url: model.url,
    scene: null,
    failed: false,
  });
  // Đổi file → về trạng thái đang tải
  if (state.url !== model.url) setState({ url: model.url, scene: null, failed: false });

  useEffect(() => {
    let alive = true;
    loadScene(model.url).then(
      // Bản sao riêng (giữ khung xương) để gỡ / gắn lại không ảnh hưởng bản trong cache
      (scene) => alive && setState({ url: model.url, scene: clone(scene), failed: false }),
      (error: unknown) => {
        console.warn("[view3d] Không mở được file GLB, dùng mô hình dựng sẵn:", model.url, error);
        if (!alive) return;
        setState({ url: model.url, scene: null, failed: true });
        onError?.(model.url);
      },
    );
    return () => {
      alive = false;
    };
  }, [model.url, onError]);

  if (state.failed) return <>{fallback}</>;
  if (!state.scene) return <LoadingMarker />;
  return <>{wrap(<primitive object={state.scene} rotation={toRadians(model.rotation)} />)}</>;
};
