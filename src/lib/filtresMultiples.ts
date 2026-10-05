import { useCallback, useState } from "react";

/**
 * Filtres en pastilles : un clic active un filtre, un second clic sur le même le
 * retire (aucun filtre actif = tout afficher). Le bouton « + » passe en mode
 * « plusieurs » : chaque clic ajoute ou retire un filtre, et les filtres actifs se
 * cumulent en OU (un élément est gardé s'il correspond à l'un d'eux).
 */
export function useFiltresMultiples<K extends string>(initiaux: K[] = []) {
  const [actifs, setActifs] = useState<K[]>(initiaux);
  const [multiple, setMultiple] = useState(false);

  const basculer = useCallback(
    (k: K) =>
      setActifs((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : multiple ? [...prev, k] : [k])),
    [multiple],
  );

  /** Sortir du mode « plusieurs » ne garde qu'un filtre : le premier choisi. */
  const basculerMultiple = useCallback(() => {
    setMultiple((m) => {
      if (m) setActifs((prev) => prev.slice(0, 1));
      return !m;
    });
  }, []);

  const estActif = useCallback((k: K) => actifs.includes(k), [actifs]);
  const reinitialiser = useCallback(() => setActifs([]), []);

  return { actifs, multiple, basculer, basculerMultiple, estActif, reinitialiser, setActifs };
}
