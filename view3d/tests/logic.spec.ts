import { expect, test } from "@playwright/test";

import type { SelectionMessage, SelectionSession } from "../src/common/types";
import { streamActions, streamReducer } from "../src/store/stream/streamSlice";
import { canonicalClass } from "../src/utils/format";
import { normalizeManifest } from "../src/utils/library";
import { AUTO_FOLLOW, pickDisplayed, sanitizeSession } from "../src/utils/sessions";
import { certificatePageOf, resolveWsUrl } from "../src/utils/wsUrl";

const http = { protocol: "http:", host: "localhost:5183" };
const https = { protocol: "https:", host: "10.0.9.41:8033" };

const session = (id: string, name: string | null, timestamp: number): SelectionSession => ({
  session_id: id,
  selected: name ? { name, confidence: 0.9 } : null,
  pointer_mode: "hand",
  source: "camera",
  connected: true,
  timestamp,
});

test("WebSocket address: same server by default, host:port and http(s) URLs are completed", () => {
  expect(resolveWsUrl("", http)).toBe("ws://localhost:5183/api/vision/ws");
  expect(resolveWsUrl("  ", https)).toBe("wss://10.0.9.41:8033/api/vision/ws");
  expect(resolveWsUrl("10.0.10.62:8033", http)).toBe("wss://10.0.10.62:8033/api/vision/ws");
  expect(resolveWsUrl("https://10.0.10.62:8033", http)).toBe("wss://10.0.10.62:8033/api/vision/ws");
  expect(resolveWsUrl("http://localhost:8030/", http)).toBe("ws://localhost:8030/api/vision/ws");
  expect(resolveWsUrl("ws://localhost:8030/custom/ws", http)).toBe("ws://localhost:8030/custom/ws");
  expect(resolveWsUrl("/api/vision/ws", https)).toBe("wss://10.0.9.41:8033/api/vision/ws");
  expect(resolveWsUrl("ftp://example.com", http)).toBeNull();
  expect(resolveWsUrl("wss://", http)).toBeNull();
  expect(certificatePageOf("wss://10.0.10.62:8033/api/vision/ws")).toBe("https://10.0.10.62:8033/");
  expect(certificatePageOf("ws://localhost:8030/api/vision/ws")).toBeNull();
});

test("messages from the network are sanitized", () => {
  expect(sanitizeSession({ selected: null })).toBeNull();
  expect(sanitizeSession({ session_id: "a", selected: { name: "cup", confidence: 7 }, pointer_mode: "x", timestamp: 5 })).toEqual({
    session_id: "a",
    selected: { name: "cup", confidence: 1 },
    pointer_mode: "hand",
    source: "camera",
    connected: true,
    timestamp: 5,
  });
  expect(sanitizeSession({ session_id: "b", selected: { name: " " }, source: "media", connected: false, timestamp: 1 })).toMatchObject({
    selected: null,
    source: "media",
    connected: false,
  });
});

test("display: preview > newest live selection of the followed session > last selection", () => {
  const sessions = { a: session("a", "cup", 10), b: session("b", "bottle", 20), c: session("c", null, 30) };
  const last = { session_id: "a", name: "laptop", confidence: 0.8, pointer_mode: "hand" as const, source: "camera" as const, timestamp: 5 };
  const base = { sessions, follow: AUTO_FOLLOW, last, preview: null, keepLast: true };
  expect(pickDisplayed(base)).toMatchObject({ kind: "live", name: "bottle" });
  expect(pickDisplayed({ ...base, follow: "a" })).toMatchObject({ kind: "live", name: "cup" });
  expect(pickDisplayed({ ...base, follow: "c" })).toBeNull();
  expect(pickDisplayed({ ...base, preview: "dog" })).toMatchObject({ kind: "preview", name: "dog", selection: null });
  const idle = { ...base, sessions: { c: sessions.c } };
  expect(pickDisplayed(idle)).toMatchObject({ kind: "last", name: "laptop" });
  expect(pickDisplayed({ ...idle, keepLast: false })).toBeNull();
});

