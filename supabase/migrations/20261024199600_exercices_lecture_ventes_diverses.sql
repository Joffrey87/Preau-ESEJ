-- Ventes diverses : les personnes ayant un domaine (École / Événement), dont Astrid Letellier, doivent pouvoir lire les exercices
-- (sans quoi le sélecteur d'exercice est vide et aucune vente ne se charge). Lecture seule, additif.
drop policy if exists exercices_lecture_ventes on public.exercices;
create policy exercices_lecture_ventes on public.exercices for select to authenticated
  using (coalesce(cardinality(public.mes_domaines_ventes()), 0) > 0);
