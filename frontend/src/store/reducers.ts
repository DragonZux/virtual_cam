import { combineReducers } from "@reduxjs/toolkit";

import { historyReducer } from "./history";
import { mediaReducer } from "./media";
import { modelReducer } from "./model";
import { settingReducer } from "./setting";
import { visionReducer } from "./vision";

const rootReducers = combineReducers({
  vision: visionReducer,
  history: historyReducer,
  setting: settingReducer,
  media: mediaReducer,
  model: modelReducer,
});

export default rootReducers;
