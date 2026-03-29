<?php
return [
    'app' => [
        'name' => 'MARKI',
        'env' => 'local',
        'debug' => true,
        'timezone' => 'Africa/Algiers',
    ],

    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,
        'dbname' => 'markii_db',
        'charset' => 'utf8mb4',

        // Utilisateur MySQL de ton projet
        'username' => 'root',

        // Mets ici ton mot de passe Laragon/MySQL
        // Si tu n’en as pas, laisse chaîne vide
        'password' => '',
    ],

    // Mode dev temporaire :
    // tant qu’on n’a pas encore codé la connexion/login
    'dev_context' => [
        'clinic_id' => 1,
        'doctor_id' => 1,
        'user_id' => 2,
    ],
];