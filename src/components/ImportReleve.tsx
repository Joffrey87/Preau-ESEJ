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

type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean };

type Ligne = LigneReleve & {
  key: string;
  libelle_origine: string; // libellé bancaire brut conservé
  inclus: boolean;
  categorie_id: string;
  doublon: boolean; // même montant + date ±1j → déjà en compta (décoché)
  suspect: boolean; // même montant + date ±5j → doublon possible (coché, surligné)
  // opération de la compta correspondante (pour comparaison sous la ligne)
  existant: { date: string; libelle: string; montant: number; type: string; categorie: string | null } | null;
};

export default function ImportReleve({
  categories,
  comptes,
  exercices,
  existantes,
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
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fait, setFait] = useState<number | null>(null);
  const [ignores, setIgnores] = useState(0);
  const [suspects, setSuspects] = useState(0);

  const historique = useMemo(() => construireHistorique(existantes), [existantes]);
  const indexTokens = useMemo(() => construireIndexTokens(existantes), [existantes]);
  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);

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
        categorie: e.cat ? catNom.get(e.cat) ?? null : null,
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
        return {
          ...x.op,
          libelle: embellirLibelle(x.op.libelle, x.op.montant, x.op.type), // affiché : propre
          libelle_origine: x.op.libelle, // conservé : brut bancaire
          key: `${x.op.date}-${x.op.montant}-${x.i}`,
          doublon: x.doublon,
          suspect: x.suspect,
          existant: x.existant,
          inclus: !x.doublon, // doublon possible reste coché
          categorie_id: suggereCategorieIntelligente(x.op.libelle, x.op.type, categories, historique, indexTokens),
        };
      });
      setLignes(l);
      setIgnores(ignoresN);
      setSuspects(suspectsN);
      setNomFichier(nom);
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

  function exerciceForDate(date: string): string | null {
    const ex = exercices.find((e) => e.date_debut <= date && date <= e.date_fin);
    return ex?.id ?? exercices.find((e) => e.actif)?.id ?? null;
  }

  const retenues = lignes.filter((l) => l.inclus);
  const nbRec = retenues.filter((l) => l.type === "recette").length;
  const nbDep = retenues.filter((l) => l.type === "depense").length;
  const nbClasses = retenues.filter((l) => l.categorie_id).length;

  async function importer() {
    setErreur(null);
    if (!compteId) {
      setErreur("Choisissez un compte de destination.");
      return;
    }
    if (retenues.length === 0) {
      setErreur("Aucune ligne sélectionnée.");
      return;
    }
    setImporting(true);
    const supabase = createClient();
    const payload = retenues.map((l) => ({
      date_operation: l.date,
      libelle: l.libelle,
      libelle_origine: l.libelle_origine,
      montant: l.montant,
      type: l.type,
      categorie_id: l.categorie_id || null,
      compte_id: compteId,
      exercice_id: exerciceForDate(l.date),
      mode_paiement: devineMode(l.libelle),
    }));
    const { error } = await supabase.from("operations").insert(payload);
    setImporting(false);
    if (error) {
      setErreur("Import impossible : " + error.message);
      return;
    }
    setFait(payload.length);
    setLignes([]);
    setNomFichier(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Déposer un relevé bancaire</h2>
            <p className="mt-1 text-xs text-muted">
              Export <strong>Excel</strong> du Crédit Mutuel (Situation de votre compte, .xlsx).
              Les opérations sont extraites puis validées une par une avant d&apos;entrer en comptabilité.
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
            {fait} opération{fait > 1 ? "s" : ""} importée{fait > 1 ? "s" : ""} en comptabilité ✓{" "}
            <Link href="/comptabilite" className="underline">Voir la comptabilité</Link>
          </p>
        )}
        {erreur && (
          <p className="mt-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>
        )}
      </div>

      {lignes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted">
                <strong className="text-foreground">{retenues.length}</strong> nouvelles
                {" · "}<span className="text-positive">{nbRec} recettes</span>
                {" · "}<span className="text-negative">{nbDep} dépenses</span>
                {" · "}<span>{nbClasses} classée(s)</span>
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

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-3 font-medium">✓</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Libellé</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Catégorie</th>
                  <th className="px-3 py-3 font-medium text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <Fragment key={i}>
                  <tr
                    className={`border-b border-border ${l.suspect ? "" : "last:border-0"} ${l.inclus ? "" : "opacity-45"} ${l.suspect ? "bg-gold-soft" : ""}`}
                  >
                    <td className="px-3 py-2">
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
                        <span className="line-clamp-2">{l.libelle}</span>
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
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={l.type}
                        onChange={(e) =>
                          maj(i, { type: e.target.value as "recette" | "depense", categorie_id: "" })
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                      >
                        <option value="recette">Recette</option>
                        <option value="depense">Dépense</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={l.categorie_id}
                        onChange={(e) => maj(i, { categorie_id: e.target.value })}
                        className="w-48 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
                      >
                        <option value="">— à classer —</option>
                        {categories
                          .filter((c) => c.type === l.type)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.nom}</option>
                          ))}
                      </select>
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
                  {l.suspect && l.existant && (
                    <tr className="border-b border-border last:border-0">
                      <td className="px-3 pb-2 pt-0" colSpan={6}>
                        <div className="ml-6 rounded-md border border-dashed border-gold/70 bg-gold-soft/40 px-3 py-2">
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
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
