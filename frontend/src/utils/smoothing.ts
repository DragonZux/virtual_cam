import type { FrameResult } from "@/common/types";

/** Smooth only display coordinates; server results used for selection/history stay untouched. */
export const smoothHand = (previous: FrameResult | null, target: FrameResult, elapsedMs: number): FrameResult => {
  if (!previous || target.landmarks.length !== 21 || previous.landmarks.length !== 21 ||
      previous.resolution.width !== target.resolution.width || previous.resolution.height !== target.resolution.height) return target;
  const wrist = target.landmarks[0];
  const oldWrist = previous.landmarks[0];
  // Reacquisition/large jumps should snap immediately instead of dragging a phantom hand.
  if (Math.hypot(wrist.x - oldWrist.x, wrist.y - oldWrist.y) > 0.2) return target;
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / 24);
  const landmarks = target.landmarks.map((point, i) => ({
    x: previous.landmarks[i].x + (point.x - previous.landmarks[i].x) * alpha,
    y: previous.landmarks[i].y + (point.y - previous.landmarks[i].y) * alpha,
  }));
  return {
    ...target,
    landmarks,
    tip: target.tip && previous.tip
      ? [previous.tip[0] + (target.tip[0] - previous.tip[0]) * alpha,
         previous.tip[1] + (target.tip[1] - previous.tip[1]) * alpha]
      : target.tip,
  };
};
