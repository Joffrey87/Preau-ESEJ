"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputCls } from "./GestionComptes";
import { ETAPES_POSTALES, placerEtapePostale, type EtapePostale } from "./recusCommun";
import { formatDate, todayISO } from "@/lib/format";

/**
 * Courrier postal : l'étape d'un reçu (À passer / Vérifier envoi postal / Envoyé) se change directement dans la
 * pastille de statut, qui est une liste. Le changement porte sur tous les dons du reçu ; « Envoyé » demande la date
 * d'envoi. Chaque changement est annulable pendant quelques secondes (bandeau en bas de page).
 */

type Annulation = { message: string; annuler: () => Promise<string | null> };
const ecouteurs = new Set<(a: Annulation) => void>();
const annoncer = (a: Annulation) => ecouteurs.forEach((f) => f(a));

/** Bandeau « Annuler » : à placer une fois dans les pages qui affichent des listes d'étapes. */
export function BandeauEtapePostale() {
  const router = useRouter();
  const [a, setA] = useState<Annulation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const f = (x: Annulation) => {
      setErreur(null);
      setA(x);
    };
    ecouteurs.add(f);
    return () => void ecouteurs.delete(f);
  }, []);
  useEffect(() => {
    if (!a) return;
    const t = setTimeout(() => setA(null), 10000);
    return () => clearTimeout(t);
  }, [a]);

  if (!a) return null;
  return (
    <div className="fixed bottom-16 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm shadow-lg">
      <span>{erreur ?? a.message}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const e = await a.annuler();
          setBusy(false);
          if (e) return setErreur("Annulation impossible : " + e);
          setA(null);
          router.refresh();
        }}
        className="font-medium text-accent hover:underline disabled:opacity-50"
      >
        {busy ? "Annulation…" : "Annuler"}
      </button>
      <button type="button" onClick={() => setA(null)} aria-label="Fermer" className="text-muted hover:text-foreground">
        ✕
      </button>
    </div>
  );
}

const TON_ETAPE: Record<EtapePostale, string> = {
  passer: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  verifier: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  envoye: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export default function EtapePostaleListe({
  numero,
  idsDons,
  etape,
  libelleEnvoye = "Envoyé",
}: {
  /** Numéro du reçu : l'étape se porte sur tous ses dons. */
  numero: string;
  idsDons: string[];
  etape: EtapePostale;
  /** Intitulé affiché pour « Envoyé » (« Posté » dans l'onglet Dons). */
  libelleEnvoye?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dateDe, setDateDe] = useState<{ date: string } | null>(null);

  const libelle = (e: EtapePostale) => (e === "envoye" ? libelleEnvoye : (ETAPES_POSTALES.find((x) => x.cle === e)?.libelle ?? e));

  async function appliquer(cible: EtapePostale, date?: string) {
    setBusy(true);
    setErreur(null);
    const supabase = createClient();
    // Instantané de l'état actuel : l'annulation le rétablit tel quel.
    const [{ data: avantDons }, { data: avantRecu }] = await Promise.all([
      supabase.from("dons").select("id, recu_etat").in("id", idsDons),
      supabase.from("recus").select("envoye_le, envoi_mode, envoi_precision").eq("recu_numero", numero).maybeSingle(),
    ]);
    const e = await placerEtapePostale(supabase, numero, idsDons, cible, date);
    setBusy(false);
    if (e) return setErreur(e);
    annoncer({
      message: `Reçu ${numero} : « ${libelle(cible)} »${cible === "envoye" && date ? ` le ${formatDate(date)}` : ""} (${idsDons.length} don${idsDons.length > 1 ? "s" : ""}).`,
      annuler: async () => {
        const c = createClient();
        const { error: errRecu } = await c
          .from("recus")
          .update({ envoye_le: avantRecu?.envoye_le ?? null, envoi_mode: avantRecu?.envoi_mode ?? null, envoi_precision: avantRecu?.envoi_precision ?? null })
          .eq("recu_numero", numero);
        if (errRecu) return errRecu.message;
        const parEtat = new Map<string | null, string[]>();
        for (const d of avantDons ?? []) {
          const k = (d.recu_etat as string | null) ?? null;
          parEtat.set(k, [...(parEtat.get(k) ?? []), d.id as string]);
        }
        for (const [etat, ids] of parEtat) {
          const { error } = await c.from("dons").update({ recu_etat: etat }).in("id", ids);
          if (error) return error.message;
        }
        return null;
      },
    });
    router.refresh();
  }

  function choisir(cible: EtapePostale) {
    if (cible === etape) return;
    if (cible === "envoye") return setDateDe({ date: todayISO() });
    void appliquer(cible);
  }

  return (
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <span
        className={`relative inline-flex items-center rounded-full text-xs font-medium ${TON_ETAPE[etape]} ${busy ? "opacity-60" : ""}`}
        title={erreur ?? "Changer l'étape de ce courrier postal (tous les dons du reçu)"}
      >
        <select
          value={etape}
          disabled={busy}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => choisir(e.target.value as EtapePostale)}
          aria-label={`Étape du courrier, reçu ${numero}`}
          className="cursor-pointer appearance-none rounded-full bg-transparent py-0.5 pl-2.5 pr-6 font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {ETAPES_POSTALES.map((x) => (
            <option key={x.cle} value={x.cle} className="bg-surface text-foreground">
              {libelle(x.cle)}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-2 text-[10px]">
          ▾
        </span>
      </span>
      {erreur && <div className="mt-1 text-xs text-negative">{erreur}</div>}

      {dateDe && (
        <Modal title={`Courrier posté — reçu ${numero}`} onClose={() => setDateDe(null)} fermerAuClicExterieur>
          <div className="space-y-4 text-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-muted">
              Le courrier a été posté. L&apos;étape s&apos;applique aux {idsDons.length} don{idsDons.length > 1 ? "s" : ""} de ce reçu.
            </p>
            <Field label="Date d'envoi">
              <input type="date" value={dateDe.date} max={todayISO()} onChange={(e) => setDateDe({ date: e.target.value })} className={inputCls} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDateDe(null)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
              <button
                type="button"
                disabled={!dateDe.date}
                onClick={() => {
                  const date = dateDe.date;
                  setDateDe(null);
                  void appliquer("envoye", date);
                }}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                Valider
              </button>
            </div>
          </div>
        </Modal>
      )}
    </span>
  );
}
