# Quick Setup Guide - Hikvision Middleware

## What This Does

This Node.js middleware runs on your local machine and:
- **Every 5 minutes**: Syncs attendance from Hikvision device → Laravel API
- **Every 1 minute**: Syncs pending employees from Laravel → Hikvision device

## Files Created

1. ✅ `middleware.js` - Main service file
2. ✅ `.env.middleware` - Environment configuration template
3. ✅ `package-middleware.json` - NPM dependencies
4. ✅ `MIDDLEWARE_README.md` - Full documentation
5. ✅ `start-middleware.sh` - Quick start script

## Setup Steps

### Step 1: Install Node.js Dependencies

```bash
npm install axios dotenv xml2js
```

### Step 2: Configure Environment

Copy the environment template:

```bash
cp .env.middleware .env
```

The `.env` file contains:

```env
DEVICE_IP=192.168.100.150
DEVICE_USER=admin
DEVICE_PASS=321321321!
LARAVEL_URL=https://hikvision-production.up.railway.app
```

### Step 3: Run the Middleware

```bash
node middleware.js
```

Or use the start script:

```bash
chmod +x start-middleware.sh
./start-middleware.sh
```

## Expected Output

```
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:00.000Z] [INFO] Hikvision Middleware Service Starting...
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:00.000Z] [INFO] Device IP: 192.168.100.150
[2026-05-15T10:00:00.000Z] [INFO] Laravel URL: https://hikvision-production.up.railway.app
[2026-05-15T10:00:00.000Z] [INFO] =================================================
[2026-05-15T10:00:00.000Z] [INFO] Testing device connection...
[2026-05-15T10:00:01.000Z] [SUCCESS] ✅ Device connection successful
[2026-05-15T10:00:01.000Z] [INFO] Testing Laravel connection...
[2026-05-15T10:00:02.000Z] [SUCCESS] ✅ Laravel connection successful
[2026-05-15T10:00:02.000Z] [INFO] Scheduling attendance sync every 5 minutes...
[2026-05-15T10:00:02.000Z] [INFO] Scheduling pending employees check every 1 minute...
[2026-05-15T10:00:02.000Z] [SUCCESS] ✅ Middleware service is running!
[2026-05-15T10:00:02.000Z] [INFO] Press Ctrl+C to stop
```

## What Happens Next

### After 10 seconds:
```
[2026-05-15T10:00:12.000Z] [INFO] Starting attendance sync...
[2026-05-15T10:00:12.000Z] [INFO] Fetching attendance page (position: 0)...
[2026-05-15T10:00:13.000Z] [INFO] Fetched 15 punches from device
[2026-05-15T10:00:14.000Z] [SUCCESS] ✅ Sync complete: 12 synced, 3 skipped
```

### After 15 seconds:
```
[2026-05-15T10:00:17.000Z] [INFO] Checking for pending employees...
[2026-05-15T10:00:18.000Z] [INFO] Found 2 pending employees
[2026-05-15T10:00:18.000Z] [INFO] Processing employee: 1001 - John Doe
[2026-05-15T10:00:19.000Z] [SUCCESS] ✅ Created user 1001 on device
[2026-05-15T10:00:20.000Z] [SUCCESS] ✅ Marked employee 5 as synced
```

## Laravel API Endpoints Required

You need to create these endpoints in Laravel:

### 1. Sync Attendance (Already exists)
```
POST /api/v1/hikvision/attendance/sync
Body: { punches: [{ employeeNo, time, type }] }
```

### 2. Get Pending Employees (NEW - Need to create)
```
GET /api/hikvision/pending-employees
Response: { data: [{ id, device_employee_no, name, fingerprint_data }] }
```

### 3. Mark Employee Synced (NEW - Need to create)
```
PUT /api/hikvision/employees/{id}/mark-synced
Response: { success: true }
```

## Running 24/7

### Option 1: PM2 (Recommended)

```bash
npm install -g pm2
pm2 start middleware.js --name hikvision
pm2 save
pm2 startup
```

View logs:
```bash
pm2 logs hikvision
```

### Option 2: Screen (Linux/Mac)

```bash
screen -S hikvision
node middleware.js
# Press Ctrl+A then D to detach
```

Reattach:
```bash
screen -r hikvision
```

### Option 3: nohup

```bash
nohup node middleware.js > middleware.log 2>&1 &
```

View logs:
```bash
tail -f middleware.log
```

## Troubleshooting

### "Cannot find module 'axios'"
```bash
npm install axios dotenv xml2js
```

### "Device connection failed"
- Check device IP: `ping 192.168.100.150`
- Verify credentials in `.env`
- Check device is powered on

### "Laravel connection failed"
- Check internet connection
- Verify Laravel URL in `.env`
- Test URL in browser

### "No attendance synced"
- Check device has attendance records
- Verify employee numbers exist in Laravel
- Check Laravel logs

## Next Steps

1. ✅ Install dependencies
2. ✅ Configure `.env`
3. ✅ Run `node middleware.js`
4. ⏳ Create missing Laravel endpoints:
   - `GET /api/hikvision/pending-employees`
   - `PUT /api/hikvision/employees/{id}/mark-synced`
5. ⏳ Test attendance sync
6. ⏳ Test employee sync
7. ⏳ Set up PM2 for 24/7 operation

## Support

See `MIDDLEWARE_README.md` for full documentation.
