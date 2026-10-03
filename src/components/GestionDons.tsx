"use client";

import {
  CATEGORIES_DONATEUR,
  estCategoriePersonneMorale,
  incoherenceCategorie,
  normaliserCategorieDonateur,
} from "@/lib/categoriesDonateur";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { genererRecuPdf, dateEditionDuNumero } from "@/lib/recu";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import ChoixDonateur, { type IdentiteSaisie } from "@/components/ChoixDonateur";
import { useCoffre } from "@/components/CoffreProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { useDonsDechiffres, piiDepuis, VERROU } from "@/lib/donsChiffre";
import {
  statutsDon,
  donateursRecurrents,
  cleDonateur,
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
  pii_chiffre: string | null;
  montant: number;
  date_don: string;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  recu_emis_le: string | null;
  observations: string | null;
  /** Opération comptable reliée : elle fait foi pour le montant et la date d'encaissement. */
  operation_id?: string | null;
  operation?: { date_operation: string } | null;
  supprime_le: string | null;
  supprime_par: string | null;
};

const CATEGORIES = CATEGORIES_DONATEUR;
const MODES = ["Virement", "Chèque", "Carte bancaire", "Espèces", "Nature", "Autre"];

// Colonnes affichables du tableau (le n° de reçu est masqué par défaut).
type ColKey = "date" | "donateur" | "categorie" | "montant" | "mode" | "recu" | "statut";
const COLONNES: { key: ColKey; label: string; sortable: boolean; defaut: boolean }[] = [
  { key: "date", label: "Date", sortable: true, defaut: true },
  { key: "donateur", label: "Donateur", sortable: true, defaut: true },
  { key: "categorie", label: "Catégorie", sortable: true, defaut: false },
  { key: "montant", label: "Montant", sortable: true, defaut: true },
  { key: "mode", label: "Mode", sortable: true, defaut: false },
  { key: "recu", label: "N° reçu", sortable: false, defaut: false },
  { key: "statut", label: "Statut", sortable: false, defaut: true },
];
const COLS_DEFAUT = Object.fromEntries(COLONNES.map((c) => [c.key, c.defaut])) as Record<ColKey, boolean>;

// Année SCOLAIRE (1er sept → 31 août) d'une date ISO → « 2025-2026 ».
const anneeScolaireISO = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};
const anneeScolaireCourante = () => anneeScolaireISO(new Date().toISOString().slice(0, 10));
const anneeCivileCourante = () => String(new Date().getFullYear());

