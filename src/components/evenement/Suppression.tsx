"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { BUCKET_FACTURES, type FactureFournisseur } from "@/lib/evenement";

type Client = ReturnType<typeof createClient>;

/** Efface du stockage les PDF / photos des factures supprimées (sans bloquer si un fichier a déjà disparu). */
async function effacerFichiers(supabase: Client, fichiers: unknown) {
  const liste = Array.isArray(fichiers) ? fichiers.filter((f): f is string => typeof f === "string" && !!f) : [];
  if (liste.length) await supabase.storage.from(BUCKET_FACTURES).remove(liste);
}

/** Demande de suppression transmise au Trésorier par la messagerie interne. */
async function demander(supabase: Client, cible: "facture" | "evenement", id: string, quoi: string, lie: boolean) {
  const ok = window.confirm(
    `${lie ? `${quoi} est liée à une opération bancaire : seul le Trésorier peut la supprimer.\n\n` : ""}` +
      `Transmettre une demande de suppression de ${quoi.toLowerCase()} au Trésorier ?\n` +
      `Un message lui sera envoyé dans Communication interne (boîte Trésorerie)` +
      `${lie ? " et l'opération bancaire sera signalée en ambre dans sa Comptabilité." : "."}`,
  );
  if (!ok) return null;
  const motif = window.prompt("Motif de la demande (facultatif) :", "") ?? "";
  const { error } = await supabase.rpc("demander_suppression", { p_cible: cible, p_id: id, p_motif: motif });
  if (error) return error.message;
  window.alert("Demande transmise au Trésorier.");
  return "";
}

const lien = "hover:underline";

