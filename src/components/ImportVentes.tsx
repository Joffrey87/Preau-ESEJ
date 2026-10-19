"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compresserPhoto } from "@/lib/compresserPhoto";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { lignesDepuisTableau, type LigneVenteLue } from "@/lib/lectureVentes";
import { DOMAINES, type DomaineVente, type ModeAttendu, type Payeur, type SousCategorie } from "@/lib/ventes";
import { Modal } from "./GestionComptes";

// Import de ventes (onglet Ventes diverses) : photo / PDF lus par Claude, ou tableau Excel / CSV. Aperçu modifiable
// (objet de vente, famille ou personne, montant, date, mode), puis création des ventes attendues ; les ventes en
// liquide peuvent être portées directement en Caisse (payées).

const MODES_IMPORT: { v: ModeAttendu; label: string }[] = [
  { v: "liquide", label: "Liquide" },
  { v: "cheque", label: "Chèque" },
  { v: "virement", label: "Virement à venir" },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Ligne = {
  cle: number;
  garder: boolean;
  objetLu: string;
  /** Id de l'objet de vente, ou "nouveau" (créé d'après objetLu). */
  objet: string;
  payeurLu: string;
  /** "famille:id" | "contact:id" | "libre" (libellé saisi). */
  payeur: string;
  montant: string;
  date: string;
  mode: ModeAttendu;
  modeDevine: boolean;
};

/** Famille ou personne reconnue d'après le nom écrit (égalité, ou nom de famille contenu une seule fois). */
function reconnaitrePayeur(texte: string, payeurs: Payeur[]): string {
  const t = norm(texte);
  if (!t) return "libre";
  const exact = payeurs.find((p) => norm(p.libelle) === t);
  if (exact) return `${exact.kind}:${exact.id}`;
  const mots = ` ${t} `;
  const familles = payeurs.filter((p) => p.kind === "famille" && norm(p.libelle) && mots.includes(` ${norm(p.libelle)} `));
  if (familles.length === 1) return `famille:${familles[0].id}`;
  const contacts = payeurs.filter((p) => p.kind === "contact" && norm(p.libelle).split(" ").every((m) => mots.includes(` ${m} `)));
  if (contacts.length === 1) return `contact:${contacts[0].id}`;
  return "libre";
}

function reconnaitreObjet(texte: string, objets: SousCategorie[]): string {
  const t = norm(texte);
  if (!t) return objets.length === 1 ? objets[0].id : "";
  const o = objets.find((x) => norm(x.nom) === t) ?? objets.find((x) => t.includes(norm(x.nom)) || norm(x.nom).includes(t));
  return o?.id ?? "nouveau";
}

export default function ImportVentes({
  domaine,
  exerciceId,
  objets,
  payeurs,
  onFini,
}: {
  domaine: DomaineVente;
  exerciceId: string;
  /** Objets de vente (sous-catégories) du domaine. */
  objets: SousCategorie[];
  payeurs: Payeur[];
  onFini: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [fichier, setFichier] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const [liquidePaye, setLiquidePaye] = useState(true);
  const libDomaine = DOMAINES.find((d) => d.v === domaine)?.label ?? "";

  const fermer = () => {
    setOuvert(false);
    setLignes(null);
    setErreur("");
    setFichier("");
  };

  const preparer = (lues: LigneVenteLue[]) =>
    setLignes(
      lues.map((l, i) => ({
        cle: i,
        garder: l.montant != null,
        objetLu: l.objet ?? "",
        objet: reconnaitreObjet(l.objet ?? "", objets),
        payeurLu: l.payeur ?? "",
        payeur: reconnaitrePayeur(l.payeur ?? "", payeurs),
        montant: l.montant != null ? String(l.montant) : "",
        date: l.date ?? "",
        mode: l.mode ?? "virement",
        modeDevine: l.mode == null,
      })),
    );

  async function lire(f: File | undefined) {
    if (!f) return;
    setErreur("");
    setBusy(true);
    setFichier(f.name);
    try {
      if (/\.(xlsx|xls|csv)$/i.test(f.name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        const rangees = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
        preparer(lignesDepuisTableau(rangees.slice(0, 500)));
      } else {
        const form = new FormData();
        form.append("fichier", f.type === "application/pdf" ? f : await compresserPhoto(f));
        const rep = await fetch("/api/lecture-ventes", { method: "POST", body: form });
        const j = (await rep.json()) as { lignes?: LigneVenteLue[]; erreur?: string; detail?: string };
        if (!rep.ok) throw new Error([j.erreur ?? "Lecture impossible", j.detail && `Détail : ${j.detail}`].filter(Boolean).join(" "));
        preparer(j.lignes ?? []);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible");
    }
    setBusy(false);
  }

  const maj = (cle: number, patch: Partial<Ligne>) => setLignes((ls) => (ls ?? []).map((l) => (l.cle === cle ? { ...l, ...patch } : l)));
  const retenues = (lignes ?? []).filter((l) => l.garder);
  const total = retenues.reduce((a, l) => a + (Number(l.montant.replace(",", ".")) || 0), 0);

  async function importer() {
    setErreur("");
    if (!exerciceId) return setErreur("Choisissez un exercice.");
    if (retenues.length === 0) return setErreur("Aucune ligne retenue.");
    for (const l of retenues) {
      const m = Number(l.montant.replace(",", "."));
      if (!isFinite(m) || m <= 0) return setErreur(`Montant invalide (${l.payeurLu || l.objetLu || "ligne"}).`);
      if (!l.objet || (l.objet === "nouveau" && !l.objetLu.trim())) return setErreur(`Objet de vente à choisir (${l.payeurLu || formatEuros(m)}).`);
      if (l.payeur === "libre" && !l.payeurLu.trim()) return setErreur(`Famille ou personne à indiquer (${l.objetLu || formatEuros(m)}).`);
    }
    setBusy(true);
    const sb = createClient();

    // Objets de vente nouveaux : créés une fois chacun (même nom = même objet).
    const crees = new Map<string, string>();
    for (const l of retenues.filter((x) => x.objet === "nouveau")) {
      const k = norm(l.objetLu);
      if (crees.has(k)) continue;
      const { data, error } = await sb.from("ventes_sous_categories").insert({ nom: l.objetLu.trim(), domaine }).select("id").single();
      if (error || !data) {
        setBusy(false);
        return setErreur(`Création de l'objet « ${l.objetLu} » impossible : ${error?.message ?? ""}`);
      }
      crees.set(k, data.id as string);
    }

    let nb = 0;
    const echecs: string[] = [];
    for (const l of retenues) {
      const m = Math.round(Number(l.montant.replace(",", ".")) * 100) / 100;
      const [kind, id] = l.payeur.split(":");
      const p = payeurs.find((x) => x.kind === kind && x.id === id);
      const libelle = p?.libelle ?? l.payeurLu.trim();
      const notes = [l.date ? `Vente du ${formatDate(l.date)}` : null, `Importé (${fichier})`].filter(Boolean).join(" · ");
      const { data: due, error } = await sb
        .from("ventes_dues")
        .insert({
          exercice_id: exerciceId,
          sous_categorie_id: l.objet === "nouveau" ? crees.get(norm(l.objetLu)) : l.objet,
          domaine,
          famille_id: kind === "famille" ? id : null,
          contact_id: kind === "contact" ? id : null,
          libelle_payeur: libelle,
          montant_attendu: m,
          mode_attendu: l.mode,
          notes,
        })
        .select("id")
        .single();
      if (error || !due) {
        echecs.push(`${libelle} : ${error?.message ?? "échec"}`);
        continue;
      }
      nb++;
      if (l.mode === "liquide" && liquidePaye) {
        const { error: e2 } = await sb.rpc("ventes_paiement_liquide", {
          p_due: due.id,
          p_montant: m,
          p_date: l.date || todayISO(),
          p_libelle: `Vente · ${libelle}`,
        });
        if (e2) echecs.push(`${libelle} : vente créée, caisse non écrite (${e2.message})`);
      }
    }
    setBusy(false);
    if (echecs.length > 0) {
      setLignes(null);
      setErreur(`${nb} vente${nb > 1 ? "s" : ""} importée${nb > 1 ? "s" : ""}, mais : ${echecs.join(" ; ")}`);
      onFini();
      return;
    }
    fermer();
    onFini();
  }

  const sel = "w-full rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-accent";

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
        Importer des ventes
      </button>
      {ouvert && (
        <Modal title={`Importer des ventes · ${libDomaine}`} onClose={fermer} large>
          <div className="space-y-3 text-sm">
            {!lignes && (
              <>
                <p className="text-muted">
                  Photo, PDF ou tableau Excel / CSV. Pour un tableau, la première ligne porte les titres : <strong>Objet</strong>,{" "}
                  <strong>Montant</strong>, <strong>Date</strong> (facultative), <strong>Famille</strong>, <strong>Mode</strong> (liquide, chèque ou
                  virement à venir).
                </p>
                <label className={`inline-flex cursor-pointer items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg ${busy ? "opacity-50" : "hover:opacity-90"}`}>
                  {busy ? "Lecture en cours…" : "Choisir le fichier"}
                  <input
                    type="file"
                    accept="image/*,application/pdf,.xlsx,.xls,.csv,text/csv"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      void lire(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}

            {lignes && (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    {fichier} · {lignes.length} ligne{lignes.length > 1 ? "s" : ""} lue{lignes.length > 1 ? "s" : ""} · {retenues.length} retenue
                    {retenues.length > 1 ? "s" : ""} · {formatEuros(total)}
                  </span>
                  <select
                    className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                    value=""
                    onChange={(e) => e.target.value && setLignes((ls) => (ls ?? []).map((l) => ({ ...l, objet: e.target.value })))}
                  >
                    <option value="">Même objet pour toutes les lignes…</option>
                    {objets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nom}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setLignes(null)} className="ml-auto text-accent hover:underline">
                    Autre fichier
                  </button>
                </div>
                <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-border text-left text-muted">
                        <th className="px-2 py-1.5" />
                        <th className="px-2 py-1.5 font-medium">Objet de vente</th>
                        <th className="px-2 py-1.5 font-medium">Famille ou personne</th>
                        <th className="px-2 py-1.5 font-medium text-right">Montant</th>
                        <th className="px-2 py-1.5 font-medium">Date</th>
                        <th className="px-2 py-1.5 font-medium">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.cle} className={`border-b border-border/60 align-top ${l.garder ? "" : "opacity-50"}`}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={l.garder} onChange={(e) => maj(l.cle, { garder: e.target.checked })} />
                          </td>
                          <td className="w-48 px-2 py-1.5">
                            <select className={`${sel} ${l.objet ? "" : "border-gold"}`} value={l.objet} onChange={(e) => maj(l.cle, { objet: e.target.value })}>
                              <option value="">— à choisir —</option>
                              {objets.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.nom}
                                </option>
                              ))}
                              {l.objetLu && <option value="nouveau">Créer « {l.objetLu} »</option>}
                            </select>
                            {l.objetLu && l.objet !== "nouveau" && <div className="mt-0.5 truncate text-[10.5px] text-muted">lu : {l.objetLu}</div>}
                          </td>
                          <td className="w-56 px-2 py-1.5">
                            <select className={sel} value={l.payeur} onChange={(e) => maj(l.cle, { payeur: e.target.value })}>
                              <option value="libre">Tel qu&apos;écrit (sans fiche)</option>
                              <optgroup label="Familles">
                                {payeurs
                                  .filter((p) => p.kind === "famille")
                                  .map((p) => (
                                    <option key={p.id} value={`famille:${p.id}`}>
                                      {p.libelle}
                                    </option>
                                  ))}
                              </optgroup>
                              <optgroup label="Personnes (Carnet)">
                                {payeurs
                                  .filter((p) => p.kind === "contact")
                                  .map((p) => (
                                    <option key={p.id} value={`contact:${p.id}`}>
                                      {p.libelle}
                                    </option>
                                  ))}
                              </optgroup>
                            </select>
                            {l.payeur === "libre" ? (
                              <input
                                className={`mt-1 ${sel} ${l.payeurLu.trim() ? "" : "border-gold"}`}
                                value={l.payeurLu}
                                placeholder="Nom"
                                onChange={(e) => maj(l.cle, { payeurLu: e.target.value })}
                              />
                            ) : (
                              l.payeurLu && <div className="mt-0.5 truncate text-[10.5px] text-muted">lu : {l.payeurLu}</div>
                            )}
                          </td>
                          <td className="w-24 px-2 py-1.5">
                            <input className={`${sel} text-right`} value={l.montant} onChange={(e) => maj(l.cle, { montant: e.target.value })} />
                          </td>
                          <td className="w-32 px-2 py-1.5">
                            <input type="date" className={sel} value={l.date} onChange={(e) => maj(l.cle, { date: e.target.value })} />
                          </td>
                          <td className="w-36 px-2 py-1.5">
                            <select
                              className={`${sel} ${l.modeDevine ? "border-gold" : ""}`}
                              value={l.mode}
                              title={l.modeDevine ? "Mode non lu : à vérifier" : undefined}
                              onChange={(e) => maj(l.cle, { mode: e.target.value as ModeAttendu, modeDevine: false })}
                            >
                              {MODES_IMPORT.map((m) => (
                                <option key={m.v} value={m.v}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {lignes.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-2 py-6 text-center text-muted">
                            Aucune vente reconnue dans ce fichier.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={liquidePaye} onChange={(e) => setLiquidePaye(e.target.checked)} />
                  Ventes en liquide déjà encaissées : les écrire payées dans la Caisse {libDomaine}
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={fermer} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={importer}
                    disabled={busy || retenues.length === 0}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Import…" : `Importer ${retenues.length} vente${retenues.length > 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
            {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
