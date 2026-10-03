"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { Modal } from "./GestionComptes";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { cleDonateur, champsImportantsManquants, recuEnvoye, sansRecu } from "@/lib/statutDon";
import { genererRecuPdf, dateEditionDuNumero, type DonPourRecu } from "@/lib/recu";
import { syntheseVersements } from "@/lib/recuVersements";

export type DonRow = {
  id: string;
  date_don: string;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  est_personne_morale: boolean;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  pii_chiffre: string | null;
  montant: number;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
};

/**
 * Un reçu, émis ou à établir.
 *
 * Règles (28/09/2026) : chaque don figure sur un seul reçu ; un reçu ne couvre
 * qu'une année civile ; en principe un reçu par donateur et par an. Un reçu
 * émis regroupe les dons portant son numéro ; les dons encore sans reçu d'un
 * même donateur et d'une même année forment le reçu « à établir » — après un
 * reçu intermédiaire, il ne reprend donc que les dons arrivés depuis.
 */
type Groupe = {
  cle: string;
  numero: string | null;
  annee: number;
  total: number;
  dons: DonRow[];
  representant: DonRow;
};

const numeroValide = (n: string | null) => !!n && /^RE_\d+/.test(n);

function grouper(dons: DonRow[], coffreOuvert: boolean): Groupe[] {
  const map = new Map<string, DonRow[]>();
  for (const d of dons) {
    if (sansRecu(d)) continue; // le donateur n'a pas demandé de reçu
    const annee = d.date_don.slice(0, 4);
    // Sans le coffre, les noms sont illisibles : on ne regroupe pas à l'aveugle.
    const cle = numeroValide(d.recu_numero)
      ? `n|${d.recu_numero}`
      : coffreOuvert
        ? `a|${cleDonateur(d)}|${annee}`
        : `a|${d.id}`;
    (map.get(cle) ?? map.set(cle, []).get(cle)!).push(d);
  }
  const groupes: Groupe[] = [];
  for (const [cle, rows] of map) {
    const tri = [...rows].sort((a, b) => a.date_don.localeCompare(b.date_don));
    const representant = tri[tri.length - 1];
    groupes.push({
      cle,
      numero: cle.startsWith("n|") ? representant.recu_numero : null,
      annee: Number(representant.date_don.slice(0, 4)),
      total: rows.reduce((s, d) => s + Number(d.montant), 0),
      dons: tri,
      representant,
    });
  }
  return groupes.sort((a, b) => b.representant.date_don.localeCompare(a.representant.date_don));
}

export type StatutRecu = "envoye" | "edite" | "attente" | "a_faire";

const LIBELLE: Record<StatutRecu, string> = {
  envoye: "Envoyé",
  edite: "Établi, à envoyer",
  attente: "Attente fin d'année",
  a_faire: "À établir",
};

const TON: Record<StatutRecu, string> = {
  envoye: "bg-positive/15 text-positive",
  edite: "bg-accent-soft text-accent",
  attente: "bg-gold-soft text-gold",
  a_faire: "bg-negative/10 text-negative",
};

/**
 * Où en est ce reçu ? Les dons de l'année en cours d'un donateur régulier
 * attendent la fin de l'année pour un reçu unique ; un reçu intermédiaire
 * reste possible à sa demande.
 */
function statutRecu(g: Groupe, recurrents: Set<string>, anneeEnCours: number): StatutRecu {
  if (g.numero) return g.dons.every(recuEnvoye) ? "envoye" : "edite";
  const regulier = g.dons.length > 1 || recurrents.has(cleDonateur(g.representant));
  return regulier && g.annee >= anneeEnCours ? "attente" : "a_faire";
}

const nomAffiche = (d: DonRow) =>
  d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? "—"
    : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ") || "—";

/** Données du PDF pour un reçu et les dons qu'il couvre. */
function donPourRecu(r: DonRow, dons: DonRow[], numero: string, dateEdition: string): DonPourRecu {
  return {
    recu_numero: numero,
    donateur_titre: r.donateur_titre,
    donateur_nom: r.donateur_nom ?? "",
    donateur_prenom: r.donateur_prenom,
    raison_sociale: r.raison_sociale,
    est_personne_morale: r.est_personne_morale,
    adresse: r.adresse,
    cp_ville: r.cp_ville,
    montant: dons.reduce((s, d) => s + Number(d.montant), 0),
    date_don: dons[dons.length - 1].date_don,
    mode_paiement: r.mode_paiement,
    versements: dons.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })),
    date_edition: dateEdition,
  };
}

