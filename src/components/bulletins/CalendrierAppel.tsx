"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import type { Appel } from "@/lib/absences";
import { bornesAnnee, jourScolaire, joursDuMois, type PeriodeSansEcole } from "@/lib/calendrier";
import { telechargerPresentielPdf } from "@/lib/presentielPdf";

const champ = "rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Calendrier du journal d'appel : jours sans école (fériés, mercredis, week-ends, vacances zone B) et, pour chaque
 * jour d'école, l'appel de la classe (fait, partiel, manquant). Un clic choisit le jour de l'appel.
 * La Directrice gère les périodes sans école et exporte le taux de présentiel de toute l'école.
 */
export default function CalendrierAppel({
  classeId,
  annee,
  date,
  onChoisir,
  directrice,
  maj,
}: {
  classeId: string;
  annee: string;
  date: string;
  onChoisir: (d: string) => void;
  directrice: boolean;
  /** Incrémenté après chaque appel enregistré. */
  maj: number;
}) {
  const sb = useMemo(() => createClient(), []);
  const [mois, setMois] = useState(() => ({ a: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 }));
  const [calendrier, setCalendrier] = useState<PeriodeSansEcole[]>([]);
  const [appels, setAppels] = useState<Pick<Appel, "date" | "demi_journee">[]>([]);
  const [gerer, setGerer] = useState(false);
  const [nouveau, setNouveau] = useState({ libelle: "", debut: "", fin: "", type: "sans_ecole" as PeriodeSansEcole["type"] });
  const [message, setMessage] = useState<string | null>(null);
  const [export_, setExport] = useState(false);
  const aujourdhui = todayISO();

  const charger = useCallback(async () => {
    const { debut, fin } = bornesAnnee(annee);
    const [c, a] = await Promise.all([
      sb.from("calendrier_scolaire").select("*").order("debut"),
      sb.from("appels").select("date, demi_journee").eq("classe_id", classeId).gte("date", debut).lte("date", fin),
    ]);
    setCalendrier((c.data ?? []) as PeriodeSansEcole[]);
    setAppels((a.data ?? []) as Pick<Appel, "date" | "demi_journee">[]);
  }, [sb, annee, classeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement du calendrier et des appels
    charger();
  }, [charger, maj]);

  const parJour = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appels) m.set(a.date, (m.get(a.date) ?? 0) + 1);
    return m;
  }, [appels]);

  const jours = joursDuMois(mois.a, mois.m);
  const decalage = (new Date(mois.a, mois.m, 1).getDay() + 6) % 7;
  const titre = new Date(mois.a, mois.m, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const changerMois = (n: number) => setMois(({ a, m }) => ({ a: m + n < 0 ? a - 1 : m + n > 11 ? a + 1 : a, m: (m + n + 12) % 12 }));

  // Jours d'école passés sans appel (sur toute l'année jusqu'à aujourd'hui).
  const manquants = useMemo(() => {
    const { debut } = bornesAnnee(annee);
    const liste: string[] = [];
    for (let d = new Date(`${debut}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (iso > aujourdhui || iso > bornesAnnee(annee).fin) break;
      if (jourScolaire(iso, calendrier).ecole && !parJour.get(iso)) liste.push(iso);
    }
    return liste;
  }, [annee, aujourdhui, calendrier, parJour]);

  async function ajouter() {
    if (!nouveau.libelle.trim() || !nouveau.debut) return;
    const { error } = await sb.from("calendrier_scolaire").insert({
      annee_scolaire: annee,
      libelle: nouveau.libelle.trim(),
      debut: nouveau.debut,
      fin: nouveau.fin || nouveau.debut,
      type: nouveau.type,
    });
    if (error) return setMessage(`Échec : ${error.message}`);
    setNouveau({ libelle: "", debut: "", fin: "", type: "sans_ecole" });
    setMessage(null);
    await charger();
  }
  async function supprimer(p: PeriodeSansEcole) {
    if (!window.confirm(`Retirer « ${p.libelle} » du calendrier ?`)) return;
    const { error } = await sb.from("calendrier_scolaire").delete().eq("id", p.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    await charger();
  }
  async function exporter() {
    setExport(true);
    setMessage(null);
    try {
      await telechargerPresentielPdf(sb, annee);
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : "export impossible"}`);
    } finally {
      setExport(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h3 className="mr-2 text-[14px] font-semibold">Calendrier des appels</h3>
        <button type="button" onClick={() => changerMois(-1)} className="rounded-md px-2 py-0.5 text-muted hover:bg-surface-2" aria-label="Mois précédent">
          ‹
        </button>
        <span className="w-32 text-center text-[13px] font-medium capitalize">{titre}</span>
        <button type="button" onClick={() => changerMois(1)} className="rounded-md px-2 py-0.5 text-muted hover:bg-surface-2" aria-label="Mois suivant">
          ›
        </button>
        <span className={`text-[12px] ${manquants.length ? "text-negative" : "text-positive"}`}>
          {manquants.length ? `${manquants.length} jour${manquants.length > 1 ? "s" : ""} d'école sans appel depuis la rentrée` : "Aucun appel manquant"}
        </span>
        {directrice && (
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setGerer(!gerer)} className="rounded-lg border border-border px-3 py-1 text-[12.5px] hover:bg-surface-2">
              {gerer ? "Fermer" : "Jours sans école…"}
            </button>
            <button type="button" onClick={exporter} disabled={export_} className="rounded-lg bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-fg disabled:opacity-50">
              {export_ ? "Export…" : `Taux de présentiel ${annee} (PDF)`}
            </button>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="grid max-w-md grid-cols-7 gap-1 text-center text-[12px]">
          {JOURS.map((j, i) => (
            <div key={i} className="font-medium text-muted">
              {j}
            </div>
          ))}
          {Array.from({ length: decalage }, (_, i) => (
            <div key={`v${i}`} />
          ))}
          {jours.map((d) => {
            const j = jourScolaire(d, calendrier);
            const n = parJour.get(d) ?? 0;
            const passe = d <= aujourdhui;
            const style = !j.ecole
              ? "bg-surface-2 text-muted/60"
              : n >= 2
                ? "bg-positive/15 text-positive"
                : n === 1
                  ? "bg-gold-soft text-gold"
                  : passe
                    ? "bg-negative/10 text-negative"
                    : "text-foreground";
            const info = !j.ecole ? j.motif : n >= 2 ? "Appel fait" : n === 1 ? "Appel d'une seule demi-journée" : passe ? "Appel non fait" : "Jour d'école";
            return (
              <button
                key={d}
                type="button"
                title={info ?? undefined}
                onClick={() => onChoisir(d)}
                className={`rounded-md py-1.5 tabular-nums ${style} ${d === date ? "ring-2 ring-accent" : ""}`}
              >
                {Number(d.slice(8))}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-muted">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-positive/40" />Appel fait</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-gold/50" />Une demi-journée</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-negative/30" />Appel manquant</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-surface-2 ring-1 ring-border" />Sans école (férié, mercredi, week-end, vacances zone B)</span>
        </div>
        {message && <p className="mt-2 text-[12px] text-negative">{message}</p>}

        {gerer && directrice && (
          <div className="mt-4 rounded-lg border border-border">
            <p className="border-b border-border px-3 py-2 text-[12px] text-muted">
              Vacances et jours sans école (zone B, académie de Reims). Les fériés, mercredis et week-ends sont automatiques.
            </p>
            <ul className="divide-y divide-border/60 text-[13px]">
              {calendrier
                .filter((p) => p.annee_scolaire === annee)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="flex-1">{p.libelle}</span>
                    <span className="tabular-nums text-muted">
                      {p.debut === p.fin ? p.debut.split("-").reverse().join("/") : `${p.debut.split("-").reverse().join("/")} → ${p.fin.split("-").reverse().join("/")}`}
                    </span>
                    <button type="button" onClick={() => supprimer(p)} className="text-muted hover:text-negative" aria-label="Retirer">
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
              <input value={nouveau.libelle} onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })} placeholder="Libellé (ex. journée pédagogique)" className={`${champ} min-w-0 flex-1`} />
              <input type="date" value={nouveau.debut} onChange={(e) => setNouveau({ ...nouveau, debut: e.target.value })} className={champ} aria-label="Du" />
              <input type="date" value={nouveau.fin} onChange={(e) => setNouveau({ ...nouveau, fin: e.target.value })} className={champ} aria-label="Au" />
              <select value={nouveau.type} onChange={(e) => setNouveau({ ...nouveau, type: e.target.value as PeriodeSansEcole["type"] })} className={champ}>
                <option value="vacances">Vacances</option>
                <option value="pont">Pont</option>
                <option value="sans_ecole">Jour sans école</option>
              </select>
              <button type="button" onClick={ajouter} className="rounded-lg bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-fg">
                Ajouter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
