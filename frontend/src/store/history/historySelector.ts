import { createSelector } from "@reduxjs/toolkit";

import { RECENT_COUNT } from "@/common/constants";
import type { RootState } from "@/store/types";

export const getHistoryState = (state: RootState) => state.history;
export const getSelectionEvents = (state: RootState) => state.history.events;
export const getSelectionTotal = (state: RootState) => state.history.total;

export const getRecentSelections = createSelector([getSelectionEvents], (events) => events.slice(0, RECENT_COUNT));

export const getHistoryStats = createSelector([getHistoryState], ({ total, byName, confidenceSum }) => {
  const [topName, topCount] = Object.entries(byName).reduce<[string | null, number]>(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    [null, 0],
  );
  return { total, topName, topCount, averageConfidence: total ? confidenceSum / total : null };
});
