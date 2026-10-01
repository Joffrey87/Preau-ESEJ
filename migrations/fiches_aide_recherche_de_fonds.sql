-- Appliquée en base le 01/10/2026 : le profil Recherche de fonds lit, crée et
-- modifie les fiches d'aide qui le concernent ; 3 fiches ajoutées (Proposer,
-- arbitrer et classer une idée ; Faire avancer une action ; Préparer une
-- relance de donateurs), modifiables dans l'onglet Processus.
create policy fiches_aide_recherche_fonds on public.fiches_aide for all
  using (public.mon_role() = 'recherche-fonds' and 'recherche-fonds' = any(profils))
  with check (public.mon_role() = 'recherche-fonds' and 'recherche-fonds' = any(profils));
