"use client";

import {
  CATEGORIES_DONATEUR,
  estCategoriePersonneMorale,
  incoherenceCategorie,
  normaliserCategorieDonateur,
} from "@/lib/categoriesDonateur";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { genererRecuPdf } from "@/lib/recu";
import { ETAT_PASSE_SECRETAIRE, PREFERENCES_ENVOI, etatEnvoye, prefereEnBase } from "@/lib/envoiRecu";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import ChoixDonateur, { type IdentiteSaisie } from "@/components/ChoixDonateur";
import { useCoffre } from "@/components/CoffreProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import ChampsParticulier from "@/components/ChampsParticulier";
import ChampCourriel from "@/components/ChampCourriel";
import LierDonAEcriture from "@/components/LierDonAEcriture";
import FenetreDonEcriture from "@/components/FenetreDonEcriture";
import EtapePostaleListe, { BandeauEtapePostale } from "@/components/EtapePostale";
import LiaisonGlobale from "@/components/LiaisonGlobale";
import Link from "next/link";
import MedailleDon from "@/components/MedailleDon";
import EtablirRecu from "@/components/EtablirRecu";
import ContactDonateurRecherche from "@/components/ContactDonateurRecherche";
import { BoutonDemandeRecu, PastilleDemandeRecu, AlerteInfosDonateur, type DemandeRecu, type AlerteDonateur } from "@/components/DemandeRecu";
import type { Groupe } from "@/components/ListeRecus";
import PageHeader from "@/components/PageHeader";
import ModeleRecuDialog from "@/components/ModeleRecuDialog";
import type { ModeleRecuRow } from "@/lib/modeleRecu";
import type { DonCompta } from "@/components/PastilleDon";
import { estCouple } from "@/lib/couple";
import BoutonFiltresMultiples, { CasePastille } from "@/components/BoutonFiltresMultiples";
import { useFiltresMultiples } from "@/lib/filtresMultiples";
import { useDonsDechiffres, piiDepuis, VERROU } from "@/lib/donsChiffre";
import { nomSoigne } from "@/lib/nomPropre";
import {
  statutsDon,
  donateursRecurrents,
  cleDonateur,
  nomDonateur,
  TONE_CLASSES,
  FILTRES,
  type Chip,
  type StatutKey,
} from "@/lib/statutDon";

export type Don = {
  id: string;
  exercice_id: string | null;
  origine: string | null;
  categorie_donateur: string | null;
  est_personne_morale: boolean;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  /** Téléphone du donateur (en clair, modifiable par la Recherche de fonds). */
  telephone?: string | null;
  /** « À transmettre à » : à qui remettre le reçu fiscal (chiffré avec la fiche). */
  a_transmettre?: string | null;
  /** Le donateur est un « Donateur Bourse » (dons faits pour payer des bourses de scolarité). */
  donateur_bourse?: boolean;
  /** Ce don est un « Don boursier » (et non un don pour financer l'école). */
  don_boursier?: boolean;
  /** Famille de l'école : « actuelle » ou « ancienne ». */
  famille_statut?: "actuelle" | "ancienne" | null;
  /** Le donateur ne souhaite pas être sollicité (copie portée par chacun de ses dons). */
  ne_pas_solliciter?: boolean;
  contact_reserve_a?: string | null;
  reserve_pour?: string | null;
  /** La médaille est posée sur le tableau physique des dons de l'école (qui, quand). */
  medaille_affichee?: boolean;
  medaille_par?: string | null;
  medaille_le?: string | null;
  /** Reçu « À passer » : à qui le remettre (null = Secrétaire). */
  passer_a?: string | null;
  pii_chiffre: string | null;
  montant: number;
  date_don: string;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  recu_emis_le: string | null;
  /** Préférence d'envoi des reçus (fiche donateur) : « courrier » (postal) ou, par défaut, courriel. */
  envoi_prefere?: string | null;
  observations: string | null;
  /** Opération comptable reliée : elle fait foi pour le montant et la date d'encaissement. */
  operation_id?: string | null;
  operation?: { date_operation: string } | null;
  supprime_le: string | null;
  supprime_par: string | null;
};

const CATEGORIES = CATEGORIES_DONATEUR;
const MODES = ["Virement", "Chèque", "Carte bancaire", "Espèces", "Nature", "Autre"];

/** À qui passer un reçu postal : choix de base, sinon un nom libre (« Autre »). */
const PASSER_A = ["Secrétaire", "Président", "Chanoine"];
const passerA = (d: Pick<Don, "passer_a">) => d.passer_a?.trim() || "Secrétaire";

