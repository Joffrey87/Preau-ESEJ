"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "./GestionComptes";
import { agregerDonateurs, FAMILLE_LIBELLE, type DonAgg, type FamilleStatut } from "@/lib/donateurs";
import { cleDonateur } from "@/lib/statutDon";
import { jetonsNom } from "@/lib/foyers";
import { todayISO } from "@/lib/format";

type Famille = { id: string; nom: string; statut: FamilleStatut; courriels: Set<string> };

type Suggestion = {
  cle: string;
  type: "donateur" | "contact";
  nom: string;
  /** Familles possibles (plusieurs pour un nom de famille répandu : Picard A / Picard H) ; la première par défaut. */
  candidats: Famille[];
  /** « sur » : courriel identique ; « verifier » : nom de famille seul (les prénoms des parents ne sont pas connus). */
  niveau: "sur" | "verifier";
  preuve: string;
  /** Dons du donateur, ou identifiant du contact. */
  ids: string[];
};

const COURRIEL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const courriels = (t: string | null | undefined): string[] => (t ?? "").toLowerCase().match(COURRIEL) ?? [];

/** Année scolaire en cours (septembre → août) : « 2026-2027 » à partir de septembre 2026. */
function anneeScolaire(aujourdhui: string): string {
  const a = Number(aujourdhui.slice(0, 4));
  const debut = Number(aujourdhui.slice(5, 7)) >= 9 ? a : a - 1;
  return `${debut}-${debut + 1}`;
}

/**
 * « Familles à repérer » : rapproche les donateurs et les contacts des familles de l'école (onglet Frais de
 * scolarité). Courriel identique = sûr (case cochée d'office) ; nom de famille seul = à vérifier (case décochée,
 * les prénoms des parents n'étant pas connus). Famille actuelle = inscrite cette année scolaire, sinon ancienne.
 * Rien n'est écrit avant la validation.
 */
