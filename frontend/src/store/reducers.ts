import { combineReducers } from "@reduxjs/toolkit";

import { historyReducer } from "./history";
import { loadingReducer } from "./loading";
import { settingReducer } from "./setting";
import { visionReducer } from "./vision";

const rootReducers = combineReducers({
  loading: loadingReducer,
  vision: visionReducer,
  history: historyReducer,
  setting: settingReducer,
});

export default rootReducers;
