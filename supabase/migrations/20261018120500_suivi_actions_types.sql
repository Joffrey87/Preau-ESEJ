-- 18/10/2026 — Suivi des actions : retrait de « Email envoyé » et « Remerciement envoyé » des types d'action.
alter table public.suivi_actions drop constraint if exists suivi_actions_actions_check;
alter table public.suivi_actions add constraint suivi_actions_actions_check check (
  cardinality(actions) > 0 and actions <@ array[
    'Courrier envoyé', 'Appel téléphonique', 'Rencontre en personne',
    'Invitation à un événement', 'Relance à faire', 'Pas de réponse'
  ]::text[]
);
