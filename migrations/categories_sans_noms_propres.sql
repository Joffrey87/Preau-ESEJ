-- Plan comptable : retirer les noms de prestataires des libellés de catégories.
-- Principe retenu : le nom du fournisseur vit dans l'intitulé de l'opération,
-- jamais dans la catégorie. Changer de prestataire ne doit pas obliger à
-- renommer une catégorie ni à rompre l'historique.
--
-- Les identifiants ne changent pas : aucune opération n'est déplacée, aucun
-- budget n'est rompu. Seul le libellé est réécrit.
--
-- À exécuter dans l'éditeur SQL de Supabase, AVANT correspondances.sql.

update categories set nom = 'Assurance'                        where nom = 'Frais d''assurances FIDES';
update categories set nom = 'Frais de gestion'                 where nom = 'Frais de gestion FIDEM';
update categories set nom = 'Mutuelle'                         where nom = 'Frais de mutuelle HELIUM';
update categories set nom = 'Frais internet'                   where nom = 'Frais internet : Abonnement FREE';
update categories set nom = 'Protection sociale'               where nom = 'Frais B2V protection sociale';
update categories set nom = 'Frais de personnel : Prévoyance'  where nom = 'Frais de personnel : Prévoyance humanis';

-- « URSSAF » est conservé : c'est un organisme public, pas un prestataire
-- interchangeable, et le terme est la désignation usuelle de la cotisation.

-- Nouvelle catégorie : les dons d'association (Amitié Sainte Anne notamment),
-- distincts des dons de particuliers, et dont une part peut être affectée aux
-- frais de scolarité d'une famille lors de la ventilation.
insert into categories (nom, type, ordre, archive)
select 'Don d''Association', 'recette',
       coalesce((select max(ordre) from categories where type = 'recette'), 0) + 1,
       false
where not exists (select 1 from categories where nom = 'Don d''Association');

-- Contrôle : le plan comptable après renommage.
select type, nom, ordre from categories where archive = false order by type, ordre, nom;
