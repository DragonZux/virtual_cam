import type { RootState } from "@/store/types";

export const getLoadingState = (state: RootState) => state.loading;
export const isLoading = (key: string) => (state: RootState) => (state.loading.activeLoadings[key] ?? 0) > 0;
export const isAnyLoading = (state: RootState) => state.loading.loading;
