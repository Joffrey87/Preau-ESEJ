"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";
import Link from "next/link";
import { formatEuros } from "@/lib/format";
import Icon from "@/components/Icon";
import {
  journaliser,
  nouveauLot,
  extraire,
  type OperationJournalisable,
} from "@/lib/journalOperations";
import AffectationScolarite, {
  estCategorieScolarite,
  type Affectation,
  type Inscription,
} from "@/components/AffectationScolarite";
import { libelleNature } from "@/lib/scolariteDepots";
import { useCoffre } from "@/components/CoffreProvider";
import { LIBELLE_DON, chiffrerLibellesDon } from "@/lib/libelleDon";
import { SuggestionsVentilation } from "@/components/LiaisonDons";
import { propositionsVentilation, type Proposition } from "@/lib/liaisonDons";
import { nomDonateur } from "@/lib/statutDon";
import type { DonCompta } from "@/components/PastilleDon";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string };

export type OperationVentilable = {
  id: string;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  montant: number;
  type: "recette" | "depense";
  categorie_id: string | null;
  compte_id: string | null;
  exercice_id: string | null;
  mode_paiement: string | null;
  parent_id: string | null;
  est_ventilee: boolean;
  categories?: { nom: string } | null;
};

/**
 * Volet de ventilation d'une ligne bancaire.
 *
 * La ligne du relevé (la mère) reste unique dans la comptabilité, avec son
 * montant d'origine. Elle est détaillée en sous-écritures (les filles), chacune
 * avec sa propre catégorie. Seules les filles entrent dans les totaux : la mère
 * en sort dès qu'elle est ventilée, sans quoi les montants seraient comptés deux
 * fois.
 */
