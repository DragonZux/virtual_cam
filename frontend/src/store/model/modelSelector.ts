import { createSelector } from "@reduxjs/toolkit";

import type { ModelInfo } from "@/common/types";
import type { RootState } from "@/store/types";
import { getVisionStatus } from "../vision/visionSelector";

const EMPTY: ModelInfo[] = [];

export const getModelState = (state: RootState) => state.model;
/** Danh sách mô hình theo /vision/status (hỏi định kỳ nên tự cập nhật) */
export const getModels = createSelector([getVisionStatus], (status) => status?.models ?? EMPTY);
