import type { FrameResult } from "@/common/types";

/** Share of the frame beyond which a move (laser tracking accepted a far spot) is drawn at once. */
const SNAP = 0.2;

/**
 * Glide the laser dot between server results at display refresh rate.
 * Smooth only display coordinates; server results used for selection stay untouched.
 */
export const smoothPointer = (previous: FrameResult | null, target: FrameResult, elapsedMs: number): FrameResult => {
  if (!previous || previous.resolution.width !== target.resolution.width ||
      previous.resolution.height !== target.resolution.height) return target;
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 24);
  const toward = (from: number, to: number) => from + (to - from) * alpha;
  const dot = target.laser?.point;
  const oldDot = previous.laser?.point;
  if (target.laser && dot && oldDot &&
      Math.hypot((dot[0] - oldDot[0]) / target.resolution.width, (dot[1] - oldDot[1]) / target.resolution.height) <= SNAP) {
    return { ...target, laser: { ...target.laser, point: [toward(oldDot[0], dot[0]), toward(oldDot[1], dot[1])] } };
  }
  return target;
};
