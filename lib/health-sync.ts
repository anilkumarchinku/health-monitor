import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { stripEmbeddedMealImages, uploadMealImage } from "@/lib/meal-images";

export const storageKey = "daily-health-companion";
export const historyKey = "daily-health-history";
export const adminUsersKey = "daily-health-admin-users";

const clientIdKey = "daily-health-client-id";
const currentUserKey = "daily-health-current-user";
let preparedUserId: string | null = null;

export type HealthState = {
  serverUpdatedAt?: string | null;
  syncPending?: boolean;
  date?: string;
  profile?: unknown;
  meals?: unknown[];
  water?: number;
  sleep?: unknown;
  sleepCheckCompleted?: boolean;
  quoteIndex?: number;
  quoteFeedback?: unknown;
  onboardingCompleted?: boolean;
  notificationPreference?: unknown;
};

type HealthSnapshot = HealthState & {
  clientId?: string;
  userId?: string;
  date: string;
  updatedAt?: string;
};

type SupabaseSnapshotRow = {
  user_id: string | null;
  client_id: string;
  date: string;
  profile: Record<string, unknown> | null;
  meals: unknown[] | null;
  water: number | null;
  sleep: Record<string, unknown> | null;
  sleep_check_completed: boolean | null;
  quote_index: number | null;
  quote_feedback: unknown;
  onboarding_completed: boolean | null;
  notification_preference: unknown;
  payload: Record<string, unknown> | null;
  updated_at: string | null;
};

export { isSupabaseConfigured };

