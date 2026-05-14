<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class HikvisionController extends Controller
{
    private $deviceIp;
    private $deviceUser;
    private $devicePass;

    public function __construct()
    {
        $this->deviceIp = config('hikvision.ip', env('HIKVISION_IP'));
        $this->deviceUser = env('HIKVISION_USER');
        $this->devicePass = env('HIKVISION_PASS');
    }

    /**
     * Make HTTP request to Hikvision device using Digest Authentication
     */
    private function deviceRequest($method, $path, $body = null, $contentType = 'application/json')
    {
        $url = "http://{$this->deviceIp}{$path}";

        $request = Http::withDigestAuth($this->deviceUser, $this->devicePass)
            ->withHeaders([
                'Content-Type' => $contentType,
                'Accept' => '*/*',
            ]);

        try {
            if ($method === 'GET') {
                $response = $request->get($url);
            } elseif ($method === 'POST') {
                $response = $request->send('POST', $url, [
                    'body' => $body
                ]);
            } else {
                $response = $request->send($method, $url, [
                    'body' => $body
                ]);
            }

            if ($response->successful()) {
                // Try to return as JSON, otherwise return raw body
                return $response->json() ?? $response->body();
            }

            return [
                'error' => true,
                'status' => $response->status(),
                'message' => $response->body()
            ];
        } catch (\Exception $e) {
            return [
                'error' => true,
                'message' => $e->getMessage()
            ];
        }
    }

    /**
     * Get device information
     */
    public function getDeviceInfo()
    {
        $response = $this->deviceRequest('GET', '/ISAPI/System/deviceInfo');

        return response()->json([
            'success' => !isset($response['error']),
            'data' => $response
        ]);
    }

    /**
     * Get all users from device
     */
    public function getUsers()
    {
        $body = json_encode([
            'UserInfoSearchCond' => [
                'searchID' => '1',
                'maxResults' => 1000,
                'searchResultPosition' => 0
            ]
        ]);

        $response = $this->deviceRequest('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', $body);

        return response()->json([
            'success' => !isset($response['error']),
            'data' => $response
        ]);
    }

    /**
     * Create a new user on the device
     */
    public function createUser(Request $request)
    {
        $request->validate([
            'employeeNo' => 'required|string',
            'name' => 'required|string',
        ]);

        $body = json_encode([
            'UserInfo' => [
                'employeeNo' => $request->employeeNo,
                'name' => $request->name,
                'userType' => 'normal',
                'Valid' => [
                    'enable' => true,
                    'beginTime' => '2020-01-01T00:00:00',
                    'endTime' => '2037-12-31T23:59:59'
                ],
                'doorRight' => '1',
                'RightPlan' => [
                    [
                        'doorNo' => 1,
                        'planTemplateNo' => '1'
                    ]
                ]
            ]
        ]);

        $response = $this->deviceRequest('POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', $body);

        return response()->json([
            'success' => !isset($response['error']),
            'message' => isset($response['error']) ? 'Failed to create user' : 'User created successfully',
            'data' => $response
        ]);
    }

    /**
     * Capture fingerprint from device
     */
    public function captureFingerprint(Request $request)
    {
        $request->validate([
            'employeeNo' => 'required|string',
        ]);

        $url = "http://{$this->deviceIp}/ISAPI/AccessControl/CaptureFingerPrint";

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' .
               '<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' .
               '<fingerNo>1</fingerNo>' .
               '<readerID>1</readerID>' .
               '<cancelFlag>false</cancelFlag>' .
               '<collectingPhases>1</collectingPhases>' .
               '</CaptureFingerPrintCond>';

        try {
            $response = Http::withDigestAuth($this->deviceUser, $this->devicePass)
                ->withHeaders([
                    'Content-Type' => 'application/xml',
                    'Accept' => 'application/xml'
                ])
                ->timeout(35)
                ->withBody($xml, 'application/xml')
                ->post($url);

            if ($response->successful()) {
                // Parse XML response
                $xmlResponse = simplexml_load_string($response->body());
                
                if ($xmlResponse === false) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Failed to parse device response',
                        'data' => $response->body()
                    ]);
                }

                // Extract fingerprint data and quality
                $fingerData = (string) $xmlResponse->fingerData ?? '';
                $quality = (int) $xmlResponse->fingerPrintQuality ?? 0;

                return response()->json([
                    'success' => true,
                    'message' => 'Fingerprint captured successfully',
                    'fingerData' => $fingerData,
                    'quality' => $quality,
                    'data' => [
                        'fingerData' => $fingerData,
                        'fingerPrintQuality' => $quality
                    ]
                ]);
            }

            return response()->json([
                'success' => false,
                'message' => 'Failed to capture fingerprint',
                'data' => [
                    'error' => true,
                    'status' => $response->status(),
                    'message' => $response->body()
                ]
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error: ' . $e->getMessage(),
                'data' => [
                    'error' => true,
                    'message' => $e->getMessage()
                ]
            ]);
        }
    }

    /**
     * Store fingerprint data on device
     */
    public function storeFingerprint(Request $request)
    {
        $request->validate([
            'employeeNo' => 'required|string',
            'fingerData' => 'required|string',
        ]);

        $body = json_encode([
            'FingerPrintCfg' => [
                'employeeNo' => $request->employeeNo,
                'enableCardReader' => [1],
                'fingerPrintID' => 1,
                'fingerData' => $request->fingerData,
                'fingerType' => 'normal'
            ]
        ]);

        $response = $this->deviceRequest('POST', '/ISAPI/AccessControl/FingerPrint/SetUp?format=json', $body);

        return response()->json([
            'success' => !isset($response['error']),
            'message' => isset($response['error']) ? 'Failed to store fingerprint' : 'Fingerprint stored successfully',
            'data' => $response
        ]);
    }

    /**
     * Get attendance logs from device
     */
    public function getAttendance(Request $request)
    {
        $request->validate([
            'startDate' => 'required|date',
            'endDate' => 'required|date',
        ]);

        $startDate = date('Y-m-d\T00:00:00', strtotime($request->startDate));
        $endDate = date('Y-m-d\T23:59:59', strtotime($request->endDate));

        $body = json_encode([
            'AcsEventCond' => [
                'searchID' => '1',
                'searchResultPosition' => 0,
                'maxResults' => 1000,
                'major' => 5,
                'minor' => 0,
                'startTime' => $startDate,
                'endTime' => $endDate
            ]
        ]);

        $response = $this->deviceRequest('POST', '/ISAPI/AccessControl/AcsEvent?format=json', $body);

        return response()->json([
            'success' => !isset($response['error']),
            'data' => $response
        ]);
    }

    /**
     * Get pending employees that need to be synced to device
     */
    public function getPendingEmployees()
    {
        $pendingEmployees = \App\Models\User::where(function($query) {
            $query->where('device_synced', 0)
                  ->orWhereNull('device_synced');
        })
        ->whereNotNull('device_employee_no')
        ->select('id', 'device_employee_no', 'name', 'fingerprint_data')
        ->get();

        return response()->json([
            'success' => true,
            'data' => $pendingEmployees
        ]);
    }

    /**
     * Mark employee as synced to device
     */
    public function markEmployeeSynced($id)
    {
        $user = \App\Models\User::find($id);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Employee not found'
            ], 404);
        }

        $user->device_synced = 1;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Employee marked as synced'
        ]);
    }/**
 * Sync attendance from device to system
 */
    public function syncAttendance(Request $request)
    {
    $punches = $request->input('punches', []);
    $synced = 0;
    $skipped = 0;
    $errors = [];

    foreach ($punches as $punch) {
        try {
            if (empty($punch['employeeNo'])) {
                $skipped++;
                continue;
            }

            $user = \App\Models\User::where(
                'device_employee_no', $punch['employeeNo']
            )->first();

            if (!$user) {
                $errors[] = "Employee not found: " . $punch['employeeNo'];
                $skipped++;
                continue;
            }

            $existingAttendance = \App\Models\Attendance::where('user_id', $user->id)
                ->whereDate('clock_in_time', \Carbon\Carbon::today())
                ->first();

            if (!$existingAttendance) {
                \App\Models\Attendance::create([
                    'user_id' => $user->id,
                    'business_id' => 1,
                    'clock_in_time' => $punch['time'],
                    'ip_address' => 'Hikvision Device',
                    'clock_in_note' => 'Auto synced from fingerprint device',
                ]);
                $synced++;
            } elseif (empty($existingAttendance->clock_out_time)) {
                $existingAttendance->update([
                    'clock_out_time' => $punch['time'],
                    'clock_out_note' => 'Auto synced from fingerprint device',
                ]);
                $synced++;
            } else {
                $skipped++;
            }
        } catch (\Exception $e) {
            $errors[] = $e->getMessage();
            $skipped++;
        }
    }

    return response()->json([
        'success' => true,
        'synced_count' => $synced,
        'skipped_count' => $skipped,
        'errors' => $errors,
    ]);
}
}
