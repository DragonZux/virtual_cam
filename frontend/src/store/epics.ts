import { combineEpics } from "redux-observable";

import { settingEpics } from "./setting";
import { visionEpics } from "./vision";
import { modelEpics } from "./model";
import { streamEpics } from "./stream";

const rootEpics = combineEpics(...visionEpics, ...settingEpics, ...modelEpics, ...streamEpics);

export default rootEpics;