/** Boutons « Supprimer » / « Demander la suppression » et « Historique » d'une dépense Événement. */
export function ActionsSuppressionFacture({ facture, demandeEnAttente }: { facture: FactureFournisseur; demandeEnAttente?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if ((facture.domaine ?? "evenement") !== "evenement") return null;
  const lie = !!facture.operation_id || !!facture.caisse_mouvement_id;
  const quoi = `La dépense « ${facture.libelle || facture.numero || "sans libellé"} » (${formatEuros(Number(facture.montant))})`;

  async function supprimer() {
    if (!window.confirm(`Supprimer définitivement ${quoi.charAt(0).toLowerCase() + quoi.slice(1)} ?${facture.fichier ? "\nLe fichier joint sera aussi effacé." : ""}\n\nVous pourrez annuler depuis l'Historique (sans le fichier).`)) return;
    setOccupe(true);
    setErreur(null);
    const { data, error } = await supabase.from("factures_fournisseurs").delete().eq("id", facture.id).select("id");
    if (error || !data?.length) {
      setOccupe(false);
      setErreur(error?.message ?? "Suppression refusée : la dépense est peut-être liée à une opération bancaire.");
      return;
    }
    await effacerFichiers(supabase, [facture.fichier]);
    setOccupe(false);
    router.refresh();
  }

  async function demande() {
    setOccupe(true);
    const r = await demander(supabase, "facture", facture.id, quoi, !!facture.operation_id);
    setOccupe(false);
    if (r) setErreur(r);
    else if (r === "") router.refresh();
  }

  return (
    <>
      {demandeEnAttente ? (
        <span className="text-xs text-amber-700" title="En attente du Trésorier">
          Suppression demandée
        </span>
      ) : lie ? (
        <button type="button" disabled={occupe} onClick={demande} className={`text-amber-700 ${lien}`}>
          Demander la suppression
        </button>
      ) : (
        <button type="button" disabled={occupe} onClick={supprimer} className={`text-negative ${lien}`}>
          Supprimer
        </button>
      )}
      <BoutonHistorique lignes={[facture.id]} />
      {erreur && <span className="block text-left text-xs text-negative">{erreur}</span>}
    </>
  );
}

/** Boutons de suppression d'un événement entier : direct pour les responsables (et le Trésorier), demande sinon. */
export function ActionsSuppressionEvenement({
  evenement,
  peutSupprimer,
  demandeEnAttente,
}: {
  evenement: { id: string; nom: string; date: string | null };
  peutSupprimer: boolean;
  demandeEnAttente?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const quoi = `L'événement « ${evenement.nom} »`;

  async function supprimer() {
    setOccupe(true);
    setErreur(null);
    const [f, r] = await Promise.all([
      supabase.from("factures_fournisseurs").select("id, libelle, numero, montant, fichier, operation_id, caisse_mouvement_id").eq("evenement_id", evenement.id).eq("domaine", "evenement"),
      supabase.from("evenement_recettes").select("id, libelle, mode, montant, operation_id").eq("evenement_id", evenement.id),
    ]);
    setOccupe(false);
    const factures = f.data ?? [];
    const recettes = r.data ?? [];
    const liees = factures.filter((x) => x.operation_id || x.caisse_mouvement_id).length + recettes.filter((x) => x.operation_id).length;
    if (liees > 0) {
      const res = await demander(supabase, "evenement", evenement.id, quoi, true);
      if (res) setErreur(res);
      else if (res === "") router.refresh();
      return;
    }
    const lignes = [
      `Supprimer définitivement l'événement « ${evenement.nom} »${evenement.date ? ` du ${formatDate(evenement.date)}` : ""} ?`,
      "",
      "Seront aussi supprimés :",
      factures.length
        ? `• ${factures.length} dépense(s) : ${factures.map((x) => `${x.libelle || x.numero || "sans libellé"} (${formatEuros(Number(x.montant))})`).join(", ")}`
        : "• aucune dépense",
      recettes.length
        ? `• ${recettes.length} recette(s) : ${recettes.map((x) => `${x.libelle || x.mode} (${formatEuros(Number(x.montant))})`).join(", ")}`
        : "• aucune recette",
      factures.some((x) => x.fichier) ? "• les fichiers des factures jointes" : "",
      "",
      "Vous pourrez annuler depuis l'Historique (sans les fichiers).",
    ].filter((l, i, t) => l !== "" || (t[i - 1] ?? "") !== "");
    if (!window.confirm(lignes.join("\n"))) return;
    setOccupe(true);
    const { data, error } = await supabase.rpc("evenement_supprimer", { p_id: evenement.id });
    if (error) {
      setOccupe(false);
      setErreur(error.message);
      return;
    }
    await effacerFichiers(supabase, (data as { fichiers?: unknown } | null)?.fichiers);
    setOccupe(false);
    router.refresh();
  }

  async function demande() {
    setOccupe(true);
    const r = await demander(supabase, "evenement", evenement.id, quoi, false);
    setOccupe(false);
    if (r) setErreur(r);
    else if (r === "") router.refresh();
  }

  return (
    <>
      {demandeEnAttente ? (
        <span className="text-xs text-amber-700">Suppression demandée</span>
      ) : peutSupprimer ? (
        <button type="button" disabled={occupe} onClick={supprimer} className={`text-negative ${lien}`}>
          Supprimer
        </button>
      ) : (
        <button type="button" disabled={occupe} onClick={demande} className={`text-amber-700 ${lien}`}>
          Demander la suppression
        </button>
      )}
      <BoutonHistorique lignes={[evenement.id]} evenementId={evenement.id} />
      {erreur && <span className="block text-left text-xs text-negative">{erreur}</span>}
    </>
  );
}

type Entree = {
  id: number;
  table_nom: "evenements_caisse" | "factures_fournisseurs" | "evenement_recettes";
  ligne_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  par: string | null;
  par_libelle: string | null;
  le: string;
  lot: string | null;
  annulation_de: number | null;
  annule_le: string | null;
  annule_par: string | null;
};

const CHAMPS: Record<string, string> = {
  nom: "nom",
  date: "date",
  montant: "montant",
  libelle: "libellé",
  numero: "n°",
  statut: "statut",
  mode: "mode",
  mode_paiement: "paiement",
  notes: "notes",
  caisse_avant: "caisse avant",
  caisse_apres: "caisse après",
  responsable_id: "responsable",
  fichier: "fichier",
  evenement_id: "événement",
  fournisseur_id: "fournisseur",
  categorie_id: "catégorie",
};

function decrire(e: Entree) {
  const ligne = (e.apres ?? e.avant ?? {}) as Record<string, unknown>;
  const type = e.table_nom === "evenements_caisse" ? "l'événement" : e.table_nom === "factures_fournisseurs" ? "la dépense" : "la recette";
  const nom = String(ligne.nom ?? ligne.libelle ?? ligne.numero ?? ligne.mode ?? "");
  const montant = ligne.montant != null ? ` (${formatEuros(Number(ligne.montant))})` : "";
  const verbe = e.action === "INSERT" ? "a ajouté" : e.action === "DELETE" ? "a supprimé" : "a modifié";
  let detail = "";
  if (e.action === "UPDATE" && e.avant && e.apres) {
    const ch = Object.keys(CHAMPS).filter((k) => JSON.stringify(e.avant![k]) !== JSON.stringify(e.apres![k]));
    if (ch.length) detail = ` — ${ch.map((k) => CHAMPS[k]).join(", ")}`;
  }
  return `${e.annulation_de ? "Annulation : " : ""}${verbe} ${type} « ${nom || "sans libellé"} »${montant}${detail}`;
}

/** Bouton « Historique » : toutes les actions Événementiel, ou celles d'une ligne (et de ses dépenses / recettes). */
export function BoutonHistorique({ lignes, evenementId, libelle = "Historique" }: { lignes?: string[]; evenementId?: string; libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className={`text-muted ${lien}`}>
        {libelle}
      </button>
      {ouvert && <Historique lignes={lignes} evenementId={evenementId} fermer={() => setOuvert(false)} />}
    </>
  );
}

function Historique({ lignes, evenementId, fermer }: { lignes?: string[]; evenementId?: string; fermer: () => void }) {
  const supabase = createClient();
  const router = useRouter();
  const [moi, setMoi] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"miennes" | "autres">("miennes");
  const [toutes, setToutes] = useState(!lignes);
  const [entrees, setEntrees] = useState<Entree[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      let q = supabase.from("evenement_historique").select("*").order("id", { ascending: false }).limit(300);
      if (!toutes && lignes?.length) {
        const ids = lignes.join(",");
        q = evenementId
          ? q.or(`ligne_id.in.(${ids}),avant->>evenement_id.eq.${evenementId},apres->>evenement_id.eq.${evenementId}`)
          : q.in("ligne_id", lignes);
      }
      const { data, error } = await q;
      if (!actif) return;
      setMoi(u.user?.id ?? null);
      if (error) setErreur(error.message);
      setEntrees((data ?? []) as Entree[]);
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toutes, version]);

  async function annuler(e: Entree) {
    const groupe = e.lot ? (entrees ?? []).filter((x) => x.lot === e.lot).length : 1;
    const msg =
      e.action === "DELETE"
        ? "Restaurer l'élément supprimé"
        : e.action === "INSERT"
          ? "Supprimer l'élément ajouté"
          : "Rétablir les valeurs d'avant la modification";
    if (!window.confirm(`Annuler cette action ?\n\n${decrire(e)}\n\n${msg}${groupe > 1 ? ` (et les ${groupe - 1} autre(s) action(s) faite(s) en même temps)` : ""}.`)) return;
    setOccupe(true);
    setErreur(null);
    const { data, error } = await supabase.rpc("historique_annuler", { p_id: e.id });
    setOccupe(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    if ((data as { sans_fichier?: number } | null)?.sans_fichier) window.alert("Élément restauré. Le fichier joint avait été effacé : ajoutez-le de nouveau si besoin.");
    setVersion((v) => v + 1);
    router.refresh();
  }

  const liste = (entrees ?? []).filter((e) => (onglet === "miennes" ? e.par === moi : e.par !== moi));
  const onglets = "rounded-full px-3 py-1 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-left" onClick={fermer}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Historique</h2>
          <button type="button" onClick={fermer} className="text-muted hover:underline">
            Fermer
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnglet("miennes")} className={`${onglets} ${onglet === "miennes" ? "bg-accent text-white" : "bg-surface-2"}`}>
            Mes actions
          </button>
          <button type="button" onClick={() => setOnglet("autres")} className={`${onglets} ${onglet === "autres" ? "bg-accent text-white" : "bg-surface-2"}`}>
            Les autres
          </button>
          {lignes && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} />
              Toutes les actions Événementiel
            </label>
          )}
        </div>
        {erreur && <p className="mb-2 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
        <div className="overflow-y-auto">
          {entrees === null ? (
            <p className="py-6 text-center text-sm text-muted">Chargement…</p>
          ) : liste.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucune action.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {liste.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className={e.annule_le ? "text-muted line-through" : ""}>
                      <span className="font-medium">{e.par_libelle ?? "?"}</span> {decrire(e)}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(e.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      {e.annule_le && ` · annulée par ${e.annule_par ?? "?"} le ${new Date(e.annule_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`}
                    </p>
                  </div>
                  {!e.annule_le && (
                    <button type="button" disabled={occupe} onClick={() => annuler(e)} className="shrink-0 text-accent hover:underline">
                      Annuler
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
