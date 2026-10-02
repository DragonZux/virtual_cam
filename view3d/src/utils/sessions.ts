import type { DisplayedObject, SelectionSession, ShownSelection } from "@/common/types";

/** Giá trị "phiên theo dõi" mặc định: phiên có lựa chọn mới nhất */
export const AUTO_FOLLOW = "auto";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Bản tin từ mạng → phiên đúng kiểu; thiếu session_id thì bỏ (trường lạ / thiếu khác về mặc định) */
export const sanitizeSession = (raw: unknown): SelectionSession | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.session_id !== "string" || !r.session_id) return null;
  const picked = r.selected as Record<string, unknown> | null | undefined;
  const selected =
    picked && typeof picked === "object" && typeof picked.name === "string" && picked.name.trim()
      ? { name: picked.name, confidence: finite(picked.confidence) ? Math.min(1, Math.max(0, picked.confidence)) : 0 }
      : null;
  return {
    session_id: r.session_id,
    selected,
    pointer_mode: r.pointer_mode === "laser" ? "laser" : "hand",
    source: r.source === "media" ? "media" : "camera",
    connected: r.connected !== false,
    timestamp: finite(r.timestamp) ? r.timestamp : Date.now(),
  };
};

export const toShown = (session: SelectionSession): ShownSelection | null =>
  session.selected
    ? {
        session_id: session.session_id,
        name: session.selected.name,
        confidence: session.selected.confidence,
        pointer_mode: session.pointer_mode,
        source: session.source,
        timestamp: session.timestamp,
      }
    : null;

/** Phiên đang có vật thể được chọn, mới nhất theo thời gian máy chủ */
export const latestSelected = (sessions: Iterable<SelectionSession>): SelectionSession | null => {
  let latest: SelectionSession | null = null;
  for (const session of sessions) {
    if (session.selected && (!latest || session.timestamp > latest.timestamp)) latest = session;
  }
  return latest;
};

interface DisplayInput {
  sessions: Record<string, SelectionSession>;
  /** AUTO_FOLLOW hoặc session_id được ghim */
  follow: string;
  last: ShownSelection | null;
  preview: string | null;
  keepLast: boolean;
}

/**
 * Vật thể đưa lên màn hình: xem thử (người xem tự chọn) > đang chọn ở phiên theo dõi
 * > vừa chọn (nếu bật giữ vật thể cuối) > không có gì.
 */
export const pickDisplayed = ({ sessions, follow, last, preview, keepLast }: DisplayInput): DisplayedObject | null => {
  if (preview) return { kind: "preview", name: preview, selection: null };
  const pool = Object.values(sessions).filter((s) => follow === AUTO_FOLLOW || s.session_id === follow);
  const live = latestSelected(pool);
  const shown = live && toShown(live);
  if (shown) return { kind: "live", name: shown.name, selection: shown };
  if (keepLast && last && (follow === AUTO_FOLLOW || last.session_id === follow)) {
    return { kind: "last", name: last.name, selection: last };
  }
  return null;
};
