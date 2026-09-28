import { combineEpics } from "redux-observable";

import { historyEpics } from "./history";
import { mediaEpics } from "./media";
import { modelEpics } from "./model";
import { settingEpics } from "./setting";
import { visionEpics } from "./vision";

const rootEpics = combineEpics(...visionEpics, ...historyEpics, ...settingEpics, ...mediaEpics, ...modelEpics);

export default rootEpics;
