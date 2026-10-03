"use client";

import { type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { onboardingSteps } from "@/lib/onboarding";
import styles from "./onboarding.module.css";

export function OnboardingProgress({ step }: { step: number }) {
  const total = onboardingSteps.length + 1;
  return <div className={styles.progress} role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1} aria-valuetext={`Question ${Math.min(step + 1, total)} of ${total}`}>
    {Array.from({ length: total }, (_, index) => <span key={index} className={styles.dot} data-status={index === step ? "current" : index < step ? "done" : "upcoming"} />)}
  </div>;
}

export function OnboardingShell({ step, children, scene, editing }: { step: number; children: ReactNode; scene: ReactNode; editing: boolean }) {
  return <div className={styles.shell}>
    <header className={styles.header}><BrandLogo /><OnboardingProgress step={step} /><span className={styles.headerNote}>{editing ? "Your preferences" : "A fresh start"}</span></header>
    {children}
    <footer className={styles.footer}>{scene}<p>A little care, every day.</p></footer>
  </div>;
}
