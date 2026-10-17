# MARKI — compréhension fonctionnelle et technique du projet

> Document de référence établi à partir du code au 30 août 2026. Il décrit l'état actuel du dépôt, pas seulement l'intention produit. À mettre à jour lorsqu'une évolution change l'architecture, les données ou un parcours métier.

## 1. Résumé du produit

MARKI est une application web destinée aux cabinets médicaux. Sa fonction principale est de gérer, pour chaque médecin, une liste d'attente quotidienne et de permettre aux patients de rejoindre cette liste depuis une page publique accessible par lien ou QR code.

Le périmètre effectivement implémenté comprend :

- l'authentification des médecins, administrateurs de structure et membres du secrétariat ;
- la sélection du médecin actif lorsqu'un utilisateur en gère plusieurs ;
- la liste du jour, son ouverture aux inscriptions, sa pause et sa clôture ;
- l'ajout manuel d'un patient et son suivi dans la file ;
- le répertoire patients et l'historique des listes ;
- les paramètres du médecin et la gestion de l'équipe ;
- la configuration, l'activation, la révocation et l'impression du QR/lien public ;
- l'inscription publique, le suivi privé de la position et l'annulation par le patient ;
- une administration interne MARKI pour inviter et activer de nouvelles structures.

Le schéma SQL contient aussi des fondations pour les rendez-vous, dossiers médicaux, ordonnances, fichiers et facturation. Ces domaines ne sont pas exposés comme fonctionnalités principales dans l'interface actuelle : ne pas les considérer comme terminés sans inspection complémentaire.

## 2. Stack et style d'architecture

- **Serveur :** PHP moderne avec `strict_types`, sans framework applicatif ni Composer.
- **Base principale :** MySQL/MariaDB via PDO, requêtes préparées et transactions.
- **Secours local :** SQLite si la connexion MySQL échoue et que `database/markii_db.sqlite` existe.
- **Client :** HTML/PHP rendu côté serveur, JavaScript natif et CSS/Sass, sans framework frontend ni bundler JavaScript.
- **Interface :** une coquille authentifiée dans `public/index.php`; les vues internes sont chargées à la demande depuis `public/pages/`.
- **API :** scripts PHP JSON dans `public/api/` et API publique séparée dans `public/registration/api/`.
- **Configuration :** variables de `.env`, lues par `app/env.php` et normalisées dans `app/config.php`.
- **Hébergement prévu :** racine web pointant sur `public/`, avec exemples Apache (`.htaccess`) et Nginx (`deploy/nginx-marki.conf.example`).

Flux général côté cabinet :

```text
navigateur authentifié
  -> public/index.php + public/pages/*
  -> public/assets/js/*
  -> public/api/*.php
  -> app/bootstrap.php (session, CSRF, permission)
  -> repositories/services
  -> PDO -> MySQL
```

Flux général côté patient :

```text
QR/lien signé
  -> public/registration/index.php?link=...&token=...
  -> public/registration/api/context.php puis submit.php
  -> PublicRegistrationService
  -> patient + entrée de file + consentement + session publique privée
  -> public/registration/status.php?session=...
```

## 3. Organisation des dossiers

| Chemin | Responsabilité |
|---|---|
| `app/config.php`, `app/env.php` | Configuration applicative, sécurité, DB, QR et sessions |
| `app/db.php` | Connexion PDO et synchronisation du fuseau de la clinique |
| `app/bootstrap.php` | Bootstrap des API authentifiées : contexte, autorisation, CSRF |
| `app/web_bootstrap.php` | Contexte des pages web authentifiées |
| `app/public_bootstrap.php` | Bootstrap des pages/API publiques, sans connexion utilisateur |
| `app/auth/` | Connexion, sessions persistantes, rôles, accès aux médecins, équipe |
| `app/repositories/` | Logique SQL des files, patients, historiques et paramètres |
| `app/public_registration/` | Liens signés, configuration QR, inscription et suivi publics |
| `app/platform/` | Comptes administrateurs MARKI et invitations de structures |
| `public/index.php` | Coquille principale authentifiée et navigation |
| `public/pages/` | Fragments Dashboard, Patients, Listes et Paramètres |
| `public/api/` | Contrôleurs JSON côté cabinet |
| `public/registration/` | Pages et API publiques d'inscription/suivi |
| `public/assets/js/` | Comportement de l'interface et appels API |
| `public/assets/design-system/` | Couche officielle du design system, chargée après les styles historiques |
| `database/markii_db.sql` | Schéma/dump SQL de référence dans le dossier DB |
| `database/migrations/` | Évolutions SQL datées |
| `database/seeds/` | Réinitialisation et données de démonstration, jamais en production |
| `database/verification/` | Vérifications SQL après import/migration |
| `tools/scripts/` | Configuration, diagnostics, import, comptes admin et tests ciblés |
| `docs/` | Documentation architecture, design, sécurité et tests visuels |

