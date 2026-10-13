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
import { CHAMPS, convertir, lireFichier, tableauDesFeuilles, type Champ, type LigneImport, type Tableau } from "@/lib/importProspectsColonnes";
import { ETAPE_LABEL, SEGMENT_LABEL, type Etape, type Segment } from "@/lib/pipeline";
import { ChoixReserve } from "@/components/SuiviDonateur";
import { jetonsNom } from "@/lib/foyers";
import { prenomsDuCouple, estCouple } from "@/lib/couple";
import { normaliser } from "@/lib/reconciliation";

/** Clé de rapprochement : nom de famille (sans particules, accents ni ordre) + premier prénom. */
const cle = (nom: string | null, prenom: string | null): string => {
  const premier = normaliser(prenom ?? "").split(" ").filter((m) => m.length > 1)[0] ?? "";
  return `${[...jetonsNom(nom)].filter((t) => t.length >= 3).sort().join(" ")}|${premier}`;
};

type Analyse = {
  nouveaux: LigneImport[];
  doublonsProspects: LigneImport[];
  dejaDonateurs: LigneImport[];
  doublonsFichier: LigneImport[];
  invalides: { source: string; raison: string }[];
  avertissements: { source: string; raison: string }[];
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
  const lignes: LigneImport[] | null = useMemo(
    () => (converties ? converties.flatMap((c) => ("ligne" in c ? [c.ligne] : [])) : null),
    [converties],
  );
  const [fichier, setFichier] = useState("");
  // Valeurs par défaut de l'import (le segment peut aussi venir d'une colonne du fichier).
  const [segmentDefaut, setSegmentDefaut] = useState<Segment>("particulier");
  const [etapeDefaut, setEtapeDefaut] = useState<Etape>("identifie");
  const [reserveDefaut, setReserveDefaut] = useState<string>("");
  const [majExistants, setMajExistants] = useState(false);
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
  // Prospects existants par clé (le premier trouvé), pour les signaler ou les mettre à jour.
  const prospectParCle = useMemo(() => {
    const m = new Map<string, ProspectLisible>();
    for (const p of prospects) if (!p.verrouille && !m.has(cle(p.nom, p.prenom))) m.set(cle(p.nom, p.prenom), p);
    return m;
  }, [prospects]);
  const clesProspects = useMemo(() => new Set(prospectParCle.keys()), [prospectParCle]);

  const analyse: Analyse | null = useMemo(() => {
    if (!lignes) return null;
    const vus = new Set<string>();
    const invalides = (converties ?? []).flatMap((c) => ("invalide" in c ? [{ source: c.source, raison: c.invalide }] : []));
    const avertissements = (converties ?? []).flatMap((c) => ("avertissement" in c && c.avertissement ? [{ source: c.source, raison: c.avertissement }] : []));
    const a: Analyse = { nouveaux: [], doublonsProspects: [], dejaDonateurs: [], doublonsFichier: [], invalides, avertissements, total: converties?.length ?? lignes.length };
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

  /** Champs d'une fiche à créer (chiffrée pour la « Liste Axel », en clair sinon). */
  async function fiche(l: LigneImport, chiffrer: boolean) {
    const segment = l.segment ?? segmentDefaut;
    const nom = segment === "particulier" ? l.nom : l.nomBrut.trim();
    return {
      segment,
      etape: etapeDefaut,
      reserve_a: reserveDefaut || null,
      liste: liste.trim() || null,
      notes: l.note,
      email: l.email,
      telephone: l.telephone,
      relation: l.relation,
      ...(chiffrer
        ? {
            nom: NOM_NEUTRE,
            pii_chiffre: await coffre.chiffrer(JSON.stringify({ titre: l.titre, nom, prenom: l.prenom, adresse: l.adresse, cp_ville: l.cp_ville })),
          }
        : { nom, civilite: l.titre, prenom: l.prenom, adresse: l.adresse, cp_ville: l.cp_ville }),
    };
  }

  /** Mise à jour d'un prospect existant : les valeurs du fichier remplacent les siennes, les champs vides du fichier ne l'effacent pas. Étape, segment et réservation ne changent pas. */
  async function miseAJour(p: ProspectLisible, l: LigneImport) {
    const notes = l.note && !(p.notes ?? "").includes(l.note) ? [p.notes, l.note].filter(Boolean).join(" · ") : p.notes;
    const commun = {
      email: l.email ?? p.email ?? null,
      telephone: l.telephone ?? p.telephone ?? null,
      relation: l.relation ?? p.relation ?? null,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const pii = { titre: l.titre ?? p.titre, nom: p.nom, prenom: l.prenom ?? p.prenom, adresse: l.adresse ?? p.adresse, cp_ville: l.cp_ville ?? p.cp_ville };
    const patch = p.chiffre
      ? { ...commun, pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)) }
      : { ...commun, civilite: pii.titre, prenom: pii.prenom, adresse: pii.adresse, cp_ville: pii.cp_ville };
    return createClient().from("prospects").update(patch).eq("id", p.id).select("id");
  }

  async function importer() {
    if (!analyse) return;
    const aMettreAJour = majExistants ? analyse.doublonsProspects : [];
    if (analyse.nouveaux.length === 0 && aMettreAJour.length === 0) return;
    const chiffrer = estListeChiffree(liste) || aMettreAJour.some((l) => prospectParCle.get(cle(l.nom, l.prenom))?.chiffre);
    if (chiffrer && !coffre.estOuvert) return setMessage({ ok: false, t: "Coffre verrouillé : déverrouillez-le pour chiffrer les coordonnées." });
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    let faits = 0;
    let majFaites = 0;
    const echecs: string[] = [];
    for (let i = 0; i < analyse.nouveaux.length; i += 50) {
      const lot = analyse.nouveaux.slice(i, i + 50);
      const { error } = await supabase.from("prospects").insert(await Promise.all(lot.map((l) => fiche(l, estListeChiffree(liste)))));
      if (error) {
        echecs.push(`création interrompue après ${faits} : ${error.message}`);
        break;
      }
      faits += lot.length;
    }
    for (const l of aMettreAJour) {
      const p = prospectParCle.get(cle(l.nom, l.prenom));
      if (!p) continue;
      const { data, error } = await miseAJour(p, l);
      if (error || !data?.length) echecs.push(`${p.affiche} : ${error?.message ?? "modification refusée"}`);
      else majFaites++;
    }
    setBusy(false);
    const ecartes = analyse.total - faits - majFaites;
    const pl = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
    setMessage({
      ok: echecs.length === 0,
      t:
        `${pl(faits, "prospect")} ajouté${faits > 1 ? "s" : ""}, ${pl(majFaites, "prospect")} mis à jour, ${pl(ecartes, "ligne")} écartée${ecartes > 1 ? "s" : ""} (doublons ou invalides).` +
        (echecs.length ? ` Erreurs : ${echecs.join(" ; ")}` : ""),
    });
    setTableau(null);
    setApercu(false);
    router.refresh();
  }

  const nbMaj = majExistants ? (analyse?.doublonsProspects.length ?? 0) : 0;
  const nbTotal = (analyse?.nouveaux.length ?? 0) + nbMaj;
  const nommer = (l: LigneImport) => nomComplet({ titre: null, prenom: l.prenom, nom: l.nom });
  const liste3 = (titre: string, items: LigneImport[]) =>
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
            automatiquement et se corrigent à l&apos;étape suivante. Email, téléphone, relation et segment ont leurs propres champs.
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
            <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
              <label className="text-xs text-muted">
                Segment par défaut
                <select value={segmentDefaut} onChange={(e) => setSegmentDefaut(e.target.value as Segment)} className={`${inputCls} mt-0.5`}>
                  {Object.entries(SEGMENT_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {champs.includes("segment") && <span className="mt-0.5 block">Remplacé par la colonne du fichier quand elle est reconnue.</span>}
              </label>
              <label className="text-xs text-muted">
                Étape
                <select value={etapeDefaut} onChange={(e) => setEtapeDefaut(e.target.value as Etape)} className={`${inputCls} mt-0.5`}>
                  {Object.entries(ETAPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-muted">
                Réservé à
                <div className="mt-0.5">
                  <ChoixReserve key={reserveDefaut} value={reserveDefaut || null} onChange={setReserveDefaut} label="Réservé à (import)" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={majExistants} onChange={(e) => setMajExistants(e.target.checked)} className="h-4 w-4" />
                Mettre à jour les prospects existants ({analyse.doublonsProspects.length}) : leurs champs sont complétés ou remplacés par ceux du fichier
              </label>
            </div>
            {liste3(majExistants ? "Déjà prospects (mis à jour)" : "Déjà prospects (non recréés)", analyse.doublonsProspects)}
            {liste3("Déjà donateurs (non recréés)", analyse.dejaDonateurs)}
            {liste3("Répétés dans le fichier (une seule fois)", analyse.doublonsFichier)}
            {analyse.avertissements.length > 0 && (
              <details className="rounded-lg border border-gold/40 px-3 py-2">
                <summary className="cursor-pointer text-sm text-gold">Emails mal formés, écartés (ligne gardée) ({analyse.avertissements.length})</summary>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {analyse.avertissements.map((x, k) => (
                    <li key={k}>
                      {x.source} : {x.raison}
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
            disabled={busy || verrou || (estListeChiffree(liste) && !coffre.estOuvert) || !analyse || nbTotal === 0}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "Import…"
              : `Importer ${analyse?.nouveaux.length ?? 0} prospect${(analyse?.nouveaux.length ?? 0) > 1 ? "s" : ""}${nbMaj ? ` et en mettre à jour ${nbMaj}` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
