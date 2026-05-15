# Middleware Updated - Command-Based Processing

## Changes Made

Replaced the old polling logic (attendance sync + pending employees) with a new command-based system that processes fingerprint enrollment commands.

---

## What Was Removed

❌ **Old Functions:**
- `syncAttendance()` - Removed (was syncing attendance every 5 minutes)
- `syncPendingEmployees()` - Removed (was checking pending employees every 1 minute)

❌ **Old Scheduling:**
- `setInterval(syncAttendance, 5 * 60 * 1000)` - Removed
- `setInterval(syncPendingEmployees, 1 * 60 * 1000)` - Removed

---

## What Was Added

### ✅ New Function: `checkPendingCommands()`

**Runs every:** 30 seconds

**What it does:**
1. Calls `GET ${LARAVEL_URL}/api/hikvision/commands/pending`
2. If no commands: logs "No pending commands" and returns
3. For each command found: calls `processCommand(command)`

**Code:**
```javascript
async function checkPendingCommands() {
    log('Checking for pending commands...');
    
    try {
        const response = await axios.get(
            `${LARAVEL_URL}/api/hikvision/commands/pending`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (response.status === 200) {
            const commands = response.data.commands || [];
            
            if (commands.length === 0) {
                log('No pending commands');
                return;
            }

            log(`Found ${commands.length} pending command(s)`);

            for (const command of commands) {
                await processCommand(command);
            }
        }
    } catch (error) {
        log(`Error checking pending commands: ${error.message}`, 'ERROR');
    }
}
```

---

### ✅ New Function: `processCommand(command)`

**What it does:**

#### **STEP A: Create Employee on Device**
```javascript
POST http://${DEVICE_IP}/ISAPI/AccessControl/UserInfo/Record?format=json

Body:
{
    UserInfo: {
        employeeNo: command.employee_no,
        name: command.employee_name,
        userType: 'normal',
        Valid: {
            enable: true,
            beginTime: '2020-01-01T00:00:00',
            endTime: '2030-12-31T23:59:59',
            timeType: 'local'
        }
    }
}
```

#### **STEP B: Trigger Fingerprint Scanner**
```javascript
POST http://${DEVICE_IP}/ISAPI/AccessControl/CaptureFingerPrint
Content-Type: application/xml

Body:
<?xml version="1.0" encoding="UTF-8"?>
<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
    <fingerNo>1</fingerNo>
    <readerID>1</readerID>
    <cancelFlag>false</cancelFlag>
    <collectingPhases>1</collectingPhases>
</CaptureFingerPrintCond>
```

- Waits 30 seconds for employee to place finger
- Parses XML response to extract `fingerData` and `fingerPrintQuality`

#### **STEP C: Store Fingerprint on Device**
```javascript
POST http://${DEVICE_IP}/ISAPI/AccessControl/FingerPrint/SetUp?format=json

Body:
{
    FingerPrintCfg: {
        employeeNo: command.employee_no,
        fingerPrintID: 1,
        fingerData: fingerData,
        fingerType: 'normalFP',
        enableCardReader: [1]
    }
}
```

#### **STEP D: Update Command Status**

**On Success:**
```javascript
PUT ${LARAVEL_URL}/api/hikvision/commands/${command.id}

Body:
{
    status: 'completed',
    result: 'Fingerprint enrolled successfully. Quality: 85'
}
```

**On Failure:**
```javascript
PUT ${LARAVEL_URL}/api/hikvision/commands/${command.id}

Body:
{
    status: 'failed',
    result: 'Error: Failed to capture fingerprint: 400'
}
```

---

## Updated Main Function

```javascript
async function main() {
    log('=================================================');
    log('Hikvision Middleware Service Starting...');
    log('=================================================');
    log(`Device IP: ${DEVICE_IP}`);
    log(`Laravel URL: ${LARAVEL_URL}`);
    log('=================================================');

    // Test connections
    const deviceOk = await testDeviceConnection();
    const laravelOk = await testLaravelConnection();

    if (!deviceOk) {
        log('⚠️  Device connection failed. Will retry...', 'WARN');
    }

    if (!laravelOk) {
        log('⚠️  Laravel connection failed. Will retry...', 'WARN');
    }

    // Schedule command checking every 30 seconds
    log('Scheduling command check every 30 seconds...');
    setInterval(checkPendingCommands, 30 * 1000);
    
    // Run initial check after 5 seconds
    setTimeout(checkPendingCommands, 5000);

    log('✅ Middleware service is running!', 'SUCCESS');
    log('Press Ctrl+C to stop');
}
```

---

## Complete Workflow

### 1. Admin Creates Command (Laravel)
```bash
POST /api/hikvision/commands
{
  "employee_no": "1001",
  "employee_name": "John Doe"
}
```
→ Command created with `status = 'pending'`

### 2. Middleware Picks Up Command (Every 30s)
```
[2026-05-15T10:00:00.000Z] [INFO] Checking for pending commands...
[2026-05-15T10:00:01.000Z] [INFO] Found 1 pending command(s)
[2026-05-15T10:00:01.000Z] [INFO] Processing command 1: enroll_fingerprint for John Doe (1001)
```

