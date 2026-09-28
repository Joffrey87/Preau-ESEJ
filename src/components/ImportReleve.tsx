"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate } from "@/lib/format";
import {
  parseReleve,
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
  CAT_SCOLARITE,
  CAT_MOIS_AVANCE,
  CAT_FRAIS_DOSSIER,
  type InscriptionImport,
} from "@/lib/importEnrichi";
import { CAT_DON_ASSOCIATION, natureParCategorie } from "@/components/AffectationScolarite";
import { libelleNature, type NatureAffectation } from "@/lib/scolariteDepots";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import ChoixDonateur, { type IdentiteSaisie } from "@/components/ChoixDonateur";
import ChampsDonateur, {
  type FormDonateur,
  formDonateurDepuisNom,
  resumeDonateur,
  ficheDonateurValide,
  piiDeFiche,
  relationsConnues,
} from "@/components/FormulaireDonateur";
import { Modal, FormFooter } from "./GestionComptes";
import { extraireNom, joursEcart } from "@/lib/reconciliation";
import { nomDonateur } from "@/lib/statutDon";
import type { Don } from "@/components/GestionDons";

type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean };
type DonExistant = Don & { operation_id: string | null };

const CAT_DON = "Don";
const CATS_SCOLARITE = [CAT_SCOLARITE, CAT_MOIS_AVANCE, CAT_FRAIS_DOSSIER];

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
  /** Fiche donateur à créer dans l'onglet Dons. */
  donateur?: FormDonateur;
  /** Don existant à relier plutôt que d'en créer un. */
  donLie?: string;
  /** Doute à lever (ambre). Vidé dès que l'utilisateur tranche. */
  alerte: string | null;
};

type Fille = Ecriture & { cle: string; montant: string };

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
  proposees: InscriptionImport[];
};

let compteurFille = 0;
const nouvelleCle = () => `f${++compteurFille}`;

