-- Ventes diverses (sous-catégories, dus / payés) et Caisses école / événement.
-- Additif : nouvelles tables, droits Webmestre, helpers RLS.

-- ─── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.voit_ventes_diverses() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('tresorier', 'directrice') or public.est_evenement();
$$;
revoke execute on function public.voit_ventes_diverses() from public, anon;
grant execute on function public.voit_ventes_diverses() to authenticated;

create or replace function public.domaine_ventes_ok(p_domaine text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.mon_role() = 'tresorier' then true
    when public.mon_role() = 'directrice' then p_domaine = 'ecole'
    when public.est_evenement() then p_domaine = 'evenement'
    else false
  end;
$$;
revoke execute on function public.domaine_ventes_ok(text) from public, anon;
grant execute on function public.domaine_ventes_ok(text) to authenticated;

create or replace function public.est_tresorier_strict() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() = 'tresorier';
$$;
revoke execute on function public.est_tresorier_strict() from public, anon;
grant execute on function public.est_tresorier_strict() to authenticated;

-- ─── Sous-catégories (réutilisables d'un exercice à l'autre) ─────────────────
create table if not exists public.ventes_sous_categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  domaine text not null check (domaine in ('ecole', 'evenement')),
  archive boolean not null default false,
  created_at timestamptz not null default now(),
  unique (nom, domaine)
);
create index if not exists ventes_sous_categories_domaine_idx on public.ventes_sous_categories (domaine);

alter table public.ventes_sous_categories enable row level security;
grant select, insert, update on public.ventes_sous_categories to authenticated;

create policy ventes_sous_cat_lecture on public.ventes_sous_categories for select to authenticated
  using (public.domaine_ventes_ok(domaine));
create policy ventes_sous_cat_insert on public.ventes_sous_categories for insert to authenticated
  with check (public.domaine_ventes_ok(domaine));
create policy ventes_sous_cat_update on public.ventes_sous_categories for update to authenticated
  using (public.domaine_ventes_ok(domaine)) with check (public.domaine_ventes_ok(domaine));

