-- 13/10/2026 — Bascule à trois espaces : la famille de la Directrice (dont un membre est aussi à la Recherche de fonds)
-- passe, au logo Préau, de l'Espace famille à la Recherche de fonds et au profil Directrice. `familles.directrice_liee`
-- désigne cette famille ; aucune donnée personnelle.

alter table public.familles add column if not exists directrice_liee boolean not null default false;

-- Recherche de fonds : la famille liée au prénom du membre, et si elle est aussi celle de la Directrice.
create or replace function public.liens_du_membre(p_prenom text)
returns table (famille text, directrice boolean)
language sql stable security definer set search_path = public as $$
  select f.nom, f.directrice_liee from public.familles f
   where f.membre_recherche is not null and lower(f.membre_recherche) = lower(coalesce(p_prenom, ''))
     and public.mon_role() in ('recherche-fonds', 'tresorier', 'president', 'administrateur')
   limit 1;
$$;
revoke all on function public.liens_du_membre(text) from public, anon;
grant execute on function public.liens_du_membre(text) to authenticated;