/** Trésorier : choix de la personne à qui passer le reçu (porté par tous les dons du reçu). */
function ChoixPasserA({ valeur, idsDons }: { valeur: string; idsDons: string[] }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  async function definir(v: string) {
    let cible: string | null = v;
    if (v === "__autre") {
      const saisie = window.prompt("À passer à :", PASSER_A.includes(valeur) ? "" : valeur)?.trim();
      if (!saisie) return;
      cible = saisie;
    }
    const { error } = await createClient().from("dons").update({ passer_a: cible === "Secrétaire" ? null : cible }).in("id", idsDons);
    if (error) return setErreur(error.message);
    router.refresh();
  }
  return (
    <select
      value={PASSER_A.includes(valeur) ? valeur : "__valeur"}
      onChange={(e) => void definir(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title={erreur ?? "À qui passer ce reçu"}
      aria-label="À qui passer ce reçu"
      className={`rounded-md border bg-background px-1 py-0.5 text-xs ${erreur ? "border-negative" : "border-border"}`}
    >
      {PASSER_A.map((x) => <option key={x} value={x}>à {x}</option>)}
      {!PASSER_A.includes(valeur) && <option value="__valeur">à {valeur}</option>}
      <option value="__autre">Autre…</option>
    </select>
  );
}

// Colonnes affichables du tableau (le n° de reçu est masqué par défaut).
type ColKey = "date" | "donateur" | "categorie" | "montant" | "mode" | "recu" | "compta" | "statut" | "medaille";
const COLONNES: { key: ColKey; label: string; sortable: boolean; defaut: boolean }[] = [
  { key: "date", label: "Date", sortable: true, defaut: true },
  { key: "donateur", label: "Donateur", sortable: true, defaut: true },
  { key: "categorie", label: "Catégorie", sortable: true, defaut: false },
  { key: "montant", label: "Montant", sortable: true, defaut: true },
  { key: "mode", label: "Mode", sortable: true, defaut: false },
  { key: "recu", label: "N° reçu", sortable: false, defaut: false },
  { key: "compta", label: "Lié Compta", sortable: false, defaut: true },
  { key: "statut", label: "Reçu Fiscal", sortable: false, defaut: true },
  { key: "medaille", label: "Médaille", sortable: false, defaut: true },
];
const COLS_DEFAUT = Object.fromEntries(COLONNES.map((c) => [c.key, c.defaut])) as Record<ColKey, boolean>;

// Année SCOLAIRE (1er sept → 31 août) d'une date ISO → « 2025-2026 ».
const anneeScolaireISO = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};
const anneeScolaireCourante = () => anneeScolaireISO(new Date().toISOString().slice(0, 10));

// Filtre de période : « toutes », un exercice (« exo:2026-2027 ») ou une année
// civile (« civ:2026 » — celle des reçus fiscaux).
type FiltreAnnee = "toutes" | `exo:${string}` | `civ:${string}`;
const periodeDuDon = (d: Don, f: FiltreAnnee): boolean => {
  if (f === "toutes") return true;
  if (!d.date_don) return false;
  return f.startsWith("civ:") ? d.date_don.slice(0, 4) === f.slice(4) : anneeScolaireISO(d.date_don) === f.slice(4);
};
const FILTRE_ANNEE_DEFAUT: FiltreAnnee = `exo:${anneeScolaireCourante()}`;

// Filtres de statut toujours affichés ; les autres apparaissent avec « + de filtres » (ou dès qu'ils sont actifs).
const FILTRES_VISIBLES: StatutKey[] = ["important", "mineur", "etablir", "annuel", "envoyer", "nonlie"];

type FormState = {
  origine: string;
  categorie_donateur: string;
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  a_transmettre: string;
  envoi_prefere: string;
  montant: string;
  date_don: string;
  mode_paiement: string;
  recu_numero: string;
  recu_etat: string;
  observations: string;
};

function vide(): FormState {
  return {
    origine: "",
    categorie_donateur: "Particulier",
    est_personne_morale: false,
    donateur_titre: "Monsieur",
    donateur_nom: "",
    donateur_prenom: "",
    raison_sociale: "",
    adresse: "",
    cp_ville: "",
    courriel: "",
    a_transmettre: "",
    envoi_prefere: "courriel",
    montant: "",
    date_don: todayISO(),
    mode_paiement: "Virement",
    recu_numero: "",
    recu_etat: "",
    observations: "",
  };
}

export default function GestionDons({
  dons: donsInit,
  roleSlug = null,
  relations = [],
  ouvrirId = null,
  signalerManques = false,
  onFermer,
  modeleRecu,
  sousEntete,
  modeRecherche = false,
  avecMedaille = false,
  modeMedailles = false,
  numeros,
  prenomRecherche = null,
  demandes = [],
  alertes = [],
}: {
  /** Onglet Dons de la Recherche de fonds : lecture seule, sans médaille ; fiche contact et demande de reçu. */
  modeRecherche?: boolean;
  /** Avec `modeRecherche` (Directeur spirituel) : la colonne Médaille reste affichée et se coche. */
  avecMedaille?: boolean;
  /** Onglet « Médailles Don » de la Directrice : lecture seule, seule la colonne Médaille se coche. */
  modeMedailles?: boolean;
  /** Numéro de chaque don dans l'exercice (Médailles Don), affiché juste avant la colonne Médaille. */
  numeros?: Record<string, number>;
  prenomRecherche?: string | null;
  /** Demandes de reçu fiscal en cours (Recherche de fonds → Trésorier). */
  demandes?: DemandeRecu[];
  /** Alertes « infos donateur modifiées » non vues (Trésorier). */
  alertes?: AlerteDonateur[];
  /** Page Dons : bloc affiché sous le titre (jauge des dons). */
  sousEntete?: React.ReactNode;
  dons: Don[];
  roleSlug?: string | null;
  /** Page Dons : fournit le modèle de reçu (même null) et affiche l'en-tête avec le menu « Options ». */
  modeleRecu?: ModeleRecuRow | null;
  /** Relations déjà employées, proposées en suggestion pour éviter les doublons. */
  relations?: string[];
  /**
   * Mode « fenêtre seule » (ex. depuis Reçus fiscaux) : seule la fiche de ce don
   * est affichée, sans le tableau ; `onFermer` est appelé à la fermeture ou après
   * l'enregistrement.
   */
  ouvrirId?: string | null;
  /** En mode fenêtre seule : surligner les informations manquantes. */
  signalerManques?: boolean;
  onFermer?: () => void;
}) {
  const router = useRouter();
  const seule = ouvrirId !== null;
  const coffre = useCoffre();
  // Dons hydratés : PII déchiffré si le coffre est ouvert, 🔒 sinon.
  const { dons: donsHydrates, verrou } = useDonsDechiffres(donsInit);
  // Actifs vs corbeille (suppression réversible via `supprime_le`).
  const dons = useMemo(() => donsHydrates.filter((d) => !d.supprime_le), [donsHydrates]);
  const donsSupprimes = useMemo(() => donsHydrates.filter((d) => d.supprime_le), [donsHydrates]);
  const nonChiffres = useMemo(() => donsInit.filter((d) => !d.pii_chiffre && !d.supprime_le), [donsInit]);
  const [vueCorbeille, setVueCorbeille] = useState(false);
  const [toast, setToast] = useState<{ id: string; nom: string } | null>(null);
  const [edit, setEdit] = useState<Don | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [migration, setMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genErreur, setGenErreur] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(vide());
  const { actifs: filtres, multiple: filtreMultiple, basculer: basculerFiltre, basculerMultiple: basculerFiltreMultiple, estActif: filtreActif, reinitialiser: reinitialiserFiltres } = useFiltresMultiples<StatutKey>();
  const [signaler, setSignaler] = useState(false);
  const [recherche, setRecherche] = useState("");
  // Médailles Don : toute la liste, sans filtre.
  const [anneeFiltre, setAnneeFiltre] = useState<FiltreAnnee>(modeMedailles ? "toutes" : FILTRE_ANNEE_DEFAUT);
  // Catégories décochées dans le menu « Catégorie » (aucune = toutes affichées) ; « à corriger » = filtre à part.
  const [catsMasquees, setCatsMasquees] = useState<string[]>([]);
  const [soloIncoherents, setSoloIncoherents] = useState(false);
  const [menuCats, setMenuCats] = useState(false);
  const [compact, setCompact] = useState(true);
  const [cols, setCols] = useState<Record<ColKey, boolean>>(COLS_DEFAUT);
  const [tri, setTri] = useState<{ key: ColKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [menuCols, setMenuCols] = useState(false);
  const [menuOptions, setMenuOptions] = useState(false);
  const [plusFiltres, setPlusFiltres] = useState(false);
  const [modeleOuvert, setModeleOuvert] = useState(false);
  const [demandeLiaison, setDemandeLiaison] = useState(0);

  // Préférences d'affichage (colonnes, tri, densité) restaurées au montage.
  // setState au montage depuis localStorage : cas légitime, non SSR-able autrement.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (modeMedailles) return; // colonnes et tri fixes (date, la plus récente d'abord)
    try {
      const c = localStorage.getItem("dons.cols");
      if (c) setCols({ ...COLS_DEFAUT, ...JSON.parse(c) });
      const t = localStorage.getItem("dons.tri");
      if (t) setTri(JSON.parse(t));
      const k = localStorage.getItem("dons.compact");
      if (k != null) setCompact(k === "1");
    } catch {}
  }, [modeMedailles]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { try { localStorage.setItem("dons.cols", JSON.stringify(cols)); } catch {} }, [cols]);
  useEffect(() => { try { localStorage.setItem("dons.tri", JSON.stringify(tri)); } catch {} }, [tri]);
  useEffect(() => { try { localStorage.setItem("dons.compact", compact ? "1" : "0"); } catch {} }, [compact]);
  // Le toast « Annuler » s'efface seul au bout de quelques secondes.
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(h);
  }, [toast]);

  const recurrents = useMemo(() => donateursRecurrents(dons), [dons]);
  const demandeParDon = useMemo(() => new Map(demandes.map((x) => [x.don_id, x])), [demandes]);
  const alertesParDon = useMemo(() => {
    const m = new Map<string, AlerteDonateur[]>();
    for (const a of alertes) (m.get(a.don_id) ?? m.set(a.don_id, []).get(a.don_id)!).push(a);
    return m;
  }, [alertes]);
  const estTresorier = roleSlug === "tresorier";
  const lecture = modeRecherche || modeMedailles;
  const [etablirGroupe, setEtablirGroupe] = useState<Groupe | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const numeroEtabli = (n: string | null) => !!n && /^RE_\d+/.test(n);
  /** Ouvre la fenêtre « Établir le reçu » avec les dons sans reçu du même donateur et de la même année. */
  function ouvrirEtablir(d: Don) {
    if (numeroEtabli(d.recu_numero)) {
      setGenErreur(`Ce don porte déjà le reçu ${d.recu_numero} : voir la page Reçus fiscaux.`);
      return;
    }
    if (d.pii_chiffre && verrou) {
      setGenErreur("Déverrouillez le coffre pour établir un reçu.");
      return;
    }
    const annee = d.date_don.slice(0, 4);
    const cle = cleDonateur(d);
    const groupe = dons
      .filter((x) => x.date_don.slice(0, 4) === annee && !numeroEtabli(x.recu_numero) && !x.don_boursier &&
        !statutsDon(x, recurrents).some((c) => c.key === "sans") && (x.id === d.id || (cle && cle !== "|" && cleDonateur(x) === cle)))
      .sort((a, b) => a.date_don.localeCompare(b.date_don));
    setEtablirGroupe({
      cle: `a|${cle}|${annee}`, numero: null, annee: Number(annee), total: groupe.reduce((s, x) => s + Number(x.montant), 0),
      dons: groupe, representant: groupe[groupe.length - 1] ?? d, aScinder: false, sans: false, reserve: false,
    });
  }
  const chipsParDon = useMemo(() => {
    const map = new Map<string, Chip[]>();
    for (const d of dons) {
      const chips = statutsDon(d, recurrents);
      if (!d.operation_id) chips.push({ key: "nonlie", label: "Non lié", tone: "amber" });
      map.set(d.id, chips);
    }
    return map;
  }, [dons, recurrents]);
  const compteParStatut = useMemo(() => {
    const c = new Map<StatutKey, number>();
    for (const chips of chipsParDon.values())
      for (const ch of chips) c.set(ch.key, (c.get(ch.key) ?? 0) + 1);
    return c;
  }, [chipsParDon]);
  // Toutes les années civiles et tous les exercices, du premier don à aujourd'hui (même ceux sans don), du plus récent au plus ancien.
  const periodes = useMemo(() => {
    const annees: number[] = [];
    const exercices: string[] = [];
    const debut = dons.reduce((m, d) => (d.date_don && d.date_don < m ? d.date_don : m), todayISO());
    for (let y = new Date().getFullYear(); y >= Number(debut.slice(0, 4)); y--) annees.push(y);
    for (let y = Number(anneeScolaireCourante().slice(0, 4)); y >= Number(anneeScolaireISO(debut).slice(0, 4)); y--) exercices.push(`${y}-${y + 1}`);
    return { annees, exercices };
  }, [dons]);
  const [menuPeriode, setMenuPeriode] = useState(false);
  const libellePeriode =
    anneeFiltre === "toutes" ? "Toutes les périodes" : anneeFiltre.startsWith("civ:") ? `Année ${anneeFiltre.slice(4)}` : `Exercice ${anneeFiltre.slice(4)}`;
  const categoriesPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const d of dons) if (d.categorie_donateur) s.add(d.categorie_donateur);
    return [...s].sort();
  }, [dons]);

  /** Dons dont la catégorie contredit le type de personne (à corriger à la main). */
  const nbIncoherents = useMemo(() => dons.filter((d) => incoherenceCategorie(d)).length, [dons]);

  const donsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    // Corbeille : on montre tous les dons supprimés (seule la recherche s'applique).
    if (vueCorbeille) {
      return donsSupprimes.filter((d) => {
        if (!q) return true;
        const nom = d.est_personne_morale
          ? d.raison_sociale ?? d.donateur_nom
          : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
        return `${nom} ${d.courriel ?? ""} ${d.cp_ville ?? ""}`.toLowerCase().includes(q);
      });
    }
    return dons.filter((d) => {
      if (filtres.length > 0 && !(chipsParDon.get(d.id) ?? []).some((c) => filtres.includes(c.key))) return false;
      if (!periodeDuDon(d, anneeFiltre)) return false;
      if (soloIncoherents && !incoherenceCategorie(d)) return false;
      if (catsMasquees.includes(d.categorie_donateur ?? "")) return false;
      if (q) {
        const nom = d.est_personne_morale
          ? d.raison_sociale ?? d.donateur_nom
          : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
        if (!`${nom} ${d.courriel ?? ""} ${d.cp_ville ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dons, donsSupprimes, vueCorbeille, filtres, anneeFiltre, catsMasquees, soloIncoherents, recherche, chipsParDon]);

  const statsAffiches = useMemo(() => {
    const totalM = donsAffiches.reduce((s, d) => s + Number(d.montant), 0);
    const donateurs = new Set(donsAffiches.map((d) => cleDonateur(d))).size;
    return {
      count: donsAffiches.length,
      total: totalM,
      donateurs,
      moyenne: donsAffiches.length ? totalM / donsAffiches.length : 0,
    };
  }, [donsAffiches]);

  const nomTri = (d: Don) =>
    (d.est_personne_morale ? d.raison_sociale ?? d.donateur_nom ?? "" : [d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ")).toLowerCase();

  const donsTries = useMemo(() => {
    const arr = [...donsAffiches];
    const dir = tri.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let r = 0;
      if (tri.key === "montant") r = Number(a.montant) - Number(b.montant);
      else if (tri.key === "categorie") r = (a.categorie_donateur ?? "").localeCompare(b.categorie_donateur ?? "");
      else if (tri.key === "mode") r = (a.mode_paiement ?? "").localeCompare(b.mode_paiement ?? "");
      else if (tri.key === "donateur") r = nomTri(a).localeCompare(nomTri(b));
      // Directeur spirituel : reçus « À passer » d'abord, groupés par la personne à qui les passer.
      else if (tri.key === "statut") {
        const aP = chipsParDon.get(a.id)?.some((c) => c.key === "passer") ? 0 : 1;
        const bP = chipsParDon.get(b.id)?.some((c) => c.key === "passer") ? 0 : 1;
        r = aP - bP || passerA(a).localeCompare(passerA(b), "fr") || (a.date_don ?? "").localeCompare(b.date_don ?? "");
      }
      else r = (a.date_don ?? "").localeCompare(b.date_don ?? ""); // date par défaut
      // Médailles Don : à date égale, l'ordre des numéros du don (mêmes départages que leur calcul).
      if (r === 0 && numeros) r = (numeros[a.id] ?? 0) - (numeros[b.id] ?? 0);
      return r * dir;
    });
    return arr;
  }, [donsAffiches, tri, numeros, chipsParDon]);

  function trierPar(key: ColKey) {
    setTri((t) =>
      t.key === key ? { key, dir: t.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "montant" ? "desc" : "asc" },
    );
  }

  const filtresActifs =
    filtres.length > 0 || anneeFiltre !== FILTRE_ANNEE_DEFAUT || catsMasquees.length > 0 || soloIncoherents || recherche.trim() !== "";
  function reinitialiser() {
    reinitialiserFiltres();
    setAnneeFiltre(FILTRE_ANNEE_DEFAUT);
    setCatsMasquees([]);
    setSoloIncoherents(false);
    setRecherche("");
  }

  function exporterCSV() {
    const entete = ["Date", "Donateur", "Catégorie", "Montant", "Mode", "N° reçu", "État reçu", "Courriel", "CP/Ville"];
    const lignes = donsAffiches.map((d) => {
      const nom = d.est_personne_morale
        ? d.raison_sociale ?? d.donateur_nom
        : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
      return [d.date_don, nom, d.categorie_donateur ?? "", String(d.montant).replace(".", ","), d.mode_paiement ?? "", d.recu_numero ?? "", d.recu_etat ?? "", d.courriel ?? "", d.cp_ville ?? ""];
    });
    const csv = [entete, ...lignes]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dons${anneeFiltre !== "toutes" ? "-" + anneeFiltre.slice(4) : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  // Don relié à la comptabilité : elle fait foi pour le montant et la date
  // d'encaissement. Un chèque ou des espèces gardent une date de réception
  // (fiscalement, la remise du chèque), au plus tard l'encaissement.
  // Reçu établi : montant et date figés.
  const [enCaisse, setEnCaisse] = useState(true);
  // Don dont on lie l'écriture comptable depuis la liste (sans ouvrir toute la fiche).
  const [lierId, setLierId] = useState<string | null>(null);
  // Fenêtre « don + écriture comptable » ouverte par un clic sur la ligne du don.
  const [ficheEcritureId, setFicheEcritureId] = useState<string | null>(null);
  const donEdite = edit && edit !== "nouveau" ? edit : null;
  // Écritures comptables déjà reliées à un don : elles ne sont pas proposées pour un autre.
  const operationsLiees = useMemo(() => new Set(donsInit.map((d) => d.operation_id).filter((x): x is string => !!x)), [donsInit]);
  const lie = !!donEdite?.operation_id;
  const encaissement = lie ? (donEdite?.operation?.date_operation ?? null) : null;
  const recuFige = /^RE_/.test(donEdite?.recu_numero ?? "");
  const montantFige = lie || recuFige;
  const dateLibre = !recuFige && (!lie || ["Chèque", "Espèces"].includes(f.mode_paiement));

  function ouvrir(d: Don | "nouveau", signale = false) {
    setError(null);
    setSignaler(signale);
    if (d === "nouveau") {
      setF(vide());
    } else {
      setF({
        origine: d.origine ?? "",
        categorie_donateur:
          normaliserCategorieDonateur(d.categorie_donateur) ?? (d.est_personne_morale ? "Association" : "Particulier"),
        est_personne_morale: d.est_personne_morale,
        donateur_titre: d.donateur_titre ?? "",
        donateur_nom: d.donateur_nom ?? "",
        donateur_prenom: d.donateur_prenom ?? "",
        raison_sociale: d.raison_sociale ?? "",
        adresse: d.adresse ?? "",
        cp_ville: d.cp_ville ?? "",
        courriel: d.courriel ?? "",
        a_transmettre: d.a_transmettre ?? "",
        envoi_prefere: d.envoi_prefere ?? "courriel",
        montant: String(d.montant).replace(".", ","),
        date_don: d.date_don,
        mode_paiement: d.mode_paiement ?? "",
        recu_numero: d.recu_numero ?? "",
        recu_etat: d.recu_etat ?? "",
        observations: d.observations ?? "",
      });
    }
    setEdit(d);
  }

  // Mode « fenêtre seule » : ouvre le don demandé dès que ses données sont lisibles
  // (déchiffrées), sans quoi le formulaire s'ouvrirait vide ou verrouillé.
  const [ouvertSeule, setOuvertSeule] = useState<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!ouvrirId || ouvertSeule === ouvrirId) return;
    const brut = donsInit.find((x) => x.id === ouvrirId);
    const d = donsHydrates.find((x) => x.id === ouvrirId);
    if (!brut || !d) return;
    if (d.donateur_nom === VERROU || d.raison_sociale === VERROU) return;
    if (brut.pii_chiffre && d === brut) return;
    setOuvertSeule(ouvrirId);
    ouvrir(d, signalerManques);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvrirId, ouvertSeule, donsInit, donsHydrates]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function fermerFormulaire() {
    setEdit(null);
    if (seule) onFermer?.();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const montantNum = Number(f.montant.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (f.est_personne_morale ? !f.raison_sociale.trim() : !f.donateur_nom.trim()) {
      setError(f.est_personne_morale ? "Le nom de l'organisme est obligatoire." : "Le nom est obligatoire.");
      return;
    }

    if (coffre.estConfigure && !coffre.estOuvert) {
      setError("Coffre verrouillé : déverrouillez-le (Paramètres → Sécurité) pour enregistrer un donateur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Champs NON personnels (restent en clair).
    const base = {
      origine: f.origine.trim() || null,
      categorie_donateur: f.categorie_donateur || null,
      est_personne_morale: f.est_personne_morale,
      envoi_prefere: prefereEnBase(f.envoi_prefere),
      montant: montantNum,
      date_don: f.date_don,
      mode_paiement: f.mode_paiement || null,
      recu_numero: f.recu_numero.trim() || null,
      recu_etat: f.recu_etat.trim() || null,
      observations: f.observations.trim() || null,
    };
    // Champs personnels (chiffrés si le coffre est ouvert).
    const pii = {
      titre: f.donateur_titre.trim() || null,
      // Personne morale : nom/prénom = le CONTACT (destinataire du courriel).
      // Le reçu fiscal reste établi à la raison sociale (voir champsRecu).
      nom: nomSoigne(f.donateur_nom, f.est_personne_morale) || null,
      prenom: f.donateur_prenom.trim() || null,
      raison: f.est_personne_morale ? f.raison_sociale.trim() : null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      courriel: f.courriel.trim() || null,
      transmettre: f.a_transmettre.trim() || null,
    };
    // Sans coffre, la fiche s'enregistre en clair : la consigne « à transmettre à » n'a pas de colonne.
    if (!coffre.estOuvert && pii.transmettre) {
      setSaving(false);
      return setError("Déverrouillez le coffre pour enregistrer « À transmettre à » (donnée chiffrée).");
    }

    type DonPayload = typeof base & {
      pii_chiffre: string | null;
      donateur_titre: string | null;
      donateur_nom: string | null;
      donateur_prenom: string | null;
      raison_sociale: string | null;
      adresse: string | null;
      cp_ville: string | null;
      courriel: string | null;
    };
    const payload: DonPayload = coffre.estOuvert
      ? {
          ...base,
          pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
          donateur_titre: null, donateur_nom: null, donateur_prenom: null,
          raison_sociale: null, adresse: null, cp_ville: null, courriel: null,
        }
      : {
          ...base,
          pii_chiffre: null,
          donateur_titre: pii.titre, donateur_nom: pii.nom, donateur_prenom: pii.prenom,
          raison_sociale: pii.raison, adresse: pii.adresse, cp_ville: pii.cp_ville, courriel: pii.courriel,
        };

    // Don en espèces : la recette entre aussi dans le compte Caisse, et le don
    // lui est relié (sinon la comptabilité ne correspond plus aux reçus).
    let operationCaisse: string | null = null;
    if (edit === "nouveau" && f.mode_paiement === "Espèces" && enCaisse) {
      const [{ data: caisse }, { data: catDon }, { data: exo }] = await Promise.all([
        supabase.from("comptes").select("id").ilike("nom", "caisse").limit(1).maybeSingle(),
        supabase.from("categories").select("id").eq("nom", "Don").eq("type", "recette").limit(1).maybeSingle(),
        supabase.from("exercices").select("id").lte("date_debut", f.date_don).gte("date_fin", f.date_don).limit(1).maybeSingle(),
      ]);
      if (!caisse) {
        setError("Compte « Caisse » introuvable : créez-le dans Paramètres, ou décochez l'enregistrement en Caisse.");
        setSaving(false);
        return;
      }
      const { data: op, error: errOp } = await supabase
        .from("operations")
        .insert({
          date_operation: f.date_don,
          libelle: "Don",
          montant: montantNum,
          type: "recette",
          categorie_id: catDon?.id ?? null,
          compte_id: caisse.id,
          exercice_id: exo?.id ?? null,
          mode_paiement: "especes",
        })
        .select("id")
        .single();
      if (errOp || !op) {
        setError("Enregistrement en Caisse impossible : " + (errOp?.message ?? "inconnu"));
        setSaving(false);
        return;
      }
      operationCaisse = (op as { id: string }).id;
    }

    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("dons").insert({ ...payload, operation_id: operationCaisse })
        : await supabase.from("dons").update(payload).eq("id", (edit as Don).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }

    // La fiche est celle du DONATEUR, pas du seul versement : on la reporte sur
    // ses autres dons (même identité avant modification), sans quoi ils restent
    // incomplets et les reçus fiscaux divergeraient.
    if (edit !== "nouveau" && edit) {
      const cle = cleDonateur(edit);
      const autres = donsHydrates.filter(
        (d) => d.id !== edit.id && !d.supprime_le && cle !== "|" && cle !== "" && cleDonateur(d) === cle,
      );
      if (autres.length > 0) {
        const { error: errReport } = await supabase
          .from("dons")
          .update({
            est_personne_morale: payload.est_personne_morale,
            categorie_donateur: payload.categorie_donateur,
            envoi_prefere: payload.envoi_prefere,
            pii_chiffre: payload.pii_chiffre,
            donateur_titre: payload.donateur_titre,
            donateur_nom: payload.donateur_nom,
            donateur_prenom: payload.donateur_prenom,
            raison_sociale: payload.raison_sociale,
            adresse: payload.adresse,
            cp_ville: payload.cp_ville,
            courriel: payload.courriel,
          })
          .in("id", autres.map((d) => d.id));
        if (errReport) {
          setError(`Don enregistré, mais la fiche n'a pas pu être reportée sur ses ${autres.length} autre(s) don(s) : ${errReport.message}`);
          setSaving(false);
          router.refresh();
          return;
        }
      }
    }

    setSaving(false);
    setEdit(null);
    router.refresh();
    if (seule) onFermer?.();
  }

  // Chiffre les dons encore en clair (migration ponctuelle, coffre ouvert).
  async function chiffrerExistants() {
    if (!coffre.estOuvert || nonChiffres.length === 0) return;
    setMigration(true);
    const supabase = createClient();
    for (const d of nonChiffres) {
      const pii_chiffre = await coffre.chiffrer(JSON.stringify(piiDepuis(d)));
      await supabase
        .from("dons")
        .update({
          pii_chiffre,
          donateur_titre: null, donateur_nom: null, donateur_prenom: null,
          raison_sociale: null, adresse: null, cp_ville: null, courriel: null,
        })
        .eq("id", d.id);
    }
    setMigration(false);
    router.refresh();
  }

  // Suppression réversible : on horodate `supprime_le` (rien n'est détruit).
  async function supprimer(d: Don) {
    setGenErreur(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("dons")
      .update({ supprime_le: new Date().toISOString(), supprime_par: roleSlug })
      .eq("id", d.id);
    if (err) {
      setGenErreur("Suppression impossible : " + err.message);
      return;
    }
    setToast({ id: d.id, nom: nomAffiche(d) || "Don" });
    router.refresh();
  }

  async function restaurer(id: string) {
    const supabase = createClient();
    await supabase.from("dons").update({ supprime_le: null, supprime_par: null }).eq("id", id);
    setToast((t) => (t?.id === id ? null : t));
    router.refresh();
  }

  /** Avec `ouvrir`, affiche le reçu dans un onglet ; sinon le télécharge sous son nom propre (« Reçu fiscal … .pdf »). */
  async function genererRecu(d: Don, ouvrir = true) {
    setGenErreur(null);
    if (d.pii_chiffre && !coffre.estOuvert) {
      setGenErreur("Déverrouillez le coffre (Paramètres → Sécurité) pour générer un reçu.");
      return;
    }
    // Le reçu couvre tous les dons portant son numéro (numérotation automatique
    // depuis la page Reçus fiscaux) : un don sans numéro n'a pas encore de reçu.
    if (!d.recu_numero || !/^RE_\d+/.test(d.recu_numero)) {
      setGenErreur("Ce don n'a pas encore de reçu : établissez-le depuis la page Reçus fiscaux (numéro attribué automatiquement).");
      return;
    }
    const couverts = donsHydrates.filter((x) => !x.supprime_le && x.recu_numero === d.recu_numero);
    try {
      await genererRecuPdf({
        ...d,
        donateur_nom: d.donateur_nom ?? "",
        montant: couverts.reduce((s, x) => s + Number(x.montant), 0),
        versements: couverts.map((x) => ({ date: x.date_don, montant: Number(x.montant), mode: x.mode_paiement })),
        date_edition: couverts.find((x) => x.recu_emis_le)?.recu_emis_le ?? undefined,
      }, { ouvrir });
    } catch (e) {
      setGenErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  /**
   * Courrier postal : « À passer » → « Vérifier envoi postal » (reçu remis au secrétaire) → « Posté » (validé).
   * L'état est porté par tous les dons du même reçu.
   */
  async function avancerCourrier(d: Don, etape: "passer" | "verifier_poste") {
    if (!d.recu_numero) return;
    const memes = donsInit.filter((x) => x.recu_numero === d.recu_numero && !x.supprime_le);
    const supabase = createClient();
    if (etape === "passer") {
      if (!window.confirm(`Le reçu ${d.recu_numero} (avec sa lettre) a été passé au secrétaire pour envoi postal ?`)) return;
      const { error } = await supabase.from("dons").update({ recu_etat: ETAT_PASSE_SECRETAIRE }).in("id", memes.map((x) => x.id));
      if (error) return setGenErreur("Mise à jour impossible : " + error.message);
    } else {
      if (!window.confirm(`Confirmer que le courrier du reçu ${d.recu_numero} a bien été posté ?`)) return;
      const jour = todayISO();
      const { error: errRecu } = await supabase.from("recus").update({ envoye_le: jour, envoi_mode: "courrier" }).eq("recu_numero", d.recu_numero);
      if (errRecu) return setGenErreur("Registre des reçus non mis à jour : " + errRecu.message);
      const { error } = await supabase.from("dons").update({ recu_etat: etatEnvoye(formatDate(jour), "courrier") }).in("id", memes.map((x) => x.id));
      if (error) return setGenErreur("Mise à jour impossible : " + error.message);
    }
    router.refresh();
  }

  const colsAff = avecMedaille ? { ...cols, statut: true, medaille: true } : modeRecherche ? { ...cols, medaille: false } : modeMedailles ? { ...cols, statut: false, recu: false } : cols;
  const cellPad = compact ? "px-3 py-1.5" : "px-4 py-3";
  const ringManque = (estVide: boolean) =>
    signaler && estVide ? " ring-2 ring-negative/60 !border-negative" : "";
  const nomAffiche = (d: Don) =>
    d.est_personne_morale
      ? d.raison_sociale ?? d.donateur_nom
      : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");

  return (
    <>
      {!seule && (
      <>
      {modeleRecu !== undefined && (
        <PageHeader
          title="Dons"
          subtitle="Suivi des dons reçus et génération des reçus fiscaux."
          action={
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOptions((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOptions}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
              >
                Options ▾
              </button>
              {menuOptions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOptions(false)} />
                  <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                    {(() => {
                      const itemCls = "block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";
                      const liaisonBloquee = verrou || !coffre.estOuvert;
                      return (
                        <>
                          <button type="button" role="menuitem" onClick={() => { setMenuOptions(false); ouvrir("nouveau"); }} className={`${itemCls} font-medium text-accent`}>
                            + Nouveau don
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button type="button" role="menuitem" onClick={() => { setMenuOptions(false); setModeleOuvert(true); }} className={itemCls}>
                            Modèle de reçu
                          </button>
                          <Link role="menuitem" href="/dons/depuis-compta" className={itemCls}>
                            Importer depuis Comptabilité
                          </Link>
                          <Link role="menuitem" href="/dons/import" className={itemCls}>
                            Importer (.xlsx)
                          </Link>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={liaisonBloquee}
                            title={liaisonBloquee ? "Déverrouillez le coffre pour lier les dons à la comptabilité" : "Rapproche toutes les écritures « Don » sans don (tous les exercices) des dons « hors compta »"}
                            onClick={() => { setMenuOptions(false); setDemandeLiaison((n) => n + 1); }}
                            className={itemCls}
                          >
                            🔗 Lier toutes les années{liaisonBloquee ? " 🔒" : ""}
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button type="button" role="menuitem" onClick={() => { setMenuOptions(false); setVueCorbeille((v) => !v); }} className={itemCls}>
                            {vueCorbeille ? "✓ " : ""}🗑 Corbeille{donsSupprimes.length > 0 ? ` (${donsSupprimes.length})` : ""}
                          </button>
                          <button type="button" role="menuitem" onClick={() => { setMenuOptions(false); exporterCSV(); }} className={itemCls}>
                            Exporter CSV
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
              {modeleOuvert && <ModeleRecuDialog initial={modeleRecu} onFermer={() => setModeleOuvert(false)} />}
            </div>
          }
        />
      )}
      {sousEntete && <div className="mb-5">{sousEntete}</div>}
      {/* Coffre verrouillé : les noms sont masqués */}
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">🔒 Coffre verrouillé — les données des donateurs sont masquées.</span>
          <DeverrouillerCoffre />
        </div>
      )}

      {/* Migration : dons pas encore chiffrés (coffre ouvert) */}
      {!lecture && coffre.estOuvert && nonChiffres.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <span>
            <strong>{nonChiffres.length}</strong> don{nonChiffres.length > 1 ? "s" : ""} pas encore chiffré
            {nonChiffres.length > 1 ? "s" : ""}. Chiffrez-les pour retirer les données en clair de la base.
          </span>
          <button
            type="button"
            onClick={chiffrerExistants}
            disabled={migration}
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {migration ? "Chiffrement…" : "Chiffrer maintenant"}
          </button>
        </div>
      )}

      {!modeMedailles && (<>
      {/* Recherche + actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un donateur…"
          className={`${inputCls} min-w-[10rem] max-w-[16rem] flex-1`}
        />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuPeriode((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              anneeFiltre !== FILTRE_ANNEE_DEFAUT ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"
            }`}
          >
            {libellePeriode} ▾
          </button>
          {menuPeriode && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuPeriode(false)} />
              <div className="absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAnneeFiltre("toutes");
                    setMenuPeriode(false);
                  }}
                  className={`mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${anneeFiltre === "toutes" ? "font-medium text-accent" : ""}`}
                >
                  Toutes les périodes
                </button>
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-1">
                  <div>
                    <p className="px-2 py-1 text-xs font-medium text-muted">Année</p>
                    <div className="max-h-64 overflow-y-auto">
                      {periodes.annees.map((y) => {
                        const f: FiltreAnnee = `civ:${y}`;
                        return (
                          <button
                            key={y}
                            type="button"
                            onClick={() => {
                              setAnneeFiltre(f);
                              setMenuPeriode(false);
                            }}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-surface-2 ${anneeFiltre === f ? "bg-accent-soft font-medium text-accent" : ""}`}
                          >
                            {y}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="px-2 py-1 text-xs font-medium text-muted">Exercice</p>
                    <div className="max-h-64 overflow-y-auto">
                      {periodes.exercices.map((e) => {
                        const f: FiltreAnnee = `exo:${e}`;
                        return (
                          <button
                            key={e}
                            type="button"
                            onClick={() => {
                              setAnneeFiltre(f);
                              setMenuPeriode(false);
                            }}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-surface-2 ${anneeFiltre === f ? "bg-accent-soft font-medium text-accent" : ""}`}
                          >
                            {e}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuCats((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              catsMasquees.length > 0 ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"
            }`}
          >
            Catégories{catsMasquees.length > 0 ? ` (${categoriesPresentes.length - catsMasquees.length}/${categoriesPresentes.length})` : ""} ▾
          </button>
          {menuCats && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuCats(false)} />
              <div className="absolute left-0 z-20 mt-1 w-60 rounded-lg border border-border bg-surface p-2 shadow-lg">
                <p className="px-2 py-1 text-xs font-medium text-muted">Catégories affichées</p>
                {categoriesPresentes.map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={!catsMasquees.includes(c)}
                      onChange={() => setCatsMasquees((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c]))}
                      className="h-4 w-4"
                    />
                    {c}
                  </label>
                ))}
                <div className="mt-1 flex gap-1 border-t border-border pt-1 text-xs text-muted">
                  <button type="button" onClick={() => setCatsMasquees([])} className="rounded-md px-2 py-1.5 hover:bg-surface-2">
                    Tout cocher
                  </button>
                  <button type="button" onClick={() => setCatsMasquees([...categoriesPresentes])} className="rounded-md px-2 py-1.5 hover:bg-surface-2">
                    Tout décocher
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {nbIncoherents > 0 && (
          <button
            type="button"
            onClick={() => setSoloIncoherents((v) => !v)}
            title="Dons dont la catégorie ne correspond pas au type de personne (ex. « Association » saisie comme particulier)"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              soloIncoherents ? "border-gold bg-gold-soft text-gold" : "border-gold/50 text-gold hover:bg-gold-soft/50"
            }`}
          >
            ⚠ Catégorie à corriger ({nbIncoherents})
          </button>
        )}
        <LiaisonGlobale dons={dons as unknown as DonCompta[]} verrou={verrou} sansBouton demande={demandeLiaison} />
        {filtresActifs && (
          <button type="button" onClick={reinitialiser} className="text-xs text-muted underline hover:text-foreground">
            Réinitialiser les filtres
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuCols((v) => !v)}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Colonnes ▾
            </button>
            {menuCols && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuCols(false)} />
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-surface p-2 shadow-lg">
                  <p className="px-2 py-1 text-xs font-medium text-muted">Colonnes affichées</p>
                  {COLONNES.filter((c) => !modeRecherche || avecMedaille || c.key !== "medaille").map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={cols[c.key]}
                        onChange={() => setCols((m) => ({ ...m, [c.key]: !m[c.key] }))}
                        className="h-4 w-4"
                      />
                      {c.label}
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCols(COLS_DEFAUT)}
                    className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2"
                  >
                    Réinitialiser les colonnes
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCompact((c) => !c)}
            title={compact ? "Passer en vue détaillée" : "Passer en vue compacte"}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            {compact ? "Vue détaillée" : "Vue compacte"}
          </button>
        </div>
      </div>

      {/* Analyse : synthèse de la sélection courante */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Dons", value: String(statsAffiches.count) },
          { label: "Montant total", value: formatEuros(statsAffiches.total) },
          { label: "Donateurs", value: String(statsAffiches.donateurs) },
          { label: "Don moyen", value: formatEuros(statsAffiches.moyenne) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3 text-center">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      </>)}

      {genErreur && (
        <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{genErreur}</p>
      )}

      {!modeMedailles && (<>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTRES.filter((item) => (avecMedaille ? item.key === "passer" : plusFiltres || FILTRES_VISIBLES.includes(item.key) || filtreActif(item.key))).map((item) => {
          const n = compteParStatut.get(item.key) ?? 0;
          const actif = filtreActif(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => basculerFiltre(item.key)}
              aria-pressed={actif}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-center text-xs font-medium transition ${TONE_CLASSES[item.tone]} ${
                actif ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "opacity-90 hover:opacity-100"
              } ${n === 0 ? "opacity-40" : ""}`}
            >
              {filtreMultiple && <CasePastille coche={actif} />}
              {item.label}
              <span className="rounded-full bg-black/10 px-1.5 tabular-nums dark:bg-white/15">{n}</span>
            </button>
          );
        })}
        {!avecMedaille && <>
        <button
          type="button"
          onClick={() => setPlusFiltres((v) => !v)}
          aria-expanded={plusFiltres}
          className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-2"
        >
          {plusFiltres ? "− de filtres" : "+ de filtres"}
        </button>
        <BoutonFiltresMultiples actif={filtreMultiple} onClick={basculerFiltreMultiple} nombre={filtres.length} />
        </>}
        {filtres.length > 0 && (
          <button
            type="button"
            onClick={reinitialiserFiltres}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Tout afficher
          </button>
        )}
      </div>
      </>)}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className={`w-full ${compact ? "text-[13px]" : "text-sm"}`}>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              {COLONNES.filter((c) => colsAff[c.key]).map((c) => {
                const aligneD = c.key === "montant";
                const centre = c.key === "medaille";
                const actif = tri.key === c.key;
                return (
                  <Fragment key={c.key}>
                  {c.key === "medaille" && numeros && <th className={`${cellPad} font-medium text-center`}>N°</th>}
                  <th className={`${cellPad} font-medium ${aligneD ? "text-right" : ""} ${centre ? "text-center" : ""}`}>
                    {c.sortable || (avecMedaille && c.key === "statut") ? (
                      <button
                        type="button"
                        onClick={() => trierPar(c.key)}
                        title={avecMedaille && c.key === "statut" ? "Trier : reçus « À passer » d'abord, par personne à qui les passer" : undefined}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${aligneD ? "flex-row-reverse" : ""} ${actif ? "text-foreground" : ""}`}
                      >
                        {c.label}
                        <span className="text-[10px]">{actif ? (tri.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                  </Fragment>
                );
              })}
              {!modeMedailles && <th className={`${cellPad} font-medium text-right`}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {donsTries.length === 0 ? (
              <tr>
                <td colSpan={COLONNES.filter((c) => colsAff[c.key]).length + (modeMedailles ? 0 : 1) + (numeros ? 1 : 0)} className="px-4 py-12 text-center text-muted">
                  {vueCorbeille
                    ? "Corbeille vide."
                    : dons.length === 0
                      ? "Aucun don enregistré."
                      : "Aucun don pour ce filtre."}
                </td>
              </tr>
            ) : (
              donsTries.map((d) => {
                const chips = chipsParDon.get(d.id) ?? [];
                return (
                <tr
                  key={d.id}
                  onClick={(e) => {
                    // Les boutons, liens et champs de la ligne gardent leur rôle ; ailleurs, la ligne s'ouvre.
                    if (vueCorbeille || (e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
                    if (modeMedailles) return;
                    if (modeRecherche) setContactId(d.id);
                    else setFicheEcritureId(d.id);
                  }}
                  className={`border-b border-border last:border-0 align-middle ${vueCorbeille ? "" : "cursor-pointer hover:bg-surface-2"}`}
                >
                  {cols.date && <td className={`${cellPad} tabular-nums whitespace-nowrap`}>{formatDate(d.date_don)}</td>}
                  {cols.donateur && (
                    <td className={`${cellPad} max-w-[18rem] truncate`}>
                      {nomAffiche(d)}
                      {recurrents.has(cleDonateur(d)) && (
                        <span
                          title="Donateur récurrent (plusieurs dons)"
                          className="ml-1.5 align-middle text-xs text-violet-600 dark:text-violet-400"
                        >
                          ↻
                        </span>
                      )}
                    </td>
                  )}
                  {cols.categorie && <td className={`${cellPad} text-muted`}>{d.categorie_donateur ?? "—"}</td>}
                  {cols.montant && <td className={`${cellPad} text-right tabular-nums whitespace-nowrap`}>{formatEuros(Number(d.montant))}</td>}
                  {cols.mode && <td className={`${cellPad} text-muted`}>{d.mode_paiement ?? "—"}</td>}
                  {cols.recu && <td className={`${cellPad} tabular-nums text-xs`}>{d.recu_numero ?? "—"}</td>}
                  {cols.compta && (
                    <td className={`${cellPad} text-center`}>
                      {vueCorbeille ? null : d.operation_id ? (
                        <button
                          type="button"
                          onClick={() => { if (!lecture) setLierId(d.id); }}
                          title="Relié à une écriture comptable : voir ou délier"
                          aria-label="Relié à la comptabilité"
                          className="inline-flex text-positive hover:opacity-80"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { if (!lecture) setLierId(d.id); }}
                          title="Non lié (hors compta) : lier à une écriture comptable"
                          aria-label="Non lié à la comptabilité"
                          className="inline-flex text-gold hover:opacity-80"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1" />
                            <path d="M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1" />
                            <path d="M3 3l18 18" />
                          </svg>
                        </button>
                      )}
                    </td>
                  )}
                  {cols.statut && (
                    <td className={cellPad}>
                      <div className={`flex gap-1 ${compact ? "flex-nowrap" : "flex-wrap"}`}>
                        {(compact ? chips.filter((x) => x.key !== "nonlie").slice(0, 1) : chips.filter((x) => x.key !== "nonlie")).map((c) => {
                          const cls = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[c.tone]}`;
                          // Courrier postal : la pastille est une liste (À passer / Vérifier envoi postal / Posté).
                          // Lecture seule : l'étape en texte, avec la personne à qui passer le reçu.
                          if (lecture && c.key === "passer") return <span key={c.key} title={c.detail} className={cls}>À passer · {passerA(d)}</span>;
                          if (lecture) return <span key={c.key} title={c.detail} className={cls}>{c.label}</span>;
                          if (c.key === "passer" && d.recu_numero) {
                            const ids = donsInit.filter((x) => x.recu_numero === d.recu_numero && !x.supprime_le).map((x) => x.id);
                            return (
                              <span key={c.key} className="inline-flex items-center gap-1">
                                <EtapePostaleListe numero={d.recu_numero} idsDons={ids} etape="passer" libelleEnvoye="Posté" />
                                <ChoixPasserA valeur={passerA(d)} idsDons={ids} />
                              </span>
                            );
                          }
                          if ((c.key === "verifier_poste" || c.key === "poste") && d.recu_numero) {
                            return (
                              <EtapePostaleListe
                                key={c.key}
                                numero={d.recu_numero}
                                idsDons={donsInit.filter((x) => x.recu_numero === d.recu_numero && !x.supprime_le).map((x) => x.id)}
                                etape={c.key === "verifier_poste" ? "verifier" : "envoye"}
                                libelleEnvoye="Posté"
                              />
                            );
                          }
                          if ((c.key === "etablir" || c.key === "annuel") && estTresorier && !vueCorbeille) {
                            return (
                              <button key={c.key} type="button" onClick={() => ouvrirEtablir(d)}
                                title="Cliquer pour établir le reçu fiscal (choix des dons, numéro attribué automatiquement)"
                                className={`${cls} cursor-pointer hover:opacity-80`}>
                                {c.label}
                              </button>
                            );
                          }
                          return c.key === "important" || c.key === "mineur" ? (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => ouvrir(d, true)}
                              title={`${c.detail ?? ""} — cliquer pour compléter`}
                              className={`${cls} cursor-pointer underline-offset-2 hover:underline`}
                            >
                              {c.label}
                            </button>
                          ) : c.key === "passer" || c.key === "verifier_poste" ? (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => void avancerCourrier(d, c.key as "passer" | "verifier_poste")}
                              title={c.key === "passer" ? "Cliquer quand le reçu est passé au secrétaire" : "Cliquer pour valider : le courrier est posté"}
                              className={`${cls} cursor-pointer hover:opacity-80`}
                            >
                              {c.label}
                            </button>
                          ) : (
                            <span key={c.key} title={c.detail} className={cls}>
                              {c.label}
                            </span>
                          );
                        })}
                        {compact && chips.filter((x) => x.key !== "nonlie").length > 1 && (
                          <span
                            title={chips.filter((x) => x.key !== "nonlie").map((c) => c.label).join(" · ")}
                            className="inline-flex items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
                          >
                            +{chips.filter((x) => x.key !== "nonlie").length - 1}
                          </span>
                        )}
                      </div>
                      {!lecture && (demandeParDon.get(d.id) && !numeroEtabli(d.recu_numero) || alertesParDon.get(d.id)) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {demandeParDon.get(d.id) && !numeroEtabli(d.recu_numero) && (
                            <PastilleDemandeRecu demande={demandeParDon.get(d.id)!} onClick={estTresorier ? () => ouvrirEtablir(d) : undefined} />
                          )}
                          {estTresorier && alertesParDon.get(d.id) && <AlerteInfosDonateur donId={d.id} alertes={alertesParDon.get(d.id)!} />}
                        </div>
                      )}
                      {!compact && d.recu_etat && d.recu_etat.trim() && (
                        <p className="mt-1 text-xs text-muted">{d.recu_etat}</p>
                      )}
                    </td>
                  )}
                  {colsAff.medaille && numeros && (
                    <td className={`${cellPad} text-center whitespace-nowrap tabular-nums text-muted`}>{numeros[d.id] ? `n° ${numeros[d.id]}` : ""}</td>
                  )}
                  {colsAff.medaille && (
                    <td className={`${cellPad} text-center`}>
                      {d.don_boursier ? (
                        <span className="text-muted" title="Don boursier : pas de médaille">—</span>
                      ) : (
                        <MedailleDon key={`${d.id}-${d.medaille_affichee ? 1 : 0}`} donId={d.id} affichee={!!d.medaille_affichee}
                          par={d.medaille_par} le={d.medaille_le} roleSlug={vueCorbeille ? null : roleSlug} />
                      )}
                    </td>
                  )}
                  {!modeMedailles && <td className={`${cellPad} text-right whitespace-nowrap`}>
                    {vueCorbeille ? (
                      <>
                        {d.supprime_le && (
                          <span className="mr-3 text-xs text-muted">Supprimé le {formatDate(d.supprime_le)}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => restaurer(d.id)}
                          className="text-accent hover:underline"
                        >
                          Restaurer
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Recherche de fonds : téléchargement direct, le fichier porte le nom du reçu (un PDF ouvert en onglet
                            serait enregistré sous un nom codé) ; l'icône « reçu établi » devient alors inutile. */}
                        {numeroEtabli(d.recu_numero) && (modeRecherche ? (
                          <button
                            type="button"
                            onClick={() => genererRecu(d, false)}
                            title="Télécharger le reçu fiscal (PDF)"
                            className="whitespace-nowrap text-accent hover:underline"
                          >
                            Télécharger le reçu
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => genererRecu(d)}
                            className="text-accent hover:underline"
                          >
                            Reçu
                          </button>
                        ))}
                        {modeRecherche && !numeroEtabli(d.recu_numero) && (
                          <span className="ml-3 inline-flex align-middle">
                            <BoutonDemandeRecu donId={d.id} demande={demandeParDon.get(d.id) ?? null}
                              etabli={false} prenom={prenomRecherche} />
                          </span>
                        )}
                        {!lecture && <>
                        <button
                          type="button"
                          onClick={() => ouvrir(d)}
                          title="Modifier"
                          aria-label="Modifier ce don"
                          className="ml-3 inline-flex align-middle text-muted hover:text-accent"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => supprimer(d)}
                          title="Supprimer"
                          aria-label="Supprimer ce don"
                          className="ml-3 inline-flex align-middle text-muted hover:text-negative"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </button>
                        </>}
                      </>
                    )}
                  </td>}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      </>
      )}

      {lierId && (() => {
        const d = donsHydrates.find((x) => x.id === lierId);
        if (!d) return null;
        return (
          <Modal title="Lier le don à une écriture comptable" onClose={() => setLierId(null)}>
            <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              Don du <strong>{formatDate(d.date_don)}</strong> de <strong>{formatEuros(Number(d.montant))}</strong>
              {nomDonateur(d) ? <> — {nomDonateur(d)}</> : null}
            </p>
            <LierDonAEcriture don={d} operationsLiees={operationsLiees} dons={donsHydrates} />
          </Modal>
        );
      })()}

      {etablirGroupe && (
        <EtablirRecu
          groupe={etablirGroupe}
          manquants={[]}
          onFermer={() => setEtablirGroupe(null)}
          onFait={(t) => {
            setEtablirGroupe(null);
            setGenErreur(null);
            window.alert(t);
            router.refresh();
          }}
        />
      )}

      {contactId && (() => {
        const d = donsHydrates.find((x) => x.id === contactId);
        if (!d) return null;
        const cle = cleDonateur(d);
        const memes = dons.filter((x) => x.id === d.id || (!verrou && cle && cle !== "|" && cleDonateur(x) === cle));
        return <ContactDonateurRecherche don={d} donsDuDonateur={memes} prenom={prenomRecherche} onFermer={() => setContactId(null)} />;
      })()}

      {ficheEcritureId && (() => {
        const d = donsHydrates.find((x) => x.id === ficheEcritureId);
        if (!d) return null;
        return (
          <FenetreDonEcriture
            don={d}
            dons={donsHydrates}
            operationsLiees={operationsLiees}
            onFermer={() => setFicheEcritureId(null)}
            onModifierDon={() => {
              setFicheEcritureId(null);
              ouvrir(d);
            }}
          />
        );
      })()}

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouveau don" : "Modifier le don"}
          onClose={fermerFormulaire}
          enregistrerEnFermant
        >
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {signaler && (
              <div className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                Complétez les informations importantes surlignées. Elles seront aussi reportées sur les autres dons de ce donateur.
              </div>
            )}
            <ChoixDonateur
              dons={dons}
              valeurCourante={{
                est_personne_morale: f.est_personne_morale,
                donateur_titre: f.donateur_titre,
                donateur_nom: f.donateur_nom,
                donateur_prenom: f.donateur_prenom,
                raison_sociale: f.raison_sociale,
                adresse: f.adresse,
                cp_ville: f.cp_ville,
                courriel: f.courriel,
                a_transmettre: f.a_transmettre,
                categorie_donateur: f.categorie_donateur,
                envoi_prefere: f.envoi_prefere,
              }}
              onChoisir={(i: IdentiteSaisie) => setF((p) => ({ ...p, ...i }))}
              chiffrer={coffre.chiffrer}
              coffreOuvert={coffre.estOuvert}
            />

            <Field label="Catégorie donateur">
              <select
                value={f.categorie_donateur}
                onChange={(e) => {
                  set("categorie_donateur", e.target.value);
                  // La catégorie fait foi : hors « Particulier », c'est une personne morale.
                  set("est_personne_morale", estCategoriePersonneMorale(e.target.value));
                }}
                className={inputCls}
              >
                {!CATEGORIES.includes(f.categorie_donateur as (typeof CATEGORIES)[number]) && f.categorie_donateur && (
                  <option value={f.categorie_donateur}>{f.categorie_donateur}</option>
                )}
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                {f.est_personne_morale
                  ? "Personne morale : le reçu est établi au nom de l'organisme ; nom et prénom désignent le contact."
                  : "Particulier : le reçu est établi au nom et prénom."}
              </span>
            </Field>
            {edit !== "nouveau" && edit && incoherenceCategorie(edit) && (
              <p className="-mt-2 rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
                {incoherenceCategorie(edit)} Choisissez la bonne catégorie ci-dessus ; les champs s&apos;adaptent.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label={dateLibre && lie ? "Date de réception" : "Date d'encaissement"}>
                <input
                  type="date"
                  required
                  value={f.date_don}
                  onChange={(e) => set("date_don", e.target.value)}
                  readOnly={!dateLibre}
                  max={dateLibre && encaissement ? encaissement : undefined}
                  title={
                    dateLibre && lie
                      ? `Remise ou réception du chèque / des espèces ; au plus tard l'encaissement (${formatDate(encaissement ?? "")})`
                      : undefined
                  }
                  className={`${inputCls} ${dateLibre ? "" : "cursor-not-allowed bg-surface-2 text-muted"}`}
                />
              </Field>
              <Field label="Montant (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={f.montant}
                  onChange={(e) => set("montant", e.target.value)}
                  readOnly={montantFige}
                  className={`${inputCls} ${montantFige ? "cursor-not-allowed bg-surface-2 text-muted" : ""}`}
                />
              </Field>
            </div>
            {donEdite && <LierDonAEcriture don={donEdite} operationsLiees={operationsLiees} dons={donsHydrates} />}
            {edit === "nouveau" && f.mode_paiement === "Espèces" && (
              <label className="-mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={enCaisse} onChange={(e) => setEnCaisse(e.target.checked)} />
                Enregistrer aussi cette recette dans le compte Caisse de la comptabilité (don relié)
              </label>
            )}

            {f.est_personne_morale ? (
              <>
                <Field label="Nom de l'organisme">
                  <input type="text" required value={f.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls + ringManque(!f.raison_sociale.trim())} placeholder="Ex. Oeuvre Salésienne" />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Contact — Titre">
                    <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                  </Field>
                  <Field label="Contact — Nom">
                    <input type="text" value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} placeholder="Personne à contacter" />
                  </Field>
                  <Field label="Contact — Prénom">
                    <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <p className="-mt-1 text-xs text-muted">
                  Le courriel sera adressé à ce contact ; le reçu fiscal reste établi au nom de l&apos;organisme.
                </p>
              </>
            ) : (
              <ChampsParticulier
                titre={f.donateur_titre}
                prenom={f.donateur_prenom}
                nom={f.donateur_nom}
                set={set}
                classeNom={ringManque(!f.donateur_nom.trim())}
                nomAvantPrenom
              />
            )}

            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls + ringManque(f.envoi_prefere !== "aucun" && !f.adresse.trim())} placeholder="N° et rue" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CP et ville">
                <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls + ringManque(f.envoi_prefere !== "aucun" && !f.cp_ville.trim())} placeholder="51100 Reims" />
              </Field>
              {!(!f.est_personne_morale && estCouple(f.donateur_titre)) && (
                <ChampCourriel titre={f.donateur_titre} courriel={f.courriel} onChange={(v) => set("courriel", v)} classe={ringManque(f.envoi_prefere === "courriel" && !f.courriel.trim())} />
              )}
            </div>
            {!f.est_personne_morale && estCouple(f.donateur_titre) && (
              <ChampCourriel titre={f.donateur_titre} courriel={f.courriel} onChange={(v) => set("courriel", v)} classe={ringManque(f.envoi_prefere === "courriel" && !f.courriel.trim())} />
            )}
            <Field label="Reçus fiscaux envoyés par">
              <select value={f.envoi_prefere} onChange={(e) => set("envoi_prefere", e.target.value)} className={inputCls}>
                {PREFERENCES_ENVOI.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted">
                {f.envoi_prefere === "aucun"
                  ? "Ce donateur ne demande pas de reçu fiscal : ses dons sans reçu établi n'apparaissent plus « à établir »."
                  : f.envoi_prefere === "courrier"
                    ? "Courrier postal : l'adresse et le code postal sont nécessaires ; le courriel est facultatif."
                    : f.envoi_prefere === "transmettre"
                      ? "À transmettre : le reçu est remis à la personne de contact indiquée ci-dessous ; le courriel du donateur est facultatif."
                      : "Courriel : l'adresse électronique est nécessaire. À modifier si le donateur change de mode de réception."}
              </span>
            </Field>
            {f.envoi_prefere === "transmettre" && (
              <Field label="Reçu à transmettre à">
                <input
                  type="text"
                  value={f.a_transmettre}
                  onChange={(e) => set("a_transmettre", e.target.value)}
                  className={inputCls + ringManque(!f.a_transmettre.trim())}
                  placeholder="Prénom Nom, courriel de la personne de contact"
                />
                <span className="mt-1 block text-xs text-muted">
                  Le reçu est remis à cette personne ou à ce courriel : l&apos;adresse électronique du donateur n&apos;est plus nécessaire. Donnée chiffrée avec la fiche.
                </span>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Mode de paiement">
                <select value={f.mode_paiement} onChange={(e) => set("mode_paiement", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Relation (qui a amené ce don)">
              <input
                type="text"
                list="relations-connues"
                value={f.origine}
                onChange={(e) => set("origine", e.target.value)}
                className={inputCls}
                placeholder="Chanoine Journé, Paroisse, CA…"
              />
              <datalist id="relations-connues">
                {relations.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <p className="-mt-2 text-xs text-muted">
              Choisissez une relation existante plutôt que d&apos;en ressaisir une : cela évite les
              doublons d&apos;orthographe.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="N° de reçu">
                {/* Attribué automatiquement (page Reçus fiscaux) : jamais saisi à la main. */}
                <input
                  type="text"
                  value={f.recu_numero}
                  readOnly
                  className={`${inputCls} cursor-not-allowed bg-surface-2 text-muted`}
                  placeholder="attribué à l'établissement du reçu"
                  title="Le numéro est attribué automatiquement depuis la page Reçus fiscaux"
                />
              </Field>
              <Field label="État du reçu">
                {/* Géré depuis la page Reçus fiscaux (établi, envoyé, moyen, date). */}
                <input
                  type="text"
                  value={f.recu_etat}
                  readOnly
                  className={`${inputCls} cursor-not-allowed bg-surface-2 text-muted`}
                  placeholder="géré dans Reçus fiscaux"
                  title="L'état du reçu (établi, envoyé, moyen et date d'envoi) se gère depuis la page Reçus fiscaux"
                />
              </Field>
            </div>

            <Field label="Observations">
              <input type="text" value={f.observations} onChange={(e) => set("observations", e.target.value)} className={inputCls} />
            </Field>

            <FormFooter saving={saving} error={error} onCancel={fermerFormulaire} />
          </form>
        </Modal>
      )}

      {/* Toast : suppression réversible */}
      {!seule && <BandeauEtapePostale />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
          <span>
            Don supprimé{toast.nom && toast.nom !== "Don" ? ` — ${toast.nom}` : ""}.
          </span>
          <button
            type="button"
            onClick={() => restaurer(toast.id)}
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-muted hover:text-foreground"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

