"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCarnet } from "@/components/CarnetProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { inputCls } from "./GestionComptes";
import { CLASSES, classeEn, depuis, termineEnJuin, type Classe, type Eleve } from "@/lib/eleves";
import { motsFamille } from "@/lib/importEnrichi";

type Famille = { id: string; nom: string };

type LigneImport = {
  brut: string;
  prenom: string;
  nom: string;
  classe: Classe | null;
  annee: string | null;
  candidats: Famille[];
  famille: string; // choix (id) ; "" = à choisir
  inclus: boolean;
  doublon: boolean;
};

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « CE 1 », « ce1 », « Cm2 » → CE1, CM2 ; null si ce n'est pas une classe. */
function lireClasse(s: string): Classe | null {
  const t = s.toUpperCase().replace(/\s+/g, "");
  return (CLASSES as readonly string[]).includes(t) ? (t as Classe) : null;
}

/**
 * Une ligne de la liste de l'école : « Prénom NOM  CLASSE [année d'entrée] ».
 * Le prénom va jusqu'au premier mot en capitales ; les mots en capitales font
 * le nom. Séparateurs acceptés : espaces, tabulations, « ; », « — ».
 */
function lireLigne(brut: string): Omit<LigneImport, "candidats" | "famille" | "inclus" | "doublon"> {
  const mots = brut.replace(/[;—–\t|,]/g, " ").split(/\s+/).filter(Boolean);
  let annee: string | null = null;
  let classe: Classe | null = null;
  const restants: string[] = [];
  for (let k = 0; k < mots.length; k++) {
    const m = mots[k];
    if (/^\d{4}-\d{4}$/.test(m)) { annee = m; continue; }
    // « CE 1 » en deux mots
    if (!classe && /^(ce|cm)$/i.test(m) && /^[12]$/.test(mots[k + 1] ?? "")) { classe = lireClasse(m + mots[k + 1]); k++; continue; }
    if (!classe && lireClasse(m)) { classe = lireClasse(m); continue; }
    restants.push(m);
  }
  const estCapitales = (m: string) => m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m);
  const i = restants.findIndex(estCapitales);
  const prenom = (i > 0 ? restants.slice(0, i) : restants.slice(0, 1)).join(" ");
  const nom = (i > 0 ? restants.slice(i) : restants.slice(1)).join(" ");
  return { brut, prenom, nom, classe, annee };
}

/**
 * Élèves : liste de tous les enfants (prénoms déchiffrés, coffre du carnet
 * ouvert) et import de la liste tenue par l'école. Le prénom est chiffré à
 * l'enregistrement ; seule l'initiale reste en clair.
 */