test("stream state follows snapshots and changes like the README describes", () => {
  const changed = (s: SelectionSession): SelectionMessage => ({ type: "selection.changed", ...s });
  let state = streamReducer(undefined, streamActions.opened());
  state = streamReducer(state, streamActions.messageReceived({ type: "selection.snapshot", sessions: [session("a", "cup", 1)] }));
  expect(state.last?.name).toBe("cup");
  expect(state.revision).toBe(1);
  // Cùng vật thể, chỉ đổi độ tin cậy: không tính là lần chọn mới
  state = streamReducer(state, streamActions.messageReceived(changed({ ...session("a", "cup", 2), selected: { name: "cup", confidence: 0.5 } })));
  expect(state.revision).toBe(1);
  expect(state.last?.confidence).toBe(0.5);
  state = streamReducer(state, streamActions.messageReceived(changed(session("a", "bottle", 3))));
  state = streamReducer(state, streamActions.messageReceived(changed(session("a", null, 4))));
  expect(state.sessions.a.selected).toBeNull();
  expect(state.last?.name).toBe("bottle");
  // Chọn lại đúng vật vừa bỏ chọn vẫn là một lần chọn mới, danh sách gần đây gộp dòng trùng liền nhau
  state = streamReducer(state, streamActions.messageReceived(changed(session("a", "bottle", 5))));
  expect(state.revision).toBe(3);
  expect(state.recent.map((r) => r.name)).toEqual(["bottle", "cup"]);
  // Phiên ngắt → xoá; socket đóng → xoá mọi phiên nhưng giữ "vừa chọn"
  state = streamReducer(state, streamActions.messageReceived({ ...changed(session("a", null, 6)), connected: false }));
  expect(state.sessions).toEqual({});
  state = streamReducer(state, streamActions.messageReceived({ type: "selection.snapshot", sessions: [session("b", "dog", 7)] }));
  state = streamReducer(state, streamActions.closed(500));
  expect(state.sessions).toEqual({});
  expect(state.last?.name).toBe("dog");
  // Nối lại: snapshot cùng lựa chọn đã biết không phát lại hiệu ứng chọn mới
  const revision = state.revision;
  state = streamReducer(state, streamActions.messageReceived({ type: "selection.snapshot", sessions: [session("b", "dog", 7)] }));
  expect(state.revision).toBe(revision);
});

test("class names from other datasets map to COCO classes", () => {
  expect(canonicalClass("Cell_Phone")).toBe("cell phone");
  expect(canonicalClass("sofa")).toBe("couch");
  expect(canonicalClass("TV Monitor")).toBe("tv");
  expect(canonicalClass("diningtable")).toBe("dining table");
  expect(canonicalClass("magic lamp")).toBe("magic lamp");
});

test("custom GLB manifest: entries resolve next to the manifest, invalid entries are skipped", () => {
  const url = "https://10.0.9.41:8033/view3d/models/manifest.json";
  expect(
    normalizeManifest(
      {
        models: {
          Cup: "cup.glb",
          "Teddy  Bear": { file: "toys/teddy.glb", rotation: [0, 90, 0] },
          bottle: { file: "" },
          chair: { file: "chair.glb", rotation: [0, "x", 0] },
          dog: 42,
        },
      },
      url,
    ),
  ).toEqual({
    cup: { url: "https://10.0.9.41:8033/view3d/models/cup.glb", rotation: [0, 0, 0] },
    "teddy bear": { url: "https://10.0.9.41:8033/view3d/models/toys/teddy.glb", rotation: [0, 90, 0] },
    chair: { url: "https://10.0.9.41:8033/view3d/models/chair.glb", rotation: [0, 0, 0] },
  });
  expect(normalizeManifest(null, url)).toEqual({});
  expect(normalizeManifest({ models: [] }, url)).toEqual({});
});
