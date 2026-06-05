"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Droplets,
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
  checkNotificationDoctor,
  getPushNotificationStatus,
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
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("Enable notifications");
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!signedIn) return;

    void getPushNotificationStatus().then((result) => {
      setNotificationStatus(notificationStatusLabel(result));
    });

    setShowAdmin(isAdminBrowserUser());
  }, [signedIn]);

  async function enableNotifications() {
    const result = await enablePushNotifications();
    setNotificationStatus(notificationStatusLabel(result));
  }

  async function sendTestNotification() {
    setNotificationStatus("Sending test push");
    const result = await sendTestPushNotification();
    setNotificationStatus(testPushStatusLabel(result));
  }

  async function runNotificationDoctor() {
    setNotificationStatus("Checking notifications");
    const result = await checkNotificationDoctor();
    setNotificationStatus(result);
  }

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-black/5 bg-background/88 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="relative flex flex-row items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo className="shrink-0" compact={false} />
              {compactBrand && (
                <h1 className="hidden truncate text-base font-semibold leading-tight tracking-normal text-primary sm:block">
                  {title}
                </h1>
              )}
            </div>

            <Button
              className="h-11 w-11 shrink-0 border-0 bg-transparent text-primary shadow-none hover:bg-white/70"
              variant="outline"
              size="icon"
              aria-expanded={menuOpen}
              title={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((current) => !current)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>

            {menuOpen && (
              <div className="absolute right-0 top-14 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-[1.5rem] border border-white/70 bg-white/95 p-2 shadow-soft backdrop-blur-xl">
                {signedIn ? (
                  <>
                    <NavButton icon={<Bell />} label={notificationStatus} onClick={enableNotifications} />
                    <NavButton icon={<Bell />} label="Test push" onClick={sendTestNotification} />
                    <NavButton icon={<Bell />} label="Check notifications" onClick={runNotificationDoctor} />
                    <NavLink icon={<Bell />} label="Notification doctor" href="/notifications" />
                    <NavLink icon={<Home />} label="Dashboard" href="/" />
                    <NavLink icon={<Utensils />} label="Meal check-in" href="/meal/lunch" />
                    <NavLink icon={<History />} label="History" href="/history" />
                    <NavLink icon={<User />} label="Profile" href="/profile" />
                    {showAdmin && <NavLink icon={<Shield />} label="Admin" href="/admin" />}
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
      <div className="h-[72px]" aria-hidden />
      {signedIn && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/5 bg-white/86 px-4 py-3 backdrop-blur-2xl sm:hidden">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            <BottomNavItem href="/" icon={<CalendarDays />} label="Today" active={pathname === "/"} />
            <BottomNavItem href="/history" icon={<History />} label="History" active={pathname === "/history"} />
            <BottomNavItem href="/notifications" icon={<Droplets />} label="Water" active={pathname === "/notifications"} />
            <BottomNavItem href="/profile" icon={<User />} label="Profile" active={pathname === "/profile"} />
          </div>
        </nav>
      )}
    </>
  );
}

function isAdminBrowserUser() {
  const rawEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  if (!rawEmails) return false;

  try {
    const saved = localStorage.getItem("sb-user-email");
    const allowedEmails = rawEmails
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return Boolean(saved && allowedEmails.includes(saved.toLowerCase()));
  } catch {
    return false;
  }
}

function notificationStatusLabel(result: Awaited<ReturnType<typeof enablePushNotifications>>) {
  if (result === "enabled") return "Notifications enabled";
  if (result === "not-enabled") return "Enable notifications";
  if (result === "ios-install-required") return "iPhone: add to Home Screen first";
  if (result === "blocked") return "Notifications blocked";
  if (result === "signed-out") return "Sign in first";
  if (result === "not-configured") return "Push not configured";
  return "Notifications unsupported";
}

function testPushStatusLabel(result: Awaited<ReturnType<typeof sendTestPushNotification>>) {
  if (result === "sent") return "Test push sent";
  if (result === "no-subscription") return "Tap enable notifications again";
  if (result === "signed-out") return "Sign in first";
  if (result === "not-configured") return "Push not configured";
  return "Test push failed";
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

function BottomNavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactElement;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-full px-3 text-xs font-semibold transition ${
        active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
