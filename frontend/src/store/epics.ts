import { combineEpics } from "redux-observable";

import { historyEpics } from "./history";
import { mediaEpics } from "./media";
import { settingEpics } from "./setting";
import { visionEpics } from "./vision";

const rootEpics = combineEpics(...visionEpics, ...historyEpics, ...settingEpics, ...mediaEpics);

export default rootEpics;
