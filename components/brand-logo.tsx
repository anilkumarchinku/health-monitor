type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  dark?: boolean;
};

export function BrandLogo({ className = "", compact = false, dark = false }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/icon.svg"
        alt="Dee Meal Monitor System"
        className={`shrink-0 rounded-full bg-white object-cover p-1 shadow-sm ${compact ? "h-11 w-11" : "h-12 w-12"}`}
      />
      {!compact && (
        <div className="leading-tight">
          <p className={`text-3xl font-bold tracking-normal ${dark ? "text-white" : "text-primary"}`}>
            Dee
          </p>
          <p className={`hidden text-xs font-bold uppercase tracking-wide ${dark ? "text-white/70" : "text-muted-foreground"}`}>
            Meal Monitor System
          </p>
        </div>
      )}
    </div>
  );
}
