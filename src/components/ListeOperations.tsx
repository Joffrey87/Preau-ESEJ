"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import VoletDetail from "@/components/VoletDetail";
import Icon from "@/components/Icon";
import PastilleDon, { etatDon, type DonCompta } from "@/components/PastilleDon";
import ChiffrerLibellesDons from "@/components/ChiffrerLibellesDons";
import { useCoffre } from "@/components/CoffreProvider";
import { LIBELLE_DON, chiffrerLibellesDon, dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import type { Rapprochement } from "@/lib/rapprochementDons";
import { formatEuros, formatDate } from "@/lib/format";
import VentilationOperation, { type OperationVentilable } from "@/components/VentilationOperation";
import {
  annulerDernierLot,
  journaliser,
  nouveauLot,
  extraire,
  type OperationJournalisable,
} from "@/lib/journalOperations";
import AffectationScolarite, {
  CAT_DON_ASSOCIATION,
  estCategorieScolarite,
  type Affectation,
  type Inscription,
} from "@/components/AffectationScolarite";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string };

export type OperationRow = {
  id: string;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  libelle_origine_chiffre?: string | null;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categorie_id: string | null;
  compte_id: string | null;
  exercice_id: string | null;
  parent_id: string | null;
  est_ventilee: boolean;
  /** Question ouverte sur la ligne (affichée en ambre). Null = rien à vérifier. */
  a_verifier: string | null;
  categories: { nom: string } | null;
  comptes: { nom: string } | null;
};

const MODES = [
  { v: "virement", l: "Virement" },
  { v: "cheque", l: "Chèque" },
  { v: "carte", l: "Carte" },
  { v: "especes", l: "Espèces" },
  { v: "prelevement", l: "Prélèvement" },
  { v: "autre", l: "Autre" },
];

type FormState = {
  date_operation: string;
  libelle: string;
  type: "recette" | "depense";
  categorie_id: string;
  compte_id: string;
  mode_paiement: string;
  montant: string;
  exercice_id: string;
  a_verifier: string;
};

/** Texte comparable : minuscules, sans accents. */
const normaliser = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mot de recherche qui ressemble à un montant (« 60 », « 60,50 », « 1 234,5 »). */
const montantDe = (mot: string): number | null =>
  /^\d+([.,]\d{1,2})?$/.test(mot) ? Number(mot.replace(",", ".")) : null;

function formDepuis(op: OperationRow): FormState {
  return {
    date_operation: op.date_operation,
    libelle: op.libelle,
    type: op.type,
    categorie_id: op.categorie_id ?? "",
    compte_id: op.compte_id ?? "",
    mode_paiement: op.mode_paiement ?? "",
    montant: String(op.montant),
    exercice_id: op.exercice_id ?? "",
    a_verifier: op.a_verifier ?? "",
  };
}

