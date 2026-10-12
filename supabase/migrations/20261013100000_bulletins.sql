-- 13/10/2026 — Onglet BULLETINS (Directrice et Professeurs), espace famille.
--
-- Référentiel : enseignants (comptes nominatifs « Professeurs », ou rattachés à un compte du bureau : Directrice,
-- Directeur spirituel pour le catéchisme), classes d'une année scolaire (multi-niveaux) et leurs élèves, périodes,
-- groupes de matières et matières (coefficient, enseignants).
-- Notes : évaluations (devoirs) notées par élève ; la moyenne d'une matière se calcule (ou se saisit directement).
-- Bulletins : un par élève et par période ; circuit Nouveau → En cours → Prêt → Validé → Publié. À la publication,
-- la synthèse calculée (moyennes, rangs, moyennes de classe) est figée : c'est elle que lit la famille.
--
-- Droits : la Directrice gère tout ; la titulaire d'une classe saisit toutes ses matières, la mention et
-- l'appréciation ; un intervenant ne saisit que sa matière. Les autres profils du bureau n'y ont pas accès. Une famille
-- ne lit que les bulletins publiés de ses enfants.

-- ─── Profil « professeur » ───────────────────────────────────────────────────────────────────────────────────────
alter table public.profils drop constraint if exists profils_role_check;
alter table public.profils add constraint profils_role_check check (role = any (array[
  'president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat',
  'lecteur','famille','professeur']));

-- ─── Tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.enseignants (
  id uuid primary key default gen_random_uuid(),
  civilite text,
  prenom text not null,
  nom text not null,
  -- Compte de connexion : nominatif (<identifiant>@professeurs.esej) ou compte du bureau (Directrice, Directeur spirituel).
  user_id uuid unique references auth.users(id) on delete set null,
  identifiant text unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  nom text not null,
  niveaux text[] not null default '{}',
  titulaire_id uuid references public.enseignants(id) on delete set null,
  notation text not null default 'notes' check (notation in ('notes', 'competences')),
  afficher_rang boolean not null default true,
  -- Classe multi-niveaux : rang et moyenne de la classe calculés parmi les élèves du même niveau (comme École Futée).
  rang_par_niveau boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  unique (annee_scolaire, nom)
);

create table if not exists public.classe_eleves (
  classe_id uuid not null references public.classes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  primary key (classe_id, eleve_id)
);
create index if not exists classe_eleves_eleve on public.classe_eleves (eleve_id);

create table if not exists public.periodes (
  id uuid primary key default gen_random_uuid(),
  annee_scolaire text not null check (annee_scolaire ~ '^\d{4}-\d{4}$'),
  libelle text,
  debut date not null,
  fin date not null check (fin >= debut),
  trimestre smallint check (trimestre between 1 and 3),
  ordre integer not null default 0
);

create table if not exists public.matieres_groupes (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  nom text not null,
  coef numeric not null default 1 check (coef > 0),
  ordre integer not null default 0
);

create table if not exists public.matieres (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  groupe_id uuid not null references public.matieres_groupes(id) on delete cascade,
  nom text not null,
  coef numeric not null default 1 check (coef > 0),
  enseignants uuid[] not null default '{}',
  -- Niveaux concernés dans une classe multi-niveaux (vide = tous) : la GS n'a pas les matières du CP.
  niveaux text[] not null default '{}',
  ordre integer not null default 0,
  actif boolean not null default true
);
create index if not exists matieres_classe on public.matieres (classe_id);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  titre text not null,
  date date not null default current_date,
  coef numeric not null default 1 check (coef > 0),
  bareme numeric not null default 20 check (bareme > 0),
  cree_par uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists evaluations_classe_periode on public.evaluations (classe_id, periode_id);

create table if not exists public.evaluation_notes (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  note numeric check (note >= 0),
  -- absent / dispensé / non rendu : la note ne compte pas.
  etat text check (etat in ('absent', 'dispense', 'non_rendu')),
  updated_at timestamptz not null default now(),
  primary key (evaluation_id, eleve_id)
);

create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  periode_id uuid not null references public.periodes(id) on delete cascade,
  classe_id uuid not null references public.classes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'pret', 'valide', 'publie')),
  mention text check (mention in ('avertissement', 'encouragements', 'compliments', 'felicitations')),
  appreciation text,
  -- Synthèse figée à la publication (moyennes, rangs, moyennes de classe, commentaires) : lue par la famille et le PDF.
  synthese jsonb,
  valide_le timestamptz,
  valide_par uuid,
  publie_le timestamptz,
  lu_le timestamptz,
  envoye_courrier_le date,
  source text,
  updated_at timestamptz not null default now(),
  unique (periode_id, eleve_id)
);
create index if not exists bulletins_classe_periode on public.bulletins (classe_id, periode_id);

