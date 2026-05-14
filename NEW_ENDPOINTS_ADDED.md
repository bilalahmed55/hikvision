# New Endpoints Added for Middleware Integration

## Changes Made

### 1. ✅ Migration Created
**File:** `database/migrations/2026_05_15_000000_add_sync_fields_to_users_table.php`

Adds two new columns to `users` table:
- `device_synced` (boolean, default 0) - Tracks if employee is synced to device
- `fingerprint_data` (longText, nullable) - Stores fingerprint data

**Run migration:**
```bash
php artisan migrate
```

### 2. ✅ Two New Methods Added to HikvisionController

#### Method 1: `getPendingEmployees()`

**Route:** `GET /api/hikvision/pending-employees`

**Purpose:** Returns employees that need to be synced to the device

**Logic:**
- Queries users where `device_synced = 0` OR `device_synced IS NULL`
- Only includes users with `device_employee_no` set
- Returns: `id`, `device_employee_no`, `name`, `fingerprint_data`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "device_employee_no": "1001",
      "name": "John Doe",
      "fingerprint_data": "base64_encoded_data..."
    }
  ]
}
```

**Complete Code:**
```php
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
```

#### Method 2: `markEmployeeSynced($id)`

**Route:** `PUT /api/hikvision/employees/{id}/mark-synced`

**Purpose:** Marks an employee as synced to the device

**Logic:**
- Finds user by ID
- Sets `device_synced = 1`
- Saves the record

**Response (Success):**
```json
{
  "success": true,
  "message": "Employee marked as synced"
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "message": "Employee not found"
}
```

**Complete Code:**
```php
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
}
```

### 3. ✅ Routes Added to `routes/api.php`

```php
Route::prefix('hikvision')->group(function () {
    // ... existing routes ...
    Route::get('/pending-employees', [HikvisionController::class, 'getPendingEmployees']);
    Route::put('/employees/{id}/mark-synced', [HikvisionController::class, 'markEmployeeSynced']);
});
```

### 4. ✅ User Model Updated

Added new fields to `$fillable` array:
```php
protected $fillable = [
    'name',
    'email',
    'password',
    'device_employee_no',
    'business_id',
    'device_synced',
    'fingerprint_data',
];
```

## Complete Endpoint List

### New Endpoints:
1. **GET** `/api/hikvision/pending-employees` - Get employees to sync
2. **PUT** `/api/hikvision/employees/{id}/mark-synced` - Mark employee as synced

### Existing Endpoints:
1. **GET** `/api/hikvision/device-info` - Get device info
2. **GET** `/api/hikvision/users` - Get users from device
3. **POST** `/api/hikvision/users/create` - Create user on device
4. **POST** `/api/hikvision/fingerprint/capture` - Capture fingerprint
5. **POST** `/api/hikvision/fingerprint/store` - Store fingerprint
6. **POST** `/api/hikvision/attendance` - Get attendance logs

## Testing the New Endpoints

### Test 1: Get Pending Employees

```bash
curl -X GET http://localhost:8000/api/hikvision/pending-employees \
  -H "Accept: application/json"
```

### Test 2: Mark Employee as Synced

```bash
curl -X PUT http://localhost:8000/api/hikvision/employees/1/mark-synced \
  -H "Accept: application/json"
```

## Workflow Integration

### How Middleware Uses These Endpoints:

1. **Every 1 minute**, middleware calls:
   ```
   GET /api/hikvision/pending-employees
   ```

2. For each pending employee:
   - Creates user on Hikvision device
   - Stores fingerprint if available
   - Calls:
     ```
     PUT /api/hikvision/employees/{id}/mark-synced
     ```

3. Employee is marked as synced and won't be processed again

## Database Schema

After migration, `users` table will have:

```sql
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    device_employee_no VARCHAR(255) NULLABLE,
    business_id INT DEFAULT 1,
    device_synced BOOLEAN DEFAULT 0,
    fingerprint_data LONGTEXT NULLABLE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Next Steps

1. ✅ Run migration:
   ```bash
   php artisan migrate
   ```

2. ✅ Test endpoints locally

3. ✅ Deploy to Railway

4. ✅ Start middleware service:
   ```bash
   node middleware.js
   ```

5. ✅ Monitor logs for successful sync

## Notes

- `device_synced` defaults to `0` (not synced)
- `fingerprint_data` is nullable (not all employees may have fingerprints)
- Middleware will automatically sync pending employees every minute
- Once synced, employees won't be processed again unless `device_synced` is reset to `0`
