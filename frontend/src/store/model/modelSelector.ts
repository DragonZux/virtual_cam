import { createSelector } from "@reduxjs/toolkit";

import { MODEL_KINDS } from "@/common/constants";
import type { ModelInfo, ModelKind } from "@/common/types";
import type { RootState } from "@/store/types";

export const getModelCatalog = (state: RootState) => state.model.catalog;

/**
 * Mô hình đang chạy của từng loại. Giao diện chỉ hiện mô hình này: tải lên là dùng ngay (TensorRT xong thì thay bằng
 * engine) nên đây cũng là mô hình mới nhất; mô hình cũ vẫn nằm trên máy chủ nhưng không hiện.
 */
export const getCurrentModels = createSelector([getModelCatalog], (catalog) => {
  const current: Partial<Record<ModelKind, ModelInfo>> = {};
  for (const kind of MODEL_KINDS) current[kind] = catalog?.items.find((model) => model.kind === kind && model.active);
  return current;
});

/** id mô hình gốc đang chờ / đang chuyển sang TensorRT */
export const getConvertingSources = createSelector([getModelCatalog], (catalog) =>
  new Set((catalog?.conversions ?? [])
    .filter((job) => job.status === "queued" || job.status === "running")
    .map((job) => job.source)));