export default function ListeRecus({ dons }: { dons: DonRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const { dons: hydrates, verrou } = useDonsDechiffres(dons);
  const [annee, setAnnee] = useState<number | "toutes">("toutes");
  const [statut, setStatut] = useState<StatutRecu | "tous">("tous");
  // Reçus dont la fiche donateur est incomplète (retour depuis l'onglet Dons : `?incomplets=1`).
  const [incompletsSeuls, setIncompletsSeuls] = useState(params.get("incomplets") === "1");
  const [etablir, setEtablir] = useState<Groupe | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const anneeEnCours = new Date().getFullYear();

  // Un donateur est « régulier » s'il a versé plusieurs fois, toutes années
  // confondues : c'est le signe qu'il donnera probablement encore cette année.
  const recurrents = useMemo(() => {
    const compte = new Map<string, number>();
    for (const d of hydrates) {
      const c = cleDonateur(d);
      if (c) compte.set(c, (compte.get(c) ?? 0) + 1);
    }
    return new Set([...compte].filter(([, n]) => n > 1).map(([c]) => c));
  }, [hydrates]);

  const tous = useMemo(
    () =>
      grouper(hydrates, !verrou).map((g) => ({
        g,
        statut: statutRecu(g, recurrents, anneeEnCours),
        manquants: champsImportantsManquants(g.representant),
      })),
    [hydrates, verrou, recurrents, anneeEnCours],
  );

  const annees = useMemo(() => [...new Set(tous.map((x) => x.g.annee))].sort((a, b) => b - a), [tous]);

  // Le tableau de bord porte sur l'année choisie, la liste sur année + statut.
  const deLAnnee = tous.filter((x) => annee === "toutes" || x.g.annee === annee);
  const estIncomplet = (x: (typeof tous)[number]) => x.statut !== "envoye" && x.manquants.length > 0;
  const affiches = deLAnnee.filter(
    (x) => (statut === "tous" || x.statut === statut) && (!incompletsSeuls || estIncomplet(x)),
  );

  const compte = (s: StatutRecu) => deLAnnee.filter((x) => x.statut === s).length;
  const somme = (s: StatutRecu) => deLAnnee.filter((x) => x.statut === s).reduce((t, x) => t + x.g.total, 0);
  const incomplets = deLAnnee.filter(estIncomplet).length;

  /** Ouvre le don du reçu dans l'onglet Dons, champs manquants surlignés ; retour ici ensuite. */
  function completer(g: Groupe) {
    const retour = encodeURIComponent("/recus-fiscaux?incomplets=1");
    router.push(`/dons?modifier=${g.representant.id}&signaler=1&retour=${retour}`);
  }

  const tuiles: { cle: StatutRecu; libelle: string; ton: string }[] = [
    { cle: "a_faire", libelle: "À établir", ton: "text-negative" },
    { cle: "attente", libelle: "Attente fin d'année", ton: "text-gold" },
    { cle: "edite", libelle: "Établis, à envoyer", ton: "text-accent" },
    { cle: "envoye", libelle: "Envoyés", ton: "text-positive" },
  ];

  async function telecharger(g: Groupe) {
    if (!g.numero) return;
    setMessage(null);
    setBusy(g.cle);
    try {
      await genererRecuPdf(
        donPourRecu(g.representant, g.dons, g.numero, dateEditionDuNumero(g.numero) ?? todayISO()),
        { ouvrir: true },
      );
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Génération impossible." });
    }
    setBusy(null);
  }

  async function annuler(g: Groupe) {
    if (!g.numero) return;
    if (!window.confirm(`Annuler le reçu ${g.numero} ? Ses dons redeviendront « à établir » ; le numéro ne sera jamais réattribué.`)) return;
    setBusy(g.cle);
    const { error } = await createClient().rpc("annuler_recu", { p_recu: g.numero });
    setBusy(null);
    setMessage(error ? { ok: false, t: error.message } : { ok: true, t: `Reçu ${g.numero} annulé.` });
    router.refresh();
  }

  async function marquerEnvoye(g: Groupe) {
    setBusy(g.cle);
    const { error } = await createClient()
      .from("dons")
      .update({ recu_etat: `Envoyé le ${formatDate(todayISO())}` })
      .in("id", g.dons.map((d) => d.id));
    setBusy(null);
    setMessage(error ? { ok: false, t: error.message } : { ok: true, t: `Reçu ${g.numero} marqué envoyé.` });
    router.refresh();
  }

  return (
    <>
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">
            🔒 Coffre verrouillé — noms masqués, dons non regroupés par donateur, établissement des reçus indisponible.
          </span>
          <DeverrouillerCoffre />
        </div>
      )}

      {message && (
        <p
          className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${
            message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
          }`}
        >
          {message.t}
        </p>
      )}

      {/* Tableau de bord */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tuiles.map((t) => (
          <button
            key={t.cle}
            type="button"
            onClick={() => setStatut(statut === t.cle ? "tous" : t.cle)}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              statut === t.cle ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2"
            }`}
          >
            <div className="text-xs text-muted">{t.libelle}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${t.ton}`}>{compte(t.cle)}</div>
            <div className="text-xs text-muted tabular-nums">{formatEuros(somme(t.cle))}</div>
          </button>
        ))}
      </div>

      {incomplets > 0 && (
        <button
          type="button"
          onClick={() => setIncompletsSeuls((v) => !v)}
          aria-pressed={incompletsSeuls}
          className={`mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm text-negative transition-colors ${
            incompletsSeuls ? "border-negative bg-negative/10" : "border-negative/30 bg-negative/5 hover:bg-negative/10"
          }`}
        >
          <span>
            {incomplets} reçu{incomplets > 1 ? "s" : ""} à compléter : adresse, code postal ou courriel manquant (⚠).
          </span>
          <span className="text-xs font-medium underline">
            {incompletsSeuls ? "Afficher tous les reçus" : "Voir les reçus concernés"}
          </span>
        </button>
      )}

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted">Année</span>
          {(["toutes", ...annees] as (number | "toutes")[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnnee(a)}
              className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
                annee === a ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
              }`}
            >
              {a === "toutes" ? "Toutes" : a}
            </button>
          ))}
        </div>
        {incompletsSeuls && (
          <span className="text-sm text-negative">
            Reçus incomplets uniquement{verrou ? "" : " — cliquez sur une ligne pour compléter la fiche"}
          </span>
        )}
        {statut !== "tous" && (
          <button type="button" onClick={() => setStatut("tous")} className="text-sm text-accent hover:underline">
            Afficher tous les statuts
          </button>
        )}
        <span className="ml-auto text-sm text-muted">
          {affiches.length} reçu{affiches.length > 1 ? "s" : ""} affiché{affiches.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Année</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-center font-medium">Dons</th>
              <th className="px-4 py-3 font-medium">N° reçu</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">Aucun reçu pour ce filtre.</td>
              </tr>
            ) : (
              affiches.map(({ g, statut: st, manquants }) => {
                const aCompleter = st !== "envoye" && manquants.length > 0 && !verrou;
                return (
                <tr
                  key={g.cle}
                  onClick={aCompleter ? (e) => { if (!(e.target as HTMLElement).closest("button, a")) completer(g); } : undefined}
                  title={aCompleter ? "Cliquer pour compléter la fiche du donateur : " + manquants.join(", ") : undefined}
                  className={`border-b border-border last:border-0 ${aCompleter ? "cursor-pointer hover:bg-surface-2" : ""}`}
                >
                  <td className="px-4 py-3 tabular-nums">{g.annee}</td>
                  <td className="px-4 py-3">
                    {nomAffiche(g.representant)}
                    {aCompleter && <div className="text-xs text-negative">Manque : {manquants.join(", ")}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatEuros(g.total)}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted">{g.dons.length}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{g.numero ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TON[st]}`}>
                      {LIBELLE[st]}
                    </span>
                    {st !== "envoye" && manquants.length > 0 && (
                      <span className="ml-1.5 text-negative" title={"Manque : " + manquants.join(", ")}>
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {verrou ? (
                      <span className="text-xs text-muted">🔒</span>
                    ) : g.numero ? (
                      <span className="inline-flex items-center gap-3 text-xs">
                        <button type="button" onClick={() => telecharger(g)} disabled={busy === g.cle} className="text-accent hover:underline disabled:opacity-50">
                          PDF
                        </button>
                        {st === "edite" && (
                          <>
                            <button type="button" onClick={() => marquerEnvoye(g)} disabled={busy === g.cle} className="text-positive hover:underline disabled:opacity-50">
                              Marquer envoyé
                            </button>
                            <button type="button" onClick={() => annuler(g)} disabled={busy === g.cle} className="text-muted hover:text-negative disabled:opacity-50">
                              Annuler
                            </button>
                          </>
                        )}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEtablir(g)}
                        className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:opacity-90"
                      >
                        {st === "attente" ? "Reçu intermédiaire" : "Établir le reçu"}
                      </button>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {etablir && (
        <EtablirRecu
          groupe={etablir}
          manquants={champsImportantsManquants(etablir.representant)}
          onFermer={() => setEtablir(null)}
          onFait={(t) => {
            setEtablir(null);
            setMessage({ ok: true, t });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Établissement d'un reçu : les dons de l'année encore sans reçu de ce
 * donateur, cochés par défaut. En décocher permet un reçu partiel (un reçu par
 * don, ou un reçu intermédiaire) ; les dons laissés iront sur le reçu suivant.
 * Le numéro est attribué par la base, au moment de valider.
 */
function EtablirRecu({
  groupe,
  manquants,
  onFermer,
  onFait,
}: {
  groupe: Groupe;
  manquants: string[];
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const [coches, setCoches] = useState<Set<string>>(new Set(groupe.dons.map((d) => d.id)));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const retenus = groupe.dons.filter((d) => coches.has(d.id));
  const total = retenus.reduce((s, d) => s + Number(d.montant), 0);
  const lignes = syntheseVersements(retenus.map((d) => ({ date: d.date_don, montant: Number(d.montant), mode: d.mode_paiement })));
  const partiel = retenus.length < groupe.dons.length;

  async function valider() {
    if (retenus.length === 0) return setErreur("Cochez au moins un don.");
    setErreur(null);
    setBusy(true);
    const date = todayISO();
    const { data, error } = await createClient().rpc("etablir_recu", {
      p_dons: retenus.map((d) => d.id),
      p_date: date,
    });
    if (error || !data) {
      setBusy(false);
      return setErreur("Établissement impossible : " + (error?.message ?? "réponse vide"));
    }
    const numero = data as string;
    try {
      await genererRecuPdf(donPourRecu(groupe.representant, retenus, numero, date));
    } catch (e) {
      setBusy(false);
      return onFait(`Reçu ${numero} établi, mais le PDF n'a pas pu être généré (${e instanceof Error ? e.message : "erreur"}) : utilisez « PDF » dans la liste.`);
    }
    setBusy(false);
    onFait(`Reçu ${numero} établi (${formatEuros(total)}) et téléchargé.`);
  }

  return (
    <Modal title={`Établir le reçu ${groupe.annee} — ${nomAffiche(groupe.representant)}`} onClose={onFermer}>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Dons {groupe.annee} de ce donateur sans reçu. Décochez-en pour un reçu partiel : ils resteront pour le reçu suivant.
        </p>

        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {groupe.dons.map((d) => (
            <li key={d.id}>
              <label className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-surface-2">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coches.has(d.id)}
                    onChange={(e) =>
                      setCoches((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="tabular-nums">{formatDate(d.date_don)}</span>
                  <span className="text-muted">{d.mode_paiement ?? ""}</span>
                </span>
                <span className="tabular-nums">{formatEuros(Number(d.montant))}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="rounded-lg bg-surface-2 px-3 py-2">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tel qu&apos;imprimé sur le reçu</div>
          {lignes.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 text-xs">
              <span>{l.libelle}</span>
              <span className="tabular-nums">{formatEuros(l.montant)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatEuros(total)}</span>
          </div>
        </div>

        {partiel && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Reçu partiel : {groupe.dons.length - retenus.length} don(s) resteront à inclure dans un prochain reçu.
          </p>
        )}
        {manquants.length > 0 && (
          <p className="rounded-lg bg-negative/10 px-3 py-2 text-xs text-negative">
            Fiche incomplète ({manquants.join(", ")}) : complétez-la dans l&apos;onglet Dons avant d&apos;envoyer le reçu.
          </p>
        )}
        <p className="text-xs text-muted">
          Le numéro suivant sera attribué automatiquement (format RE_000NNN_{todayISO().replace(/-/g, "")}) et le PDF téléchargé.
        </p>
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={busy || retenus.length === 0}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Établissement…" : `Établir le reçu (${formatEuros(total)})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
