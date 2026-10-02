import type { Epic } from "redux-observable";
import type { Action } from "@reduxjs/toolkit";

import type rootReducers from "./reducers";

export type RootState = ReturnType<typeof rootReducers>;
export type RootEpic = Epic<Action, Action, RootState>;
