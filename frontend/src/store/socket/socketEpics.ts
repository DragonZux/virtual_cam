import { SocketService } from "@/Services/SocketService";
import { requestEpic } from "../epicHelpers";
import { socketActions } from "./socketSlice";

const load$ = requestEpic(socketActions.loadRequest, () => SocketService.get(), socketActions.loadSuccess, socketActions.loadFailure);
const save$ = requestEpic(socketActions.saveRequest, (targets) => SocketService.saveTcp(targets),
  socketActions.saveSuccess, socketActions.saveFailure);

export const socketEpics = [load$, save$];
