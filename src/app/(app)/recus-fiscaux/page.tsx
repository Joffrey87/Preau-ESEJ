import PageHeader from "@/components/PageHeader";
import GenererRecuBouton from "@/components/GenererRecuBouton";
import { createClient } from "@/lib/supabase/server";
import { formatEuros, formatDate } from "@/lib/format";
import type { DonPourRecu } from "@/lib/recu";

type DonRow = {
  id: string;
  date_don: string;
  donateur_titre: string | null;
  donateur_nom: string;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  est_personne_morale: boolean;
  adresse: string | null;
  cp_ville: string | null;
  montant: number;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
};

type Groupe = {
  cle: string;
  numero: string | null;
  annee: number;
  total: number;
  nbVersements: number;
  dateMin: string;
  dateMax: string;
  representant: DonRow; // don le plus récent du groupe (infos donateur à jour)
  etat: string | null;
};

// Regroupe les versements par n° de reçu + année civile → un reçu annuel cumulé.
function grouper(dons: DonRow[]): Groupe[] {
  const map = new Map<string, DonRow[]>();
  for (const d of dons) {
    const annee = d.date_don.slice(0, 4);
    const cle = d.recu_numero ? `${d.recu_numero}|${annee}` : `sans|${d.id}`;
    (map.get(cle) ?? map.set(cle, []).get(cle)!).push(d);
  }

  const groupes: Groupe[] = [];
  for (const [cle, rows] of map) {
    const tri = [...rows].sort((a, b) => a.date_don.localeCompare(b.date_don));
    const representant = tri[tri.length - 1];
    groupes.push({
      cle,
      numero: representant.recu_numero,
      annee: Number(representant.date_don.slice(0, 4)),
      total: rows.reduce((s, d) => s + Number(d.montant), 0),
      nbVersements: rows.length,
      dateMin: tri[0].date_don,
      dateMax: tri[tri.length - 1].date_don,
      representant,
      etat: representant.recu_etat,
    });
  }
  return groupes.sort((a, b) => b.dateMax.localeCompare(a.dateMax));
}

export default async function RecusFiscauxPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("dons")
    .select(
      "id, date_don, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, est_personne_morale, adresse, cp_ville, montant, mode_paiement, recu_numero, recu_etat",
    )
    .order("date_don", { ascending: false });

  const groupes = grouper((data ?? []) as DonRow[]);

  const nomAffiche = (d: DonRow) =>
    d.est_personne_morale
      ? d.raison_sociale ?? d.donateur_nom
      : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ");

  const donPourRecu = (g: Groupe): DonPourRecu => {
    const r = g.representant;
    const dateAffichee =
      g.nbVersements > 1
        ? `du ${formatDate(g.dateMin)} au ${formatDate(g.dateMax)}`
        : formatDate(g.dateMax);
    return {
      recu_numero: r.recu_numero,
      donateur_titre: r.donateur_titre,
      donateur_nom: r.donateur_nom,
      donateur_prenom: r.donateur_prenom,
      raison_sociale: r.raison_sociale,
      est_personne_morale: r.est_personne_morale,
      adresse: r.adresse,
      cp_ville: r.cp_ville,
      montant: g.total,
      date_don: r.date_don,
      mode_paiement: r.mode_paiement,
      date_affichee: dateAffichee,
    };
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Reçus fiscaux"
        subtitle="Un reçu annuel par n° et par année, cumulant les versements. Publipostage du modèle ESEJ (.docx)."
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Année</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-center">Versements</th>
              <th className="px-4 py-3 font-medium">N° reçu</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {groupes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  Aucun don enregistré.
                </td>
              </tr>
            ) : (
              groupes.map((g) => (
                <tr key={g.cle} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular-nums">{g.annee}</td>
                  <td className="px-4 py-3">{nomAffiche(g.representant)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatEuros(g.total)}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted">
                    {g.nbVersements}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs">{g.numero ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <GenererRecuBouton don={donPourRecu(g)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
