"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { formatEuros, formatDate } from "@/lib/format";
import { inputCls } from "@/components/GestionComptes";
import {
  lireClasseurDons,
  devineMapping,
  toISODate,
  toMontant,
  toTexte,
  CHAMPS_DON,
  type LigneBrute,
} from "@/lib/importDons";

export default function ImportDons() {
  const router = useRouter();
  const coffre = useCoffre();
  const [headers, setHeaders] = useState<string[]>([]);
  const [lignes, setLignes] = useState<LigneBrute[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [fait, setFait] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const val = (l: LigneBrute, key: string) => {
    const col = mapping[key];
    return col ? l[col] ?? "" : "";
  };

  // Aperçu : lignes retenues (montant + date valides).
  const apercu = useMemo(() => {
    return lignes
      .map((l) => {
        const montant = toMontant(val(l, "montant"));
        const date = toISODate(val(l, "date_don"));
        const raison = toTexte(val(l, "raison_sociale"));
        const nom =
          raison ||
          [toTexte(val(l, "donateur_titre")), toTexte(val(l, "donateur_nom")), toTexte(val(l, "donateur_prenom"))]
            .filter(Boolean)
            .join(" ");
        return { montant, date, nom: nom || "—", ok: montant != null && !!date };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, mapping]);

  const retenues = apercu.filter((a) => a.ok).length;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);
    setFait(null);
    try {
      const { headers: h, lignes: l } = lireClasseurDons(await file.arrayBuffer());
      if (l.length === 0) {
        setErreur("Aucune ligne détectée. Vérifiez que la 1re ligne contient les entêtes.");
      }
      setHeaders(h);
      setLignes(l);
      setMapping(devineMapping(h));
      setNomFichier(file.name);
    } catch {
      setErreur("Lecture impossible : fichier .xlsx invalide.");
    }
    e.target.value = "";
  }

  async function importer() {
    setErreur(null);
    if (!coffre.estOuvert) {
      setErreur("Déverrouillez le coffre (Paramètres → Sécurité) avant d'importer : les données seront chiffrées.");
      return;
    }
    if (retenues === 0) {
      setErreur("Aucune ligne valide à importer (montant et date requis).");
      return;
    }
    setImporting(true);
    try {
      const payloads = [];
      for (const l of lignes) {
        const montant = toMontant(val(l, "montant"));
        const date_don = toISODate(val(l, "date_don"));
        if (montant == null || !date_don) continue;
        const raison = toTexte(val(l, "raison_sociale"));
        const pii = {
          titre: toTexte(val(l, "donateur_titre")) || null,
          nom: (raison || toTexte(val(l, "donateur_nom"))) || null,
          prenom: raison ? null : toTexte(val(l, "donateur_prenom")) || null,
          raison: raison || null,
          adresse: toTexte(val(l, "adresse")) || null,
          cp_ville: toTexte(val(l, "cp_ville")) || null,
          courriel: toTexte(val(l, "courriel")) || null,
        };
        payloads.push({
          est_personne_morale: !!raison,
          categorie_donateur: toTexte(val(l, "categorie_donateur")) || null,
          montant,
          date_don,
          mode_paiement: toTexte(val(l, "mode_paiement")) || null,
          recu_numero: toTexte(val(l, "recu_numero")) || null,
          recu_etat: toTexte(val(l, "recu_etat")) || null,
          origine: toTexte(val(l, "origine")) || null,
          observations: toTexte(val(l, "observations")) || null,
          pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
          donateur_titre: null, donateur_nom: null, donateur_prenom: null,
          raison_sociale: null, adresse: null, cp_ville: null, courriel: null,
        });
      }
      const { error } = await createClient().from("dons").insert(payloads);
      if (error) throw new Error(error.message);
      setFait(payloads.length);
      setLignes([]);
      setHeaders([]);
      setNomFichier(null);
      router.refresh();
    } catch (err) {
      setErreur("Import impossible : " + (err instanceof Error ? err.message : "erreur"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Déposer un fichier de dons (.xlsx)</h2>
            <p className="mt-1 text-xs text-muted">
              Le fichier est lu <strong>dans votre navigateur</strong> ; les données personnelles sont
              <strong> chiffrées</strong> avant d&apos;être enregistrées. La 1re ligne doit contenir les entêtes de colonnes.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            Choisir le fichier (.xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" />
          </label>
        </div>
        {nomFichier && <p className="mt-3 text-xs text-muted">Fichier : {nomFichier}</p>}
        {!coffre.estOuvert && (
          <p className="mt-3 rounded-lg bg-gold-soft/50 px-3 py-2 text-sm text-gold">
            🔒 Coffre verrouillé — <Link href="/parametres" className="underline">déverrouillez-le</Link> pour importer (les dons seront chiffrés).
          </p>
        )}
        {fait !== null && (
          <p className="mt-3 rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">
            {fait} don{fait > 1 ? "s" : ""} importé{fait > 1 ? "s" : ""} (chiffré{fait > 1 ? "s" : ""}) ✓{" "}
            <Link href="/dons" className="underline">Voir les dons</Link>
          </p>
        )}
        {erreur && <p className="mt-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      </div>

      {headers.length > 0 && (
        <>
          {/* Mappage des colonnes */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Associer les colonnes</h2>
            <p className="mt-1 text-xs text-muted">Vérifiez la correspondance (pré-remplie automatiquement).</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CHAMPS_DON.map((champ) => (
                <label key={champ.key} className="block">
                  <span className="mb-1 block text-xs font-medium">
                    {champ.label}
                    {champ.pii && <span className="ml-1 text-gold" title="Donnée personnelle chiffrée">🔒</span>}
                  </span>
                  <select
                    value={mapping[champ.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [champ.key]: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— ignorer —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {/* Aperçu */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              <strong className="text-foreground">{retenues}</strong> ligne(s) valide(s) sur {lignes.length}
            </span>
            <button
              type="button"
              onClick={importer}
              disabled={importing || retenues === 0 || !coffre.estOuvert}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {importing ? "Import…" : `Importer ${retenues} don(s)`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Donateur</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {apercu.slice(0, 30).map((a, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${a.ok ? "" : "opacity-40"}`}>
                    <td className="px-4 py-2 tabular-nums">{a.date ? formatDate(a.date) : "— date ?"}</td>
                    <td className="px-4 py-2">{a.nom}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.montant != null ? formatEuros(a.montant) : "— montant ?"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {apercu.length > 30 && <p className="px-4 py-2 text-xs text-muted">… et {apercu.length - 30} autres lignes.</p>}
          </div>
        </>
      )}
    </div>
  );
}
