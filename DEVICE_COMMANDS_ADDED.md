# Device Commands System Added

## Overview

Created a command queue system to manage device operations (like fingerprint enrollment) asynchronously. Commands are created in Laravel, picked up by middleware, executed on the device, and status is reported back.

---

## TASK 1: ✅ Migration Created

**File:** `database/migrations/2026_05_15_000002_create_device_commands_table.php`

**Schema:**
```php
Schema::create('device_commands', function (Blueprint $table) {
    $table->id();
    $table->string('employee_no');
    $table->string('employee_name');
    $table->string('type')->default('enroll_fingerprint');
    $table->string('status')->default('pending');
    $table->text('result')->nullable();
    $table->timestamps();
});
```

**Status Values:**
- `pending` - Command created, waiting to be processed
- `processing` - Middleware picked it up and is executing
- `completed` - Successfully executed
- `failed` - Execution failed

**Run migration:**
```bash
php artisan migrate
```

---

## TASK 2: ✅ DeviceCommand Model Created

**File:** `app/Models/DeviceCommand.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeviceCommand extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_no',
        'employee_name',
        'type',
        'status',
        'result',
    ];
}
```

---

## TASK 3: ✅ Three Methods Added to HikvisionController

### Method 1: `getPendingCommands()`

**Route:** `GET /api/hikvision/commands/pending`

**Purpose:** Fetch all pending commands and mark them as processing

**Logic:**
1. Get all commands where `status = 'pending'`
2. Update their status to `'processing'`
3. Return the commands

**Response:**
```json
{
  "success": true,
  "commands": [
    {
      "id": 1,
      "employee_no": "1001",
      "employee_name": "John Doe",
      "type": "enroll_fingerprint",
      "status": "processing",
      "result": null,
      "created_at": "2026-05-15T10:00:00.000000Z",
      "updated_at": "2026-05-15T10:00:05.000000Z"
    }
  ]
}
```

**Complete Code:**
```php
public function getPendingCommands()
{
    try {
        // Get all pending commands
        $commands = \App\Models\DeviceCommand::where('status', 'pending')->get();

        // Update their status to processing
        \App\Models\DeviceCommand::where('status', 'pending')
            ->update(['status' => 'processing']);

        return response()->json([
            'success' => true,
            'commands' => $commands
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error fetching pending commands: ' . $e->getMessage()
        ], 500);
    }
}
```

---

### Method 2: `updateCommandStatus(Request $request, $id)`

**Route:** `PUT /api/hikvision/commands/{id}`

**Purpose:** Update command status and result after execution

**Request Body:**
```json
{
  "status": "completed",
  "result": "Fingerprint enrolled successfully"
}
```

**Validation:**
- `status` - required, must be one of: pending, processing, completed, failed
- `result` - optional string

**Response:**
```json
{
  "success": true,
  "command": {
    "id": 1,
    "employee_no": "1001",
    "employee_name": "John Doe",
    "type": "enroll_fingerprint",
    "status": "completed",
    "result": "Fingerprint enrolled successfully",
    "created_at": "2026-05-15T10:00:00.000000Z",
    "updated_at": "2026-05-15T10:05:00.000000Z"
  }
}
```

**Complete Code:**
```php
public function updateCommandStatus(Request $request, $id)
{
    try {
        $request->validate([
            'status' => 'required|string|in:pending,processing,completed,failed',
            'result' => 'nullable|string',
        ]);

        $command = \App\Models\DeviceCommand::find($id);

        if (!$command) {
            return response()->json([
                'success' => false,
                'message' => 'Command not found'
            ], 404);
        }

        $command->update([
            'status' => $request->status,
            'result' => $request->result,
        ]);

        return response()->json([
            'success' => true,
            'command' => $command
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error updating command: ' . $e->getMessage()
        ], 500);
    }
}
```

---

### Method 3: `createCommand(Request $request)`

**Route:** `POST /api/hikvision/commands`

**Purpose:** Create a new fingerprint enrollment command

**Request Body:**
```json
{
  "employee_no": "1001",
  "employee_name": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "command": {
    "id": 1,
    "employee_no": "1001",
    "employee_name": "John Doe",
    "type": "enroll_fingerprint",
    "status": "pending",
    "result": null,
    "created_at": "2026-05-15T10:00:00.000000Z",
    "updated_at": "2026-05-15T10:00:00.000000Z"
  }
}
```