-- ─── Dus (paiement attendu) ──────────────────────────────────────────────────
create table if not exists public.ventes_dues (
  id uuid primary key default gen_random_uuid(),
  exercice_id uuid not null references public.exercices(id) on delete restrict,
  sous_categorie_id uuid not null references public.ventes_sous_categories(id) on delete restrict,
  domaine text not null check (domaine in ('ecole', 'evenement')),
  famille_id uuid references public.familles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  libelle_payeur text, -- libellé figé si famille/contact renommé
  montant_attendu numeric(12,2) not null check (montant_attendu > 0),
  mode_attendu text not null check (mode_attendu in ('virement', 'cheque', 'liquide')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (famille_id is not null or contact_id is not null or coalesce(trim(libelle_payeur), '') <> '')
);
create index if not exists ventes_dues_exercice_idx on public.ventes_dues (exercice_id);
create index if not exists ventes_dues_domaine_idx on public.ventes_dues (domaine);
create index if not exists ventes_dues_sous_cat_idx on public.ventes_dues (sous_categorie_id);

alter table public.ventes_dues enable row level security;
grant select, insert, update, delete on public.ventes_dues to authenticated;

create policy ventes_dues_lecture on public.ventes_dues for select to authenticated
  using (public.domaine_ventes_ok(domaine));
create policy ventes_dues_insert on public.ventes_dues for insert to authenticated
  with check (public.domaine_ventes_ok(domaine));
create policy ventes_dues_update on public.ventes_dues for update to authenticated
  using (public.domaine_ventes_ok(domaine)) with check (public.domaine_ventes_ok(domaine));
create policy ventes_dues_delete on public.ventes_dues for delete to authenticated
  using (public.domaine_ventes_ok(domaine));

-- Aligne le domaine sur la sous-catégorie à l'écriture.
create or replace function public.ventes_dues_aligne_domaine() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  select domaine into d from ventes_sous_categories where id = new.sous_categorie_id;
  if d is null then raise exception 'Sous-catégorie introuvable.'; end if;
  if not public.domaine_ventes_ok(d) then raise exception 'Domaine non autorisé.'; end if;
  new.domaine := d;
  return new;
end;
$$;
drop trigger if exists ventes_dues_aligne_domaine on public.ventes_dues;
create trigger ventes_dues_aligne_domaine before insert or update of sous_categorie_id on public.ventes_dues
  for each row execute function public.ventes_dues_aligne_domaine();

-- ─── Paiements (bancaire = Trésorier ; liquide = caisse) ─────────────────────
create table if not exists public.ventes_paiements (
  id uuid primary key default gen_random_uuid(),
  vente_due_id uuid not null references public.ventes_dues(id) on delete cascade,
  montant numeric(12,2) not null check (montant > 0),
  type text not null check (type in ('operation', 'caisse')),
  operation_id uuid references public.operations(id) on delete set null,
  caisse_mouvement_id uuid, -- FK ajoutée après création de caisse_mouvements
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (
    (type = 'operation' and operation_id is not null and caisse_mouvement_id is null)
    or (type = 'caisse' and caisse_mouvement_id is not null and operation_id is null)
  )
);
create index if not exists ventes_paiements_due_idx on public.ventes_paiements (vente_due_id);
create index if not exists ventes_paiements_operation_idx on public.ventes_paiements (operation_id);

alter table public.ventes_paiements enable row level security;
grant select, insert, update, delete on public.ventes_paiements to authenticated;

-- Lecture : si on voit la due parente.
create policy ventes_paiements_lecture on public.ventes_paiements for select to authenticated
  using (exists (
    select 1 from ventes_dues d where d.id = vente_due_id and public.domaine_ventes_ok(d.domaine)
  ));

-- Insertion : liquide autorisé pour le domaine ; bancaire réservé au Trésorier.
create or replace function public.ventes_paiements_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text;
begin
  select domaine into d from ventes_dues where id = coalesce(new.vente_due_id, old.vente_due_id);
  if d is null then raise exception 'Vente introuvable.'; end if;
  if not public.domaine_ventes_ok(d) then raise exception 'Accès refusé.'; end if;
  if tg_op = 'DELETE' then
    if old.type = 'operation' and not public.est_tresorier_strict() then
      raise exception 'Seul le Trésorier détache un paiement bancaire.';
    end if;
    return old;
  end if;
  if new.type = 'operation' and not public.est_tresorier_strict() then
    raise exception 'Seul le Trésorier rattache un paiement bancaire (Comptabilité).';
  end if;
  return new;
end;
$$;
drop trigger if exists ventes_paiements_garde on public.ventes_paiements;
create trigger ventes_paiements_garde before insert or update or delete on public.ventes_paiements
  for each row execute function public.ventes_paiements_garde();

create policy ventes_paiements_insert on public.ventes_paiements for insert to authenticated
  with check (exists (
    select 1 from ventes_dues d where d.id = vente_due_id and public.domaine_ventes_ok(d.domaine)
  ));
create policy ventes_paiements_update on public.ventes_paiements for update to authenticated
  using (exists (select 1 from ventes_dues d where d.id = vente_due_id and public.domaine_ventes_ok(d.domaine)))
  with check (exists (select 1 from ventes_dues d where d.id = vente_due_id and public.domaine_ventes_ok(d.domaine)));
create policy ventes_paiements_delete on public.ventes_paiements for delete to authenticated
  using (exists (select 1 from ventes_dues d where d.id = vente_due_id and public.domaine_ventes_ok(d.domaine)));

-- ─── Ventilation d'une opération bancaire sur des sous-catégories ────────────
create table if not exists public.ventes_ventilations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  sous_categorie_id uuid not null references public.ventes_sous_categories(id) on delete restrict,
  montant numeric(12,2) not null check (montant > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (operation_id, sous_categorie_id)
);
create index if not exists ventes_ventilations_op_idx on public.ventes_ventilations (operation_id);

alter table public.ventes_ventilations enable row level security;
grant select, insert, update, delete on public.ventes_ventilations to authenticated;

-- Lecture : Trésorier + domaine de la sous-catégorie (Directrice / Événement voient le reçu).
create policy ventes_ventilations_lecture on public.ventes_ventilations for select to authenticated
  using (exists (
    select 1 from ventes_sous_categories s where s.id = sous_categorie_id and public.domaine_ventes_ok(s.domaine)
  ));
-- Écriture : Trésorier seulement (via Comptabilité).
create policy ventes_ventilations_ecriture on public.ventes_ventilations for all to authenticated
  using (public.est_tresorier_strict()) with check (public.est_tresorier_strict());

-- ─── Caisses ─────────────────────────────────────────────────────────────────
create table if not exists public.caisses (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique check (cle in ('ecole', 'evenement')),
  nom text not null,
  solde_initial numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

insert into public.caisses (cle, nom) values
  ('ecole', 'Caisse école'),
  ('evenement', 'Caisse Événement')
on conflict (cle) do nothing;

create table if not exists public.caisse_mouvements (
  id uuid primary key default gen_random_uuid(),
  caisse_id uuid not null references public.caisses(id) on delete restrict,
  date date not null default current_date,
  libelle text not null,
  montant numeric(12,2) not null check (montant <> 0), -- + entrée, − sortie
  source text not null default 'manuel' check (source in ('manuel', 'import', 'vente')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists caisse_mouvements_caisse_idx on public.caisse_mouvements (caisse_id, date desc);

alter table public.caisses enable row level security;
alter table public.caisse_mouvements enable row level security;
grant select on public.caisses to authenticated;
grant select, insert, update, delete on public.caisse_mouvements to authenticated;

create or replace function public.domaine_caisse_ok(p_caisse uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from caisses c where c.id = p_caisse and public.domaine_ventes_ok(c.cle)
  );
$$;
revoke execute on function public.domaine_caisse_ok(uuid) from public, anon;
grant execute on function public.domaine_caisse_ok(uuid) to authenticated;

create policy caisses_lecture on public.caisses for select to authenticated
  using (public.domaine_ventes_ok(cle) or public.est_tresorier_strict());
create policy caisse_mouv_lecture on public.caisse_mouvements for select to authenticated
  using (public.domaine_caisse_ok(caisse_id) or public.est_tresorier_strict());
create policy caisse_mouv_insert on public.caisse_mouvements for insert to authenticated
  with check (public.domaine_caisse_ok(caisse_id));
create policy caisse_mouv_update on public.caisse_mouvements for update to authenticated
  using (public.domaine_caisse_ok(caisse_id)) with check (public.domaine_caisse_ok(caisse_id));
create policy caisse_mouv_delete on public.caisse_mouvements for delete to authenticated
  using (public.domaine_caisse_ok(caisse_id));

-- FK paiements → mouvements (après création de la table).
alter table public.ventes_paiements
  drop constraint if exists ventes_paiements_caisse_mouvement_id_fkey;
alter table public.ventes_paiements
  add constraint ventes_paiements_caisse_mouvement_id_fkey
  foreign key (caisse_mouvement_id) references public.caisse_mouvements(id) on delete set null;

-- ─── Payeurs (familles + contacts) pour les profils restreints ───────────────
create or replace function public.liste_payeurs_ventes(p_domaine text)
returns table (kind text, id uuid, libelle text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'famille'::text as kind, f.id, f.nom as libelle
      from familles f
     where public.domaine_ventes_ok(p_domaine)
    union all
    select 'contact'::text as kind, c.id,
           case when c.est_personne_morale then coalesce(c.raison_sociale, c.nom)
                else trim(coalesce(c.prenom, '') || ' ' || c.nom) end as libelle
      from contacts c
     where public.domaine_ventes_ok(p_domaine)
       and c.supprime_le is null
       and (
         public.mon_role() = 'tresorier'
         or public.mon_role() = 'directrice'
         or (public.est_evenement() and c.categories <@ array['vendeur','evenement']::text[])
       )
  ) x
  order by libelle;
$$;
revoke execute on function public.liste_payeurs_ventes(text) from public, anon;
grant execute on function public.liste_payeurs_ventes(text) to authenticated;

-- Statut calculé d'une due (À payer / Payé / Trop-perçu).
create or replace function public.statut_vente_due(p_due uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select sum(montant) from ventes_paiements where vente_due_id = p_due), 0)
         > (select montant_attendu from ventes_dues where id = p_due) then 'trop_percu'
    when coalesce((select sum(montant) from ventes_paiements where vente_due_id = p_due), 0)
         >= (select montant_attendu from ventes_dues where id = p_due) then 'paye'
    else 'a_payer'
  end;
$$;
revoke execute on function public.statut_vente_due(uuid) from public, anon;
grant execute on function public.statut_vente_due(uuid) to authenticated;

-- Enregistrer un paiement liquide (crée le mouvement de caisse + le paiement).
create or replace function public.ventes_paiement_liquide(
  p_due uuid, p_montant numeric, p_date date, p_libelle text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d ventes_dues%rowtype;
  v_caisse uuid;
  v_mouv uuid;
  v_pay uuid;
begin
  select * into d from ventes_dues where id = p_due;
  if not found then raise exception 'Vente introuvable.'; end if;
  if not public.domaine_ventes_ok(d.domaine) then raise exception 'Accès refusé.'; end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide.'; end if;
  select id into v_caisse from caisses where cle = d.domaine;
  insert into caisse_mouvements (caisse_id, date, libelle, montant, source)
  values (
    v_caisse,
    coalesce(p_date, current_date),
    coalesce(nullif(trim(p_libelle), ''), 'Paiement vente diverse'),
    p_montant,
    'vente'
  ) returning id into v_mouv;
  insert into ventes_paiements (vente_due_id, montant, type, caisse_mouvement_id)
  values (p_due, p_montant, 'caisse', v_mouv) returning id into v_pay;
  return v_pay;
end;
$$;
revoke execute on function public.ventes_paiement_liquide(uuid, numeric, date, text) from public, anon;
grant execute on function public.ventes_paiement_liquide(uuid, numeric, date, text) to authenticated;

-- Rattacher une opération bancaire à une due (Trésorier uniquement).
create or replace function public.ventes_rattacher_operation(
  p_due uuid, p_operation uuid, p_montant numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  d ventes_dues%rowtype;
  o record;
  m numeric;
  v_pay uuid;
  v_sous uuid;
begin
  if not public.est_tresorier_strict() then raise exception 'Réservé au Trésorier.'; end if;
  select * into d from ventes_dues where id = p_due;
  if not found then raise exception 'Vente introuvable.'; end if;
  select id, montant, type into o from operations where id = p_operation;
  if not found then raise exception 'Opération introuvable.'; end if;
  if o.type <> 'recette' then raise exception 'Seule une recette peut régler une vente.'; end if;
  m := coalesce(p_montant, o.montant);
  if m <= 0 or m > o.montant then raise exception 'Montant invalide.'; end if;
  insert into ventes_paiements (vente_due_id, montant, type, operation_id)
  values (p_due, m, 'operation', p_operation) returning id into v_pay;
  -- Ventilation : ajoute / met à jour la part sous-catégorie de cette opération.
  insert into ventes_ventilations (operation_id, sous_categorie_id, montant)
  values (p_operation, d.sous_categorie_id, m)
  on conflict (operation_id, sous_categorie_id) do update
    set montant = ventes_ventilations.montant + excluded.montant;
  return v_pay;
end;
$$;
revoke execute on function public.ventes_rattacher_operation(uuid, uuid, numeric) from public, anon;
grant execute on function public.ventes_rattacher_operation(uuid, uuid, numeric) to authenticated;

-- ─── Webmestre : pages Ventes diverses et Caisses ────────────────────────────
insert into public.acces_pages (cle, libelle, section, ordre) values
  ('/ventes-diverses', 'Ventes diverses', 'Comptabilité', 16),
  ('/caisses', 'Caisses', 'Comptabilité', 17)
on conflict (cle) do nothing;

insert into public.acces_profils (profil, page, niveau)
select r.profil, p.cle,
  case
    when r.profil = 'tresorier' then 'modification'
    when r.profil = 'directrice' then 'modification'
    when r.profil = 'evenement' then 'modification'
    else 'masque'
  end
from (values ('/ventes-diverses'), ('/caisses')) p(cle)
cross join (values
  ('president'),('tresorier'),('secretaire'),('administrateur'),('directrice'),
  ('directeur-spirituel'),('resp-mecenat'),('recherche-fonds'),('evenement')
) r(profil)
on conflict (profil, page) do nothing;

insert into public.acces_historique (auteur, action, detail)
values ('système', 'catalogue', 'Ajout de Ventes diverses et Caisses (droits Directrice, Trésorier, Événement)');
