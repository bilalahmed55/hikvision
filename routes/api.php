<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\HikvisionController;

// Hikvision Device Routes (no auth - for middleware and frontend)
Route::prefix('hikvision')->group(function () {
    Route::get('/device-info', [HikvisionController::class, 'getDeviceInfo']);
    Route::get('/users', [HikvisionController::class, 'getUsers']);
    Route::post('/users/create', [HikvisionController::class, 'createUser']);
    Route::post('/fingerprint/capture', [HikvisionController::class, 'captureFingerprint']);
    Route::post('/fingerprint/store', [HikvisionController::class, 'storeFingerprint']);
    Route::post('/attendance', [HikvisionController::class, 'getAttendance']);
    Route::post('/attendance/sync', [HikvisionController::class, 'syncAttendance']);
    Route::get('/pending-employees', [HikvisionController::class, 'getPendingEmployees']);
    Route::put('/employees/{id}/mark-synced', [HikvisionController::class, 'markEmployeeSynced']);
    Route::post('/sync-employees', [HikvisionController::class, 'syncEmployeesFromDevice']);
    Route::get('/employees-list', [HikvisionController::class, 'getEmployeesList']);
    Route::get('/commands/pending', [HikvisionController::class, 'getPendingCommands']);
    Route::put('/commands/{id}', [HikvisionController::class, 'updateCommandStatus']);
    Route::post('/commands', [HikvisionController::class, 'createCommand']);
});