export default function VentilationOperation({
  mere,
  filles,
  categories,
  exercices,
  estRetenue,
  modifiable,
  donsRepertories = [],
  pastilleDon,
  inscriptions = [],
  affectations = [],
  onModifier,
  donsLibres = [],
  texteDe,
  verrou = false,
}: {
  mere: OperationVentilable;
  filles: OperationVentilable[];
  categories: Categorie[];
  exercices: Exercice[];
  /** Sélection consultée (exercices ou années) : les sous-écritures qui n'en relèvent pas sont écartées. */
  estRetenue: (f: { exercice_id: string | null; date_operation: string }) => boolean;
  /** Hors mode modification, le volet est en lecture seule. */
  modifiable: boolean;
  /** Sous-écritures déjà présentes dans l'onglet Dons. */
  donsRepertories?: string[];
  /** Pastille « don » détaillée (relié, fiche complète…) ; à défaut, simple coche. */
  pastilleDon?: (operationId: string) => React.ReactNode;
  /** Familles de l'onglet Frais de scolarité, pour rattacher une sous-écriture de scolarité. */
  inscriptions?: Inscription[];
  affectations?: Affectation[];
  /** Ouvre la fenêtre « Modifier l'opération » sur une sous-écriture. */
  onModifier?: (operationId: string) => void;
  /** Dons « hors compta » (non reliés à une écriture), déchiffrés si le coffre est ouvert. */
  donsLibres?: DonCompta[];
  /** Libellés (bancaire, saisi) d'une écriture, déchiffrés : de quoi retrouver le nom du donateur. */
  texteDe?: (operationId: string) => string | null;
  /** Coffre fermé : les noms des donateurs ne sont pas lisibles. */
  verrou?: boolean;
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const [categorieId, setCategorieId] = useState("");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [exerciceId, setExerciceId] = useState(mere.exercice_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Number(mere.montant);
  const ventile = filles.reduce((s, f) => s + Number(f.montant), 0);
  const reste = total - ventile;
  const equilibre = Math.abs(reste) < 0.005;

  const texteMere = [texteDe?.(mere.id) ?? null, mere.libelle_origine, ...filles.map((f) => texteDe?.(f.id) ?? null)]
    .filter(Boolean)
    .join(" ");
  const propositions = useMemo(
    () =>
      modifiable && mere.type === "recette" && reste > 0.005
        ? propositionsVentilation({ date: mere.date_operation, montant: reste, texte: texteMere || null }, donsLibres)
        : [],
    [modifiable, mere.type, mere.date_operation, reste, texteMere, donsLibres],
  );
  const catsDuSens = categories.filter((c) => c.type === mere.type);
  const nomCat = (id: string | null) =>
    categories.find((c) => c.id === id)?.nom ?? "— à classer —";
  const nomExo = (id: string | null) =>
    exercices.find((e) => e.id === id)?.libelle.replace("Exercice ", "") ?? "aucun";

  /** Une sous-écriture hors de la sélection affichée n'est pas comptée ici. */
  const retenue = (f: OperationVentilable) => estRetenue(f);

  // Rattachement d'une sous-écriture de scolarité à une famille (mensualité,
  // mois d'avance, frais de dossier) : résumé en lecture, formulaire en mode
  // modification.
  const estScolarite = (f: OperationVentilable) => estCategorieScolarite(nomCat(f.categorie_id));
  const affectationsDe = (f: OperationVentilable) => affectations.filter((a) => a.operation_id === f.id);
  const nomFamille = (id: string) => {
    const i = inscriptions.find((x) => x.id === id);
    return i ? `${i.famille_nom} · ${i.annee_scolaire}` : "famille inconnue";
  };

  async function ajouterFille() {
    setError(null);
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) return setError("Montant invalide.");
    if (m > reste + 0.005) {
      return setError(`Il ne reste que ${formatEuros(reste)} à ventiler.`);
    }
    if (!categorieId) return setError("Choisissez une catégorie pour la sous-écriture.");

    setBusy(true);
    const supabase = createClient();
    const lot = nouveauLot();

    // Sous-écriture « Don » : libellé neutre, le libellé saisi (souvent le nom
    // du tireur) chiffré avec le coffre ; jamais de nom en clair.
    const estDon = nomCat(categorieId) === "Don";
    if (estDon && libelle.trim() && !coffre.estOuvert) {
      setBusy(false);
      return setError("Déverrouillez le coffre pour enregistrer le nom saisi (chiffré), ou laissez le libellé vide.");
    }
    const libelles = estDon
      ? {
          libelle: LIBELLE_DON,
          libelle_origine: coffre.estOuvert ? null : mere.libelle_origine,
          libelle_origine_chiffre: coffre.estOuvert
            ? await chiffrerLibellesDon(coffre.chiffrer, { brut: mere.libelle_origine, libelle: libelle.trim() || null })
            : null,
        }
      : {
          libelle: libelle.trim() || `${mere.libelle} — ${nomCat(categorieId)}`,
          libelle_origine: mere.libelle_origine,
          libelle_origine_chiffre: null as string | null,
        };

    const fille = {
      date_operation: mere.date_operation,
      ...libelles,
      montant: m,
      type: mere.type,
      categorie_id: categorieId,
      compte_id: mere.compte_id,
      exercice_id: exerciceId || mere.exercice_id,
      mode_paiement: mere.mode_paiement,
      parent_id: mere.id,
      est_ventilee: false,
    };

    const { data: creee, error: err } = await supabase
      .from("operations")
      .insert(fille)
      .select()
      .single();
    if (err || !creee) {
      setBusy(false);
      return setError("Ajout impossible : " + (err?.message ?? "inconnu"));
    }

    const entrees: Parameters<typeof journaliser>[3] = [
      { operation_id: (creee as { id: string }).id, action: "creation", apres: extraire(creee) },
    ];

    // Un don relié à la ligne bancaire suit la sous-écriture « Don » de même montant.
    if (nomCat(categorieId) === "Don") {
      await supabase.from("dons").update({ operation_id: (creee as { id: string }).id })
        .eq("operation_id", mere.id).eq("montant", m).is("supprime_le", null);
    }

    // La mère devient ventilée dès la première fille : elle sort des totaux.
    if (!mere.est_ventilee) {
      await supabase.from("operations").update({ est_ventilee: true }).eq("id", mere.id);
      entrees.push({
        operation_id: mere.id,
        action: "modification",
        avant: extraire(mere as unknown as OperationJournalisable),
        apres: extraire({ ...mere, est_ventilee: true } as unknown as OperationJournalisable),
      });
    }

    await journaliser(supabase, lot, `Sous-écriture ajoutée à « ${mere.libelle} »`, entrees);

    setBusy(false);
    setCategorieId("");
    setMontant("");
    setLibelle("");
    setExerciceId(mere.exercice_id ?? "");
    router.refresh();
  }

  async function retirerFille(f: OperationVentilable) {
    setError(null);
    // Une sous-écriture reliée à un don : la supprimer délie le don.
    const { count } = await createClient()
      .from("dons")
      .select("id", { count: "exact", head: true })
      .eq("operation_id", f.id)
      .is("supprime_le", null);
    if (
      (count ?? 0) > 0 &&
      !window.confirm(
        "Cette sous-écriture est reliée à un don de l'onglet Dons. La supprimer déliera le don (il restera dans l'onglet Dons). Continuer ?",
      )
    ) {
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const lot = nouveauLot();

    const entrees: Parameters<typeof journaliser>[3] = [
      { operation_id: f.id, action: "suppression", avant: extraire(f as unknown as OperationJournalisable) },
    ];

    const { error: err } = await supabase.from("operations").delete().eq("id", f.id);
    if (err) {
      setBusy(false);
      return setError("Suppression impossible : " + err.message);
    }

    // Plus aucune fille → la mère redevient une écriture ordinaire.
    if (filles.length === 1) {
      await supabase.from("operations").update({ est_ventilee: false }).eq("id", mere.id);
      entrees.push({
        operation_id: mere.id,
        action: "modification",
        avant: extraire(mere as unknown as OperationJournalisable),
        apres: extraire({ ...mere, est_ventilee: false } as unknown as OperationJournalisable),
      });
    }

    await journaliser(supabase, lot, `Sous-écriture retirée de « ${mere.libelle} »`, entrees);
    setBusy(false);
    router.refresh();
  }

  /**
   * Une ligne détaillée en une seule sous-écriture de même montant n'a rien à ventiler : on
   * supprime la sous-écriture et la ligne redevient ordinaire. Le don relié, les rattachements
   * de scolarité et la catégorie passent à la ligne.
   */
  async function annulerVentilation(f: OperationVentilable) {
    setError(null);
    if (
      !window.confirm(
        "Cette ligne n'a rien à ventiler (une seule sous-écriture, de même montant). L'annuler supprime la sous-écriture ; son don relié et sa catégorie passent à la ligne. Continuer ?",
      )
    ) {
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const lot = nouveauLot();
    const reportes = [
      supabase.from("dons").update({ operation_id: mere.id }).eq("operation_id", f.id),
      supabase.from("affectations_scolarite").update({ operation_id: mere.id }).eq("operation_id", f.id),
    ];
    for (const r of reportes) {
      const { error: err } = await r;
      if (err) {
        setBusy(false);
        return setError("Annulation impossible : " + err.message);
      }
    }
    const { error: errSup } = await supabase.from("operations").delete().eq("id", f.id);
    if (errSup) {
      setBusy(false);
      return setError("Suppression impossible : " + errSup.message);
    }
    const maj = { est_ventilee: false, categorie_id: f.categorie_id, exercice_id: f.exercice_id ?? mere.exercice_id };
    await supabase.from("operations").update(maj).eq("id", mere.id);
    await journaliser(supabase, lot, `Ventilation annulée sur « ${mere.libelle} »`, [
      { operation_id: f.id, action: "suppression", avant: extraire(f as unknown as OperationJournalisable) },
      {
        operation_id: mere.id,
        action: "modification",
        avant: extraire(mere as unknown as OperationJournalisable),
        apres: extraire({ ...mere, ...maj } as unknown as OperationJournalisable),
      },
    ]);
    setBusy(false);
    router.refresh();
  }

  /** Crée une sous-écriture « Don » par don proposé et la relie à ce don. */
  async function creerDepuisProposition(p: Proposition) {
    setError(null);
    const catDon = categories.find((c) => c.nom === "Don" && c.type === mere.type)?.id;
    if (!catDon) return setError("Catégorie « Don » introuvable.");
    if (!coffre.estOuvert) {
      return setError("Déverrouillez le coffre : les sous-écritures « Don » portent le nom du donateur, chiffré.");
    }
    if (
      !p.exacte &&
      !window.confirm(
        `Le total des dons (${formatEuros(p.somme)}) ne tombe pas juste sur ${formatEuros(reste)} (écart de ${formatEuros(Math.abs(p.ecart))}). Créer quand même ces sous-écritures ?`,
      )
    ) {
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const entrees: Parameters<typeof journaliser>[3] = [];
    for (const c of p.dons) {
      const { data: creee, error: err } = await supabase
        .from("operations")
        .insert({
          date_operation: mere.date_operation,
          libelle: LIBELLE_DON,
          libelle_origine: null,
          libelle_origine_chiffre: await chiffrerLibellesDon(coffre.chiffrer, {
            brut: mere.libelle_origine,
            libelle: nomDonateur(c.don) || null,
          }),
          montant: Number(c.don.montant),
          type: mere.type,
          categorie_id: catDon,
          compte_id: mere.compte_id,
          exercice_id: mere.exercice_id,
          mode_paiement: mere.mode_paiement,
          parent_id: mere.id,
          est_ventilee: false,
        })
        .select()
        .single();
      if (err || !creee) {
        setBusy(false);
        router.refresh();
        return setError("Ajout impossible : " + (err?.message ?? "inconnu"));
      }
      const id = (creee as { id: string }).id;
      entrees.push({ operation_id: id, action: "creation", apres: extraire(creee) });
      const maj: { operation_id: string; exercice_id?: string } = { operation_id: id };
      if (!c.don.exercice_id && mere.exercice_id) maj.exercice_id = mere.exercice_id;
      const { error: errLien } = await supabase.from("dons").update(maj).eq("id", c.don.id);
      if (errLien) setError("Sous-écriture créée, mais lien impossible : " + errLien.message);
    }
    if (!mere.est_ventilee) {
      await supabase.from("operations").update({ est_ventilee: true }).eq("id", mere.id);
      entrees.push({
        operation_id: mere.id,
        action: "modification",
        avant: extraire(mere as unknown as OperationJournalisable),
        apres: extraire({ ...mere, est_ventilee: true } as unknown as OperationJournalisable),
      });
    }
    await journaliser(supabase, nouveauLot(), `Ventilation de « ${mere.libelle} » en ${p.dons.length} don${p.dons.length > 1 ? "s" : ""} reliés`, entrees);
    setBusy(false);
    router.refresh();
  }

  /**
   * Une sous-écriture peut relever d'un autre exercice que la ligne bancaire :
   * un versement d'août peut couvrir la rentrée suivante. L'affectation est donc
   * modifiable ligne par ligne.
   */
  async function changerExercice(f: OperationVentilable, nouvel: string) {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("operations")
      .update({ exercice_id: nouvel || null })
      .eq("id", f.id);
    if (err) {
      setBusy(false);
      return setError("Changement d'exercice impossible : " + err.message);
    }
    await journaliser(supabase, nouveauLot(), `Exercice de « ${f.libelle} » modifié`, [
      {
        operation_id: f.id,
        action: "modification",
        avant: extraire(f as unknown as OperationJournalisable),
        apres: extraire({ ...f, exercice_id: nouvel || null } as unknown as OperationJournalisable),
      },
    ]);
    setBusy(false);
    router.refresh();
  }

  // Les sous-écritures sont rendues comme de vraies lignes du tableau : leurs
  // colonnes s'alignent alors exactement sur celles de la ligne bancaire.
  return (
    <>
      {filles.map((f) => (
        <tr
          key={f.id}
          className={`border-b border-border/50 bg-surface-2/30 text-sm ${
            retenue(f) ? "" : "text-muted/60"
          }`}
        >
          {/* Le marqueur d'exercice loge dans la colonne Date : les flèches de
              ventilation restent ainsi toutes alignées. */}
          <td className="w-[132px] py-1.5 text-center whitespace-nowrap">
            {!retenue(f) && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gold"
                title={`Rattachée à l'exercice ${nomExo(f.exercice_id)} : non comptée ici`}
              >
                <Icon name="calendrier-petit" className="h-3.5 w-3.5" />
                {nomExo(f.exercice_id)}
              </span>
            )}
          </td>
          <td className={`px-4 py-1.5 pl-8 ${retenue(f) ? "text-muted" : ""}`}>
            <span className="mr-1.5 text-muted/60">↳</span>
            {f.libelle}
          </td>
          <td className="px-4 py-1.5">
            {nomCat(f.categorie_id)}
            {estScolarite(f) &&
              (affectationsDe(f).length > 0 ? (
                affectationsDe(f).map((a) => (
                  <span
                    key={a.id}
                    className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                    title={`${formatEuros(Number(a.montant))} — ${libelleNature(a.nature ?? "mensualite")}`}
                  >
                    → {nomFamille(a.inscription_id)} · {libelleNature(a.nature ?? "mensualite")}
                  </span>
                ))
              ) : (
                <span
                  className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold"
                  title="Sous-écriture de scolarité sans famille : passez en mode modification pour la rattacher"
                >
                  famille ?
                </span>
              ))}
            {nomCat(f.categorie_id) === "Don" && pastilleDon && pastilleDon(f.id)}
            {nomCat(f.categorie_id) === "Don" && !pastilleDon &&
              (donsRepertories.includes(f.id) ? (
                <span className="ml-2 text-positive" title="Enregistré dans les dons">✓</span>
              ) : (
                <Link
                  href="/dons/depuis-compta"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold hover:opacity-90"
                  title="Cette sous-écriture n'est pas encore dans l'onglet Dons"
                >
                  + Ajouter aux dons
                </Link>
              ))}
          </td>
          <td className="px-4 py-1.5 text-xs">
            {modifiable ? (
              <select
                value={f.exercice_id ?? ""}
                onChange={(e) => changerExercice(f, e.target.value)}
                disabled={busy}
                onClick={(e) => e.stopPropagation()}
                title="Exercice d'affectation de cette sous-écriture"
                className="rounded-lg border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-accent"
              >
                <option value="">— aucun —</option>
                {exercices.map((e) => (
                  <option key={e.id} value={e.id}>{e.libelle.replace("Exercice ", "")}</option>
                ))}
              </select>
            ) : null}
          </td>
          <td className="px-4 py-1.5 text-right whitespace-nowrap tabular-nums">
            {formatEuros(Number(f.montant))}
            {modifiable && onModifier && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onModifier(f.id);
                }}
                disabled={busy}
                className="ml-2 text-xs text-muted hover:text-accent"
                title="Modifier cette sous-écriture (montant, libellé, catégorie…)"
              >
                ✎
              </button>
            )}
            {modifiable && (
              <button
                type="button"
                onClick={() => retirerFille(f)}
                disabled={busy}
                className="ml-2 text-xs text-muted hover:text-negative"
                title="Retirer cette sous-écriture"
              >
                ✕
              </button>
            )}
          </td>
        </tr>
      ))}

      {modifiable &&
        filles.filter(estScolarite).map((f) => (
          <tr key={`${f.id}-famille`} className="border-b border-border/50 bg-surface-2/30">
            <td className="px-4 pb-2" />
            <td colSpan={4} className="px-4 pb-2 pl-8">
              <div className="mb-1 text-xs text-muted">
                Famille pour « {f.libelle} » ({formatEuros(Number(f.montant))})
              </div>
              <AffectationScolarite
                operationId={f.id}
                montantOperation={Number(f.montant)}
                inscriptions={inscriptions}
                affectations={affectations}
                libelleExercice={exercices.find((e) => e.id === f.exercice_id)?.libelle ?? null}
                mode="scolarite"
                categorie={nomCat(f.categorie_id)}
                compact
              />
            </td>
          </tr>
        ))}

      {filles.some((f) => !retenue(f)) && (
        <tr className="border-b border-border/50 bg-surface-1/60 text-xs text-muted">
          <td className="px-4 py-1" />
          <td colSpan={3} className="px-4 py-1">Total de la ligne bancaire</td>
          <td className="px-4 py-1 text-right whitespace-nowrap tabular-nums">{formatEuros(total)}</td>
        </tr>
      )}

      {(!equilibre && filles.length > 0) || error ? (
        <tr className="border-b border-border/50 bg-surface-2/30">
          <td className="px-4 pb-1.5" />
          <td colSpan={4} className="px-4 pb-1.5">
            {!equilibre && filles.length > 0 && (
              <span className="rounded-lg bg-gold-soft px-2 py-1 text-xs font-medium text-gold">
                ⚠ Répartition ≠ montant de la ligne :{" "}
                {reste > 0
                  ? `${formatEuros(reste)} non ventilés`
                  : `dépassement de ${formatEuros(-reste)}`}
              </span>
            )}
            {error && <span className="ml-2 text-xs text-negative">{error}</span>}
          </td>
        </tr>
      ) : null}

      {modifiable && filles.length === 1 && Math.abs(Number(filles[0].montant) - total) < 0.005 && (
        <tr className="border-b border-border/50 bg-surface-2/30">
          <td className="px-4 pb-1.5" />
          <td colSpan={4} className="px-4 pb-1.5">
            <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-gold-soft px-2 py-1 text-xs text-gold">
              Ventilation inutile : une seule sous-écriture, du même montant que la ligne.
              <button
                type="button"
                onClick={() => annulerVentilation(filles[0])}
                disabled={busy}
                className="rounded bg-gold px-2 py-0.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Annuler la ventilation
              </button>
            </span>
          </td>
        </tr>
      )}

      {propositions.length > 0 && (
        <tr className="border-b border-border/50 bg-surface-2/30">
          <td className="px-4 pb-1.5" />
          <td colSpan={4} className="px-4 pb-1.5 pt-1">
            <SuggestionsVentilation propositions={propositions} verrou={verrou} busy={busy} onCreer={creerDepuisProposition} />
          </td>
        </tr>
      )}

      {modifiable && reste > 0.005 && (
        <tr className="border-b border-border/50 bg-surface-2/30">
          <td className="px-4 pb-2" />
          <td colSpan={4} className="px-4 pb-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_9rem_7rem_auto]">
              <input
                type="text"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                className={inputCls}
                placeholder="Libellé (facultatif)"
              />
              <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} className={inputCls}>
                <option value="">— catégorie —</option>
                {catsDuSens.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
              <select
                value={exerciceId}
                onChange={(e) => setExerciceId(e.target.value)}
                className={inputCls}
                title="Exercice d'affectation de cette sous-écriture"
              >
                <option value="">— exercice —</option>
                {exercices.map((e) => (
                  <option key={e.id} value={e.id}>{e.libelle.replace("Exercice ", "")}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className={inputCls}
                placeholder={reste.toFixed(2)}
                title={`Reste à ventiler : ${formatEuros(reste)}`}
              />
              <button
                type="button"
                onClick={ajouterFille}
                disabled={busy}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "…" : "Ajouter"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
