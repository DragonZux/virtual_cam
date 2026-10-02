import type { RootState } from "@/store/types";

export const getCustomModels = (state: RootState) => state.library.custom;
