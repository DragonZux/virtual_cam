import { combineEpics } from "redux-observable";

import { libraryEpics } from "./library";
import { settingEpics } from "./setting";
import { streamEpics } from "./stream";
import { viewerEpics } from "./viewer";

const rootEpics = combineEpics(...streamEpics, ...viewerEpics, ...settingEpics, ...libraryEpics);

export default rootEpics;
