"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate } from "@/lib/format";
import {
  parseReleve,
  soldeReleve,
  embellirLibelle,
  suggereCategorieIntelligente,
  construireHistorique,
  construireIndexTokens,
  devineMode,
  type LigneReleve,
} from "@/lib/releve";
import { appliquerCorrespondances, type Correspondance, type NiveauAlerte } from "@/lib/correspondances";
import {
  regleImport,
  analyserScolarite,
  parleDeDon,
  reconnaitreFamille,
  famillesProposees,
  anneesCandidates,
  anneeDeLibelle,
  libelleFamille,
  estAmitieSainteAnne,
  proposerRepartition,
  motsPayeur,
  rappeler,
  nomDepuisLibelle,
  titreDepuisLibelle,
  categorieDonateurDepuisLibelle,
  modeDon,
  type InscriptionImport,
  type RepartitionTiers,
  type Souvenir,
} from "@/lib/importEnrichi";
import {
  CAT_SCOLARITE,
  CAT_MOIS_AVANCE,
  CAT_FRAIS_DOSSIER,
  CAT_DON_ASSOCIATION,
  CATS_SCOLARITE,
  natureParCategorie,
  nomCanonique,
} from "@/lib/categoriesScolarite";
import { libelleNature, type NatureAffectation } from "@/lib/scolariteDepots";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import ChoixDonateur, { type IdentiteSaisie } from "@/components/ChoixDonateur";
import ChampsDonateur, {
  type FormDonateur,
  formDonateurDepuisNom,
  formDonateurDepuisDon,
  resumeDonateur,
  ficheDonateurValide,
  piiDeFiche,
  relationsConnues,
} from "@/components/FormulaireDonateur";
import ImportsPasses, { type ImportPasse } from "@/components/ImportsPasses";
import { Modal, FormFooter } from "./GestionComptes";
import {
  extraireNom,
  joursEcart,
  identitesDonateurs,
  reconnaitreDonateur,
  type IdentiteDonateur,
} from "@/lib/reconciliation";
import { nomDonateur, cleDonateur } from "@/lib/statutDon";
import { LIBELLE_DON, chiffrerLibellesDon, dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import type { Don } from "@/components/GestionDons";

export type { ImportPasse };

type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string; solde_initial: number };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean };
type DonExistant = Don & { operation_id: string | null };

export type OpExistante = {
  id: string;
  date_operation: string;
  montant: number;
  type: string;
  libelle: string;
  libelle_origine: string | null;
  /** Libellés d'origine chiffrés (opérations « Don »). */
  libelle_origine_chiffre?: string | null;
  categorie_id: string | null;
  compte_id: string | null;
  parent_id: string | null;
  est_ventilee: boolean;
};

type AffectationExistante = { operation_id: string; inscription_id: string; montant: number; nature: NatureAffectation };

const CAT_DON = "Don";

/** Catégorie correspondant à une nature d'affectation. */
const CATEGORIE_DE_NATURE: Record<NatureAffectation, string> = {
  mensualite: CAT_SCOLARITE,
  mois_avance: CAT_MOIS_AVANCE,
  frais_dossier: CAT_FRAIS_DOSSIER,
  don_association: CAT_DON_ASSOCIATION,
};

/**
 * Écriture en préparation : la ligne bancaire elle-même, ou l'une de ses
 * sous-écritures. Les champs facultatifs distinguent le choix AUTOMATIQUE
 * (absent) du choix de l'utilisateur (présent, éventuellement vide).
 */
type Ecriture = {
  libelle: string;
  categorie_id: string;
  /** Familles proposées par l'analyse (ids). Absent : reconnaissance par le nom. */
  candidats?: string[];
  /** Famille choisie à la main ("" = aucune). Absent : choix automatique. */
  famille?: string;
  /** Fiche donateur choisie ou saisie (null = aucune). Absent : donateur reconnu automatiquement. */
  donateur?: FormDonateur | null;
  /** Don existant à relier ("" = ne pas relier). Absent : liaison automatique. */
  donLie?: string;
  /** Nom du donateur saisi pour le rapprochement. Absent : nom lu dans le libellé. */
  nomDonateur?: string;
  /** Doute à lever (ambre). Vidé dès que l'utilisateur tranche. */
  alerte: string | null;
};

type Fille = Ecriture & {
  cle: string;
  montant: string;
  /** Montant calculé (reste à ventiler), recalculé tant qu'il n'est pas saisi à la main. */
  montantAuto?: boolean;
};

type Ligne = LigneReleve &
  Ecriture & {
    key: string;
    libelle_origine: string; // libellé bancaire brut conservé
    inclus: boolean;
    doublon: boolean; // même montant + date ±1j → déjà en compta (décoché)
    suspect: boolean; // même montant + date ±5j → doublon possible (coché, surligné)
    // opération de la compta correspondante (pour comparaison sous la ligne)
    existant: { date: string; libelle: string; montant: number; type: string; categorie: string | null } | null;
    // Alerte issue d'une règle de Correspondance (indicative, non enregistrée).
    regle_niveau: NiveauAlerte | null;
    regle_message: string | null;
    /** Remise de chèques : une sous-écriture par chèque. */
    remise: boolean;
    filles: Fille[];
    ouvert: boolean;
  };

type Filtre = "toutes" | "a_classer" | "scolarite" | "dons" | "a_valider";

/** Rattachement calculé d'une écriture à une famille. */
type InfoFamille = {
  nature: NatureAffectation;
  candidats: string[];
  effective: string;
  ambigu: boolean;
  memorise: boolean;
  proposees: InscriptionImport[];
};

/** Rattachement calculé d'une écriture « Don » à l'onglet Dons. */
type InfoDon = {
  /** Don existant relié (explicitement ou automatiquement). */
  donLie: string | null;
  lienAuto: boolean;
  /** Fiche du don à créer (null : aucun don créé). */
  fiche: FormDonateur | null;
  source: "saisie" | "reconnu" | "memoire" | "doute" | "nouveau" | "aucun";
  /** Nom lu dans le libellé (bancaire, puis saisi dans Préau). */
  nomDefaut: string;
  /** Coffre verrouillé : ni rapprochement ni création possibles. */
  verrou: boolean;
  /** Doute à lever (ambre, reporté dans « à vérifier »). */
  doute: string | null;
  candidats: IdentiteDonateur[];
  proches: DonExistant[];
};

let compteurFille = 0;
const nouvelleCle = () => `f${++compteurFille}`;
const signe = (type: string, montant: number) => (type === "recette" ? montant : -montant);
const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Reporte le reste à ventiler sur la dernière sous-écriture au montant automatique. */
function equilibrer(total: number, filles: Fille[]): Fille[] {
  let k = -1;
  filles.forEach((f, j) => {
    if (f.montantAuto) k = j;
  });
  if (k < 0) return filles;
  const autres = filles.reduce((s, f, j) => (j === k ? s : s + (Number(f.montant) || 0)), 0);
  const reste = arrondi(total - autres);
  return filles.map((f, j) => (j === k ? { ...f, montant: reste > 0 ? reste.toFixed(2) : "" } : f));
}

