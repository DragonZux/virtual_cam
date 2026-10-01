import { combineEpics } from "redux-observable";

import { historyEpics } from "./history";
import { settingEpics } from "./setting";
import { visionEpics } from "./vision";
import { modelEpics } from "./model";

const rootEpics = combineEpics(...visionEpics, ...historyEpics, ...settingEpics, ...modelEpics);

export default rootEpics;
