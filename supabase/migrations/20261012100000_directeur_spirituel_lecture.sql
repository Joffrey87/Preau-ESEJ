-- Directeur spirituel : onglets « Carnet d'adresses » et « Dons » en LECTURE SEULE.
--  - dons : lecture de tous les dons (noms chiffrés : le coffre reste nécessaire pour les lire) ;
--  - coffre : lecture (clé enveloppée ; sans le code du coffre, rien n'est déchiffré) ;
--  - contacts : seulement les catégories que son profil voit déjà dans l'application (bureau, enseignant, autre).
-- Aucune écriture (les politiques d'écriture restent celles du trésorier) ; les prospects ne lui sont pas ouverts.
drop policy if exists dons_lecture on public.dons;
create policy dons_lecture on public.dons for select using (
  public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel'
);

drop policy if exists coffre_lecture on public.coffre;
create policy coffre_lecture on public.coffre for select using (
  public.peut_voir_pipeline() or public.mon_role() = 'directeur-spirituel'
);

drop policy if exists contacts_lecture on public.contacts;
create policy contacts_lecture on public.contacts for select using (
  public.peut_voir_sensible()
  or (public.mon_role() = 'directeur-spirituel' and categories && array['bureau', 'enseignant', 'autre']::text[])
);
