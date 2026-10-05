"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import ReporterFamille from "@/components/ReporterFamille";

type Modif = {
  id: string;
  famille_id: string;
  champ: string;
  ancien: string | null;
  nouveau: string | null;
  modifie_le: string;
};
type FamilleLue = {
  id: string;
  nom: string;
  revalide_annee: number | null;
  adresse: string | null;
  cp_ville: string | null;
  parent1_prenom: string | null;
  parent1_nom: string | null;
  parent1_telephone: string | null;
  parent1_courriel: string | null;
  parent2_prenom: string | null;
  parent2_nom: string | null;
  parent2_telephone: string | null;
  parent2_courriel: string | null;
};

const LIBELLE: Record<string, string> = {
  adresse: "Adresse",
  cp_ville: "Code postal et ville",
  parent1_prenom: "Monsieur — prénom",
  parent1_nom: "Monsieur — nom",
  parent1_telephone: "Monsieur — téléphone",
  parent1_courriel: "Monsieur — courriel",
  parent2_prenom: "Madame — prénom",
  parent2_nom: "Madame — nom",
  parent2_telephone: "Madame — téléphone",
  parent2_courriel: "Madame — courriel",
};

/**
 * Alerte ambre « À valider — Modification Famille » : les familles modifient leurs coordonnées dans leur espace ;
 * la fiche est mise à jour tout de suite, et reste signalée ici jusqu'à ce que le bureau la marque « vue » (ou
 * l'annule : l'ancienne valeur est restaurée). Après « Vu », on peut reporter les nouvelles coordonnées sur le
 * contact du carnet et la fiche donateur correspondants. Suivi de la revalidation annuelle en dessous.
 */
export default function ModificationsFamilles({ campagne }: { campagne: number | null }) {
  const router = useRouter();
  const [modifs, setModifs] = useState<Modif[]>([]);
  const [familles, setFamilles] = useState<Map<string, FamilleLue>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aReporter, setAReporter] = useState<FamilleLue | null>(null);
  const [suiviOuvert, setSuiviOuvert] = useState(false);

  const charger = useCallback(async () => {
    const supabase = createClient();
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from("familles_modifications").select("id, famille_id, champ, ancien, nouveau, modifie_le").is("vu_le", null).order("modifie_le"),
      supabase
        .from("familles")
        .select(
          "id, nom, revalide_annee, adresse, cp_ville, parent1_prenom, parent1_nom, parent1_telephone, parent1_courriel, parent2_prenom, parent2_nom, parent2_telephone, parent2_courriel",
        )
        .order("nom"),
    ]);
    setModifs((m ?? []) as Modif[]);
    setFamilles(new Map(((f ?? []) as FamilleLue[]).map((x) => [x.id, x])));
  }, []);

  useEffect(() => {
    // Lecture initiale des données (système externe : la base).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const parFamille = new Map<string, Modif[]>();
  for (const m of modifs) (parFamille.get(m.famille_id) ?? parFamille.set(m.famille_id, []).get(m.famille_id)!).push(m);
  const toutes = [...familles.values()];
  const restantes = campagne === null ? [] : toutes.filter((f) => f.revalide_annee !== campagne);

  async function vues(ids: string[], cle: string) {
    setBusy(cle);
    setErreur(null);
    const { error } = await createClient().rpc("famille_modifications_vues", { p_ids: ids });
    setBusy(null);
    if (error) return setErreur(error.message);
    await charger();
    router.refresh();
  }
  async function annuler(id: string) {
    if (!window.confirm("Annuler cette modification ? L'ancienne valeur sera restaurée sur la fiche de la famille.")) return;
    setBusy(id);
    setErreur(null);
    const { error } = await createClient().rpc("famille_modification_annuler", { p_id: id });
    setBusy(null);
    if (error) return setErreur(error.message);
    await charger();
    router.refresh();
  }

  if (parFamille.size === 0 && (campagne === null || toutes.length === 0)) return null;

  return (
    <div className="mb-5 space-y-3">
      {parFamille.size > 0 && (
        <section className="rounded-xl border border-gold/50 bg-gold/15 p-4">
          <h2 className="text-sm font-semibold">
            <span className="mr-2 rounded-full bg-gold px-2 py-0.5 text-xs font-medium text-white">À valider</span>
            Modification Famille ({parFamille.size} famille{parFamille.size > 1 ? "s" : ""})
          </h2>
          <p className="mt-1 text-xs text-muted">
            Les familles ont modifié leurs coordonnées dans leur espace : la fiche famille est déjà à jour. Marquez « Vu » une fois relu, ou annulez une
            modification (l&apos;ancienne valeur revient).
          </p>
          <ul className="mt-3 space-y-3">
            {[...parFamille].map(([fid, liste]) => {
              const fam = familles.get(fid);
              return (
                <li key={fid} className="rounded-lg border border-gold/40 bg-surface p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Famille {fam?.nom ?? "—"}</span>
                    <span className="flex flex-wrap gap-2">
                      {fam && (
                        <button
                          type="button"
                          onClick={() => setAReporter(fam)}
                          className="rounded border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                          title="Reporter ces coordonnées sur le contact du carnet et la fiche donateur correspondants"
                        >
                          Reporter sur carnet / donateur…
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void vues(liste.map((m) => m.id), fid)}
                        disabled={busy !== null}
                        className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                      >
                        {busy === fid ? "…" : "Vu"}
                      </button>
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {liste.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-x-2">
                        <span className="w-44 shrink-0 text-muted">{LIBELLE[m.champ] ?? m.champ}</span>
                        <span className="text-muted line-through">{m.ancien || "—"}</span>
                        <span aria-hidden="true">→</span>
                        <span className="font-medium">{m.nouveau || "—"}</span>
                        <span className="text-muted/70">({formatDate(m.modifie_le.slice(0, 10))})</span>
                        <button
                          type="button"
                          onClick={() => void annuler(m.id)}
                          disabled={busy !== null}
                          className="ml-auto text-muted underline hover:text-foreground disabled:opacity-50"
                        >
                          Annuler
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {erreur && <p className="mt-2 text-xs text-negative">{erreur}</p>}
        </section>
      )}

      {campagne !== null && toutes.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <button type="button" onClick={() => setSuiviOuvert((o) => !o)} className="flex w-full items-center justify-between text-left" aria-expanded={suiviOuvert}>
            <h2 className="text-sm font-semibold">
              Revalidation annuelle des coordonnées — {toutes.length - restantes.length} / {toutes.length} familles
            </h2>
            <span className="text-xs text-muted">{suiviOuvert ? "Masquer" : restantes.length > 0 ? `${restantes.length} à relancer` : "Toutes validées"}</span>
          </button>
          {suiviOuvert && (
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2 md:grid-cols-3">
              {toutes.map((f) => {
                const ok = f.revalide_annee === campagne;
                return (
                  <li key={f.id} className={`flex items-center gap-2 rounded px-2 py-1 ${ok ? "text-positive" : "text-gold"}`}>
                    <span aria-hidden="true">{ok ? "✓" : "○"}</span>
                    <span className="text-foreground">{f.nom}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aReporter && <ReporterFamille famille={aReporter} onClose={() => setAReporter(null)} />}
    </div>
  );
}
