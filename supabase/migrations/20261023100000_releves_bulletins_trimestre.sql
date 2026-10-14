-- 23/10/2026 — Deux documents distincts (demande de la Directrice) :
--  - Relevé de notes : un par élève et par PÉRIODE ; uniquement les notes de la période, aucune moyenne, une appréciation
--    générale (titulaire, validée par la Directrice).
--  - Bulletin trimestriel : un par élève et par TRIMESTRE ; pré-rempli avec la moyenne de chaque matière, de chaque
--    ensemble et la moyenne générale (moyennes simples, sur 20, toutes les notes des périodes du trimestre) ; une
--    appréciation par professeur intervenant (sa matière), une appréciation générale de la titulaire, validée par la
--    Directrice.
-- Même circuit que les bulletins existants : Nouveau → En cours → Prêt → Validé → Publié (synthèse figée, lue par la famille).
-- Additif : la table « bulletins » (par période, reprises d'École Futée) n'est pas modifiée.

create table if not exists public.releves_notes (
  id uuid primary key default gen_random_uuid(),
  periode_id uuid not null references public.periodes(id) on delete cascade,
  classe_id uuid not null references public.classes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'pret', 'valide', 'publie')),
  appreciation text,
  synthese jsonb,
  valide_le timestamptz,
  valide_par uuid,
  publie_le timestamptz,
  lu_le timestamptz,
  updated_at timestamptz not null default now(),
  unique (periode_id, eleve_id)
);
create index if not exists releves_notes_classe on public.releves_notes (classe_id, periode_id);

create table if not exists public.bulletins_trimestre (
  id uuid primary key default gen_random_uuid(),
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  trimestre smallint not null check (trimestre between 1 and 3),
  classe_id uuid not null references public.classes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'pret', 'valide', 'publie')),
  appreciation text,
  synthese jsonb,
  valide_le timestamptz,
  valide_par uuid,
  publie_le timestamptz,
  lu_le timestamptz,
  updated_at timestamptz not null default now(),
  unique (annee_scolaire, trimestre, eleve_id)
);
create index if not exists bulletins_trimestre_classe on public.bulletins_trimestre (classe_id, annee_scolaire, trimestre);

-- Appréciation d'un professeur intervenant, par matière (Anglais, Catéchisme, Sport…).
create table if not exists public.bulletins_trimestre_appreciations (
  bulletin_id uuid not null references public.bulletins_trimestre(id) on delete cascade,
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  texte text,
  auteur uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (bulletin_id, matiere_id)
);

alter table public.releves_notes enable row level security;
alter table public.bulletins_trimestre enable row level security;
alter table public.bulletins_trimestre_appreciations enable row level security;

drop policy if exists releves_notes_lecture on public.releves_notes;
create policy releves_notes_lecture on public.releves_notes for select to authenticated
  using (public.enseigne_dans(classe_id)
         or (statut = 'publie' and exists (select 1 from eleves e where e.id = eleve_id and e.famille_id = public.ma_famille())));
drop policy if exists releves_notes_maj on public.releves_notes;
create policy releves_notes_maj on public.releves_notes for update to authenticated
  using (public.est_directrice() or (public.est_titulaire(classe_id) and statut in ('nouveau', 'en_cours', 'pret')))
  with check (public.est_directrice() or public.est_titulaire(classe_id));

drop policy if exists bulletins_trimestre_lecture on public.bulletins_trimestre;
create policy bulletins_trimestre_lecture on public.bulletins_trimestre for select to authenticated
  using (public.enseigne_dans(classe_id)
         or (statut = 'publie' and exists (select 1 from eleves e where e.id = eleve_id and e.famille_id = public.ma_famille())));
drop policy if exists bulletins_trimestre_maj on public.bulletins_trimestre;
create policy bulletins_trimestre_maj on public.bulletins_trimestre for update to authenticated
  using (public.est_directrice() or (public.est_titulaire(classe_id) and statut in ('nouveau', 'en_cours', 'pret')))
  with check (public.est_directrice() or public.est_titulaire(classe_id));

