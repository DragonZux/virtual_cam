import type { RootState } from "@/store/types";

export const getMediaItems = (state: RootState) => state.media.items;
export const getMediaFolder = (state: RootState) => state.media.folder;
export const getMediaMaxBytes = (state: RootState) => state.media.maxBytes;
export const getMediaUploading = (state: RootState) => state.media.uploading;
