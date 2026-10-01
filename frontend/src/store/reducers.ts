import { combineReducers } from "@reduxjs/toolkit";

import { historyReducer } from "./history";
import { settingReducer } from "./setting";
import { visionReducer } from "./vision";
import { modelReducer } from "./model";

const rootReducers = combineReducers({
  vision: visionReducer,
  history: historyReducer,
  setting: settingReducer,
  model: modelReducer,
});

export default rootReducers;
