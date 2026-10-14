"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/format";
import { DOMAINES, type DomaineVente, type Payeur, type SousCategorie } from "@/lib/ventes";

type Liee = { due_id: string; montant: number; sous: string; payeur: string };

const champ = "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";
const NOUVEAU = "__nouveau__";
const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Meilleure famille / personne du Carnet dont le nom figure dans le libellé de l'opération. */
export function suggererPayeur(libelle: string, payeurs: Payeur[]): Payeur | null {
  const lib = ` ${sansAccents(libelle).replace(/[^a-z0-9]+/g, " ")} `;
  let meilleur: { p: Payeur; score: number } | null = null;
  for (const p of payeurs) {
    const mots = sansAccents(p.libelle).replace(/[^a-z0-9]+/g, " ").split(" ").filter((m) => m.length >= 3);
    if (!mots.length) continue;
    const trouves = mots.filter((m) => lib.includes(` ${m} `));
    if (!trouves.length) continue;
    // Tous les mots trouvés > un seul ; nom de famille (famille) privilégié à égalité.
    const score = trouves.reduce((s, m) => s + m.length, 0) + (trouves.length === mots.length ? 10 : 0) + (p.kind === "famille" ? 1 : 0);
    if (!meilleur || score > meilleur.score) meilleur = { p, score };
  }
  return meilleur?.p ?? null;
}

/**
 * Comptabilité (Trésorier) : une recette « Ventes diverses » s'affecte à un ou plusieurs intitulés de vente.
 * Chaque affectation crée une ligne Payé dans l'onglet Ventes diverses, reliée à l'opération (dans la limite de son montant).
 */
