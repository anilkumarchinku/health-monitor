import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const storageKey = "daily-health-companion";
export const historyKey = "daily-health-history";
export const adminUsersKey = "daily-health-admin-users";

const clientIdKey = "daily-health-client-id";

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

export function readLocalState<T>() {
  const saved = localStorage.getItem(storageKey);
  return saved ? (JSON.parse(saved) as T) : null;
}

export function readLocalHistory<T>() {
  const saved = localStorage.getItem(historyKey);
  return saved ? (JSON.parse(saved) as T[]) : [];
}

export async function saveHealthState(state: HealthState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
  await syncSnapshotToSupabase(createTodaySnapshot(state));
}

export async function saveHealthHistory(snapshot: HealthSnapshot) {
  const nextHistory = mergeHistory(snapshot, readLocalHistory<HealthSnapshot>());
  localStorage.setItem(historyKey, JSON.stringify(nextHistory));
  await syncSnapshotToSupabase(snapshot);
}

export async function saveHealthStateWithHistory(state: HealthState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
  await saveHealthHistory(createTodaySnapshot(state));
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

function createTodaySnapshot(state: HealthState): HealthSnapshot {
  return {
    ...state,
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
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
  if (!isSupabaseConfigured()) return;

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("health_snapshots").upsert(
    {
      user_id: user?.id ?? null,
      client_id: getClientId(),
      date: snapshot.date,
      profile: snapshot.profile ?? {},
      meals: snapshot.meals ?? [],
      water: snapshot.water ?? 0,
      sleep: snapshot.sleep ?? {},
      sleep_check_completed: snapshot.sleepCheckCompleted ?? false,
      quote_index: snapshot.quoteIndex ?? 0,
      quote_feedback: snapshot.quoteFeedback ?? null,
      onboarding_completed: snapshot.onboardingCompleted ?? true,
      notification_preference: snapshot.notificationPreference ?? null,
      payload: snapshot,
      updated_at: snapshot.updatedAt ?? new Date().toISOString(),
    },
    { onConflict: user ? "user_id,date" : "client_id,date" },
  );
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
