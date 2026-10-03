"use client";

import { type Ref } from "react";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type OnboardingAnswer, type OnboardingOptionData, type OnboardingStep, onboardingProduct } from "@/lib/onboarding";
import styles from "./onboarding.module.css";

export function OnboardingOption({ option, index, selected, disabled, onSelect }: { option: OnboardingOptionData; index: number; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return <Button type="button" variant="outline" aria-pressed={selected} disabled={disabled} onClick={onSelect} className={styles.option}>
    <span className={styles.optionNumber} aria-hidden="true">{selected ? <Check size={17} /> : index + 1}</span>
    <span className={styles.optionCopy}><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
  </Button>;
}

export function OnboardingQuestion({ step, answer, headingRef, disabled, onSelect, onText }: { step: OnboardingStep; answer: OnboardingAnswer; headingRef: Ref<HTMLHeadingElement>; disabled: boolean; onSelect: (value: string) => void; onText: (field: "text" | "other", value: string) => void }) {
  const hasOther = step.options?.some(option => option.other && answer.values.includes(option.value));
  return <>
    <div className={styles.questionHeader}>
      <p className={styles.eyebrow}>{step.eyebrow}</p>
      <h1 ref={headingRef} tabIndex={-1} id="onboarding-question">{step.question}</h1>
      <p id="onboarding-description" className={styles.description}>{step.description}</p>
    </div>
    <fieldset className={styles.fieldset} disabled={disabled} aria-labelledby="onboarding-question" aria-describedby="onboarding-description">
      <legend className="sr-only">{step.question}</legend>
      {step.type === "text" ? <Input aria-label={step.question} value={answer.text} maxLength={step.maxLength ?? 100} placeholder={step.placeholder} className={styles.textInput} onChange={event => onText("text", event.target.value)} /> :
        <div className={styles.options}>{step.options?.map((option, index) => <OnboardingOption key={option.value} option={option} index={index} selected={answer.values.includes(option.value)} disabled={disabled} onSelect={() => onSelect(option.value)} />)}</div>}
      {hasOther && <label className={styles.other}>Tell us a little more <span>(optional)</span><Input autoFocus maxLength={160} value={answer.other} placeholder="In your own words…" onChange={event => onText("other", event.target.value)} /></label>}
    </fieldset>
  </>;
}

export function OnboardingComplete({ headingRef, editing }: { headingRef: Ref<HTMLHeadingElement>; editing: boolean }) {
  return <div className={styles.complete}>
    <div className={styles.completeMark} aria-hidden="true"><Check size={36} strokeWidth={1.7} /></div>
    <p className={styles.eyebrow}>Your next chapter</p>
    <h1 id="onboarding-question" tabIndex={-1} ref={headingRef}>You&apos;re all set.</h1>
    <p className={styles.description}>{editing ? "A routine that grows with you. Save your preferences and pick up where you left off." : `Welcome to ${onboardingProduct}. One small check-in is a good place to begin.`}</p>
    <p className={styles.completionNote}>{editing ? "Your health records and reminder times stay as you set them." : "Start with a simple routine. You can set your name, meal times, water goal, and optional reminders in Settings."}</p>
  </div>;
}

export function NavigationControls({ step, complete, disabled, saving, canContinue, editing, onBack, onNext, onFinish }: { step: number; complete: boolean; disabled: boolean; saving: boolean; canContinue: boolean; editing: boolean; onBack: () => void; onNext: () => void; onFinish: () => void }) {
  return <div className={styles.navigation}>
    <Button type="button" variant="ghost" disabled={disabled || saving || step === 0} onClick={onBack} className={styles.back}><ArrowLeft />Back</Button>
    <span className={styles.keyboardHint} aria-hidden="true">{complete ? "Your routine, your pace" : "Choose with 1–6 · Enter to continue"}</span>
    <Button type="button" disabled={disabled || saving || (!complete && !canContinue)} onClick={complete ? onFinish : onNext} className={styles.continue}>
      {saving ? "Saving your preferences…" : complete ? editing ? "Save preferences" : `Start using ${onboardingProduct}` : "Continue"}{!saving && <ArrowRight />}
    </Button>
  </div>;
}
