"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { classeEn, type Classe as Niveau } from "@/lib/eleves";
import type { Classe } from "@/lib/bulletins";
import { construireTrombiPdf, telechargerPdf, versJpeg, type EleveTrombi } from "@/lib/trombiPdf";

type Ligne = {
  id: string;
  prenom: string;
  nom: string;
  classe_entree: Niveau;
  annee_entree: string;
  decalage: number;
  sorti_le: string | null;
  date_naissance: string | null;
  photo_path: string | null;
  famille: string;
  parent1: string | null;
  parent1_telephone: string | null;
  parent1_courriel: string | null;
  parent2: string | null;
  parent2_telephone: string | null;
  parent2_courriel: string | null;
  adresse: string | null;
};

const BUCKET = "eleves-photos";
const champ = "w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-center outline-none hover:border-border focus:border-accent";
const parentsDe = (l: Ligne) =>
  [
    [l.parent1, l.parent1_telephone, l.parent1_courriel],
    [l.parent2, l.parent2_telephone, l.parent2_courriel],
  ]
    .map((x) => x.filter(Boolean).join(" · "))
    .filter(Boolean);

/** Trombinoscope et liste d'élèves d'une classe. La Directrice modifie photos, prénoms, noms et dates de naissance. */
export default function Trombinoscope({ classe, directrice }: { classe: Classe; directrice: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [vue, setVue] = useState<"trombi" | "liste">("trombi");
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { data, error } = await sb.rpc("trombinoscope", { p_classe: classe.id });
    if (error) {
      setMessage(`Échec : ${error.message}`);
      return;
    }
    const ls = (data ?? []) as Ligne[];
    setLignes(ls);
    const chemins = ls.map((l) => l.photo_path).filter((p): p is string => !!p);
    if (chemins.length) {
      const { data: signees } = await sb.storage.from(BUCKET).createSignedUrls(chemins, 3600);
      const m: Record<string, string> = {};
      for (const s of signees ?? []) if (s.path && s.signedUrl) m[s.path] = s.signedUrl;
      setUrls(m);
    } else setUrls({});
  }, [sb, classe.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des élèves de la classe
    charger();
  }, [charger]);

  async function modifier(id: string, p: { p_prenom?: string; p_nom?: string; p_naissance?: string; p_photo?: string }) {
    const { error } = await sb.rpc("eleve_fiche_modifier", { p_eleve: id, ...p });
    setMessage(error ? `Échec : ${error.message}` : null);
    if (!error) await charger();
  }

  async function photo(l: Ligne, f: File) {
    setOccupe(l.id);
    try {
      const jpeg = await versJpeg(f);
      const chemin = `${l.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(chemin, jpeg, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);
      await modifier(l.id, { p_photo: chemin });
      // L'ancienne photo n'est plus utilisée : on la retire du stockage.
      if (l.photo_path) await sb.storage.from(BUCKET).remove([l.photo_path]);
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : "envoi impossible"}`);
    } finally {
      setOccupe(null);
    }
  }

  async function exporter(type: "trombi" | "liste") {
    setOccupe("pdf");
    try {
      const eleves: EleveTrombi[] = await Promise.all(
        lignes.map(async (l) => {
          let octets: Uint8Array | null = null;
          const u = l.photo_path ? urls[l.photo_path] : undefined;
          if (type === "trombi" && u) {
            const r = await fetch(u).catch(() => null);
            if (r?.ok) octets = new Uint8Array(await (await versJpeg(await r.blob(), 500)).arrayBuffer());
          }
          return { id: l.id, prenom: l.prenom, nom: l.nom, niveau: classeEn({ ...l, initiale: null }, classe.annee_scolaire), date_naissance: l.date_naissance, photo: octets, parents: parentsDe(l), adresse: l.adresse };
        }),
      );
      const octets = await construireTrombiPdf(classe.nom, classe.annee_scolaire, eleves, type);
      telechargerPdf(octets, `${type === "trombi" ? "Trombinoscope" : "Liste des élèves"} ${classe.nom} ${classe.annee_scolaire}.pdf`);
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : "PDF impossible"}`);
    } finally {
      setOccupe(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {(["trombi", "liste"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVue(v)} className={`rounded-md px-3 py-1 text-[13px] font-medium ${vue === v ? "bg-surface text-accent shadow-sm" : "text-muted"}`}>
              {v === "trombi" ? "Trombinoscope" : "Liste des élèves"}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted">{lignes.length} élève{lignes.length > 1 ? "s" : ""}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={!!occupe} onClick={() => exporter("trombi")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-50">
            PDF trombinoscope
          </button>
          <button type="button" disabled={!!occupe} onClick={() => exporter("liste")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-50">
            PDF liste
          </button>
        </div>
      </div>
      {message && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{message}</p>}
      {directrice && vue === "trombi" && <p className="text-[12px] text-muted">Touchez une photo pour l&apos;ajouter ou la remplacer ; touchez un prénom ou un nom pour le corriger.</p>}

      {vue === "trombi" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {lignes.map((l) => {
            const u = l.photo_path ? urls[l.photo_path] : undefined;
            return (
              <div key={l.id} className="rounded-xl border border-border bg-surface p-2 text-center text-[13px]">
                <label className={`relative block aspect-[4/5] overflow-hidden rounded-lg bg-surface-2 ${directrice ? "cursor-pointer" : ""}`}>
                  {u ? (
                    // eslint-disable-next-line @next/next/no-img-element -- adresse signée temporaire du stockage privé
                    <img src={u} alt={`${l.prenom} ${l.nom}`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xl font-semibold text-muted">
                      {(l.prenom[0] ?? "") + (l.nom[0] ?? "")}
                    </span>
                  )}
                  {occupe === l.id && <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">Envoi…</span>}
                  {directrice && (
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && photo(l, e.target.files[0])} />
                  )}
                </label>
                {directrice ? (
                  <>
                    <input key={`p${l.prenom}`} defaultValue={l.prenom} aria-label="Prénom" className={`${champ} mt-1 font-medium`}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.prenom && modifier(l.id, { p_prenom: e.target.value.trim() })} />
                    <input key={`n${l.nom}`} defaultValue={l.nom} aria-label="Nom" className={`${champ} text-[12px] text-muted`}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.nom && modifier(l.id, { p_nom: e.target.value.trim() })} />
                  </>
                ) : (
                  <>
                    <div className="mt-1 font-medium">{l.prenom}</div>
                    <div className="text-[12px] text-muted">{l.nom}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-[13px]">
            <thead>
              <tr className="bg-accent text-[11px] text-accent-fg">
                <th className="px-3 py-2 text-left font-medium">Élève</th>
                <th className="px-2 py-2 font-medium">Niveau</th>
                <th className="px-2 py-2 font-medium">Date de naissance</th>
                {directrice && <th className="px-3 py-2 text-left font-medium">Parents</th>}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{l.nom.toUpperCase()}</span> {l.prenom}
                  </td>
                  <td className="px-2 py-1.5 text-center">{classeEn({ ...l, initiale: null }, classe.annee_scolaire)}</td>
                  <td className="px-2 py-1.5 text-center">
                    {directrice ? (
                      <input type="date" key={l.date_naissance ?? ""} defaultValue={l.date_naissance ?? ""} aria-label={`Date de naissance de ${l.prenom}`}
                        onBlur={(e) => e.target.value !== (l.date_naissance ?? "") && modifier(l.id, { p_naissance: e.target.value })}
                        className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[13px]" />
                    ) : (
                      (l.date_naissance ?? "").split("-").reverse().join("/")
                    )}
                  </td>
                  {directrice && (
                    <td className="px-3 py-1.5 text-[12px]">
                      {parentsDe(l).map((p) => (
                        <div key={p}>{p}</div>
                      ))}
                      {l.adresse && <div className="text-muted">{l.adresse}</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