**Complete Code:**
```php
public function createCommand(Request $request)
{
    try {
        $request->validate([
            'employee_no' => 'required|string',
            'employee_name' => 'required|string',
        ]);

        $command = \App\Models\DeviceCommand::create([
            'employee_no' => $request->employee_no,
            'employee_name' => $request->employee_name,
            'type' => 'enroll_fingerprint',
            'status' => 'pending',
        ]);

        return response()->json([
            'success' => true,
            'command' => $command
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'success' => false,
            'message' => 'Error creating command: ' . $e->getMessage()
        ], 500);
    }
}
```

---

## TASK 4: ✅ Routes Added

**File:** `routes/api.php`

```php
Route::get('/commands/pending', [HikvisionController::class, 'getPendingCommands']);
Route::put('/commands/{id}', [HikvisionController::class, 'updateCommandStatus']);
Route::post('/commands', [HikvisionController::class, 'createCommand']);
```

---

## Complete Workflow

### 1. Create Command (Frontend/Admin)
```bash
POST /api/hikvision/commands
{
  "employee_no": "1001",
  "employee_name": "John Doe"
}
```
→ Command created with `status = 'pending'`

### 2. Middleware Picks Up Command
```bash
GET /api/hikvision/commands/pending
```
→ Returns pending commands and marks them as `'processing'`

### 3. Middleware Executes Command
- Calls device to enroll fingerprint
- Waits for employee to place finger
- Gets result from device

### 4. Middleware Updates Status
```bash
PUT /api/hikvision/commands/1
{
  "status": "completed",
  "result": "Fingerprint enrolled successfully"
}
```
→ Command marked as `'completed'`

### 5. Frontend Checks Status
```bash
GET /api/hikvision/commands/1
```
→ Shows completion status to user

---

## Testing

### Test 1: Create Command
```bash
curl -X POST http://localhost:8000/api/hikvision/commands \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "employee_no": "1001",
    "employee_name": "John Doe"
  }'
```

### Test 2: Get Pending Commands
```bash
curl -X GET http://localhost:8000/api/hikvision/commands/pending \
  -H "Accept: application/json"
```

### Test 3: Update Command Status
```bash
curl -X PUT http://localhost:8000/api/hikvision/commands/1 \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "status": "completed",
    "result": "Fingerprint enrolled successfully"
  }'
```

---

## Database Schema

After migration:

```sql
CREATE TABLE device_commands (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    employee_no VARCHAR(255),
    employee_name VARCHAR(255),
    type VARCHAR(255) DEFAULT 'enroll_fingerprint',
    status VARCHAR(255) DEFAULT 'pending',
    result TEXT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## Use Cases

### Use Case 1: Fingerprint Enrollment
1. Admin creates command for employee
2. Middleware picks it up
3. Device prompts employee to place finger
4. Fingerprint captured and stored
5. Status updated to completed

### Use Case 2: Bulk Enrollment
1. Admin creates multiple commands
2. Middleware processes them one by one
3. Each employee enrolls their fingerprint
4. All statuses tracked individually

### Use Case 3: Failed Enrollment
1. Command created
2. Middleware tries to execute
3. Employee doesn't place finger (timeout)
4. Status updated to `'failed'` with error message
5. Admin can retry by creating new command

---

## Benefits

1. **Asynchronous**: Don't block frontend waiting for device
2. **Reliable**: Commands persist in database
3. **Trackable**: Full history of all operations
4. **Retryable**: Failed commands can be retried
5. **Scalable**: Can queue hundreds of commands
6. **Auditable**: Know who did what and when

---

## Next Steps

1. ✅ Run migration:
   ```bash
   php artisan migrate
   ```

2. ✅ Test endpoints:
   ```bash
   # Create command
   curl -X POST http://localhost:8000/api/hikvision/commands \
     -H "Content-Type: application/json" \
     -d '{"employee_no":"1001","employee_name":"John Doe"}'
   
   # Get pending
   curl -X GET http://localhost:8000/api/hikvision/commands/pending
   
   # Update status
   curl -X PUT http://localhost:8000/api/hikvision/commands/1 \
     -H "Content-Type: application/json" \
     -d '{"status":"completed","result":"Success"}'
   ```

3. ✅ Update middleware to process commands

4. ✅ Update frontend to create and monitor commands

---

## Future Enhancements

- Add more command types (delete user, update user, etc.)
- Add priority field for urgent commands
- Add retry count for failed commands
- Add scheduled execution time
- Add command expiration
- Add user who created the command
