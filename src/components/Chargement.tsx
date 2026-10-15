/** Indicateur de chargement : un point qui pulse, centré, avec le mot « Chargement ». */
export default function Chargement({ className = "" }: { className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted ${className}`}>
      <span className="relative flex h-3.5 w-3.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-3.5 w-3.5 animate-pulse rounded-full bg-accent" />
      </span>
      Chargement
    </div>
  );
}
