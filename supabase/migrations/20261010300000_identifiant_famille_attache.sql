-- 10/10/2026 — Identifiant de connexion d'une famille : le nom « tout attaché », sans tiret (« de Blic » → « deblic »).
-- L'identifiant devient une colonne ordinaire (calculée à la création, modifiable) pour permettre une exception :
-- la famille Picard A se connecte provisoirement avec « picard » (jusqu'à l'arrivée de la famille Picard H).

create or replace function public.identifiant_famille(p_nom text) returns text
language sql immutable as $$
  select regexp_replace(
    translate(lower(p_nom), 'àâäáãéèêëíìîïóòôöõúùûüçñœ', 'aaaaaeeeeiiiiooooouuuucno'), '[^a-z0-9]+', '', 'g')
$$;

alter table public.familles alter column identifiant drop expression;

create or replace function public.familles_identifiant() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.identifiant := coalesce(nullif(new.identifiant, ''), public.identifiant_famille(new.nom));
  elsif new.nom is distinct from old.nom and old.identifiant = public.identifiant_famille(old.nom) then
    -- Un identifiant modifié à la main (exception) n'est pas recalculé.
    new.identifiant := public.identifiant_famille(new.nom);
  end if;
  return new;
end;
$$;
drop trigger if exists familles_identifiant on public.familles;
create trigger familles_identifiant before insert or update of nom on public.familles
  for each row execute function public.familles_identifiant();

update public.familles set identifiant = public.identifiant_famille(nom);
update public.familles set identifiant = 'picard' where nom = 'Picard A';

-- Comptes déjà créés : l'adresse interne de connexion suit l'identifiant.
update auth.users u set email = f.identifiant || '@familles.esej', updated_at = now()
  from public.profils p join public.familles f on f.id = p.famille_id
 where p.id = u.id and p.role = 'famille' and u.email is distinct from f.identifiant || '@familles.esej';
update auth.identities i
   set identity_data = i.identity_data || jsonb_build_object('email', u.email)
  from auth.users u
 where i.user_id = u.id and i.provider = 'email' and u.email like '%@familles.esej';
update public.profils p set courriel = u.email
  from auth.users u
 where p.id = u.id and p.role = 'famille' and p.courriel is distinct from u.email;
