-- Chiffrement du carnet d'adresses : colonne d'accueil du bloc PII chiffré.
-- Les colonnes en clair sont conservées le temps de la reprise, puis vidées
-- depuis l'application (bouton « Chiffrer le carnet », coffre du carnet ouvert).
--
-- À exécuter une fois dans l'éditeur SQL de Supabase.

alter table contacts add column if not exists pii_chiffre text;

-- Contrôle : combien de fiches restent en clair ?
select count(*) filter (where pii_chiffre is null) as en_clair,
       count(*) filter (where pii_chiffre is not null) as chiffrees
from contacts
where supprime_le is null;
