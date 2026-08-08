"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { formatEuros, formatDate } from "@/lib/format";
import { Field, inputCls } from "@/components/GestionComptes";
import {
  lireClasseurDons,
  devineMapping,
  toISODate,
  toMontant,
  toTexte,
  cleDon,
  numLigneExcel,
  CHAMPS_DON,
  type LigneBrute,
} from "@/lib/importDons";

const CAP = 200; // lignes affichées au maximum dans l'aperçu

type Statut = "ok" | "montant" | "date" | "doublon-base" | "doublon-fichier";

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

  // Corrections manuelles (par index de ligne) et décisions d'inclusion (coches).
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [decision, setDecision] = useState<Record<number, boolean>>({});
  const [editIdx, setEditIdx] = useState<number | null>(null);

  // Valeur effective d'un champ pour une ligne : correction manuelle sinon valeur brute mappée.
  const champEff = (i: number, key: string): unknown => {
    const e = edits[i];
    if (e && Object.prototype.hasOwnProperty.call(e, key)) return e[key];
    const col = mapping[key];
    return col ? lignes[i]?.[col] ?? "" : "";
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

  // Aperçu ligne par ligne + statut (ok / raison de rejet). Recalculé si une
  // correction manuelle change une valeur.
  const apercu = useMemo(() => {
    const anneeMax = new Date().getFullYear() + 1;
    const vus = new Set<string>();
    return lignes.map((l, i) => {
      const g = (key: string): unknown => {
        const e = edits[i];
        if (e && Object.prototype.hasOwnProperty.call(e, key)) return e[key];
        const col = mapping[key];
        return col ? l[col] ?? "" : "";
      };
      const montant = toMontant(g("montant"));
      const date = toISODate(g("date_don"));
      const raison = toTexte(g("raison_sociale"));
      const ident =
        raison || [toTexte(g("donateur_nom")), toTexte(g("donateur_prenom"))].filter(Boolean).join(" ");
      const nom =
        raison ||
        [toTexte(g("donateur_titre")), toTexte(g("donateur_nom")), toTexte(g("donateur_prenom"))]
          .filter(Boolean)
          .join(" ");

      let statut: Statut = "ok";
      let raisonRejet = "";
      let valide = false;
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
        valide = true; // données exploitables (le doublon reste importable si forcé)
        const cle = cleDon(date, montant, ident, toTexte(g("courriel")), toTexte(g("recu_numero")));
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
      return { i, row: numLigneExcel(l) || i + 2, montant, date, nom: nom || "—", statut, raisonRejet, valide };
    });
  }, [lignes, mapping, clesExistantes, edits]);

  // Décision effective d'inclusion (coche) : par défaut on importe les lignes « ok ».
  const decisions = useMemo(
    () =>
      apercu.map((a) => {
        const inclus = decision[a.i] ?? a.statut === "ok";
        return { ...a, inclus, importera: inclus && a.valide };
      }),
    [apercu, decision],
  );

  const retenues = decisions.filter((d) => d.importera).length;
  const rejetees = decisions.filter((d) => d.statut !== "ok");
  const aCorriger = decisions.filter((d) => d.inclus && !d.valide).length;

  const toggleInclus = (i: number, inclusActuel: boolean) =>
    setDecision((m) => ({ ...m, [i]: !inclusActuel }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErreur(null);
    setFait(null);
    setEdits({});
    setDecision({});
    setVoirRejetees(false);
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
      setErreur("Aucune ligne à importer (cochez au moins une ligne valide).");
      return;
    }
    setImporting(true);
    try {
      const payloads = [];
      for (const d of decisions) {
        if (!d.importera) continue; // n'importe QUE les lignes cochées et valides
        const i = d.i;
        const montant = toMontant(champEff(i, "montant"));
        const date_don = toISODate(champEff(i, "date_don"));
        if (montant == null || !date_don) continue;
        const raison = toTexte(champEff(i, "raison_sociale"));
        const pii = {
          titre: toTexte(champEff(i, "donateur_titre")) || null,
          nom: (raison || toTexte(champEff(i, "donateur_nom"))) || null,
          prenom: raison ? null : toTexte(champEff(i, "donateur_prenom")) || null,
          raison: raison || null,
          adresse: toTexte(champEff(i, "adresse")) || null,
          cp_ville: toTexte(champEff(i, "cp_ville")) || null,
          courriel: toTexte(champEff(i, "courriel")) || null,
        };
        payloads.push({
          est_personne_morale: !!raison,
          categorie_donateur: toTexte(champEff(i, "categorie_donateur")) || null,
          montant,
          date_don,
          mode_paiement: toTexte(champEff(i, "mode_paiement")) || null,
          recu_numero: toTexte(champEff(i, "recu_numero")) || null,
          recu_etat: toTexte(champEff(i, "recu_etat")) || null,
          origine: toTexte(champEff(i, "origine")) || null,
          observations: toTexte(champEff(i, "observations")) || null,
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
      setEdits({});
      setDecision({});
      router.refresh();
    } catch (err) {
      setErreur("Import impossible : " + (err instanceof Error ? err.message : "erreur"));
    } finally {
      setImporting(false);
    }
  }

  const visibles = (voirRejetees ? decisions.filter((d) => d.statut !== "ok") : decisions).slice(0, CAP);
  const totalVisible = voirRejetees ? rejetees.length : decisions.length;

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
                    {rejetees.length} mise{rejetees.length > 1 ? "s" : ""} de côté
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

          {aCorriger > 0 && (
            <p className="rounded-lg bg-gold-soft/40 px-3 py-2 text-xs text-gold">
              ⚠ {aCorriger} ligne{aCorriger > 1 ? "s" : ""} cochée{aCorriger > 1 ? "s" : ""} mais encore invalide{aCorriger > 1 ? "s" : ""}
              {" "}(montant/date à corriger) — elle{aCorriger > 1 ? "s" : ""} ne sera{aCorriger > 1 ? "ront" : ""} pas importée{aCorriger > 1 ? "s" : ""}.
              Cliquez sur « Éditer » pour la corriger.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium" title="Importer cette ligne ?">✓</th>
                  <th className="px-3 py-2 text-right font-medium" title="N° de ligne dans le fichier Excel">Ligne</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Donateur</th>
                  <th className="px-4 py-2 text-right font-medium">Montant</th>
                  <th className="px-4 py-2 font-medium">État</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a) => {
                  const modifiee = !!edits[a.i];
                  return (
                    <tr key={a.i} className={`border-b border-border last:border-0 ${a.statut === "ok" ? "" : "bg-negative/5"}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={a.inclus}
                          onChange={() => toggleInclus(a.i, a.inclus)}
                          className="h-4 w-4 accent-[var(--accent,#2563eb)]"
                          title={a.inclus ? "Cochée : sera importée si valide" : "Décochée : mise de côté"}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{a.row}</td>
                      <td className="px-4 py-2 tabular-nums">{a.date ? formatDate(a.date) : "—"}</td>
                      <td className="px-4 py-2">
                        {a.nom}
                        {modifiee && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">modifiée</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{a.montant != null ? formatEuros(a.montant) : "—"}</td>
                      <td className="px-4 py-2">
                        {a.statut === "ok" ? (
                          <span className="text-positive">✓ à importer</span>
                        ) : (
                          <span className={a.inclus && a.valide ? "text-gold" : "text-negative"}>
                            {a.inclus && a.valide ? "↻ forcée : " : "✕ "}
                            {a.raisonRejet}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => setEditIdx(a.i)} className="text-accent hover:underline">
                          Éditer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalVisible > CAP && (
              <p className="px-4 py-2 text-xs text-muted">
                … {totalVisible - CAP} autre{totalVisible - CAP > 1 ? "s" : ""} ligne{totalVisible - CAP > 1 ? "s" : ""} non affichée{totalVisible - CAP > 1 ? "s" : ""}.
                {!voirRejetees && rejetees.length > 0 && " Utilisez « mises de côté » pour ne voir que celles à décider."}
              </p>
            )}
          </div>

          <p className="text-xs text-muted">
            Cochez pour importer une ligne, décochez pour la mettre de côté. « Éditer » ouvre la ligne complète
            (avec celle du dessus et du dessous) pour corriger montant, date, identité… avant l&apos;import.
          </p>
        </>
      )}

      {editIdx !== null && lignes[editIdx] && (
        <EditeurLigne
          key={editIdx}
          i={editIdx}
          row={apercu[editIdx]?.row ?? editIdx + 2}
          headers={headers}
          lignes={lignes}
          mapping={mapping}
          patch={edits[editIdx]}
          onClose={() => setEditIdx(null)}
          onSave={(patch) => {
            setEdits((m) => ({ ...m, [editIdx]: patch }));
            setEditIdx(null);
          }}
          onReinit={() => {
            setEdits((m) => {
              const n = { ...m };
              delete n[editIdx];
              return n;
            });
            setDecision((m) => {
              const n = { ...m };
              delete n[editIdx];
              return n;
            });
            setEditIdx(null);
          }}
        />
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————————————
// Éditeur d'une ligne : contexte (dessus / ligne / dessous) + champs corrigeables.

function EditeurLigne({
  i,
  row,
  headers,
  lignes,
  mapping,
  patch,
  onClose,
  onSave,
  onReinit,
}: {
  i: number;
  row: number;
  headers: string[];
  lignes: LigneBrute[];
  mapping: Record<string, string>;
  patch: Record<string, string> | undefined;
  onClose: () => void;
  onSave: (patch: Record<string, string>) => void;
  onReinit: () => void;
}) {
  // Valeur initiale (texte) d'un champ : correction existante sinon valeur brute mappée.
  const initial = (key: string): string => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) return patch[key];
    const col = mapping[key];
    const brut = col ? lignes[i]?.[col] ?? "" : "";
    if (key === "date_don") return toISODate(brut); // pré-remplit l'input date en ISO
    return toTexte(brut);
  };

  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const c of CHAMPS_DON) f[c.key] = initial(c.key);
    return f;
  });

  const set = (key: string, v: string) => setForm((f) => ({ ...f, [key]: v }));

  // Re-validation en direct (montant + date), sans le doublon (vu dans le tableau).
  const montant = toMontant(form.montant);
  const dateISO = toISODate(form.date_don);
  const annee = dateISO ? Number(dateISO.slice(0, 4)) : 0;
  const anneeMax = new Date().getFullYear() + 1;
  const okMontant = montant != null;
  const okDate = !!dateISO && annee >= 2010 && annee <= anneeMax;

  const voisines = [i - 1, i, i + 1].filter((k) => k >= 0 && k < lignes.length);

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    // On stocke le montant/date sous forme normalisée quand ils sont valides.
    const patchOut: Record<string, string> = { ...form };
    if (dateISO) patchOut.date_don = dateISO;
    onSave(patchOut);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ligne Excel n° {row}</h2>
            <p className="text-xs text-muted">Corrigez les valeurs si besoin, puis enregistrez. Contexte : ligne précédente et suivante.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Fermer">✕</button>
        </div>

        {/* Contexte brut : dessus / ligne / dessous */}
        <div className="mb-5">
          <h3 className="mb-1.5 text-xs font-semibold text-muted">Contenu brut du fichier</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-muted">
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">Ligne</th>
                  {headers.map((h) => (
                    <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voisines.map((k) => {
                  const l = lignes[k];
                  const courante = k === i;
                  return (
                    <tr key={k} className={`border-b border-border last:border-0 ${courante ? "bg-accent-soft/60 font-medium" : ""}`}>
                      <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                        {numLigneExcel(l) || k + 2}
                        {courante && <span className="ml-1 text-accent">←</span>}
                      </td>
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1.5 whitespace-nowrap">{String(l[h] ?? "")}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Champs corrigeables */}
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHAMPS_DON.map((champ) => {
              const brut = mapping[champ.key] ? String(lignes[i]?.[mapping[champ.key]] ?? "") : "";
              const invalide =
                (champ.key === "montant" && !okMontant) || (champ.key === "date_don" && !okDate);
              return (
                <Field key={champ.key} label={champ.label + (champ.pii ? " 🔒" : "")}>
                  <input
                    type={champ.key === "date_don" ? "date" : "text"}
                    inputMode={champ.key === "montant" ? "decimal" : undefined}
                    value={form[champ.key] ?? ""}
                    onChange={(e) => set(champ.key, e.target.value)}
                    className={`${inputCls} ${invalide ? "border-negative" : ""}`}
                    placeholder={champ.key === "montant" ? "0,00" : ""}
                  />
                  {brut !== "" && (
                    <span className="mt-1 block truncate text-[11px] text-muted" title={`Valeur d'origine : ${brut}`}>
                      origine : {brut}
                    </span>
                  )}
                </Field>
              );
            })}
          </div>

          {/* État recalculé */}
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            {okMontant && okDate ? (
              <span className="text-positive">✓ Montant et date valides — ligne importable.</span>
            ) : (
              <span className="text-negative">
                ✕ {!okMontant ? "Montant manquant/illisible. " : ""}
                {!okDate ? "Date manquante ou invalide." : ""}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={onReinit}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface-2"
            >
              Rétablir l&apos;origine
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
                Annuler
              </button>
              <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
