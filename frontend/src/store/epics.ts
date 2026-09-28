import { combineEpics } from "redux-observable";

import { historyEpics } from "./history";
import { settingEpics } from "./setting";
import { visionEpics } from "./vision";

const rootEpics = combineEpics(...visionEpics, ...historyEpics, ...settingEpics);

export default rootEpics;
