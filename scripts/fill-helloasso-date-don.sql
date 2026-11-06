-- Remplissage date_don depuis le CSV HelloAsso (Date du paiement).
-- À exécuter manuellement après relecture. Ne crée / ne lie aucun don.
-- Ne touche pas aux dons dont le reçu est déjà établi sur une autre année
-- que la date cible (garde-fou). Les UPDATE sont idempotents.

begin;

-- === 2026-11-05 (versement HelloAsso 2 095 €) ===
update dons set date_don = '2026-10-14' where id = '092afe4c-e20d-465a-b670-5f1d3d7cded2' and montant = 2000; -- Debadier
update dons set date_don = '2026-10-18' where id = '5cd44d5b-8a97-4fd8-8ab3-a7c0c78106be' and montant = 40;   -- Gros
update dons set date_don = '2026-10-28' where id = 'e3c80d7d-616b-488c-8143-49ac14548246' and montant = 30;   -- Tisserand
update dons set date_don = '2026-10-14' where id = '1f276d79-1384-4ecd-b830-8ff200a3e5ae' and montant = 15;   -- Candapanaiken
update dons set date_don = '2026-10-13' where id = '6bba0979-6755-41ad-af2d-b23206d8078f' and montant = 10;   -- Aubret

-- === 2026-09-28/29 (95 €) ===
update dons set date_don = '2026-09-18' where id = '7b6b7c8c-c3b6-43c3-9cda-732a2433bf99' and montant = 40; -- Gros
update dons set date_don = '2026-09-04' where id = 'f60af62e-ca7b-4d31-a749-f243ff7b1fb2' and montant = 30; -- Tisserand
update dons set date_don = '2026-09-14' where id = '7d3fb429-fb79-442c-acb9-45c7a7c33863' and montant = 15; -- Candapanaiken
update dons set date_don = '2026-09-13' where id = '6666210d-012a-4433-b09c-1c1e77f366e8' and montant = 10; -- Aubret

-- === 2026-09-02/03 (55 €) ===
update dons set date_don = '2026-08-04' where id = '3cdf539e-6f3c-4532-b3a1-51a34d2439c3' and montant = 30; -- Tisserand
update dons set date_don = '2026-08-14' where id = '903c97cd-3bee-440e-a400-99a004d979ab' and montant = 15; -- Candapanaiken
update dons set date_don = '2026-08-13' where id = '953ebcf9-bf9d-4ac4-9bf9-a11118338cd4' and montant = 10; -- Aubret

-- === 2026-08-06 (105 €) ===
update dons set date_don = '2026-07-17' where id = '7971501f-79ae-43fe-b03e-da67a8252d2b' and montant = 50; -- Jouslin de Noray
update dons set date_don = '2026-07-14' where id = '4a13153b-ac6e-4671-9c57-4bd6a782e68e' and montant = 15; -- Candapanaiken
update dons set date_don = '2026-07-04' where id = '2053b2a2-7d25-430e-8c21-6f07d3024c02' and montant = 30; -- Tisserand
update dons set date_don = '2026-07-13' where id = '70771ae6-5dac-4a68-b369-118ab5c79fd5' and montant = 10; -- Aubret

-- === 2026-07-07/08 (15 €) ===
update dons set date_don = '2026-06-14' where id = '486c8d7c-5844-41fe-bc46-80adfc118912' and montant = 15; -- Candapanaiken

-- === 2026-06-24/25 (80 €) ===
update dons set date_don = '2026-06-18' where id = 'efb1a520-a5a0-41ee-8628-a4760c96bca1' and montant = 40; -- Gros
update dons set date_don = '2026-06-04' where id = '4ee055af-bbee-4829-9859-4741f4670c93' and montant = 30; -- Tisserand
update dons set date_don = '2026-06-13' where id = 'c317934e-ccd2-43e4-9962-87c3f75dbe79' and montant = 10; -- Aubret

-- === 2026-05-27..29 (145 €, 2 virements 65+80) ===
update dons set date_don = '2026-05-06' where id = 'c89af477-1651-468c-a1eb-5513707db91f' and montant = 50; -- Quenard
update dons set date_don = '2026-05-14' where id = '6818e378-9e15-4998-8155-6f686c25dfea' and montant = 15; -- Candapanaiken
update dons set date_don = '2026-05-18' where id = '9a720af6-30f0-411c-aebe-421ea3839c25' and montant = 40; -- Gros
-- 0616e77a Tisserand 30 : date_don déjà 2026-05-04
update dons set date_don = '2026-05-13' where id = 'dbb2fa6a-eaa6-482b-922c-77b552e43cac' and montant = 10; -- Aubret

-- === Déjà à la bonne date_don (pas d'UPDATE) : ===
-- mai 4/5 Gros 40 + Aubret 10 ; avril Tisserand 30 ; mars/avril Boucher/Gros/Aubret ;
-- mars Crété/Tisserand ; mars Pottier/Crespo/Dohy ; fév Gros/Aubret ;
-- janv. Belhomme/Dufour/Boucher/Croison/Cadier ;
-- déc. Charron/Marchal/Gros, Labescat/Martel, Lenoble Stéphane, Benadassi 300 (juil.).

-- Contrôle : dons dont date_don != date_operation après coup
-- select d.id, d.date_don, o.date_operation, d.montant from dons d
-- join operations o on o.id = d.operation_id
-- where d.id in (...);

commit;
