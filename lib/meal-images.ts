import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const mealImageBucket = "meal-images";
export const mealImagePrefix = "meal-image:";

export function mealImagePath(image: string) {
  return image.startsWith(mealImagePrefix) ? image.slice(mealImagePrefix.length) : null;
}

export function stripEmbeddedMealImages<T extends { meals?: unknown[] }>(snapshot: T): T {
  return {
    ...snapshot,
    meals: snapshot.meals?.map((meal) => {
      if (!meal || typeof meal !== "object") return meal;
      const record = meal as Record<string, unknown>;
      return {
        ...record,
        image: typeof record.image === "string" && record.image.startsWith("data:") ? "" : record.image,
      };
    }),
  };
}

export async function uploadMealImage(blob: Blob, date: string, mealType: string, expectedUserId?: string) {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign in before uploading a meal photo.");
  if (expectedUserId && user.id !== expectedUserId) throw new Error("Account changed. Reload before uploading a meal photo.");
  const path = `${user.id}/${date}/${mealType}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(mealImageBucket).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return `${mealImagePrefix}${path}`;
}

export async function getMealImageUrl(image: string) {
  const path = mealImagePath(image);
  if (!path) return image.startsWith("data:image/") || image.startsWith("https://") ? image : "";
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return "";
  const { data, error } = await supabase.storage.from(mealImageBucket).createSignedUrl(path, 3600);
  return error ? "" : data.signedUrl;
}
