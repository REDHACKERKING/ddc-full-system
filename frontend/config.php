<?php
// config.php
session_start();

define("API_BASE", "https://ddc-full-system.onrender.com/api");

function api_post($endpoint, $data, $token = null) {
    $ch = curl_init(API_BASE . $endpoint);
    $headers = ["Content-Type: application/json"];
    if ($token) {
        $headers[] = "Authorization: Bearer $token";
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => json_encode($data)
    ]);

    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

function api_get($endpoint, $token = null) {
    $ch = curl_init(API_BASE . $endpoint);
    $headers = [];
    if ($token) {
        $headers[] = "Authorization: Bearer $token";
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers
    ]);

    $res = curl_exec($ch);
    curl_close($ch);
    return json_decode($res, true);
}

