-- Carnet : catégorie « administration » pour les membres des profils d'Administration
-- (Président, Trésorier, Directrice, Secrétaire, Administrateur, Directeur spirituel, Resp. mécénat, Recherche de fonds).
-- Additif : ajout du slug aux fiches existantes, aucune fiche créée.
update public.contacts c set categories = array_append(c.categories, 'administration')
 where c.supprime_le is null and not ('administration' = any(c.categories))
   and (
     -- profils nominatifs d'Administration
     exists (select 1 from public.profils p
              where p.actif and p.role in ('president', 'tresorier', 'directrice', 'secretaire', 'administrateur',
                                           'directeur-spirituel', 'resp-mecenat', 'recherche-fonds')
                and lower(p.nom) = lower(c.nom) and lower(p.prenom) = lower(c.prenom))
     -- membres « Recherche de fonds » (familles.membre_recherche = prénom du parent)
     or exists (select 1 from public.familles f
                 where f.membre_recherche is not null
                   and ((c.famille_id = f.id and lower(c.prenom) = lower(f.membre_recherche))
                     or (c.famille_id is null and lower(c.nom) = lower(f.nom) and lower(c.prenom) = lower(f.membre_recherche))))
     -- Directrice (famille liée à la Directrice : Marie Warnan) et Président (famille liée au profil)
     or exists (select 1 from public.familles f
                 where c.famille_id = f.id and f.directrice_liee and lower(c.prenom) = 'marie')
     or exists (select 1 from public.familles f
                 where f.profil_lie = 'president' and lower(c.nom) = lower(f.nom)
                   and lower(coalesce(c.prenom, '')) in ('jean-françois', 'jean-francois'))
   );
