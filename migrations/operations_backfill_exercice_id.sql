-- Rattachement des opérations à leur exercice d'après leur date.
-- Les exercices de l'ARIL courent du 1ᵉʳ septembre au 31 août de l'année suivante.
--
-- Vérification faite le 02/09/2026 : les 1 278 opérations étaient déjà toutes
-- rattachées, et aucune n'était hors des bornes de son exercice. Ce script est
-- donc un FILET DE SÉCURITÉ, à rejouer après une reprise de données ou la
-- création d'un nouvel exercice. Il est idempotent.
--
-- ⚠️ Il ne touche QUE les opérations sans exercice : une opération volontairement
-- rattachée à un exercice qui ne couvre pas sa date (effet de bord assumé depuis
-- le mode modification) n'est jamais réaffectée.

update operations o
set exercice_id = e.id
from exercices e
where o.exercice_id is null
  and o.date_operation >= e.date_debut
  and o.date_operation <= e.date_fin;

-- Contrôle 1 : reste-t-il des opérations sans exercice ?
select count(*) as sans_exercice
from operations
where exercice_id is null;

-- Contrôle 2 : quelles opérations sont rattachées hors des bornes de leur
-- exercice ? (volontaire via le mode modification, ou à vérifier)
select e.libelle as exercice, o.date_operation, o.libelle, o.montant, o.type
from operations o
join exercices e on e.id = o.exercice_id
where o.date_operation < e.date_debut
   or o.date_operation > e.date_fin
order by o.date_operation;
