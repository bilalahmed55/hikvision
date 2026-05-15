# Employees Table and Sync Methods Added

## Summary

Created a new `employees` table to store employee data synced from the Hikvision device, along with two new API methods for syncing and retrieving employees.

---

## 1. ✅ Migration Created

**File:** `database/migrations/2026_05_15_000001_create_employees_table.php`

**Schema:**
```php
Schema::create('employees', function (Blueprint $table) {
    $table->id();
    $table->string('device_employee_no')->unique();
    $table->string('name');
    $table->string('user_type')->default('normal');
    $table->boolean('fingerprint_enrolled')->default(false);
    $table->boolean('device_synced')->default(true);
    $table->timestamps();
});
```

**Run migration:**
```bash
php artisan migrate
```

---

## 2. ✅ Employee Model Created

**File:** `app/Models/Employee.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use HasFactory;

    protected $fillable = [
        'device_employee_no',
        'name',
        'user_type',
        'fingerprint_enrolled',
        'device_synced',
    ];

    protected $casts = [
        'fingerprint_enrolled' => 'boolean',
        'device_synced' => 'boolean',
    ];
}
```

---

## 3. ✅ Two New Methods Added to HikvisionController

### Method 1: `syncEmployeesFromDevice()`

**Route:** `POST /api/hikvision/sync-employees`

**Purpose:** Fetches all users from Hikvision device and saves/updates them in the `employees` table

**Logic:**
1. Calls device ISAPI endpoint to get all users
2. Loops through each user
3. Uses `updateOrCreate` to insert or update employee record
4. Sets `fingerprint_enrolled` based on `numOfFP` field
5. Returns total count and synced count

**Response:**
```json
{
  "success": true,
  "total": 25,
  "synced": 25,
  "message": "Successfully synced 25 employees from device"
}
```

**Complete Code:**
```php
public function syncEmployeesFromDevice()
{
    try {
        // Fetch all users from device
        $body = json_encode([
            'UserInfoSearchCond' => [
                'searchID' => '1',
                'maxResults' => 1000,
                'searchResultPosition' => 0
            ]
        ]);

        $response = $this->deviceRequest('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', $body);

        if (isset($response['error'])) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch users from device',
                'data' => $response
            ]);
        }

        $users = $response['UserInfoSearch']['UserInfo'] ?? [];
        
        // Handle single user response (not array)
        if (!is_array($users) || (isset($users['employeeNo']) && !isset($users[0]))) {
            $users = [$users];
        }

        $synced = 0;
        $total = count($users);

        foreach ($users as $user) {
            if (empty($user['employeeNo'])) {
                continue;
            }

            \App\Models\Employee::updateOrCreate(
                ['device_employee_no' => $user['employeeNo']],
                [
                    'name' => $user['name'] ?? 'Unknown',
                    'user_type' => $user['userType'] ?? 'normal',
                    'fingerprint_enrolled' => isset($user['numOfFP']) && $user['numOfFP'] > 0,
                    'device_synced' => true,
                ]
            );

            $synced++;
        }

        return response()->json([
            'success' => true,
            'total' => $total,
            'synced' => $synced,
            'message' => "Successfully synced {$synced} employees from device"
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error syncing employees: ' . $e->getMessage()
        ], 500);
    }
}
```

---

### Method 2: `getEmployeesList()`

**Route:** `GET /api/hikvision/employees-list`

**Purpose:** Returns all employees from the database (not from device directly)

**Logic:**
1. Queries `employees` table
2. Orders by `device_employee_no` ascending
3. Returns all records with count

**Response:**
```json
{
  "success": true,
  "total": 25,
  "data": [
    {
      "id": 1,
      "device_employee_no": "1001",
      "name": "John Doe",
      "user_type": "normal",
      "fingerprint_enrolled": true,
      "device_synced": true,
      "created_at": "2026-05-15T10:00:00.000000Z",
      "updated_at": "2026-05-15T10:00:00.000000Z"
    }
  ]
}
```

**Complete Code:**
```php
public function getEmployeesList()
{
    try {
        $employees = \App\Models\Employee::orderBy('device_employee_no', 'asc')->get();

        return response()->json([
            'success' => true,
            'total' => $employees->count(),
            'data' => $employees
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error fetching employees: ' . $e->getMessage()
        ], 500);
    }
}
```

---

## 4. ✅ Routes Added

**File:** `routes/api.php`

```php
Route::post('/sync-employees', [HikvisionController::class, 'syncEmployeesFromDevice']);
Route::get('/employees-list', [HikvisionController::class, 'getEmployeesList']);
```

---

## Complete Endpoint List

### New Endpoints:
1. **POST** `/api/hikvision/sync-employees` - Sync employees from device to database
2. **GET** `/api/hikvision/employees-list` - Get all employees from database

### All Hikvision Endpoints:
1. **GET** `/api/hikvision/device-info` - Get device info
2. **GET** `/api/hikvision/users` - Get users from device (direct)
3. **POST** `/api/hikvision/users/create` - Create user on device
4. **POST** `/api/hikvision/fingerprint/capture` - Capture fingerprint
5. **POST** `/api/hikvision/fingerprint/store` - Store fingerprint
6. **POST** `/api/hikvision/attendance` - Get attendance logs
7. **POST** `/api/hikvision/attendance/sync` - Sync attendance to system
8. **GET** `/api/hikvision/pending-employees` - Get pending employees
9. **PUT** `/api/hikvision/employees/{id}/mark-synced` - Mark employee synced
10. **POST** `/api/hikvision/sync-employees` - Sync employees from device ⭐ NEW
11. **GET** `/api/hikvision/employees-list` - Get employees list ⭐ NEW

---

## Testing

### Test 1: Sync Employees from Device

```bash
curl -X POST http://localhost:8000/api/hikvision/sync-employees \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "total": 25,
  "synced": 25,
  "message": "Successfully synced 25 employees from device"
}
```

### Test 2: Get Employees List

```bash
curl -X GET http://localhost:8000/api/hikvision/employees-list \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "total": 25,
  "data": [...]
}
```

---

## Workflow

### Initial Setup:
1. Run migration: `php artisan migrate`
2. Sync employees from device: `POST /api/hikvision/sync-employees`
3. View synced employees: `GET /api/hikvision/employees-list`

### Regular Usage:
- Call `POST /api/hikvision/sync-employees` periodically to keep database in sync with device
- Use `GET /api/hikvision/employees-list` to display employees in frontend
- Much faster than calling device directly each time

---

## Database Schema

After migration, `employees` table:

```sql
CREATE TABLE employees (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    device_employee_no VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    user_type VARCHAR(255) DEFAULT 'normal',
    fingerprint_enrolled BOOLEAN DEFAULT 0,
    device_synced BOOLEAN DEFAULT 1,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## Benefits

1. **Performance**: Reading from database is much faster than calling device API
2. **Reliability**: Database is always available, device might be offline
3. **Flexibility**: Can add custom fields and relationships
4. **History**: Track when employees were added/updated
5. **Scalability**: Can handle thousands of employees efficiently

---

## Next Steps

1. ✅ Run migration:
   ```bash
   php artisan migrate
   ```

2. ✅ Test sync endpoint:
   ```bash
   curl -X POST http://localhost:8000/api/hikvision/sync-employees
   ```

3. ✅ Test list endpoint:
   ```bash
   curl -X GET http://localhost:8000/api/hikvision/employees-list
   ```

4. ✅ Update frontend to use new endpoints

5. ✅ Schedule periodic sync (optional):
   - Add to Laravel scheduler
   - Or call from middleware every hour