export default function FamillesAReperer({ dons, verrou }: { dons: Don[]; verrou: boolean }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [ouvert, setOuvert] = useState(false);
  const [analyse, setAnalyse] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  // Bilan de l'analyse, pour comprendre un résultat vide.
  const [bilan, setBilan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Famille retenue quand plusieurs correspondent (index dans `candidats`).
  const [choixFamille, setChoixFamille] = useState<Map<string, number>>(new Map());
  const familleDe = (s: Suggestion): Famille => s.candidats[choixFamille.get(s.cle) ?? 0];

  if (verrou) return null;

  async function analyser() {
    setOuvert(true);
    setMessage(null);
    if (!coffre.estOuvert) return setMessage("Coffre verrouillé : déverrouillez-le pour lire les noms des donateurs.");
    setAnalyse(true);
    const supabase = createClient();
    const [{ data: fams, error: e1 }, { data: insc, error: e2 }, { data: cts, error: e3 }] = await Promise.all([
      supabase.from("familles").select("id, nom, courriels, parent1_courriel, parent2_courriel"),
      supabase.from("scolarite_inscriptions").select("famille_id, annee_scolaire, emails"),
      supabase.from("contacts").select("id, nom, prenom, courriel, famille_statut").is("supprime_le", null).eq("est_personne_morale", false),
    ]);
    if (e1 || e2 || e3) {
      setAnalyse(false);
      return setMessage("Lecture impossible : " + (e1 ?? e2 ?? e3)!.message);
    }
    const courante = anneeScolaire(todayISO());
    const familles: Famille[] = ((fams ?? []) as { id: string; nom: string; courriels: string | null; parent1_courriel: string | null; parent2_courriel: string | null }[]).map((f) => {
      const siennes = ((insc ?? []) as { famille_id: string | null; annee_scolaire: string; emails: string | null }[]).filter((i) => i.famille_id === f.id);
      return {
        id: f.id,
        nom: f.nom,
        statut: siennes.some((i) => i.annee_scolaire === courante) ? "actuelle" : "ancienne",
        // Courriels des inscriptions ET de la fiche famille (saisis par l'école ou corrigés par la famille).
        courriels: new Set([
          ...siennes.flatMap((i) => courriels(i.emails)),
          ...courriels(f.courriels),
          ...courriels(f.parent1_courriel),
          ...courriels(f.parent2_courriel),
        ]),
      };
    });
    const nomsFamilles = familles.map((f) => ({ f, jetons: [...jetonsNom(f.nom)].filter((t) => t.length >= 3) }));

    const trouver = (nom: string, mails: string[]): { fs: Famille[]; niveau: "sur" | "verifier"; preuve: string } | null => {
      const parMail = familles.find((f) => mails.some((m) => f.courriels.has(m)));
      if (parMail) return { fs: [parMail], niveau: "sur", preuve: "Courriel identique à celui d'une inscription" };
      const jetons = jetonsNom(nom);
      const parNom = nomsFamilles.filter((x) => x.jetons.length > 0 && x.jetons.some((t) => jetons.has(t))).map((x) => x.f);
      return parNom.length > 0
        ? { fs: parNom, niveau: "verifier", preuve: parNom.length > 1 ? "Même nom de famille que plusieurs familles : choisissez" : "Même nom de famille (prénoms des parents inconnus)" }
        : null;
    };

    const res: Suggestion[] = [];
    // Donateurs (particuliers) : un profil par donateur, ses dons portent tous le même statut.
    const parCle = new Map<string, Don[]>();
    for (const d of dons) {
      if (d.supprime_le || d.est_personne_morale) continue;
      const c = cleDonateur(d);
      (parCle.get(c) ?? parCle.set(c, []).get(c)!).push(d);
    }
    for (const p of agregerDonateurs(dons.filter((d) => !d.est_personne_morale) as unknown as DonAgg[], todayISO())) {
      const liste = parCle.get(p.cle) ?? [];
      const t = trouver(liste[0]?.donateur_nom ?? p.nom, liste.flatMap((d) => courriels(d.courriel)));
      if (!t || t.fs.every((f) => p.famille === f.statut)) continue;
      res.push({ cle: `d|${p.cle}`, type: "donateur", nom: p.nom, candidats: t.fs, niveau: t.niveau, preuve: t.preuve, ids: liste.map((d) => d.id) });
    }
    for (const c of (cts ?? []) as { id: string; nom: string; prenom: string | null; courriel: string | null; famille_statut: string | null }[]) {
      const t = trouver(c.nom, courriels(c.courriel));
      if (!t || t.fs.every((f) => c.famille_statut === f.statut)) continue;
      res.push({ cle: `c|${c.id}`, type: "contact", nom: [c.prenom, c.nom].filter(Boolean).join(" "), candidats: t.fs, niveau: t.niveau, preuve: t.preuve, ids: [c.id] });
    }
    const nbDonateurs = parCle.size;
    const nbMails = familles.reduce((n, f) => n + f.courriels.size, 0);
    setBilan(
      `${familles.length} familles lues (${familles.filter((f) => f.statut === "actuelle").length} actuelles, ${familles.filter((f) => f.statut === "ancienne").length} anciennes, ${nbMails} courriels connus) · ${nbDonateurs} donateurs particuliers et ${(cts ?? []).length} contacts analysés · ${res.length} rapprochement${res.length > 1 ? "s" : ""} à valider.`,
    );
    res.sort((a, b) => Number(a.niveau === "verifier") - Number(b.niveau === "verifier") || a.nom.localeCompare(b.nom, "fr"));
    setSuggestions(res);
    setCoches(new Set(res.filter((s) => s.niveau === "sur").map((s) => s.cle)));
    setAnalyse(false);
  }

  async function appliquer() {
    const choisies = (suggestions ?? []).filter((s) => coches.has(s.cle));
    if (choisies.length === 0) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    for (const s of choisies) {
      const { error } =
        s.type === "donateur"
          ? await supabase.rpc("definir_famille", { p_ids: s.ids, p_statut: familleDe(s).statut })
          : await supabase.from("contacts").update({ famille_statut: familleDe(s).statut }).eq("id", s.ids[0]);
      if (error) {
        setBusy(false);
        setMessage(`Enregistrement de « ${s.nom} » impossible : ${error.message}`);
        router.refresh();
        return;
      }
    }
    setBusy(false);
    setMessage(`${choisies.length} fiche${choisies.length > 1 ? "s" : ""} marquée${choisies.length > 1 ? "s" : ""} « famille ».`);
    setSuggestions((l) => (l ?? []).filter((s) => !coches.has(s.cle)));
    setCoches(new Set());
    router.refresh();
  }

  const basculer = (cle: string) =>
    setCoches((p) => {
      const n = new Set(p);
      if (!n.delete(cle)) n.add(cle);
      return n;
    });

  const sections: { titre: string; niveau: Suggestion["niveau"]; aide: string }[] = [
    { titre: "Sûrs", niveau: "sur", aide: "courriel identique à celui d'une famille inscrite (cochés d'office)" },
    { titre: "À vérifier", niveau: "verifier", aide: "même nom de famille seulement (décochés : cochez ceux qui sont bien de la famille)" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => void analyser()}
        className="rounded-lg border border-gold/50 bg-gold-soft/40 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold-soft"
        title="Repère les donateurs et contacts qui sont (ou ont été) des familles de l'école"
      >
        🎒 Familles à repérer
      </button>
      {ouvert && (
        <Modal title="Familles de l'école à repérer" onClose={() => setOuvert(false)} fermerAuClicExterieur>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
            <p className="text-xs text-muted">
              Rapprochement avec les familles de l&apos;onglet Frais de scolarité. « Famille actuelle » = inscrite à l&apos;année scolaire en cours,
              « Ancienne famille » = inscrite les années précédentes seulement. Cochez ce qui est juste, puis validez.
            </p>
            {analyse && <p className="text-muted">Analyse…</p>}
            {bilan && !analyse && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">{bilan}</p>}
            {suggestions && suggestions.length === 0 && !analyse && (
              <p className="rounded-lg bg-surface-2 px-3 py-3">Aucune famille nouvelle à repérer.</p>
            )}
            {sections.map((sec) => {
              const liste = (suggestions ?? []).filter((s) => s.niveau === sec.niveau);
              if (liste.length === 0) return null;
              return (
                <section key={sec.niveau}>
                  <h3 className="mb-1 font-medium">
                    {sec.titre} ({liste.length}) <span className="text-xs font-normal text-muted">— {sec.aide}</span>
                  </h3>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {liste.map((s) => (
                      <li key={s.cle}>
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-surface-2">
                          <input type="checkbox" checked={coches.has(s.cle)} onChange={() => basculer(s.cle)} className="mt-0.5 h-4 w-4" />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{s.nom}</span>
                            <span className="ml-1.5 text-xs text-muted">({s.type === "contact" ? "contact" : "donateur"})</span>
                            <span className="block text-xs text-muted">
                              → {FAMILLE_LIBELLE[familleDe(s).statut]} · famille « {familleDe(s).nom} » · {s.preuve}
                            </span>
                            {s.candidats.length > 1 && (
                              <select
                                value={choixFamille.get(s.cle) ?? 0}
                                onChange={(e) => setChoixFamille((p) => new Map(p).set(s.cle, Number(e.target.value)))}
                                onClick={(e) => e.preventDefault()}
                                className="mt-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs"
                                aria-label="Famille concernée"
                              >
                                {s.candidats.map((f, i) => (
                                  <option key={f.id} value={i}>
                                    Famille {f.nom} ({FAMILLE_LIBELLE[f.statut]})
                                  </option>
                                ))}
                              </select>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {message && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">{message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
              <button
                type="button"
                onClick={() => void appliquer()}
                disabled={busy || coches.size === 0}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "…" : `Marquer ${coches.size} fiche${coches.size > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
