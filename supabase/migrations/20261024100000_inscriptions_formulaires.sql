-- 15/10/2026 — Formulaires d'inscription modifiables par la Directrice.
--  - Une configuration (textes, sections, champs, photo) en deux états : « brouillon » (préparé, prévisualisé par la
--    Directrice) et « publie » (ce que voient les familles). Publier recopie le brouillon.
--  - La Directrice peut corriger les réponses d'un dossier reçu.
--  - Pièces jointes : le stockage « inscriptions » accepte aussi les PDF.

create table if not exists public.inscriptions_formulaires (
  etat text primary key check (etat in ('brouillon', 'publie')),
  config jsonb not null,
  modifie_le timestamptz not null default now(),
  modifie_par uuid,
  publie_le timestamptz
);
alter table public.inscriptions_formulaires enable row level security;

-- Version publiée : lisible de tous (la préinscription est un lien public) ; brouillon : Directrice.
drop policy if exists inscriptions_formulaires_lecture on public.inscriptions_formulaires;
create policy inscriptions_formulaires_lecture on public.inscriptions_formulaires for select to anon, authenticated
  using (etat = 'publie' or public.est_directrice());
grant select on public.inscriptions_formulaires to anon, authenticated;

create or replace function public.inscription_formulaire_enregistrer(p_config jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' or jsonb_typeof(p_config->'sections') <> 'array' or length(p_config::text) > 100000 then
    raise exception 'Formulaire invalide';
  end if;
  insert into inscriptions_formulaires (etat, config, modifie_le, modifie_par) values ('brouillon', p_config, now(), auth.uid())
  on conflict (etat) do update set config = excluded.config, modifie_le = now(), modifie_par = auth.uid();
end;
$$;
revoke all on function public.inscription_formulaire_enregistrer(jsonb) from public, anon;
grant execute on function public.inscription_formulaire_enregistrer(jsonb) to authenticated;

create or replace function public.inscription_formulaire_publier() returns void
language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  select config into v from inscriptions_formulaires where etat = 'brouillon';
  if v is null then raise exception 'Aucun brouillon à publier'; end if;
  insert into inscriptions_formulaires (etat, config, modifie_le, modifie_par, publie_le) values ('publie', v, now(), auth.uid(), now())
  on conflict (etat) do update set config = excluded.config, modifie_le = now(), modifie_par = auth.uid(), publie_le = now();
end;
$$;
revoke all on function public.inscription_formulaire_publier() from public, anon;
grant execute on function public.inscription_formulaire_publier() to authenticated;

-- Correction des réponses d'un dossier par la Directrice (le statut et la note ne changent pas).
create or replace function public.inscription_dossier_modifier(p_id uuid, p_donnees jsonb, p_photo text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'object' or length(p_donnees::text) > 20000 then raise exception 'Dossier invalide'; end if;
  if p_photo is not null and p_photo !~ '^directrice/[A-Za-z0-9._-]+$' then raise exception 'Photo invalide'; end if;
  update inscriptions_dossiers set donnees = p_donnees, photo_path = coalesce(p_photo, photo_path), updated_at = now() where id = p_id;
  if not found then raise exception 'Dossier introuvable'; end if;
end;
$$;
revoke all on function public.inscription_dossier_modifier(uuid, jsonb, text) from public, anon;
grant execute on function public.inscription_dossier_modifier(uuid, jsonb, text) to authenticated;

-- Dépôts de la Directrice (photo ou pièce jointe remplacée lors d'une correction).
drop policy if exists inscriptions_fichier_directrice on storage.objects;
create policy inscriptions_fichier_directrice on storage.objects for insert to authenticated
  with check (bucket_id = 'inscriptions' and public.est_directrice() and name like 'directrice/%');

update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
 where id = 'inscriptions';
