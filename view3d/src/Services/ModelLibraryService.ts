import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

import { MODEL_MANIFEST_PATH } from "@/common/constants";
import type { CustomModel, ModelManifest } from "@/common/types";
import { normalizeManifest } from "@/utils/library";
import HttpClient from "./HttpClient";

/** Mô hình GLB riêng liệt kê trong public/models/manifest.json (tính từ trang: dev "/", Docker "/view3d/") */
const getCustomModels = (): Observable<Record<string, CustomModel>> => {
  const url = new URL(MODEL_MANIFEST_PATH, document.baseURI).href;
  return HttpClient.get<ModelManifest>(url).pipe(map((manifest) => normalizeManifest(manifest, url)));
};

export const ModelLibraryService = { getCustomModels };
