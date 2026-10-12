-- 13/10/2026 — Un enseignant peut être masqué de la liste de l'écran de connexion (compte, matières et droits conservés).

alter table public.enseignants add column if not exists masque_connexion boolean not null default false;

create or replace function public.professeurs_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select trim(coalesce(civilite || ' ', '') || prenom || ' ' || nom), identifiant || '@professeurs.esej'
    from enseignants where actif and not masque_connexion and identifiant is not null order by nom, prenom;
$$;
