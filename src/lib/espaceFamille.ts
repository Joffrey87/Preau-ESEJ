// Espace d'une famille : données renvoyées par `espace_famille()` (la seule
// porte d'un compte famille vers la base) et calculs de sa situation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { etatPaiement } from "@/lib/retardScolarite";
import { classeEn, partJuinNonDue, prenomEleve, scolarises, termineEnJuin, type Eleve } from "@/lib/eleves";
import {
  etatDepot,
  etatFraisDossier,
  type AffectationDetail,
  type InscriptionDepot,
  type NatureAffectation,
} from "@/lib/scolariteDepots";
import { lignesRegle, sourceDe, type SourcesScolarite } from "@/lib/regleScolarite";

export type EspaceFamille = {
  famille: {
    id: string;
    nom: string;
    parent1: string | null;
    parent2: string | null;
    adresse: string | null;
    cp_ville: string | null;
    telephone: string | null;
    courriels: string | null;
  };
  eleves: Eleve[];
  inscriptions: (Omit<InscriptionDepot, "famille_nom"> & Record<string, number | string | null> & {
    id: string;
    annee_scolaire: string;
    nb_enfants: number | null;
    montant_mensuel: number;
  })[];
  versements: {
    inscription_id: string;
    nature: NatureAffectation;
    montant: number;
    date: string;
    type: "recette" | "depense";
    mode: string | null;
    origine: string;
  }[];
  activites: {
    activite_id: string;
    titre: string;
    date_activite: string | null;
    date_limite: string | null;
    annee_scolaire: string;
    eleve_id: string;
    prenom: string | null;
    initiale: string | null;
    montant: number;
    paye_le: string | null;
  }[];
  bareme: { annee_scolaire: string; nb_enfants: number; montant_mensuel: number }[];
  /** Source des règlements de chaque année (Comptabilité ou classeur). */
  sources?: SourcesScolarite;
  /** Date de la dernière écriture bancaire intégrée. */
  maj?: string | null;
};

export type Association = {
  adresse_rue: string;
  adresse_cp_ville: string;
  tresorier_nom: string;
  courriel_contact: string;
} | null;

export async function chargerEspace(
  supabase: SupabaseClient,
  apercu: string | null = null,
): Promise<{ espace: EspaceFamille | null; association: Association; erreur: string | null }> {
  // Aperçu par le bureau : la famille désignée ; sinon, la famille du compte.
  const [e, a] = await Promise.all([
    apercu ? supabase.rpc("espace_famille_apercu", { p_famille: apercu }) : supabase.rpc("espace_famille"),
    supabase.rpc("association_espace"),
  ]);
  return {
    espace: (e.data as EspaceFamille | null) ?? null,
    association: (a.data as Association) ?? null,
    erreur: e.error?.message ?? null,
  };
}

