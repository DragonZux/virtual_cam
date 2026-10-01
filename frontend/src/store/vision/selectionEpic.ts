import { filter, map, switchMap, takeUntil } from "rxjs/operators";

import { SelectionService } from "@/Services/SelectionService";
import type { RootEpic } from "../types";
import { visionActions } from "./visionSlice";

/** Observe Redux so camera stop, model reset and hidden-tab clears are also published. */
export const selectionEpic: RootEpic = (action$, state$) => action$.pipe(
  filter(visionActions.startSelectionStream.match),
  switchMap(() => SelectionService.publish(state$.pipe(map(({ vision, setting }) => ({
    selected: vision.tracking.held ? {
      name: vision.tracking.held.name,
      confidence: Math.round(vision.tracking.held.confidence * 100) / 100,
    } : null,
    pointer_mode: setting.prefs.pointerMode,
    source: vision.camera.source,
  })))).pipe(takeUntil(action$.pipe(filter(visionActions.stopSelectionStream.match))))),
);
