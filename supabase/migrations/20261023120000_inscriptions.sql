-- 23/10/2026 — Réinscription et préinscription (première version).
--  - Préinscription : lien public, une nouvelle famille remplit le dossier (sans compte).
--  - Réinscription : depuis l'Espace famille, dossier pré-rempli pour un enfant déjà inscrit.
--  - La Directrice valide, met en attente ou refuse. Valider ne crée encore aucun élève ni aucune famille.

create table if not exists public.inscriptions_dossiers (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('preinscription', 'reinscription')),
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  famille_id uuid references public.familles(id) on delete set null,
  eleve_id uuid references public.eleves(id) on delete set null,
  statut text not null default 'recu' check (statut in ('recu', 'valide', 'attente', 'refuse')),
  donnees jsonb not null default '{}'::jsonb,
  photo_path text,
  note_directrice text,
  traite_le timestamptz,
  traite_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inscriptions_dossiers_annee on public.inscriptions_dossiers (annee_scolaire, statut);
alter table public.inscriptions_dossiers enable row level security;

drop policy if exists inscriptions_lecture on public.inscriptions_dossiers;
create policy inscriptions_lecture on public.inscriptions_dossiers for select to authenticated
  using (public.est_directrice() or (famille_id is not null and famille_id = public.ma_famille()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inscriptions', 'inscriptions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Dépôt de la photo : sans compte, seulement sous preinscription/ ; une famille, sous reinscription/<sa famille>/.
drop policy if exists inscriptions_photo_public on storage.objects;
create policy inscriptions_photo_public on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'inscriptions' and name like 'preinscription/%');
drop policy if exists inscriptions_photo_famille on storage.objects;
create policy inscriptions_photo_famille on storage.objects for insert to authenticated
  with check (bucket_id = 'inscriptions' and public.ma_famille() is not null and name like 'reinscription/' || public.ma_famille()::text || '/%');
drop policy if exists inscriptions_photo_lecture on storage.objects;
create policy inscriptions_photo_lecture on storage.objects for select to authenticated
  using (bucket_id = 'inscriptions' and public.est_directrice());

create or replace function public.inscription_annee_valide(p text) returns boolean
language sql immutable as $$
  select p ~ '^\d{4}-\d{4}$' and split_part(p, '-', 2)::int = split_part(p, '-', 1)::int + 1;
$$;

-- Dépôt d'une préinscription (lien public).
create or replace function public.preinscription_deposer(p_annee text, p_donnees jsonb, p_photo text default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.inscription_annee_valide(p_annee) then raise exception 'Année scolaire invalide'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'object' or length(p_donnees::text) > 20000 then raise exception 'Dossier invalide'; end if;
  if btrim(coalesce(p_donnees->>'enfant_prenom', '')) = '' or btrim(coalesce(p_donnees->>'enfant_nom', '')) = '' then
    raise exception 'Le prénom et le nom de l''enfant sont obligatoires';
  end if;
  if btrim(coalesce(p_donnees->>'parent1_courriel', '')) = '' and btrim(coalesce(p_donnees->>'parent1_telephone', '')) = '' then
    raise exception 'Indiquez au moins un courriel ou un téléphone';
  end if;
  if p_photo is not null and p_photo !~ '^preinscription/[A-Za-z0-9._-]+$' then raise exception 'Photo invalide'; end if;
  -- Garde-fou contre les envois en rafale.
  if (select count(*) from inscriptions_dossiers where type = 'preinscription' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de dossiers déposés : réessayez dans une heure';
  end if;
  insert into inscriptions_dossiers (type, annee_scolaire, donnees, photo_path)
  values ('preinscription', p_annee, p_donnees, p_photo) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.preinscription_deposer(text, jsonb, text) from public;
grant execute on function public.preinscription_deposer(text, jsonb, text) to anon, authenticated;

-- Dépôt (ou mise à jour tant qu'il n'est pas traité) d'une réinscription par la famille.
create or replace function public.reinscription_deposer(p_eleve uuid, p_annee text, p_donnees jsonb, p_photo text default null) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_famille uuid := public.ma_famille();
  v_id uuid;
begin
  if v_famille is null then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from eleves where id = p_eleve and famille_id = v_famille) then raise exception 'Enfant introuvable'; end if;
  if not public.inscription_annee_valide(p_annee) then raise exception 'Année scolaire invalide'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'object' or length(p_donnees::text) > 20000 then raise exception 'Dossier invalide'; end if;
  if p_photo is not null and p_photo not like 'reinscription/' || v_famille::text || '/%' then raise exception 'Photo invalide'; end if;
  select id into v_id from inscriptions_dossiers
   where type = 'reinscription' and eleve_id = p_eleve and annee_scolaire = p_annee and statut in ('recu', 'attente')
   order by created_at desc limit 1;
  if v_id is null then
    insert into inscriptions_dossiers (type, annee_scolaire, famille_id, eleve_id, donnees, photo_path)
    values ('reinscription', p_annee, v_famille, p_eleve, p_donnees, p_photo) returning id into v_id;
  else
    update inscriptions_dossiers set donnees = p_donnees, photo_path = coalesce(p_photo, photo_path), statut = 'recu', updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.reinscription_deposer(uuid, text, jsonb, text) from public, anon;
grant execute on function public.reinscription_deposer(uuid, text, jsonb, text) to authenticated;

-- Décision de la Directrice.
create or replace function public.inscription_decider(p_id uuid, p_statut text, p_note text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if p_statut not in ('recu', 'valide', 'attente', 'refuse') then raise exception 'Statut inconnu : %', p_statut; end if;
  update inscriptions_dossiers set statut = p_statut, note_directrice = coalesce(p_note, note_directrice),
         traite_le = case when p_statut = 'recu' then null else now() end,
         traite_par = case when p_statut = 'recu' then null else auth.uid() end, updated_at = now()
   where id = p_id;
end;
$$;
revoke all on function public.inscription_decider(uuid, text, text) from public, anon;
grant execute on function public.inscription_decider(uuid, text, text) to authenticated;

-- Courriels des familles inscrites (envoi du lien de réinscription) : Directrice.
create or replace function public.inscription_courriels_familles(p_annee text)
returns table (famille text, courriel text)
language sql stable security definer set search_path = public as $$
  select distinct f.nom, lower(btrim(c)) from familles f
    join eleves e on e.famille_id = f.id and (e.sorti_le is null or e.sorti_le >= (split_part(p_annee, '-', 1) || '-09-01')::date)
    cross join lateral unnest(array[f.parent1_courriel, f.parent2_courriel]) c
   where public.est_directrice() and btrim(coalesce(c, '')) like '%@%'
   order by 1, 2;
$$;
revoke all on function public.inscription_courriels_familles(text) from public, anon;
grant execute on function public.inscription_courriels_familles(text) to authenticated;
