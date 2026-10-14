-- 23/10/2026 — Trombinoscope et liste d'élèves par classe.
-- École Futée n'a fourni ni photo ni date de naissance : deux colonnes facultatives, remplies par la Directrice.
-- Photos dans un compartiment privé (lecture : Directrice et enseignants ; écriture : Directrice).

alter table public.eleves add column if not exists date_naissance date;
alter table public.eleves add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eleves-photos', 'eleves-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists eleves_photos_lecture on storage.objects;
create policy eleves_photos_lecture on storage.objects for select to authenticated
  using (bucket_id = 'eleves-photos' and (public.est_directrice() or public.mon_enseignant() is not null));
drop policy if exists eleves_photos_ajout on storage.objects;
create policy eleves_photos_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'eleves-photos' and public.est_directrice());
drop policy if exists eleves_photos_maj on storage.objects;
create policy eleves_photos_maj on storage.objects for update to authenticated
  using (bucket_id = 'eleves-photos' and public.est_directrice());
drop policy if exists eleves_photos_suppr on storage.objects;
create policy eleves_photos_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'eleves-photos' and public.est_directrice());

-- Élèves d'une classe pour le trombinoscope. Coordonnées des parents : Directrice seulement.
create or replace function public.trombinoscope(p_classe uuid)
returns table (id uuid, prenom text, nom text, classe_entree text, annee_entree text, decalage integer, sorti_le date,
               date_naissance date, photo_path text, famille text, parent1 text, parent1_telephone text, parent1_courriel text,
               parent2 text, parent2_telephone text, parent2_courriel text, adresse text)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(e.prenom, e.initiale), coalesce(e.nom_usage, f.nom), e.classe_entree, e.annee_entree, e.decalage, e.sorti_le,
         e.date_naissance, e.photo_path, f.nom,
         case when public.est_directrice() then nullif(btrim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), '') end,
         case when public.est_directrice() then f.parent1_telephone end,
         case when public.est_directrice() then f.parent1_courriel end,
         case when public.est_directrice() then nullif(btrim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '') end,
         case when public.est_directrice() then f.parent2_telephone end,
         case when public.est_directrice() then f.parent2_courriel end,
         case when public.est_directrice() then nullif(btrim(concat_ws(', ', f.adresse, f.cp_ville)), '') end
    from classe_eleves ce join eleves e on e.id = ce.eleve_id join familles f on f.id = e.famille_id
   where ce.classe_id = p_classe and public.enseigne_dans(p_classe)
   order by coalesce(e.nom_usage, f.nom), e.prenom;
$$;
revoke all on function public.trombinoscope(uuid) from public, anon;
grant execute on function public.trombinoscope(uuid) to authenticated;

-- Fiche élève (Directrice) : prénom, nom d'usage, date de naissance, photo. Un champ null n'est pas modifié ;
-- une chaîne vide efface (sauf le prénom, obligatoire).
create or replace function public.eleve_fiche_modifier(p_eleve uuid, p_prenom text default null, p_nom text default null,
  p_naissance text default null, p_photo text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if p_prenom is not null and btrim(p_prenom) = '' then raise exception 'Le prénom est obligatoire'; end if;
  update eleves set
    prenom = coalesce(nullif(btrim(p_prenom), ''), prenom),
    initiale = case when nullif(btrim(p_prenom), '') is not null then upper(left(btrim(p_prenom), 1)) else initiale end,
    nom_usage = case when p_nom is null then nom_usage else nullif(btrim(p_nom), '') end,
    date_naissance = case when p_naissance is null then date_naissance else nullif(btrim(p_naissance), '')::date end,
    photo_path = case when p_photo is null then photo_path else nullif(btrim(p_photo), '') end
  where id = p_eleve;
end;
$$;
revoke all on function public.eleve_fiche_modifier(uuid, text, text, text, text) from public, anon;
grant execute on function public.eleve_fiche_modifier(uuid, text, text, text, text) to authenticated;