## 4. Modèle métier essentiel

### Structure et utilisateurs

- `clinics` représente une structure (`solo`, `clinic` ou `hospital_simple`) et porte notamment son fuseau horaire.
- `users`, `roles`, `user_roles` représentent les comptes et rôles.
- `doctor_profiles` relie un compte médecin à une structure.
- `staff_profiles` et `staff_doctor_access` limitent le secrétariat à certains médecins et niveaux d'accès.
- `user_sessions` stocke les sessions persistantes « se souvenir de moi ».

Rôles reconnus dans le code : `clinic_admin`, `doctor`, et par défaut le secrétariat. Les niveaux d'accès du secrétariat sont utilisés pour accorder la file seule, les patients, ou l'accès complet.

Capacités calculées dans `Auth::buildCapabilities()` :

- tout utilisateur autorisé au médecin peut voir et gérer sa file ;
- médecin/admin, ou secrétariat avec accès patients : répertoire patients et historiques ;
- médecin/admin : réglages médecin et QR public ;
- administrateur de structure : réglages structure et équipe.

Les API imposent ensuite les capacités endpoint par endpoint dans `Auth::authorizeEndpoint()`.

### File quotidienne

- `queues` : une seule file par couple `(doctor_id, queue_date)`.
- `queue_entries` : les inscriptions ordonnées par `position_number`.
- `patients` : fiche administrative partagée à l'échelle de la clinique.
- `visits` : passage médical créé lorsque l'entrée est terminée.

Une file est créée à la demande par `QueueRepository::getOrCreateTodayQueue()`. Elle possède deux axes d'état distincts :

- `registration_status` : `open` ou `closed` — accepte ou refuse seulement les nouvelles inscriptions ;
- `day_status` : `active`, `paused` ou `completed` — état opérationnel de la journée.

La colonne historique `queues.status` reste présente pour compatibilité pendant la transition.

États des patients dans la file :

- `waiting` : en attente ;
- `called` : appelé (prévu par le modèle et certaines lectures) ;
- `no_show` : absent, peut être replacé en fin de file ;
- `done` : terminé, état final et création/mise à jour d'une visite ;
- `canceled` : annulé, état final dans la V1 côté cabinet.

Les sources autorisées sont `secretary`, `doctor`, `qr` et `link`. L'affichage est FIFO par numéro, puis date/id. Un patient absent réintégré reçoit si nécessaire le prochain numéro d'arrivée.

Clôturer une journée ferme les inscriptions et annule les entrées encore actives en mémorisant leurs états précédents. L'action inverse peut rouvrir la journée et restaurer ces entrées.

### Inscription publique par médecin

Tables principales :

- `public_links` : identité publique, type QR/lien, hash du jeton, version, activation/révocation ;
- `doctor_public_registration_settings` : options et limite journalière ;
- `doctor_public_registration_hours` : plages hebdomadaires ;
- `doctor_public_registration_exceptions` : exceptions datées ;
- `doctor_public_registration_messages` : messages publics personnalisables ;
- `public_link_events` : scans, tentatives et résultats ;
- `queue_entry_consents` : preuve du consentement ;
- `patient_public_sessions` : session privée de suivi liée à une inscription.

Le lien contient un `public_id` et un jeton dérivé/signé par le secret HMAC. Seul le hash est stocké. Révoquer un lien incrémente sa version et rend l'ancien QR inutilisable.

L'inscription est acceptée uniquement si :

1. le lien, le médecin et la clinique sont actifs ;
2. l'inscription publique et les invités sont activés ;
3. la file du jour existe ;
4. la journée n'est ni en pause ni clôturée ;
5. les inscriptions sont ouvertes ;
6. si les horaires automatiques sont activés, l'heure courante est autorisée ;
7. la limite publique journalière n'est pas atteinte.

Le formulaire exige actuellement le nom, un téléphone mobile algérien valide et le consentement. La date de naissance peut être rendue obligatoire. Le service :

