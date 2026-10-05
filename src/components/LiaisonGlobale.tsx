"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DonCompta } from "@/components/PastilleDon";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { formatDate, formatEuros } from "@/lib/format";
import { nomDonateur } from "@/lib/statutDon";
import { JOURS_LIEN_FORT, LIBELLE_DOUTE, analyserLiaisons, construireIdentites, type Candidat, type CleDoute, type Doute, type EcritureDon, type LienSur } from "@/lib/liaisonDons";

type OperationBrute = {
  id: string;
  parent_id: string | null;
  date_operation: string;
  montant: number | string;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
  est_ventilee: boolean;
  exercice_id: string | null;
};

const COLONNES = "id, parent_id, date_operation, montant, libelle_origine, libelle_origine_chiffre, est_ventilee, exercice_id";

/**
 * « Lier toutes les années » : reprend toutes les écritures « Don » sans don, de tous les exercices, et
 * les rapproche des dons « hors compta ». Les liens sans (quasi) doute sont posés d'un clic ; les autres
 * écritures sont classées par nature du doute. Rien n'est écrit avant la confirmation.
 */
export default function LiaisonGlobale({ dons, verrou }: { dons: DonCompta[]; verrou: boolean }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<"idle" | "analyse" | "pret" | "ecriture" | "fait">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const [surs, setSurs] = useState<LienSur[]>([]);
  const [doutes, setDoutes] = useState<Doute[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  // Liens cochés : à ±3 jours par défaut ; l'utilisateur décoche ceux qui lui paraissent douteux.
  const [coches, setCoches] = useState<Set<string>>(new Set());
  // Doutes : le don que l'utilisateur choisit de lier, par écriture (un seul don par écriture).
  const [choix, setChoix] = useState<Map<string, string>>(new Map());

  // Coffre fermé : le bouton reste visible mais inactif (les noms des donateurs sont nécessaires au rapprochement).
  if (verrou || !coffre.estOuvert) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted opacity-60"
        title="Déverrouillez le coffre pour lier les dons à la comptabilité"
      >
        🔗 Lier toutes les années 🔒
      </button>
    );
  }

  async function analyser() {
    setOuvert(true);
    setEtat("analyse");
    setErreur(null);
    setMessage(null);
    const supabase = createClient();
    const { data: cats } = await supabase.from("categories").select("id").eq("nom", "Don");
    const ids = (cats ?? []).map((c) => c.id as string);
    if (ids.length === 0) {
      setErreur("Catégorie « Don » introuvable.");
      return setEtat("idle");
    }
    const { data: opsData, error } = await supabase
      .from("operations")
      .select(COLONNES)
      .eq("type", "recette")
      .in("categorie_id", ids)
      .range(0, 4999);
    if (error) {
      setErreur("Lecture des écritures impossible : " + error.message);
      return setEtat("idle");
    }
    const ops = (opsData ?? []) as unknown as OperationBrute[];
    const parents = [...new Set(ops.map((o) => o.parent_id).filter((x): x is string => !!x))];
    const meres = new Map<string, OperationBrute>();
    if (parents.length > 0) {
      const { data: m } = await supabase.from("operations").select(COLONNES).in("id", parents);
      for (const o of (m ?? []) as unknown as OperationBrute[]) meres.set(o.id, o);
    }

    const clair = async (o: OperationBrute) =>
      [texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre)), o.libelle_origine].filter(Boolean).join(" ");
    const reliees = new Set(dons.map((d) => d.operation_id).filter(Boolean) as string[]);
    const ecritures: EcritureDon[] = [];
    for (const o of ops) {
      if (o.est_ventilee || reliees.has(o.id)) continue;
      const mere = o.parent_id ? meres.get(o.parent_id) : undefined;
      const texte = [await clair(o), mere ? await clair(mere) : ""].filter(Boolean).join(" ") || null;
      ecritures.push({ id: o.id, date: o.date_operation, montant: Number(o.montant), texte, exerciceId: o.exercice_id });
    }
    const libres = dons.filter((d) => !d.operation_id);
    const res = analyserLiaisons(ecritures, libres, construireIdentites(dons));
    setSurs(res.surs);
    setCoches(new Set(res.surs.filter((l) => l.proche).map((l) => l.ecriture.id)));
    setChoix(new Map());
    setDoutes(res.doutes);
    setEtat("pret");
  }

  async function lier() {
    setEtat("ecriture");
    setErreur(null);
    const supabase = createClient();
    let faits = 0;
    const doutesChoisis = doutes.flatMap((d) => {
      const c = d.dons.find((x) => x.don.id === choix.get(d.ecriture.id));
      return c ? [{ ecriture: d.ecriture, don: c.don, ecart: c.ecart }] : [];
    });
    const inexacts = doutesChoisis.filter((x) => Math.abs(x.ecart) >= 0.005).length;
    if (inexacts > 0 && !window.confirm(`${inexacts} des liens choisis ont un montant différent de celui de l'écriture. Les lier quand même ?`)) {
      setEtat("pret");
      return;
    }
    const aLier = [...surs.filter((x) => coches.has(x.ecriture.id)).map((x) => ({ ecriture: x.ecriture, don: x.don })), ...doutesChoisis];
    for (const l of aLier) {
      const maj: { operation_id: string; exercice_id?: string } = { operation_id: l.ecriture.id };
      if (!l.don.exercice_id && l.ecriture.exerciceId) maj.exercice_id = l.ecriture.exerciceId;
      // « is null » : un lien existant n'est jamais remplacé.
      const { error } = await supabase.from("dons").update(maj).eq("id", l.don.id).is("operation_id", null);
      if (error) {
        setErreur("Liaison interrompue : " + error.message);
        break;
      }
      faits += 1;
    }
    setMessage(`${faits} don${faits > 1 ? "s" : ""} lié${faits > 1 ? "s" : ""} à son écriture comptable.`);
    setEtat("fait");
    router.refresh();
  }

  const parDoute = new Map<CleDoute, Doute[]>();
  for (const d of doutes) parDoute.set(d.cle, [...(parDoute.get(d.cle) ?? []), d]);
  const nbCoches = surs.filter((l) => coches.has(l.ecriture.id)).length;
  const nbChoix = doutes.filter((d) => d.dons.some((x) => x.don.id === choix.get(d.ecriture.id))).length;
  const nbTotal = nbCoches + nbChoix;
  /** Ce don est-il déjà retenu pour une autre écriture (liens possibles cochés ou choix dans les doutes) ? */
  const retenuAilleurs = (donId: string, ecritureId: string) =>
    surs.some((l) => l.don.id === donId && coches.has(l.ecriture.id)) || [...choix].some(([e, d]) => d === donId && e !== ecritureId);
  const choisir = (ecritureId: string, donId: string) =>
    setChoix((p) => {
      const n = new Map(p);
      if (n.get(ecritureId) === donId) n.delete(ecritureId);
      else n.set(ecritureId, donId);
      return n;
    });
  const bascule = (id: string) =>
    setCoches((p) => {
      const n = new Set(p);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  /** Pastille d'un critère : vert quand il concorde, ambre à demi, rouge sinon. */
  const pastille = (ton: "vert" | "ambre" | "rouge" | "neutre", texte: string) => (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        ton === "vert" ? "bg-positive/15 text-positive" : ton === "ambre" ? "bg-gold-soft text-gold" : ton === "rouge" ? "bg-negative/10 text-negative" : "bg-surface-2 text-muted"
      }`}
    >
      {texte}
    </span>
  );
  const critNom = (nom: number) => (nom >= 0.999 ? pastille("vert", "✓ nom") : nom > 0 ? pastille("ambre", "≈ nom partiel") : pastille("rouge", "✗ nom"));
  const critDate = (jours: number) =>
    jours <= JOURS_LIEN_FORT ? pastille("vert", `✓ ±3 j (${jours} j)`) : jours <= 35 ? pastille("vert", `✓ ±30 j (${jours} j)`) : pastille("rouge", `✗ ${jours} j`);
  const critMontant = (ecart: number) =>
    Math.abs(ecart) < 0.005 ? pastille("vert", "✓ montant") : pastille("rouge", `✗ ${ecart > 0 ? "+" : "−"}${formatEuros(Math.abs(ecart))}`);

  const cellEcriture = (e: EcritureDon) => (
    <td className="px-2 py-1.5 align-top">
      <div className="whitespace-nowrap tabular-nums">
        {formatDate(e.date)} · <strong>{formatEuros(e.montant)}</strong>
      </div>
      {e.texte && <div className="max-w-[16rem] truncate text-[11px] text-muted" title={e.texte}>{e.texte}</div>}
    </td>
  );
  const cellDon = (c: { don: Candidat["don"] }) => (
    <td className="px-2 py-1.5 align-top">
      <div className="font-medium">{nomDonateur(c.don) || "—"}</div>
      <div className="whitespace-nowrap text-[11px] tabular-nums text-muted">
        {formatDate(c.don.date_don)} · {formatEuros(Number(c.don.montant))}
      </div>
    </td>
  );
  const entete = (avecCase: boolean) => (
    <thead>
      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
        {avecCase && <th className="w-8 px-2 py-1" />}
        <th className="px-2 py-1 font-medium">Écriture comptable</th>
        <th className="px-2 py-1 font-medium">Don</th>
        <th className="px-2 py-1 font-medium">Nom</th>
        <th className="px-2 py-1 font-medium">Date</th>
        <th className="px-2 py-1 font-medium">Montant</th>
      </tr>
    </thead>
  );

  return (
    <>
      <button
        type="button"
        onClick={analyser}
        className="rounded-lg border border-accent/50 bg-accent-soft/40 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
        title="Rapproche toutes les écritures « Don » sans don (tous les exercices) des dons « hors compta »"
      >
        🔗 Lier toutes les années
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Lier les dons à la comptabilité — toutes les années</h2>
              <button type="button" onClick={() => setOuvert(false)} className="text-muted hover:text-foreground" aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
              {etat === "analyse" && <p className="text-muted">Analyse des écritures et des dons…</p>}
              {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
              {(etat === "pret" || etat === "ecriture" || etat === "fait") && (
                <>
                  <p className="text-xs text-muted">
                    Un critère en <span className="font-medium text-positive">vert</span> concorde. La fonction ne lie que si le <strong>nom</strong>, le <strong>montant</strong> et la{" "}
                    <strong>date</strong> (±3 jours, ou jusqu&apos;à ±30 jours) sont verts et qu&apos;il n&apos;y a qu&apos;un seul don possible. Tout le reste est à lier manuellement.
                  </p>

                  <section>
                    <h3 className="mb-1 flex flex-wrap items-center gap-3 font-medium">
                      <span className="text-positive">✓ Liens possibles ({surs.length})</span>
                      <span className="text-xs font-normal text-muted">{nbCoches} coché{nbCoches > 1 ? "s" : ""} — décochez ceux qui vous paraissent douteux ; date au-delà de 3 jours : décoché d&apos;office</span>
                      <button type="button" onClick={() => setCoches(new Set(surs.map((l) => l.ecriture.id)))} className="text-xs font-normal text-accent hover:underline">
                        Tout cocher
                      </button>
                      <button type="button" onClick={() => setCoches(new Set())} className="text-xs font-normal text-accent hover:underline">
                        Tout décocher
                      </button>
                    </h3>
                    {surs.length === 0 ? (
                      <p className="text-xs text-muted">Aucun lien à proposer.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-xs">
                          {entete(true)}
                          <tbody>
                            {surs.map((l) => (
                              <tr key={l.ecriture.id} className="border-b border-border/60 last:border-0">
                                <td className="px-2 py-1.5 align-top">
                                  <input type="checkbox" checked={coches.has(l.ecriture.id)} onChange={() => bascule(l.ecriture.id)} disabled={etat !== "pret"} />
                                </td>
                                {cellEcriture(l.ecriture)}
                                {cellDon(l)}
                                <td className="px-2 py-1.5 align-top">{critNom(l.nom)}</td>
                                <td className="px-2 py-1.5 align-top">{critDate(l.jours)}</td>
                                <td className="px-2 py-1.5 align-top">{critMontant(l.ecart)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {(Object.keys(LIBELLE_DOUTE) as CleDoute[])
                    .filter((c) => parDoute.has(c))
                    .map((c) => (
                      <section key={c}>
                        <h3 className="mb-1 font-medium">
                          <span className="text-gold">{parDoute.get(c)!.length}</span> · {LIBELLE_DOUTE[c]}
                        </h3>
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-xs">
                            {entete(true)}
                            <tbody>
                              {parDoute.get(c)!.slice(0, 60).map((d) =>
                                d.dons.length === 0 ? (
                                  <tr key={d.ecriture.id} className="border-b border-border/60 last:border-0">
                                    <td />
                                    {cellEcriture(d.ecriture)}
                                    <td className="px-2 py-1.5 align-top text-muted" colSpan={4}>
                                      aucun don proposé
                                    </td>
                                  </tr>
                                ) : (
                                  d.dons.slice(0, 4).map((x, i) => (
                                    <tr key={d.ecriture.id + x.don.id} className="border-b border-border/60 last:border-0">
                                      <td className="px-2 py-1.5 align-top">
                                        <input
                                          type="checkbox"
                                          checked={choix.get(d.ecriture.id) === x.don.id}
                                          onChange={() => choisir(d.ecriture.id, x.don.id)}
                                          disabled={etat !== "pret" || (choix.get(d.ecriture.id) !== x.don.id && retenuAilleurs(x.don.id, d.ecriture.id))}
                                          title={retenuAilleurs(x.don.id, d.ecriture.id) ? "Ce don est déjà retenu pour une autre écriture" : "Lier ce don à l'écriture"}
                                        />
                                      </td>
                                      {i === 0 ? cellEcriture(d.ecriture) : <td />}
                                      {cellDon(x)}
                                      <td className="px-2 py-1.5 align-top">{critNom(x.nom)}</td>
                                      <td className="px-2 py-1.5 align-top">{critDate(x.jours)}</td>
                                      <td className="px-2 py-1.5 align-top">{critMontant(x.ecart)}</td>
                                    </tr>
                                  ))
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                        {parDoute.get(c)!.length > 60 && <p className="mt-1 text-[11px] text-muted">… et {parDoute.get(c)!.length - 60} autres.</p>}
                      </section>
                    ))}
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              {message && <span className="mr-auto rounded-lg bg-positive/10 px-3 py-1.5 text-positive">{message}</span>}
              {!message && <span className="mr-auto text-xs text-muted">Un lien se défait ensuite depuis la ligne (« Délier »).</span>}
              <span className="text-xs text-muted">
                {nbCoches} lien{nbCoches > 1 ? "s" : ""} possible{nbCoches > 1 ? "s" : ""} + {nbChoix} choisi{nbChoix > 1 ? "s" : ""} dans les doutes
              </span>
              <button
                type="button"
                onClick={lier}
                disabled={nbTotal === 0 || etat !== "pret"}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {etat === "ecriture" ? "Liaison…" : `Lier les ${nbTotal} dons cochés`}
              </button>
              <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
