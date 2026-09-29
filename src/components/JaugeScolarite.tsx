"use client";

import { formatEurosCourt as formatEuros, todayISO } from "@/lib/format";
import { etatPaiement } from "@/lib/retardScolarite";

export const MOIS_PAR_AN = 10;

/** Ordre des mois de l'année scolaire : septembre → juin. */
const MOIS_LABELS = ["S", "O", "N", "D", "J", "F", "M", "A", "M", "J"];

/**
 * Nombre de mensualités dues à date pour une année scolaire donnée.
 *
 * Convention retenue : la mensualité d'un mois est due PENDANT ce mois. Au
 * 2 septembre, une mensualité est donc attendue. Avant la rentrée : 0 ; après
 * juin : les 10.
 */
export function moisDus(anneeScolaire: string, aujourdhui = new Date()): number {
  const m = anneeScolaire.match(/^(\d{4})-(\d{4})$/);
  if (!m) return MOIS_PAR_AN;
  const debut = Number(m[1]);

  const an = aujourdhui.getFullYear();
  const mois = aujourdhui.getMonth() + 1; // 1..12

  // Rang du mois courant dans l'année scolaire : septembre = 1 … juin = 10.
  const rang = (annee: number, moisCivil: number): number => {
    if (annee === debut && moisCivil >= 9) return moisCivil - 8; // sept..déc → 1..4
    if (annee === debut + 1 && moisCivil <= 6) return moisCivil + 4; // janv..juin → 5..10
    return annee < debut || (annee === debut && moisCivil < 9) ? 0 : MOIS_PAR_AN;
  };

  return Math.max(0, Math.min(MOIS_PAR_AN, rang(an, mois)));
}

export type EtatJauge = {
  du: number; // total de l'année
  attendu: number; // dû à date
  paye: number;
  retardMois: number; // en mensualités
  ton: "vert" | "orange" | "rouge" | "neutre";
};

/** Calcule l'état d'avancement d'une famille (ou d'un ensemble). */
export function etatJauge(
  montantMensuel: number,
  paye: number,
  anneeScolaire: string,
  aujourdhui = new Date(),
): EtatJauge {
  const dus = moisDus(anneeScolaire, aujourdhui);
  const du = montantMensuel * MOIS_PAR_AN;
  const attendu = montantMensuel * dus;
  const retardMois = montantMensuel > 0 ? (attendu - paye) / montantMensuel : 0;

  // Même règle que la colonne Réglé : ambre à partir du 27 pour la mensualité
  // du mois non encore réglée, rouge dès le 1er du mois suivant.
  const p = etatPaiement(anneeScolaire, montantMensuel, du, paye, todayISO(aujourdhui));
  const ton: EtatJauge["ton"] =
    dus === 0 ? "neutre" : p.retard > 0 ? "rouge" : p.aReglerFinDeMois > 0 ? "orange" : "vert";

  return { du, attendu, paye, retardMois, ton };
}

const COULEURS: Record<EtatJauge["ton"], string> = {
  vert: "bg-jauge",
  orange: "bg-gold",
  rouge: "bg-negative",
  neutre: "bg-muted/40",
};

/**
 * Jauge de règlement des frais de scolarité.
 *
 * La barre représente l'année entière (10 mensualités), graduée mois par mois.
 * Le remplissage indique ce qui est réglé ; un repère vertical marque ce qui
 * devrait l'être à date. La couleur bascule à un mois de retard, puis à deux.
 */
export default function JaugeScolarite({
  etat,
  anneeScolaire,
  compacte = false,
}: {
  etat: EtatJauge;
  anneeScolaire: string;
  compacte?: boolean;
}) {
  const { du, attendu, paye, ton } = etat;
  const pct = du > 0 ? Math.min(100, (paye / du) * 100) : 0;
  const pctAttendu = du > 0 ? Math.min(100, (attendu / du) * 100) : 0;
  const dus = moisDus(anneeScolaire);

  const hauteur = compacte ? "h-2.5" : "h-5";

  return (
    <div className={compacte ? "w-full min-w-20 max-w-44" : "w-full"}>
      {/* Conteneur SANS overflow caché : le repère doit pouvoir déborder. */}
      <div className={`relative ${compacte ? "py-1.5" : "py-2"}`}>
        <div className={`relative ${hauteur} overflow-hidden rounded-full bg-surface-2`}>
          {/* Remplissage : part réglée */}
          <div
            className={`absolute inset-y-0 left-0 ${COULEURS[ton]} transition-[width] duration-500`}
            style={{ width: `${pct}%` }}
          />

          {/* Graduations : une par mensualité */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: MOIS_PAR_AN }, (_, k) => (
              <div
                key={k}
                className={`flex-1 ${k < MOIS_PAR_AN - 1 ? "border-r border-background/70" : ""} ${
                  compacte ? "" : "flex items-center justify-center"
                }`}
              >
                {!compacte && (
                  <span className="text-[9px] font-medium text-foreground/50">{MOIS_LABELS[k]}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Repère du mois en cours : un chevron ambre posé au-dessus de la barre,
            pointant vers la graduation attendue. La barre reste intacte. */}
        {dus > 0 && (
          <div
            className="pointer-events-none absolute top-0 h-0 w-0 border-x-transparent border-t-gold"
            style={{
              left: `${pctAttendu}%`,
              transform: "translateX(-50%)",
              borderLeftWidth: compacte ? 4 : 5,
              borderRightWidth: compacte ? 4 : 5,
              borderTopWidth: compacte ? 5 : 6,
            }}
            title={`Attendu à ce jour : ${formatEuros(attendu)} (${dus} mensualité${dus > 1 ? "s" : ""})`}
          />
        )}
      </div>

      {!compacte && dus > 0 && (
        <div className="mt-1.5 text-xs text-muted" title={`${formatEuros(paye)} réglés sur ${formatEuros(du)} ; attendu à ce jour : ${formatEuros(attendu)}`}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-gold align-middle" />
            attendu à ce jour
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * « ? » placé après un montant réglé signalé : rouge pour un retard, ambre pour
 * la mensualité du mois à régler avant sa fin. Le survol en donne le sens.
 */
export function AideReglement({ retard, finDeMois }: { retard: boolean; finDeMois: boolean }) {
  if (!retard && !finDeMois) return null;
  return (
    <span
      title={retard ? "En retard : mensualité due depuis la fin du mois dernier" : "À payer d'ici la fin du mois"}
      className={`ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] font-bold ${
        retard ? "border-negative/50 text-negative" : "border-gold/60 text-gold"
      }`}
    >
      ?
    </span>
  );
}
