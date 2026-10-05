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
import { lignesDuClasseur, type LigneListe } from "@/lib/listeProspects";
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
        title="Importer une liste de prospects depuis un fichier Excel"
      >
        📥 Importer une liste
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
  const [lignes, setLignes] = useState<LigneListe[] | null>(null);
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
    const a: Analyse = { nouveaux: [], doublonsProspects: [], dejaDonateurs: [], doublonsFichier: [], total: lignes.length };
    for (const l of lignes) {
      const k = cle(l.nom, l.prenom);
      if (vus.has(k)) a.doublonsFichier.push(l);
      else if (clesProspects.has(k)) a.doublonsProspects.push(l);
      else if (clesDonateurs.has(k)) a.dejaDonateurs.push(l);
      else a.nouveaux.push(l);
      vus.add(k);
    }
    return a;
  }, [lignes, clesProspects, clesDonateurs]);

  async function lire(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const feuilles: Record<string, unknown[][]> = {};
      for (const nom of wb.SheetNames) {
        feuilles[nom] = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: "", raw: true }) as unknown[][];
      }
      setLignes(lignesDuClasseur(feuilles));
      setFichier(f.name);
    } catch {
      setLignes(null);
      setMessage({ ok: false, t: "Lecture impossible : fichier Excel invalide." });
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
    setMessage({ ok: true, t: `${faits} prospect${faits > 1 ? "s" : ""} importé${faits > 1 ? "s" : ""}${etiquette ? ` (« ${etiquette} »)` : ""}.` });
    setLignes(null);
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
            Choisir le fichier (.xls / .xlsx)
            <input type="file" accept=".xlsx,.xls" onChange={lire} className="hidden" />
          </label>
          {fichier && <span className="ml-2 text-xs text-muted">{fichier}</span>}
          <p className="mt-1 text-xs text-muted">
            Une feuille par lettre, avec les colonnes NOM, PRENOM, ADRESSE, CP, VILLE (civilité dans la première colonne). Nom, prénom et
            adresse sont repris ; l&apos;annotation à droite de la ville (ex. « patron de … ») passe en notes.
          </p>
        </div>

        {analyse && !verrou && (
          <>
            <p className="rounded-lg bg-surface-2 px-3 py-2">
              <strong>{analyse.nouveaux.length}</strong> prospect{analyse.nouveaux.length > 1 ? "s" : ""} à créer sur {analyse.total} lignes lues.
            </p>
            {liste3("Déjà prospects (non recréés)", analyse.doublonsProspects)}
            {liste3("Déjà donateurs (non recréés)", analyse.dejaDonateurs)}
            {liste3("Répétés dans le fichier (une seule fois)", analyse.doublonsFichier)}
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
