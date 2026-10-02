"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, Utensils, Pill, ChartNoAxesColumnIncreasing, Settings, Menu, X, LogOut, Shield, Bell } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { signOut } from "@/lib/auth";

const destinations = [
  { href: "/", label: "Today", icon: Home },
  { href: "/meals", label: "Meals", icon: Utensils },
  { href: "/medicines", label: "Medicines", icon: Pill },
  { href: "/history", label: "Progress", icon: ChartNoAxesColumnIncreasing },
  { href: "/profile", label: "Settings", icon: Settings },
];

type AppNavProps = { title?: string; signedIn?: boolean; onResetToday?: () => void; compactBrand?: boolean };
export function AppNav({ signedIn = true }: AppNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const onboarding = pathname === "/onboarding";
  useEffect(() => {
    const email = localStorage.getItem("sb-user-email")?.toLowerCase();
    setAdmin(Boolean(email && (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).includes(email)));
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  const active = (href: string) => href === "/" && pathname === "/preview" ? true : href === "/meals" ? pathname === href || pathname.startsWith("/meal/") : href === "/profile" ? pathname === href || pathname === "/notifications" : pathname === href;
  return <>
    <header className="app-header">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <Link href={signedIn && !onboarding ? "/" : "/auth"} aria-label="Health Monitor home"><BrandLogo /></Link>
        {signedIn && !onboarding && <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">{destinations.map(({ href, label }) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={`rounded-xl px-3 py-3 text-sm font-semibold ${active(href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>)}</nav>}
        {signedIn && <div className="relative">
          <button ref={trigger} type="button" className="icon-button" aria-label={open ? "Close account menu" : "Open account menu"} aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(value => !value)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
          {open && <div ref={menu} id="account-menu" className="account-menu">
            <Link href="/notifications"><Bell size={18} /> Reminder settings</Link>
            {admin && <Link href="/admin"><Shield size={18} /> Admin workspace</Link>}
            <button type="button" onClick={() => void signOut()}><LogOut size={18} /> Sign out</button>
          </div>}
        </div>}
      </div>
    </header>
    {signedIn && !onboarding && <nav aria-label="Main navigation" className="bottom-navigation md:hidden"><div className="mx-auto grid max-w-lg grid-cols-5">{destinations.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={active(href) ? "active" : ""}><Icon size={23} strokeWidth={1.8} /><span>{label}</span></Link>)}</div></nav>}
  </>;
}