export default function ImportReleve({
  categories,
  comptes,
  exercices,
  existantes,
  correspondances = [],
  inscriptions = [],
  dons: donsInit = [],
  affectations = [],
  imports = [],
}: {
  categories: Cat[];
  comptes: Compte[];
  exercices: Exercice[];
  existantes: OpExistante[];
  correspondances?: Correspondance[];
  inscriptions?: InscriptionImport[];
  dons?: DonExistant[];
  affectations?: AffectationExistante[];
  imports?: ImportPasse[];
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const { dons } = useDonsDechiffres(donsInit);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [ignores, setIgnores] = useState(0);
  const [suspects, setSuspects] = useState(0);
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [solde, setSolde] = useState<{ date: string; montant: number } | null>(null);
  const [calage, setCalage] = useState<"ferme" | "confirmer" | "encours">("ferme");
  const [demandeCoffre, setDemandeCoffre] = useState(false);
  // Fiche donateur en cours d'édition : ligne + sous-écriture éventuelle.
  const [cibleDon, setCibleDon] = useState<{ i: number; cle: string | null } | null>(null);
  const [fDon, setFDon] = useState<FormDonateur>(formDonateurDepuisNom(""));
  const [erreurDon, setErreurDon] = useState<string | null>(null);

  // Les sous-écritures ne sont pas des lignes du relevé : la détection des
  // doublons ne porte que sur les lignes bancaires.
  const lignesBancaires = useMemo(() => existantes.filter((o) => !o.parent_id), [existantes]);
  const historique = useMemo(() => construireHistorique(existantes), [existantes]);
  const indexTokens = useMemo(() => construireIndexTokens(existantes), [existantes]);
  const catParId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  /** Nom canonique de la catégorie (les anciens noms de scolarité sont traduits). */
  const catNom = (id: string | null | undefined) => nomCanonique(id ? catParId.get(id)?.nom : null);
  const catIdParNom = (nom: string, type: "recette" | "depense") =>
    categories.find((c) => nomCanonique(c.nom) === nom && c.type === type)?.id ?? "";
  const inscParId = useMemo(() => new Map(inscriptions.map((i) => [i.id, i])), [inscriptions]);
  const relations = useMemo(() => relationsConnues(dons), [dons]);
  const identites = useMemo(
    () => (coffre.estOuvert ? identitesDonateurs(dons.filter((d) => !d.supprime_le)) : []),
    [dons, coffre.estOuvert],
  );

  // --- Mémoire des choix déjà faits -----------------------------------------

  const opsParId = useMemo(() => new Map(existantes.map((o) => [o.id, o])), [existantes]);

  // Libellés chiffrés des opérations « Don », relus coffre ouvert : ils
  // nourrissent la mémoire des donateurs sans jamais être stockés en clair.
  const [brutsDons, setBrutsDons] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!coffre.estOuvert) return;
    let annule = false;
    (async () => {
      const m = new Map<string, string>();
      for (const o of existantes) {
        if (!o.libelle_origine_chiffre) continue;
        const t = texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre));
        if (t) m.set(o.id, t);
      }
      if (!annule) setBrutsDons(m);
    })();
    return () => {
      annule = true;
    };
  }, [existantes, coffre.estOuvert, coffre.dechiffrer]);

  /** Libellé bancaire d'une opération (celui de sa ligne bancaire pour une sous-écriture). */
  const brutDe = (o: OpExistante | undefined): string | null => {
    if (!o) return null;
    const propre = o.libelle_origine ?? brutsDons.get(o.id) ?? null;
    if (propre) return propre;
    const p = o.parent_id ? opsParId.get(o.parent_id) : undefined;
    return p ? (p.libelle_origine ?? brutsDons.get(p.id) ?? null) : null;
  };

  /** Libellé bancaire → famille rattachée (hors Amitié Sainte Anne, payeur de plusieurs familles). */
  const souvenirsFamilles = useMemo<Souvenir[]>(() => {
    const out: Souvenir[] = [];
    for (const a of affectations) {
      const o = opsParId.get(a.operation_id);
      const b = brutDe(o);
      const i = inscParId.get(a.inscription_id);
      if (!b || !i || estAmitieSainteAnne(b)) continue;
      out.push({ mots: [...motsPayeur([b])], valeur: `${i.famille_nom}|${a.nature}` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectations, opsParId, inscParId]);

  /** Libellé bancaire → donateur relié. */
  const souvenirsDonateurs = useMemo<Souvenir[]>(() => {
    if (!coffre.estOuvert) return [];
    const out: Souvenir[] = [];
    for (const d of dons) {
      if (!d.operation_id || d.supprime_le) continue;
      const b = brutDe(opsParId.get(d.operation_id));
      const cle = cleDonateur(d);
      if (!b || !cle || cle === "|") continue;
      out.push({ mots: [...motsPayeur([b])], valeur: cle });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dons, opsParId, coffre.estOuvert, brutsDons]);

  /** Dernier versement d'Amitié Sainte Anne réparti entre des familles. */
  const derniereRepartition = useMemo<RepartitionTiers | null>(() => {
    const groupes = new Map<string, RepartitionTiers>();
    for (const a of affectations) {
      const o = opsParId.get(a.operation_id);
      const b = brutDe(o);
      const i = inscParId.get(a.inscription_id);
      if (!o || !b || !i || !estAmitieSainteAnne(b)) continue;
      const cle = o.parent_id ?? o.id;
      const g = groupes.get(cle) ?? { date: o.date_operation, total: 0, parts: [] };
      g.parts.push({ famille_nom: i.famille_nom, montant: Number(a.montant), nature: a.nature });
      g.total = arrondi(g.total + Number(a.montant));
      groupes.set(cle, g);
    }
    let derniere: RepartitionTiers | null = null;
    for (const g of groupes.values()) if (!derniere || g.date > derniere.date) derniere = g;
    return derniere;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectations, opsParId, inscParId]);

  function exerciceDe(date: string): Exercice | null {
    return (
      exercices.find((e) => e.date_debut <= date && date <= e.date_fin) ??
      exercices.find((e) => e.actif) ??
      null
    );
  }
  const anneesDe = (date: string) => anneesCandidates(date, anneeDeLibelle(exerciceDe(date)?.libelle));

  /** Nature d'affectation portée par la catégorie (null : écriture sans famille). */
  function natureDe(categorieId: string): NatureAffectation | null {
    const nom = catNom(categorieId);
    if (nom === CAT_DON_ASSOCIATION) return "don_association";
    return natureParCategorie(nom);
  }

  /** Famille mémorisée pour ces libellés, parmi les familles permises (toutes si vide). */
  function familleMemorisee(textes: string[], date: string, parmi: string[]): string | null {
    const m = rappeler(textes, souvenirsFamilles);
    if (!m) return null;
    const nom = m.split("|")[0];
    const hit = famillesProposees(inscriptions, anneesDe(date)).find(
      (p) => p.famille_nom === nom && (parmi.length === 0 || parmi.includes(p.id)),
    );
    return hit?.id ?? null;
  }

  /**
   * Famille d'une écriture. Les groupes de textes sont essayés dans l'ordre :
   * pour une sous-écriture, son propre libellé d'abord, puis celui de la banque.
   * La mémoire des choix départage des homonymes ou supplée un nom absent.
   */
  function infoFamille(e: Ecriture, textes: string[][], date: string): InfoFamille | null {
    const nature = natureDe(e.categorie_id);
    if (!nature) return null;
    const annees = anneesDe(date);
    let candidats = e.candidats;
    if (!candidats) {
      candidats = [];
      for (const t of textes) {
        const r = reconnaitreFamille(t, inscriptions, annees);
        if (r.candidats.length > 0) {
          candidats = r.candidats.map((c) => c.id);
          break;
        }
      }
    }
    let memorise = false;
    if (e.famille === undefined && candidats.length !== 1) {
      const m = familleMemorisee(textes.flat(), date, candidats);
      if (m) {
        candidats = [m];
        memorise = true;
      }
    }
    const effective = e.famille !== undefined ? e.famille : candidats.length === 1 ? candidats[0] : "";
    return {
      nature,
      candidats,
      effective,
      ambigu: e.famille === undefined && candidats.length > 1,
      memorise,
      proposees: famillesProposees(inscriptions, annees),
    };
  }

  const textesMere = (l: Ligne) => [[l.libelle_origine, l.libelle]];
  const textesFille = (l: Ligne, f: Fille) => [[f.libelle], [l.libelle_origine]];

  /** Dons déjà saisis (non reliés) de même montant, à ±3 jours : à relier plutôt qu'à recréer. */
  function donsProches(montant: number, date: string): DonExistant[] {
    return dons.filter(
      (d) =>
        !d.operation_id &&
        !d.supprime_le &&
        Math.abs(Number(d.montant) - montant) < 0.005 &&
        d.date_don &&
        joursEcart(d.date_don, date) <= 3,
    );
  }

  /**
   * Don d'une écriture : il est CRÉÉ D'OFFICE dans l'onglet Dons, avec le
   * maximum d'informations. Le donateur est rapproché de la base Donateurs
   * d'après le nom saisi, à défaut d'après le libellé bancaire ou celui de
   * Préau (nom + prénom : certain ; nom seul ou plusieurs donateurs : doute,
   * alerte ambre), à défaut d'après la mémoire des liaisons passées. Sans
   * correspondance, c'est un nouveau donateur : fiche tirée du libellé (nom,
   * civilité), que l'onglet Dons signalera comme incomplète. Un don déjà saisi
   * du même donateur, même montant, à ±3 jours, est relié plutôt que recréé.
   */
  function infoDon(e: Ecriture, textes: string[][], montant: number, date: string): InfoDon | null {
    if (catNom(e.categorie_id) !== CAT_DON) return null;
    const proches = donsProches(montant, date);
    const plats = textes.flat();
    const nomDefaut = plats.map((t) => nomDepuisLibelle(t)).find(Boolean) ?? "";
    const base: InfoDon = {
      donLie: null, lienAuto: false, fiche: null, source: "aucun", doute: null, candidats: [], proches,
      nomDefaut, verrou: !coffre.estOuvert,
    };
    if (e.donLie) return { ...base, donLie: e.donLie };
    if (e.donateur !== undefined) return { ...base, fiche: e.donateur, source: e.donateur ? "saisie" : "aucun" };
    if (!coffre.estOuvert) return base;

    // Le nom saisi fait foi ; sinon les libellés.
    const nom = (e.nomDonateur ?? nomDefaut).trim();
    const r = reconnaitreDonateur(e.nomDonateur !== undefined ? [e.nomDonateur] : plats, identites);
    let candidats = r?.candidats ?? [];
    let certain = r?.certain ?? false;
    let source: InfoDon["source"] = certain ? "reconnu" : "doute";
    if (candidats.length === 0 && e.nomDonateur === undefined) {
      const cle = rappeler(plats, souvenirsDonateurs);
      const id = cle ? identites.find((x) => x.cle === cle) : undefined;
      if (id) {
        candidats = [id];
        certain = true;
        source = "memoire";
      }
    }

    if (candidats.length === 1) {
      const c = candidats[0];
      const memeDonateur = e.donLie === "" ? undefined : proches.find((p) => cleDonateur(p) === c.cle);
      if (memeDonateur) return { ...base, donLie: memeDonateur.id, lienAuto: true, source, candidats };
      return {
        ...base,
        fiche: formDonateurDepuisDon(c.exemple),
        source,
        candidats,
        doute: certain ? null : `Donateur déduit du nom seul (${c.nom}) : à confirmer.`,
      };
    }
    // Fiche d'un nouveau donateur, tirée du libellé : nom, civilité, et
    // personne morale reconnue à sa forme (association, société…).
    const brutRef = plats[plats.length - 1] ?? "";
    const ficheNouvelle = (): FormDonateur => {
      const f = formDonateurDepuisNom(nom);
      f.donateur_titre = titreDepuisLibelle(plats.join(" "));
      const cat = categorieDonateurDepuisLibelle(`${nom} ${brutRef}`);
      if (cat) {
        f.categorie_donateur = cat;
        f.est_personne_morale = true;
        f.raison_sociale = nom;
        f.donateur_nom = "";
        f.donateur_titre = "";
      }
      return f;
    };

    if (candidats.length > 1) {
      // Créé au nom lu, rattachement au bon donateur à valider.
      return {
        ...base,
        fiche: ficheNouvelle(),
        source: "doute",
        candidats,
        doute: `Plusieurs donateurs possibles (${candidats.map((c) => c.nom).join(", ")}) : à valider.`,
      };
    }
    if (proches.length > 0 && e.donLie !== "") {
      // Un don de même montant est déjà saisi : on ne crée pas de doublon d'office.
      return {
        ...base,
        doute: `Donateur non reconnu ; un don de même montant est déjà saisi (${proches.map((p) => `${nomDonateur(p)} ${formatDate(p.date_don)}`).join(", ")}) : relier, ou créer le don.`,
      };
    }
    return {
      ...base,
      fiche: ficheNouvelle(),
      source: "nouveau",
      doute: nom ? null : "Nom du donateur absent du libellé : à renseigner.",
    };
  }

  // --- Lecture du relevé ------------------------------------------------------

  function traiter(buf: ArrayBuffer, nom: string) {
    setErreur(null);
    setFait(null);
    setCalage("ferme");
    try {
      const brut = parseReleve(buf);
      setSolde(soldeReleve(buf));
      if (brut.length === 0) {
        setErreur("Aucune opération détectée. Vérifiez que c'est bien l'export Excel de la banque (colonnes Date / Libellé / Débit / Crédit).");
        setLignes([]);
        return;
      }
      // Détection sur DATE + MONTANT. Deux niveaux, en deux passes
      // (le match exact ±1j est prioritaire, il « consomme » l'opération) :
      //   • ±1 jour  → déjà en compta      → grisée + DÉCOCHÉE
      //   • ±5 jours → doublon possible     → surlignée + COCHÉE (à vérifier)
      // Exception : deux opérations clairement rattachées à des familles
      // différentes (ex. frais de dossier de deux familles le même mois) ne sont
      // jamais rapprochées, quel que soit l'écart de date.
      const jour = (iso: string) => Math.round(Date.parse(iso) / 86400000);
      const famillesDeTextes = (textes: string[], date: string) =>
        new Set(reconnaitreFamille(textes, inscriptions, anneesDe(date)).candidats.map((c) => c.famille_nom));
      // Familles déjà rattachées en compta, portées par la ligne bancaire (ou ses sous-écritures).
      const famillesAffectees = new Map<string, Set<string>>();
      for (const a of affectations) {
        const o = opsParId.get(a.operation_id);
        const i = inscParId.get(a.inscription_id);
        if (!o || !i) continue;
        const cle = o.parent_id ?? o.id;
        const s = famillesAffectees.get(cle) ?? new Set<string>();
        s.add(i.famille_nom);
        famillesAffectees.set(cle, s);
      }
      const existing = lignesBancaires.map((o) => {
        const affectees = famillesAffectees.get(o.id);
        const b = brutDe(o);
        return {
          m: Number(o.montant).toFixed(2), j: jour(o.date_operation),
          date: o.date_operation, lib: o.libelle, montant: Number(o.montant), type: o.type, cat: o.categorie_id, used: false,
          familles: affectees && affectees.size > 0
            ? affectees
            : famillesDeTextes(b ? [b, o.libelle] : [o.libelle], o.date_operation),
        };
      });
      type Existant = { date: string; libelle: string; montant: number; type: string; categorie: string | null };
      const mkExistant = (e: (typeof existing)[number]): Existant => ({
        date: e.date, libelle: e.lib, montant: e.montant, type: e.type,
        categorie: catNom(e.cat),
      });
      type P = {
        op: (typeof brut)[number]; i: number; m: string; j: number; familles: Set<string>;
        doublon: boolean; suspect: boolean; existant: Existant | null;
      };
      const p: P[] = brut.map((op, i) => ({
        op, i, m: op.montant.toFixed(2), j: jour(op.date), familles: famillesDeTextes([op.libelle], op.date),
        doublon: false, suspect: false, existant: null,
      }));
      /** Familles identifiées des deux côtés et sans aucune en commun : opérations distinctes. */
      const famillesDistinctes = (a: Set<string>, b: Set<string>) =>
        a.size > 0 && b.size > 0 && ![...a].some((f) => b.has(f));
      const chercher = (x: P, tol: number) =>
        existing.findIndex(
          (e) => !e.used && e.m === x.m && Math.abs(e.j - x.j) <= tol && !famillesDistinctes(e.familles, x.familles),
        );
      for (const x of p) {
        const idx = chercher(x, 1);
        if (idx >= 0) { existing[idx].used = true; x.doublon = true; x.existant = mkExistant(existing[idx]); }
      }
      for (const x of p) {
        if (x.doublon) continue;
        const idx = chercher(x, 5);
        if (idx >= 0) { existing[idx].used = true; x.suspect = true; x.existant = mkExistant(existing[idx]); }
      }
      let ignoresN = 0, suspectsN = 0;
      const l: Ligne[] = p.map((x) => {
        if (x.doublon) ignoresN++;
        if (x.suspect) suspectsN++;
        const { op } = x;

        // 1. Règles intégrées prioritaires (impayé) ;
        // 2. règles de Correspondances ; à défaut, l'embellissement intégré ;
        // 3. cas particuliers : Amitié Sainte Anne (répartition entre familles),
        //    remise de chèques (un chèque par sous-écriture) ;
        // 4. reconnaissance des écritures de scolarité (mots-clés, puis montant),
        //    puis mémoire des choix déjà faits pour ce payeur.
        const regle = regleImport(op.libelle, op.type);
        const res = appliquerCorrespondances(
          { libelle_origine: op.libelle, montant: op.montant, type: op.type, date_operation: op.date },
          correspondances,
        );
        let libelle = regle ? regle.libelle : res.regle ? res.libelle : embellirLibelle(op.libelle, op.montant, op.type);
        let categorie_id = regle
          ? catIdParNom(regle.categorie, op.type)
          : res.categorie_id ?? suggereCategorieIntelligente(op.libelle, op.type, categories, historique, indexTokens);
        let alerte: string | null = null;
        let candidats: string[] | undefined;
        let filles: Fille[] = [];
        let ouvert = false;
        const remise = op.type === "recette" && /^rem(ise)?\s+(de\s+)?ch(q|eque)/i.test(op.libelle.trim());
        const annees = anneesDe(op.date);
        const idFamille = (nomFamille: string) =>
          famillesProposees(inscriptions, annees).find((i) => i.famille_nom === nomFamille)?.id;

        if (regle) {
          // règle intégrée : rien d'autre à deviner
        } else if (op.type === "recette" && estAmitieSainteAnne(op.libelle)) {
          // Amitié Sainte Anne paie des frais de scolarité pour des familles : ce
          // n'est pas un don. Répartition reprise du dernier versement réparti.
          categorie_id = catIdParNom(CAT_SCOLARITE, op.type) || categorie_id;
          const parts = proposerRepartition(derniereRepartition, op.montant);
          filles = parts.map((pt) => {
            const id = idFamille(pt.famille_nom);
            return {
              cle: nouvelleCle(),
              libelle: `Frais de scolarité — ${pt.famille_nom} (Amitié Sainte Anne)`,
              categorie_id: catIdParNom(CATEGORIE_DE_NATURE[pt.nature] ?? CAT_SCOLARITE, op.type),
              montant: pt.montant.toFixed(2),
              candidats: id ? [id] : [],
              alerte: null,
            };
          });
          ouvert = true;
          const identique = derniereRepartition && Math.abs(derniereRepartition.total - op.montant) < 0.005;
          alerte =
            parts.length > 0
              ? `Répartition reprise du versement du ${formatDate(derniereRepartition!.date)} (${parts.map((pt) => pt.famille_nom).join(", ")})${identique ? "" : ", au prorata du montant"} : à vérifier.`
              : "Amitié Sainte Anne : répartissez le versement entre les familles (une sous-écriture par famille).";
        } else if (remise) {
          ouvert = true;
          alerte = "Remise de chèques : ajoutez une sous-écriture par chèque (tireur, objet).";
        } else {
          const catCorr = res.regle ? catNom(res.categorie_id) : null;
          // Un don d'association reste un don : seule la famille bénéficiaire se rattache.
          if (catCorr !== CAT_DON_ASSOCIATION) {
            const corrAutre = !!catCorr && !CATS_SCOLARITE.includes(catCorr);
            const a = analyserScolarite(
              op.libelle,
              op.type,
              op.montant,
              op.date,
              anneeDeLibelle(exerciceDe(op.date)?.libelle),
              inscriptions,
              { avecNom: !corrAutre && !parleDeDon(op.libelle), sansNom: !categorie_id },
            );
            if (a) {
              categorie_id = catIdParNom(a.categorie, op.type) || categorie_id;
              if (a.libelle) libelle = a.libelle;
              alerte = a.alerte;
              candidats = a.candidats;
              // Homonymes : un choix déjà fait pour ce payeur les départage.
              if (a.candidats.length > 1) {
                const m = familleMemorisee([op.libelle], op.date, a.candidats);
                if (m) {
                  candidats = [m];
                  if (a.alerte?.startsWith("Plusieurs familles portent ce nom")) alerte = null;
                }
              }
              filles = a.ventilation.map((v) => ({
                cle: nouvelleCle(),
                libelle: v.libelle,
                categorie_id: catIdParNom(v.categorie, op.type),
                montant: v.montant.toFixed(2),
                candidats,
                alerte: null,
              }));
              ouvert = filles.length > 0;
            } else if (op.type === "recette" && !corrAutre && !parleDeDon(op.libelle)) {
              // Payeur déjà rattaché à une famille lors d'un précédent import.
              const m = rappeler([op.libelle], souvenirsFamilles);
              if (m) {
                const [nomFamille, nature] = m.split("|") as [string, NatureAffectation];
                const id = idFamille(nomFamille);
                const cat = catIdParNom(CATEGORIE_DE_NATURE[nature] ?? CAT_SCOLARITE, op.type);
                if (id && cat) {
                  categorie_id = cat;
                  candidats = [id];
                  alerte = `Famille ${nomFamille} reprise d'un précédent rattachement pour ce payeur : à confirmer.`;
                }
              }
            }
          }
        }

        // Chèque impayé ou rejeté : le don correspondant (même montant, encaissé
        // dans les 4 mois précédents) est à annuler, ainsi que son reçu.
        if (op.type === "depense") {
          const n = op.libelle.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          if (/(chq|cheque).*(impaye|rejet)|(impaye|rejet).*(chq|cheque)/.test(n)) {
            const jourOp = Date.parse(op.date);
            const donOrigine = existantes.find(
              (o) =>
                o.type === "recette" &&
                catNom(o.categorie_id) === CAT_DON &&
                Math.abs(Number(o.montant) - op.montant) < 0.005 &&
                jourOp - Date.parse(o.date_operation) >= 0 &&
                jourOp - Date.parse(o.date_operation) <= 120 * 86400000,
            );
            alerte = donOrigine
              ? `Chèque impayé : le don de ${formatEuros(op.montant)} encaissé le ${formatDate(donOrigine.date_operation)} est à annuler dans l'onglet Dons (et son reçu s'il est établi).`
              : "Chèque impayé : retrouvez le don concerné dans l'onglet Dons pour l'annuler (et son reçu s'il est établi).";
          }
        }

        return {
          ...op,
          libelle,
          libelle_origine: op.libelle, // conservé : brut bancaire
          key: `${op.date}-${op.montant}-${x.i}`,
          doublon: x.doublon,
          suspect: x.suspect,
          existant: x.existant,
          regle_niveau: res.alerte,
          regle_message: res.alerte_message,
          inclus: !x.doublon, // doublon possible reste coché
          categorie_id,
          candidats,
          alerte,
          remise,
          filles,
          ouvert,
        };
      });
      setLignes(l);
      setIgnores(ignoresN);
      setSuspects(suspectsN);
      setNomFichier(nom);
      setFiltre("toutes");
    } catch (err) {
      setErreur("Lecture impossible : " + (err instanceof Error ? err.message : "fichier invalide"));
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    traiter(await file.arrayBuffer(), file.name);
    e.target.value = "";
  }

  const maj = (i: number, patch: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const majFille = (i: number, cle: string, patch: Partial<Fille>) =>
    setLignes((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        // Un montant saisi à la main n'est plus recalculé ; le reste est reporté
        // sur la dernière sous-écriture au montant automatique.
        const p = patch.montant !== undefined ? { ...patch, montantAuto: false } : patch;
        const filles = l.filles.map((f) => (f.cle === cle ? { ...f, ...p } : f));
        return { ...l, filles: patch.montant !== undefined ? equilibrer(l.montant, filles) : filles };
      }),
    );
  /** Modifie la ligne ou l'une de ses sous-écritures. */
  const majEcriture = (i: number, cle: string | null, patch: Partial<Ecriture>) =>
    cle ? majFille(i, cle, patch) : maj(i, patch);

  const resteFilles = (l: Ligne) =>
    arrondi(l.montant - l.filles.reduce((s, f) => s + (Number(f.montant) || 0), 0));

  const filleVide = (l: Ligne, montant: string, montantAuto: boolean): Fille => ({
    cle: nouvelleCle(),
    libelle: l.remise ? "Chèque — " : `${l.libelle} — `,
    categorie_id: "",
    montant,
    montantAuto,
    alerte: null,
  });

  /** Ajoute une sous-écriture, qui reçoit le reste à ventiler (les précédentes sont figées). */
  function ajouterFille(i: number) {
    const l = lignes[i];
    const reste = resteFilles(l);
    maj(i, {
      ouvert: true,
      filles: [
        ...l.filles.map((f) => ({ ...f, montantAuto: false })),
        filleVide(l, reste > 0 ? reste.toFixed(2) : "", true),
      ],
    });
  }

  /**
   * Chevron d'une ligne non ventilée : ouvre directement deux sous-écritures.
   * La seconde porte le reste et se recalcule quand on saisit le montant de la première.
   */
  function ventiler(i: number) {
    const l = lignes[i];
    maj(i, { ouvert: true, filles: [filleVide(l, "", false), filleVide(l, l.montant.toFixed(2), true)] });
  }

  const retirerFille = (i: number, cle: string) =>
    maj(i, { filles: equilibrer(lignes[i].montant, lignes[i].filles.filter((f) => f.cle !== cle)) });

  // --- Synthèse et filtres -------------------------------------------------

  /** Écritures qui entreront en comptabilité pour une ligne : ses filles, ou elle-même. */
  const ecrituresDe = (l: Ligne): { e: Ecriture; cle: string | null; montant: number; textes: string[][] }[] =>
    l.filles.length > 0
      ? l.filles.map((f) => ({ e: f, cle: f.cle, montant: Number(f.montant) || 0, textes: textesFille(l, f) }))
      : [{ e: l, cle: null, montant: l.montant, textes: textesMere(l) }];

  const aValider = (l: Ligne) =>
    !!l.alerte ||
    ecrituresDe(l).some(
      ({ e, textes, montant }) =>
        !!e.alerte || !!infoFamille(e, textes, l.date)?.ambigu || !!infoDon(e, textes, montant, l.date)?.doute,
    ) ||
    (l.filles.length > 0 && Math.abs(resteFilles(l)) > 0.005);

  const correspondAuFiltre = (l: Ligne) => {
    const ecr = ecrituresDe(l);
    switch (filtre) {
      case "a_classer":
        return ecr.some(({ e }) => !e.categorie_id);
      case "scolarite":
        return ecr.some(({ e }) => natureDe(e.categorie_id) !== null);
      case "dons":
        return ecr.some(({ e }) => catNom(e.categorie_id) === CAT_DON);
      case "a_valider":
        return aValider(l);
      default:
        return true;
    }
  };

  const retenues = lignes.filter((l) => l.inclus);
  const nbRec = retenues.filter((l) => l.type === "recette").length;
  const nbDep = retenues.filter((l) => l.type === "depense").length;
  const nbClasses = retenues.filter((l) => l.categorie_id || l.filles.length > 0).length;
  const compter = (pred: (l: Ligne) => boolean) => retenues.filter(pred).length;
  const nbFamilles = retenues.reduce(
    (s, l) => s + ecrituresDe(l).filter(({ e, textes }) => !!infoFamille(e, textes, l.date)?.effective).length,
    0,
  );
  const nbDonsDocumentes = retenues.reduce(
    (s, l) =>
      s +
      ecrituresDe(l).filter(({ e, textes, montant }) => {
        const d = infoDon(e, textes, montant, l.date);
        return !!d && (!!d.donLie || !!d.fiche);
      }).length,
    0,
  );
  const aDesDons = retenues.some((l) => ecrituresDe(l).some(({ e }) => catNom(e.categorie_id) === CAT_DON));
  /** Dons qui seraient créés si le coffre était ouvert. */
  const nbDonsEnAttenteCoffre = coffre.estOuvert
    ? 0
    : retenues.reduce(
        (s, l) =>
          s +
          ecrituresDe(l).filter(({ e }) => catNom(e.categorie_id) === CAT_DON && e.donateur !== null && !e.donLie).length,
        0,
      );

  // --- Contrôle du solde -----------------------------------------------------

  const compte = comptes.find((c) => c.id === compteId) ?? null;
  const controle = useMemo(() => {
    if (!solde || !compte) return null;
    const meres = new Set(existantes.map((o) => o.parent_id).filter(Boolean) as string[]);
    const avant = existantes
      .filter((o) => o.compte_id === compte.id && !o.est_ventilee && !meres.has(o.id) && o.date_operation <= solde.date)
      .reduce((s, o) => s + signe(o.type, Number(o.montant)), 0);
    const nouvelles = lignes
      .filter((l) => l.inclus && l.date <= solde.date)
      .reduce((s, l) => s + signe(l.type, l.montant), 0);
    const sansInitial = arrondi(avant + nouvelles);
    const preau = arrondi(compte.solde_initial + sansInitial);
    return { preau, sansInitial, ecart: arrondi(solde.montant - preau) };
  }, [solde, compte, existantes, lignes]);

  async function calerSoldeOuverture() {
    if (!controle || !solde || !compte) return;
    setCalage("encours");
    const nouveau = arrondi(solde.montant - controle.sansInitial);
    const { error } = await createClient().from("comptes").update({ solde_initial: nouveau }).eq("id", compte.id);
    setCalage("ferme");
    if (error) return setErreur("Calage impossible : " + error.message);
    router.refresh();
  }

  // --- Fiche donateur ------------------------------------------------------

  function ouvrirDonateur(i: number, cle: string | null, depart?: FormDonateur | null) {
    const l = lignes[i];
    setErreurDon(null);
    setFDon(depart ?? formDonateurDepuisNom(extraireNom(l.libelle_origine)));
    setCibleDon({ i, cle });
  }

  function validerDonateur(ev: React.FormEvent) {
    ev.preventDefault();
    if (!cibleDon) return;
    if (!ficheDonateurValide(fDon)) {
      setErreurDon(fDon.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }
    majEcriture(cibleDon.i, cibleDon.cle, { donateur: fDon, donLie: "" });
    setCibleDon(null);
  }

  // --- Import --------------------------------------------------------------

  async function importer(sansDons = false) {
    setErreur(null);
    if (!compteId) return setErreur("Choisissez un compte de destination.");
    if (retenues.length === 0) return setErreur("Aucune ligne sélectionnée.");
    // Les dons sont créés d'office et rapprochés de la base Donateurs : il faut
    // le coffre ouvert. On le demande avant d'importer.
    if (!sansDons && nbDonsEnAttenteCoffre > 0) {
      setDemandeCoffre(true);
      return;
    }
    setDemandeCoffre(false);

    // Contrôles des ventilations : filles complètes et somme égale à la ligne.
    const problemes: string[] = [];
    for (const l of retenues) {
      if (l.filles.length === 0) continue;
      const tag = `${formatDate(l.date)} « ${l.libelle} »`;
      if (l.filles.some((f) => !(Number(f.montant) > 0))) problemes.push(`${tag} : montant de sous-écriture invalide`);
      if (l.filles.some((f) => !f.categorie_id)) problemes.push(`${tag} : sous-écriture sans catégorie`);
      const reste = resteFilles(l);
      if (Math.abs(reste) > 0.005) {
        problemes.push(`${tag} : ${reste > 0 ? `${formatEuros(reste)} non ventilés` : `dépassement de ${formatEuros(-reste)}`}`);
      }
    }
    if (problemes.length > 0) {
      return setErreur(`Ventilation à corriger avant import — ${problemes.join(" ; ")}.`);
    }

    setImporting(true);
    const supabase = createClient();
    const importId = crypto.randomUUID();

    type OpInsert = Record<string, unknown> & { id: string };
    const meres: OpInsert[] = [];
    const filles: OpInsert[] = [];
    const affectationsNouvelles: Record<string, unknown>[] = [];
    const nouveauxDons: { pii: ReturnType<typeof piiDeFiche>; ligne: Record<string, unknown> }[] = [];
    const liens: { donId: string; operationId: string; exerciceId: string | null }[] = [];

    /**
     * Libellés d'une écriture « Don » : « Don » en clair, le reste chiffré.
     * Coffre fermé (import sans les dons), le brut reste provisoirement en clair
     * et sera chiffré depuis la Comptabilité (« Chiffrer les libellés des dons »).
     */
    const libellesPourDon = async (brut: string, libelle: string) =>
      coffre.estOuvert
        ? {
            libelle: LIBELLE_DON,
            libelle_origine: null,
            libelle_origine_chiffre: await chiffrerLibellesDon(coffre.chiffrer, { brut, libelle }),
          }
        : { libelle: LIBELLE_DON, libelle_origine: brut, libelle_origine_chiffre: null };

    /** Questions qui restent ouvertes sur une écriture → colonne « à vérifier » (ambre). */
    const questions = (e: Ecriture, fam: InfoFamille | null, don: InfoDon | null): string | null => {
      const q: string[] = [];
      if (e.alerte) q.push(e.alerte);
      if (fam?.ambigu) {
        q.push(`Famille à valider : ${fam.candidats.map((id) => inscParId.get(id)?.famille_nom ?? "?").join(" ou ")}.`);
      }
      if (don?.doute) q.push(don.doute);
      return q.length > 0 ? q.join(" ") : null;
    };

    /** Rattachements (famille, don) d'une écriture qui vient de recevoir son id. */
    const rattacher = (
      opId: string,
      fam: InfoFamille | null,
      don: InfoDon | null,
      montant: number,
      date: string,
      exerciceId: string | null,
      mode: string | null,
    ) => {
      if (fam?.effective) {
        affectationsNouvelles.push({
          operation_id: opId,
          inscription_id: fam.effective,
          montant,
          nature: fam.nature,
          notes: "Rattaché à l'import du relevé",
        });
      }
      if (!don) return;
      if (don.donLie) {
        liens.push({ donId: don.donLie, operationId: opId, exerciceId });
      } else if (don.fiche && coffre.estOuvert) {
        // Créé même incomplet : l'onglet Dons signale ce qui manque.
        nouveauxDons.push({
          pii: piiDeFiche(don.fiche),
          ligne: {
            exercice_id: exerciceId,
            origine: don.fiche.origine.trim() || null,
            categorie_donateur: don.fiche.categorie_donateur || null,
            est_personne_morale: don.fiche.est_personne_morale,
            montant,
            date_don: date,
            mode_paiement: modeDon(mode),
            recu_numero: null,
            recu_etat: null,
            observations: "Créé automatiquement à l'import du relevé bancaire",
            operation_id: opId,
            import_id: importId,
          },
        });
      }
    };

    let totalRec = 0, totalDep = 0;
    for (const l of retenues) {
      const id = crypto.randomUUID();
      const exerciceId = exerciceDe(l.date)?.id ?? null;
      const mode = devineMode(l.libelle_origine);
      const ventilee = l.filles.length > 0;
      if (l.type === "recette") totalRec += l.montant; else totalDep += l.montant;
      const famMere = ventilee ? null : infoFamille(l, textesMere(l), l.date);
      const donMere = ventilee ? null : infoDon(l, textesMere(l), l.montant, l.date);
      // Opération « Don » : libellé neutre, libellés d'origine chiffrés (aucun nom en clair).
      const libellesMere = !ventilee && catNom(l.categorie_id) === CAT_DON
        ? await libellesPourDon(l.libelle_origine, l.libelle)
        : { libelle: l.libelle, libelle_origine: l.libelle_origine, libelle_origine_chiffre: null };
      meres.push({
        id,
        date_operation: l.date,
        ...libellesMere,
        montant: l.montant,
        type: l.type,
        categorie_id: l.categorie_id || null,
        compte_id: compteId,
        exercice_id: exerciceId,
        mode_paiement: mode,
        est_ventilee: ventilee,
        a_verifier: ventilee ? l.alerte : questions(l, famMere, donMere),
        import_id: importId,
      });
      if (!ventilee) {
        rattacher(id, famMere, donMere, l.montant, l.date, exerciceId, mode);
        continue;
      }
      for (const f of l.filles) {
        const fid = crypto.randomUUID();
        const montant = Number(f.montant);
        const fam = infoFamille(f, textesFille(l, f), l.date);
        const don = infoDon(f, textesFille(l, f), montant, l.date);
        const libFille = f.libelle.trim() || `${l.libelle} — ${catNom(f.categorie_id) ?? ""}`;
        const libellesFille = catNom(f.categorie_id) === CAT_DON
          ? await libellesPourDon(l.libelle_origine, libFille)
          : { libelle: libFille, libelle_origine: l.libelle_origine, libelle_origine_chiffre: null };
        filles.push({
          id: fid,
          parent_id: id,
          date_operation: l.date,
          ...libellesFille,
          montant,
          type: l.type,
          categorie_id: f.categorie_id || null,
          compte_id: compteId,
          exercice_id: exerciceId,
          mode_paiement: mode,
          est_ventilee: false,
          a_verifier: questions(f, fam, don),
          import_id: importId,
        });
        rattacher(fid, fam, don, montant, l.date, exerciceId, mode);
      }
    }

    // Le lot d'abord (il porte le contrôle du solde), puis les lignes bancaires,
    // puis les sous-écritures et rattachements qui y renvoient.
    let err = (
      await supabase.from("imports_releve").insert({
        id: importId,
        fichier: nomFichier,
        compte_id: compteId,
        nb_operations: meres.length,
        total_recettes: arrondi(totalRec),
        total_depenses: arrondi(totalDep),
        solde_banque: solde?.montant ?? null,
        solde_date: solde?.date ?? null,
        solde_preau: controle?.preau ?? null,
      })
    ).error;
    if (!err) err = (await supabase.from("operations").insert(meres)).error;
    if (!err && filles.length > 0) err = (await supabase.from("operations").insert(filles)).error;
    if (err) {
      // Rien ne doit rester à moitié : on retire ce qui a pu passer.
      await supabase.from("operations").delete().eq("import_id", importId);
      await supabase.from("imports_releve").delete().eq("id", importId);
      setImporting(false);
      return setErreur("Import impossible : " + err.message);
    }
    const etapes = [
      `${meres.length} opération${meres.length > 1 ? "s" : ""} importée${meres.length > 1 ? "s" : ""}${filles.length ? ` (dont ${filles.length} sous-écriture${filles.length > 1 ? "s" : ""})` : ""}`,
    ];

    const avertissements: string[] = [];
    if (affectationsNouvelles.length > 0) {
      const { error } = await supabase.from("affectations_scolarite").insert(affectationsNouvelles);
      if (error) avertissements.push("rattachements aux familles non enregistrés : " + error.message);
      else etapes.push(`${affectationsNouvelles.length} rattachement${affectationsNouvelles.length > 1 ? "s" : ""} à l'onglet Frais de scolarité`);
    }
    if (nouveauxDons.length > 0) {
      const payload = [];
      for (const d of nouveauxDons) {
        payload.push({
          ...d.ligne,
          pii_chiffre: await coffre.chiffrer(JSON.stringify(d.pii)),
          donateur_titre: null,
          donateur_nom: null,
          donateur_prenom: null,
          raison_sociale: null,
          adresse: null,
          cp_ville: null,
          courriel: null,
        });
      }
      const { error } = await supabase.from("dons").insert(payload);
      if (error) avertissements.push("dons non créés : " + error.message);
      else etapes.push(`${payload.length} don${payload.length > 1 ? "s" : ""} ajouté${payload.length > 1 ? "s" : ""} à l'onglet Dons`);
    }
    for (const lien of liens) {
      const patch: { operation_id: string; exercice_id?: string } = { operation_id: lien.operationId };
      const don = dons.find((d) => d.id === lien.donId);
      if (lien.exerciceId && don && !don.exercice_id) patch.exercice_id = lien.exerciceId;
      const { error } = await supabase.from("dons").update(patch).eq("id", lien.donId);
      if (error) avertissements.push("liaison d'un don impossible : " + error.message);
    }
    if (liens.length > 0) etapes.push(`${liens.length} don${liens.length > 1 ? "s" : ""} existant${liens.length > 1 ? "s" : ""} relié${liens.length > 1 ? "s" : ""}`);

    setImporting(false);
    setFait(etapes.join(" · "));
    if (avertissements.length > 0) {
      setErreur(`Opérations importées, mais : ${avertissements.join(" ; ")}. À reprendre depuis la Comptabilité (ou annuler l'import).`);
    }
    setLignes([]);
    setNomFichier(null);
    setSolde(null);
    router.refresh();
  }

  // --- Rendu ---------------------------------------------------------------

  const selectCls =
    "rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent";

  const pastille = (texte: string, ton: "ok" | "doute" | "neutre", title?: string) => (
    <span
      title={title}
      className={`whitespace-nowrap rounded px-1 text-[10px] font-medium ${
        ton === "ok" ? "text-positive" : ton === "doute" ? "bg-gold-soft text-gold" : "text-muted"
      }`}
    >
      {texte}
    </span>
  );

  /** Colonne « Rattachement » : famille (scolarité) ou donateur (don). */
  function rattachement(i: number, l: Ligne, e: Ecriture, cle: string | null, montant: number, textes: string[][]) {
    const fam = infoFamille(e, textes, l.date);
    if (fam) {
      const candidats = fam.candidats.map((id) => inscParId.get(id)).filter(Boolean) as InscriptionImport[];
      const autres = fam.proposees.filter((p) => !fam.candidats.includes(p.id));
      return (
        <div className="flex flex-col gap-0.5">
          <select
            value={fam.effective}
            onChange={(ev) => majEcriture(i, cle, { famille: ev.target.value, alerte: null })}
            title={`${libelleNature(fam.nature)} — famille de l'onglet Frais de scolarité`}
            className={`w-44 ${selectCls} ${fam.ambigu ? "border-gold bg-gold-soft/60" : ""}`}
          >
            <option value="">{fam.ambigu ? "— à valider —" : "— famille —"}</option>
            {candidats.length > 0 && (
              <optgroup label={fam.ambigu ? "Homonymes reconnus" : "Reconnue"}>
                {candidats.map((c) => (
                  <option key={c.id} value={c.id}>{libelleFamille(c)}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Autres familles">
              {autres.map((c) => (
                <option key={c.id} value={c.id}>{libelleFamille(c)}</option>
              ))}
            </optgroup>
          </select>
          <span className="text-[10px] text-muted">
            {libelleNature(fam.nature)}
            {fam.ambigu && <span className="ml-1 font-medium text-gold">· homonymes, à valider</span>}
            {!fam.ambigu && e.famille === undefined && fam.effective && (
              <span className="ml-1">· {fam.memorise ? "mémorisée" : "reconnue"}</span>
            )}
          </span>
        </div>
      );
    }

    const don = infoDon(e, textes, montant, l.date);
    if (!don) return <span className="text-xs text-muted/50">—</span>;

    // Coffre verrouillé : le nom est lu mais ni le rapprochement ni la
    // création (chiffrée) ne sont possibles. On le demande sur place.
    if (don.verrou) {
      return (
        <div className="flex flex-col items-start gap-1 text-xs">
          <span className="text-muted">{don.nomDefaut || "nom non lu"}</span>
          <span className="text-gold" title="Le coffre doit être ouvert pour rapprocher ce don de la base Donateurs et le créer (chiffré)">
            🔒 rapprochement impossible
          </span>
          <DeverrouillerCoffre label="🔓 Déverrouiller" />
        </div>
      );
    }
    if (don.donLie) {
      const d = dons.find((x) => x.id === don.donLie);
      return (
        <span className="inline-flex flex-wrap items-center gap-1 text-xs">
          <span className="text-positive">↔</span>
          <span className="font-medium" title={d ? `Don déjà saisi le ${formatDate(d.date_don)} : il sera relié à cette opération` : undefined}>
            {d ? nomDonateur(d) : "don existant"}
          </span>
          {pastille(don.lienAuto ? "déjà saisi, relié" : "relié", "ok")}
          <button type="button" onClick={() => majEcriture(i, cle, { donLie: "" })} className="text-muted hover:text-negative" title="Ne pas relier">✕</button>
        </span>
      );
    }
    if (e.donateur === null) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          aucun don créé
          <button
            type="button"
            onClick={() => majEcriture(i, cle, { donateur: undefined })}
            className="rounded px-1 text-accent hover:bg-accent-soft"
            title="Créer le don dans l'onglet Dons"
          >
            ↺ créer
          </button>
        </span>
      );
    }

    const valeurNom = e.nomDonateur ?? don.nomDefaut;
    const statut =
      don.source === "reconnu"
        ? pastille("donateur connu", "ok", "Nom et prénom reconnus dans la base Donateurs")
        : don.source === "memoire"
          ? pastille("donateur connu · mémorisé", "ok", "Donateur déjà relié à ce payeur lors d'un précédent import")
          : don.source === "saisie"
            ? pastille("fiche saisie", "ok")
            : don.source === "doute"
              ? pastille("à valider", "doute", don.doute ?? undefined)
              : don.source === "nouveau"
                ? pastille(
                    valeurNom.trim() ? "nouveau donateur" : "nom à renseigner",
                    valeurNom.trim() ? "neutre" : "doute",
                    "Aucun donateur connu à ce nom : le don sera créé avec les informations du libellé ; l'onglet Dons signalera ce qui manque.",
                  )
                : null;

    return (
      <div className="flex flex-col items-start gap-0.5">
        {/* Nom demandé pour le rapprochement avec la base Donateurs. */}
        <input
          type="text"
          value={valeurNom}
          onChange={(ev) => majEcriture(i, cle, { nomDonateur: ev.target.value, donateur: undefined })}
          placeholder="Nom du donateur"
          title="Nom du donateur : sert à le retrouver dans la base Donateurs (prénom et nom de préférence)"
          className={`w-44 ${selectCls} ${valeurNom.trim() ? "" : "border-gold bg-gold-soft/60"}`}
        />
        <span className="inline-flex flex-wrap items-center gap-1 text-xs">
          {statut}
          {don.fiche && (
            <button
              type="button"
              onClick={() => ouvrirDonateur(i, cle, don.fiche)}
              className="text-accent hover:underline"
              title={`Fiche qui sera enregistrée : ${resumeDonateur(don.fiche) || "sans nom"}`}
            >
              fiche
            </button>
          )}
          {don.source === "doute" && don.fiche && don.candidats.length === 1 && (
            <button type="button" onClick={() => majEcriture(i, cle, { donateur: don.fiche })} className="rounded px-0.5 text-positive hover:bg-positive/10" title="Confirmer ce donateur">✓</button>
          )}
          {!don.fiche && (
            <button
              type="button"
              onClick={() => majEcriture(i, cle, { donLie: "", donateur: undefined })}
              className="text-accent hover:underline"
              title="Créer le don malgré le don voisin déjà saisi"
            >
              créer le don
            </button>
          )}
          <button type="button" onClick={() => majEcriture(i, cle, { donateur: null })} className="text-muted hover:text-negative" title="Ne pas créer de don pour cette écriture">✕</button>
        </span>
        {don.candidats.length > 1 && (
          <select
            value=""
            onChange={(ev) => {
              const c = don.candidats.find((x) => x.cle === ev.target.value);
              if (c) majEcriture(i, cle, { donateur: formDonateurDepuisDon(c.exemple) });
            }}
            className={`w-44 ${selectCls} border-gold bg-gold-soft/60`}
            title={don.doute ?? undefined}
          >
            <option value="">— donateur à valider —</option>
            {don.candidats.map((c) => (
              <option key={c.cle} value={c.cle}>{c.nom}</option>
            ))}
          </select>
        )}
        {don.proches.length > 0 && (
          <select
            value=""
            onChange={(ev) => ev.target.value && majEcriture(i, cle, { donLie: ev.target.value })}
            className="w-44 rounded border border-positive/40 bg-background px-1 py-0.5 text-[11px] text-positive outline-none"
            title="Un don de même montant, à ±3 jours, est déjà saisi : reliez-le plutôt que de le recréer"
          >
            <option value="">Déjà saisi ? relier…</option>
            {don.proches.map((d) => (
              <option key={d.id} value={d.id}>{nomDonateur(d)} — {formatDate(d.date_don)}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  const badgeAlerte = (message: string, onValider?: () => void) => (
    <span className="inline-flex items-center gap-1 rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold" title={message}>
      à valider
      {onValider && (
        <button
          type="button"
          onClick={onValider}
          className="rounded px-0.5 text-positive hover:bg-positive/10"
          title="Lever l'alerte : j'ai vérifié"
        >
          ✓
        </button>
      )}
    </span>
  );

  const FILTRES: { v: Filtre; l: string; n: number }[] = [
    { v: "toutes", l: "Toutes", n: lignes.length },
    { v: "a_classer", l: "À classer", n: compter((l) => ecrituresDe(l).some(({ e }) => !e.categorie_id)) },
    { v: "scolarite", l: "Scolarité", n: compter((l) => ecrituresDe(l).some(({ e }) => natureDe(e.categorie_id) !== null)) },
    { v: "dons", l: "Dons", n: compter((l) => ecrituresDe(l).some(({ e }) => catNom(e.categorie_id) === CAT_DON)) },
    { v: "a_valider", l: "À valider", n: compter(aValider) },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Déposer un relevé bancaire</h2>
            <p className="mt-1 text-xs text-muted">
              Export <strong>Excel</strong> du Crédit Mutuel (Situation de votre compte, .xlsx).
              Les opérations sont extraites puis validées une par une avant d&apos;entrer en comptabilité.
              Les écritures de scolarité sont rattachées aux familles, les dons à leur donateur ; le solde est contrôlé.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            Choisir le relevé (.xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
          </label>
        </div>
        {nomFichier && <p className="mt-3 text-xs text-muted">Fichier : {nomFichier}</p>}
        {fait !== null && (
          <p className="mt-3 rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">
            {fait} ✓{" "}
            <Link href="/comptabilite" className="underline">Voir la comptabilité</Link>
            {" · "}
            <Link href="/scolarite" className="underline">Frais de scolarité</Link>
            {" · "}
            <Link href="/dons" className="underline">Dons</Link>
          </p>
        )}
        {erreur && (
          <p className="mt-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>
        )}
      </div>

      {lignes.length === 0 && <ImportsPasses imports={imports} comptes={comptes} />}

      {lignes.length > 0 && (
        <>
          {aDesDons && coffre.estConfigure && !coffre.estOuvert && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
              <span>🔒 Déverrouillez le coffre : les donateurs seront alors reconnus dans les libellés et les fiches créées (chiffrées). Sans cela, les dons restent à compléter depuis l&apos;onglet Dons.</span>
              <DeverrouillerCoffre />
            </div>
          )}

          {controle && solde && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                Math.abs(controle.ecart) < 0.01 ? "border-positive/40 bg-positive/5" : "border-gold/50 bg-gold-soft/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="font-semibold">Contrôle du solde au {formatDate(solde.date)}</span>
                <span>Banque : <strong className="tabular-nums">{formatEuros(solde.montant)}</strong></span>
                <span>Préau après import : <strong className="tabular-nums">{formatEuros(controle.preau)}</strong></span>
                {Math.abs(controle.ecart) < 0.01 ? (
                  <span className="font-medium text-positive">Solde conforme ✓</span>
                ) : (
                  <span className="font-medium text-gold">Écart : {formatEuros(controle.ecart)}</span>
                )}
              </div>
              {Math.abs(controle.ecart) >= 0.01 && (
                <p className="mt-1 text-xs text-muted">
                  {compte && compte.solde_initial === 0
                    ? "Le solde d'ouverture du compte n'est pas renseigné : l'écart comprend tout ce qui précède les données de Préau. "
                    : ""}
                  Un écart persistant signale une opération manquante, en trop ou mal datée (lignes décochées, doublons, saisies manuelles).
                </p>
              )}
              {Math.abs(controle.ecart) >= 0.01 && compte && compte.solde_initial === 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {calage === "ferme" ? (
                    <button
                      type="button"
                      onClick={() => setCalage("confirmer")}
                      className="rounded-lg border border-border bg-surface px-2 py-1 font-medium hover:bg-surface-2"
                    >
                      Caler le solde d&apos;ouverture sur ce relevé
                    </button>
                  ) : (
                    <>
                      <span>
                        Solde d&apos;ouverture de « {compte.nom} » fixé à{" "}
                        <strong>{formatEuros(arrondi(solde.montant - controle.sansInitial))}</strong> : les écarts futurs
                        seront mesurés par rapport à ce relevé. Confirmer ?
                      </span>
                      <button
                        type="button"
                        onClick={calerSoldeOuverture}
                        disabled={calage === "encours"}
                        className="rounded-lg bg-accent px-2 py-1 font-medium text-accent-fg disabled:opacity-50"
                      >
                        Confirmer
                      </button>
                      <button type="button" onClick={() => setCalage("ferme")} className="rounded-lg border border-border px-2 py-1">
                        Annuler
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted">
                <strong className="text-foreground">{retenues.length}</strong> nouvelles
                {" · "}<span className="text-positive">{nbRec} recettes</span>
                {" · "}<span className="text-negative">{nbDep} dépenses</span>
                {" · "}<span>{nbClasses} classée(s)</span>
                {nbFamilles > 0 && <> · <span>{nbFamilles} rattachée(s) à une famille</span></>}
                {nbDonsDocumentes > 0 && <> · <span>{nbDonsDocumentes} don(s) documenté(s)</span></>}
                {ignores > 0 && <> · <span className="text-gold">{ignores} déjà en compta (décochée·s)</span></>}
                {suspects > 0 && <> · <span className="text-gold">{suspects} doublon·s possible·s (surlignés)</span></>}
              </span>
              <label className="flex items-center gap-2">
                <span className="text-muted">Compte :</span>
                <select
                  value={compteId}
                  onChange={(e) => setCompteId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTRES.map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => setFiltre(f.v)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  filtre === f.v
                    ? f.v === "a_valider"
                      ? "border-gold bg-gold-soft font-medium text-gold"
                      : "border-accent bg-accent-soft font-medium text-accent"
                    : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {f.l} ({f.n})
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="w-6 py-3 pl-2" />
                  <th className="px-2 py-3 font-medium">✓</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Libellé</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Catégorie</th>
                  <th className="px-3 py-3 font-medium">Rattachement</th>
                  <th className="px-3 py-3 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => {
                  if (!correspondAuFiltre(l)) return null;
                  const ventilee = l.filles.length > 0;
                  const reste = resteFilles(l);
                  const catsDuSens = categories.filter((c) => c.type === l.type);
                  const ambre = l.inclus && aValider(l);
                  return (
                    <Fragment key={l.key}>
                      <tr
                        className={`border-b border-border ${l.inclus ? "" : "opacity-45"} ${
                          l.suspect ? "bg-gold-soft" : ambre ? "bg-gold-soft/50" : ""
                        }`}
                      >
                        <td className="py-2 pl-2 align-middle">
                          <button
                            type="button"
                            onClick={() => (ventilee || l.ouvert ? maj(i, { ouvert: !l.ouvert }) : ventiler(i))}
                            title={
                              ventilee
                                ? l.ouvert ? "Replier les sous-écritures" : "Voir les sous-écritures"
                                : "Ventiler cette ligne en plusieurs sous-écritures"
                            }
                            className={`flex h-6 w-6 items-center justify-center rounded border text-base leading-none hover:bg-surface-2 hover:text-accent ${
                              ventilee ? "border-accent/40 text-accent" : "border-border text-muted"
                            }`}
                          >
                            <span className={`transition-transform ${l.ouvert ? "rotate-90" : ""}`}>›</span>
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={l.inclus}
                            onChange={(e) => maj(i, { inclus: e.target.checked })}
                            className="h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDate(l.date)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              type="text"
                              value={l.libelle}
                              onChange={(e) => maj(i, { libelle: e.target.value })}
                              title={`Libellé bancaire d'origine : ${l.libelle_origine}`}
                              className="w-60 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                            />
                            {l.doublon && (
                              <span className="whitespace-nowrap rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                                déjà en compta
                              </span>
                            )}
                            {l.suspect && (
                              <span className="whitespace-nowrap rounded border border-gold px-1.5 py-0.5 text-[10px] font-medium text-gold">
                                doublon possible ±5 j
                              </span>
                            )}
                            {l.regle_niveau && !l.alerte && (
                              <span
                                title={l.regle_message ?? "Règle de correspondance : à vérifier"}
                                className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  l.regle_niveau === "rouge" ? "bg-negative/10 text-negative" : "border border-gold/60 text-gold"
                                }`}
                              >
                                à vérifier
                              </span>
                            )}
                            {l.alerte && badgeAlerte(l.alerte, () => maj(i, { alerte: null }))}
                          </div>
                          {l.libelle !== l.libelle_origine && (
                            <div className="mt-0.5 line-clamp-1 text-[10px] text-muted" title={l.libelle_origine}>
                              banque : {l.libelle_origine}
                            </div>
                          )}
                          {l.alerte && <div className="mt-0.5 text-[10px] text-gold">{l.alerte}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={l.type}
                            onChange={(e) =>
                              maj(i, {
                                type: e.target.value as "recette" | "depense",
                                categorie_id: "",
                                candidats: undefined,
                                famille: undefined,
                                donateur: undefined,
                                donLie: undefined,
                                alerte: null,
                                filles: l.filles.map((f) => ({ ...f, categorie_id: "", candidats: undefined, famille: undefined })),
                              })
                            }
                            className={selectCls}
                          >
                            <option value="recette">Recette</option>
                            <option value="depense">Dépense</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {ventilee ? (
                            <span className="text-xs text-muted">ventilée en {l.filles.length}</span>
                          ) : (
                            <select
                              value={l.categorie_id}
                              onChange={(e) =>
                                maj(i, { categorie_id: e.target.value, candidats: undefined, famille: undefined, alerte: null })
                              }
                              className={`w-48 ${selectCls}`}
                            >
                              <option value="">— à classer —</option>
                              {catsDuSens.map((c) => (
                                <option key={c.id} value={c.id}>{c.nom}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {ventilee ? (
                            <span className="text-xs text-muted/50">voir détail</span>
                          ) : (
                            rattachement(i, l, l, null, l.montant, textesMere(l))
                          )}
                        </td>
                        <td
                          className={`px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium ${
                            l.type === "recette" ? "text-positive" : "text-negative"
                          }`}
                        >
                          {l.type === "recette" ? "+" : "−"}
                          {formatEuros(l.montant)}
                        </td>
                      </tr>

                      {l.ouvert && (
                        <>
                          {l.filles.map((f) => (
                            <tr key={f.cle} className="border-b border-border/50 bg-surface-2/30">
                              <td />
                              <td />
                              <td className="px-3 py-1.5 text-right text-muted/60">↳</td>
                              <td className="px-3 py-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  <input
                                    type="text"
                                    value={f.libelle}
                                    onChange={(e) =>
                                      majFille(i, f.cle, { libelle: e.target.value, candidats: undefined, donateur: undefined })
                                    }
                                    placeholder={l.remise ? "Chèque — tireur et objet" : "Libellé — ex. « Frais de dossier — Beth »"}
                                    title="Un nom de famille ou de donateur dans le libellé suffit à le rattacher"
                                    className="w-60 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                                  />
                                  {f.alerte && badgeAlerte(f.alerte, () => majFille(i, f.cle, { alerte: null }))}
                                </div>
                              </td>
                              <td />
                              <td className="px-3 py-1.5">
                                <select
                                  value={f.categorie_id}
                                  onChange={(e) =>
                                    majFille(i, f.cle, { categorie_id: e.target.value, candidats: undefined, famille: undefined, alerte: null })
                                  }
                                  className={`w-48 ${selectCls} ${f.categorie_id ? "" : "border-gold"}`}
                                >
                                  <option value="">— catégorie —</option>
                                  {catsDuSens.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nom}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                {rattachement(i, l, f, f.cle, Number(f.montant) || 0, textesFille(l, f))}
                              </td>
                              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={f.montant}
                                  onChange={(e) => majFille(i, f.cle, { montant: e.target.value })}
                                  className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  onClick={() => retirerFille(i, f.cle)}
                                  className="ml-2 text-xs text-muted hover:text-negative"
                                  title="Retirer cette sous-écriture"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="border-b border-border bg-surface-2/30">
                            <td />
                            <td />
                            <td />
                            <td colSpan={5} className="px-3 py-1.5">
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <button
                                  type="button"
                                  onClick={() => ajouterFille(i)}
                                  className="rounded-lg border border-border px-2 py-1 font-medium hover:bg-surface-2"
                                >
                                  {l.remise ? "+ Chèque" : "+ Sous-écriture"}
                                </button>
                                {ventilee && Math.abs(reste) > 0.005 ? (
                                  <span className="rounded-lg bg-gold-soft px-2 py-1 font-medium text-gold">
                                    ⚠ {reste > 0 ? `${formatEuros(reste)} non ventilés` : `dépassement de ${formatEuros(-reste)}`}
                                  </span>
                                ) : ventilee ? (
                                  <span className="text-positive">Répartition équilibrée ✓</span>
                                ) : l.remise ? (
                                  <span className="text-muted">
                                    Une sous-écriture par chèque : le tireur dans le libellé, l&apos;objet par la catégorie. Sans détail,
                                    la remise est importée telle quelle et reste « à vérifier ».
                                  </span>
                                ) : (
                                  <span className="text-muted">
                                    La ligne bancaire reste unique ; seules ses sous-écritures entrent dans les totaux.
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        </>
                      )}

                      {l.suspect && l.existant && (
                        <tr className="border-b border-border last:border-0">
                          <td className="px-3 pb-2 pt-0" colSpan={8}>
                            <div className="ml-12 rounded-md border border-dashed border-gold/70 bg-gold-soft/40 px-3 py-2">
                              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gold">
                                Déjà en comptabilité · même montant à ±5 j — à vérifier
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                <span className="tabular-nums text-muted">{formatDate(l.existant.date)}</span>
                                <span className="min-w-[8rem] flex-1">{l.existant.libelle}</span>
                                <span className="capitalize text-muted">{l.existant.type}</span>
                                <span className="text-muted">{l.existant.categorie ?? "— non classé —"}</span>
                                <span className={`tabular-nums font-medium ${l.existant.type === "recette" ? "text-positive" : "text-negative"}`}>
                                  {l.existant.type === "recette" ? "+" : "−"}
                                  {formatEuros(l.existant.montant)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Les alertes « à valider » non levées sont reportées dans la colonne « À vérifier » de la Comptabilité (lignes en ambre).
            Un import peut être annulé en entier depuis « Derniers imports ».
          </p>
          <div className="h-20" aria-hidden />

          {demandeCoffre && !coffre.estOuvert && (
            <div className="fixed bottom-24 right-6 z-40 max-w-md rounded-xl border border-gold/50 bg-surface p-4 text-sm shadow-lg shadow-black/20">
              <p className="font-semibold text-gold">🔒 Coffre à déverrouiller</p>
              <p className="mt-1 text-xs text-muted">
                {nbDonsEnAttenteCoffre} don(s) seront créés dans l&apos;onglet Dons. Déverrouillez le coffre pour les
                rapprocher de la base Donateurs et les enregistrer (chiffrés), puis relancez l&apos;import.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
                <button
                  type="button"
                  onClick={() => importer(true)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
                  title="Les opérations entrent en comptabilité ; les dons resteront à ajouter depuis l'onglet Dons"
                >
                  Importer sans créer les dons
                </button>
                <button type="button" onClick={() => setDemandeCoffre(false)} className="text-xs text-muted hover:underline">
                  Fermer
                </button>
              </div>
            </div>
          )}

          {/* Bouton d'import volant : reste accessible en faisant défiler la liste. */}
          <button
            type="button"
            onClick={() => importer()}
            disabled={importing || retenues.length === 0}
            className="fixed bottom-6 right-6 z-40 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-fg shadow-lg shadow-black/20 hover:opacity-90 disabled:opacity-50"
          >
            {importing ? "Import…" : `Importer ${retenues.length} opération(s)`}
          </button>
        </>
      )}

      {cibleDon && (
        <Modal title="Fiche du donateur" onClose={() => setCibleDon(null)}>
          <form onSubmit={validerDonateur} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {(() => {
              const l = lignes[cibleDon.i];
              const f = cibleDon.cle ? l.filles.find((x) => x.cle === cibleDon.cle) : null;
              return (
                <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-muted">Opération : </span>
                  <strong>{formatEuros(f ? Number(f.montant) || 0 : l.montant)}</strong> le {formatDate(l.date)} —{" "}
                  <span className="text-xs text-muted">{l.libelle_origine}</span>
                </div>
              );
            })()}
            <ChoixDonateur
              dons={dons}
              valeurCourante={fDon}
              onChoisir={(id: IdentiteSaisie) => setFDon((p) => ({ ...p, ...id }))}
              chiffrer={coffre.chiffrer}
              coffreOuvert={coffre.estOuvert}
            />
            <ChampsDonateur
              f={fDon}
              set={(k, v) => setFDon((p) => ({ ...p, [k]: v }))}
              relations={relations}
              idListe="relations-import-releve"
            />
            <p className="text-xs text-muted">
              Le don sera créé dans l&apos;onglet Dons au moment de l&apos;import, relié à cette opération (montant, date et
              mode repris du relevé).
            </p>
            <FormFooter saving={false} error={erreurDon} onCancel={() => setCibleDon(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