// Filtre de période : « toutes », un exercice (« exo:2026-2027 ») ou une année
// civile (« civ:2026 » — celle des reçus fiscaux).
type FiltreAnnee = "toutes" | `exo:${string}` | `civ:${string}`;
const periodeDuDon = (d: Don, f: FiltreAnnee): boolean => {
  if (f === "toutes") return true;
  if (!d.date_don) return false;
  return f.startsWith("civ:") ? d.date_don.slice(0, 4) === f.slice(4) : anneeScolaireISO(d.date_don) === f.slice(4);
};
const FILTRE_ANNEE_DEFAUT: FiltreAnnee = `exo:${anneeScolaireCourante()}`;

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
}: {
  dons: Don[];
  roleSlug?: string | null;
  /** Relations déjà employées, proposées en suggestion pour éviter les doublons. */
  relations?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
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
  const [filtre, setFiltre] = useState<StatutKey | null>(null);
  const [signaler, setSignaler] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [anneeFiltre, setAnneeFiltre] = useState<FiltreAnnee>(FILTRE_ANNEE_DEFAUT);
  const [catFiltre, setCatFiltre] = useState("toutes");
  const [compact, setCompact] = useState(true);
  const [cols, setCols] = useState<Record<ColKey, boolean>>(COLS_DEFAUT);
  const [tri, setTri] = useState<{ key: ColKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [menuCols, setMenuCols] = useState(false);

  // Préférences d'affichage (colonnes, tri, densité) restaurées au montage.
  // setState au montage depuis localStorage : cas légitime, non SSR-able autrement.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const c = localStorage.getItem("dons.cols");
      if (c) setCols({ ...COLS_DEFAUT, ...JSON.parse(c) });
      const t = localStorage.getItem("dons.tri");
      if (t) setTri(JSON.parse(t));
      const k = localStorage.getItem("dons.compact");
      if (k != null) setCompact(k === "1");
    } catch {}
  }, []);
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
  const chipsParDon = useMemo(() => {
    const map = new Map<string, Chip[]>();
    for (const d of dons) map.set(d.id, statutsDon(d, recurrents));
    return map;
  }, [dons, recurrents]);
  const compteParStatut = useMemo(() => {
    const c = new Map<StatutKey, number>();
    for (const chips of chipsParDon.values())
      for (const ch of chips) c.set(ch.key, (c.get(ch.key) ?? 0) + 1);
    return c;
  }, [chipsParDon]);
  // Exercices antérieurs à l'exercice en cours, proposés dans « Autres ».
  const exercicesAnterieurs = useMemo(() => {
    const s = new Set<string>();
    for (const d of dons) if (d.date_don) s.add(anneeScolaireISO(d.date_don));
    s.delete(anneeScolaireCourante());
    return [...s].sort().reverse();
  }, [dons]);
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
      if (filtre && !(chipsParDon.get(d.id) ?? []).some((c) => c.key === filtre)) return false;
      if (!periodeDuDon(d, anneeFiltre)) return false;
      if (catFiltre === "incoherents") {
        if (!incoherenceCategorie(d)) return false;
      } else if (catFiltre !== "toutes" && (d.categorie_donateur ?? "") !== catFiltre) return false;
      if (q) {
        const nom = d.est_personne_morale
          ? d.raison_sociale ?? d.donateur_nom
          : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
        if (!`${nom} ${d.courriel ?? ""} ${d.cp_ville ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dons, donsSupprimes, vueCorbeille, filtre, anneeFiltre, catFiltre, recherche, chipsParDon]);

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
      else r = (a.date_don ?? "").localeCompare(b.date_don ?? ""); // date par défaut
      return r * dir;
    });
    return arr;
  }, [donsAffiches, tri]);

  function trierPar(key: ColKey) {
    setTri((t) =>
      t.key === key ? { key, dir: t.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "montant" ? "desc" : "asc" },
    );
  }

  const filtresActifs =
    filtre || anneeFiltre !== FILTRE_ANNEE_DEFAUT || catFiltre !== "toutes" || recherche.trim() !== "";
  function reinitialiser() {
    setFiltre(null);
    setAnneeFiltre(FILTRE_ANNEE_DEFAUT);
    setCatFiltre("toutes");
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
  const donEdite = edit && edit !== "nouveau" ? edit : null;
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

  // Arrivée depuis un autre onglet (ex. Reçus fiscaux) : `?modifier=<id>` ouvre
  // directement ce don (champs manquants surlignés avec `&signaler=1`) ; à la
  // fermeture ou à l'enregistrement, on retourne à `retour` (chemin interne).
  const modifierId = params.get("modifier");
  const retourBrut = params.get("retour");
  const retour = retourBrut && retourBrut.startsWith("/") && !retourBrut.startsWith("//") ? retourBrut : null;
  const [ouvertParLien, setOuvertParLien] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!modifierId || ouvertParLien) return;
    const brut = donsInit.find((x) => x.id === modifierId);
    const d = donsHydrates.find((x) => x.id === modifierId);
    if (!brut || !d) return;
    // Attendre le déchiffrement (sinon le formulaire s'ouvrirait vide ou verrouillé).
    if (d.donateur_nom === VERROU || d.raison_sociale === VERROU) return;
    if (brut.pii_chiffre && d === brut) return;
    setOuvertParLien(true);
    ouvrir(d, params.get("signaler") === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modifierId, ouvertParLien, donsInit, donsHydrates]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function fermerFormulaire() {
    setEdit(null);
    if (ouvertParLien && retour) router.push(retour);
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
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
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
      nom: f.donateur_nom.trim() || null,
      prenom: f.donateur_prenom.trim() || null,
      raison: f.est_personne_morale ? f.raison_sociale.trim() : null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      courriel: f.courriel.trim() || null,
    };

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
    if (ouvertParLien && retour) router.push(retour);
    else router.refresh();
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

  async function genererRecu(d: Don) {
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
        date_edition: dateEditionDuNumero(d.recu_numero) ?? undefined,
      });
    } catch (e) {
      setGenErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  const cellPad = compact ? "px-3 py-1.5" : "px-4 py-3";
  const ringManque = (estVide: boolean) =>
    signaler && estVide ? " ring-2 ring-negative/60 !border-negative" : "";
  const nomAffiche = (d: Don) =>
    d.est_personne_morale
      ? d.raison_sociale ?? d.donateur_nom
      : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");

  return (
    <>
      {/* Coffre verrouillé : les noms sont masqués */}
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">🔒 Coffre verrouillé — les données des donateurs sont masquées.</span>
          <DeverrouillerCoffre />
        </div>
      )}

      {/* Migration : dons pas encore chiffrés (coffre ouvert) */}
      {coffre.estOuvert && nonChiffres.length > 0 && (
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

      {/* Recherche + actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un donateur…"
          className={`${inputCls} max-w-[16rem] flex-1`}
        />
        {filtresActifs && (
          <button type="button" onClick={reinitialiser} className="text-xs text-muted underline hover:text-foreground">
            Réinitialiser les filtres
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVueCorbeille((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              vueCorbeille ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"
            }`}
          >
            🗑 Corbeille{donsSupprimes.length > 0 ? ` (${donsSupprimes.length})` : ""}
          </button>
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
                  {COLONNES.map((c) => (
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
          <button
            type="button"
            onClick={exporterCSV}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => ouvrir("nouveau")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            + Nouveau don
          </button>
        </div>
      </div>

      {/* Filtres en boutons, groupés par type */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Année</span>
        <FiltreBtn actif={anneeFiltre === "toutes"} onClick={() => setAnneeFiltre("toutes")}>Toutes</FiltreBtn>
        <FiltreBtn actif={anneeFiltre === FILTRE_ANNEE_DEFAUT} onClick={() => setAnneeFiltre(FILTRE_ANNEE_DEFAUT)}>
          Exercice {anneeScolaireCourante()}
        </FiltreBtn>
        <FiltreBtn
          actif={anneeFiltre === `civ:${anneeCivileCourante()}`}
          onClick={() => setAnneeFiltre(`civ:${anneeCivileCourante()}`)}
        >
          Année {anneeCivileCourante()}
        </FiltreBtn>
        {exercicesAnterieurs.length > 0 && (
          <select
            value={anneeFiltre.startsWith("exo:") && anneeFiltre !== FILTRE_ANNEE_DEFAUT ? anneeFiltre : ""}
            onChange={(e) => e.target.value && setAnneeFiltre(e.target.value as FiltreAnnee)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              anneeFiltre.startsWith("exo:") && anneeFiltre !== FILTRE_ANNEE_DEFAUT
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface text-muted hover:bg-surface-2"
            }`}
          >
            <option value="">Autres…</option>
            {exercicesAnterieurs.map((a) => (
              <option key={a} value={`exo:${a}`}>
                Exercice {a}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Catégorie</span>
        <FiltreBtn actif={catFiltre === "toutes"} onClick={() => setCatFiltre("toutes")}>Toutes</FiltreBtn>
        {categoriesPresentes.map((c) => (
          <FiltreBtn key={c} actif={catFiltre === c} onClick={() => setCatFiltre(c)}>{c}</FiltreBtn>
        ))}
        {nbIncoherents > 0 && (
          <button
            type="button"
            onClick={() => setCatFiltre(catFiltre === "incoherents" ? "toutes" : "incoherents")}
            title="Dons dont la catégorie ne correspond pas au type de personne (ex. « Association » saisie comme particulier)"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              catFiltre === "incoherents" ? "border-gold bg-gold-soft text-gold" : "border-gold/50 text-gold hover:bg-gold-soft/50"
            }`}
          >
            ⚠ Catégorie à corriger ({nbIncoherents})
          </button>
        )}
      </div>

      {/* Analyse : synthèse de la sélection courante */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Dons", value: String(statsAffiches.count) },
          { label: "Montant total", value: formatEuros(statsAffiches.total) },
          { label: "Donateurs", value: String(statsAffiches.donateurs) },
          { label: "Don moyen", value: formatEuros(statsAffiches.moyenne) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {genErreur && (
        <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{genErreur}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTRES.map((item) => {
          const n = compteParStatut.get(item.key) ?? 0;
          const actif = filtre === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFiltre(actif ? null : item.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${TONE_CLASSES[item.tone]} ${
                actif ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "opacity-90 hover:opacity-100"
              } ${n === 0 ? "opacity-40" : ""}`}
            >
              {item.label}
              <span className="rounded-full bg-black/10 px-1.5 tabular-nums dark:bg-white/15">{n}</span>
            </button>
          );
        })}
        {filtre && (
          <button
            type="button"
            onClick={() => setFiltre(null)}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className={`w-full ${compact ? "text-[13px]" : "text-sm"}`}>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              {COLONNES.filter((c) => cols[c.key]).map((c) => {
                const aligneD = c.key === "montant";
                const actif = tri.key === c.key;
                return (
                  <th key={c.key} className={`${cellPad} font-medium ${aligneD ? "text-right" : ""}`}>
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => trierPar(c.key)}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${aligneD ? "flex-row-reverse" : ""} ${actif ? "text-foreground" : ""}`}
                      >
                        {c.label}
                        <span className="text-[10px]">{actif ? (tri.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
              <th className={`${cellPad} font-medium text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {donsTries.length === 0 ? (
              <tr>
                <td colSpan={COLONNES.filter((c) => cols[c.key]).length + 1} className="px-4 py-12 text-center text-muted">
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
                <tr key={d.id} className="border-b border-border last:border-0 align-middle">
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
                      {d.cp_ville && <span className="text-muted"> · {d.cp_ville}</span>}
                    </td>
                  )}
                  {cols.categorie && <td className={`${cellPad} text-muted`}>{d.categorie_donateur ?? "—"}</td>}
                  {cols.montant && <td className={`${cellPad} text-right tabular-nums whitespace-nowrap`}>{formatEuros(Number(d.montant))}</td>}
                  {cols.mode && <td className={`${cellPad} text-muted`}>{d.mode_paiement ?? "—"}</td>}
                  {cols.recu && <td className={`${cellPad} tabular-nums text-xs`}>{d.recu_numero ?? "—"}</td>}
                  {cols.statut && (
                    <td className={cellPad}>
                      <div className={`flex gap-1 ${compact ? "flex-nowrap" : "flex-wrap"}`}>
                        {(compact ? chips.slice(0, 1) : chips).map((c) => {
                          const cls = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[c.tone]}`;
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
                          ) : (
                            <span key={c.key} title={c.detail} className={cls}>
                              {c.label}
                            </span>
                          );
                        })}
                        {compact && chips.length > 1 && (
                          <span
                            title={chips.map((c) => c.label).join(" · ")}
                            className="inline-flex items-center rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
                          >
                            +{chips.length - 1}
                          </span>
                        )}
                      </div>
                      {!compact && d.recu_etat && d.recu_etat.trim() && (
                        <p className="mt-1 text-xs text-muted">{d.recu_etat}</p>
                      )}
                    </td>
                  )}
                  <td className={`${cellPad} text-right whitespace-nowrap`}>
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
                        <button
                          type="button"
                          onClick={() => genererRecu(d)}
                          className="text-accent hover:underline"
                        >
                          Reçu
                        </button>
                        <button
                          type="button"
                          onClick={() => ouvrir(d)}
                          className="ml-4 text-muted hover:underline"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => supprimer(d)}
                          className="ml-4 text-muted hover:text-negative hover:underline"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouveau don" : "Modifier le don"}
          onClose={fermerFormulaire}
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
                categorie_donateur: f.categorie_donateur,
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
                  ? "Personne morale : le reçu est établi à la raison sociale ; nom et prénom désignent le contact."
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
            {edit === "nouveau" && f.mode_paiement === "Espèces" && (
              <label className="-mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={enCaisse} onChange={(e) => setEnCaisse(e.target.checked)} />
                Enregistrer aussi cette recette dans le compte Caisse de la comptabilité (don relié)
              </label>
            )}

            {f.est_personne_morale ? (
              <>
                <Field label="Raison sociale">
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
                  Le courriel sera adressé à ce contact ; le reçu fiscal reste établi au nom de la raison sociale.
                </p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Titre">
                    <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                  </Field>
                  <Field label="Nom">
                    <input type="text" required value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls + ringManque(!f.donateur_nom.trim())} />
                  </Field>
                  <Field label="Prénom">
                    <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </>
            )}

            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls + ringManque(!f.adresse.trim())} placeholder="N° et rue" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CP et ville">
                <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls + ringManque(!f.cp_ville.trim())} placeholder="51100 Reims" />
              </Field>
              <Field label="Courriel">
                <input type="email" value={f.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls + ringManque(!f.courriel.trim())} />
              </Field>
            </div>

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
                <input type="text" value={f.recu_etat} onChange={(e) => set("recu_etat", e.target.value)} className={inputCls} placeholder="Envoyé - Courriel…" />
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

function FiltreBtn({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        actif
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
