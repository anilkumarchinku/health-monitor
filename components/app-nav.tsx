"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  History,
  Home,
  LogIn,
  LogOut,
  Menu,
  Shield,
  TimerReset,
  Utensils,
  User,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import {
  enablePushNotifications,
  sendTestPushNotification,
} from "@/lib/push-notifications";

type AppNavProps = {
  title?: string;
  signedIn?: boolean;
  onResetToday?: () => void;
  compactBrand?: boolean;
};

export function AppNav({
  title = "Good morning",
  signedIn = true,
  onResetToday,
  compactBrand = false,
}: AppNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("Enable notifications");

  async function enableNotifications() {
    const result = await enablePushNotifications();
    setNotificationStatus(result === "enabled" ? "Notifications enabled" : "Notifications not enabled");
  }

  async function sendTestNotification() {
    setNotificationStatus("Sending test push");
    const result = await sendTestPushNotification();
    setNotificationStatus(result === "sent" ? "Test push sent" : "Enable notifications first");
  }

  return (
    <>
      <nav className="fixed inset-x-3 top-3 z-50 sm:inset-x-5">
        <div className="glass-shell mx-auto max-w-7xl rounded-lg">
          <div className="relative flex flex-row items-start justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-start gap-3">
              <BrandLogo className="shrink-0" compact={compactBrand} />
              <div className="min-w-0 pt-1">
                <h1 className="truncate text-lg font-semibold leading-tight tracking-normal sm:text-2xl">
                  {title}
                </h1>
              </div>
            </div>

            <Button
              className="h-11 w-11 shrink-0 bg-white/75 backdrop-blur"
              variant="outline"
              size="icon"
              aria-expanded={menuOpen}
              title={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((current) => !current)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>

            {menuOpen && (
              <div className="absolute right-4 top-16 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-white/60 bg-white/95 p-2 shadow-soft backdrop-blur-xl sm:right-6 lg:right-8">
                {signedIn ? (
                  <>
                    <NavButton icon={<Bell />} label={notificationStatus} onClick={enableNotifications} />
                    <NavButton icon={<Bell />} label="Test push" onClick={sendTestNotification} />
                    <NavLink icon={<Home />} label="Dashboard" href="/" />
                    <NavLink icon={<Utensils />} label="Meal check-in" href="/meal/lunch" />
                    <NavLink icon={<History />} label="History" href="/history" />
                    <NavLink icon={<User />} label="Profile" href="/profile" />
                    <NavLink icon={<Shield />} label="Admin" href="/admin" />
                    {onResetToday && (
                      <NavButton
                        icon={<TimerReset />}
                        label="Reset today"
                        onClick={() => {
                          onResetToday();
                          setMenuOpen(false);
                        }}
                        dark
                      />
                    )}
                    <NavButton icon={<LogOut />} label="Sign out" onClick={() => void signOut()} />
                  </>
                ) : (
                  <>
                    <NavLink icon={<LogIn />} label="Sign in" href="/auth" />
                    <NavLink icon={<Home />} label="Dashboard" href="/" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
      <div className="h-[94px] sm:h-[86px]" aria-hidden />
    </>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  dark = false,
}: {
  icon: React.ReactElement;
  label: string;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition active:scale-[0.98] ${
        dark ? "bg-zinc-950 text-white hover:bg-zinc-800" : "hover:bg-zinc-950/5"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NavLink({
  icon,
  label,
  href,
}: {
  icon: React.ReactElement;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-zinc-950/5 active:scale-[0.98]"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
