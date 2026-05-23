"use client";

import { useEffect } from "react";

export function ReminderSound() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("reminderSound") !== "1") return;

    url.searchParams.delete("reminderSound");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

    const audio = new Audio("/reminder.wav");
    audio.volume = 0.75;
    void audio.play().catch(() => {
      const playAfterTap = () => {
        void audio.play();
        window.removeEventListener("pointerdown", playAfterTap);
      };
      window.addEventListener("pointerdown", playAfterTap, { once: true });
    });
  }, []);

  return null;
}
