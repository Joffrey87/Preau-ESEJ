-- 04/10/2026 — Suivi d'envoi des reçus fiscaux et règle « un reçu = une année civile ».
--
-- 1. `recus.envoye_le` / `recus.envoi_mode` : l'envoi d'un reçu (date, moyen réel)
--    est enregistré sur le reçu ; `dons.recu_etat` en garde un résumé lisible.
-- 2. `dons.envoi_prefere` : préférence du donateur (courriel par défaut, ou courrier
--    postal), portée par la fiche donateur et modifiable à tout moment. Avec le
--    courrier postal, le courriel n'est plus exigé.
-- 3. Reçu RE_000149_20250106 : il mêlait 2025 et un don du 05/01/2026 (200 €).
--    Ce don est retiré (il redevient à établir) ; son ancien état est conservé
--    dans ses observations. Le reçu 149 devient un reçu 2025 de 3 700 € (12 dons).

alter table public.recus
  add column if not exists envoye_le date,
  add column if not exists envoi_mode text
    check (envoi_mode is null or envoi_mode in ('courriel', 'courrier', 'main_propre', 'autre'));

alter table public.dons
  add column if not exists envoi_prefere text
    check (envoi_prefere is null or envoi_prefere in ('courriel', 'courrier'));

update public.dons
   set observations = case when coalesce(btrim(observations), '') = '' then '' else observations || ' · ' end
                      || 'Ancien reçu : RE_000149_20250106, état « Envoyé le 23-07-2026 » (retiré : ce reçu ne couvre que 2025)',
       recu_numero = null,
       recu_etat = null
 where id::text like 'ebaf28d4%'
   and recu_numero = 'RE_000149_20250106'
   and date_don = '2026-01-05';

update public.recus r
   set total = (select coalesce(sum(montant), 0) from public.dons d where d.recu_numero = r.recu_numero and d.supprime_le is null),
       nb_dons = (select count(*) from public.dons d where d.recu_numero = r.recu_numero and d.supprime_le is null)
 where r.recu_numero = 'RE_000149_20250106';
