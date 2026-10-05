import type { RootState } from "@/store/types";

export const getFollow = (state: RootState) => state.viewer.follow;
export const getPreview = (state: RootState) => state.viewer.preview;
