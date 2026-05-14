<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\HikvisionController as ApiHikvisionController;
use App\Http\Controllers\HikvisionController;

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});

Route::middleware('auth:api')->prefix('v1')->group(function () {
    Route::post('/hikvision/attendance/sync', [ApiHikvisionController::class, 'syncAttendance']);
    Route::post('/hikvision/employee/link', [ApiHikvisionController::class, 'linkEmployee']);
    Route::get('/hikvision/employees', [ApiHikvisionController::class, 'getEmployees']);
});

// Hikvision Device Routes (no authentication for testing)
Route::prefix('hikvision')->group(function () {
    Route::get('/device-info', [HikvisionController::class, 'getDeviceInfo']);
    Route::get('/users', [HikvisionController::class, 'getUsers']);
    Route::post('/users/create', [HikvisionController::class, 'createUser']);
    Route::post('/fingerprint/capture', [HikvisionController::class, 'captureFingerprint']);
    Route::post('/fingerprint/store', [HikvisionController::class, 'storeFingerprint']);
    Route::post('/attendance', [HikvisionController::class, 'getAttendance']);
});