create table if not exists public.bulletin_lignes (
  bulletin_id uuid not null references public.bulletins(id) on delete cascade,
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  commentaire text,
  afficher boolean not null default true,
  -- Moyenne saisie directement (ou reprise d'École Futée) : prime sur le calcul à partir des évaluations.
  moyenne_saisie numeric check (moyenne_saisie between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (bulletin_id, matiere_id)
);

-- ─── Fonctions d'accès ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.mon_enseignant() returns uuid
language sql stable security definer set search_path = public as $$
  select id from enseignants where user_id = auth.uid() and actif;
$$;

create or replace function public.est_directrice() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() = 'directrice';
$$;

create or replace function public.est_titulaire(p_classe uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = p_classe and titulaire_id is not null and titulaire_id = public.mon_enseignant());
$$;

create or replace function public.enseigne_dans(p_classe uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice() or public.est_titulaire(p_classe)
      or exists (select 1 from matieres where classe_id = p_classe and public.mon_enseignant() = any (enseignants));
$$;

create or replace function public.peut_noter(p_matiere uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice()
      or exists (select 1 from matieres m
                  where m.id = p_matiere and (public.mon_enseignant() = any (m.enseignants) or public.est_titulaire(m.classe_id)));
$$;

create or replace function public.acces_bulletins() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice() or public.mon_enseignant() is not null;
$$;

create or replace function public.bulletin_modifiable(p_bulletin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_directrice() or exists (select 1 from bulletins where id = p_bulletin and statut in ('nouveau', 'en_cours', 'pret'));
$$;

revoke all on function public.mon_enseignant(), public.est_directrice(), public.est_titulaire(uuid), public.enseigne_dans(uuid),
  public.peut_noter(uuid), public.acces_bulletins(), public.bulletin_modifiable(uuid) from public, anon;
grant execute on function public.mon_enseignant(), public.est_directrice(), public.est_titulaire(uuid), public.enseigne_dans(uuid),
  public.peut_noter(uuid), public.acces_bulletins(), public.bulletin_modifiable(uuid) to authenticated;

-- ─── Politiques ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.enseignants enable row level security;
alter table public.classes enable row level security;
alter table public.classe_eleves enable row level security;
alter table public.periodes enable row level security;
alter table public.matieres_groupes enable row level security;
alter table public.matieres enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_notes enable row level security;
alter table public.bulletins enable row level security;
alter table public.bulletin_lignes enable row level security;

create policy enseignants_lecture on public.enseignants for select to authenticated using (public.acces_bulletins());
create policy enseignants_gestion on public.enseignants for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy classes_lecture on public.classes for select to authenticated using (public.enseigne_dans(id));
create policy classes_gestion on public.classes for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy classe_eleves_lecture on public.classe_eleves for select to authenticated using (public.enseigne_dans(classe_id));
create policy classe_eleves_gestion on public.classe_eleves for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy periodes_lecture on public.periodes for select to authenticated using (public.acces_bulletins() or public.ma_famille() is not null);
create policy periodes_gestion on public.periodes for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy groupes_lecture on public.matieres_groupes for select to authenticated using (public.enseigne_dans(classe_id));
create policy groupes_gestion on public.matieres_groupes for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy matieres_lecture on public.matieres for select to authenticated using (public.enseigne_dans(classe_id));
create policy matieres_gestion on public.matieres for all to authenticated using (public.est_directrice()) with check (public.est_directrice());

create policy evaluations_lecture on public.evaluations for select to authenticated using (public.enseigne_dans(classe_id));
create policy evaluations_ecriture on public.evaluations for insert to authenticated with check (public.peut_noter(matiere_id));
create policy evaluations_modif on public.evaluations for update to authenticated using (public.peut_noter(matiere_id)) with check (public.peut_noter(matiere_id));
create policy evaluations_suppr on public.evaluations for delete to authenticated using (public.peut_noter(matiere_id));

create policy notes_lecture on public.evaluation_notes for select to authenticated
  using (exists (select 1 from evaluations e where e.id = evaluation_id and public.enseigne_dans(e.classe_id)));
create policy notes_ecriture on public.evaluation_notes for all to authenticated
  using (exists (select 1 from evaluations e where e.id = evaluation_id and public.peut_noter(e.matiere_id)))
  with check (exists (select 1 from evaluations e where e.id = evaluation_id and public.peut_noter(e.matiere_id)));

create policy bulletins_lecture on public.bulletins for select to authenticated using (
  public.enseigne_dans(classe_id)
  or (statut = 'publie' and exists (select 1 from eleves e where e.id = eleve_id and e.famille_id = public.ma_famille())));
-- Mention et appréciation : la titulaire (tant que le bulletin n'est pas validé) et la Directrice. Statut : voir le déclencheur.
create policy bulletins_modif on public.bulletins for update to authenticated
  using (public.est_directrice() or (public.est_titulaire(classe_id) and statut in ('nouveau', 'en_cours', 'pret')))
  with check (public.est_directrice() or public.est_titulaire(classe_id));
create policy bulletins_suppr on public.bulletins for delete to authenticated using (public.est_directrice());

create policy lignes_lecture on public.bulletin_lignes for select to authenticated
  using (exists (select 1 from bulletins b where b.id = bulletin_id and public.enseigne_dans(b.classe_id)));
create policy lignes_ecriture on public.bulletin_lignes for all to authenticated
  using (public.peut_noter(matiere_id) and public.bulletin_modifiable(bulletin_id))
  with check (public.peut_noter(matiere_id) and public.bulletin_modifiable(bulletin_id));

-- ─── Déclencheurs ────────────────────────────────────────────────────────────────────────────────────────────────
-- Un bulletin hors Directrice : statut limité à Nouveau / En cours / Prêt, synthèse et dates intouchables.
create or replace function public.bulletins_garde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.est_directrice() then return new; end if;
  if new.statut not in ('nouveau', 'en_cours', 'pret') then raise exception 'Seule la Directrice valide ou publie un bulletin'; end if;
  new.synthese := old.synthese; new.valide_le := old.valide_le; new.valide_par := old.valide_par;
  new.publie_le := old.publie_le; new.lu_le := old.lu_le; new.envoye_courrier_le := old.envoye_courrier_le;
  -- Toute saisie fait passer un bulletin « Nouveau » à « En cours ».
  if new.statut = 'nouveau' and (new.mention is distinct from old.mention or new.appreciation is distinct from old.appreciation) then
    new.statut := 'en_cours';
  end if;
  return new;
end;
$$;
drop trigger if exists bulletins_garde on public.bulletins;
create trigger bulletins_garde before update on public.bulletins for each row execute function public.bulletins_garde();

create or replace function public.bulletin_lignes_touche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  update bulletins set statut = 'en_cours' where id = new.bulletin_id and statut = 'nouveau';
  return new;
end;
$$;
drop trigger if exists bulletin_lignes_touche on public.bulletin_lignes;
create trigger bulletin_lignes_touche before insert or update on public.bulletin_lignes for each row execute function public.bulletin_lignes_touche();

create or replace function public.evaluation_notes_touche() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  update bulletins b set statut = 'en_cours'
    from evaluations e
   where e.id = new.evaluation_id and b.periode_id = e.periode_id and b.eleve_id = new.eleve_id and b.statut = 'nouveau';
  return new;
end;
$$;
drop trigger if exists evaluation_notes_touche on public.evaluation_notes;
create trigger evaluation_notes_touche before insert or update on public.evaluation_notes for each row execute function public.evaluation_notes_touche();

-- ─── Fonctions métier ────────────────────────────────────────────────────────────────────────────────────────────
-- Élèves visibles pour les bulletins : toute l'école pour la Directrice, ceux de ses classes pour un enseignant.
create or replace function public.eleves_bulletins(p_annee text)
returns table (id uuid, prenom text, nom text, classe_entree text, annee_entree text, decalage integer, sorti_le date, famille_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(e.prenom, e.initiale), f.nom, e.classe_entree, e.annee_entree, e.decalage, e.sorti_le, e.famille_id
    from eleves e join familles f on f.id = e.famille_id
   where public.est_directrice()
      or exists (select 1 from classe_eleves ce join classes c on c.id = ce.classe_id
                  where ce.eleve_id = e.id and c.annee_scolaire = p_annee and public.enseigne_dans(c.id))
   order by f.nom, e.prenom;
$$;
revoke all on function public.eleves_bulletins(text) from public, anon;
grant execute on function public.eleves_bulletins(text) to authenticated;

-- Crée les bulletins manquants d'une classe pour une période.
create or replace function public.bulletins_preparer(p_periode uuid, p_classe uuid) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.enseigne_dans(p_classe) then raise exception 'Accès refusé'; end if;
  insert into bulletins (periode_id, classe_id, eleve_id)
  select p_periode, p_classe, ce.eleve_id from classe_eleves ce where ce.classe_id = p_classe
  on conflict (periode_id, eleve_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Dépublication : ne garder de la synthèse que les chiffres repris d'École Futée (s'il y en a).
create or replace function public.chiffres_repris(p jsonb) returns jsonb
language sql immutable as $$
  select case when p ? 'chiffres' then jsonb_build_object('source', p ->> 'source', 'chiffres', p -> 'chiffres') end;
$$;

-- Changement de statut groupé. Prêt : titulaire ou Directrice ; Validé et retours depuis Validé / Publié : Directrice.
create or replace function public.bulletins_changer_statut(p_ids uuid[], p_statut text) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if p_statut = 'pret' then
    update bulletins set statut = 'pret'
     where id = any (p_ids) and statut in ('nouveau', 'en_cours') and (public.est_directrice() or public.est_titulaire(classe_id));
  elsif p_statut = 'en_cours' then
    update bulletins set statut = 'en_cours', synthese = case when statut = 'publie' then public.chiffres_repris(synthese) else synthese end,
           publie_le = case when statut = 'publie' then null else publie_le end
     where id = any (p_ids) and ((statut = 'pret' and (public.est_directrice() or public.est_titulaire(classe_id)))
                                 or (statut in ('valide', 'publie') and public.est_directrice()));
  elsif p_statut = 'valide' then
    if not public.est_directrice() then raise exception 'Seule la Directrice valide un bulletin'; end if;
    update bulletins set statut = 'valide', valide_le = now(), valide_par = auth.uid(),
           synthese = case when statut = 'publie' then public.chiffres_repris(synthese) else synthese end, publie_le = null
     where id = any (p_ids) and statut in ('nouveau', 'en_cours', 'pret', 'publie');
  else
    raise exception 'Statut inconnu : %', p_statut;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Publication : la Directrice fournit la synthèse calculée de chaque bulletin validé.
create or replace function public.bulletins_publier(p_items jsonb) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.est_directrice() then raise exception 'Seule la Directrice publie un bulletin'; end if;
  update bulletins b set statut = 'publie', synthese = i.value -> 'synthese', publie_le = now(), lu_le = null
    from jsonb_array_elements(p_items) i
   where b.id = (i.value ->> 'id')::uuid and b.statut = 'valide';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Envoi postal : date d'envoi (ou effacement).
create or replace function public.bulletins_courrier(p_ids uuid[], p_date date) returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  update bulletins set envoye_courrier_le = p_date where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Accusé de lecture : la famille ouvre un bulletin publié de son enfant.
create or replace function public.bulletin_lu(p_id uuid) returns void
language sql volatile security definer set search_path = public as $$
  update bulletins b set lu_le = now()
   where b.id = p_id and b.statut = 'publie' and b.lu_le is null
     and exists (select 1 from eleves e where e.id = b.eleve_id and e.famille_id = public.ma_famille());
$$;

-- Écran de connexion (sans session) : la liste des professeurs ayant un compte nominatif.
create or replace function public.professeurs_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select trim(coalesce(civilite || ' ', '') || prenom || ' ' || nom), identifiant || '@professeurs.esej'
    from enseignants where actif and identifiant is not null order by nom, prenom;
$$;

revoke all on function public.bulletins_preparer(uuid, uuid), public.bulletins_changer_statut(uuid[], text),
  public.bulletins_publier(jsonb), public.bulletins_courrier(uuid[], date), public.bulletin_lu(uuid) from public, anon;
grant execute on function public.bulletins_preparer(uuid, uuid), public.bulletins_changer_statut(uuid[], text),
  public.bulletins_publier(jsonb), public.bulletins_courrier(uuid[], date), public.bulletin_lu(uuid) to authenticated;
revoke all on function public.professeurs_connexion() from public;
grant execute on function public.professeurs_connexion() to anon, authenticated;

-- ─── Périodes 2026-2027 (reprises d'École Futée) ─────────────────────────────────────────────────────────────────
insert into public.periodes (annee_scolaire, debut, fin, trimestre, ordre)
select '2026-2027', d::date, f::date, t, o from (values
  ('2026-09-03', '2026-10-02', 1, 1), ('2026-10-05', '2026-11-06', 1, 2), ('2026-11-09', '2026-11-27', 1, 3),
  ('2026-11-30', '2026-12-18', 1, 4), ('2027-01-04', '2027-01-22', 2, 5), ('2027-01-25', '2027-02-12', 2, 6),
  ('2027-02-15', '2027-03-25', 2, 7), ('2027-04-01', '2027-05-04', 3, 8), ('2027-05-10', '2027-06-04', 3, 9),
  ('2027-06-07', '2027-06-29', 3, 10)) v(d, f, t, o)
where not exists (select 1 from public.periodes where annee_scolaire = '2026-2027');
