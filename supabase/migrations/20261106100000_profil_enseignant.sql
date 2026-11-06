-- 06/11/2026 — Mon profil (enseignants + Directrice) : adresse, téléphone, signature.
-- Nom / prénom restent gérés par la Directrice ; la personne ne modifie que ses coordonnées et sa signature.
-- Signature : bucket privé « signatures-enseignants », chemin « {enseignant_id}.png|jpg », prêt pour les PDF.

alter table public.enseignants
  add column if not exists adresse text,
  add column if not exists telephone text,
  add column if not exists signature_path text;

-- Mise à jour de son propre profil (via mon_enseignant, y compris comptes liés enseignants_comptes).
create or replace function public.mon_profil_enseignant_modifier(
  p_adresse text default null,
  p_telephone text default null,
  p_signature text default null
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  eid uuid := public.mon_enseignant();
begin
  if eid is null then raise exception 'Aucun profil enseignant lié à ce compte'; end if;
  update enseignants set
    adresse = case when p_adresse is null then adresse else nullif(btrim(p_adresse), '') end,
    telephone = case when p_telephone is null then telephone else nullif(btrim(p_telephone), '') end,
    signature_path = case when p_signature is null then signature_path else nullif(btrim(p_signature), '') end
  where id = eid;
end;
$$;
revoke all on function public.mon_profil_enseignant_modifier(text, text, text) from public, anon;
grant execute on function public.mon_profil_enseignant_modifier(text, text, text) to authenticated;

-- Lecture de son propre profil (nom/prénom en lecture seule côté UI).
create or replace function public.mon_profil_enseignant()
returns table (
  id uuid,
  civilite text,
  prenom text,
  nom text,
  adresse text,
  telephone text,
  signature_path text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.civilite, e.prenom, e.nom, e.adresse, e.telephone, e.signature_path
    from enseignants e
   where e.id = public.mon_enseignant();
$$;
revoke all on function public.mon_profil_enseignant() from public, anon;
grant execute on function public.mon_profil_enseignant() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures-enseignants', 'signatures-enseignants', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Lecture : Directrice et tout enseignant (pour réutiliser la signature sur les PDF).
drop policy if exists signatures_enseignants_lecture on storage.objects;
create policy signatures_enseignants_lecture on storage.objects for select to authenticated
  using (bucket_id = 'signatures-enseignants' and (public.est_directrice() or public.mon_enseignant() is not null));

-- Écriture : uniquement son propre fichier « {mon_enseignant()}.png|jpg|jpeg ».
drop policy if exists signatures_enseignants_ecriture on storage.objects;
create policy signatures_enseignants_ecriture on storage.objects for all to authenticated
  using (
    bucket_id = 'signatures-enseignants'
    and public.mon_enseignant() is not null
    and split_part(name, '.', 1) = public.mon_enseignant()::text
  )
  with check (
    bucket_id = 'signatures-enseignants'
    and public.mon_enseignant() is not null
    and split_part(name, '.', 1) = public.mon_enseignant()::text
  );
