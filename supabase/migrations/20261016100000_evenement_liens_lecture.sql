-- Profil Événement, suite : lecture par le Président et la Directrice, noms des membres, lien vers
-- l'Espace famille (et par lui vers la Recherche de fonds : familles.membre_recherche), modification nom/courriel.

create or replace function public.voit_evenements() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_evenement() or public.mon_role() in ('tresorier','president','directrice');
$$;
revoke execute on function public.voit_evenements() from public, anon;
grant execute on function public.voit_evenements() to authenticated;

drop policy if exists evenement_membres_lecture on public.evenement_membres;
create policy evenement_membres_lecture on public.evenement_membres for select to authenticated
  using (public.voit_evenements());
drop policy if exists evenements_caisse_tout on public.evenements_caisse;
create policy evenements_caisse_lecture on public.evenements_caisse for select to authenticated
  using (public.voit_evenements());
create policy evenements_caisse_ecriture on public.evenements_caisse for all to authenticated
  using (public.est_evenement() or public.est_tresorier())
  with check (public.est_evenement() or public.est_tresorier());

-- Lien vers la famille (Espace famille) ; le membre Recherche de fonds de cette famille s'en déduit.
alter table public.evenement_membres add column if not exists famille_id uuid references public.familles(id) on delete set null;

-- Modification du nom et du courriel (courriel facultatif ici : membres de départ sans adresse).
create or replace function public.modifier_membre_evenement(p_id uuid, p_nom text, p_courriel text)
returns void language plpgsql security definer set search_path = public as $$
declare c text := nullif(lower(trim(coalesce(p_courriel,''))), '');
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Accès refusé.'; end if;
  if c is not null and c !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse électronique invalide.'; end if;
  update evenement_membres set nom = nullif(trim(coalesce(p_nom,'')), ''), courriel = c where id = p_id;
  update profils set nom = nullif(trim(coalesce(p_nom,'')), ''), courriel = c
   where id = (select user_id from evenement_membres where id = p_id);
end;
$$;
revoke all on function public.modifier_membre_evenement(uuid, text, text) from public, anon;
grant execute on function public.modifier_membre_evenement(uuid, text, text) to authenticated;

-- Données : noms et liens (Picard : Antonia est l'épouse d'Henri → famille « Picard H », pas « Picard A » d'Axel).
update public.evenement_membres m set nom = v.nom,
       famille_id = (select id from public.familles where nom = v.famille)
  from (values ('Antonia','Picard','Picard H'), ('Astrid','Letellier','Letellier'), ('Charlotte','Dufour','Dufour'),
               ('Marie A.','Antona','Antona'), ('Marie W.','Warnan','Warnan'), ('Pauline','Gros','Gros')) v(libelle, nom, famille)
 where m.libelle = v.libelle;
update public.profils p set nom = m.nom from public.evenement_membres m where p.id = m.user_id;
