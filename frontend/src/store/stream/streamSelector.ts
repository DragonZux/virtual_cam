import type { RootState } from "@/store/types";

export const getStreamLinks = (state: RootState) => state.stream.links;
export const getConnectRequest = (state: RootState) => state.stream.connectRequest;
