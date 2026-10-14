"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { compresserPhoto } from "@/lib/compresserPhoto";
import { solde, type Caisse, type CaisseMouvement, type LigneCaisseProposee } from "@/lib/caisses";
import type { DomaineVente } from "@/lib/ventes";
import { DOMAINES } from "@/lib/ventes";

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const btn = "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const btnGhost = "rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

export default function GestionCaisses({
  caisses,
  mouvements,
  domaines,
  estTresorier,
  peutModifier,
}: {
  caisses: Caisse[];
  mouvements: CaisseMouvement[];
  domaines: DomaineVente[];
  estTresorier: boolean;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const visibles = useMemo(() => caisses.filter((c) => domaines.includes(c.cle) || estTresorier), [caisses, domaines, estTresorier]);
  const [caisseId, setCaisseId] = useState(visibles[0]?.id ?? "");
  const [mutualise, setMutualise] = useState(false);
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  // Saisie manuelle
  const [date, setDate] = useState(todayISO());
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [sens, setSens] = useState<"entree" | "sortie">("entree");

  // Import
  const [preview, setPreview] = useState<(LigneCaisseProposee & { garder: boolean })[] | null>(null);
  const [caisseImport, setCaisseImport] = useState("");

  const caisseActive = visibles.find((c) => c.id === caisseId) ?? visibles[0];
  const soldes = visibles.map((c) => ({ caisse: c, solde: solde(c, mouvements) }));
  const totalMutualise = soldes.reduce((s, x) => s + x.solde, 0);
  const liste = useMemo(() => {
    if (mutualise && (estTresorier || domaines.length > 1)) return mouvements.filter((m) => visibles.some((c) => c.id === m.caisse_id));
    return mouvements.filter((m) => m.caisse_id === (caisseActive?.id ?? ""));
  }, [mouvements, mutualise, caisseActive, visibles, estTresorier, domaines]);

  async function ajouterManuel(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!caisseActive) return;
    const n = Number(String(montant).replace(",", "."));
    if (!isFinite(n) || n <= 0) return setErreur("Montant invalide.");
    if (!libelle.trim()) return setErreur("Libellé obligatoire.");
    setBusy(true);
    const { error } = await createClient().from("caisse_mouvements").insert({
      caisse_id: caisseActive.id,
      date,
      libelle: libelle.trim(),
      montant: sens === "entree" ? n : -n,
      source: "manuel",
    });
    setBusy(false);
    if (error) return setErreur(error.message);
    setLibelle("");
    setMontant("");
    router.refresh();
  }

  async function supprimer(id: string) {
    if (!window.confirm("Supprimer ce mouvement ?")) return;
    setBusy(true);
    const { error } = await createClient().from("caisse_mouvements").delete().eq("id", id);
    setBusy(false);
    if (error) setErreur(error.message);
    else router.refresh();
  }

  async function lirePhoto(f: File) {
    setErreur("");
    setBusy(true);
    setPreview(null);
    try {
      const fichier = await compresserPhoto(f);
      const form = new FormData();
      form.append("fichier", fichier);
      const rep = await fetch("/api/lecture-caisse", { method: "POST", body: form });
      const j = (await rep.json()) as { lignes?: LigneCaisseProposee[]; erreur?: string };
      if (!rep.ok) throw new Error(j.erreur ?? "Lecture impossible");
      setPreview((j.lignes ?? []).map((l) => ({ ...l, garder: !!(l.montant && l.libelle) })));
      setCaisseImport(caisseActive?.id ?? "");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible");
    }
    setBusy(false);
  }

  async function lireExcel(f: File) {
    setErreur("");
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, { header: 1, defval: "" }) as (string | number | Date)[][];
      const lignes: (LigneCaisseProposee & { garder: boolean })[] = [];
      for (const row of rows.slice(0, 200)) {
        if (!row || row.length < 2) continue;
        let date: string | null = null;
        let libelle: string | null = null;
        let montant: number | null = null;
        for (const cell of row) {
          if (cell instanceof Date) date = cell.toISOString().slice(0, 10);
          else if (typeof cell === "number" && montant == null) montant = Math.round(cell * 100) / 100;
          else if (typeof cell === "string" && cell.trim()) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(cell.trim())) date = cell.trim();
            else if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}$/.test(cell.trim())) {
              const [j, m, a] = cell.trim().split(/[\/.]/);
              date = `${a.length === 2 ? "20" + a : a}-${m.padStart(2, "0")}-${j.padStart(2, "0")}`;
            } else if (libelle == null) libelle = cell.trim();
            else if (montant == null) {
              const n = Number(cell.replace(/\s/g, "").replace(",", "."));
              if (isFinite(n) && n !== 0) montant = Math.round(n * 100) / 100;
            }
          }
        }
        if (libelle || montant != null) lignes.push({ date, libelle, montant, garder: !!(montant && libelle) });
      }
      if (!lignes.length) throw new Error("Aucune ligne lisible dans le fichier.");
      setPreview(lignes);
      setCaisseImport(caisseActive?.id ?? "");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Import Excel impossible");
    }
    setBusy(false);
  }

  async function confirmerImport() {
    if (!preview || !caisseImport) return;
    const aImporter = preview.filter((l) => l.garder && l.montant != null && l.libelle);
    if (!aImporter.length) return setErreur("Aucune ligne à importer.");
    setBusy(true);
    setErreur("");
    const sb = createClient();
    const { error } = await sb.from("caisse_mouvements").insert(
      aImporter.map((l) => ({
        caisse_id: caisseImport,
        date: l.date || todayISO(),
        libelle: (l.libelle ?? "").trim(),
        montant: l.montant!,
        source: "import" as const,
      })),
    );
    setBusy(false);
    if (error) return setErreur(error.message);
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {soldes.map(({ caisse, solde: s }) => (
          <button
            key={caisse.id}
            type="button"
            onClick={() => {
              setCaisseId(caisse.id);
              setMutualise(false);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition ${!mutualise && caisseId === caisse.id ? "border-accent bg-accent/5" : "border-border bg-surface hover:bg-surface-2"}`}
          >
            <div className="text-xs text-muted">{caisse.nom}</div>
            <div className={`text-lg font-semibold tabular-nums ${s >= 0 ? "text-positive" : "text-negative"}`}>{formatEuros(s)}</div>
          </button>
        ))}
        {(estTresorier || domaines.length > 1) && (
          <button
            type="button"
            onClick={() => setMutualise(true)}
            className={`rounded-xl border px-4 py-3 text-left transition ${mutualise ? "border-accent bg-accent/5" : "border-border bg-surface hover:bg-surface-2"}`}
          >
            <div className="text-xs text-muted">Total mutualisé</div>
            <div className={`text-lg font-semibold tabular-nums ${totalMutualise >= 0 ? "text-positive" : "text-negative"}`}>{formatEuros(totalMutualise)}</div>
          </button>
        )}
        <Link href="/ventes-diverses" className={btnGhost + " ml-auto self-center"}>
          Ventes diverses
        </Link>
      </div>

      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

      {peutModifier && caisseActive && !mutualise && (
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={ajouterManuel} className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Mouvement manuel · {caisseActive.nom}</h2>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} required />
              <select className={input} value={sens} onChange={(e) => setSens(e.target.value as "entree" | "sortie")}>
                <option value="entree">Entrée (+)</option>
                <option value="sortie">Sortie (−)</option>
              </select>
            </div>
            <input className={input} placeholder="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} required />
            <input className={input} placeholder="Montant (€)" value={montant} onChange={(e) => setMontant(e.target.value)} required />
            <button type="submit" disabled={busy} className={btn}>
              Ajouter
            </button>
          </form>

          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <h2 className="text-sm font-semibold">Importer</h2>
            <p className="text-xs text-muted">Photo d&apos;une feuille manuscrite (prioritaire), puis Excel. Vérifiez et corrigez avant de confirmer.</p>
            <div className="flex flex-wrap gap-2">
              <label className={btnGhost + " cursor-pointer"}>
                Photo / PDF
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lirePhoto(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className={btnGhost + " cursor-pointer"}>
                Excel / CSV
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lireExcel(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <section className="rounded-xl border border-accent/40 bg-surface p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Aperçu avant import ({preview.filter((l) => l.garder).length} lignes)</h2>
            <select className={input + " w-auto"} value={caisseImport} onChange={(e) => setCaisseImport(e.target.value)}>
              {visibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy} className={btn + " ml-auto"} onClick={confirmerImport}>
              Confirmer l&apos;import
            </button>
            <button type="button" className={btnGhost} onClick={() => setPreview(null)}>
              Annuler
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1">OK</th>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1">Libellé</th>
                  <th className="px-2 py-1 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((l, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={l.garder} onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, garder: e.target.checked } : x)))} />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="date"
                        className={input}
                        value={l.date ?? ""}
                        onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, date: e.target.value || null } : x)))}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={input}
                        value={l.libelle ?? ""}
                        onChange={(e) => setPreview((p) => p!.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={input + " text-right"}
                        value={l.montant ?? ""}
                        onChange={(e) =>
                          setPreview((p) =>
                            p!.map((x, j) => (j === i ? { ...x, montant: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) } : x)),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {mutualise ? "Mouvements (toutes caisses)" : caisseActive?.nom ?? "Mouvements"}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Date</th>
              {mutualise && <th className="px-4 py-2 font-medium">Caisse</th>}
              <th className="px-4 py-2 font-medium">Libellé</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium text-right">Montant</th>
              {peutModifier && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Aucun mouvement.
                </td>
              </tr>
            ) : (
              liste.map((m) => (
                <tr key={m.id} className="border-b border-border/60">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(m.date)}</td>
                  {mutualise && <td className="px-4 py-2 text-muted">{caisses.find((c) => c.id === m.caisse_id)?.nom}</td>}
                  <td className="px-4 py-2">{m.libelle}</td>
                  <td className="px-4 py-2 text-xs text-muted">{m.source === "vente" ? "Vente diverse" : m.source === "import" ? "Import" : "Manuel"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${m.montant >= 0 ? "text-positive" : "text-negative"}`}>
                    {formatEuros(m.montant)}
                  </td>
                  {peutModifier && (
                    <td className="px-4 py-2 text-right">
                      <button type="button" disabled={busy} className="text-xs text-muted hover:text-negative" onClick={() => supprimer(m.id)}>
                        Suppr.
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted">
        Domaines visibles : {domaines.map((d) => DOMAINES.find((x) => x.v === d)?.label).join(", ")}. Les paiements liquides des ventes diverses créent automatiquement une entrée dans la caisse du même domaine.
      </p>
    </div>
  );
}
