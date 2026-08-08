"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate } from "@/lib/format";
import { parseReleve, suggereCategorie, devineMode, cleDedup, type LigneReleve } from "@/lib/releve";

type Cat = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean };

type Ligne = LigneReleve & {
  key: string;
  inclus: boolean;
  categorie_id: string;
  doublon: boolean;
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
  existantes: { date_operation: string; montant: number; type: string; libelle: string }[];
}) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fait, setFait] = useState<number | null>(null);

  const dedupSet = useMemo(
    () =>
      new Set(
        existantes.map((o) => cleDedup(o.date_operation, Number(o.montant), o.type, o.libelle)),
      ),
    [existantes],
  );

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);
    setFait(null);
    try {
      const buf = await file.arrayBuffer();
      const brut = parseReleve(buf);
      if (brut.length === 0) {
        setErreur("Aucune opération détectée. Vérifiez que c'est bien l'export Excel de la banque (colonnes Date / Libellé / Débit / Crédit).");
        setLignes([]);
        return;
      }
      const vus = new Set<string>();
      const l: Ligne[] = brut.map((op) => {
        const key = cleDedup(op.date, op.montant, op.type, op.libelle);
        const doublon = dedupSet.has(key) || vus.has(key);
        vus.add(key);
        return {
          ...op,
          key,
          doublon,
          inclus: !doublon,
          categorie_id: suggereCategorie(op.libelle, op.type, categories),
        };
      });
      setLignes(l);
      setNomFichier(file.name);
    } catch (err) {
      setErreur("Lecture impossible : " + (err instanceof Error ? err.message : "fichier invalide"));
    }
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
  const nbDoublons = lignes.filter((l) => l.doublon).length;

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
              Les opérations sont extraites puis validées une par une avant d'entrer en comptabilité.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            Choisir un fichier .xlsx
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
                <strong className="text-foreground">{retenues.length}</strong> retenues
                {" · "}<span className="text-positive">{nbRec} recettes</span>
                {" · "}<span className="text-negative">{nbDep} dépenses</span>
                {nbDoublons > 0 && <> · <span className="text-gold">{nbDoublons} doublon(s)</span></>}
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
            <button
              type="button"
              onClick={importer}
              disabled={importing || retenues.length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {importing ? "Import…" : `Importer ${retenues.length} opération(s)`}
            </button>
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
                  <tr
                    key={i}
                    className={`border-b border-border last:border-0 ${l.inclus ? "" : "opacity-45"}`}
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
                      <span className="line-clamp-2">{l.libelle}</span>
                      {l.doublon && (
                        <span className="ml-1 rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                          doublon
                        </span>
                      )}
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
