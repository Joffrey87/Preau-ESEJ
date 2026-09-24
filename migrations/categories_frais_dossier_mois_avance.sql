-- Deux catégories de recette pour sortir des « Paiement frais de scolarité »
-- ce qui n'est pas une mensualité :
--   · Frais de dossier         : 60 € par enfant entrant, recette définitive ;
--   · Mois d'avance (dépôts)   : dépôt versé une fois par enfant, qui éponge son
--                                dernier mois ; une restitution se saisit en
--                                dépense dans cette même catégorie.
-- Le Bilan et le Budget les montrent désormais comme des postes distincts.
--
-- La catégorie fait la case du Bilan, l'affectation (nature) fait la colonne
-- de l'onglet Frais de scolarité : les écritures déjà fléchées `frais_dossier`
-- ou `mois_avance` sont déplacées dans la catégorie correspondante. Les
-- affectations elles-mêmes ne bougent pas.
--
-- Exécuté le 21/09/2026.

insert into categories (nom, type, ordre, archive)
select 'Frais de dossier', 'recette',
       coalesce((select max(ordre) from categories where type = 'recette'), 0) + 1,
       false
where not exists (select 1 from categories where nom = 'Frais de dossier');

insert into categories (nom, type, ordre, archive)
select 'Mois d''avance (dépôts)', 'recette',
       coalesce((select max(ordre) from categories where type = 'recette'), 0) + 1,
       false
where not exists (select 1 from categories where nom = 'Mois d''avance (dépôts)');

-- Écritures fléchées : la nature de l'affectation fait foi.
update operations o
   set categorie_id = (select id from categories where nom = 'Frais de dossier')
 where exists (select 1 from affectations_scolarite a where a.operation_id = o.id and a.nature = 'frais_dossier')
   and o.categorie_id = (select id from categories where nom = 'Paiement frais de scolarité');

update operations o
   set categorie_id = (select id from categories where nom = 'Mois d''avance (dépôts)')
 where exists (select 1 from affectations_scolarite a where a.operation_id = o.id and a.nature = 'mois_avance')
   and o.categorie_id = (select id from categories where nom = 'Paiement frais de scolarité');

-- Écriture antérieure au fléchage, reconnaissable à son libellé bancaire.
update operations o
   set categorie_id = (select id from categories where nom = 'Frais de dossier')
 where o.libelle = 'FRAIS DE DOSSIER'
   and o.date_operation = '2024-07-09'
   and o.categorie_id = (select id from categories where nom = 'Paiement frais de scolarité');

-- Contrôle : ce qui reste en « Paiement frais de scolarité » avec une nature
-- autre que mensualité doit être vide.
select o.date_operation, o.libelle, o.montant, a.nature
  from operations o
  join affectations_scolarite a on a.operation_id = o.id
  join categories c on c.id = o.categorie_id
 where c.nom = 'Paiement frais de scolarité'
   and a.nature not in ('mensualite', 'don_association');
