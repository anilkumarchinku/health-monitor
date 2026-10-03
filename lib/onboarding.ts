import { normaliseDay } from "@/lib/daily-health";
import type { HealthState } from "@/lib/health-sync";

export const onboardingProduct = "Health Monitor";
export type OnboardingOptionData = { value: string; label: string; detail?: string; other?: boolean };
export type OnboardingStep = {
  id: string;
  eyebrow: string;
  question: string;
  description: string;
  type: "single-select" | "multi-select" | "text";
  options?: OnboardingOptionData[];
  placeholder?: string;
  maxLength?: number;
};
export type OnboardingAnswer = { values: string[]; text: string; other: string };
export type OnboardingAnswers = Record<string, OnboardingAnswer>;
export type OnboardingState = { step: number; answers: OnboardingAnswers; completed: boolean };
export const emptyAnswer = (): OnboardingAnswer => ({ values: [], text: "", other: "" });
const options = (labels: string[]) => labels.map(label => ({ value: label, label, ...(label === "Other" ? { other: true } : {}) }));

/** Edit questions here. The renderer also supports standalone text questions. */
export const onboardingSteps: OnboardingStep[] = [
  { id: "role", eyebrow: "A little about you", question: "What describes you best?", description: "Everyone starts somewhere. Choose the closest fit.", type: "single-select", options: options(["Founder", "Developer", "Designer", "Marketing", "Operations", "Other"]) },
  { id: "useCase", eyebrow: "Make it yours", question: `What are you mainly using ${onboardingProduct} for?`, description: "Choose the part of your life you want to support.", type: "single-select", options: options(["Work", "Personal projects", "Team collaboration", "Client work", "Learning", "Other"]) },
  { id: "teamSize", eyebrow: "Your everyday circle", question: "How large is your team?", description: "Your health records stay private to your account.", type: "single-select", options: options(["Just me", "2–10", "11–50", "51–200", "200+"]) },
  { id: "goal", eyebrow: "Small steps, real progress", question: "What would you like to achieve first?", description: "Pick one or more. You can change these later.", type: "multi-select", options: [
    { value: "Balanced meals", label: "Build a meal routine", detail: "Make time for regular check-ins" },
    { value: "Hydration", label: "Keep track of water", detail: "See your daily hydration progress" },
    { value: "Better sleep", label: "Understand my sleep", detail: "Notice patterns in your rest" },
    { value: "Medicine routine", label: "Remember my medicines", detail: "Follow the schedule on your label" },
    { value: "Health progress", label: "See my progress", detail: "Bring my records together" },
    { value: "Other", label: "Something else", other: true },
  ] },
];

export function validAnswer(step: OnboardingStep, answer = emptyAnswer()) {
  if (step.type === "text") return answer.text.trim().length > 0 && answer.text.length <= (step.maxLength ?? 100);
  const allowed = new Set(step.options?.map(option => option.value));
  return answer.values.length > 0 && (step.type !== "single-select" || answer.values.length === 1) && answer.values.every(value => allowed.has(value)) && answer.other.length <= 160;
}

export function chooseAnswer(step: OnboardingStep, answer: OnboardingAnswer, value: string): OnboardingAnswer {
  if (!step.options?.some(option => option.value === value)) return answer;
  const values = step.type === "multi-select"
    ? answer.values.includes(value) ? answer.values.filter(item => item !== value) : [...answer.values, value]
    : [value];
  return { ...answer, values, other: step.options.some(option => option.other && values.includes(option.value)) ? answer.other : "" };
}

export type OnboardingAction =
  | { type: "answer"; id: string; answer: OnboardingAnswer }
  | { type: "move"; step: number }
  | { type: "restore"; state: OnboardingState }
  | { type: "complete" };
export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "answer": return { ...state, answers: { ...state.answers, [action.id]: action.answer } };
    case "move": return { ...state, step: Math.max(0, Math.min(onboardingSteps.length, action.step)) };
    case "restore": return action.state;
    case "complete": return { ...state, completed: true };
  }
}

export function cleanAnswers(value: unknown): OnboardingAnswers {
  const source = value && typeof value === "object" ? value as Record<string, Partial<OnboardingAnswer>> : {};
  return Object.fromEntries(onboardingSteps.map(step => {
    const answer = source[step.id];
    return [step.id, {
      values: Array.isArray(answer?.values) ? [...new Set(answer.values.filter(item => typeof item === "string" && step.options?.some(option => option.value === item)))].slice(0, step.type === "single-select" ? 1 : 6) : [],
      text: typeof answer?.text === "string" ? answer.text.slice(0, step.maxLength ?? 100) : "",
      other: typeof answer?.other === "string" ? answer.other.slice(0, 160) : "",
    }];
  }));
}

export function restoreOnboardingState(saved: HealthState | null, draft: string | null): OnboardingState {
  const profile = saved?.profile as { onboarding?: { answers?: unknown } } | undefined;
  let source: { step?: number; answers?: unknown } = { answers: profile?.onboarding?.answers };
  try { if (draft) { const parsed = JSON.parse(draft); if (parsed?.version === 1) source = parsed; } } catch { /* Ignore an invalid draft. */ }
  const answers = cleanAnswers(source.answers);
  const firstMissing = onboardingSteps.findIndex(step => !validAnswer(step, answers[step.id]));
  const furthest = firstMissing < 0 ? onboardingSteps.length : firstMissing;
  return { step: Math.min(Number.isInteger(source.step) ? Math.max(0, source.step!) : 0, furthest), answers, completed: false };
}

export function bypassOnboarding(saved: HealthState | null, editing: boolean, cloudCompleted = false) {
  return Boolean(saved?.onboardingCompleted && (!saved.syncPending || cloudCompleted) && !editing);
}

export function onboardingKeyAction(key: string, editable: boolean, repeat = false) {
  if (repeat) return null;
  if (key === "Enter") return { type: "continue" as const };
  if (!editable && /^[1-6]$/.test(key)) return { type: "choose" as const, index: Number(key) - 1 };
  return null;
}

/** Kept independent of animation events so reduced motion cannot block navigation. */
export function onboardingTiming(reduced: boolean) {
  return { selection: 320, exit: reduced ? 0 : 180, enter: reduced ? 0 : 260 };
}

export function buildOnboardingSnapshot(base: HealthState | null, answers: OnboardingAnswers, timezone: string): HealthState {
  const clean = cleanAnswers(answers);
  if (onboardingSteps.some(step => !validAnswer(step, clean[step.id]))) throw new Error("Answer each question before finishing.");
  const day = normaliseDay(base ?? { profile: { timezone } });
  return {
    ...day,
    onboardingCompleted: true,
    notificationPreference: day.notificationPreference ?? "later",
    profile: {
      ...day.profile,
      name: day.profile.name || "Friend",
      primaryGoal: clean.goal.values.find(value => value !== "Other") ?? (clean.goal.other.trim() || "My health routine"),
      onboarding: { version: 1, answers: clean, completedAt: new Date().toISOString() },
    },
  };
}
