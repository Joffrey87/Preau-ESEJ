"use client";

import { useMemo } from "react";
import JaugeDonsVue from "./jauge-dons/JaugeDonsVue";
import { EQUILIBRE_MENSUEL } from "./jauge-dons/config";
import { preparerJaugeDons } from "./jauge-dons/preparerJaugeDons";

/** Dons de l'exercice courant, tels que renvoyés par la RPC `dons_exercice_courant`. */
export type DonsExercice = {
  exercice: string;
  debut: string;
  fin: string;
  dons: { date: string; montant: number }[];
} | null;

/** Jauge des dons (design « Échelle des tranches ») : calcule les données puis affiche la vue. */
export default function JaugeDons({ donnees, aujourdhui }: { donnees: DonsExercice; aujourdhui: string }) {
  const calcul = useMemo(
    () =>
      donnees
        ? preparerJaugeDons(
            donnees.dons.map((d) => ({ date: d.date, montant: Number(d.montant) || 0 })),
            donnees.debut,
            aujourdhui,
          )
        : null,
    [donnees, aujourdhui],
  );
  if (!donnees || !calcul) return null;

  // Cumul attendu aujourd'hui au rythme de l'équilibre précaire : mois écoulés = jours (inclus) ÷ 30,4375.
  const joursEcoules = Math.max(
    (Date.parse(`${aujourdhui.slice(0, 10)}T12:00:00Z`) - Date.parse(`${donnees.debut.slice(0, 10)}T12:00:00Z`)) / 86_400_000 + 1,
    0,
  );
  const attendu = EQUILIBRE_MENSUEL * (joursEcoules / (365.25 / 12));

  return <JaugeDonsVue exercice={donnees.exercice.replace("Exercice ", "")} {...calcul} attendu={attendu} />;
}
