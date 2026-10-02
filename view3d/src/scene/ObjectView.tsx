import type { Vector3 } from "three";

import type { CustomModel } from "@/common/types";
import { getModel, resolveModelKey } from "@/models3d";
import { Appear } from "./Appear";
import { FitToView } from "./FitToView";
import { GlbModel } from "./GlbModel";

interface Props {
  /** Tên lớp nhận từ máy chủ */
  name: string;
  /** File GLB riêng của lớp này (manifest), nếu có */
  custom?: CustomModel;
  onFit: (size: Vector3) => void;
  onCustomError?: (url: string) => void;
}

/** Mô hình của một vật thể: GLB riêng nếu có (lỗi thì về dựng sẵn), không thì dựng sẵn / hộp nhãn tên */
export const ObjectView = ({ name, custom, onFit, onCustomError }: Props) => {
  const Model = getModel(resolveModelKey(name));
  const builtin = (
    <FitToView onFit={onFit}>
      <Model name={name} />
    </FitToView>
  );

  return (
    <Appear>
      {custom ? (
        <GlbModel
          model={custom}
          fallback={builtin}
          wrap={(content) => <FitToView onFit={onFit}>{content}</FitToView>}
          onError={onCustomError}
        />
      ) : (
        builtin
      )}
    </Appear>
  );
};
