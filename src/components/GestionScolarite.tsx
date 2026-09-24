"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEurosCourt as formatEuros } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import JaugeScolarite, { etatJauge } from "@/components/JaugeScolarite";
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

const COULEURS: Record<string, string> = {
  vert: "bg-positive/10 text-positive",
  jaune: "bg-gold-soft text-gold",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  bleu: "bg-accent-soft text-accent",
  gris: "bg-surface-2 text-muted",
};

function Pastille({ couleur, children, title }: { couleur: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${COULEURS[couleur] ?? COULEURS.gris}`}
    >
      {children}
    </span>
  );
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
}: {
  annee: string;
  annees: string[];
  inscriptions: Inscription[];
  /** nb_enfants -> montant mensuel, pour l'année courante. */
  bareme: Record<number, number>;
  /** Dons d'association et mensualités fléchés vers ces familles (comptés comme réglé). */
  affectations?: AffectationRecue[];
  /** Toutes les inscriptions, toutes années : le dépôt suit la famille. */
  toutesInscriptions?: InscriptionDepot[];
  /** Toutes les affectations, avec leur nature et l'opération d'origine. */
  affectationsDetail?: AffectationDetail[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Inscription | "nouveau" | null>(null);
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

  // Totaux de l'année
  const sumDu = inscriptions.reduce((s, i) => s + totalDu(i), 0);
  const sumDon = inscriptions.reduce((s, i) => s + donDe(i.id), 0);
  const sumRegle = inscriptions.reduce((s, i) => s + totalRegle(i) + donDe(i.id), 0);
  const sumReste = sumDu - sumRegle;

  const mensuelTotal = inscriptions.reduce((s, i) => s + Number(i.montant_mensuel), 0);
  const etatGlobal = etatJauge(mensuelTotal, sumRegle, annee);

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
    const texte =
      e.couleur === "vert" ? "Payé" : e.couleur === "violet" ? "Non rendu" : e.couleur === "jaune" ? "Incomplet" : "—";
    return (
      <Pastille couleur={e.couleur} title={lignes.join("\n")}>
        {texte}
        {e.couleur !== "gris" && (
          <span className="opacity-80">
            {formatEuros(e.detenu)}/{formatEuros(e.du)}
          </span>
        )}
      </Pastille>
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
    const texte = e.du === 0 && e.paye === 0 ? "—" : `${formatEuros(e.paye)}/${formatEuros(e.du)}`;
    return (
      <Pastille couleur={e.couleur} title={lignes.join("\n")}>
        {texte}
      </Pastille>
    );
  };


  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Année scolaire</label>
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
            <span className="text-xs text-muted">
              Une graduation par mensualité, de septembre à juin. Le repère marque ce qui devrait être
              perçu à ce jour.
            </span>
          </div>
          <JaugeScolarite etat={etatGlobal} anneeScolaire={annee} />
        </div>
      )}

      {/* Synthèse */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Total attendu", v: sumDu, c: "" },
          { l: "Dont rattachés depuis la compta", v: sumDon, c: sumDon > 0 ? "text-gold" : "text-muted" },
          { l: "Total réglé", v: sumRegle, c: "text-positive" },
          { l: "Reste à percevoir", v: sumReste, c: sumReste > 0 ? "text-negative" : "" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-muted">{s.l}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${s.c}`}>{formatEuros(s.v)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Famille</th>
              <th className="px-4 py-3 font-medium text-center">Enf.</th>
              <th className="px-4 py-3 font-medium text-right">Mensuel</th>
              <th className="px-4 py-3 font-medium text-right">Total dû</th>
              <th
                className="px-4 py-3 font-medium text-center"
                title="Dépôt versé une fois par enfant, l'été précédant son entrée ; il éponge le dernier mois de sa scolarité à l'école. Alimenté par la Comptabilité (affectation « mois d'avance »)."
              >
                Mois d&apos;avance
              </th>
              <th
                className="px-4 py-3 font-medium text-center"
                title={`${FRAIS_DOSSIER_PAR_ENFANT} € par enfant entrant. Alimenté par la Comptabilité (affectation « frais de dossier »).`}
              >
                Frais de dossier
              </th>
              <th className="px-4 py-3 font-medium">Avancement</th>
              <th className="px-4 py-3 font-medium text-right">Réglé</th>
              <th className="px-4 py-3 font-medium text-right">Reste</th>
              <th className="px-2 py-3 font-medium text-right"><span className="sr-only">Modifier</span></th>
            </tr>
          </thead>
          <tbody>
            {inscriptions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted">
                  Aucune famille pour {annee}.
                </td>
              </tr>
            ) : (
              inscriptions.map((i) => {
                const du = totalDu(i);
                const don = donDe(i.id);
                const regle = totalRegle(i) + don;
                const reste = du - regle;
                const detailsDon = donParFamille.get(i.id)?.details ?? [];
                return (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{i.famille_nom}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{i.nb_enfants ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(Number(i.montant_mensuel))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(du)}</td>
                    <td className="px-4 py-3 text-center">{badgeDepot(i)}</td>
                    <td className="px-4 py-3 text-center">{badgeFrais(i)}</td>
                    <td className="px-4 py-3">
                      <JaugeScolarite
                        etat={etatJauge(Number(i.montant_mensuel), regle, annee)}
                        anneeScolaire={annee}
                        compacte
                      />
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums text-positive"
                      title={
                        detailsDon.length > 0
                          ? "Dont rattachés depuis la compta : " +
                            detailsDon
                              .map((d) => `${d.libelle} — ${formatEuros(Number(d.montant))}`)
                              .join(" · ")
                          : undefined
                      }
                    >
                      {formatEuros(regle)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${reste > 0 ? "text-negative" : ""}`}>
                      {formatEuros(reste)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => ouvrir(i)}
                        title={`Saisir ou modifier — ${i.famille_nom}`}
                        aria-label={`Saisir ou modifier les règlements de ${i.famille_nom}`}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent"
                      >
                        <Icon name="crayon" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Légende des deux colonnes alimentées par la Comptabilité */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-medium text-foreground">Mois d&apos;avance et frais de dossier :</span>
        <span><Pastille couleur="vert">vert</Pastille> réglé pour chaque enfant</span>
        <span><Pastille couleur="jaune">jaune</Pastille> versé partiellement ou pas encore</span>
        <span><Pastille couleur="violet">violet</Pastille> enfant parti, dépôt non rendu (restitution ou don à décider)</span>
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
