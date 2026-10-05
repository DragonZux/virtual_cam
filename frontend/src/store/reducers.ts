import { combineReducers } from "@reduxjs/toolkit";

import { settingReducer } from "./setting";
import { visionReducer } from "./vision";
import { modelReducer } from "./model";
import { streamReducer } from "./stream";

const rootReducers = combineReducers({
  vision: visionReducer,
  setting: settingReducer,
  model: modelReducer,
  stream: streamReducer,
});

export default rootReducers;
