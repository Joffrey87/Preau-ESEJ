// Caisses liquides : école et événement (hors Comptabilité bancaire).

export type Caisse = {
  id: string;
  cle: "ecole" | "evenement";
  nom: string;
  solde_initial: number;
};

export type CaisseMouvement = {
  id: string;
  caisse_id: string;
  date: string;
  libelle: string;
  montant: number;
  source: "manuel" | "import" | "vente";
  notes: string | null;
  created_at: string;
};

export function solde(caisse: Caisse, mouvements: CaisseMouvement[]): number {
  return (
    Number(caisse.solde_initial) +
    mouvements.filter((m) => m.caisse_id === caisse.id).reduce((s, m) => s + Number(m.montant), 0)
  );
}

export type LigneCaisseProposee = {
  date: string | null;
  libelle: string | null;
  montant: number | null;
};
