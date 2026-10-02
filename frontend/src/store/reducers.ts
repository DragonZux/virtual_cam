import { combineReducers } from "@reduxjs/toolkit";

import { settingReducer } from "./setting";
import { visionReducer } from "./vision";
import { modelReducer } from "./model";
import { socketReducer } from "./socket";
import { streamReducer } from "./stream";

const rootReducers = combineReducers({
  vision: visionReducer,
  setting: settingReducer,
  model: modelReducer,
  stream: streamReducer,
  socket: socketReducer,
});

export default rootReducers;