export const LIBELLE_MOIS = ["Septembre", "Octobre", "Novembre", "Décembre", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin"];

export type Situation = {
  annee: string;
  /** Inscription de l'année : borne le détail des versements à cette année scolaire. */
  inscriptionId: string;
  mensuel: number;
  du: number;
  partJuin: { montant: number; enfants: Eleve[] };
  regle: number;
  reste: number;
  /** En retard au jour J (dû avant le mois en cours). */
  retard: number;
  /** À régler avant la fin du mois (à partir du 27). */
  aReglerFinDeMois: number;
  lignes: { date: string | null; libelle: string; montant: number; origine: string; nature: NatureAffectation | "classeur"; mode: string | null }[];
  depot: ReturnType<typeof etatDepot>;
  frais: ReturnType<typeof etatFraisDossier>;
};

/** Situation de la famille pour une année scolaire. */
export function situation(espace: EspaceFamille, annee: string, aujourdhui: string): Situation | null {
  const insc = espace.inscriptions.find((i) => i.annee_scolaire === annee);
  if (!insc) return null;
  const bareme: Record<number, number> = {};
  for (const b of espace.bareme) if (b.annee_scolaire === annee) bareme[b.nb_enfants] = Number(b.montant_mensuel);

  const mensuel = Number(insc.montant_mensuel) || 0;
  const partJuin = partJuinNonDue({ annee_scolaire: annee, montant_mensuel: mensuel, nb_enfants: insc.nb_enfants }, espace.eleves, bareme);
  const du = mensuel * 10 - partJuin.montant;

  // Réglé : même calcul que l'onglet Frais de scolarité (une source par année,
  // plus le report ; le mois d'avance n'y entre pas).
  const lignes: Situation["lignes"] = lignesRegle(insc, sourceDe(annee, espace.sources), espace.versements).map((l) => ({
    date: l.date,
    libelle:
      l.nature === "classeur" ? l.libelle.replace(" (classeur)", "") : l.nature === "report" ? l.libelle : "Frais de scolarité",
    montant: l.montant,
    origine: l.origine ?? (l.nature === "report" ? "—" : "Famille"),
    nature: l.nature === "report" ? "classeur" : l.nature,
    mode: l.mode ?? null,
  }));
  const regle = lignes.reduce((s, l) => s + l.montant, 0);
  const paiement = etatPaiement(annee, mensuel, du, regle, aujourdhui, partJuin.montant);

  // Dépôt et frais de dossier, avec les outils de l'onglet Frais de scolarité.
  const toutes: InscriptionDepot[] = espace.inscriptions.map((i) => ({
    id: i.id,
    annee_scolaire: i.annee_scolaire,
    famille_nom: espace.famille.nom,
    nb_enfants: i.nb_enfants,
    montant_mensuel: Number(i.montant_mensuel),
    avance: i.avance == null ? null : Number(i.avance),
    avance_consommee: Number(i.avance_consommee) || 0,
    depot_anterieur: Number(i.depot_anterieur) || 0,
  }));
  const details: AffectationDetail[] = espace.versements.map((v) => ({
    inscription_id: v.inscription_id,
    nature: v.nature,
    montant: Number(v.montant),
    libelle: v.nature === "frais_dossier" ? "Frais de dossier" : v.nature === "mois_avance" ? "Mois d'avance" : "Frais de scolarité",
    date_operation: v.date,
    type: v.type,
    origine: v.origine,
  }));
  const courante = toutes.find((i) => i.id === insc.id)!;

  return {
    annee,
    inscriptionId: insc.id,
    mensuel,
    du,
    partJuin,
    regle,
    reste: du - regle,
    retard: paiement.retard,
    aReglerFinDeMois: paiement.aReglerFinDeMois,
    lignes: lignes.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    depot: etatDepot(courante, toutes, details),
    frais: etatFraisDossier(courante, toutes, details),
  };
}

export type Alerte = { ton: "rouge" | "ambre" | "info"; titre: string; detail?: string; lien?: string };

/** Alertes du tableau de bord de la famille. */
export function alertes(espace: EspaceFamille, s: Situation | null, aujourdhui: string): Alerte[] {
  const out: Alerte[] = [];
  if (s && s.retard > 0.005) {
    out.push({ ton: "rouge", titre: `Frais de scolarité : ${s.retard.toFixed(2).replace(".", ",")} € en retard`, detail: "Mensualités des mois passés non encore reçues.", lien: "/espace/paiements" });
  } else if (s && s.aReglerFinDeMois > 0.005) {
    out.push({ ton: "ambre", titre: `Mensualité de ${s.aReglerFinDeMois.toFixed(2).replace(".", ",")} € à régler avant la fin du mois`, lien: "/espace/paiements" });
  }
  if (s && s.frais.du > s.frais.paye + 0.005) {
    out.push({ ton: "ambre", titre: "Frais de dossier à régler", detail: `${(s.frais.du - s.frais.paye).toFixed(2).replace(".", ",")} € restants.`, lien: "/espace/paiements" });
  }
  if (s && s.depot.couleur === "jaune" && s.depot.du > 0) {
    out.push({ ton: "ambre", titre: "Mois d'avance (dépôt) incomplet", detail: `Attendu ${s.depot.du} € ; versé ${s.depot.detenu} €.`, lien: "/espace/paiements" });
  }
  const impayees = espace.activites.filter((a) => !a.paye_le && (!s || a.annee_scolaire === s.annee));
  for (const a of impayees) {
    const depasse = a.date_limite && a.date_limite < aujourdhui;
    out.push({
      ton: depasse ? "rouge" : "ambre",
      titre: `Activité à régler : ${a.titre}${a.initiale ? ` (${a.prenom ?? `${a.initiale}.`})` : ""}`,
      detail: `${Number(a.montant).toFixed(2).replace(".", ",")} €${a.date_limite ? ` — avant le ${a.date_limite.split("-").reverse().join("/")}` : ""}`,
      lien: "/espace/paiements",
    });
  }
  if (s) {
    for (const e of espace.eleves.filter((x) => termineEnJuin(x, s.annee))) {
      out.push({ ton: "info", titre: `Dernière année à l'école pour ${prenomEleve(e)} (CM2)`, detail: "Le mois de juin n'est pas dû pour cet enfant : il est couvert par le mois d'avance." });
    }
  }
  const f = espace.famille;
  if (!f.telephone || !f.adresse) out.push({ ton: "info", titre: "Fiche famille à compléter", detail: "Adresse ou téléphone manquant : contactez l'école.", lien: "/espace/famille" });
  if (s && scolarises(espace.eleves, s.annee).length === 0) out.push({ ton: "info", titre: "Enfants non encore renseignés", detail: "L'école complétera la liste de vos enfants." });
  return out;
}

export { classeEn };

/** Année scolaire en cours (septembre → août) ; à défaut, la plus récente de la famille. */
export function anneeCourante(espace: EspaceFamille, aujourdhui: string): string | null {
  const y = Number(aujourdhui.slice(0, 4));
  const m = Number(aujourdhui.slice(5, 7));
  const courante = m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  if (espace.inscriptions.some((i) => i.annee_scolaire === courante)) return courante;
  return espace.inscriptions[0]?.annee_scolaire ?? null;
}
