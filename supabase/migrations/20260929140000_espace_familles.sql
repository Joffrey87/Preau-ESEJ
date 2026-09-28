-- Espace familles : un compte par famille, qui ne voit QUE sa famille.
--
-- 1. Verrouillage : jusqu'ici toute personne connectée pouvait LIRE la
--    comptabilité, toutes les familles, les rattachements… Désormais la lecture
--    est réservée aux rôles du bureau ; une famille n'accède qu'à ses données,
--    par la fonction `espace_famille()` (jamais aux tables directement).
-- 2. Données : familles (fiche), élèves (prénom, classe et année d'entrée),
--    activités (commandes groupées) et participations par élève.
-- 3. Rôle « famille » dans `profils`, rattaché à une famille.

-- ---------------------------------------------------------------------------
-- Rôles
-- ---------------------------------------------------------------------------
alter table public.profils drop constraint if exists profils_role_check;
alter table public.profils add constraint profils_role_check check (role in (
  'president','tresorier','secretaire','administrateur','directrice',
  'directeur-spirituel','resp-mecenat','lecteur','famille'));

create or replace function public.est_bureau() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president','tresorier','secretaire','administrateur',
                               'directrice','directeur-spirituel','resp-mecenat');
$$;

/** Rôles qui gèrent la scolarité (familles, élèves, activités). */
create or replace function public.gere_scolarite() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president','tresorier','secretaire','administrateur','directrice');
$$;

-- ---------------------------------------------------------------------------
-- Familles, élèves, activités
-- ---------------------------------------------------------------------------
create table if not exists public.familles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  parent1 text,
  parent2 text,
  adresse text,
  cp_ville text,
  telephone text,
  courriels text,
  notes text,
  created_at timestamptz not null default now()
);
insert into public.familles (nom)
select distinct famille_nom from public.scolarite_inscriptions
on conflict (nom) do nothing;

alter table public.scolarite_inscriptions add column if not exists famille_id uuid
  references public.familles(id) on delete set null;
update public.scolarite_inscriptions i set famille_id = f.id
  from public.familles f where f.nom = i.famille_nom and i.famille_id is null;

alter table public.profils add column if not exists famille_id uuid
  references public.familles(id) on delete set null;

