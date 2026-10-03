"use client";

import { onboardingSteps } from "@/lib/onboarding";
import styles from "./onboarding.module.css";

// The same cubic Bezier coordinates drive both the drawing and progress position.
const points = [{ x: 60, y: 135 }, { x: 290, y: -15 }, { x: 670, y: 245 }, { x: 940, y: 85 }];
function pointAt(t: number) {
  const inverse = 1 - t;
  const weights = [inverse ** 3, 3 * inverse ** 2 * t, 3 * inverse * t ** 2, t ** 3];
  return { x: points.reduce((value, point, index) => value + point.x * weights[index], 0), y: points.reduce((value, point, index) => value + point.y * weights[index], 0) };
}
export function OnboardingMotionScene({ step }: { step: number }) {
  const progress = Math.min(1, Math.max(0, step / onboardingSteps.length));
  const first = pointAt(.06 + progress * .88);
  const second = pointAt(.02 + progress * .66);
  return <svg className={styles.scene} viewBox="0 0 1000 200" fill="none" aria-hidden="true" focusable="false" data-complete={progress === 1}>
    <path d="M60 135 C290 -15 670 245 940 85" className={styles.path} />
    <path d="M0 176 C290 66 730 235 1000 124" className={styles.pathSecondary} />
    <g className={styles.traveller} style={{ transform: `translate(${second.x}px, ${second.y}px)` }}><circle r="8" className={styles.smallObject} /></g>
    <g className={styles.traveller} style={{ transform: `translate(${first.x}px, ${first.y}px)` }}>
      <g className={styles.character}><circle r="26" className={styles.object} /><path d="M-11 2 C-11 -11 3 -14 13 -14 C14 -1 5 11 -8 9 M-8 9 L7 -6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></g>
      {progress === 1 && <g className={styles.celebration} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M-38 -24 l-5 -6 M36 -20 l6 -7 M-1 -37 v-8" /><circle cx="37" cy="19" r="3" /><circle cx="-36" cy="14" r="2" /></g>}
    </g>
  </svg>;
}
