"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEurosCourt as formatEuros, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import JaugeScolarite, { AideReglement, etatJauge } from "@/components/JaugeScolarite";
import FamilleEnfants, { type FicheFamille } from "@/components/FamilleEnfants";
import { partJuinNonDue, type Eleve } from "@/lib/eleves";
import { etatPaiement, moisEchus } from "@/lib/retardScolarite";
import { telechargerAttestation, type Attestation } from "@/lib/attestationPdf";
import { modeleRecuEnCache } from "@/lib/modeleRecu";
import Icon from "@/components/Icon";
import {
  etatDepot,
  etatFraisDossier,
  famillesParties,
  FRAIS_DOSSIER_PAR_ENFANT,
  type AffectationDetail,
  type InscriptionDepot,
  type NatureAffectation,
} from "@/lib/scolariteDepots";

export type Inscription = {
  id: string;
  annee_scolaire: string;
  famille_nom: string;
  nb_enfants: number | null;
  emails: string | null;
  montant_mensuel: number;
  avance: number | null;
  m_sept: number | null;
  m_oct: number | null;
  m_nov: number | null;
  m_dec: number | null;
  m_jan: number | null;
  m_fev: number | null;
  m_mars: number | null;
  m_avr: number | null;
  m_mai: number | null;
  m_juin: number | null;
  notes: string | null;
  /** Part du mois d'avance utilisée cette année pour le dernier mois d'un enfant qui part. */
  avance_consommee?: number | null;
  /** Dépôt versé avant les données de la comptabilité (saisi à la main, une fois). */
  depot_anterieur?: number | null;
  famille_id?: string | null;
};

const MOIS: { k: keyof Inscription; l: string }[] = [
  { k: "m_sept", l: "Sept" },
  { k: "m_oct", l: "Oct" },
  { k: "m_nov", l: "Nov" },
  { k: "m_dec", l: "Déc" },
  { k: "m_jan", l: "Jan" },
  { k: "m_fev", l: "Fév" },
  { k: "m_mars", l: "Mars" },
  { k: "m_avr", l: "Avr" },
  { k: "m_mai", l: "Mai" },
  { k: "m_juin", l: "Juin" },
];

const MOIS_PAR_AN = 10;

/** Montant fléché vers une famille depuis la Comptabilité et compté comme réglé. */
export type AffectationRecue = {
  inscription_id: string;
  montant: number;
  libelle: string;
  date_operation: string;
  nature?: NatureAffectation;
};

export function totalDu(i: Pick<Inscription, "montant_mensuel">): number {
  return Number(i.montant_mensuel) * MOIS_PAR_AN;
}
/**
 * Réglé de l'année : le report (crédit venant de l'année précédente, colonne
 * « Avance » du classeur) plus les dix mensualités saisies. Le mois d'avance au
 * sens du DÉPÔT est une autre notion : il est suivi depuis la Comptabilité
 * (colonne « Mois d'avance ») et n'entre pas dans le réglé.
 */
export function totalRegle(i: Inscription): number {
  const cols = ["avance", ...MOIS.map((m) => m.k)] as (keyof Inscription)[];
  return cols.reduce((s, c) => s + (Number(i[c]) || 0), 0);
}

