import { combineReducers } from "@reduxjs/toolkit";

import { libraryReducer } from "./library";
import { settingReducer } from "./setting";
import { streamReducer } from "./stream";
import { viewerReducer } from "./viewer";

const rootReducers = combineReducers({
  stream: streamReducer,
  viewer: viewerReducer,
  setting: settingReducer,
  library: libraryReducer,
});

export default rootReducers;
