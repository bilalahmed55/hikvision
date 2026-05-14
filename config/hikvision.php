<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Hikvision Device Configuration
    |--------------------------------------------------------------------------
    |
    | Configuration for connecting to Hikvision DS-K1A8503MF fingerprint device
    |
    */

    'ip' => env('HIKVISION_IP', '192.168.1.64'),
    'user' => env('HIKVISION_USER', 'admin'),
    'pass' => env('HIKVISION_PASS', ''),

];