export default function AffectationVente({
  operationId,
  libelle,
  montantOperation,
  modePaiement,
}: {
  operationId: string;
  libelle: string;
  montantOperation: number;
  modePaiement: string | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const [sousCats, setSousCats] = useState<SousCategorie[]>([]);
  const [payeurs, setPayeurs] = useState<Payeur[]>([]);
  const [liees, setLiees] = useState<Liee[]>([]);
  const [sousId, setSousId] = useState("");
  const [payeur, setPayeur] = useState("");
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<"virement" | "cheque">(modePaiement === "cheque" ? "cheque" : "virement");
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);
  // Fenêtre « + Nouvel intitulé »
  const [fenetre, setFenetre] = useState(false);
  const [nomIntitule, setNomIntitule] = useState("");
  const [domaineIntitule, setDomaineIntitule] = useState<DomaineVente>("ecole");
  // Nouvelle personne
  const [nouvellePersonne, setNouvellePersonne] = useState(false);
  const [pPrenom, setPPrenom] = useState("");
  const [pNom, setPNom] = useState("");

  const affecte = liees.reduce((s, l) => s + l.montant, 0);
  const reste = Math.round((montantOperation - affecte) * 100) / 100;

  const charger = useCallback(async () => {
    const [sc, pe, pv, pay] = await Promise.all([
      sb.from("ventes_sous_categories").select("id, nom, domaine, archive").eq("archive", false).order("nom"),
      sb.rpc("liste_payeurs_ventes", { p_domaine: "ecole" }),
      sb.rpc("liste_payeurs_ventes", { p_domaine: "evenement" }),
      sb.from("ventes_paiements").select("vente_due_id, montant").eq("operation_id", operationId),
    ]);
    setSousCats((sc.data ?? []) as SousCategorie[]);
    const tous = [...((pe.data ?? []) as Payeur[]), ...((pv.data ?? []) as Payeur[])];
    const uniques = Array.from(new Map(tous.map((p) => [`${p.kind}:${p.id}`, p])).values()).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    setPayeurs(uniques);
    const paiements = (pay.data ?? []) as { vente_due_id: string; montant: number }[];
    const r = Math.round((montantOperation - paiements.reduce((a, p) => a + Number(p.montant), 0)) * 100) / 100;
    setMontant(r > 0 ? String(r).replace(".", ",") : "");
    if (paiements.length) {
      const { data: dues } = await sb
        .from("ventes_dues")
        .select("id, libelle_payeur, sous_categorie_id")
        .in("id", paiements.map((p) => p.vente_due_id));
      const scs = (sc.data ?? []) as SousCategorie[];
      setLiees(
        paiements.map((p) => {
          const d = (dues ?? []).find((x) => x.id === p.vente_due_id) as { libelle_payeur: string | null; sous_categorie_id: string } | undefined;
          return {
            due_id: p.vente_due_id,
            montant: Number(p.montant),
            sous: scs.find((s) => s.id === d?.sous_categorie_id)?.nom ?? "—",
            payeur: d?.libelle_payeur ?? "—",
          };
        }),
      );
    } else setLiees([]);
    return uniques;
  }, [sb, operationId, montantOperation]);

  useEffect(() => {
    let vivant = true;
    void Promise.resolve().then(charger).then((uniques) => {
      if (!vivant) return;
      const s = suggererPayeur(libelle, uniques);
      if (s) setPayeur(`${s.kind}:${s.id}`);
    });
    return () => {
      vivant = false;
    };
  }, [charger, libelle]);

  const suggestion = useMemo(() => suggererPayeur(libelle, payeurs), [libelle, payeurs]);

  async function creerIntitule() {
    setErreur("");
    if (!nomIntitule.trim()) return setErreur("Indiquez le nom de l'intitulé.");
    setBusy(true);
    const { data, error } = await sb
      .from("ventes_sous_categories")
      .insert({ nom: nomIntitule.trim(), domaine: domaineIntitule })
      .select("id, nom, domaine, archive")
      .single();
    setBusy(false);
    if (error) return setErreur(error.message.includes("unique") ? "Cet intitulé existe déjà pour ce domaine." : error.message);
    setSousCats((l) => [...l, data as SousCategorie].sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
    setSousId((data as SousCategorie).id);
    setFenetre(false);
    setNomIntitule("");
  }

  async function affecter() {
    setErreur("");
    if (!sousId) return setErreur("Choisissez un intitulé de vente.");
    const m = Number(montant.replace(/\s/g, "").replace(",", "."));
    if (!isFinite(m) || m <= 0) return setErreur("Montant invalide.");
    if (m > reste + 0.005) return setErreur(`Il reste ${formatEuros(reste)} à affecter sur cette opération.`);
    const sous = sousCats.find((s) => s.id === sousId);
    setBusy(true);
    let famille: string | null = null;
    let contact: string | null = null;
    let lib: string | null = null;
    if (nouvellePersonne) {
      if (!pNom.trim()) {
        setBusy(false);
        return setErreur("Nom de la personne obligatoire.");
      }
      const { data: cid, error } = await sb.rpc("ventes_creer_contact", {
        p_domaine: sous?.domaine ?? "ecole",
        p_nom: pNom.trim(),
        p_prenom: pPrenom.trim() || null,
        p_courriel: null,
        p_telephone: null,
      });
      if (error) {
        setBusy(false);
        return setErreur(error.message);
      }
      contact = cid as string;
      lib = `${pPrenom.trim()} ${pNom.trim()}`.trim();
    } else {
      if (!payeur) {
        setBusy(false);
        return setErreur("Choisissez la famille ou la personne.");
      }
      const [kind, id] = payeur.split(":");
      if (kind === "famille") famille = id;
      else contact = id;
      lib = payeurs.find((p) => p.kind === kind && p.id === id)?.libelle ?? null;
    }
    const { error } = await sb.rpc("ventes_creer_depuis_operation", {
      p_operation: operationId,
      p_sous_categorie: sousId,
      p_famille: famille,
      p_contact: contact,
      p_libelle_payeur: lib,
      p_montant: m,
      p_mode: mode,
    });
    setBusy(false);
    if (error) return setErreur(error.message);
    setNouvellePersonne(false);
    setPNom("");
    setPPrenom("");
    await charger();
  }

  async function retirer(dueId: string) {
    if (!window.confirm("Retirer cette vente de l'opération ? La ligne créée depuis la Comptabilité sera supprimée de l'onglet Ventes diverses.")) return;
    setBusy(true);
    const { error } = await sb.rpc("ventes_retirer_de_operation", { p_due: dueId, p_operation: operationId });
    setBusy(false);
    if (error) setErreur(error.message);
    else await charger();
  }

  const parDomaine = (d: DomaineVente) => sousCats.filter((s) => s.domaine === d);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Intitulé de vente</span>
        <span className="text-xs text-muted">
          Affecté {formatEuros(affecte)} / {formatEuros(montantOperation)}
          {reste > 0.005 ? ` · reste ${formatEuros(reste)}` : " · complet"}
        </span>
      </div>

      {liees.length > 0 && (
        <ul className="space-y-1">
          {liees.map((l) => (
            <li key={l.due_id} className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1 text-sm">
              <span>
                <span className="mr-1 text-positive">✓</span>
                {l.sous} · {l.payeur} · {formatEuros(l.montant)} <span className="text-xs text-positive">Payé</span>
              </span>
              <button type="button" disabled={busy} onClick={() => retirer(l.due_id)} className="text-xs text-muted hover:text-negative">
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {reste > 0.005 && (
        <div className="space-y-2">
          <select
            value={sousId}
            onChange={(e) => (e.target.value === NOUVEAU ? setFenetre(true) : setSousId(e.target.value))}
            className={champ}
          >
            <option value="">Choisir un intitulé…</option>
            {DOMAINES.map((d) => (
              <optgroup key={d.v} label={d.label}>
                {parDomaine(d.v).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={NOUVEAU}>+ Nouvel intitulé</option>
          </select>

          {!nouvellePersonne ? (
            <div className="flex gap-2">
              <select value={payeur} onChange={(e) => setPayeur(e.target.value)} className={champ}>
                <option value="">Famille ou personne…</option>
                <optgroup label="Familles">
                  {payeurs.filter((p) => p.kind === "famille").map((p) => (
                    <option key={p.id} value={`famille:${p.id}`}>
                      {p.libelle}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personnes (Carnet)">
                  {payeurs.filter((p) => p.kind === "contact").map((p) => (
                    <option key={p.id} value={`contact:${p.id}`}>
                      {p.libelle}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button type="button" onClick={() => setNouvellePersonne(true)} className="shrink-0 rounded-lg border border-border px-2.5 text-sm hover:bg-surface-2">
                + Personne
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input value={pPrenom} onChange={(e) => setPPrenom(e.target.value)} placeholder="Prénom" className={champ} />
              <input value={pNom} onChange={(e) => setPNom(e.target.value)} placeholder="Nom" className={champ} />
              <button type="button" onClick={() => setNouvellePersonne(false)} className="col-span-2 text-left text-xs text-accent hover:underline">
                ← Choisir dans le Carnet
              </button>
            </div>
          )}
          {suggestion && !nouvellePersonne && payeur === `${suggestion.kind}:${suggestion.id}` && (
            <p className="text-xs text-muted">Suggéré d&apos;après le libellé : {suggestion.libelle}</p>
          )}

          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Montant" className={champ} />
            <select value={mode} onChange={(e) => setMode(e.target.value as "virement" | "cheque")} className={champ}>
              <option value="virement">Virement</option>
              <option value="cheque">Chèque</option>
            </select>
            <button type="button" disabled={busy} onClick={affecter} className="rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-50">
              Affecter
            </button>
          </div>
          <p className="text-[11px] text-muted">Une ligne Payé est ajoutée dans l&apos;onglet Ventes diverses. Une opération peut couvrir plusieurs ventes, dans la limite de son montant.</p>
        </div>
      )}

      {erreur && <p className="text-xs text-negative">{erreur}</p>}

      {fenetre && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={() => setFenetre(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Nouvel intitulé de vente</h3>
            <input
              autoFocus
              value={nomIntitule}
              onChange={(e) => setNomIntitule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void creerIntitule();
                }
              }}
              placeholder="Ex. Vente photo"
              className={champ}
            />
            <div className="flex gap-3 text-sm">
              {DOMAINES.map((d) => (
                <label key={d.v} className="flex items-center gap-1.5">
                  <input type="radio" name="domaine-intitule" checked={domaineIntitule === d.v} onChange={() => setDomaineIntitule(d.v)} />
                  {d.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFenetre(false)} className="rounded-lg px-3 py-1.5 text-sm text-muted">
                Annuler
              </button>
              <button type="button" disabled={busy} onClick={creerIntitule} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50">
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
