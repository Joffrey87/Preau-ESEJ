-- 15/10/2026 — Ordre de la liste des professeurs à la connexion : Charlotte, Eulalie, Faustine, Blandine, puis les
-- autres (ordre alphabétique). Colonne « ordre » : vide = après les professeurs classés.
alter table public.enseignants add column if not exists ordre smallint;
update public.enseignants set ordre = case prenom when 'Charlotte' then 1 when 'Eulalie' then 2 when 'Faustine' then 3 when 'Blandine' then 4 end
 where prenom in ('Charlotte', 'Eulalie', 'Faustine', 'Blandine');

create or replace function public.professeurs_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select trim(coalesce(civilite || ' ', '') || prenom || ' ' || nom), identifiant || '@professeurs.esej'
    from enseignants where actif and not masque_connexion and identifiant is not null
   order by ordre nulls last, nom, prenom;
$$;
