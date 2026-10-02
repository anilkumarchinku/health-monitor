"use client";

import { useEffect, useState } from "react";
import { getMealImageUrl } from "@/lib/meal-images";

export function MealImage({ image, alt, className }: { image: string; alt: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    void getMealImageUrl(image).then((value) => { if (active) setUrl(value); });
    return () => { active = false; };
  }, [image]);
  if (!url) return null;
  // Signed Storage URLs expire and are created per viewer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
