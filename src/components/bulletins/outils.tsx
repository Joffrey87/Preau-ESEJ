"use client";

import { construireSynthese, estSynthese, statutDe, type ContexteClasse, type Enseignant, type ResultatEleve, type Statut, type Synthese } from "@/lib/bulletins";

/** Synthèse d'un bulletin : celle figée s'il est publié, sinon celle du moment (aperçu, PDF, publication). */
export function syntheseDe(r: ResultatEleve, ctx: ContexteClasse, titulaire: string | null, enseignants: Map<string, Enseignant>): Synthese {
  const b = r.bulletin;
  if (b?.statut === "publie" && estSynthese(b.synthese)) return b.synthese;
  // Bulletin repris en entier d'École Futée (sans matières ni notes dans Préau) : sa synthèse est la référence.
  if (b?.source === "ecole-futee" && estSynthese(b.synthese) && ctx.groupes.length === 0) return b.synthese;
  return construireSynthese(r, { classe: ctx.classe, periode: ctx.periode, titulaire, enseignants });
}

export function PastilleStatut({ statut }: { statut: Statut }) {
  const s = statutDe(statut);
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${s.classe}`}>{s.label}</span>;
}

export const dateFr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

/** Bouton d'action groupée, avec son compteur. */
export function BoutonLot({
  children,
  n,
  onClick,
  fort = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  n?: number;
  onClick: () => void;
  fort?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || n === 0}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-opacity disabled:opacity-40 ${
        fort ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border bg-surface hover:bg-surface-2"
      }`}
    >
      {children}
      {n !== undefined && <span className={`rounded-full px-1.5 text-[11px] ${fort ? "bg-white/20" : "bg-surface-2"}`}>{n}</span>}
    </button>
  );
}
