"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import { STATUTS, avancement, libellePeriode, nomEleve, note20, rangTexte, type ContexteClasse, type Enseignant, type ResultatEleve, type Statut } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import type { Droits } from "./Bulletins";
import { BoutonLot, PastilleStatut, dateFr, syntheseDe } from "./outils";

/** Liste des bulletins d'une classe pour la période : avancement, actions groupées, accès à chaque bulletin. */
export default function ListeBulletins({
  ctx,
  resultats,
  droits,
  enseignants,
  titulaire,
  onOuvrir,
  onRecharger,
}: {
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  droits: Droits;
  enseignants: Map<string, Enseignant>;
  titulaire: string | null;
  onOuvrir: (id: string) => void;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Statut | "tous">("tous");

  const lignes = useMemo(
    () =>
      [...resultats].sort((a, b) => (a.niveau ?? "").localeCompare(b.niveau ?? "") || nomEleve(a.eleve).localeCompare(nomEleve(b.eleve), "fr")),
    [resultats],
  );
  const visibles = filtre === "tous" ? lignes : lignes.filter((r) => r.bulletin?.statut === filtre);
  const ids = (st: Statut[]) => lignes.filter((r) => r.bulletin && st.includes(r.bulletin.statut)).map((r) => r.bulletin!.id);
  const compte = (st: Statut) => lignes.filter((r) => r.bulletin?.statut === st).length;
  const publies = lignes.filter((r) => r.bulletin?.statut === "publie");
  const lus = publies.filter((r) => r.bulletin?.lu_le).length;
  const selection = lignes.filter((r) => r.bulletin && choix.has(r.bulletin.id));

  async function agir(libelle: string, action: () => Promise<{ error: { message: string } | null; data?: unknown }>, confirmer?: string) {
    if (confirmer && !window.confirm(confirmer)) return;
    setOccupe(libelle);
    setMessage(null);
    const { error, data } = await action();
    setOccupe(null);
    if (error) return setMessage(`Échec : ${error.message}`);
    setMessage(`${libelle} : ${typeof data === "number" ? `${data} bulletin${data > 1 ? "s" : ""}` : "fait"}.`);
    setChoix(new Set());
    await onRecharger();
  }

  const changer = (cible: Statut, liste: string[], libelle: string, confirmer?: string) =>
    agir(libelle, async () => await sb.rpc("bulletins_changer_statut", { p_ids: liste, p_statut: cible }), confirmer);

  const publier = (liste: ResultatEleve[]) => {
    const items = liste.filter((r) => r.bulletin?.statut === "valide").map((r) => ({ id: r.bulletin!.id, synthese: syntheseDe(r, ctx, titulaire, enseignants) }));
    return agir(
      "Publication",
      async () => await sb.rpc("bulletins_publier", { p_items: items }),
      `Publier ${items.length} bulletin${items.length > 1 ? "s" : ""} ? Les familles les verront aussitôt dans leur espace (accusé de lecture suivi ici).`,
    );
  };

  async function pdf(liste: ResultatEleve[], nom: string) {
    setOccupe("PDF");
    try {
      await telechargerBulletins(liste.map((r) => syntheseDe(r, ctx, titulaire, enseignants)), nom);
    } catch (e) {
      setMessage(`PDF impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setOccupe(null);
    }
  }

  const titreLot = `Bulletins ${ctx.classe.nom} - ${libellePeriode(ctx.periode)}`;
  const peutPreparer = droits.directrice || droits.titulaire;
  const toutCoche = visibles.length > 0 && visibles.every((r) => r.bulletin && choix.has(r.bulletin.id));

  return (
    <div className="space-y-3">
      {/* Avancement : une barre par statut, cliquable pour filtrer. */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-surface-2">
          {STATUTS.map((s) => {
            const n = compte(s.v);
            return n ? <div key={s.v} className={`${s.classe.split(" ")[0]} ${s.v === "nouveau" ? "bg-border" : ""}`} style={{ width: `${(100 * n) / Math.max(1, lignes.length)}%` }} /> : null;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <button type="button" onClick={() => setFiltre("tous")} className={`rounded-full px-2 py-0.5 ${filtre === "tous" ? "bg-accent-soft font-medium text-accent ring-1 ring-inset ring-accent/30" : "text-muted hover:bg-surface-2"}`}>
            Tous {lignes.length}
          </button>
          {STATUTS.map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setFiltre(filtre === s.v ? "tous" : s.v)}
              className={`rounded-full px-2 py-0.5 ${filtre === s.v ? "ring-2 ring-accent/50" : ""} ${s.classe}`}
            >
              {s.label} {compte(s.v)}
            </button>
          ))}
          {publies.length > 0 && (
            <span className="ml-auto text-muted">
              Lus par les familles : <strong className="text-foreground">{lus}</strong> / {publies.length}
            </span>
          )}
        </div>
      </div>

      {/* Actions groupées : chaque bouton fait avancer d'une étape tous les bulletins concernés. */}
      <div className="flex flex-wrap items-center gap-2">
        {peutPreparer && (
          <BoutonLot
            n={ids(["nouveau", "en_cours"]).length}
            disabled={!!occupe}
            onClick={() => changer("pret", ids(["nouveau", "en_cours"]), "Passage en Prêt", "Marquer comme prêts tous les bulletins en cours ? La Directrice pourra alors les valider.")}
          >
            Tout passer en Prêt
          </BoutonLot>
        )}
        {droits.directrice && (
          <BoutonLot n={compte("pret")} disabled={!!occupe} onClick={() => changer("valide", ids(["pret"]), "Validation", "Valider tous les bulletins prêts ?")}>
            Valider les Prêts
          </BoutonLot>
        )}
        {droits.directrice && (
          <BoutonLot fort n={compte("valide")} disabled={!!occupe} onClick={() => publier(lignes)}>
            Publier les Validés
          </BoutonLot>
        )}
        <span className="mx-1 h-5 w-px bg-border" />
        <BoutonLot disabled={!!occupe} onClick={() => pdf(lignes, titreLot)} title="Un seul fichier, une page par élève (envoi postal ou courriel)">
          PDF de la classe
        </BoutonLot>
        {selection.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-2 py-1 text-[12px]">
            <span className="font-medium text-accent">{selection.length} sélectionné{selection.length > 1 ? "s" : ""} :</span>
            <BoutonLot disabled={!!occupe} onClick={() => pdf(selection, titreLot)}>
              PDF
            </BoutonLot>
            {droits.directrice && (
              <>
                <BoutonLot
                  disabled={!!occupe}
                  onClick={() => agir("Envoi postal noté", async () => await sb.rpc("bulletins_courrier", { p_ids: selection.map((r) => r.bulletin!.id), p_date: todayISO() }))}
                >
                  Envoyés par courrier
                </BoutonLot>
                <BoutonLot disabled={!!occupe} onClick={() => publier(selection)}>
                  Publier
                </BoutonLot>
                <BoutonLot
                  disabled={!!occupe}
                  onClick={() =>
                    changer("en_cours", selection.map((r) => r.bulletin!.id), "Retour en cours", "Remettre ces bulletins « En cours » ? Publiés, ils disparaîtront de l'espace des familles.")
                  }
                >
                  Remettre en cours
                </BoutonLot>
              </>
            )}
          </div>
        )}
        {occupe && <span className="text-[12px] text-muted">{occupe}…</span>}
        {message && <span className="text-[12px] text-muted">{message}</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[46rem] text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={toutCoche}
                  onChange={() => setChoix(toutCoche ? new Set() : new Set(visibles.map((r) => r.bulletin?.id).filter((x): x is string => !!x)))}
                  aria-label="Tout sélectionner"
                />
              </th>
              <th className="px-2 py-2 font-medium">Élève</th>
              <th className="px-2 py-2 text-center font-medium">Moyenne</th>
              {ctx.classe.afficher_rang && <th className="px-2 py-2 text-center font-medium">Rang</th>}
              <th className="px-2 py-2 font-medium">Saisie</th>
              <th className="px-2 py-2 font-medium">Appréciation</th>
              <th className="px-2 py-2 font-medium">État</th>
              <th className="px-2 py-2 font-medium">Famille</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => {
              const b = r.bulletin;
              const av = avancement(r);
              const s = b?.statut === "publie" ? syntheseDe(r, ctx, titulaire, enseignants) : null;
              const general = s?.general ?? r.general;
              return (
                <tr key={r.eleve.id} onClick={() => b && onOuvrir(b.id)} className="cursor-pointer border-t border-border/60 hover:bg-surface-2/60">
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {b && (
                      <input
                        type="checkbox"
                        checked={choix.has(b.id)}
                        onChange={() =>
                          setChoix((c) => {
                            const n = new Set(c);
                            if (n.has(b.id)) n.delete(b.id);
                            else n.add(b.id);
                            return n;
                          })
                        }
                        aria-label={`Sélectionner ${nomEleve(r.eleve)}`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="font-medium">{nomEleve(r.eleve)}</span>
                    {r.niveau && <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10.5px] text-muted">{r.niveau}</span>}
                  </td>
                  <td className="px-2 py-2 text-center font-semibold tabular-nums">{note20(general.moy)}</td>
                  {ctx.classe.afficher_rang && <td className="px-2 py-2 text-center tabular-nums text-muted">{rangTexte(general.rang)}</td>}
                  <td className="px-2 py-2">
                    <Jauge valeur={av.notees} total={av.total} titre={`${av.notees} matière(s) notée(s) sur ${av.total}`} />
                    <div className="text-[10.5px] text-muted">
                      {av.notees}/{av.total} notées · {av.commentaires} appréciation{av.commentaires > 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-[12px]">
                    {b?.appreciation?.trim() ? <span className="text-positive">✓ Rédigée</span> : <span className="text-gold">À rédiger</span>}
                    {b?.mention && <div className="text-[10.5px] text-muted">Mention</div>}
                  </td>
                  <td className="px-2 py-2">
                    {b && <PastilleStatut statut={b.statut} />}
                    {b?.source === "ecole-futee" && <div className="mt-0.5 text-[10px] text-muted">Repris d&apos;École Futée</div>}
                  </td>
                  <td className="px-2 py-2 text-[11.5px]">
                    {b?.statut === "publie" ? (
                      b.lu_le ? <span className="text-positive">Lu le {dateFr(b.lu_le)}</span> : <span className="text-muted">Non lu</span>
                    ) : null}
                    {b?.envoye_courrier_le && <div className="text-muted">Courrier le {dateFr(b.envoye_courrier_le)}</div>}
                  </td>
                  <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => pdf([r], "")} className="rounded-md px-1.5 py-0.5 text-[11.5px] text-accent hover:bg-accent-soft" title="Télécharger le PDF">
                      PDF
                    </button>
                  </td>
                </tr>
              );
            })}
            {!visibles.length && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-muted">
                  {lignes.length ? "Aucun bulletin dans cet état." : "Aucun élève dans cette classe : la Directrice les ajoute dans Paramètres."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Jauge({ valeur, total, titre }: { valeur: number; total: number; titre: string }) {
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2" title={titre}>
      <div className="h-full rounded-full bg-jauge" style={{ width: `${total ? (100 * valeur) / total : 0}%` }} />
    </div>
  );
}
