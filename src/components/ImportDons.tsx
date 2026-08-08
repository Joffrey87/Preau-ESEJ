"use client";

import { useEffect, useMemo, useState } from "react";
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
  cleDon,
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
  const [clesExistantes, setClesExistantes] = useState<Set<string>>(new Set());
  const [voirRejetees, setVoirRejetees] = useState(false);

  const val = (l: LigneBrute, key: string) => {
    const col = mapping[key];
    return col ? l[col] ?? "" : "";
  };

  // Clés des dons DÉJÀ en base (déchiffrées avec le coffre) pour repérer les doublons.
  useEffect(() => {
    let annule = false;
    (async () => {
      if (!coffre.estOuvert) {
        if (!annule) setClesExistantes(new Set());
        return;
      }
      const { data } = await createClient()
        .from("dons")
        .select("montant, date_don, recu_numero, donateur_nom, donateur_prenom, raison_sociale, courriel, pii_chiffre");
      const cles = new Set<string>();
      for (const d of data ?? []) {
        let nom = d.donateur_nom, prenom = d.donateur_prenom, raison = d.raison_sociale, courriel = d.courriel;
        if (d.pii_chiffre) {
          try {
            const p = JSON.parse(await coffre.dechiffrer(d.pii_chiffre));
            nom = p.nom; prenom = p.prenom; raison = p.raison; courriel = p.courriel;
          } catch {
            continue;
          }
        }
        const ident = raison || [nom, prenom].filter(Boolean).join(" ");
        cles.add(cleDon(String(d.date_don).slice(0, 10), Number(d.montant), ident ?? "", courriel ?? "", d.recu_numero ?? ""));
      }
      if (!annule) setClesExistantes(cles);
    })();
    return () => {
      annule = true;
    };
  }, [coffre.estOuvert, coffre]);

  // Aperçu ligne par ligne + statut (ok / raison de rejet).
  const anneeMax = new Date().getFullYear() + 1;
  const apercu = useMemo(() => {
    const vus = new Set<string>();
    return lignes.map((l) => {
      const montant = toMontant(val(l, "montant"));
      const date = toISODate(val(l, "date_don"));
      const raison = toTexte(val(l, "raison_sociale"));
      const ident =
        raison || [toTexte(val(l, "donateur_nom")), toTexte(val(l, "donateur_prenom"))].filter(Boolean).join(" ");
      const nom =
        raison ||
        [toTexte(val(l, "donateur_titre")), toTexte(val(l, "donateur_nom")), toTexte(val(l, "donateur_prenom"))]
          .filter(Boolean)
          .join(" ");

      let statut: "ok" | "montant" | "date" | "doublon-base" | "doublon-fichier" = "ok";
      let raisonRejet = "";
      const annee = date ? Number(date.slice(0, 4)) : 0;
      if (montant == null) {
        statut = "montant";
        raisonRejet = "Montant manquant ou illisible";
      } else if (!date) {
        statut = "date";
        raisonRejet = "Date manquante ou illisible";
      } else if (annee < 2010 || annee > anneeMax) {
        statut = "date";
        raisonRejet = `Date invalide (année ${annee || "?"})`;
      } else {
        const cle = cleDon(date, montant, ident, toTexte(val(l, "courriel")), toTexte(val(l, "recu_numero")));
        if (clesExistantes.has(cle)) {
          statut = "doublon-base";
          raisonRejet = "Déjà présent en base";
        } else if (vus.has(cle)) {
          statut = "doublon-fichier";
          raisonRejet = "Doublon dans le fichier";
        } else {
          vus.add(cle);
        }
      }
      return { montant, date, nom: nom || "—", statut, raisonRejet };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, mapping, clesExistantes]);

  const retenues = apercu.filter((a) => a.statut === "ok").length;
  const rejetees = apercu.filter((a) => a.statut !== "ok");

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
      for (let i = 0; i < lignes.length; i++) {
        if (apercu[i].statut !== "ok") continue; // n'importe QUE les lignes acceptées
        const l = lignes[i];
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

          {/* Compteurs + import */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">
              <strong className="text-positive">{retenues}</strong> à importer
              {rejetees.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setVoirRejetees((v) => !v)}
                    className="text-gold underline decoration-dotted underline-offset-2"
                  >
                    {rejetees.length} rejetée{rejetees.length > 1 ? "s" : ""}
                  </button>
                  {voirRejetees ? " (affichées)" : " (cliquer pour voir)"}
                </>
              )}
              {" · "}
              {lignes.length} ligne{lignes.length > 1 ? "s" : ""} au total
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
                  <th className="px-4 py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody>
                {(voirRejetees ? apercu.filter((a) => a.statut !== "ok") : apercu).slice(0, 50).map((a, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${a.statut === "ok" ? "" : "bg-negative/5"}`}>
                    <td className="px-4 py-2 tabular-nums">{a.date ? formatDate(a.date) : "—"}</td>
                    <td className="px-4 py-2">{a.nom}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.montant != null ? formatEuros(a.montant) : "—"}</td>
                    <td className="px-4 py-2">
                      {a.statut === "ok" ? (
                        <span className="text-positive">✓ à importer</span>
                      ) : (
                        <span className="text-negative">✕ {a.raisonRejet}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(voirRejetees ? rejetees.length : apercu.length) > 50 && (
              <p className="px-4 py-2 text-xs text-muted">… et d&apos;autres lignes non affichées.</p>
            )}
          </div>

          {rejetees.length > 0 && (
            <p className="text-xs text-muted">
              Les lignes rejetées (montant/date manquant ou invalide, doublons) ne seront <strong>pas</strong> importées.
            </p>
          )}
        </>
      )}
    </div>
  );
}