function detailsTexte(details: AffectationDetail[]): string {
  return details
    .map((d) => `${d.date_operation ? formatDateCourte(d.date_operation) + " · " : ""}${d.libelle} — ${d.type === "depense" ? "−" : ""}${formatEuros(d.montant)}`)
    .join("\n");
}
function formatDateCourte(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

type FormState = Record<string, string> & {
  famille_nom: string;
  nb_enfants: string;
  emails: string;
  montant_mensuel: string;
  notes: string;
};

const numOrNull = (s: string) => {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export default function GestionScolarite({
  annee,
  annees,
  inscriptions,
  bareme,
  affectations = [],
  toutesInscriptions = [],
  affectationsDetail = [],
  familles = [],
  eleves = [],
}: {
  annee: string;
  annees: string[];
  inscriptions: Inscription[];
  /** nb_enfants -> montant mensuel, pour l'année courante. */
  bareme: Record<number, number>;
  /** Dons d'association et mensualités fléchés vers ces familles (comptés comme réglé). */
  affectations?: AffectationRecue[];
  /** Toutes les inscriptions, toutes années : le dépôt suit la famille. */
  toutesInscriptions?: (InscriptionDepot & Partial<Inscription>)[];
  /** Toutes les affectations, avec leur nature et l'opération d'origine. */
  affectationsDetail?: AffectationDetail[];
  /** Fiches familles et élèves (prénom chiffré), pour le détail et la part de juin. */
  familles?: FicheFamille[];
  eleves?: Eleve[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Inscription | "nouveau" | null>(null);
  // Famille dont le détail est déroulé.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const champsVides = (): FormState => {
    const base: Record<string, string> = {
      famille_nom: "",
      nb_enfants: "",
      emails: "",
      montant_mensuel: "",
      avance: "",
      avance_consommee: "",
      depot_anterieur: "",
      notes: "",
    };
    for (const m of MOIS) base[m.k] = "";
    return base as FormState;
  };
  const [f, setF] = useState<FormState>(champsVides());
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function changerAnnee(a: string) {
    router.push(`/scolarite?annee=${encodeURIComponent(a)}`);
  }

  function majMontantDepuisBareme(nb: string) {
    set("nb_enfants", nb);
    const m = bareme[Number(nb)];
    if (m != null) set("montant_mensuel", String(m).replace(".", ","));
  }

  function ouvrir(i: Inscription | "nouveau") {
    setError(null);
    if (i === "nouveau") {
      setF(champsVides());
    } else {
      const base: Record<string, string> = {
        famille_nom: i.famille_nom,
        nb_enfants: i.nb_enfants != null ? String(i.nb_enfants) : "",
        emails: i.emails ?? "",
        montant_mensuel: String(i.montant_mensuel).replace(".", ","),
        avance: i.avance != null ? String(i.avance).replace(".", ",") : "",
        avance_consommee:
          i.avance_consommee != null && Number(i.avance_consommee) !== 0
            ? String(i.avance_consommee).replace(".", ",")
            : "",
        depot_anterieur:
          i.depot_anterieur != null && Number(i.depot_anterieur) !== 0
            ? String(i.depot_anterieur).replace(".", ",")
            : "",
        notes: i.notes ?? "",
      };
      for (const m of MOIS) {
        const v = i[m.k] as number | null;
        base[m.k] = v != null ? String(v).replace(".", ",") : "";
      }
      setF(base as FormState);
    }
    setEdit(i);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.famille_nom.trim()) {
      setError("Le nom de famille est obligatoire.");
      return;
    }
    const montant = numOrNull(f.montant_mensuel);
    if (montant === null || Number.isNaN(montant)) {
      setError("Montant mensuel invalide.");
      return;
    }
    const payload: Record<string, unknown> = {
      annee_scolaire: annee,
      famille_nom: f.famille_nom.trim(),
      nb_enfants: f.nb_enfants ? Number(f.nb_enfants) : null,
      emails: f.emails.trim() || null,
      montant_mensuel: montant,
      avance: numOrNull(f.avance),
      avance_consommee: numOrNull(f.avance_consommee) ?? 0,
      depot_anterieur: numOrNull(f.depot_anterieur) ?? 0,
      notes: f.notes.trim() || null,
    };
    for (const m of MOIS) {
      const v = numOrNull(f[m.k]);
      if (Number.isNaN(v)) {
        setError(`Montant invalide pour ${m.l}.`);
        return;
      }
      payload[m.k] = v;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("scolarite_inscriptions").insert(payload)
        : await supabase.from("scolarite_inscriptions").update(payload).eq("id", (edit as Inscription).id);
    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  // Dons d'association fléchés, par famille. Ils comptent comme réglé : la
  // somme a bien été perçue par l'école, simplement via un tiers.
  const donParFamille = new Map<string, { montant: number; details: AffectationRecue[] }>();
  for (const a of affectations) {
    const e = donParFamille.get(a.inscription_id) ?? { montant: 0, details: [] };
    e.montant += Number(a.montant);
    e.details.push(a);
    donParFamille.set(a.inscription_id, e);
  }
  const donDe = (id: string) => donParFamille.get(id)?.montant ?? 0;

  // Enfants en CM2 : juin non dû pour leur part (couverte par le mois d'avance).
  const elevesDe = (i: Inscription) => eleves.filter((e) => e.famille_id && e.famille_id === i.famille_id);
  const partJuin = (i: Inscription) =>
    partJuinNonDue({ ...i, montant_mensuel: Number(i.montant_mensuel) }, elevesDe(i), bareme);
  const duDe = (i: Inscription) => totalDu(i) - partJuin(i).montant;

  const aujourdhui = todayISO();

  // Totaux de l'année
  const sumDu = inscriptions.reduce((s, i) => s + duDe(i), 0);
  const sumDon = inscriptions.reduce((s, i) => s + donDe(i.id), 0);
  const sumRegle = inscriptions.reduce((s, i) => s + totalRegle(i) + donDe(i.id), 0);
  const sumReste = sumDu - sumRegle;

  const mensuelTotal = inscriptions.reduce((s, i) => s + Number(i.montant_mensuel), 0);
  const etatGlobal = etatJauge(mensuelTotal, sumRegle, annee);
  // Reste à percevoir : normal tant que le réglé couvre le dû au jour J ; même
  // règle que les familles (ambre à partir du 27, rouge dès le 1er du mois suivant).
  const paiementGlobal = etatPaiement(annee, mensuelTotal, sumDu, sumRegle, aujourdhui);

  // Dû à la fin du mois en cours : mensualités échues, mois en cours compris
  // (juin allégé de la part des enfants en CM2).
  const echus = moisEchus(annee, aujourdhui);
  const sumDuFinMois = inscriptions.reduce(
    (s, i) => s + Math.min(duDe(i), echus * Number(i.montant_mensuel) - (echus === 10 ? partJuin(i).montant : 0)),
    0,
  );
  // Vert si le réglé couvre ce dû ; ambre jusqu'à 1 000 € de manque ; rouge au-delà.
  const manqueFinMois = sumDuFinMois - sumRegle;
  const tonRegle = manqueFinMois <= 0.005 ? "text-positive" : manqueFinMois <= 1000 ? "text-gold" : "text-negative";

  // Mois d'avance (dépôt) et frais de dossier, calculés depuis la Comptabilité.
  const depotDe = (i: Inscription) => {
    const insc = toutesInscriptions.find((t) => t.id === i.id) ?? {
      id: i.id,
      annee_scolaire: i.annee_scolaire,
      famille_nom: i.famille_nom,
      nb_enfants: i.nb_enfants,
      montant_mensuel: Number(i.montant_mensuel),
      avance: i.avance,
      avance_consommee: i.avance_consommee ?? 0,
      depot_anterieur: i.depot_anterieur ?? 0,
    };
    return {
      depot: etatDepot(insc, toutesInscriptions, affectationsDetail),
      frais: etatFraisDossier(insc, toutesInscriptions, affectationsDetail),
    };
  };
  const parties = famillesParties(annee, toutesInscriptions, affectationsDetail);

  const badgeDepot = (i: Inscription) => {
    const e = depotDe(i).depot;
    const lignes: string[] = [];
    lignes.push(`Dépôt attendu : ${formatEuros(e.du)} (un mois au tarif de la famille)`);
    lignes.push(`Dépôt détenu : ${formatEuros(e.detenu)}`);
    if (e.anterieur > 0) lignes.push(`Dont dépôt antérieur aux données de la comptabilité : ${formatEuros(e.anterieur)}`);
    if (e.details.length > 0) lignes.push("", "Versements (Comptabilité) :", detailsTexte(e.details));
    else lignes.push("", "Aucun versement fléché « mois d'avance » dans la Comptabilité.");
    if (e.departs > 0) lignes.push("", `${e.departs} enfant(s) parti(s) depuis l'année précédente.`);
    if (e.reportClasseur > 0) lignes.push("", `Report du classeur (colonne Avance) : ${formatEuros(e.reportClasseur)}`);
    if (e.couleur === "violet") lignes.push("", "Dépôt non rendu après un départ : restitution ou don de la famille à décider.");
    // Comme les frais de dossier : coche verte si le dépôt est constitué, « ! » ambre sinon.
    const enRegle = e.couleur !== "jaune";
    return (
      <span title={lignes.join("\n")} className="inline-flex cursor-help items-baseline gap-0.5">
        <span className={`text-base font-semibold ${enRegle ? "text-positive" : "text-gold"}`}>{enRegle ? "✓" : "!"}</span>
        {e.couleur === "violet" && <span className="text-xs font-semibold text-violet-600 dark:text-violet-300">↩</span>}
      </span>
    );
  };

  const badgeFrais = (i: Inscription) => {
    const e = depotDe(i).frais;
    const lignes: string[] = [];
    lignes.push(
      e.nouveaux > 0
        ? `${e.nouveaux} enfant(s) entrant(s) × ${FRAIS_DOSSIER_PAR_ENFANT} € = ${formatEuros(e.du)} attendus`
        : "Aucun enfant entrant cette année : rien d'attendu",
    );
    lignes.push(`Réglé : ${formatEuros(e.paye)}`);
    if (e.details.length > 0) lignes.push("", "Versements (Comptabilité) :", detailsTexte(e.details));
    else lignes.push("", "Aucun versement fléché « frais de dossier » dans la Comptabilité.");
    // En règle (rien d'attendu, ou tout réglé) : coche verte ; sinon « ! » ambre.
    const enRegle = e.couleur !== "jaune";
    return (
      <span
        title={lignes.join("\n")}
        className={`cursor-help text-base font-semibold ${enRegle ? "text-positive" : "text-gold"}`}
      >
        {enRegle ? "✓" : "!"}
      </span>
    );
  };


  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Exercice</label>
          <select
            value={annee}
            onChange={(e) => changerAnnee(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            {annees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          + Ajouter une famille
        </button>
      </div>

      {/* Avancement des règlements */}
      {inscriptions.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Avancement des règlements · {annee}</h2>
          </div>
          <JaugeScolarite etat={etatGlobal} anneeScolaire={annee} />
        </div>
      )}

      {/* Synthèse */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Total attendu", v: sumDu, c: "" },
          { l: "Dont rattachés depuis la compta", v: sumDon, c: sumDon > 0 ? "text-gold" : "text-muted" },
          {
            l: "Total réglé / Dû",
            v: sumRegle,
            c: tonRegle,
            apres: sumDuFinMois,
            aide:
              manqueFinMois > 0.005
                ? `Il manque ${formatEuros(manqueFinMois)} sur le dû à la fin du mois`
                : "Le réglé couvre le dû à la fin du mois",
          },
          {
            l: "Reste à percevoir",
            v: sumReste,
            c: paiementGlobal.retard > 0 ? "text-negative" : paiementGlobal.aReglerFinDeMois > 0 ? "text-gold" : "",
          },
        ].map((s: { l: string; v: number; c: string; apres?: number; aide?: string }) => (
          <div key={s.l} className="rounded-xl border border-border bg-surface px-4 py-3" title={s.aide}>
            <div className="text-xs uppercase tracking-wider text-muted">{s.l}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${s.c}`}>
              {formatEuros(s.v)}
              {s.apres != null && <span className="font-normal"> / {formatEuros(s.apres)}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3 font-medium">Famille</th>
              <th className="px-2 py-3 font-medium text-center">Enfants</th>
              <th className="px-3 py-3 font-medium text-right">Total dû</th>
              <th
                className="w-px px-2 py-3 text-center font-medium leading-tight"
                title="Dépôt versé une fois par enfant, l'été précédant son entrée ; il éponge le dernier mois de sa scolarité à l'école. Alimenté par la Comptabilité (affectation « mois d'avance »)."
              >
                Mois
                <br />
                d&apos;avance
              </th>
              <th
                className="w-px px-2 py-3 text-center font-medium leading-tight"
                title={`${FRAIS_DOSSIER_PAR_ENFANT} € par enfant entrant. Alimenté par la Comptabilité (affectation « frais de dossier »).`}
              >
                Frais de
                <br />
                dossier
              </th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell">Avancement</th>
              <th className="px-4 py-3 font-medium text-right">Réglé</th>
              <th className="px-4 py-3 font-medium text-right">Reste</th>
              <th className="px-2 py-3 font-medium text-right"><span className="sr-only">Modifier</span></th>
            </tr>
          </thead>
          <tbody>
            {inscriptions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted">
                  Aucune famille pour {annee}.
                </td>
              </tr>
            ) : (
              inscriptions.map((i) => {
                const du = duDe(i);
                const don = donDe(i.id);
                const regle = totalRegle(i) + don;
                const reste = du - regle;
                const paiement = etatPaiement(annee, Number(i.montant_mensuel), du, regle, aujourdhui, partJuin(i).montant);
                const detailsDon = donParFamille.get(i.id)?.details ?? [];
                const deroulee = ouverte === i.id;
                return (
                  <Fragment key={i.id}>
                  <tr
                    onClick={() => setOuverte(deroulee ? null : i.id)}
                    title="Afficher le détail des versements"
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${deroulee ? "bg-surface-2" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`mr-1.5 inline-block text-muted transition-transform ${deroulee ? "rotate-90" : ""}`}>›</span>
                      {i.famille_nom}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">{i.nb_enfants ?? "—"}</td>
                    <td
                      className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
                      title={`Total dû : ${formatEuros(du)}${partJuin(i).montant > 0 ? ` (juin non dû : −${formatEuros(partJuin(i).montant)})` : ""}`}
                    >
                      {formatEuros(Number(i.montant_mensuel))}×10
                      {partJuin(i).montant > 0 && (
                        <span className="block text-[11px] text-muted">−{formatEuros(partJuin(i).montant)} juin</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">{badgeDepot(i)}</td>
                    <td className="px-2 py-3 text-center">{badgeFrais(i)}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <JaugeScolarite
                        etat={etatJauge(Number(i.montant_mensuel), regle, annee)}
                        anneeScolaire={annee}
                        compacte
                      />
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${
                        paiement.retard > 0 ? "font-medium text-negative" : paiement.aReglerFinDeMois > 0 ? "font-medium text-gold" : "text-positive"
                      }`}
                      title={
                        paiement.retard > 0
                          ? `En retard de ${formatEuros(paiement.retard)} (réglé : ${formatEuros(regle)})`
                          : paiement.aReglerFinDeMois > 0
                            ? `À régler avant la fin du mois (réglé : ${formatEuros(regle)})`
                            : detailsDon.length > 0
                              ? "Dont rattachés depuis la compta : " +
                                detailsDon.map((d) => `${d.libelle} : ${formatEuros(Number(d.montant))}`).join(" · ")
                              : undefined
                      }
                    >
                      {paiement.retard > 0
                        ? `−${formatEuros(paiement.retard)}`
                        : paiement.aReglerFinDeMois > 0
                          ? `−${formatEuros(paiement.aReglerFinDeMois)}`
                          : formatEuros(regle)}
                      <AideReglement retard={paiement.retard > 0} finDeMois={paiement.aReglerFinDeMois > 0} />
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${
                        paiement.retard > 0 ? "text-negative" : reste < -0.005 ? "text-positive" : ""
                      }`}
                      title={reste < -0.005 ? "Trop-perçu" : undefined}
                    >
                      {formatEuros(reste)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          ouvrir(i);
                        }}
                        title={`Saisir ou modifier — ${i.famille_nom}`}
                        aria-label={`Saisir ou modifier les règlements de ${i.famille_nom}`}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent"
                      >
                        <Icon name="crayon" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  {deroulee && (
                    <tr className="border-b border-border bg-surface-2/40">
                      <td colSpan={9} className="px-4 pb-3">
                        <DetailFamille
                          inscription={i}
                          affectations={affectationsDetail}
                          dossier={toutesInscriptions.filter((t) =>
                            i.famille_id ? t.famille_id === i.famille_id : t.famille_nom === i.famille_nom,
                          )}
                          famille={familles.find((x) => x.id === i.famille_id) ?? null}
                          eleves={elevesDe(i)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Légende des deux colonnes alimentées par la Comptabilité */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-medium text-foreground">Mois d&apos;avance et frais de dossier :</span>
        <span><span className="font-semibold text-positive">✓</span> réglé pour chaque enfant</span>
        <span><span className="font-semibold text-gold">!</span> versé partiellement ou pas encore</span>
        <span><span className="font-semibold text-violet-600 dark:text-violet-300">↩</span> enfant parti, dépôt non rendu (restitution ou don à décider)</span>
        <span>· le détail des versements apparaît au survol ; ils se saisissent dans la Comptabilité, en affectant l&apos;écriture à la famille.</span>
      </div>

      {parties.length > 0 && (
        <div className="mt-4 rounded-xl border border-violet-300/60 bg-violet-50/60 px-4 py-3 text-sm dark:border-violet-800/60 dark:bg-violet-900/20">
          <div className="mb-1 font-medium text-violet-700 dark:text-violet-300">
            Familles parties avec un dépôt encore détenu
          </div>
          <ul className="space-y-0.5">
            {parties.map((p) => (
              <li key={p.famille_nom} className="flex items-center justify-between gap-3" title={detailsTexte(p.details)}>
                <span>{p.famille_nom}</span>
                <span className="tabular-nums font-medium">{formatEuros(p.detenu)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            À solder : restitution (dépense fléchée « mois d&apos;avance » dans la Comptabilité), imputation sur le dernier
            mois (champ « dépôt consommé » de la fiche famille) ou don de la famille.
          </p>
        </div>
      )}

      {edit && (
        <Modal
          title={edit === "nouveau" ? `Nouvelle famille · ${annee}` : `${(edit as Inscription).famille_nom} · ${annee}`}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Famille">
                <input type="text" required value={f.famille_nom} onChange={(e) => set("famille_nom", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Nombre d'enfants">
                <select value={f.nb_enfants} onChange={(e) => majMontantDepuisBareme(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant mensuel (€)">
                <input type="text" inputMode="decimal" required value={f.montant_mensuel} onChange={(e) => set("montant_mensuel", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Report de l'année précédente (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={f.avance}
                  onChange={(e) => set("avance", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                  title="Crédit reporté de l'année précédente (colonne « Avance » du classeur) : compte comme réglé. Le dépôt « mois d'avance » se suit, lui, depuis la Comptabilité."
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dépôt antérieur à la compta (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={f.depot_anterieur}
                  onChange={(e) => set("depot_anterieur", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                  title="Mois d'avance versé avant septembre 2023, donc absent de la Comptabilité : à saisir une seule fois, sur la première année connue de la famille."
                />
              </Field>
              <Field label="Dépôt consommé cette année (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  value={f.avance_consommee}
                  onChange={(e) => set("avance_consommee", e.target.value)}
                  className={inputCls}
                  placeholder="0,00"
                  title="À renseigner quand un enfant quitte l'école : la part de son dépôt qui éponge son dernier mois."
                />
              </Field>
            </div>
            <Field label="Emails">
              <input type="text" value={f.emails} onChange={(e) => set("emails", e.target.value)} className={inputCls} placeholder="parent1@… ; parent2@…" />
            </Field>

            <div>
              <div className="mb-1 text-sm font-medium">Paiements mensuels (€)</div>
              <div className="grid grid-cols-5 gap-2">
                {MOIS.map((m) => (
                  <label key={m.k} className="block">
                    <span className="mb-0.5 block text-xs text-muted">{m.l}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={f[m.k as string]}
                      onChange={(e) => set(m.k as string, e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            </div>

            <Field label="Notes / relance">
              <input type="text" value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
            </Field>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Détail d'une famille, déroulé sous sa ligne.
// ---------------------------------------------------------------------------

type Nature = "scolarite" | "dossier" | "depot";

const NATURES_LIGNE: Record<Nature, { l: string; c: string }> = {
  scolarite: { l: "Frais de scolarité", c: "bg-accent-soft text-accent" },
  dossier: { l: "Frais de dossier", c: "bg-surface-2 text-foreground" },
  depot: { l: "Mois d'avance", c: "bg-gold-soft text-gold" },
};

const NATURE_DE: Record<NatureAffectation, Nature> = {
  mensualite: "scolarite",
  don_association: "scolarite",
  frais_dossier: "dossier",
  mois_avance: "depot",
};

type LigneVersement = {
  exercice: string;
  date: string | null;
  nature: Nature;
  libelle: string;
  montant: number;
  origine?: string;
  /** Versement enregistré en comptabilité : une attestation de paiement peut être éditée. */
  attestation?: Attestation;
};

type InscriptionDossier = InscriptionDepot & Partial<Inscription>;

/** Attestation de paiement, avec l'en-tête et la signature du modèle de reçu. */
async function editerAttestation(a: Attestation) {
  const m = await modeleRecuEnCache(createClient());
  await telechargerAttestation(a, {
    adresseRue: m.adresseRue,
    adresseCpVille: m.adresseCpVille,
    tresorierNom: m.tresorierNom,
    courrielContact: m.courrielContact,
    signatureTresorier: m.signatureTresorier,
  });
}

/**
 * Paiements d'une inscription (un exercice) : versements fléchés depuis la
 * Comptabilité, du plus récent au plus ancien, puis les saisies du classeur,
 * sans date (juin → septembre, puis le report).
 */
function paiementsExercice(insc: InscriptionDossier, affectations: AffectationDetail[]): LigneVersement[] {
  const exercice = insc.annee_scolaire;
  const compta: LigneVersement[] = affectations
    .filter((a) => a.inscription_id === insc.id)
    .map((d) => {
      const origine = d.origine ?? (d.nature === "don_association" ? "Association (tiers)" : "Famille");
      return {
        exercice,
        date: d.date_operation || null,
        nature: NATURE_DE[d.nature] ?? "scolarite",
        libelle: d.libelle,
        montant: d.type === "depense" ? -Number(d.montant) : Number(d.montant),
        origine,
        attestation:
          d.type === "recette" && d.date_operation
            ? {
                famille: insc.famille_nom,
                annee_scolaire: exercice,
                nature: d.nature,
                montant: Number(d.montant),
                date: d.date_operation,
                origine: origine === "Association (tiers)" ? "Association" : origine,
              }
            : undefined,
      };
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const classeur: LigneVersement[] = [];
  for (const m of [...MOIS].reverse()) {
    const v = Number(insc[m.k]);
    if (v) classeur.push({ exercice, date: null, nature: "scolarite", libelle: `${m.l} (saisi au classeur)`, montant: v });
  }
  if (Number(insc.avance) > 0) {
    classeur.push({ exercice, date: null, nature: "scolarite", libelle: "Report de l'exercice précédent", montant: Number(insc.avance) });
  }
  return [...compta, ...classeur];
}

function TablePaiements({ lignes, avecExercice = false }: { lignes: LigneVersement[]; avecExercice?: boolean }) {
  if (lignes.length === 0) return <p className="text-muted">Aucun paiement enregistré.</p>;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-[11px] text-muted">
          <th className="border-b border-border pb-1 pr-2 font-medium">Date</th>
          <th className="border-b border-border pb-1 pr-2 font-medium">Nature</th>
          <th className="border-b border-border pb-1 pr-2 font-medium">Libellé</th>
          <th className="hidden border-b border-border pb-1 pr-2 font-medium sm:table-cell">Payeur</th>
          <th className="border-b border-border pb-1 text-right font-medium">Montant</th>
          <th className="border-b border-border pb-1 text-right font-medium" title="Attestation de paiement">Attest.</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, k) => {
          const nouvelExercice = avecExercice && (k === 0 || lignes[k - 1].exercice !== l.exercice);
          return (
            <Fragment key={k}>
              {nouvelExercice && (
                <tr>
                  <td colSpan={6} className={`pb-0.5 font-semibold ${k > 0 ? "pt-3" : ""}`}>
                    Exercice {l.exercice}
                    <span className="ml-2 font-normal tabular-nums text-muted">
                      {formatEuros(lignes.filter((x) => x.exercice === l.exercice).reduce((s, x) => s + x.montant, 0))}
                    </span>
                  </td>
                </tr>
              )}
              <tr className="border-b border-border/40 last:border-0">
                <td className="w-[4.5rem] py-1 pr-2 tabular-nums text-muted">{l.date ? formatDateCourte(l.date) : "—"}</td>
                <td className="w-32 py-1 pr-2">
                  <span className={`inline-block whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium ${NATURES_LIGNE[l.nature].c}`}>
                    {NATURES_LIGNE[l.nature].l}
                  </span>
                </td>
                <td className="py-1 pr-2 break-words">{l.libelle}</td>
                <td className="hidden py-1 pr-2 text-muted sm:table-cell">{l.origine ?? ""}</td>
                <td className={`py-1 text-right tabular-nums whitespace-nowrap ${l.montant < 0 ? "text-negative" : ""}`}>
                  {formatEuros(l.montant)}
                </td>
                <td className="w-10 py-1 text-right">
                  {l.attestation && (
                    <button
                      type="button"
                      onClick={() => editerAttestation(l.attestation!)}
                      className="text-[11px] text-accent hover:underline"
                      title="Attestation de paiement (PDF)"
                    >
                      PDF
                    </button>
                  )}
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Détail compact d'une famille : ses paiements de l'exercice, un par ligne, du
 * plus récent au plus ancien, avec leur nature (frais de scolarité, frais de
 * dossier, mois d'avance). Rien de ce que montre déjà la ligne de la famille
 * n'est répété. En dessous : sa fiche et ses enfants, et le dossier complet
 * (tous ses paiements, tous exercices).
 */
function DetailFamille({
  inscription,
  affectations,
  dossier,
  famille,
  eleves,
}: {
  inscription: Inscription;
  affectations: AffectationDetail[];
  /** Toutes les inscriptions de la famille, tous exercices. */
  dossier: InscriptionDossier[];
  famille: FicheFamille | null;
  eleves: Eleve[];
}) {
  const [volet, setVolet] = useState<"infos" | "dossier" | null>(null);
  const nom = inscription.famille_nom;
  const lignes = paiementsExercice(inscription as InscriptionDossier, affectations);
  const complet = () =>
    [...dossier]
      .sort((a, b) => b.annee_scolaire.localeCompare(a.annee_scolaire))
      .flatMap((i) => paiementsExercice(i, affectations));

  const bouton = (v: "infos" | "dossier", libelle: string) => (
    <button
      type="button"
      onClick={() => setVolet((x) => (x === v ? null : v))}
      aria-expanded={volet === v}
      className={`rounded-lg border px-2.5 py-1 font-medium ${
        volet === v ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface hover:bg-surface-2"
      }`}
    >
      {libelle}
    </button>
  );

  return (
    <div className="py-2 text-xs">
      <TablePaiements lignes={lignes} />

      <div className="mt-2 flex flex-wrap gap-2">
        {bouton("infos", "Informations famille")}
        {bouton("dossier", "Dossier famille complet")}
        <Link
          href={`/carnet?q=${encodeURIComponent(nom.replace(/\s+[A-Z]$/, ""))}`}
          className="rounded-lg border border-border bg-surface px-2.5 py-1 font-medium hover:bg-surface-2"
        >
          Carnet d&apos;adresses →
        </Link>
      </div>

      {volet === "infos" && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <FamilleEnfants famille={famille} eleves={eleves} annee={inscription.annee_scolaire} />
          {(inscription.emails || inscription.notes) && (
            <p className="mt-2 text-muted">
              {inscription.emails && <>Courriels : {inscription.emails}</>}
              {inscription.emails && inscription.notes && " · "}
              {inscription.notes && <>Notes : {inscription.notes}</>}
            </p>
          )}
        </div>
      )}

      {volet === "dossier" && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Dossier complet · frais de scolarité, tous exercices
          </h4>
          <TablePaiements lignes={complet()} avecExercice />
        </div>
      )}
    </div>
  );
}
