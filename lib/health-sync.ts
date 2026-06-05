import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const storageKey = "daily-health-companion";
export const historyKey = "daily-health-history";
export const adminUsersKey = "daily-health-admin-users";

const clientIdKey = "daily-health-client-id";
const currentUserKey = "daily-health-current-user";

type HealthState = {
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
  const currentUserId = localStorage.getItem(currentUserKey);
  if (currentUserId && currentUserId !== userId) {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(historyKey);
    localStorage.removeItem(clientIdKey);
  }

  localStorage.setItem(currentUserKey, userId);
}

export function readLocalState<T>() {
  const saved = localStorage.getItem(storageKey);
  return saved ? (JSON.parse(saved) as T) : null;
}

export function readLocalHistory<T>() {
  const saved = localStorage.getItem(historyKey);
  return saved ? (JSON.parse(saved) as T[]) : [];
}

export async function saveHealthState(state: HealthState) {
  const snapshot = createTodaySnapshot(normalizeStateTimezone(state));
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
  return syncSnapshotToSupabase(snapshot);
}

export async function saveHealthHistory(snapshot: HealthSnapshot) {
  const nextHistory = mergeHistory(snapshot, readLocalHistory<HealthSnapshot>());
  localStorage.setItem(historyKey, JSON.stringify(nextHistory));
  return syncSnapshotToSupabase(snapshot);
}

export async function saveHealthStateWithHistory(state: HealthState) {
  const snapshot = createTodaySnapshot(normalizeStateTimezone(state));
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
  return saveHealthHistory(snapshot);
}

export async function syncCurrentLocalStateToSupabase() {
  const state = readLocalState<HealthState>() ?? createDefaultHealthState();

  return saveHealthStateWithHistory(state);
}

function createDefaultHealthState(): HealthState {
  const timezone = getBrowserTimezone();
  const profile = {
    name: "Sweetheart",
    wakeTime: "07:00",
    breakfastTime: "08:30",
    lunchTime: "13:00",
    dinnerTime: "20:00",
    sleepReminder: "22:30",
    waterGoal: 2500,
    timezone,
  };

  return {
    onboardingCompleted: true,
    profile,
    meals: [
      createDefaultMeal("breakfast", profile.breakfastTime),
      createDefaultMeal("lunch", profile.lunchTime),
      createDefaultMeal("dinner", profile.dinnerTime),
    ],
    water: 0,
    sleep: {
      sleptAt: "23:15",
      wokeAt: profile.wakeTime,
      hours: 7,
      minutes: 30,
      quality: "Okay",
    },
    sleepCheckCompleted: false,
    quoteIndex: 0,
    quoteFeedback: null,
    notificationPreference: "enabled",
  };
}

function createDefaultMeal(type: "breakfast" | "lunch" | "dinner", time: string) {
  return {
    type,
    plannedTime: time,
    actualTime: time,
    description: "",
    image: "",
    hunger: 3,
    fullness: 3,
    notes: "",
    status: "pending",
  };
}

export async function loadSyncedHistory<T extends HealthSnapshot>() {
  const localHistory = readLocalHistory<T>();
  const remoteHistory = await fetchSupabaseHistory<T>();
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

function createTodaySnapshot(state: HealthState): HealthSnapshot {
  return {
    ...state,
    date: getLocalDateForState(state),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStateTimezone(state: HealthState): HealthState {
  if (!isPlainRecord(state.profile)) return state;

  const browserTimezone = getBrowserTimezone();
  const savedTimezone = typeof state.profile.timezone === "string" ? state.profile.timezone : "";
  const shouldAutoFixTimezone =
    !savedTimezone ||
    savedTimezone === "UTC" ||
    (savedTimezone === "Asia/Kolkata" && browserTimezone !== "Asia/Kolkata");

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

  if (error || !data) return [];
  return data.map((row) => rowToSnapshot(row as SupabaseSnapshotRow)) as T[];
}

async function syncSnapshotToSupabase(snapshot: HealthSnapshot) {
  if (!isSupabaseConfigured()) return false;

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (user && session) {
    const synced = await syncSnapshotThroughApi(snapshot, session.access_token);
    if (synced) return true;
  }

  const { error } = await supabase.from("health_snapshots").upsert(
    {
      user_id: user?.id ?? null,
      client_id: user?.id ?? getClientId(),
      date: snapshot.date,
      profile: snapshot.profile ?? {},
      meals: snapshot.meals ?? [],
      water: snapshot.water ?? 0,
      sleep: snapshot.sleep ?? {},
      sleep_check_completed: snapshot.sleepCheckCompleted ?? false,
      quote_index: snapshot.quoteIndex ?? 0,
      quote_feedback: stringifyValue(snapshot.quoteFeedback),
      onboarding_completed: snapshot.onboardingCompleted ?? true,
      notification_preference: stringifyValue(snapshot.notificationPreference),
      payload: snapshot,
      updated_at: snapshot.updatedAt ?? new Date().toISOString(),
    },
    { onConflict: user ? "user_id,date" : "client_id,date" },
  );

  if (error) {
    console.error("Health snapshot sync failed", error.message);
    return false;
  }

  return true;
}

async function syncSnapshotThroughApi(snapshot: HealthSnapshot, accessToken: string) {
  try {
    const response = await fetch("/api/sync/snapshot", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      console.error("Health snapshot API sync failed", payload?.error ?? response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Health snapshot API sync failed", error);
    return false;
  }
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function rowToSnapshot(row: SupabaseSnapshotRow): HealthSnapshot {
  return {
    ...(row.payload ?? {}),
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
