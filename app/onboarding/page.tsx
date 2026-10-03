"use client";

import { useEffect, useRef, type KeyboardEvent, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { NavigationControls, OnboardingComplete, OnboardingQuestion } from "@/components/onboarding/onboarding-question";
import { OnboardingMotionScene } from "@/components/onboarding/onboarding-motion-scene";
import { useOnboarding } from "@/components/onboarding/use-onboarding";
import { onboardingKeyAction } from "@/lib/onboarding";
import styles from "@/components/onboarding/onboarding.module.css";

export default function OnboardingPage() {
  const flow = useOnboarding();
  const heading = useRef<HTMLHeadingElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { if (flow.ready && flow.phase !== "out") heading.current?.focus({ preventScroll: true }); }, [flow.ready, flow.state.step, flow.phase]);
  const transitioning = flow.phase !== "idle";
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing || transitioning || flow.saving) return;
    const element = event.target as HTMLElement;
    const editable = Boolean(element.closest('input, textarea, select, [contenteditable="true"]'));
    // Preserve native Enter/Space activation for the focused button or link.
    if (event.key === "Enter" && element.closest("button, a")) return;
    const action = onboardingKeyAction(event.key, editable, event.repeat);
    if (action?.type === "choose") { const option = flow.step?.options?.[action.index]; if (option) { event.preventDefault(); flow.select(option.value); } }
    if (action?.type === "continue" && flow.step) { event.preventDefault(); flow.next(); }
    // Completion always requires an explicit click/keyboard activation of its CTA.
  };
  const startSwipe = (event: TouchEvent) => {
    if ((event.target as HTMLElement).closest("button, input, textarea, a") || event.touches.length !== 1) { touchStart.current = null; return; }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const finishSwipe = (event: TouchEvent) => {
    const start = touchStart.current; touchStart.current = null;
    if (!start || !event.changedTouches[0] || transitioning || flow.saving) return;
    const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx > 0) flow.back(); else if (flow.step) flow.next();
  };
  return <OnboardingShell step={flow.state.step} editing={flow.editing} scene={<OnboardingMotionScene step={flow.state.step} />}>
    <main className={styles.main} onKeyDown={onKeyDown} onTouchStart={startSwipe} onTouchEnd={finishSwipe}>
      {!flow.ready ? <div className={styles.loading}><h1 className="health-heading">Let&apos;s make it yours.</h1>{flow.error ? <><p role="alert">{flow.error}</p><Button onClick={() => void flow.reload()}>Try again</Button></> : <p role="status">Loading your preferences…</p>}</div> : <>
        <section className={styles.stage} data-phase={flow.phase} aria-labelledby="onboarding-question" aria-busy={transitioning || flow.saving}>
          {flow.step ? <OnboardingQuestion step={flow.step} answer={flow.answer} headingRef={heading} disabled={transitioning || flow.saving} onSelect={flow.select} onText={flow.setText} /> : <OnboardingComplete headingRef={heading} editing={flow.editing} />}
        </section>
        {flow.error && <p role="alert" className={styles.error}>{flow.error}</p>}
        <NavigationControls step={flow.state.step} complete={!flow.step} disabled={transitioning} saving={flow.saving} canContinue={flow.canContinue} editing={flow.editing} onBack={flow.back} onNext={flow.next} onFinish={() => void flow.finish()} />
        <p className="sr-only" aria-live="polite">{flow.saving ? "Saving your preferences." : flow.step?.type === "single-select" ? "Choosing an option continues automatically. Choose Other to add optional text. You can go back at any time." : ""}</p>
      </>}
    </main>
  </OnboardingShell>;
}
