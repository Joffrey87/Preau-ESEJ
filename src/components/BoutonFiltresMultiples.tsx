"use client";

/**
 * Interrupteur « Plusieurs choix » en fin de rangée de filtres : activé, chaque clic AJOUTE un filtre (pastille ou tuile)
 * au lieu de remplacer le précédent ; les filtres actifs se cumulent (voir `useFiltresMultiples`).
 */
export default function BoutonFiltresMultiples({
  actif,
  onClick,
  nombre,
}: {
  actif: boolean;
  onClick: () => void;
  /** Nombre de filtres actuellement cumulés (affiché à côté quand le mode est actif). */
  nombre?: number;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={actif}
      onClick={onClick}
      title={actif ? "Plusieurs choix activé : chaque clic ajoute un filtre" : "Activer pour cumuler plusieurs filtres"}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
        actif ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${actif ? "bg-accent" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface transition-all ${actif ? "left-3" : "left-0.5"}`} />
      </span>
      Plusieurs choix
      {actif && nombre ? <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-fg">{nombre}</span> : null}
    </button>
  );
}

/** Case ☐/☑ à placer devant le libellé d'une pastille quand le mode « plusieurs » est actif. */
export function CasePastille({ coche }: { coche: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mr-1.5 inline-block h-3 w-3 shrink-0 rounded-[3px] border align-[-1px] ${
        coche ? "border-accent bg-accent" : "border-current opacity-60"
      }`}
    />
  );
}
