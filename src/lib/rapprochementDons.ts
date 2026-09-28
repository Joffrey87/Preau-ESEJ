// Quelles opérations de la comptabilité sont déjà présentes dans l'onglet Dons ?
//
// Deux niveaux, dans cet ordre :
//   1. le LIEN EXPLICITE `dons.operation_id`, qui fait foi ;
//   2. à défaut, un rapprochement par montant et date — mais en UN-À-UN.
//
// Le un-à-un est le point important : un même don ne peut pas « couvrir » deux
// opérations. Sans cela, deux sous-écritures de même montant et même date
// seraient toutes deux marquées comme enregistrées dès qu'une seule l'était.
//
// L'heuristique reste nécessaire tant que l'historique n'est pas relié : à ce
// jour 8 dons sur 387 portent un lien explicite.

export type OperationRapprochable = {
  id: string;
  date_operation: string;
  montant: number | string;
};

export type DonRapprochable = {
  id: string;
  montant: number | string;
  date_don: string | null;
  operation_id: string | null;
};

const TOLERANCE_JOURS = 3;

function ecartJours(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.abs(Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000));
}

export type Rapprochement = {
  donId: string;
  /** « explicite » : lien enregistré sur le don ; « probable » : même montant à ±3 jours, à confirmer. */
  lien: "explicite" | "probable";
};

/**
 * Don correspondant à chaque opération : le lien explicite d'abord, puis le
 * rapprochement un-à-un par montant et date. L'ordre de parcours est rendu
 * déterministe (date, puis identifiant) pour que deux affichages successifs
 * donnent le même résultat.
 */
export function rapprocherDons(
  operations: OperationRapprochable[],
  dons: DonRapprochable[],
): Map<string, Rapprochement> {
  const res = new Map<string, Rapprochement>();

  // 1. Liens explicites.
  for (const d of dons) {
    if (d.operation_id) res.set(d.operation_id, { donId: d.id, lien: "explicite" });
  }

  // 2. Rapprochement un-à-un sur les dons encore non reliés.
  const libres = dons.filter((d) => !d.operation_id && d.date_don);
  const consommes = new Set<string>();
  const ordonnees = [...operations].sort(
    (a, b) => a.date_operation.localeCompare(b.date_operation) || a.id.localeCompare(b.id),
  );
  for (const op of ordonnees) {
    if (res.has(op.id)) continue;
    const candidat = libres.find(
      (d) =>
        !consommes.has(d.id) &&
        Number(d.montant) === Number(op.montant) &&
        ecartJours(d.date_don as string, op.date_operation) <= TOLERANCE_JOURS,
    );
    if (candidat) {
      consommes.add(candidat.id);
      res.set(op.id, { donId: candidat.id, lien: "probable" });
    }
  }
  return res;
}

/** Identifiants des opérations considérées comme déjà répertoriées dans les dons. */
export function operationsRepertoriees(
  operations: OperationRapprochable[],
  dons: DonRapprochable[],
): Set<string> {
  return new Set(rapprocherDons(operations, dons).keys());
}
