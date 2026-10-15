-- 15/10/2026 — Ordre de la liste Événementiel à la connexion : Pauline, Camille, Alizée, puis les autres membres par
-- ordre alphabétique. (Comptes de Camille — famille Chanoine — et d'Alizée — famille Picard (Axel) — créés le même
-- jour avec la fonction _creer_membre_evenement et rattachés à leur famille pour le passage par le logo.)
alter table public.evenement_membres add column if not exists ordre smallint;
update public.evenement_membres set ordre = case identifiant when 'pauline' then 1 when 'camille' then 2 when 'alizee' then 3 end
 where identifiant in ('pauline', 'camille', 'alizee');

create or replace function public.evenement_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select libelle, identifiant || '@evenement.esej' from evenement_membres where user_id is not null and actif
   order by ordre nulls last, libelle;
$$;
