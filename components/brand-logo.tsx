import { Leaf } from "lucide-react";
type BrandLogoProps = { className?: string; compact?: boolean; dark?: boolean };
export function BrandLogo({ className = "", compact = false, dark = false }: BrandLogoProps) {
  return <div className={`flex items-center gap-2.5 ${dark ? "text-white" : "text-foreground"} ${className}`}><Leaf aria-hidden="true" className="h-7 w-7 shrink-0 text-primary" strokeWidth={2} />{!compact && <span className="text-lg font-bold tracking-tight sm:text-xl">Health Monitor</span>}</div>;
}
