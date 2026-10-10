-- 10/10/2026 — Factures de frais de scolarité (remplacent les attestations de paiement).
--
-- Règles (trésorier, 10/10/2026) :
--  - une facture par paiement reçu, c'est-à-dire par écriture de Comptabilité rattachée à la scolarité ; si l'écriture
--    règle plusieurs choses à la fois (frais de dossier + mois d'avance…), une seule facture les détaille ;
--  - numéro AAAAMMJJ-n : n = rang de la facture éditée ce jour-là (date d'édition, heure de Paris) ; attribué à la
--    première édition puis conservé (une réédition redonne la même facture) ;
--  - pas de facture pour un paiement venu de l'Amitié Sainte-Anne, d'une association (ASEC…) ni pour une restitution ;
--  - le mois d'avance est un dépôt de garantie : listé à part, hors prestations ;
--  - Comptabilité : chaque écriture reçoit un numéro d'opération (grand livre) ; la facture porte ce numéro, et
--    l'écriture affiche le numéro de la facture.

-- 1. Numéro d'opération des écritures ---------------------------------------------------------------------------
create sequence if not exists public.operations_numero_seq;
alter table public.operations add column if not exists numero_operation bigint;

alter table public.operations disable trigger operations_avant_maj;
alter table public.operations disable trigger operations_apres_maj;
with ordre as (
  select id, row_number() over (order by date_operation, (parent_id is not null), created_at, id) as rang
    from public.operations where numero_operation is null
)
update public.operations o set numero_operation = ordre.rang from ordre where o.id = ordre.id;
alter table public.operations enable trigger operations_avant_maj;
alter table public.operations enable trigger operations_apres_maj;

select setval('public.operations_numero_seq', coalesce((select max(numero_operation) from public.operations), 0) + 1, false);
alter table public.operations alter column numero_operation set default nextval('public.operations_numero_seq');
create unique index if not exists operations_numero_operation_idx on public.operations (numero_operation);

-- 2. Identité de l'association sur la facture (SIRET à renseigner dans le modèle de reçu) -----------------------------
alter table public.modele_recu add column if not exists siret text;

create or replace function public.association_espace()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.ma_famille() is null and not public.est_bureau() then null else (
    select jsonb_build_object('adresse_rue', adresse_rue, 'adresse_cp_ville', adresse_cp_ville,
                              'tresorier_nom', tresorier_nom, 'courriel_contact', courriel_contact, 'siret', siret)
      from modele_recu where id = 1) end
$$;

-- 3. Registre des factures --------------------------------------------------------------------------------------
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  date_edition date not null,
  rang integer not null,
  operation_id uuid not null unique references public.operations(id),
  famille_id uuid not null references public.familles(id),
  annee_scolaire text,
  total numeric not null,
  contenu jsonb not null,
  cree_le timestamptz not null default now(),
  cree_par uuid default auth.uid(),
  unique (date_edition, rang)
);
alter table public.factures enable row level security;
drop policy if exists factures_lecture on public.factures;
create policy factures_lecture on public.factures for select to authenticated
  using (public.est_bureau() or famille_id = public.ma_famille());

-- 4. Édition d'une facture : la crée à la première demande, la redonne ensuite ------------------------------------
create or replace function public.facture_operation(p_operation uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_op record;
  v_fam uuid;
  v_nb int;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
  v_rang int;
  v_num text;
  v_lignes jsonb;
  v_total numeric;
  v_annees text;
  v_origine text;
  v_contenu jsonb;
  v_exist record;
begin
  select o.id, o.type, o.date_operation, o.mode_paiement, o.numero_operation, o.libelle as lib, o.libelle_origine as lo,
         p.libelle as p_lib, p.libelle_origine as p_lo, c.nom as cat
    into v_op
    from operations o
    left join operations p on p.id = o.parent_id
    left join categories c on c.id = o.categorie_id
   where o.id = p_operation;
  if not found then raise exception 'Écriture introuvable.'; end if;

  select count(distinct i.famille_id), min(i.famille_id::text)::uuid
    into v_nb, v_fam
    from affectations_scolarite a join scolarite_inscriptions i on i.id = a.inscription_id
   where a.operation_id = p_operation;
  if coalesce(v_nb, 0) = 0 then raise exception 'Aucun paiement de scolarité n''est rattaché à cette écriture.'; end if;
  if v_nb > 1 then raise exception 'Cette écriture concerne plusieurs familles : pas de facture unique possible.'; end if;
  if not (public.est_bureau() or public.ma_famille() = v_fam) then raise exception 'Accès refusé.'; end if;

  select * into v_exist from factures where operation_id = p_operation;
  if found then
    return v_exist.contenu || jsonb_build_object('numero', v_exist.numero, 'date_edition', v_exist.date_edition);
  end if;

  if v_op.type = 'depense' then raise exception 'Une restitution ne donne pas lieu à une facture.'; end if;
  v_origine := case
    when public.unaccent_simple(concat_ws(' ', v_op.lo, v_op.lib, v_op.p_lo, v_op.p_lib)) like '%amitie sainte anne%' then 'Amitié Sainte-Anne'
    when v_op.cat = 'Don d''Association' then 'Association'
    else 'Famille' end;
  if v_origine <> 'Famille' then
    raise exception 'Paiement reçu de « % » : pas de facture pour la famille.', v_origine;
  end if;

  select jsonb_agg(jsonb_build_object('nature', a.nature, 'montant', a.montant, 'annee', i.annee_scolaire)
                   order by case a.nature when 'frais_dossier' then 1 when 'mois_avance' then 3 else 2 end, i.annee_scolaire),
         sum(a.montant),
         string_agg(distinct i.annee_scolaire, ', ')
    into v_lignes, v_total, v_annees
    from affectations_scolarite a join scolarite_inscriptions i on i.id = a.inscription_id
   where a.operation_id = p_operation;

  perform pg_advisory_xact_lock(hashtext('factures_numerotation'));
  select coalesce(max(rang), 0) + 1 into v_rang from factures where date_edition = v_jour;
  v_num := to_char(v_jour, 'YYYYMMDD') || '-' || v_rang;

  v_contenu := jsonb_build_object(
    'lignes', v_lignes,
    'total', v_total,
    'annee_scolaire', v_annees,
    'date_paiement', v_op.date_operation,
    'mode', v_op.mode_paiement,
    'numero_operation', v_op.numero_operation,
    'famille', (select jsonb_build_object('nom', f.nom, 'parent1', f.parent1, 'parent2', f.parent2,
                                          'adresse', f.adresse, 'cp_ville', f.cp_ville) from familles f where f.id = v_fam),
    'association', (select jsonb_build_object('adresse_rue', m.adresse_rue, 'adresse_cp_ville', m.adresse_cp_ville,
                                              'tresorier_nom', m.tresorier_nom, 'courriel_contact', m.courriel_contact,
                                              'siret', m.siret) from modele_recu m where m.id = 1));

  insert into factures (numero, date_edition, rang, operation_id, famille_id, annee_scolaire, total, contenu)
  values (v_num, v_jour, v_rang, p_operation, v_fam, v_annees, v_total, v_contenu);
  return v_contenu || jsonb_build_object('numero', v_num, 'date_edition', v_jour);
end;
$$;
revoke all on function public.facture_operation(uuid) from public, anon;
grant execute on function public.facture_operation(uuid) to authenticated;

-- 5. Espace famille : chaque versement porte son écriture et sa facture éventuelle -------------------------------------
create or replace function public.contenu_espace_famille(f uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'famille', (select to_jsonb(x) from familles x where x.id = f),
    'eleves', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', e.id, 'prenom', e.prenom, 'initiale', e.initiale, 'classe_entree', e.classe_entree,
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
                      'operation_id', a.operation_id,
                      'facture', (select fa.numero from factures fa where fa.operation_id = a.operation_id),
                      'date', o.date_operation, 'type', o.type, 'mode', o.mode_paiement,
                      'origine', case
                        when public.unaccent_simple(concat_ws(' ', o.libelle_origine, o.libelle, p.libelle_origine, p.libelle))
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
                     'eleve_id', e.id, 'prenom', e.prenom, 'initiale', e.initiale, 'montant', pa.montant, 'paye_le', pa.paye_le)
                     order by ac.date_activite nulls last, e.initiale), '[]'::jsonb)
                    from activites_participations pa
                    join activites ac on ac.id = pa.activite_id
                    join eleves e on e.id = pa.eleve_id
                   where e.famille_id = f),
    'bareme', (select coalesce(jsonb_agg(jsonb_build_object('annee_scolaire', b.annee_scolaire,
                  'nb_enfants', b.nb_enfants, 'montant_mensuel', b.montant_mensuel)), '[]'::jsonb)
                 from scolarite_bareme b),
    'sources', (select coalesce(jsonb_object_agg(s.annee_scolaire, s.source), '{}'::jsonb) from scolarite_annees s),
    'maj', public.date_maj_comptes()
  )
$$;