- limite les tentatives par empreinte d'IP ;
- détecte un patient exact existant dans la clinique ;
- demande une confirmation si le numéro appartient possiblement à un autre membre de la famille ;
- évite le doublon dans la file du même jour ;
- peut réactiver une ancienne entrée publique annulée/absente avec un nouveau numéro ;
- crée une session opaque donnant accès uniquement au suivi de cette entrée ;
- n'affiche jamais les autres patients sur la page publique.

La page de suivi actualise l'état toutes les cinq secondes, affiche le numéro d'arrivée et le nombre de patients actifs devant, et permet l'annulation dans les états autorisés.

## 5. Parcours fonctionnels

### Cabinet

1. Connexion par slug de clinique + email/téléphone + mot de passe.
2. Sélection automatique, ou manuelle, du médecin accessible.
3. Chargement de `dashboard.html` et création implicite de la file du jour si absente.
4. Ajout manuel ou arrivée d'une inscription publique.
5. Actions sur les entrées : terminer, absent, remettre en attente, annuler et corriger l'identité.
6. Fermeture/réouverture des inscriptions indépendamment du traitement de la file.
7. Pause/reprise ou clôture/restauration de la journée.
8. Consultation du répertoire patients et des anciennes listes.

### Patient en ligne

1. Le cabinet active et partage/imprime le QR du médecin dans Paramètres.
2. Le patient scanne le QR ; le contexte public valide le lien et la disponibilité.
3. Le patient transmet identité, téléphone, date éventuelle et consentement.
4. Le service crée/réutilise sa fiche et l'ajoute à la file dans une transaction.
5. Le navigateur reçoit une session privée et ouvre la page de suivi.
6. Le patient suit sa progression ou annule son inscription.

### Nouvelle structure

Un administrateur interne MARKI utilise `public/platform-invitations.php` pour créer une invitation. `public/activate-structure.php` consomme l'invitation et crée la structure et ses premiers comptes. Ce système utilise une authentification plateforme distincte de celle des cabinets.

## 6. Interface et fichiers à toucher selon le changement

- **File du jour :** `public/pages/dashboard.html`, `public/assets/js/app.js`, `public/api/queue_*`, `QueueRepository.php`, `QueueEntryRepository.php`.
- **Patients :** `public/pages/patients.html`, `v1-tabs.js`/`patients.js`, API `patient*`, `PatientDirectoryRepository.php`.
- **Historique :** `public/pages/lists.html`, `v1-tabs.js`, API `queues_history*`, `QueueHistoryRepository.php`.
- **Réglages/équipe :** `public/pages/settings.php`, `v1-tabs.js`, `team.js`, `SettingsRepository.php`, `TeamRepository.php`.
- **QR côté cabinet :** `public-registration-admin.js`, API `public_registration_*`, `PublicRegistrationRepository.php`.
- **Inscription patient :** `public/registration/index.php`, `registration.js`, API publique et `PublicRegistrationService.php`.
- **Suivi patient :** `public/registration/status.php`, `status.js`, API `status.php`/`cancel.php`.
- **Authentification/permissions :** `app/auth/`, `app/session.php`, `app/security.php`, API `auth_*`.
- **Apparence globale :** commencer par `public/assets/design-system/`; préserver les `id`, `name`, `data-*`, formulaires, blocs PHP et conditions de permission.
- **Données :** ajouter une migration datée ; ne pas éditer uniquement le dump sans prévoir la migration des installations existantes.

Attention : l'interface repose fortement sur les identifiants et attributs HTML ciblés par le JavaScript. Une refonte visuelle doit suivre `docs/ARCHITECTURE_LOGIQUE_DESIGN.md` et `docs/FICHIERS_DESIGN_AUTORISES.md`.

## 7. Sécurité et invariants à préserver

- Toute donnée métier côté cabinet doit rester limitée par `clinic_id` et, lorsque pertinent, `doctor_id`.
- Toute API authentifiée passe par `app/bootstrap.php`, vérifie la capacité et le CSRF pour les mutations.
- Les pages publiques ne doivent jamais utiliser le bootstrap authentifié ni exposer la file entière.
- Ne jamais stocker ou journaliser les jetons QR/session en clair ; la base conserve des hashes.
- Garder les écritures multi-tables critiques dans une transaction et utiliser les verrous `FOR UPDATE` pour les positions/doublons.
- Respecter le fuseau de la clinique pour déterminer « aujourd'hui » et les horaires.
- Ne jamais publier `.env`; aucun secret réel ne doit entrer dans la documentation ou Git.
- En production : document root sur `public/`, HTTPS, `MARKI_APP_DEBUG=false`, hôtes autorisés stricts, secrets distincts et sauvegardes chiffrées. Voir `docs/SECURITE_PRODUCTION.md`.
- Les données concernent des patients : limiter les logs, les accès, les exports et les informations visibles publiquement.

