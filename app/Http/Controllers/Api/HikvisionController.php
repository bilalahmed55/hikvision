<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Attendance;
use Illuminate\Http\Request;
use Carbon\Carbon;

class HikvisionController extends Controller
{
    /**
     * Sync attendance data from Hikvision device
     */
    public function syncAttendance(Request $request)
    {
        $request->validate([
            'punches' => 'required|array',
            'punches.*.employeeNo' => 'required|string',
            'punches.*.time' => 'required|string',
            'punches.*.type' => 'required|string',
        ]);

        $business_id = auth()->user()->business_id ?? 1;
        $synced_count = 0;
        $skipped_count = 0;
        $errors = [];

        foreach ($request->punches as $punch) {
            // Find user by device employee number
            $user = User::where('device_employee_no', $punch['employeeNo'])->first();

            if (!$user) {
                $errors[] = "Employee not found: {$punch['employeeNo']}";
                continue;
            }

            try {
                // Parse the punch time
                $punchTime = Carbon::parse($punch['time']);
                $today = $punchTime->toDateString();

                // Find today's attendance record for this user
                $attendance = Attendance::where('user_id', $user->id)
                    ->where('business_id', $business_id)
                    ->whereDate('clock_in_time', $today)
                    ->first();

                if (!$attendance) {
                    // Create new attendance record with clock in
                    Attendance::create([
                        'user_id' => $user->id,
                        'business_id' => $business_id,
                        'clock_in_time' => $punchTime,
                        'ip_address' => $request->ip(),
                    ]);
                    $synced_count++;
                } elseif ($attendance && !$attendance->clock_out_time) {
                    // Update existing record with clock out
                    $attendance->update([
                        'clock_out_time' => $punchTime,
                    ]);
                    $synced_count++;
                } else {
                    // Skip duplicate
                    $skipped_count++;
                }
            } catch (\Exception $e) {
                $errors[] = "Error processing punch for {$punch['employeeNo']}: {$e->getMessage()}";
            }
        }

        return response()->json([
            'success' => true,
            'synced_count' => $synced_count,
            'skipped_count' => $skipped_count,
            'errors' => $errors,
        ]);
    }

    /**
     * Link employee to Hikvision device user
     */
    public function linkEmployee(Request $request)
    {
        $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'device_employee_no' => 'required|string',
        ]);

        $user = User::findOrFail($request->user_id);
        $user->update([
            'device_employee_no' => $request->device_employee_no,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Employee linked successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'device_employee_no' => $user->device_employee_no,
            ],
        ]);
    }

    /**
     * Get all employees
     */
    public function getEmployees(Request $request)
    {
        $users = User::all();

        $data = $users->map(function ($user) {
            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'device_employee_no' => $user->device_employee_no,
            ];
        });

        return response()->json([
            'success' => true,
            'total' => $users->count(),
            'data' => $data,
        ]);
    }
}