export default function ImportEleves({
  annee,
  familles,
  famillesAnnee,
  eleves,
}: {
  annee: string;
  familles: Famille[];
  /** Familles inscrites cette année : elles passent en premier au rattachement. */
  famillesAnnee: string[];
  eleves: Eleve[];
}) {
  const router = useRouter();
  const carnet = useCarnet();
  const { estOuvert, dechiffrer, chiffrer } = carnet;
  const [prenoms, setPrenoms] = useState<Record<string, string>>({});
  const [texte, setTexte] = useState("");
  const [lignes, setLignes] = useState<LigneImport[]>([]);
  const [anneeEntree, setAnneeEntree] = useState(annee);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  useEffect(() => {
    if (!estOuvert) return;
    let annule = false;
    (async () => {
      const m: Record<string, string> = {};
      for (const e of eleves) {
        if (!e.prenom_chiffre) continue;
        try {
          m[e.id] = await dechiffrer(e.prenom_chiffre);
        } catch {
          /* initiale à défaut */
        }
      }
      if (!annule) setPrenoms(m);
    })();
    return () => {
      annule = true;
    };
  }, [eleves, estOuvert, dechiffrer]);

  const nomFamille = useMemo(() => new Map(familles.map((f) => [f.id, f.nom])), [familles]);

  function analyser() {
    setMessage(null);
    const inscrites = new Set(famillesAnnee);
    const res = texte
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const base = lireLigne(l);
        const motsNom = new Set(sansAccent(base.nom).split(/[\s-]+/));
        // La famille dont tous les mots du nom figurent dans le nom de l'enfant.
        const candidats = familles
          .filter((f) => {
            const m = motsFamille(f.nom);
            return m.length > 0 && m.every((x) => motsNom.has(x));
          })
          .sort((a, b) => Number(inscrites.has(b.id)) - Number(inscrites.has(a.id)));
        const cetteAnnee = candidats.filter((c) => inscrites.has(c.id));
        const retenus = cetteAnnee.length > 0 ? cetteAnnee : candidats;
        const famille = retenus.length === 1 ? retenus[0].id : "";
        const doublon = !!famille && eleves.some(
          (e) => e.famille_id === famille && sansAccent(prenoms[e.id] ?? "") === sansAccent(base.prenom),
        );
        return { ...base, candidats: retenus, famille, inclus: !doublon && !!base.classe, doublon };
      });
    setLignes(res);
  }

  const maj = (i: number, p: Partial<LigneImport>) => setLignes((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const retenues = lignes.filter((l) => l.inclus);
  const incompletes = retenues.filter((l) => !l.famille || !l.classe || !l.prenom);

  async function importer() {
    if (!estOuvert) return setMessage({ ok: false, t: "Déverrouillez le coffre du carnet : les prénoms sont chiffrés." });
    if (incompletes.length > 0) return setMessage({ ok: false, t: `${incompletes.length} ligne(s) sans famille, classe ou prénom : complétez-les ou décochez-les.` });
    if (!/^\d{4}-\d{4}$/.test(anneeEntree)) return setMessage({ ok: false, t: "Année d'entrée au format 2026-2027." });
    setBusy(true);
    const payload = [];
    for (const l of retenues) {
      payload.push({
        famille_id: l.famille,
        prenom_chiffre: await chiffrer(l.prenom),
        initiale: l.prenom.charAt(0).toUpperCase(),
        // Classe connue pour l'année d'entrée indiquée (par défaut, cette année).
        classe_entree: l.classe,
        annee_entree: l.annee ?? anneeEntree,
        decalage: 0,
      });
    }
    const { error } = await createClient().from("eleves").insert(payload);
    setBusy(false);
    if (error) return setMessage({ ok: false, t: "Import impossible : " + error.message });
    setMessage({ ok: true, t: `${payload.length} élève(s) importé(s).` });
    setLignes([]);
    setTexte("");
    router.refresh();
  }

  const parFamille = useMemo(() => {
    const m = new Map<string, Eleve[]>();
    for (const e of eleves) m.set(e.famille_id ?? "", [...(m.get(e.famille_id ?? "") ?? []), e]);
    return [...m].sort((a, b) => (nomFamille.get(a[0]) ?? "").localeCompare(nomFamille.get(b[0]) ?? "", "fr"));
  }, [eleves, nomFamille]);

  return (
    <div className="space-y-5">
      {!estOuvert && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
          <span>🔒 Les prénoms des élèves sont chiffrés : déverrouillez le coffre du carnet pour les lire et importer.</span>
          <DeverrouillerCoffre carnet label="🔓 Déverrouiller le carnet" />
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Importer la liste de l&apos;école</h2>
        <p className="mt-1 text-xs text-muted">
          Une ligne par enfant : « Prénom NOM CLASSE », éventuellement suivie de l&apos;année d&apos;entrée à l&apos;école (2023-2024).
          Sans année, la classe est celle de l&apos;année d&apos;entrée choisie ci-dessous.
        </p>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={6}
          placeholder={"Prénom NOM CP\nPrénom NOM CE1 2024-2025"}
          className={`${inputCls} mt-2 font-mono text-xs`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={analyser} disabled={!texte.trim()} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
            Analyser
          </button>
          <label className="flex items-center gap-2 text-xs text-muted">
            Année d&apos;entrée par défaut
            <input value={anneeEntree} onChange={(e) => setAnneeEntree(e.target.value)} className={`${inputCls} w-28 py-1 text-xs`} />
          </label>
        </div>

        {lignes.length > 0 && (
          <>
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-1.5">✓</th>
                  <th className="py-1.5">Prénom</th>
                  <th className="py-1.5">Nom (liste)</th>
                  <th className="py-1.5">Classe</th>
                  <th className="py-1.5">Entrée</th>
                  <th className="py-1.5">Famille Préau</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className={`border-b border-border/50 ${l.inclus ? "" : "opacity-50"}`}>
                    <td className="py-1"><input type="checkbox" checked={l.inclus} onChange={(e) => maj(i, { inclus: e.target.checked })} /></td>
                    <td className="py-1"><input value={l.prenom} onChange={(e) => maj(i, { prenom: e.target.value })} className={`${inputCls} w-28 py-0.5 text-xs`} /></td>
                    <td className="py-1 text-muted">{l.nom}</td>
                    <td className="py-1">
                      <select value={l.classe ?? ""} onChange={(e) => maj(i, { classe: (e.target.value || null) as Classe | null })} className={`${inputCls} w-20 py-0.5 text-xs ${l.classe ? "" : "border-gold"}`}>
                        <option value="">—</option>
                        {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="py-1 text-muted">{l.annee ?? anneeEntree}</td>
                    <td className="py-1">
                      <select
                        value={l.famille}
                        onChange={(e) => maj(i, { famille: e.target.value })}
                        className={`${inputCls} w-40 py-0.5 text-xs ${l.famille ? "" : "border-gold bg-gold-soft/60"}`}
                        title={l.candidats.length > 1 ? "Plusieurs familles portent ce nom : à choisir" : undefined}
                      >
                        <option value="">{l.candidats.length > 1 ? "— à choisir —" : "— famille —"}</option>
                        {(l.candidats.length > 0 ? l.candidats : familles).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                      </select>
                      {l.doublon && <span className="ml-1 text-gold">déjà enregistré</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-end gap-3">
              {incompletes.length > 0 && <span className="text-xs text-gold">{incompletes.length} ligne(s) à compléter</span>}
              <button type="button" onClick={importer} disabled={busy || retenues.length === 0} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
                {busy ? "Import…" : `Importer ${retenues.length} élève(s)`}
              </button>
            </div>
          </>
        )}
        {message && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Élèves enregistrés ({eleves.length})</h2>
        {parFamille.length === 0 ? (
          <p className="text-sm text-muted">Aucun élève pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {parFamille.map(([fid, liste]) =>
                liste.map((e, k) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 text-muted">{k === 0 ? nomFamille.get(fid) ?? "—" : ""}</td>
                    <td className="py-1.5 font-medium">{prenoms[e.id] ?? `${e.initiale ?? "?"}.`}</td>
                    <td className="py-1.5">{classeEn(e, annee) ?? <span className="text-muted">hors école</span>}</td>
                    <td className="py-1.5 text-xs text-muted">{depuis(e)}</td>
                    <td className="py-1.5 text-xs">{termineEnJuin(e, annee) && <span className="text-gold">dernière année</span>}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
