-- Carnet d'adresses sans coffre (décision du 29/09/2026).
--
-- L'accès au carnet et aux élèves est déjà réservé au bureau par la RLS, et
-- chaque famille ne voit que ses propres enfants : le coffre du carnet ajoutait
-- une phrase à transmettre sans protection réelle supplémentaire. Le coffre des
-- dons (n° 1) est conservé.
--
--  1. élèves : prénom en clair (`prenom`) ; `prenom_chiffre` devient facultatif
--  2. les élèves en attente de chiffrement rejoignent `eleves`, la file disparaît
--  3. l'espace famille reçoit le prénom de ses enfants
--  4. un seul coffre : celui des dons

alter table public.eleves add column if not exists prenom text;
alter table public.eleves alter column prenom_chiffre drop not null;

insert into public.eleves (famille_id, prenom, initiale, classe_entree, annee_entree, decalage)
select famille_id, trim(prenom), upper(left(trim(prenom), 1)), classe_entree, annee_entree, decalage
from public.eleves_a_chiffrer;

drop table if exists public.eleves_a_chiffrer;

alter table public.coffre drop constraint if exists coffre_singleton;
alter table public.coffre add constraint coffre_singleton check (id = 1);

create or replace function public.contenu_espace_famille(f uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
                 from scolarite_bareme b)
  )
$function$;
