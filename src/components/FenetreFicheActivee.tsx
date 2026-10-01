"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COLONNES_ACTIVEE, type FicheActivee } from "@/lib/fichesAide";

type Cadre = { x: number; y: number; w: number; h: number };
const cle = (id: string) => `aide.fenetre.${id}`;

/**
 * Fenêtre volante d'une fiche activée : étapes à cocher (enregistrées au fil de
 * l'eau), déplaçable par sa barre de titre, redimensionnable par son coin.
 * Position et taille sont retenues sur l'appareil.
 */
export default function FenetreFicheActivee({
  fiche,
  rang,
  onChange,
  onFermer,
  onRetirer,
}: {
  fiche: FicheActivee;
  /** Rang d'ouverture : décale les fenêtres pour qu'elles ne se superposent pas. */
  rang: number;
  onChange: (f: FicheActivee) => void;
  onFermer: () => void;
  /** Fiche terminée ou abandonnée : elle quitte la liste. */
  onRetirer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Position initiale : celle retenue, sinon au-dessus de l'ampoule, décalée selon le rang.
  useEffect(() => {
    let c: Cadre | null = null;
    try {
      c = JSON.parse(localStorage.getItem(cle(fiche.id)) ?? "null");
    } catch {}
    const w = Math.min(360, window.innerWidth - 40);
    const h = Math.min(420, window.innerHeight - 140);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCadre(
      c ?? {
        x: Math.max(20, window.innerWidth - w - 90 - rang * 24),
        y: Math.max(20, window.innerHeight - h - 100 - rang * 24),
        w,
        h,
      },
    );
  }, [fiche.id, rang]);

  const retenir = (c: Cadre) => {
    try {
      localStorage.setItem(cle(fiche.id), JSON.stringify(c));
    } catch {}
  };

  // Redimensionnement par le coin (CSS « resize ») : on retient la taille.
  useEffect(() => {
    const el = boite.current;
    if (!el || !cadre) return;
    const obs = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (Math.abs(w - cadre.w) > 2 || Math.abs(h - cadre.h) > 2) {
        const c = { ...cadre, w, h };
        setCadre(c);
        retenir(c);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadre]);

  function deplacer(e: React.PointerEvent) {
    if (!cadre || (e.target as HTMLElement).closest("button")) return;
    const dx = e.clientX - cadre.x;
    const dy = e.clientY - cadre.y;
    let dernier = cadre;
    const bouge = (ev: PointerEvent) => {
      dernier = {
        ...cadre,
        x: Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 80),
        y: Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40),
      };
      setCadre(dernier);
    };
    const fin = () => {
      window.removeEventListener("pointermove", bouge);
      window.removeEventListener("pointerup", fin);
      retenir(dernier);
    };
    window.addEventListener("pointermove", bouge);
    window.addEventListener("pointerup", fin);
  }

  async function enregistrer(patch: Partial<FicheActivee>, retirer = false) {
    setErreur(null);
    const { data, error } = await createClient()
      .from("fiches_aide_activees")
      .update(patch)
      .eq("id", fiche.id)
      .select(COLONNES_ACTIVEE)
      .single();
    if (error || !data) return setErreur("Enregistrement impossible : " + (error?.message ?? "erreur inconnue"));
    if (retirer) onRetirer();
    else onChange(data as FicheActivee);
  }

  function cocher(k: number) {
    const etapes = fiche.etapes.map((e, i) =>
      i === k ? { ...e, fait: !e.fait, fait_le: !e.fait ? new Date().toISOString() : null } : e,
    );
    onChange({ ...fiche, etapes }); // affichage immédiat
    void enregistrer({ etapes });
  }

  if (!cadre) return null;
  const faites = fiche.etapes.filter((e) => e.fait).length;
  const toutFait = fiche.etapes.length > 0 && faites === fiche.etapes.length;

  return (
    <div
      ref={boite}
      role="dialog"
      aria-label={fiche.titre}
      style={{ left: cadre.x, top: cadre.y, width: cadre.w, height: cadre.h, resize: "both" }}
      className="no-print fixed z-40 flex min-h-[180px] min-w-[260px] flex-col overflow-hidden rounded-xl border-2 border-amber-500/70 bg-surface shadow-xl shadow-black/25"
    >
      <div
        onPointerDown={deplacer}
        className="flex cursor-move select-none items-center justify-between gap-2 bg-amber-50 px-3 py-2 dark:bg-amber-900/30"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{fiche.titre}</div>
          <div className="text-[11px] text-amber-700 dark:text-amber-300">
            {faites}/{fiche.etapes.length} étape{fiche.etapes.length > 1 ? "s" : ""}
          </div>
        </div>
        <button type="button" onClick={onFermer} title="Réduire (rappel par l'ampoule)" aria-label="Réduire" className="rounded p-1 text-muted hover:bg-amber-100 dark:hover:bg-amber-900/40">
          —
        </button>
      </div>

      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {fiche.etapes.map((e, k) => (
          <li key={k}>
            <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
              <input type="checkbox" checked={e.fait} onChange={() => cocher(k)} className="mt-1 accent-amber-600" />
              <span className={e.fait ? "text-muted line-through" : ""}>
                <span className="mr-1 tabular-nums text-muted">{k + 1}.</span>
                {e.texte}
              </span>
            </label>
          </li>
        ))}
      </ol>

      {erreur && <p className="px-3 text-xs text-negative">{erreur}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => window.confirm("Abandonner cette fiche activée ?") && enregistrer({ archivee_le: new Date().toISOString() }, true)}
          className="text-muted hover:text-negative"
        >
          Abandonner
        </button>
        <button
          type="button"
          onClick={() => enregistrer({ terminee_le: new Date().toISOString() }, true)}
          className={`rounded-lg px-3 py-1 font-medium ${toutFait ? "bg-amber-600 text-white" : "border border-border hover:bg-surface-2"}`}
        >
          Terminer
        </button>
      </div>
    </div>
  );
}
