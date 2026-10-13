"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { createClient } from "@/lib/supabase/client";
import { Modal, inputCls } from "@/components/GestionComptes";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { NOM_NEUTRE, estListeChiffree, nomComplet, type ProspectLisible } from "@/lib/prospectsChiffres";
import type { LigneListe } from "@/lib/listeProspects";
import { CHAMPS, convertir, lireFichier, tableauDesFeuilles, type Champ, type Tableau } from "@/lib/importProspectsColonnes";
import { jetonsNom } from "@/lib/foyers";
import { prenomsDuCouple, estCouple } from "@/lib/couple";
import { normaliser } from "@/lib/reconciliation";

/** Clé de rapprochement : nom de famille (sans particules, accents ni ordre) + premier prénom. */
const cle = (nom: string | null, prenom: string | null): string => {
  const premier = normaliser(prenom ?? "").split(" ").filter((m) => m.length > 1)[0] ?? "";
  return `${[...jetonsNom(nom)].filter((t) => t.length >= 3).sort().join(" ")}|${premier}`;
};

type Analyse = {
  nouveaux: LigneListe[];
  doublonsProspects: LigneListe[];
  dejaDonateurs: LigneListe[];
  doublonsFichier: LigneListe[];
  invalides: { source: string; raison: string }[];
  total: number;
};

/**
 * Import d'une liste de prospects (classeur Excel, une feuille par lettre : civilité, nom, prénom, adresse,
 * CP, ville). Les coordonnées sont chiffrées dans le coffre ; chaque prospect reçoit l'étiquette de liste
 * choisie (ex. « Liste Axel »). Les noms déjà prospects, déjà donateurs ou répétés dans le fichier ne sont pas recréés.
 */
