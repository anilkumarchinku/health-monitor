"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { requireSignedInUser } from "@/lib/auth";
import { hydrateHealthState } from "@/lib/health-sync";
import { signInDestination } from "@/lib/return-path";
import { hasSavedOnboarding, saveOnboardingResponses } from "@/lib/onboarding-persistence";
import { bypassOnboarding, chooseAnswer, emptyAnswer, onboardingReducer, onboardingSteps, onboardingTiming, restoreOnboardingState, validAnswer } from "@/lib/onboarding";

export function useOnboarding() {
  const [state, dispatch] = useReducer(onboardingReducer, { step: 0, answers: {}, completed: false });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [reducedMotion, setReducedMotion] = useState(false);
  const owner = useRef<string | null>(null);
  const active = useRef(true);
  const locked = useRef(false);
  const savingRef = useRef(false);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const draftKey = useCallback(() => `health-onboarding:v1:${owner.current}`, []);
  const cancelSelection = useCallback(() => { if (selectionTimer.current) clearTimeout(selectionTimer.current); selectionTimer.current = null; }, []);

  const load = useCallback(async () => {
    const run = ++generation.current;
    setReady(false); setError("");
    try {
      const user = await requireSignedInUser();
      if (!user) throw new Error("Please sign in to set up your account.");
      const saved = await hydrateHealthState(user.id);
      if (!active.current || run !== generation.current) return;
      const revisit = new URLSearchParams(window.location.search).get("edit") === "1";
      const cloudCompleted = !revisit && saved?.onboardingCompleted && saved.syncPending ? await hasSavedOnboarding(user.id) : false;
      if (!active.current || run !== generation.current) return;
      if (bypassOnboarding(saved, revisit, cloudCompleted)) { window.location.replace(signInDestination()); return; }
      owner.current = user.id; setEditing(revisit && Boolean(saved?.onboardingCompleted));
      let draft: string | null = null;
      try { draft = sessionStorage.getItem(draftKey()); } catch { /* In-memory flow works when storage is blocked. */ }
      dispatch({ type: "restore", state: restoreOnboardingState(saved, draft) });
      setReady(true);
    } catch (failure) { if (active.current && run === generation.current) setError(failure instanceof Error ? failure.message : "Couldn't load setup. Try again."); }
  }, [draftKey]);

  useEffect(() => {
    active.current = true;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    changed(); media.addEventListener("change", changed);
    void load();
    return () => { active.current = false; cancelSelection(); if (motionTimer.current) clearTimeout(motionTimer.current); media.removeEventListener("change", changed); };
  }, [load, cancelSelection]);

  useEffect(() => {
    if (!ready || !owner.current || state.completed) return;
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ version: 1, step: state.step, answers: state.answers })); } catch { /* Saving to the account is still available. */ }
  }, [ready, state, draftKey]);

  const move = useCallback((target: number) => {
    cancelSelection();
    if (locked.current || savingRef.current || !active.current) return;
    locked.current = true; setPhase("out");
    const timing = onboardingTiming(reducedMotion);
    motionTimer.current = setTimeout(() => {
      dispatch({ type: "move", step: target }); setPhase("in");
      motionTimer.current = setTimeout(() => { locked.current = false; setPhase("idle"); }, timing.enter);
    }, timing.exit);
  }, [cancelSelection, reducedMotion]);

  const step = onboardingSteps[state.step];
  const answer = step ? state.answers[step.id] ?? emptyAnswer() : emptyAnswer();
  const canContinue = Boolean(step && validAnswer(step, answer));
  const select = (value: string) => {
    if (!step || locked.current || savingRef.current) return;
    cancelSelection(); setError("");
    const nextAnswer = chooseAnswer(step, answer, value);
    dispatch({ type: "answer", id: step.id, answer: nextAnswer });
    if (step.type === "single-select" && !step.options?.find(option => option.value === value)?.other) {
      selectionTimer.current = setTimeout(() => move(state.step + 1), onboardingTiming(reducedMotion).selection);
    }
  };
  const setText = (field: "text" | "other", value: string) => {
    if (!step || locked.current || savingRef.current) return;
    cancelSelection(); dispatch({ type: "answer", id: step.id, answer: { ...answer, [field]: value.slice(0, field === "other" ? 160 : step.maxLength ?? 100) } });
  };
  const next = () => { if (canContinue) move(state.step + 1); };
  const back = () => { if (state.step > 0) move(state.step - 1); };
  const finish = async () => {
    cancelSelection();
    if (!owner.current || savingRef.current || locked.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      await saveOnboardingResponses(owner.current, state.answers);
      if (!active.current) return;
      dispatch({ type: "complete" });
      try { sessionStorage.removeItem(draftKey()); } catch { /* Completion is already saved remotely. */ }
      window.location.replace(signInDestination());
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : "Couldn't save setup. Please retry."); }
    finally { savingRef.current = false; if (active.current) setSaving(false); }
  };
  return { state, step, answer, canContinue, ready, error, saving, editing, phase, reducedMotion, select, setText, next, back, finish, reload: load };
}