export default function ImportReleve({
  categories,
  comptes,
  exercices,
  existantes,
  correspondances = [],
  inscriptions = [],
  dons: donsInit = [],
}: {
  categories: Cat[];
  comptes: Compte[];
  exercices: Exercice[];
  existantes: {
    date_operation: string;
    montant: number;
    type: string;
    libelle: string;
    categorie_id: string | null;
  }[];
  correspondances?: Correspondance[];
  inscriptions?: InscriptionImport[];
  dons?: DonExistant[];
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
  // Fiche donateur en cours d'édition : ligne + sous-écriture éventuelle.
  const [cibleDon, setCibleDon] = useState<{ i: number; cle: string | null } | null>(null);
  const [fDon, setFDon] = useState<FormDonateur>(formDonateurDepuisNom(""));
  const [erreurDon, setErreurDon] = useState<string | null>(null);

  const historique = useMemo(() => construireHistorique(existantes), [existantes]);
  const indexTokens = useMemo(() => construireIndexTokens(existantes), [existantes]);
  const catParId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catNom = (id: string | null | undefined) => (id ? catParId.get(id)?.nom ?? null : null);
  const catIdParNom = (nom: string, type: "recette" | "depense") =>
    categories.find((c) => c.nom === nom && c.type === type)?.id ?? "";
  const inscParId = useMemo(() => new Map(inscriptions.map((i) => [i.id, i])), [inscriptions]);
  const relations = useMemo(() => relationsConnues(dons), [dons]);

  function exerciceDe(date: string): Exercice | null {
    return (
      exercices.find((e) => e.date_debut <= date && date <= e.date_fin) ??
      exercices.find((e) => e.actif) ??
      null
    );
  }

  /** Nature d'affectation portée par la catégorie (null : écriture sans famille). */
  function natureDe(categorieId: string): NatureAffectation | null {
    const nom = catNom(categorieId);
    if (nom === CAT_DON_ASSOCIATION) return "don_association";
    return natureParCategorie(nom);
  }

  /**
   * Famille d'une écriture. Les groupes de textes sont essayés dans l'ordre :
   * pour une sous-écriture, son propre libellé d'abord, puis celui de la banque.
   */
  function infoFamille(e: Ecriture, textes: string[][], date: string): InfoFamille | null {
    const nature = natureDe(e.categorie_id);
    if (!nature) return null;
    const annees = anneesCandidates(date, anneeDeLibelle(exerciceDe(date)?.libelle), nature);
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
    const effective = e.famille !== undefined ? e.famille : candidats.length === 1 ? candidats[0] : "";
    return {
      nature,
      candidats,
      effective,
      ambigu: e.famille === undefined && candidats.length > 1,
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
        Math.abs(Number(d.montant) - montant) < 0.005 &&
        d.date_don &&
        joursEcart(d.date_don, date) <= 3,
    );
  }

  function traiter(buf: ArrayBuffer, nom: string) {
    setErreur(null);
    setFait(null);
    try {
      const brut = parseReleve(buf);
      if (brut.length === 0) {
        setErreur("Aucune opération détectée. Vérifiez que c'est bien l'export Excel de la banque (colonnes Date / Libellé / Débit / Crédit).");
        setLignes([]);
        return;
      }
      // Détection sur DATE + MONTANT uniquement. Deux niveaux, en deux passes
      // (le match exact ±1j est prioritaire, il « consomme » l'opération) :
      //   • ±1 jour  → déjà en compta      → grisée + DÉCOCHÉE
      //   • ±5 jours → doublon possible     → surlignée + COCHÉE (à vérifier)
      const jour = (iso: string) => Math.round(Date.parse(iso) / 86400000);
      const existing = existantes.map((o) => ({
        m: Number(o.montant).toFixed(2), j: jour(o.date_operation),
        date: o.date_operation, lib: o.libelle, montant: Number(o.montant), type: o.type, cat: o.categorie_id, used: false,
      }));
      type Existant = { date: string; libelle: string; montant: number; type: string; categorie: string | null };
      const mkExistant = (e: (typeof existing)[number]): Existant => ({
        date: e.date, libelle: e.lib, montant: e.montant, type: e.type,
        categorie: catNom(e.cat),
      });
      type P = { op: (typeof brut)[number]; i: number; m: string; j: number; doublon: boolean; suspect: boolean; existant: Existant | null };
      const p: P[] = brut.map((op, i) => ({ op, i, m: op.montant.toFixed(2), j: jour(op.date), doublon: false, suspect: false, existant: null }));
      const chercher = (m: string, j: number, tol: number) =>
        existing.findIndex((e) => !e.used && e.m === m && Math.abs(e.j - j) <= tol);
      for (const x of p) {
        const idx = chercher(x.m, x.j, 1);
        if (idx >= 0) { existing[idx].used = true; x.doublon = true; x.existant = mkExistant(existing[idx]); }
      }
      for (const x of p) {
        if (x.doublon) continue;
        const idx = chercher(x.m, x.j, 5);
        if (idx >= 0) { existing[idx].used = true; x.suspect = true; x.existant = mkExistant(existing[idx]); }
      }
      let ignoresN = 0, suspectsN = 0;
      const l: Ligne[] = p.map((x) => {
        if (x.doublon) ignoresN++;
        if (x.suspect) suspectsN++;
        const { op } = x;

        // 1. Règles intégrées prioritaires (impayé) ;
        // 2. règles de Correspondances ; à défaut, l'embellissement intégré ;
        // 3. reconnaissance des écritures de scolarité (mots-clés, puis montant).
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

        const catCorr = res.regle ? catNom(res.categorie_id) : null;
        // Un don d'association (Amitié Sainte Anne, ASEC) reste un don : on ne
        // le reclasse pas en scolarité, seule la famille bénéficiaire se rattache.
        if (!regle && catCorr !== CAT_DON_ASSOCIATION) {
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
            filles = a.ventilation.map((v) => ({
              cle: nouvelleCle(),
              libelle: v.libelle,
              categorie_id: catIdParNom(v.categorie, op.type),
              montant: v.montant.toFixed(2),
              candidats: a.candidats,
              alerte: null,
            }));
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
          filles,
          ouvert: filles.length > 0,
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
      ls.map((l, j) =>
        j === i ? { ...l, filles: l.filles.map((f) => (f.cle === cle ? { ...f, ...patch } : f)) } : l,
      ),
    );
  /** Modifie la ligne ou l'une de ses sous-écritures. */
  const majEcriture = (i: number, cle: string | null, patch: Partial<Ecriture>) =>
    cle ? majFille(i, cle, patch) : maj(i, patch);

  const resteFilles = (l: Ligne) =>
    Math.round((l.montant - l.filles.reduce((s, f) => s + (Number(f.montant) || 0), 0)) * 100) / 100;

  function ajouterFille(i: number) {
    const l = lignes[i];
    const reste = resteFilles(l);
    maj(i, {
      ouvert: true,
      filles: [
        ...l.filles,
        {
          cle: nouvelleCle(),
          libelle: `${l.libelle} — `,
          categorie_id: "",
          montant: reste > 0 ? reste.toFixed(2) : "",
          alerte: null,
        },
      ],
    });
  }

  const retirerFille = (i: number, cle: string) =>
    maj(i, { filles: lignes[i].filles.filter((f) => f.cle !== cle) });

  // --- Synthèse et filtres -------------------------------------------------

  /** Écritures qui entreront en comptabilité pour une ligne : ses filles, ou elle-même. */
  const ecrituresDe = (l: Ligne): { e: Ecriture; cle: string | null; montant: number; textes: string[][] }[] =>
    l.filles.length > 0
      ? l.filles.map((f) => ({ e: f, cle: f.cle, montant: Number(f.montant) || 0, textes: textesFille(l, f) }))
      : [{ e: l, cle: null, montant: l.montant, textes: textesMere(l) }];

  const aValider = (l: Ligne) =>
    !!l.alerte ||
    ecrituresDe(l).some(({ e, textes }) => !!e.alerte || !!infoFamille(e, textes, l.date)?.ambigu) ||
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
  const compte = (pred: (l: Ligne) => boolean) => retenues.filter(pred).length;
  const nbFamilles = retenues.reduce(
    (s, l) => s + ecrituresDe(l).filter(({ e, textes }) => !!infoFamille(e, textes, l.date)?.effective).length,
    0,
  );
  const nbFiches = retenues.reduce(
    (s, l) => s + ecrituresDe(l).filter(({ e }) => catNom(e.categorie_id) === CAT_DON && (e.donateur || e.donLie)).length,
    0,
  );
  const aDesDons = retenues.some((l) => ecrituresDe(l).some(({ e }) => catNom(e.categorie_id) === CAT_DON));

  // --- Fiche donateur ------------------------------------------------------

  function ouvrirDonateur(i: number, cle: string | null) {
    const l = lignes[i];
    const e: Ecriture = cle ? l.filles.find((f) => f.cle === cle)! : l;
    setErreurDon(null);
    setFDon(e.donateur ?? formDonateurDepuisNom(extraireNom(l.libelle_origine)));
    setCibleDon({ i, cle });
  }

  function validerDonateur(ev: React.FormEvent) {
    ev.preventDefault();
    if (!cibleDon) return;
    if (!ficheDonateurValide(fDon)) {
      setErreurDon(fDon.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }
    majEcriture(cibleDon.i, cibleDon.cle, { donateur: fDon, donLie: undefined });
    setCibleDon(null);
  }

  // --- Import --------------------------------------------------------------

  async function importer() {
    setErreur(null);
    if (!compteId) return setErreur("Choisissez un compte de destination.");
    if (retenues.length === 0) return setErreur("Aucune ligne sélectionnée.");

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
    const avecFiche = retenues.some((l) => ecrituresDe(l).some(({ e }) => catNom(e.categorie_id) === CAT_DON && e.donateur));
    if (avecFiche && !coffre.estOuvert) {
      return setErreur("Déverrouillez le coffre : les fiches donateur sont chiffrées à l'enregistrement.");
    }

    setImporting(true);
    const supabase = createClient();

    type OpInsert = Record<string, unknown> & { id: string };
    const meres: OpInsert[] = [];
    const filles: OpInsert[] = [];
    const affectations: Record<string, unknown>[] = [];
    const nouveauxDons: Record<string, unknown>[] = [];
    const liens: { donId: string; operationId: string; exerciceId: string | null }[] = [];

    /** Questions qui restent ouvertes sur une écriture → colonne « à vérifier » (ambre). */
    const questions = (e: Ecriture, info: InfoFamille | null): string | null => {
      const q: string[] = [];
      if (e.alerte) q.push(e.alerte);
      if (info?.ambigu) {
        q.push(`Famille à valider : ${info.candidats.map((id) => inscParId.get(id)?.famille_nom ?? "?").join(" ou ")}.`);
      }
      return q.length > 0 ? q.join(" ") : null;
    };

    /** Rattachements (famille, don) d'une écriture qui vient de recevoir son id. */
    const rattacher = (
      opId: string,
      e: Ecriture,
      info: InfoFamille | null,
      montant: number,
      date: string,
      exerciceId: string | null,
      mode: string | null,
    ) => {
      if (info?.effective) {
        affectations.push({
          operation_id: opId,
          inscription_id: info.effective,
          montant,
          nature: info.nature,
          notes: "Rattaché à l'import du relevé",
        });
      }
      if (catNom(e.categorie_id) !== CAT_DON) return;
      if (e.donLie) {
        liens.push({ donId: e.donLie, operationId: opId, exerciceId });
      } else if (e.donateur && ficheDonateurValide(e.donateur)) {
        nouveauxDons.push({
          _pii: piiDeFiche(e.donateur),
          exercice_id: exerciceId,
          origine: e.donateur.origine.trim() || null,
          categorie_donateur: e.donateur.categorie_donateur || null,
          est_personne_morale: e.donateur.est_personne_morale,
          montant,
          date_don: date,
          mode_paiement: mode,
          recu_numero: null,
          recu_etat: null,
          observations: "Saisi à l'import du relevé bancaire",
          operation_id: opId,
        });
      }
    };

    for (const l of retenues) {
      const id = crypto.randomUUID();
      const exerciceId = exerciceDe(l.date)?.id ?? null;
      const mode = devineMode(l.libelle_origine);
      const ventilee = l.filles.length > 0;
      const infoMere = ventilee ? null : infoFamille(l, textesMere(l), l.date);
      meres.push({
        id,
        date_operation: l.date,
        libelle: l.libelle,
        libelle_origine: l.libelle_origine,
        montant: l.montant,
        type: l.type,
        categorie_id: l.categorie_id || null,
        compte_id: compteId,
        exercice_id: exerciceId,
        mode_paiement: mode,
        est_ventilee: ventilee,
        a_verifier: ventilee ? l.alerte : questions(l, infoMere),
      });
      if (!ventilee) {
        rattacher(id, l, infoMere, l.montant, l.date, exerciceId, mode);
        continue;
      }
      for (const f of l.filles) {
        const fid = crypto.randomUUID();
        const info = infoFamille(f, textesFille(l, f), l.date);
        const montant = Number(f.montant);
        filles.push({
          id: fid,
          parent_id: id,
          date_operation: l.date,
          libelle: f.libelle.trim() || `${l.libelle} — ${catNom(f.categorie_id) ?? ""}`,
          libelle_origine: l.libelle_origine,
          montant,
          type: l.type,
          categorie_id: f.categorie_id || null,
          compte_id: compteId,
          exercice_id: exerciceId,
          mode_paiement: mode,
          est_ventilee: false,
          a_verifier: questions(f, info),
        });
        rattacher(fid, f, info, montant, l.date, exerciceId, mode);
      }
    }

    // Les lignes bancaires d'abord : les sous-écritures et rattachements y renvoient.
    const etapes: string[] = [];
    let err = (await supabase.from("operations").insert(meres)).error;
    if (!err && filles.length > 0) err = (await supabase.from("operations").insert(filles)).error;
    if (err) {
      setImporting(false);
      return setErreur("Import impossible : " + err.message);
    }
    etapes.push(`${meres.length} opération${meres.length > 1 ? "s" : ""} importée${meres.length > 1 ? "s" : ""}${filles.length ? ` (dont ${filles.length} sous-écriture${filles.length > 1 ? "s" : ""})` : ""}`);

    const avertissements: string[] = [];
    if (affectations.length > 0) {
      const { error } = await supabase.from("affectations_scolarite").insert(affectations);
      if (error) avertissements.push("rattachements aux familles non enregistrés : " + error.message);
      else etapes.push(`${affectations.length} rattachement${affectations.length > 1 ? "s" : ""} à l'onglet Frais de scolarité`);
    }
    if (nouveauxDons.length > 0) {
      const payload = [];
      for (const d of nouveauxDons) {
        const { _pii, ...reste } = d;
        payload.push({
          ...reste,
          pii_chiffre: await coffre.chiffrer(JSON.stringify(_pii)),
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
      const maj: { operation_id: string; exercice_id?: string } = { operation_id: lien.operationId };
      const don = dons.find((d) => d.id === lien.donId);
      if (lien.exerciceId && don && !don.exercice_id) maj.exercice_id = lien.exerciceId;
      const { error } = await supabase.from("dons").update(maj).eq("id", lien.donId);
      if (error) avertissements.push("liaison d'un don impossible : " + error.message);
    }
    if (liens.length > 0) etapes.push(`${liens.length} don${liens.length > 1 ? "s" : ""} existant${liens.length > 1 ? "s" : ""} relié${liens.length > 1 ? "s" : ""}`);

    setImporting(false);
    setFait(etapes.join(" · "));
    if (avertissements.length > 0) {
      setErreur(`Opérations importées, mais : ${avertissements.join(" ; ")}. À reprendre depuis la Comptabilité.`);
    }
    setLignes([]);
    setNomFichier(null);
    router.refresh();
  }

  // --- Rendu ---------------------------------------------------------------

  const selectCls =
    "rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent";

  /** Colonne « Rattachement » : famille (scolarité) ou fiche donateur (don). */
  function rattachement(i: number, l: Ligne, e: Ecriture, cle: string | null, montant: number, textes: string[][]) {
    const info = infoFamille(e, textes, l.date);
    if (info) {
      const candidats = info.candidats.map((id) => inscParId.get(id)).filter(Boolean) as InscriptionImport[];
      const autres = info.proposees.filter((p) => !info.candidats.includes(p.id));
      return (
        <div className="flex flex-col gap-0.5">
          <select
            value={info.effective}
            onChange={(ev) => majEcriture(i, cle, { famille: ev.target.value, alerte: null })}
            title={`${libelleNature(info.nature)} — famille de l'onglet Frais de scolarité`}
            className={`w-44 ${selectCls} ${info.ambigu ? "border-gold bg-gold-soft/60" : ""}`}
          >
            <option value="">{info.ambigu ? "— à valider —" : "— famille —"}</option>
            {candidats.length > 0 && (
              <optgroup label={info.ambigu ? "Homonymes reconnus" : "Reconnue"}>
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
            {libelleNature(info.nature)}
            {info.ambigu && <span className="ml-1 font-medium text-gold">· homonymes, à valider</span>}
            {!info.ambigu && e.famille === undefined && info.effective && <span className="ml-1">· reconnue</span>}
          </span>
        </div>
      );
    }

    if (catNom(e.categorie_id) !== CAT_DON) return <span className="text-xs text-muted/50">—</span>;

    if (!coffre.estOuvert) {
      return <span className="text-xs text-gold" title="Déverrouillez le coffre (bandeau ci-dessus) pour saisir la fiche">🔒 fiche donateur</span>;
    }
    if (e.donLie) {
      const d = dons.find((x) => x.id === e.donLie);
      return (
        <span className="inline-flex items-center gap-1 text-xs">
          <span className="text-positive">↔</span>
          <span className="font-medium">{d ? nomDonateur(d) : "don existant"}</span>
          <button type="button" onClick={() => majEcriture(i, cle, { donLie: undefined })} className="text-muted hover:text-negative" title="Ne plus relier">✕</button>
        </span>
      );
    }
    const proches = donsProches(montant, l.date);
    return (
      <div className="flex flex-col items-start gap-0.5">
        {e.donateur ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <button type="button" onClick={() => ouvrirDonateur(i, cle)} className="font-medium text-accent hover:underline" title="Modifier la fiche">
              {resumeDonateur(e.donateur) || "fiche sans nom"}
            </button>
            <button type="button" onClick={() => majEcriture(i, cle, { donateur: undefined })} className="text-muted hover:text-negative" title="Retirer la fiche">✕</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => ouvrirDonateur(i, cle)}
            className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold hover:opacity-90"
            title="Renseigner le donateur : le don sera créé dans l'onglet Dons, relié à cette opération"
          >
            + Fiche donateur
          </button>
        )}
        {proches.length > 0 && !e.donateur && (
          <select
            value=""
            onChange={(ev) => ev.target.value && majEcriture(i, cle, { donLie: ev.target.value, donateur: undefined })}
            className="w-44 rounded border border-positive/40 bg-background px-1 py-0.5 text-[11px] text-positive outline-none"
            title="Un don de même montant, à ±3 jours, est déjà saisi : reliez-le plutôt que de le recréer"
          >
            <option value="">Déjà saisi ? relier…</option>
            {proches.map((d) => (
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
    { v: "a_classer", l: "À classer", n: compte((l) => ecrituresDe(l).some(({ e }) => !e.categorie_id)) },
    { v: "scolarite", l: "Scolarité", n: compte((l) => ecrituresDe(l).some(({ e }) => natureDe(e.categorie_id) !== null)) },
    { v: "dons", l: "Dons", n: compte((l) => ecrituresDe(l).some(({ e }) => catNom(e.categorie_id) === CAT_DON)) },
    { v: "a_valider", l: "À valider", n: compte(aValider) },
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
              Les écritures de scolarité sont rattachées aux familles, les dons peuvent recevoir leur fiche donateur.
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

      {lignes.length > 0 && (
        <>
          {aDesDons && coffre.estConfigure && !coffre.estOuvert && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
              <span>🔒 Déverrouillez le coffre pour renseigner les fiches donateur (elles sont chiffrées). Sans fiche, le don reste à compléter depuis l&apos;onglet Dons.</span>
              <DeverrouillerCoffre />
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
                {nbFiches > 0 && <> · <span>{nbFiches} don(s) documenté(s)</span></>}
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
                            onClick={() => (ventilee || l.ouvert ? maj(i, { ouvert: !l.ouvert }) : ajouterFille(i))}
                            title={ventilee ? "Voir les sous-écritures" : "Ventiler cette ligne en sous-écritures"}
                            className={`flex h-6 w-6 items-center justify-center rounded text-base leading-none hover:bg-surface-2 ${
                              ventilee ? "text-accent" : "text-muted/50"
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
                            {l.regle_niveau && (
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
                                    onChange={(e) => majFille(i, f.cle, { libelle: e.target.value, candidats: undefined })}
                                    placeholder="Libellé — ex. « Frais de dossier — Beth »"
                                    title="Un nom de famille dans le libellé suffit à la rattacher"
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
                                  + Sous-écriture
                                </button>
                                {ventilee && Math.abs(reste) > 0.005 ? (
                                  <span className="rounded-lg bg-gold-soft px-2 py-1 font-medium text-gold">
                                    ⚠ {reste > 0 ? `${formatEuros(reste)} non ventilés` : `dépassement de ${formatEuros(-reste)}`}
                                  </span>
                                ) : ventilee ? (
                                  <span className="text-positive">Répartition équilibrée ✓</span>
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
          </p>
          <div className="h-20" aria-hidden />

          {/* Bouton d'import volant : reste accessible en faisant défiler la liste. */}
          <button
            type="button"
            onClick={importer}
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
              Le don sera créé dans l&apos;onglet Dons à l&apos;import, relié à cette opération (montant, date et mode repris du relevé).
            </p>
            <FormFooter saving={false} error={erreurDon} onCancel={() => setCibleDon(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
