"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { DOMAINES, STATUTS, statutVente } from "@/lib/ventes";

type LigneDetail = {
  id: string;
  exercice_id: string;
  date_vente: string;
  domaine: "ecole" | "evenement";
  objet: string;
  quantite: number | null;
  montant: number;
  paye: number;
  mode: string;
  notes: string | null;
  saisi_par: string | null;
  operations: { id: string; date: string; libelle: string; exercice_id: string | null }[];
};

const MODE_LIB: Record<string, string> = { virement: "Virement", cheque: "Chèque", liquide: "Liquide" };

/** Panneau latéral : toutes les ventes d'une famille / personne, par année scolaire, avec historique. */
export default function PanneauVentesPayeur({
  cle,
  libelle,
  exercices,
  exerciceId,
  estTresorier,
  peutModifier,
  onClose,
}: {
  cle: string; // « f:<id> » ou « c:<id> »
  libelle: string;
  exercices: { id: string; libelle: string; date_debut?: string; date_fin?: string }[];
  exerciceId: string;
  estTresorier: boolean;
  peutModifier: boolean;
  onClose: () => void;
}) {
  const [lignes, setLignes] = useState<LigneDetail[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [annee, setAnnee] = useState(exerciceId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const fermer = useRef(onClose);
  useEffect(() => {
    fermer.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let annule = false;
    const [k, id] = [cle.slice(0, 1), cle.slice(2)];
    createClient()
      .rpc("ventes_detail_payeur", { p_famille: k === "f" ? id : null, p_contact: k === "c" ? id : null })
      .then(({ data, error }) => {
        if (annule) return;
        if (error) return setErreur(error.message);
        const l = ((data ?? []) as LigneDetail[]).map((x) => ({ ...x, montant: Number(x.montant), paye: Number(x.paye) }));
        setLignes(l);
        setNotes(Object.fromEntries(l.map((x) => [x.id, x.notes ?? ""])));
      });
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer.current();
    window.addEventListener("keydown", echap);
    return () => {
      annule = true;
      window.removeEventListener("keydown", echap);
    };
  }, [cle]);

  // Année scolaire en cours (1er septembre → 31 août).
  const aujourdhui = todayISO();
  const anneeCourante =
    exercices.find((e) => e.date_debut && e.date_fin && e.date_debut <= aujourdhui && aujourdhui <= e.date_fin)?.id ?? exerciceId;
  const libAnnee = (id: string) => exercices.find((e) => e.id === id)?.libelle.replace(/^Exercice\s+/i, "") ?? "";

  const historique = useMemo(() => {
    const m = new Map<string, { nb: number; montant: number; paye: number }>();
    for (const l of lignes ?? []) {
      const g = m.get(l.exercice_id) ?? { nb: 0, montant: 0, paye: 0 };
      g.nb++;
      g.montant += l.montant;
      g.paye += Math.min(l.paye, l.montant);
      m.set(l.exercice_id, g);
    }
    return exercices.filter((e) => m.has(e.id)).map((e) => ({ id: e.id, ...m.get(e.id)! }));
  }, [lignes, exercices]);
  const duAnnee = (lignes ?? []).filter((l) => l.exercice_id === annee);
  const totalAnnee = duAnnee.reduce((s, l) => s + l.montant, 0);
  const payeAnnee = duAnnee.reduce((s, l) => s + Math.min(l.paye, l.montant), 0);

  async function enregistrerNote(id: string) {
    const l = lignes?.find((x) => x.id === id);
    const v = (notes[id] ?? "").trim();
    if (!l || v === (l.notes ?? "")) return;
    const { error } = await createClient().from("ventes_dues").update({ notes: v || null }).eq("id", id);
    if (error) return setErreur("Note non enregistrée : " + error.message);
    setLignes((ls) => ls?.map((x) => (x.id === id ? { ...x, notes: v || null } : x)) ?? null);
    setEnregistre(id);
    setTimeout(() => setEnregistre(null), 1500);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label={`Ventes de ${libelle}`}>
      {/* Voile léger : le tableau reste visible derrière. */}
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/10" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{libelle}</h2>
            <p className="text-xs text-muted">
              Ventes {libAnnee(annee)} · {duAnnee.length} vente{duAnnee.length > 1 ? "s" : ""} · {formatEuros(payeAnnee)} payé sur {formatEuros(totalAnnee)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2" title="Fermer (Échap)">
            ×
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
          <button
            type="button"
            onClick={() => setAnnee(anneeCourante)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${annee === anneeCourante ? "bg-accent text-accent-fg" : "border border-border hover:bg-surface-2"}`}
          >
            Tout le détail de l&apos;année
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Archives
            <select
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
            >
              {exercices.map((e) => (
                <option key={e.id} value={e.id}>
                  {libAnnee(e.id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {erreur && <p className="text-sm text-negative">{erreur}</p>}
          {lignes === null ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : duAnnee.length === 0 ? (
            <p className="text-sm text-muted">Aucune vente sur cette année scolaire.</p>
          ) : (
            <ul className="space-y-3">
              {duAnnee.map((l) => {
                const st = STATUTS.find((s) => s.v === statutVente(l.montant, l.paye))!;
                return (
                  <li key={l.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {l.objet}
                          {l.quantite ? <span className="ml-1 text-muted">× {l.quantite}</span> : null}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDate(l.date_vente)} · {DOMAINES.find((d) => d.v === l.domaine)?.label} · {MODE_LIB[l.mode] ?? l.mode}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{formatEuros(l.montant)}</div>
                        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                          {st.v === "a_payer" ? "En attente" : st.label}
                        </span>
                      </div>
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted">Opération</dt>
                      <dd className="min-w-0">
                        {l.operations.length === 0 ? (
                          <span className="text-muted">—</span>
                        ) : (
                          l.operations.map((o) =>
                            estTresorier ? (
                              <Link
                                key={o.id}
                                href={`/comptabilite?exercice=${o.exercice_id ?? annee}#op-${o.id}`}
                                className="block truncate text-accent hover:underline"
                                title="Ouvrir dans la Comptabilité"
                              >
                                {formatDate(o.date)} · {o.libelle}
                              </Link>
                            ) : (
                              <span key={o.id} className="block truncate">
                                {formatDate(o.date)} · {o.libelle}
                              </span>
                            ),
                          )
                        )}
                      </dd>
                      <dt className="text-muted">Saisi par</dt>
                      <dd>{l.saisi_par ?? "—"}</dd>
                      <dt className="pt-1 text-muted">Note</dt>
                      <dd>
                        {peutModifier ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={notes[l.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))}
                              onBlur={() => enregistrerNote(l.id)}
                              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              placeholder="Ajouter une note…"
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                            />
                            {enregistre === l.id && <span className="text-emerald-600">✓</span>}
                          </div>
                        ) : (
                          <span>{l.notes || "—"}</span>
                        )}
                      </dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}

          {historique.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Historique</h3>
              <ul className="divide-y divide-border/60 rounded-xl border border-border">
                {historique.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setAnnee(h.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2 ${h.id === annee ? "font-semibold" : ""}`}
                    >
                      <span className="flex-1">{libAnnee(h.id)}</span>
                      <span className="text-muted">
                        {h.nb} vente{h.nb > 1 ? "s" : ""}
                      </span>
                      <span className="tabular-nums">
                        {formatEuros(h.paye)} / {formatEuros(h.montant)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