export default function ListeOperations({
  operations,
  categories,
  comptes,
  exerciceId,
  exercices,
  donsRepertories,
  rapprochementsDons = {},
  donsCompta = [],
  inscriptions,
  affectations,
}: {
  operations: OperationRow[];
  categories: Categorie[];
  comptes: Compte[];
  exerciceId: string | null;
  exercices: Exercice[];
  donsRepertories: string[];
  /** Don correspondant à chaque opération « Don » : relié, ou trouvé par montant et date. */
  rapprochementsDons?: Record<string, Rapprochement>;
  /** Dons concernés (coordonnées chiffrées, déchiffrées ici si le coffre est ouvert). */
  donsCompta?: DonCompta[];
  inscriptions: Inscription[];
  affectations: Affectation[];
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const donsRepertoriesSet = new Set(donsRepertories);
  // Complétude des fiches donateur : jugée sur les dons déchiffrés.
  const { dons: donsClairs, verrou } = useDonsDechiffres(donsCompta);
  const donParId = useMemo(() => new Map(donsClairs.map((d) => [d.id, d])), [donsClairs]);
  const etatDonDe = (opId: string) =>
    etatDon(rapprochementsDons[opId], donParId.get(rapprochementsDons[opId]?.donId ?? ""), verrou).etat;
  const pastilleDon = (opId: string) => (
    <PastilleDon
      operationId={opId}
      exerciceId={exerciceId}
      rapprochement={rapprochementsDons[opId]}
      don={donParId.get(rapprochementsDons[opId]?.donId ?? "")}
      verrou={verrou}
    />
  );
  // Montant flèché vers les frais de scolarité, par opération.
  const affecteParOperation = new Map<string, number>();
  for (const a of affectations) {
    affecteParOperation.set(a.operation_id, (affecteParOperation.get(a.operation_id) ?? 0) + Number(a.montant));
  }
  const [modeEdition, setModeEdition] = useState(false);
  // Filtre par catégories : vide = toutes. « __sans__ » vise les non catégorisées.
  const [filtreCats, setFiltreCats] = useState<string[]>([]);
  // Filtre « à vérifier » : ne garde que les lignes portant une question ouverte.
  const [filtreAVerifier, setFiltreAVerifier] = useState(false);
  // Filtre « dons à régulariser » : écritures Don non reliées ou à fiche incomplète.
  const [filtreDons, setFiltreDons] = useState(false);
  // Recherche libre : tous les mots doivent figurer dans la ligne ou l'une de ses sous-écritures.
  const [recherche, setRecherche] = useState("");
  // Libellés des opérations « Don », déchiffrés coffre ouvert : on peut
  // rechercher un donateur sans que son nom soit jamais stocké en clair.
  const [libellesDons, setLibellesDons] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!coffre.estOuvert) return;
    let annule = false;
    (async () => {
      const m = new Map<string, string>();
      for (const o of operations) {
        if (!o.libelle_origine_chiffre) continue;
        const t = texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre));
        if (t) m.set(o.id, t);
      }
      if (!annule) setLibellesDons(m);
    })();
    return () => {
      annule = true;
    };
  }, [operations, coffre.estOuvert, coffre.dechiffrer]);
  // Ouverture des volets : `ouverture` ne retient que les choix explicites de
  // l'utilisateur ; par défaut, une ligne dont des dons restent à rattacher
  // s'ouvre d'elle-même.
  const [ouverture, setOuverture] = useState<Record<string, boolean>>({});
  // Volet d'informations : `epingle` distingue l'ouverture au clic (fugace) de
  // celle par le bouton ⓘ (persistante).
  const [detail, setDetail] = useState<{ id: string; epingle: boolean } | null>(null);
  const [restaurees, setRestaurees] = useState<string[]>([]);
  const [annulation, setAnnulation] = useState<string | null>(null);
  const [edit, setEdit] = useState<OperationRow | null>(null);
  const [f, setF] = useState<FormState>(() => formDepuis(operations[0] ?? ({} as OperationRow)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  function ouvrir(op: OperationRow) {
    setError(null);
    const base = formDepuis(op);
    setF({ ...base, exercice_id: base.exercice_id || exerciceId || "" });
    setEdit(op);
  }

  // L'exercice d'affectation prime sur la date : on autorise l'écart, on le signale.
  const exerciceChoisi = exercices.find((e) => e.id === f.exercice_id) ?? null;
  const dateHorsExercice =
    !!exerciceChoisi &&
    !!f.date_operation &&
    (f.date_operation < exerciceChoisi.date_debut || f.date_operation > exerciceChoisi.date_fin);

  // Les sous-écritures ne figurent pas dans la liste : elles s'affichent sous
  // leur ligne bancaire, une fois celle-ci dépliée.
  const fillesDe = new Map<string, OperationRow[]>();
  for (const op of operations) {
    if (!op.parent_id) continue;
    fillesDe.set(op.parent_id, [...(fillesDe.get(op.parent_id) ?? []), op]);
  }
  const racines = operations.filter((op) => !op.parent_id);

  /** Question ouverte sur la ligne ou sur l'une de ses sous-écritures. */
  const questionDe = (op: OperationRow): string | null =>
    op.a_verifier ||
    (fillesDe.get(op.id) ?? []).map((fi) => fi.a_verifier).find((q): q is string => !!q) ||
    null;
  const nbAVerifier = racines.filter((op) => questionDe(op)).length;

  /** Une écriture « Don » (la ligne ou l'une de ses sous-écritures) reste à régulariser. */
  const aRegulariser = (o: OperationRow) =>
    o.categories?.nom === "Don" && !o.est_ventilee && !["complet", "relie_verrouille"].includes(etatDonDe(o.id));
  const donARegulariser = (op: OperationRow) =>
    aRegulariser(op) || (fillesDe.get(op.id) ?? []).some((fi) => fi.exercice_id === exerciceId && aRegulariser(fi));
  const nbDonsARegulariser = racines.filter(donARegulariser).length;

  const parCategorie =
    filtreCats.length === 0
      ? racines
      : racines.filter((op) => {
          // Une ligne détaillée est retenue si l'une de ses filles l'est.
          if ((fillesDe.get(op.id) ?? []).length > 0) {
            return (fillesDe.get(op.id) ?? []).some((fi) =>
              filtreCats.includes(fi.categorie_id ?? "__sans__"),
            );
          }
          return filtreCats.includes(op.categorie_id ?? "__sans__");
        });
  // Recherche : libellés (Préau, banque, donateur déchiffré), catégorie, mode,
  // compte, date, question ouverte ; un mot en forme de montant vise aussi le
  // montant exact de la ligne ou d'une sous-écriture.
  const motsRecherche = normaliser(recherche).split(/\s+/).filter(Boolean);
  const texteDe = (o: OperationRow) =>
    normaliser(
      [
        o.libelle,
        o.libelle_origine,
        // Coffre refermé : les noms déchiffrés ne sont plus cherchés.
        coffre.estOuvert ? libellesDons.get(o.id) : null,
        o.categories?.nom,
        MODES.find((m) => m.v === o.mode_paiement)?.l,
        o.comptes?.nom,
        formatDate(o.date_operation),
        o.a_verifier,
      ]
        .filter(Boolean)
        .join(" "),
    );
  const correspondent = (ecritures: OperationRow[]) => {
    if (motsRecherche.length === 0) return true;
    const texte = ecritures.map(texteDe).join(" ");
    return motsRecherche.every((mot) => {
      const m = montantDe(mot);
      if (m != null && ecritures.some((e) => Math.abs(Number(e.montant) - m) < 0.005)) return true;
      return texte.includes(mot);
    });
  };
  const correspondRecherche = (op: OperationRow) => correspondent([op, ...(fillesDe.get(op.id) ?? [])]);
  /** Trouvée grâce à ses seules sous-écritures : on la déplie pour les montrer. */
  const trouveeParSesFilles = (opId: string) => {
    const op = racines.find((o) => o.id === opId);
    return motsRecherche.length > 0 && !!op && !correspondent([op]) && (fillesDe.get(opId) ?? []).length > 0;
  };
  const operationsAffichees = parCategorie
    .filter((op) => !filtreAVerifier || questionDe(op))
    .filter((op) => !filtreDons || donARegulariser(op))
    .filter(correspondRecherche);
  const totalAffiche = operationsAffichees.reduce(
    (s, op) => s + (op.type === "recette" ? 1 : -1) * Number(op.montant),
    0,
  );

  const estVentilee = !!edit && ((fillesDe.get(edit.id) ?? []).length > 0 || edit.est_ventilee);
  /**
   * La date sort-elle des bornes de l'exercice CONSULTÉ ? On compare à
   * l'exercice affiché et non à celui de l'opération : c'est bien « cette date
   * ne tombe pas dans l'exercice que je regarde » que l'on veut signaler, y
   * compris sur une ligne ventilée.
   */
  const exerciceCourant = exercices.find((e) => e.id === exerciceId) ?? null;
  const dateHorsBornes = (op: OperationRow) =>
    !!exerciceCourant &&
    (op.date_operation < exerciceCourant.date_debut || op.date_operation > exerciceCourant.date_fin);

  /** Sous-écritures retenues dans l'exercice affiché. */
  const fillesRetenues = (opId: string) =>
    (fillesDe.get(opId) ?? []).filter((fi) => fi.exercice_id === exerciceId);

  /** Sous-écritures « Don » de cette ligne qui ne sont pas encore dans l'onglet Dons. */
  const donsARattacher = (opId: string) =>
    (fillesDe.get(opId) ?? []).filter(
      (fi) => fi.categories?.nom === "Don" && !donsRepertoriesSet.has(fi.id),
    ).length;

  const estOuverte = (opId: string) =>
    ouverture[opId] ?? (donsARattacher(opId) > 0 || trouveeParSesFilles(opId));
  const basculer = (opId: string) =>
    setOuverture((p) => ({ ...p, [opId]: !estOuverte(opId) }));

  const categorieChoisie = categories.find((c) => c.id === f.categorie_id) ?? null;
  const estDonAssociation = categorieChoisie?.nom === CAT_DON_ASSOCIATION;
  // Une écriture de scolarité non ventilée se rattache à une famille ici ; ses
  // sous-écritures, elles, se rattachent depuis le volet de ventilation.
  const estScolarite = estCategorieScolarite(categorieChoisie?.nom);


  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setError(null);

    const montantTotal = Number(f.montant);
    if (!f.libelle.trim()) return setError("Le libellé est obligatoire.");
    if (!Number.isFinite(montantTotal) || montantTotal <= 0) return setError("Montant invalide.");

    // Une opération reliée à un don qui quitte la catégorie « Don » libère ce
    // don (la base rompt le lien) : on le fait confirmer.
    const catDon = categories.find((c) => c.nom === "Don")?.id;
    if (
      rapprochementsDons[edit.id]?.lien === "explicite" &&
      edit.categorie_id === catDon &&
      (f.categorie_id || null) !== catDon &&
      !window.confirm(
        "Cette opération est reliée à un don de l'onglet Dons. En changeant sa catégorie, le don sera délié (il restera dans l'onglet Dons, à relier ailleurs ou à supprimer). Continuer ?",
      )
    ) {
      return;
    }

    setSaving(true);
    const supabase = createClient();
    // Opération « Don » : libellé neutre ; le libellé saisi rejoint les
    // libellés d'origine chiffrés (coffre ouvert), jamais en clair.
    let libelles: { libelle: string; libelle_origine?: string | null; libelle_origine_chiffre?: string } = {
      libelle: f.libelle.trim(),
    };
    if ((f.categorie_id || null) === catDon && coffre.estOuvert && (f.libelle.trim() !== LIBELLE_DON || edit.libelle_origine)) {
      const avant = await dechiffrerLibellesDon(coffre.dechiffrer, edit.libelle_origine_chiffre ?? null);
      libelles = {
        libelle: LIBELLE_DON,
        libelle_origine: null,
        libelle_origine_chiffre: await chiffrerLibellesDon(coffre.chiffrer, {
          brut: edit.libelle_origine ?? avant?.brut ?? null,
          libelle: f.libelle.trim() !== LIBELLE_DON ? f.libelle.trim() : (avant?.libelle ?? null),
        }),
      };
    }
    const champs = {
      date_operation: f.date_operation,
      ...libelles,
      type: f.type,
      compte_id: f.compte_id || null,
      mode_paiement: f.mode_paiement || null,
      exercice_id: f.exercice_id || null,
      montant: montantTotal,
      categorie_id: f.categorie_id || null,
      a_verifier: f.a_verifier.trim() || null,
    };

    const { error: err } = await supabase.from("operations").update(champs).eq("id", edit.id);
    if (err) {
      setSaving(false);
      return setError("Enregistrement impossible : " + err.message);
    }

    // Consigné pour pouvoir revenir en arrière.
    await journaliser(supabase, nouveauLot(), `Modification de « ${edit.libelle} »`, [
      {
        operation_id: edit.id,
        action: "modification",
        avant: extraire(edit as unknown as OperationJournalisable),
        apres: extraire({ ...edit, ...champs } as unknown as OperationJournalisable),
      },
    ]);

    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function annuler() {
    setAnnulation(null);
    setSaving(true);
    const r = await annulerDernierLot(createClient());
    setSaving(false);
    setAnnulation(r.message);
    if (r.ok) {
      setRestaurees(r.restaurees);
      router.refresh();
      // La surbrillance s'estompe d'elle-même.
      setTimeout(() => setRestaurees([]), 8000);
    }
  }


  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setRecherche("")}
              placeholder="Rechercher : libellé, famille, montant, date…"
              title={
                "Tous les mots doivent figurer dans l'opération ou l'une de ses sous-écritures : libellé Préau ou bancaire, catégorie, mode, compte, date (jj/mm/aaaa)." +
                "\nUn nombre (« 60 », « 430,50 ») retrouve aussi le montant exact." +
                (coffre.estOuvert ? "\nCoffre ouvert : les noms des donateurs sont aussi cherchés." : "\nCoffre verrouillé : les noms des donateurs ne sont pas cherchés.")
              }
              className={`w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-accent ${
                motsRecherche.length > 0 ? "border-accent" : "border-border"
              }`}
            />
          </div>
          {motsRecherche.length > 0 && (
            <span className="text-xs text-muted tabular-nums">
              {operationsAffichees.length} opération{operationsAffichees.length > 1 ? "s" : ""} · solde{" "}
              {formatEuros(totalAffiche)}
            </span>
          )}
          {annulation && <span className="text-sm text-muted">{annulation}</span>}
        </div>
        <button
          type="button"
          onClick={annuler}
          disabled={saving}
          title="Revenir sur le dernier geste enregistré"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          ↩ Annuler la dernière modification
        </button>
        <button
          type="button"
          onClick={() => setModeEdition((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium ${
            modeEdition ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"
          }`}
        >
          {modeEdition ? "✓ Mode modification actif" : "✏️ Mode modification"}
        </button>
      </div>

      <ChiffrerLibellesDons />

      {(nbAVerifier > 0 || nbDonsARegulariser > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {nbAVerifier > 0 && (
          <button
            type="button"
            onClick={() => setFiltreAVerifier((v) => !v)}
            title="Lignes portant une question ouverte (en ambre dans le tableau)"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filtreAVerifier
                ? "border-gold bg-gold text-white"
                : "border-gold/60 bg-gold-soft text-gold hover:opacity-90"
            }`}
          >
            ⚠ À vérifier <span className="opacity-70">{nbAVerifier}</span>
          </button>
          )}
          {nbDonsARegulariser > 0 && (
            <button
              type="button"
              onClick={() => setFiltreDons((v) => !v)}
              title="Dons non reliés à l'onglet Dons, ou reliés à une fiche donateur incomplète"
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filtreDons
                  ? "border-gold bg-gold text-white"
                  : "border-gold/60 bg-gold-soft text-gold hover:opacity-90"
              }`}
            >
              Dons à régulariser <span className="opacity-70">{nbDonsARegulariser}</span>
            </button>
          )}
          {(filtreAVerifier || filtreDons) && (
            <span className="text-xs text-muted">
              Seules les lignes {filtreAVerifier ? "à vérifier" : ""}
              {filtreAVerifier && filtreDons ? " et " : ""}
              {filtreDons ? "portant un don à régulariser" : ""} sont affichées.
              {filtreDons && verrou ? " Coffre verrouillé : seuls les dons non reliés sont repérés." : ""}
            </span>
          )}
        </div>
      )}

      <details className="mb-3 rounded-xl border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Filtrer par catégorie
          {filtreCats.length > 0 && (
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {filtreCats.length} sélectionnée{filtreCats.length > 1 ? "s" : ""} ·{" "}
              {operationsAffichees.length} opération{operationsAffichees.length > 1 ? "s" : ""} ·{" "}
              {formatEuros(totalAffiche)}
            </span>
          )}
        </summary>

        {(["recette", "depense"] as const).map((sens) => {
          const lignes = [
            ...(sens === "recette"
              ? [{ id: "__sans__", nom: "non catégorisées", type: "recette" as const }]
              : []),
            ...categories.filter((c) => c.type === sens),
          ].filter((c) => operations.some((op) => (op.categorie_id ?? "__sans__") === c.id));
          if (lignes.length === 0) return null;

          return (
            <div key={sens} className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-1 w-16 shrink-0 text-xs font-medium text-muted">
                {sens === "recette" ? "Recettes" : "Dépenses"}
              </span>
              {lignes.map((c) => {
                const actif = filtreCats.includes(c.id);
                const nb = operations.filter((op) => (op.categorie_id ?? "__sans__") === c.id).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setFiltreCats((p) => (actif ? p.filter((x) => x !== c.id) : [...p, c.id]))
                    }
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    {c.nom} <span className="opacity-60">{nb}</span>
                  </button>
                );
              })}
            </div>
          );
        })}

        {filtreCats.length > 0 && (
          <button
            type="button"
            onClick={() => setFiltreCats([])}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Tout afficher
          </button>
        )}
      </details>

      {modeEdition && (
        <p className="mb-3 text-xs text-muted">
          Cliquez sur une ligne pour l&apos;éditer. Depuis l&apos;édition, vous pouvez aussi la scinder en
          deux catégories.
        </p>
      )}

      <div className="relative pl-7">
        <div className="rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Libellé</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody>
            {operationsAffichees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted">
                  {operations.length === 0 ? (
                    <>
                      Aucune opération pour l&apos;instant.
                      <br />
                      <span className="text-sm">Cliquez sur « Nouvelle opération » pour commencer la saisie.</span>
                    </>
                  ) : motsRecherche.length > 0 ? (
                    <>
                      Aucune opération ne correspond à « {recherche.trim()} ».
                      <br />
                      <button type="button" onClick={() => setRecherche("")} className="text-sm text-accent hover:underline">
                        Effacer la recherche
                      </button>
                    </>
                  ) : (
                    <>
                      Aucune opération dans les catégories sélectionnées.
                      <br />
                      <span className="text-sm">Élargissez le filtre ci-dessus.</span>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              operationsAffichees.flatMap((op) => [
                <tr
                  key={op.id}
                  onClick={() =>
                    modeEdition
                      ? ouvrir(op)
                      : setDetail((d) =>
                          d?.id === op.id && !d.epingle ? null : { id: op.id, epingle: false },
                        )
                  }
                  className={`cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-surface-2 ${
                    restaurees.includes(op.id)
                      ? "bg-positive/10 ring-1 ring-inset ring-positive/40"
                      : questionDe(op)
                        ? "bg-gold-soft/60"
                        : ""
                  }`}
                >
                  <td className="relative w-[132px] px-4 py-3 whitespace-nowrap tabular-nums">
                    {(op.est_ventilee || (fillesDe.get(op.id) ?? []).length > 0 || modeEdition) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          basculer(op.id);
                        }}
                        title={op.est_ventilee ? "Voir les sous-écritures" : "Ventiler cette ligne"}
                        className={`absolute top-1/2 -left-7 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-base leading-none hover:bg-surface-2 ${
                          op.est_ventilee ? "text-accent" : "text-muted/50"
                        }`}
                      >
                        <span className={`transition-transform ${estOuverte(op.id) ? "rotate-90" : ""}`}>›</span>
                      </button>
                    )}
                    {formatDate(op.date_operation)}
                    {/* Créneau d'icône toujours présent : aucune colonne ne se décale. */}
                    <span
                      className="ml-1 inline-block w-4 align-[-2px]"
                      title={dateHorsBornes(op) ? "Date hors des bornes de l'exercice" : undefined}
                    >
                      {dateHorsBornes(op) && <Icon name="calendrier-alerte" className="h-4 w-4 text-gold" />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center">
                      {op.libelle}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetail((d) =>
                            d?.id === op.id && d.epingle ? null : { id: op.id, epingle: true },
                          );
                        }}
                        aria-label="Informations complémentaires"
                        title="Épingler les informations complémentaires"
                        className={`ml-1.5 inline-flex ${
                          detail?.id === op.id && detail.epingle ? "text-accent" : "text-muted/70 hover:text-accent"
                        }`}
                      >
                        <Icon name="info" className="h-4 w-4" />
                      </button>
                      {questionDe(op) && (
                        <span
                          className="ml-2 max-w-[260px] truncate rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold"
                          title={questionDe(op) ?? undefined}
                        >
                          ⚠ {questionDe(op)}
                        </span>
                      )}
                      {!modeEdition && !op.est_ventilee && (fillesDe.get(op.id) ?? []).length === 0 &&
                        op.categories?.nom === "Don" &&
                        pastilleDon(op.id)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {op.est_ventilee
                      ? // Les catégories des seules sous-écritures retenues ici.
                        [...new Set(fillesRetenues(op.id).map((fi) => fi.categories?.nom ?? "— à classer —"))]
                          .join(", ") || "—"
                      : (op.categories?.nom ?? "—")}
                    {affecteParOperation.has(op.id) && (
                      <span
                        className="ml-2 whitespace-nowrap rounded-full bg-jauge/10 px-2 py-0.5 text-[11px] font-medium text-jauge dark:bg-jauge/15"
                        title={`${formatEuros(affecteParOperation.get(op.id) ?? 0)} fléchés vers des frais de scolarité`}
                      >
                        → scolarité
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted capitalize">{op.mode_paiement ?? "—"}</td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium ${
                      op.type === "recette" ? "text-positive" : "text-negative"
                    }`}
                  >
                    {op.type === "recette" ? "+" : "−"}
                    {/* Ligne ventilée : seule la part de l'exercice affiché est portée. */}
                    {formatEuros(
                      op.est_ventilee
                        ? fillesRetenues(op.id).reduce((s, fi) => s + Number(fi.montant), 0)
                        : Number(op.montant),
                    )}
                  </td>
                </tr>,
                detail?.id === op.id && (
                  <VoletDetail
                    key={`${op.id}-detail`}
                    colSpan={5}
                    epingle={detail.epingle}
                    onFermer={() => setDetail(null)}
                    op={{
                      libelle: op.libelle,
                      libelle_origine: op.libelle_origine,
                      libelle_origine_chiffre: op.libelle_origine_chiffre,
                      date_operation: op.date_operation,
                      montant: Number(op.montant),
                      type: op.type,
                      categorie: op.categories?.nom ?? null,
                      mode_paiement: op.mode_paiement,
                      compte: op.comptes?.nom ?? null,
                    }}
                  />
                ),
                estOuverte(op.id) && (
                  <VentilationOperation
                    key={`${op.id}-ventilation`}
                    mere={op as unknown as OperationVentilable}
                    filles={(fillesDe.get(op.id) ?? []) as unknown as OperationVentilable[]}
                    categories={categories}
                    exercices={exercices}
                    exerciceAffiche={exerciceId}
                    modifiable={modeEdition}
                    donsRepertories={donsRepertories}
                    pastilleDon={pastilleDon}
                    inscriptions={inscriptions}
                    affectations={affectations}
                  />
                ),
              ])
            )}
          </tbody>
        </table>
        </div>
      </div>

      {edit && (
        <Modal title="Modifier l'opération" onClose={() => setEdit(null)}>
          <form onSubmit={enregistrer} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("type", "recette")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.type === "recette" ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
              >
                Recette
              </button>
              <button
                type="button"
                onClick={() => set("type", "depense")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.type === "depense" ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
              >
                Dépense
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" value={f.date_operation} onChange={(e) => set("date_operation", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Montant">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={f.montant}
                  onChange={(e) => set("montant", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Libellé">
              <input
                type="text"
                value={f.libelle}
                onChange={(e) => set("libelle", e.target.value)}
                className={inputCls}
                title={edit.libelle_origine ? `Libellé bancaire d'origine : ${edit.libelle_origine}` : undefined}
              />
            </Field>
            {edit.libelle_origine && edit.libelle_origine !== f.libelle && (
              <p className="-mt-2 text-xs text-muted">Banque : {edit.libelle_origine}</p>
            )}

            <Field label={estVentilee ? "Catégorie (facultative — la ligne est ventilée)" : "Catégorie"}>
              <select value={f.categorie_id} onChange={(e) => set("categorie_id", e.target.value)} className={inputCls}>
                <option value="">— à classer —</option>
                {categories.filter((c) => c.type === f.type).map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Compte">
                <select value={f.compte_id} onChange={(e) => set("compte_id", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mode de paiement">
                <select value={f.mode_paiement} onChange={(e) => set("mode_paiement", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {MODES.map((m) => (
                    <option key={m.v} value={m.v}>{m.l}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Exercice d'affectation">
              <select value={f.exercice_id} onChange={(e) => set("exercice_id", e.target.value)} className={inputCls}>
                <option value="">— aucun —</option>
                {exercices.map((e) => (
                  <option key={e.id} value={e.id}>{e.libelle}</option>
                ))}
              </select>
            </Field>
            {dateHorsExercice && exerciceChoisi && (
              <p className="-mt-2 rounded-lg bg-gold-soft/50 px-3 py-2 text-xs text-gold">
                ⚠️ La date du {formatDate(f.date_operation)} est en dehors de {exerciceChoisi.libelle}. C&apos;est
                volontaire : l&apos;exercice choisi ici fait foi pour le bilan, pas la date.
              </p>
            )}

            <Field label="À vérifier (question ouverte — vider pour lever l'alerte)">
              <input
                type="text"
                value={f.a_verifier}
                onChange={(e) => set("a_verifier", e.target.value)}
                placeholder="ex. frais de dossier ou vente ?"
                className={inputCls}
              />
            </Field>

            {(estDonAssociation || (estScolarite && !estVentilee)) && (
              <AffectationScolarite
                operationId={edit.id}
                montantOperation={Number(f.montant) || Number(edit.montant)}
                inscriptions={inscriptions}
                affectations={affectations}
                libelleExercice={exerciceChoisi?.libelle ?? null}
                mode={estDonAssociation ? "don" : "scolarite"}
                categorie={categorieChoisie?.nom ?? null}
              />
            )}

            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {estVentilee
                ? "Cette ligne est détaillée en sous-écritures : ce sont leurs catégories qui alimentent les bilans. La catégorie ci-dessus peut rester vide."
                : "Pour répartir cette ligne sur plusieurs catégories, fermez cette fenêtre et dépliez la ligne dans le tableau : la ventilation s'y fait en sous-écritures, sans dédoubler l'écriture bancaire."}
            </p>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}