export default function ImportProspects({ prospects, dons }: { prospects: ProspectLisible[]; dons: Don[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        title="Importer des prospects depuis un fichier Excel ou CSV"
      >
        📥 Importer
      </button>
      {ouvert && <Fenetre prospects={prospects} dons={dons} onClose={() => setOuvert(false)} />}
    </>
  );
}

function Fenetre({ prospects, dons, onClose }: { prospects: ProspectLisible[]; dons: Don[]; onClose: () => void }) {
  const router = useRouter();
  const coffre = useCoffre();
  const { dons: clairs, verrou } = useDonsDechiffres(dons);
  const [liste, setListe] = useState("Liste Axel");
  // Étapes : fichier → correspondance des colonnes → aperçu (lignes converties) → import.
  const [tableau, setTableau] = useState<Tableau | null>(null);
  const [champs, setChamps] = useState<Champ[]>([]);
  const [apercu, setApercu] = useState(false);
  const converties = useMemo(() => (tableau && apercu ? convertir(tableau, champs) : null), [tableau, champs, apercu]);
  const lignes: LigneListe[] | null = useMemo(
    () => (converties ? converties.flatMap((c) => ("ligne" in c ? [c.ligne] : [])) : null),
    [converties],
  );
  const [fichier, setFichier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  // Clés des donateurs (chaque conjoint d'une fiche couple compte) et des prospects déjà connus.
  const clesDonateurs = useMemo(() => {
    const s = new Set<string>();
    for (const d of clairs) {
      if (d.supprime_le || d.est_personne_morale || !d.donateur_nom || d.donateur_nom.startsWith("🔒")) continue;
      const prenoms = estCouple(d.donateur_titre)
        ? Object.values(prenomsDuCouple(d.donateur_prenom)).filter(Boolean)
        : [d.donateur_prenom ?? ""];
      for (const p of prenoms) s.add(cle(d.donateur_nom, p));
    }
    return s;
  }, [clairs]);
  const clesProspects = useMemo(() => new Set(prospects.filter((p) => !p.verrouille).map((p) => cle(p.nom, p.prenom))), [prospects]);

  const analyse: Analyse | null = useMemo(() => {
    if (!lignes) return null;
    const vus = new Set<string>();
    const invalides = (converties ?? []).flatMap((c) => ("invalide" in c ? [{ source: c.source, raison: c.invalide }] : []));
    const a: Analyse = { nouveaux: [], doublonsProspects: [], dejaDonateurs: [], doublonsFichier: [], invalides, total: converties?.length ?? lignes.length };
    for (const l of lignes) {
      const k = cle(l.nom, l.prenom);
      if (vus.has(k)) a.doublonsFichier.push(l);
      else if (clesProspects.has(k)) a.doublonsProspects.push(l);
      else if (clesDonateurs.has(k)) a.dejaDonateurs.push(l);
      else a.nouveaux.push(l);
      vus.add(k);
    }
    return a;
  }, [lignes, converties, clesProspects, clesDonateurs]);

  async function lire(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMessage(null);
    setApercu(false);
    try {
      const t = tableauDesFeuilles(await lireFichier(f));
      if (t.lignes.length === 0) throw new Error("vide");
      setTableau(t);
      setChamps(t.champs);
      setFichier(f.name);
    } catch {
      setTableau(null);
      setMessage({ ok: false, t: "Lecture impossible : fichier Excel ou CSV invalide, ou sans ligne de données." });
    }
  }

  async function importer() {
    if (!analyse || analyse.nouveaux.length === 0) return;
    const chiffrer = estListeChiffree(liste);
    if (chiffrer && !coffre.estOuvert) return setMessage({ ok: false, t: "Coffre verrouillé : déverrouillez-le pour chiffrer les coordonnées." });
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const etiquette = liste.trim() || null;
    let faits = 0;
    for (let i = 0; i < analyse.nouveaux.length; i += 50) {
      const lot = analyse.nouveaux.slice(i, i + 50);
      // Chiffrées pour la « Liste Axel » seulement ; les autres listes sont enregistrées en clair.
      const lignesBase = await Promise.all(
        lot.map(async (l) => ({
          segment: "particulier",
          etape: "identifie",
          liste: etiquette,
          notes: l.note,
          ...(chiffrer
            ? {
                nom: NOM_NEUTRE,
                pii_chiffre: await coffre.chiffrer(
                  JSON.stringify({ titre: l.titre, nom: l.nom, prenom: l.prenom, adresse: l.adresse, cp_ville: l.cp_ville }),
                ),
              }
            : { nom: l.nom, civilite: l.titre, prenom: l.prenom, adresse: l.adresse, cp_ville: l.cp_ville }),
        })),
      );
      const { error } = await supabase.from("prospects").insert(lignesBase);
      if (error) {
        setBusy(false);
        setMessage({ ok: false, t: `Import interrompu après ${faits} prospect${faits > 1 ? "s" : ""} : ${error.message}` });
        router.refresh();
        return;
      }
      faits += lot.length;
    }
    setBusy(false);
    const ecartes = analyse.total - faits;
    setMessage({
      ok: true,
      t: `${faits} prospect${faits > 1 ? "s" : ""} ajouté${faits > 1 ? "s" : ""}${etiquette ? ` (« ${etiquette} »)` : ""}, ${ecartes} ligne${ecartes > 1 ? "s" : ""} écartée${ecartes > 1 ? "s" : ""} (doublons ou invalides).`,
    });
    setTableau(null);
    setApercu(false);
    router.refresh();
  }

  const nommer = (l: LigneListe) => nomComplet({ titre: null, prenom: l.prenom, nom: l.nom });
  const liste3 = (titre: string, items: LigneListe[]) =>
    items.length > 0 && (
      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm">
          {titre} ({items.length})
        </summary>
        <p className="mt-1 text-xs text-muted">{items.map(nommer).join(" · ")}</p>
      </details>
    );

  return (
    <Modal title="Importer une liste de prospects" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <p className="text-xs text-muted">
          Seuls les prospects de la « Liste Axel » sont chiffrés dans le coffre ; les autres listes sont enregistrées en clair. Coffre ouvert,
          les prospects chiffrés s&apos;affichent déchiffrés.
        </p>
        {!coffre.estOuvert && (
          <div className="rounded-lg border border-gold/40 bg-gold-soft/40 px-3 py-2 text-xs text-gold">
            🔒 Coffre verrouillé : les coordonnées sont chiffrées à l&apos;import et la détection des donateurs existants a besoin du coffre.
            <div className="mt-2">
              <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
            </div>
          </div>
        )}
        <label className="block text-xs text-muted">
          Étiquette de la liste
          <input type="text" value={liste} onChange={(e) => setListe(e.target.value)} className={`${inputCls} mt-0.5`} />
        </label>
        <div>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
            Choisir le fichier (.xlsx / .xls / .csv)
            <input type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={lire} className="hidden" />
          </label>
          {fichier && <span className="ml-2 text-xs text-muted">{fichier}</span>}
          <p className="mt-1 text-xs text-muted">
            Toutes les feuilles sont lues ; les en-têtes (nom, prénom, adresse, CP, ville, email, téléphone, notes…) sont reconnus
            automatiquement et se corrigent à l&apos;étape suivante. L&apos;email et le téléphone sont repris dans les notes.
          </p>
        </div>

        {tableau && !apercu && (
          <div className="space-y-2">
            <p className="font-medium">Correspondance des colonnes ({tableau.lignes.length} lignes lues)</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-2 py-1 font-medium">Colonne du fichier</th>
                    <th className="px-2 py-1 font-medium">Exemple</th>
                    <th className="px-2 py-1 font-medium">Champ du prospect</th>
                  </tr>
                </thead>
                <tbody>
                  {tableau.entetes.map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-2 py-1">{h}</td>
                      <td className="max-w-40 truncate px-2 py-1 text-muted">{tableau.lignes.find((l) => l.cellules[i])?.cellules[i] ?? "—"}</td>
                      <td className="px-2 py-1">
                        <select
                          value={champs[i] ?? ""}
                          onChange={(e) => setChamps((c) => c.map((x, j) => (j === i ? (e.target.value as Champ) : x)))}
                          aria-label={`Champ pour ${h}`}
                          className="rounded-md border border-border bg-background px-1 py-0.5"
                        >
                          <option value="">— Ignorer —</option>
                          {CHAMPS.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!champs.includes("nom") && <p className="text-xs text-negative">Choisissez la colonne du nom.</p>}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!champs.includes("nom")}
                onClick={() => setApercu(true)}
                className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                Aperçu →
              </button>
            </div>
          </div>
        )}

        {analyse && !verrou && (
          <>
            <p className="rounded-lg bg-surface-2 px-3 py-2">
              <strong>{analyse.nouveaux.length}</strong> prospect{analyse.nouveaux.length > 1 ? "s" : ""} à créer sur {analyse.total} lignes lues.
            </p>
            {liste3("Déjà prospects (non recréés)", analyse.doublonsProspects)}
            {liste3("Déjà donateurs (non recréés)", analyse.dejaDonateurs)}
            {liste3("Répétés dans le fichier (une seule fois)", analyse.doublonsFichier)}
            {analyse.invalides.length > 0 && (
              <details className="rounded-lg border border-negative/40 px-3 py-2">
                <summary className="cursor-pointer text-sm text-negative">Lignes invalides, non importées ({analyse.invalides.length})</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {analyse.invalides.map((x, k) => (
                    <li key={k}>
                      {x.source} : {x.raison}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button type="button" onClick={() => setApercu(false)} className="text-xs text-accent hover:underline">
              ← Modifier la correspondance des colonnes
            </button>
          </>
        )}
        {analyse && verrou && <p className="text-xs text-muted">Déverrouillez le coffre pour détecter les donateurs déjà connus.</p>}
        {message && (
          <p className={`rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={() => void importer()}
            disabled={busy || verrou || (estListeChiffree(liste) && !coffre.estOuvert) || !analyse || analyse.nouveaux.length === 0}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Import…" : `Importer ${analyse?.nouveaux.length ?? 0} prospect${(analyse?.nouveaux.length ?? 0) > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
