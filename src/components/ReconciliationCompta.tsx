"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, FormFooter, inputCls } from "./GestionComptes";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { formatEuros, formatDate } from "@/lib/format";
import { nomDonateur } from "@/lib/statutDon";
import { dechiffrerLibellesDon, type LibellesDon } from "@/lib/libelleDon";
import {
  extraireNom,
  donsProbables,
  identitesDonateurs,
  donateursRessemblants,
  reconnaitreDonateur,
  type OpDon,
} from "@/lib/reconciliation";
import type { Don } from "@/components/GestionDons";
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


export type Exercice = {
  id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  actif: boolean;
};

type FormState = FormDonateur;
const formDepuis = formDonateurDepuisNom;
const formDepuisDon = formDonateurDepuisDon;
const resume = resumeDonateur;
const ficheValide = ficheDonateurValide;

export default function ReconciliationCompta({
  operations,
  dons: donsInit,
  exercices,
  roleSlug = null,
}: {
  operations: OpDon[];
  dons: Don[];
  exercices: Exercice[];
  roleSlug?: string | null;
}) {
  const router = useRouter();
  const coffre = useCoffre();

  // Libellés d'origine chiffrés des opérations « Don » : relus coffre ouvert,
  // pour deviner le donateur sans jamais les stocker en clair.
  const [clairs, setClairs] = useState<Map<string, LibellesDon>>(new Map());
  useEffect(() => {
    if (!coffre.estOuvert) return;
    let annule = false;
    (async () => {
      const m = new Map<string, LibellesDon>();
      for (const op of operations) {
        const l = await dechiffrerLibellesDon(coffre.dechiffrer, op.libelle_origine_chiffre ?? null);
        if (l) m.set(op.id, l);
      }
      if (!annule) setClairs(m);
    })();
    return () => {
      annule = true;
    };
  }, [operations, coffre.estOuvert, coffre.dechiffrer]);
  const brutDe = (op: OpDon) => op.libelle_origine ?? clairs.get(op.id)?.brut ?? null;
  const libelleDe = (op: OpDon) => clairs.get(op.id)?.libelle ?? op.libelle;
  const { dons, verrou } = useDonsDechiffres(donsInit);

  const [fiches, setFiches] = useState<Record<string, FormState>>({});
  const [choisies, setChoisies] = useState<Record<string, boolean>>({});
  const [exerciceCible, setExerciceCible] = useState<string>("auto");
  const [filtreExercice, setFiltreExercice] = useState<string>("tous");
  const [edit, setEdit] = useState<OpDon | null>(null);
  const [f, setF] = useState<FormState>(formDepuis(""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const identites = useMemo(() => identitesDonateurs(dons), [dons]);

  // Relations déjà employées, proposées en suggestion.
  const relations = useMemo(() => relationsConnues(dons), [dons]);

  // Analyse de chaque opération : dons déjà enregistrés (montant+date) + nom deviné.
  const analyse = useMemo(
    () =>
      operations
        .filter((op) => filtreExercice === "tous" || op.exercice_id === filtreExercice)
        .map((op) => {
          const probables = donsProbables(op, dons);
          const nomExtrait = extraireNom(brutDe(op) ?? libelleDe(op));
          const ressemblants = donateursRessemblants(nomExtrait, identites).slice(0, 4);
          // Donateur connu dont le nom figure dans le libellé bancaire ou dans
          // le libellé saisi dans Préau : affecté d'office (doute si nom seul).
          const reconnu = reconnaitreDonateur([brutDe(op), libelleDe(op)], identites);
          return { op, probables, nomExtrait, ressemblants, reconnu };
        }),
    // brutDe / libelleDe ne dépendent que de `clairs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operations, dons, identites, filtreExercice, clairs],
  );
  const reconnus = useMemo(
    () =>
      new Map(
        analyse
          .filter((a) => a.reconnu?.candidats.length === 1)
          .map((a) => [a.op.id, { fiche: formDepuisDon(a.reconnu!.candidats[0].exemple), certain: a.reconnu!.certain }]),
      ),
    [analyse],
  );

  // Les deux états ne contiennent que les MODIFICATIONS de l'utilisateur ; la
  // valeur par défaut est dérivée de l'analyse à chaque rendu.
  const ficheDe = (opId: string, nomExtrait: string): FormState =>
    fiches[opId] ?? reconnus.get(opId)?.fiche ?? formDepuis(nomExtrait);
  const estChoisie = (opId: string, nouvelle: boolean): boolean => choisies[opId] ?? nouvelle;

  /** Exercice couvrant une date, ou null. */
  const exercicePourDate = useMemo(() => {
    const tries = [...exercices].sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    return (d: string) => tries.find((e) => d >= e.date_debut && d <= e.date_fin) ?? null;
  }, [exercices]);

  const exerciceDe = (op: OpDon): Exercice | null =>
    exerciceCible === "auto"
      ? exercicePourDate(op.date_operation)
      : (exercices.find((e) => e.id === exerciceCible) ?? null);

  // Coffre requis ouvert (on crée des dons chiffrés — décision « on fait propre »).
  if (coffre.estConfigure && !coffre.estOuvert) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-center text-sm">
        <p className="text-gold">🔒 Déverrouillez le coffre pour rapprocher et importer les dons (ils seront chiffrés).</p>
        <div className="mt-3 flex justify-center">
          <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
        </div>
      </div>
    );
  }

  function ouvrir(op: OpDon, nomExtrait: string, base?: Don) {
    setError(null);
    setF(base ? formDepuisDon(base) : ficheDe(op.id, nomExtrait));
    setEdit(op);
  }

  async function lier(op: OpDon, don: Don) {
    const maj: { operation_id: string; exercice_id?: string } = { operation_id: op.id };
    const ex = exerciceDe(op);
    if (ex && !don.exercice_id) maj.exercice_id = ex.id;

    const { error: err } = await createClient().from("dons").update(maj).eq("id", don.id);
    if (err) {
      setError("Liaison impossible : " + err.message);
      return;
    }
    router.refresh();
  }

  /** Enregistre la fiche éditée (sans importer : l'import se fait par lot). */
  function validerFiche(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setError(null);
    if (!ficheValide(f)) {
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }
    setFiches((p) => ({ ...p, [edit.id]: f }));
    setChoisies((p) => ({ ...p, [edit.id]: true }));
    setEdit(null);
  }

  const selection = analyse.filter((a) => estChoisie(a.op.id, a.probables.length === 0));
  const montantSelection = selection.reduce((s, a) => s + Number(a.op.montant), 0);
  const incompletes = selection.filter((a) => !ficheValide(ficheDe(a.op.id, a.nomExtrait)));
  const sansExercice = selection.filter((a) => !exerciceDe(a.op));

  async function importerLot() {
    if (!coffre.estOuvert) return setError("Coffre verrouillé.");
    if (selection.length === 0) return;
    if (incompletes.length > 0) {
      return setError(
        `${incompletes.length} ligne(s) sélectionnée(s) sans nom de donateur. Complétez-les ou décochez-les.`,
      );
    }
    if (sansExercice.length > 0) {
      return setError(
        `${sansExercice.length} ligne(s) ne tombent dans aucun exercice enregistré. Choisissez un exercice cible explicite.`,
      );
    }

    setError(null);
    setBilan(null);
    setSaving(true);

    const payloads = [];
    for (const { op, nomExtrait } of selection) {
      const fi = ficheDe(op.id, nomExtrait);
      const pii = piiDeFiche(fi);
      payloads.push({
        exercice_id: exerciceDe(op)!.id,
        origine: fi.origine.trim() || null,
        categorie_donateur: fi.categorie_donateur || null,
        est_personne_morale: fi.est_personne_morale,
        montant: Number(op.montant),
        date_don: op.date_operation,
        mode_paiement: op.mode_paiement,
        recu_numero: null,
        recu_etat: null,
        observations: "Importé depuis la comptabilité",
        operation_id: op.id,
        pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
      });
    }

    const { error: err } = await createClient().from("dons").insert(payloads);
    setSaving(false);
    if (err) {
      setError("Import impossible : " + err.message);
      return;
    }
    setBilan(`${payloads.length} don(s) importé(s) pour ${formatEuros(montantSelection)}.`);
    router.refresh();
  }

  if (operations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-10 text-center text-sm text-muted">
        Toutes les opérations « Don » de la comptabilité sont déjà rapprochées. Rien à importer. 🎉
      </div>
    );
  }

  const avecDoublonPossible = analyse.filter((a) => a.probables.length > 0);
  const toutesCochees =
    analyse.length > 0 && analyse.every((a) => estChoisie(a.op.id, a.probables.length === 0));

  return (
    <>
      {verrou && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
          🔒 Coffre verrouillé — les noms existants ne peuvent pas être comparés.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tuile label="Opérations à traiter" valeur={String(operations.length)} />
        <Tuile label="À saisir" valeur={String(analyse.length)} accent="gold" />
        <Tuile label="Doublon possible" valeur={String(avecDoublonPossible.length)} accent="positive" />
        <Tuile label="Sélection" valeur={`${selection.length} · ${formatEuros(montantSelection)}`} accent="gold" />
      </div>

      {/* Barre d'import : exercice cible + action de lot */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-[15rem]">
          <label className="mb-1 block text-xs font-medium text-muted">Exercice d&apos;affectation</label>
          <select value={exerciceCible} onChange={(e) => setExerciceCible(e.target.value)} className={inputCls}>
            <option value="auto">Automatique (d&apos;après la date du don)</option>
            {[...exercices]
              .sort((a, b) => b.date_debut.localeCompare(a.date_debut))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.libelle}
                  {e.actif ? " — en cours" : ""}
                </option>
              ))}
          </select>
        </div>
        <div className="min-w-[12rem]">
          <label className="mb-1 block text-xs font-medium text-muted">Filtrer par exercice</label>
          <select value={filtreExercice} onChange={(e) => setFiltreExercice(e.target.value)} className={inputCls}>
            <option value="tous">Tous les exercices</option>
            {[...exercices]
              .sort((a, b) => b.date_debut.localeCompare(a.date_debut))
              .map((e) => (
                <option key={e.id} value={e.id}>{e.libelle}</option>
              ))}
          </select>
        </div>
        <button
          type="button"
          onClick={importerLot}
          disabled={saving || selection.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Import en cours…" : `Importer ${selection.length} don${selection.length > 1 ? "s" : ""}`}
        </button>
        {bilan && <p className="text-sm text-positive">{bilan}</p>}
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={toutesCochees}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setChoisies((p) => {
                      const n = { ...p };
                      for (const a of analyse) n[a.op.id] = v;
                      return n;
                    });
                  }}
                  title="Tout cocher / décocher"
                />
              </th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Libellé bancaire</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium">Exercice</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {analyse.map(({ op, probables, nomExtrait, ressemblants }) => {
              const fi = ficheDe(op.id, nomExtrait);
              const nouvelle = probables.length === 0;
              const ex = exerciceDe(op);
              const nom = resume(fi);
              return (
                <tr key={op.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={estChoisie(op.id, nouvelle)}
                      onChange={(e) => setChoisies((p) => ({ ...p, [op.id]: e.target.checked }))}
                      title={nouvelle ? undefined : "Un doublon est possible : vérifiez avant d'importer."}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(op.date_operation)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatEuros(Number(op.montant))}</td>
                  <td className="px-4 py-3 max-w-[14rem] text-xs text-muted">{brutDe(op) ?? libelleDe(op)}</td>
                  <td className="px-4 py-3">
                    {nom ? (
                      <span className="font-medium">{nom}</span>
                    ) : (
                      <span className="text-negative">à renseigner</span>
                    )}
                    <button
                      type="button"
                      onClick={() => ouvrir(op, nomExtrait)}
                      className="ml-2 text-xs text-accent hover:underline"
                    >
                      modifier
                    </button>
                    {!fiches[op.id] && reconnus.has(op.id) && (
                      <span
                        className={`ml-2 rounded px-1 text-[10px] font-medium ${
                          reconnus.get(op.id)!.certain ? "text-positive" : "bg-gold-soft text-gold"
                        }`}
                        title={reconnus.get(op.id)!.certain ? "Nom et prénom lus dans le libellé" : "Nom seul lu dans le libellé : à confirmer"}
                      >
                        {reconnus.get(op.id)!.certain ? "reconnu" : "à valider"}
                      </span>
                    )}
                    {ressemblants.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted">
                        Ressemble à : {ressemblants.map((r) => r.nom).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {ex ? ex.libelle.replace("Exercice ", "") : <span className="text-negative">aucun</span>}
                  </td>
                  <td className="px-4 py-3">
                    {nouvelle ? (
                      <span className="inline-flex items-center rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                        À saisir
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full bg-positive/15 px-2 py-0.5 text-xs font-medium text-positive"
                        title="Un don de même montant et de date voisine existe déjà : reliez-le plutôt que de le ressaisir."
                      >
                        Doublon possible{probables.length > 1 ? ` (${probables.length})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {probables.length === 1 ? (
                      <button type="button" onClick={() => lier(op, probables[0])} className="text-accent hover:underline" title={`Lier à « ${nomDonateur(probables[0])} »`}>
                        Lier
                      </button>
                    ) : probables.length > 1 ? (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const d = probables.find((x) => x.id === e.target.value);
                          if (d) lier(op, d);
                        }}
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none"
                      >
                        <option value="" disabled>
                          Lier à…
                        </option>
                        {probables.map((d) => (
                          <option key={d.id} value={d.id}>
                            {nomDonateur(d)} — {formatDate(d.date_don)}
                          </option>
                        ))}
                      </select>
                    ) : ressemblants.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => ouvrir(op, nomExtrait, ressemblants[0].exemple)}
                        className="text-xs text-accent hover:underline"
                        title="Pré-remplir avec la fiche de ce donateur connu"
                      >
                        reprendre « {ressemblants[0].nom} »
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title="Fiche du donateur" onClose={() => setEdit(null)}>
          <form onSubmit={validerFiche} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Opération : </span>
              <strong>{formatEuros(Number(edit.montant))}</strong> le {formatDate(edit.date_operation)}
              {edit.mode_paiement ? ` · ${edit.mode_paiement}` : ""} — <span className="text-xs text-muted">{brutDe(edit) ?? libelleDe(edit)}</span>
            </div>

            <ChoixDonateur
              dons={dons}
              valeurCourante={f}
              onChoisir={(i: IdentiteSaisie) => setF((p) => ({ ...p, ...i }))}
              chiffrer={coffre.chiffrer}
              coffreOuvert={coffre.estOuvert}
            />

            <ChampsDonateur f={f} set={set} relations={relations} idListe="relations-import" />

            <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
              « Enregistrer » prépare la fiche et coche la ligne. Le don n&apos;est créé dans l&apos;onglet Dons
              qu&apos;au clic sur « Importer … dons » en haut de la liste.
            </p>

            <FormFooter saving={false} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "gold" | "positive" }) {
  const col = accent === "gold" ? "text-gold" : accent === "positive" ? "text-positive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}