## 8. Installation et vérifications utiles

Pré-requis observés : PHP avec PDO MySQL et extensions usuelles (`mbstring` notamment), MySQL/MariaDB, serveur web Apache/Nginx. Le dépôt semble historiquement orienté Laragon/Windows, même si plusieurs scripts PHP et shell sont multiplateformes.

Configuration locale :

1. Copier `.env.example` vers `.env` et fournir les accès DB et deux secrets forts.
2. Importer `database/markii_db.sql` ou utiliser le script d'import adapté.
3. Faire servir le dossier `public/` et aligner `MARKI_APP_BASE_PATH`/`MARKI_APP_ORIGIN`.
4. Vérifier l'environnement et la DB :

```bash
php tools/scripts/test_environment.php
php tools/scripts/test_database_connection.php
php tools/scripts/test_authenticated_context.php
php tools/scripts/test_settings_repository.php
php tools/scripts/test_team_repository.php
```

Autres ressources :

- `database/verification/VERIFY_AFTER_GLOBAL_RESET.sql`
- `database/verification/VERIFY_QR_PUBLIC_V1.sql`
- `docs/TESTS_VISUELS.md`
- `tools/scripts/check_contrast.php`

Il n'y a pas de suite automatisée complète ni de configuration PHPUnit visible. Pour une modification métier, prévoir au minimum : syntaxe PHP, test ciblé du dépôt/API, vérification SQL et test manuel du parcours concerné.

## 9. Points d'attention constatés

- Le dépôt contient à la fois `database/markii_db.sql` et un `markii_db.sql` à la racine ; le second est actuellement non suivi. La source officielle utilisée par les scripts est celle de `database/`.
- La configuration par défaut conserve un ancien `MARKI_APP_BASE_PATH`; elle doit être adaptée à l'installation réelle.
- `app/db.php` peut basculer silencieusement sur SQLite si le fichier SQLite existe. Toujours vérifier le driver actif lors d'un diagnostic DB.
- Certaines données et tables sont clairement des fondations futures ; distinguer « présent dans le schéma » de « parcours produit terminé ».
- `QueueRepository` maintient encore un champ `status` historique en parallèle des nouveaux états. Toute évolution de statut doit préserver cette compatibilité ou planifier sa suppression.
- L'application charge encore des polices et une bibliothèque QR depuis des CDN ; cela compte pour le fonctionnement hors ligne, la CSP et la production.
- Au moment de cette analyse, le worktree contient déjà plusieurs modifications utilisateur dans l'interface/CSS/JS. Elles n'ont pas été modifiées par la création de ce document et doivent être préservées.

## 10. Carte rapide des API

| Domaine | Endpoints principaux |
|---|---|
| Authentification | `auth_login`, `auth_logout`, `auth_context`, changement/oubli/réinitialisation du mot de passe, sélection médecin |
| File courante | `queue_today`, `queue_entries`, `queue_add_patient`, `queue_update_patient`, `queue_update_status`, `queue_toggle_status`, `queue_change_day_status` |
| Patients | `patients_index`, `patient_details`, `patient_update_profile`, `patient_add_to_today` |
| Historique | `queues_history`, `queue_history_details` |
| Paramètres | `settings_get`, `settings_update` |
| Équipe | `team_list`, `team_save`, `team_toggle_status` |
| QR public admin | `public_registration_get`, `save`, `toggle`, `revoke` |
| Patient public | `registration/api/context`, `submit`, `status`, `cancel` |

## 11. Méthode de mise à jour de ce document

Après un changement important, mettre à jour au minimum :

- le résumé fonctionnel si un écran/parcours apparaît ou disparaît ;
- le modèle métier si une table, relation ou machine d'état change ;
- la carte des fichiers/API si une responsabilité est déplacée ;
- les invariants si les règles d'autorisation ou de sécurité évoluent ;
- les commandes si l'installation ou les tests changent.

Pour les demandes futures, ce document sert de point de départ, mais le code concerné doit toujours être relu localement avant modification : il évite de réexplorer tout le dépôt, sans remplacer la vérification de la version courante.
