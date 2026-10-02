import { combineEpics } from "redux-observable";

import { settingEpics } from "./setting";
import { visionEpics } from "./vision";
import { modelEpics } from "./model";
import { socketEpics } from "./socket";
import { streamEpics } from "./stream";

const rootEpics = combineEpics(...visionEpics, ...settingEpics, ...modelEpics, ...streamEpics, ...socketEpics);

export default rootEpics;
