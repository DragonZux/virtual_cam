import type { RootState } from "@/store/types";

export const getSocketState = (state: RootState) => state.socket;
