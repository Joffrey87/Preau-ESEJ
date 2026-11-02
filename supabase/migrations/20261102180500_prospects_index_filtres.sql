-- Index pour les filtres paginés de l'onglet Prospections (ajout seul, aucune donnée modifiée).
create index if not exists prospects_liste_idx on public.prospects (liste);
create index if not exists prospects_reserve_a_idx on public.prospects (reserve_a);
create index if not exists prospects_responsable_idx on public.prospects (responsable);
create index if not exists prospects_etat_unifie_idx on public.prospects (etat_unifie);
create index if not exists prospects_updated_at_idx on public.prospects (updated_at desc, id);
create index if not exists suivi_actions_cible_idx on public.suivi_actions (cible_type, cible_cle);