create or replace function public.bulletin_trimestre_modifiable(p_bulletin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice() or exists (select 1 from bulletins_trimestre where id = p_bulletin and statut in ('nouveau', 'en_cours', 'pret'));
$$;
revoke all on function public.bulletin_trimestre_modifiable(uuid) from public, anon;
grant execute on function public.bulletin_trimestre_modifiable(uuid) to authenticated;

drop policy if exists bt_appreciations_lecture on public.bulletins_trimestre_appreciations;
create policy bt_appreciations_lecture on public.bulletins_trimestre_appreciations for select to authenticated
  using (exists (select 1 from bulletins_trimestre b where b.id = bulletin_id and public.enseigne_dans(b.classe_id)));
drop policy if exists bt_appreciations_ecriture on public.bulletins_trimestre_appreciations;
create policy bt_appreciations_ecriture on public.bulletins_trimestre_appreciations for all to authenticated
  using (public.peut_noter(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id))
  with check (public.peut_noter(matiere_id) and public.bulletin_trimestre_modifiable(bulletin_id));

-- Garde commune : hors Directrice, statut limité à Nouveau / En cours / Prêt ; synthèse et dates intouchables.
create or replace function public.releves_trimestre_garde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.est_directrice() then return new; end if;
  if new.statut not in ('nouveau', 'en_cours', 'pret') then raise exception 'Seule la Directrice valide ou publie'; end if;
  new.synthese := old.synthese; new.valide_le := old.valide_le; new.valide_par := old.valide_par;
  new.publie_le := old.publie_le; new.lu_le := old.lu_le;
  if new.statut = 'nouveau' and new.appreciation is distinct from old.appreciation then new.statut := 'en_cours'; end if;
  return new;
end;
$$;
drop trigger if exists releves_notes_garde on public.releves_notes;
create trigger releves_notes_garde before update on public.releves_notes for each row execute function public.releves_trimestre_garde();
drop trigger if exists bulletins_trimestre_garde on public.bulletins_trimestre;
create trigger bulletins_trimestre_garde before update on public.bulletins_trimestre for each row execute function public.releves_trimestre_garde();

create or replace function public.bt_appreciations_touche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.auteur := coalesce(auth.uid(), new.auteur);
  update bulletins_trimestre set statut = 'en_cours' where id = new.bulletin_id and statut = 'nouveau';
  return new;
end;
$$;
drop trigger if exists bt_appreciations_touche on public.bulletins_trimestre_appreciations;
create trigger bt_appreciations_touche before insert or update on public.bulletins_trimestre_appreciations
  for each row execute function public.bt_appreciations_touche();

-- Création des documents manquants d'une classe.
create or replace function public.releves_preparer(p_periode uuid, p_classe uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.enseigne_dans(p_classe) then raise exception 'Accès refusé'; end if;
  insert into releves_notes (periode_id, classe_id, eleve_id)
  select p_periode, p_classe, ce.eleve_id from classe_eleves ce where ce.classe_id = p_classe
  on conflict (periode_id, eleve_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.bulletins_trimestre_preparer(p_annee text, p_trimestre smallint, p_classe uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.enseigne_dans(p_classe) then raise exception 'Accès refusé'; end if;
  insert into bulletins_trimestre (annee_scolaire, trimestre, classe_id, eleve_id)
  select p_annee, p_trimestre, p_classe, ce.eleve_id from classe_eleves ce where ce.classe_id = p_classe
  on conflict (annee_scolaire, trimestre, eleve_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Changement de statut groupé (p_doc : 'releve' ou 'trimestre').
create or replace function public.releves_changer_statut(p_doc text, p_ids uuid[], p_statut text) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  n integer;
  t text := case p_doc when 'releve' then 'releves_notes' when 'trimestre' then 'bulletins_trimestre' end;
begin
  if t is null then raise exception 'Document inconnu : %', p_doc; end if;
  if p_statut = 'pret' then
    execute format('update %I set statut = ''pret'' where id = any ($1) and statut in (''nouveau'', ''en_cours'')
                    and (public.est_directrice() or public.est_titulaire(classe_id))', t) using p_ids;
  elsif p_statut = 'en_cours' then
    execute format('update %I set statut = ''en_cours'', synthese = case when statut = ''publie'' then null else synthese end,
                    publie_le = case when statut = ''publie'' then null else publie_le end
                    where id = any ($1) and ((statut = ''pret'' and (public.est_directrice() or public.est_titulaire(classe_id)))
                                             or (statut in (''valide'', ''publie'') and public.est_directrice()))', t) using p_ids;
  elsif p_statut = 'valide' then
    if not public.est_directrice() then raise exception 'Seule la Directrice valide'; end if;
    execute format('update %I set statut = ''valide'', valide_le = now(), valide_par = auth.uid(), synthese = null, publie_le = null
                    where id = any ($1) and statut in (''nouveau'', ''en_cours'', ''pret'', ''publie'')', t) using p_ids;
  else
    raise exception 'Statut inconnu : %', p_statut;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Publication : la Directrice fournit la synthèse calculée de chaque document validé.
create or replace function public.releves_publier(p_doc text, p_items jsonb) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  n integer;
  t text := case p_doc when 'releve' then 'releves_notes' when 'trimestre' then 'bulletins_trimestre' end;
begin
  if t is null then raise exception 'Document inconnu : %', p_doc; end if;
  if not public.est_directrice() then raise exception 'Seule la Directrice publie'; end if;
  execute format('update %I b set statut = ''publie'', synthese = i.value -> ''synthese'', publie_le = now(), lu_le = null
                  from jsonb_array_elements($1) i where b.id = (i.value ->> ''id'')::uuid and b.statut = ''valide''', t) using p_items;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Accusé de lecture par la famille.
create or replace function public.releve_lu(p_doc text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare t text := case p_doc when 'releve' then 'releves_notes' when 'trimestre' then 'bulletins_trimestre' end;
begin
  if t is null then return; end if;
  execute format('update %I b set lu_le = now() where b.id = $1 and b.statut = ''publie'' and b.lu_le is null
                  and exists (select 1 from eleves e where e.id = b.eleve_id and e.famille_id = public.ma_famille())', t) using p_id;
end;
$$;

revoke all on function public.releves_preparer(uuid, uuid), public.bulletins_trimestre_preparer(text, smallint, uuid),
  public.releves_changer_statut(text, uuid[], text), public.releves_publier(text, jsonb), public.releve_lu(text, uuid) from public, anon;
grant execute on function public.releves_preparer(uuid, uuid), public.bulletins_trimestre_preparer(text, smallint, uuid),
  public.releves_changer_statut(text, uuid[], text), public.releves_publier(text, jsonb), public.releve_lu(text, uuid) to authenticated;
