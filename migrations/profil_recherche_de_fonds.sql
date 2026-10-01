-- Appliquée en base le 01/10/2026 (migration « profil_recherche_de_fonds »).
-- Profil « Recherche de fonds » (recherche-fonds@roles.esej) : n'utilise que le
-- Pipeline donateurs. Lecture des dons (coordonnées chiffrées : le coffre reste
-- nécessaire), du coffre et des prospects ; écriture sur les prospects seulement.
create or replace function public.peut_voir_pipeline()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.peut_voir_sensible() or public.mon_role() = 'recherche-fonds';
$$;
drop policy if exists dons_lecture on public.dons;
create policy dons_lecture on public.dons for select using (public.peut_voir_pipeline());
drop policy if exists coffre_lecture on public.coffre;
create policy coffre_lecture on public.coffre for select using (public.peut_voir_pipeline());
drop policy if exists prospects_lecture on public.prospects;
create policy prospects_lecture on public.prospects for select using (public.peut_voir_pipeline());
drop policy if exists prospects_ecriture on public.prospects;
create policy prospects_ecriture on public.prospects for all
  using (public.est_tresorier() or public.mon_role() = 'recherche-fonds')
  with check (public.est_tresorier() or public.mon_role() = 'recherche-fonds');