### 3. Middleware Creates Employee on Device
```
[2026-05-15T10:00:02.000Z] [INFO] Creating employee 1001 on device...
[2026-05-15T10:00:03.000Z] [SUCCESS] ✅ Employee 1001 created on device
```

### 4. Middleware Triggers Fingerprint Scanner
```
[2026-05-15T10:00:03.000Z] [INFO] Triggering fingerprint scanner for 1001...
[2026-05-15T10:00:03.000Z] [INFO] ⏳ Waiting for employee to place finger (30 seconds timeout)...
```

### 5. Employee Places Finger
```
[2026-05-15T10:00:15.000Z] [SUCCESS] ✅ Fingerprint captured for 1001
[2026-05-15T10:00:15.000Z] [INFO] Fingerprint quality: 85
```

### 6. Middleware Stores Fingerprint
```
[2026-05-15T10:00:15.000Z] [INFO] Storing fingerprint for 1001...
[2026-05-15T10:00:16.000Z] [SUCCESS] ✅ Fingerprint stored for 1001
```

### 7. Middleware Updates Command Status
```
[2026-05-15T10:00:17.000Z] [SUCCESS] ✅ Command 1 completed successfully
```

---

## Error Handling

### Scenario 1: Employee Doesn't Place Finger (Timeout)
```
[2026-05-15T10:00:35.000Z] [ERROR] ❌ Error processing command 1: Failed to capture fingerprint: 400
[2026-05-15T10:00:36.000Z] [INFO] Command 1 marked as failed
```

### Scenario 2: Device Offline
```
[2026-05-15T10:00:02.000Z] [ERROR] ❌ Error processing command 1: connect ETIMEDOUT
[2026-05-15T10:00:03.000Z] [INFO] Command 1 marked as failed
```

### Scenario 3: Employee Already Exists
```
[2026-05-15T10:00:03.000Z] [ERROR] ❌ Error processing command 1: Failed to create user on device: 409
[2026-05-15T10:00:04.000Z] [INFO] Command 1 marked as failed
```

---

## Benefits of New Approach

### ✅ **Command-Based (Better)**
- Commands persist in database
- Can be retried if failed
- Full audit trail
- Admin can see status in real-time
- Scalable (queue hundreds of commands)

### ❌ **Old Polling Approach (Removed)**
- No visibility into what's happening
- Can't retry failed operations
- No audit trail
- Wastes resources checking every minute

---

## Testing

### Test 1: Start Middleware
```bash
node middleware.js
```

**Expected Output:**
```
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:00.000Z] [INFO] Hikvision Middleware Service Starting...
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:00.000Z] [INFO] Device IP: 192.168.100.150
[2026-05-15T10:00:00.000Z] [INFO] Laravel URL: https://hikvision-production.up.railway.app
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:01.000Z] [SUCCESS] ✅ Device connection successful
[2026-05-15T10:00:02.000Z] [SUCCESS] ✅ Laravel connection successful
[2026-05-15T10:00:02.000Z] [INFO] Scheduling command check every 30 seconds...
[2026-05-15T10:00:02.000Z] [SUCCESS] ✅ Middleware service is running!
[2026-05-15T10:00:02.000Z] [INFO] Press Ctrl+C to stop
[2026-05-15T10:00:07.000Z] [INFO] Checking for pending commands...
[2026-05-15T10:00:08.000Z] [INFO] No pending commands
```

### Test 2: Create Command and Watch Processing
```bash
# In another terminal
curl -X POST http://localhost:8000/api/hikvision/commands \
  -H "Content-Type: application/json" \
  -d '{"employee_no":"1001","employee_name":"John Doe"}'
```

**Middleware Output:**
```
[2026-05-15T10:00:37.000Z] [INFO] Checking for pending commands...
[2026-05-15T10:00:38.000Z] [INFO] Found 1 pending command(s)
[2026-05-15T10:00:38.000Z] [INFO] Processing command 1: enroll_fingerprint for John Doe (1001)
[2026-05-15T10:00:38.000Z] [INFO] Creating employee 1001 on device...
[2026-05-15T10:00:39.000Z] [SUCCESS] ✅ Employee 1001 created on device
[2026-05-15T10:00:39.000Z] [INFO] Triggering fingerprint scanner for 1001...
[2026-05-15T10:00:39.000Z] [INFO] ⏳ Waiting for employee to place finger (30 seconds timeout)...
```

---

## Next Steps

1. ✅ Middleware updated with command processing
2. ✅ Test by creating a command
3. ✅ Watch middleware logs
4. ✅ Check command status in database
5. ⏳ Update frontend to create commands and show status

---

## Configuration

No changes needed to `.env` file. Same configuration works:

```env
DEVICE_IP=192.168.100.150
DEVICE_USER=admin
DEVICE_PASS=321321321!
LARAVEL_URL=https://hikvision-production.up.railway.app
```

---

## Summary

- ✅ Removed old attendance/employee sync logic
- ✅ Added command-based processing
- ✅ Checks for commands every 30 seconds
- ✅ Processes fingerprint enrollment end-to-end
- ✅ Updates command status (completed/failed)
- ✅ Full error handling and logging
- ✅ Uses XML for fingerprint capture (as required by device)
- ✅ Parses XML response to extract fingerprint data
- ✅ Stores fingerprint on device
