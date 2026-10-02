import { configureStore } from "@reduxjs/toolkit";
import type { Action } from "@reduxjs/toolkit";
import { createEpicMiddleware } from "redux-observable";

import rootEpics from "./epics";
import rootReducers from "./reducers";
import type { RootState } from "./types";

const epicMiddleware = createEpicMiddleware<Action, Action, RootState>();

export const store = configureStore({
  reducer: rootReducers,
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }).concat(epicMiddleware),
});

epicMiddleware.run(rootEpics);

export type AppDispatch = typeof store.dispatch;
export default store;
