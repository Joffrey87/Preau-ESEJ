"use client";

import { useState } from "react";
import { enregistrerTout, useSauvegardeAuto } from "@/lib/sauvegardeAuto";
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

/** Hauteur d'une zone de texte ajustée à son contenu (tout le texte visible). */
export const ajusterHauteur = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
};

/**
 * Zone d'appréciation extensible : sa hauteur suit le texte, qui reste visible en entier pendant la saisie comme
 * après (à l'affichage et à chaque frappe). À répandre sur un <textarea> (n'occupe ni onChange ni onBlur).
 */
// Fenêtre redimensionnée : le texte se recoupe autrement, la hauteur de chaque zone extensible est recalculée.
let ecouteRedimension = false;
function suivreRedimension() {
  if (ecouteRedimension || typeof window === "undefined") return;
  ecouteRedimension = true;
  let image = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(image);
    image = requestAnimationFrame(() => document.querySelectorAll<HTMLTextAreaElement>("textarea[data-extensible]").forEach(ajusterHauteur));
  });
}

export const extensible = {
  "data-extensible": "",
  ref: (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    suivreRedimension();
    ajusterHauteur(el);
  },
  onInput: (e: React.FormEvent<HTMLTextAreaElement>) => ajusterHauteur(e.currentTarget),
};

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

/**
 * Zone d'appréciation enregistrée automatiquement (frappe, sortie, démontage, onglet masqué, bouton « Enregistrer ») et
 * extensible (tout le texte visible). `onEnregistrer` renvoie un message d'erreur, ou null.
 */
export function ZoneAppreciation({
  valeur,
  onEnregistrer,
  readOnly = false,
  className,
  placeholder,
  rows = 2,
  autoFocus = false,
}: {
  valeur: string;
  onEnregistrer: (texte: string) => Promise<string | null>;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const { valeur: texte, changer, envoyer, etat, erreur } = useSauvegardeAuto(valeur, onEnregistrer);
  return (
    <div className="w-full">
      <textarea
        value={texte}
        readOnly={readOnly}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => !readOnly && changer(e.target.value)}
        onBlur={() => void envoyer()}
        className={className}
        {...extensible}
      />
      {/* Pas d'état « Enregistré » à chaque champ (une mention unique en bas de page) : seules les erreurs s'affichent. */}
      {!readOnly && etat === "erreur" && <div className="text-[10.5px] text-negative">Échec de l&apos;enregistrement : {erreur ?? ""}</div>}
    </div>
  );
}

/**
 * Bouton « Enregistrer » : envoie aussitôt toutes les saisies en attente (notes, appréciations), confirme, puis
 * `onFini` (par exemple : revenir au relevé de notes).
 */
export function BoutonEnregistrer({ libelle = "Enregistrer", onFini, mention = true }: { libelle?: string; onFini?: () => void; mention?: boolean }) {
  const [etat, setEtat] = useState<"" | "envoi" | "ok">("");
  const cliquer = async () => {
    setEtat("envoi");
    // La case ou la zone en cours de saisie part d'abord (sortie du champ), puis tout ce qui attend.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await enregistrerTout();
    setEtat("ok");
    window.setTimeout(() => {
      setEtat("");
      onFini?.();
    }, 700);
  };
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        type="button"
        onClick={cliquer}
        disabled={etat === "envoi"}
        className="rounded-lg border border-gold/50 bg-gold-soft/40 px-5 py-2 text-[13.5px] font-semibold text-gold hover:bg-gold-soft disabled:opacity-60"
      >
        {etat === "envoi" ? "Enregistrement…" : etat === "ok" ? "✓ Enregistré" : libelle}
      </button>
    </div>
  );
}
