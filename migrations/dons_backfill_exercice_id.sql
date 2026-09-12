-- Reprise : rattache chaque don existant à son exercice d'après sa date.
-- Les dons antérieurs au premier exercice enregistré (2023-09-01) restent
-- sans exercice — c'est normal, aucun exercice ne les couvre.
--
-- À exécuter une fois dans l'éditeur SQL de Supabase.

update dons d
set exercice_id = e.id
from exercices e
where d.exercice_id is null
  and d.date_don >= e.date_debut
  and d.date_don <= e.date_fin;

-- Contrôle : répartition après reprise.
select coalesce(e.libelle, '(hors exercice enregistré)') as exercice,
       count(*) as nb,
       sum(d.montant) as total
from dons d
left join exercices e on e.id = d.exercice_id
where d.supprime_le is null
group by 1
order by 1;
