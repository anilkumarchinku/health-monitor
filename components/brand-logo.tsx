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
        className={`shrink-0 rounded-md ${compact ? "h-9 w-9" : "h-11 w-11"}`}
      />
      {!compact && (
        <div className="leading-tight">
          <p className={`text-lg font-extrabold tracking-normal ${dark ? "text-white" : "text-foreground"}`}>
            Dee
          </p>
          <p className={`text-xs font-bold uppercase tracking-wide ${dark ? "text-white/70" : "text-muted-foreground"}`}>
            Meal Monitor System
          </p>
        </div>
      )}
    </div>
  );
}