export function getClientId() {
  const existing = localStorage.getItem(clientIdKey);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `health-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(clientIdKey, id);
  return id;
}

export function prepareLocalUserSession(userId: string) {
  preparedUserId = userId;
  const currentUserId = localStorage.getItem(currentUserKey);
  if (currentUserId !== userId) {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(historyKey);
    localStorage.removeItem(clientIdKey);
  }

  localStorage.setItem(currentUserKey, userId);
}

export function readLocalState<T>() {
  const saved = localStorage.getItem(storageKey);
  try { return saved ? (JSON.parse(saved) as T) : null; } catch { return null; }
}

export function readLocalHistory<T>() {
  const saved = localStorage.getItem(historyKey);
  try { const parsed = saved ? JSON.parse(saved) : []; return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}

export async function saveHealthState(state: HealthState) {
  return saveHealthStateWithHistory(state);
}

export async function saveHealthHistory(snapshot: HealthSnapshot) {
  localStorage.setItem(historyKey, JSON.stringify(mergeHistory(snapshot, readLocalHistory<HealthSnapshot>())));
  return enqueueSync(snapshot);
}

export async function saveHealthStateWithHistory(state: HealthState) {
  if (preparedUserId && preparedUserId !== localStorage.getItem(currentUserKey)) { reportSyncStatus("conflict"); return false; }
  const snapshot = createTodaySnapshot(normalizeStateTimezone(state));
  const local = readLocalState<HealthSnapshot>();
  snapshot.serverUpdatedAt = (state.date === snapshot.date ? state.serverUpdatedAt : undefined) ?? (local?.date === snapshot.date ? local.serverUpdatedAt : null) ?? null;
  snapshot.syncPending = true;
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
  return saveHealthHistory(snapshot);
}

export async function syncCurrentLocalStateToSupabase() {
  const state = readLocalState<HealthState>();
  if (!state) return false;
  if (state.syncPending && state.date && state.date !== getLocalDateForState(state)) return saveHealthHistory(state as HealthSnapshot);
  return saveHealthStateWithHistory(state);
}

export type SyncStatus = "idle" | "saving" | "saved" | "failed" | "conflict";
let syncStatus: SyncStatus = "idle";
let syncQueue: Promise<unknown> = Promise.resolve();
const acknowledgedVersions = new Map<string, string>();
export function getSyncStatus() { return syncStatus; }
function reportSyncStatus(status: SyncStatus) {
  syncStatus = status;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("health-sync-status"));
}
function enqueueSync(snapshot: HealthSnapshot) {
  const owner = localStorage.getItem(currentUserKey);
  const task = syncQueue.then(async () => {
    if (owner !== localStorage.getItem(currentUserKey)) return false;
    reportSyncStatus("saving");
    const versionKey = `${owner}:${snapshot.date}`;
    snapshot.serverUpdatedAt = acknowledgedVersions.get(versionKey) ?? snapshot.serverUpdatedAt ?? null;
    try {
      const synced = await syncSnapshotToSupabase(snapshot, owner);
      if (synced && snapshot.serverUpdatedAt) {
        acknowledgedVersions.set(versionKey, snapshot.serverUpdatedAt);
        if (owner === localStorage.getItem(currentUserKey)) {
          const history = readLocalHistory<HealthSnapshot>().map((day) => day.date === snapshot.date && day.updatedAt === snapshot.updatedAt ? { ...day, serverUpdatedAt: snapshot.serverUpdatedAt, syncPending: false } : day);
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
        const current = readLocalState<HealthSnapshot>();
        if (current?.date === snapshot.date && owner === localStorage.getItem(currentUserKey)) {
          const sameWrite = current.updatedAt === snapshot.updatedAt;
          localStorage.setItem(storageKey, JSON.stringify({ ...current, serverUpdatedAt: snapshot.serverUpdatedAt, syncPending: !sameWrite }));
        }
      }
      if (syncStatus !== "conflict") reportSyncStatus(synced ? "saved" : "failed");
      return synced;
    } catch { reportSyncStatus("failed"); return false; }
  });
  syncQueue = task.catch(() => false);
  return task;
}

export function rollHealthStateForward<T extends HealthState>(state: T): T {
  const date = getLocalDateForState(state);
  return state.date && state.date !== date
    ? { ...resetDailyFieldsForNewDay(state), date, serverUpdatedAt: null, syncPending: false } as T
    : { ...state, date };
}

export async function hydrateHealthState<T extends HealthState>(userId: string): Promise<T | null> {
  prepareLocalUserSession(userId);
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Health service is not configured.");
  const { data, error } = await supabase.from("health_snapshots").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(1);
  if (error) throw new Error("Could not load your saved health data. Please retry.");
  if (localStorage.getItem(currentUserKey) !== userId) throw new Error("Your signed-in account changed. Reload to continue.");
  const remote = data?.[0] ? rowToSnapshot(data[0] as SupabaseSnapshotRow) : null;
  const local = readLocalState<HealthSnapshot>();
  // Retain unsent edits, but never promote stale local state above newer server data.
  if (local?.syncPending && remote?.date === local.date && local.serverUpdatedAt !== remote.serverUpdatedAt) {
    reportSyncStatus("conflict");
    throw new Error("Your data changed on another device. Reload cloud data before editing.");
  }
  let selected = local?.syncPending ? local : remote;
  if (local?.syncPending && local.date !== getLocalDateForState(local)) {
    const synced = await saveHealthHistory(local);
    if (!synced) throw new Error("Your previous day's changes are still saved on this device. Retry syncing before starting a new day.");
    selected = remote && remote.date > local.date ? remote : { ...local, syncPending: false };
  }
  if (!selected) return null;
  if (selected.syncPending) reportSyncStatus("failed");
  const state = rollHealthStateForward(selected);
  if (localStorage.getItem(currentUserKey) !== userId) throw new Error("Your signed-in account changed. Reload to continue.");
  localStorage.setItem(storageKey, JSON.stringify(state));
  if (remote?.serverUpdatedAt) acknowledgedVersions.set(`${userId}:${remote.date}`, remote.serverUpdatedAt);
  return state as T;
}

export function validateHealthProfile(profile: unknown): string | null {
  if (!isPlainRecord(profile)) return "Complete your profile first.";
  if (typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 100) return "Enter a name between 1 and 100 characters.";
  if (typeof profile.waterGoal !== "number" || !Number.isFinite(profile.waterGoal) || profile.waterGoal < 500 || profile.waterGoal > 10000) return "Enter a water goal between 500 and 10,000 ml.";
  try { if (typeof profile.timezone !== "string" || !profile.timezone.trim()) throw new Error(); new Intl.DateTimeFormat("en", { timeZone: profile.timezone }); }
  catch { return "Enter a valid timezone, such as Asia/Kolkata."; }
  for (const field of ["wakeTime", "breakfastTime", "lunchTime", "dinnerTime", "sleepReminder"]) {
    if (typeof profile[field] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(profile[field])) return "Enter a valid time for each daily reminder.";
  }
  return null;
}

export async function loadSyncedHistory<T extends HealthSnapshot>() {
  const owner = localStorage.getItem(currentUserKey);
  const localHistory = readLocalHistory<T>();
  const remoteHistory = await fetchSupabaseHistory<T>();
  if (owner !== localStorage.getItem(currentUserKey)) throw new Error("Your account changed. Reload to continue.");
  const history = mergeHistoryList([...remoteHistory, ...localHistory]);

  if (history.length > 0) {
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  return history;
}

export async function loadAllSupabaseSnapshots<T extends HealthSnapshot>() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("health_snapshots")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => rowToSnapshot(row as SupabaseSnapshotRow)) as T[];
}

export async function loadLatestUserSnapshot<T extends HealthSnapshot>() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("health_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data?.[0]) return null;
  return rowToSnapshot(data[0] as SupabaseSnapshotRow) as T;
}

let lastLocalWrite = 0;
function createTodaySnapshot(state: HealthState): HealthSnapshot {
  const date = getLocalDateForState(state);
  const todayState = state.date && state.date !== date ? resetDailyFieldsForNewDay(state) : state;
  lastLocalWrite = Math.max(Date.now(), lastLocalWrite + 1);

  return {
    ...todayState,
    date,
    updatedAt: new Date(lastLocalWrite).toISOString(),
  };
}

export function resetDailyFieldsForNewDay(state: HealthState): HealthState {
  return {
    ...state,
    meals: Array.isArray(state.meals) ? state.meals.map(meal => resetMealForNewDay(meal, state.profile)) : state.meals,
    water: 0,
    sleepCheckCompleted: false,
    quoteFeedback: null,
  };
}

function resetMealForNewDay(meal: unknown, profile: unknown) {
  if (!isPlainRecord(meal)) return meal;

  const routineTime = isPlainRecord(profile) && typeof meal.type === "string" ? profile[`${meal.type}Time`] : undefined;
  const plannedTime = typeof routineTime === "string" ? routineTime : meal.plannedTime;
  return {
    ...meal,
    plannedTime,
    actualTime: typeof plannedTime === "string" ? plannedTime : meal.actualTime,
    description: "",
    image: "",
    hunger: 3,
    fullness: 3,
    notes: "",
    status: "pending",
    snoozeLabel: undefined,
  };
}

function normalizeStateTimezone(state: HealthState): HealthState {
  if (!isPlainRecord(state.profile)) return state;

  const browserTimezone = getBrowserTimezone();
  const savedTimezone = typeof state.profile.timezone === "string" ? state.profile.timezone : "";
  const shouldAutoFixTimezone = !savedTimezone;

  if (!shouldAutoFixTimezone) return state;

  return {
    ...state,
    profile: {
      ...state.profile,
      timezone: browserTimezone,
    },
  };
}

export function getLocalDateForState(state: HealthState) {
  const timezone =
    isPlainRecord(state.profile) && typeof state.profile.timezone === "string"
      ? state.profile.timezone
      : getBrowserTimezone();

  return getLocalDate(new Date(), timezone);
}

function getLocalDate(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
    return `${value("year")}-${value("month")}-${value("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function getBrowserTimezone() {
  return typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"
    : "Asia/Kolkata";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeHistory<T extends HealthSnapshot>(snapshot: T, history: T[]) {
  return [snapshot, ...history.filter((day) => day.date !== snapshot.date)].slice(0, 30);
}

function mergeHistoryList<T extends HealthSnapshot>(history: T[]) {
  const byDate = new Map<string, T>();

  history.forEach((day) => {
    const current = byDate.get(day.date);
    if (!current || new Date(day.updatedAt ?? 0) > new Date(current.updatedAt ?? 0)) {
      byDate.set(day.date, day);
    }
  });

  return [...byDate.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

async function fetchSupabaseHistory<T extends HealthSnapshot>() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("health_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  if (error || !data) throw new Error("Could not load your history. Please retry.");
  if (localStorage.getItem(currentUserKey) !== user.id) throw new Error("Your account changed. Reload to continue.");
  return data.map((row) => rowToSnapshot(row as SupabaseSnapshotRow)) as T[];
}

async function syncSnapshotToSupabase(snapshot: HealthSnapshot, owner: string | null) {
  if (!isSupabaseConfigured()) return false;

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!owner || !user || !session || user.id !== owner || localStorage.getItem(currentUserKey) !== owner) return false;
  try { await migrateEmbeddedMealImages(snapshot, owner); }
  catch (error) { console.error("Meal image migration failed", error); return false; }
  if (localStorage.getItem(currentUserKey) !== owner) return false;
  const safeSnapshot = stripEmbeddedMealImages(snapshot);
  const result = await syncSnapshotThroughApi(safeSnapshot, session.access_token);
  if (result) snapshot.serverUpdatedAt = result;
  return Boolean(result);
}

async function migrateEmbeddedMealImages(snapshot: HealthSnapshot, owner: string) {
  if (!Array.isArray(snapshot.meals)) return;
  let changed = false;
  for (const meal of snapshot.meals) {
    if (!meal || typeof meal !== "object") continue;
    const record = meal as Record<string, unknown>;
    if (typeof record.image !== "string" || !record.image.startsWith("data:image/jpeg;base64,")) continue;
    const blob = await (await fetch(record.image)).blob();
    record.image = await uploadMealImage(blob, snapshot.date, String(record.type ?? "meal"), owner);
    changed = true;
  }
  if (!changed || localStorage.getItem(currentUserKey) !== owner) return;
  const current = readLocalState<HealthSnapshot>();
  if (current?.date === snapshot.date && current.updatedAt === snapshot.updatedAt) localStorage.setItem(storageKey, JSON.stringify(snapshot));
  const history = readLocalHistory<HealthSnapshot>();
  if (history.some((day) => day.date === snapshot.date)) {
    localStorage.setItem(historyKey, JSON.stringify(history.map((day) => day.date === snapshot.date && day.updatedAt === snapshot.updatedAt ? snapshot : day)));
  }
}

async function syncSnapshotThroughApi(snapshot: HealthSnapshot, accessToken: string) {
  try {
    const response = await fetch("/api/sync/snapshot", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...snapshot, expectedUpdatedAt: snapshot.serverUpdatedAt ?? null }),
    });

    if (!response.ok) {
      if (response.status === 409) reportSyncStatus("conflict");
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      console.error("Health snapshot API sync failed", payload?.error ?? response.statusText);
      return false;
    }

    const payload = await response.json() as { updatedAt?: string };
    return payload.updatedAt || false;
  } catch (error) {
    console.error("Health snapshot API sync failed", error);
    return false;
  }
}

function rowToSnapshot(row: SupabaseSnapshotRow): HealthSnapshot {
  return {
    ...(row.payload ?? {}),
    serverUpdatedAt: row.updated_at,
    syncPending: false,
    clientId: row.client_id,
    userId: row.user_id ?? undefined,
    date: row.date,
    profile: row.profile ?? {},
    meals: row.meals ?? [],
    water: row.water ?? 0,
    sleep: row.sleep ?? {},
    sleepCheckCompleted: row.sleep_check_completed ?? false,
    quoteIndex: row.quote_index ?? 0,
    quoteFeedback: row.quote_feedback ?? null,
    onboardingCompleted: row.onboarding_completed ?? true,
    notificationPreference: row.notification_preference ?? null,
    updatedAt: row.updated_at ?? undefined,
  };
}