create table if not exists public.eleves (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  -- Prénom chiffré avec le coffre du carnet d'adresses (données de mineurs) ;
  -- seule l'initiale reste en clair, pour l'espace de la famille.
  prenom_chiffre text not null,
  initiale text check (initiale is null or char_length(initiale) = 1),
  classe_entree text not null check (classe_entree in ('PS','MS','GS','CP','CE1','CE2','CM1','CM2')),
  annee_entree text not null check (annee_entree ~ '^\d{4}-\d{4}$'),
  -- Redoublement (-1) ou saut de classe (+1) cumulés depuis l'entrée.
  decalage integer not null default 0,
  sorti_le date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activites (
  id uuid primary key default gen_random_uuid(),
  annee_scolaire text not null,
  titre text not null,
  date_activite date,
  date_limite date,
  description text,
  prix_defaut numeric,
  -- Prix par classe (ex. {"CP": 12, "CM2": 15}) ; à défaut, prix_defaut.
  prix_par_classe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activites_participations (
  id uuid primary key default gen_random_uuid(),
  activite_id uuid not null references public.activites(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  montant numeric not null check (montant >= 0),
  paye_le date,
  operation_id uuid references public.operations(id) on delete set null,
  notes text,
  unique (activite_id, eleve_id)
);

create or replace function public.ma_famille() returns uuid
language sql stable security definer set search_path = public as $$
  select famille_id from profils where id = auth.uid() and role = 'famille' and actif;
$$;

alter table public.familles enable row level security;
alter table public.eleves enable row level security;
alter table public.activites enable row level security;
alter table public.activites_participations enable row level security;

create policy familles_lecture on public.familles for select to authenticated
  using (public.est_bureau() or id = public.ma_famille());
create policy familles_ecriture on public.familles for all to authenticated
  using (public.gere_scolarite()) with check (public.gere_scolarite());

create policy eleves_lecture on public.eleves for select to authenticated
  using (public.est_bureau() or famille_id = public.ma_famille());
create policy eleves_ecriture on public.eleves for all to authenticated
  using (public.gere_scolarite()) with check (public.gere_scolarite());

create policy activites_lecture on public.activites for select to authenticated
  using (public.est_bureau() or exists (
    select 1 from public.activites_participations p join public.eleves e on e.id = p.eleve_id
     where p.activite_id = activites.id and e.famille_id = public.ma_famille()));
create policy activites_ecriture on public.activites for all to authenticated
  using (public.gere_scolarite()) with check (public.gere_scolarite());

create policy participations_lecture on public.activites_participations for select to authenticated
  using (public.est_bureau() or exists (
    select 1 from public.eleves e where e.id = eleve_id and e.famille_id = public.ma_famille()));
create policy participations_ecriture on public.activites_participations for all to authenticated
  using (public.gere_scolarite()) with check (public.gere_scolarite());

grant select, insert, update, delete on public.familles, public.eleves, public.activites,
  public.activites_participations to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verrouillage de la lecture : bureau seulement
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['affectations_scolarite','budget_lignes','categories','comptes',
    'correspondances','evenements','exercices','financements','journal_operations',
    'modele_recu','operations','organisation','scolarite_bareme','scolarite_inscriptions','taches']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.est_bureau())',
                   t || '_lecture', t);
  end loop;
end $$;

drop policy if exists imports_releve_auth_all on public.imports_releve;
create policy imports_releve_lecture on public.imports_releve for select to authenticated using (public.est_bureau());
create policy imports_releve_ecriture on public.imports_releve for all to authenticated
  using (public.est_tresorier()) with check (public.est_tresorier());

drop policy if exists recus_auth_all on public.recus;
create policy recus_lecture on public.recus for select to authenticated using (public.est_bureau());
create policy recus_ecriture on public.recus for all to authenticated
  using (public.est_tresorier()) with check (public.est_tresorier());

-- ---------------------------------------------------------------------------
-- L'espace d'une famille : une seule porte, qui ne renvoie que ses données.
-- Aucun libellé comptable n'en sort (ils peuvent citer d'autres personnes).
-- ---------------------------------------------------------------------------
create or replace function public.espace_famille()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f uuid := public.ma_famille();
begin
  if f is null then
    raise exception 'Espace réservé aux comptes famille.';
  end if;
  return jsonb_build_object(
    'famille', (select to_jsonb(x) from familles x where x.id = f),
    'eleves', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'initiale', e.initiale, 'classe_entree', e.classe_entree,
                  'annee_entree', e.annee_entree, 'decalage', e.decalage, 'sorti_le', e.sorti_le)
                  order by e.annee_entree, e.initiale), '[]'::jsonb)
                 from eleves e where e.famille_id = f),
    'inscriptions', (select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'annee_scolaire', i.annee_scolaire, 'nb_enfants', i.nb_enfants,
                        'montant_mensuel', i.montant_mensuel, 'avance', i.avance,
                        'm_sept', i.m_sept, 'm_oct', i.m_oct, 'm_nov', i.m_nov, 'm_dec', i.m_dec,
                        'm_jan', i.m_jan, 'm_fev', i.m_fev, 'm_mars', i.m_mars, 'm_avr', i.m_avr,
                        'm_mai', i.m_mai, 'm_juin', i.m_juin,
                        'avance_consommee', i.avance_consommee, 'depot_anterieur', i.depot_anterieur)
                        order by i.annee_scolaire desc), '[]'::jsonb)
                       from scolarite_inscriptions i where i.famille_id = f),
    'versements', (select coalesce(jsonb_agg(jsonb_build_object(
                      'inscription_id', a.inscription_id, 'nature', a.nature, 'montant', a.montant,
                      'date', o.date_operation, 'type', o.type, 'mode', o.mode_paiement,
                      'origine', case
                        when unaccent_simple(concat_ws(' ', o.libelle_origine, o.libelle, p.libelle_origine, p.libelle))
                             like '%amitie sainte anne%' then 'Amitié Sainte-Anne'
                        when c.nom = 'Don d''Association' then 'Association'
                        else 'Famille' end)
                      order by o.date_operation), '[]'::jsonb)
                     from affectations_scolarite a
                     join operations o on o.id = a.operation_id
                     left join operations p on p.id = o.parent_id
                     left join categories c on c.id = o.categorie_id
                    where a.inscription_id in (select id from scolarite_inscriptions where famille_id = f)),
    'activites', (select coalesce(jsonb_agg(jsonb_build_object(
                     'activite_id', ac.id, 'titre', ac.titre, 'date_activite', ac.date_activite,
                     'date_limite', ac.date_limite, 'annee_scolaire', ac.annee_scolaire,
                     'eleve_id', e.id, 'initiale', e.initiale, 'montant', pa.montant, 'paye_le', pa.paye_le)
                     order by ac.date_activite nulls last, e.initiale), '[]'::jsonb)
                    from activites_participations pa
                    join activites ac on ac.id = pa.activite_id
                    join eleves e on e.id = pa.eleve_id
                   where e.famille_id = f),
    'bareme', (select coalesce(jsonb_agg(jsonb_build_object('annee_scolaire', b.annee_scolaire,
                  'nb_enfants', b.nb_enfants, 'montant_mensuel', b.montant_mensuel)), '[]'::jsonb)
                 from scolarite_bareme b)
  );
end $$;

/** Minuscules sans accents, pour repérer un payeur dans un libellé. */
create or replace function public.unaccent_simple(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''),
    'ÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàâäáãéèêëíìîïóòôöõúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
$$;

-- Rattache un compte (créé dans Supabase Auth) à une famille. Trésorier ou
-- administrateurs seulement. Le marquage « espace = famille » dans les
-- métadonnées d'application oriente le compte vers l'espace familles.
create or replace function public.rattacher_compte_famille(p_email text, p_famille text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  u uuid;
  f uuid;
begin
  if not (public.est_tresorier() or public.est_admin()) then
    raise exception 'Réservé au trésorier et aux administrateurs.';
  end if;
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then raise exception 'Aucun compte pour %.', p_email; end if;
  select id into f from public.familles where nom = p_famille;
  if f is null then raise exception 'Famille « % » introuvable.', p_famille; end if;
  insert into public.profils (id, role, famille_id, courriel, actif)
  values (u, 'famille', f, p_email, true)
  on conflict (id) do update set role = 'famille', famille_id = f, actif = true;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"espace":"famille"}'::jsonb
   where id = u;
  return 'Compte ' || p_email || ' rattaché à la famille ' || p_famille || '.';
end $$;

revoke all on function public.rattacher_compte_famille(text, text) from public;
grant execute on function public.espace_famille() to authenticated;
grant execute on function public.rattacher_compte_famille(text, text) to authenticated;
