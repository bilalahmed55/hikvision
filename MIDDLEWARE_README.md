# Hikvision Middleware Service

A Node.js service that bridges the Hikvision DS-K1A8503MF fingerprint device (local network) and Laravel API (deployed on Railway).

## Features

### 1. Automatic Attendance Sync (Every 5 Minutes)
- Fetches today's attendance from Hikvision device
- Paginates through all results (30 records per page)
- Converts device time (UTC) to PKT (UTC+5)
- Syncs to Laravel API
- Logs sync statistics

### 2. Pending Employees Sync (Every 1 Minute)
- Checks for pending employees from Laravel
- Creates users on Hikvision device
- Stores fingerprint data if available
- Marks employees as synced

### 3. HTTP Digest Authentication
- Implements full digest auth for Hikvision device
- Handles 401 challenges automatically
- Computes MD5 hashes for authentication

## Installation

### 1. Install Dependencies

```bash
npm install axios dotenv xml2js
```

Or use the provided package file:

```bash
cp package-middleware.json package.json
npm install
```

### 2. Configure Environment

Copy `.env.middleware` to `.env`:

```bash
cp .env.middleware .env
```

Edit `.env` with your settings:

```env
DEVICE_IP=192.168.100.150
DEVICE_USER=admin
DEVICE_PASS=321321321!
LARAVEL_URL=https://hikvision-production.up.railway.app
```

### 3. Run the Service

```bash
npm start
```

Or directly:

```bash
node middleware.js
```

## How It Works

### Attendance Sync Flow

```
Every 5 minutes:
1. Fetch attendance from device (POST /ISAPI/AccessControl/AcsEvent)
2. Paginate through all results
3. Convert UTC to PKT (add 5 hours)
4. POST to Laravel (/api/v1/hikvision/attendance/sync)
5. Log results
```

### Pending Employees Flow

```
Every 1 minute:
1. GET pending employees from Laravel
2. For each employee:
   a. Create user on device (POST /ISAPI/AccessControl/UserInfo/Record)
   b. If fingerprint exists, store it (POST /ISAPI/AccessControl/FingerPrint/SetUp)
   c. Mark as synced on Laravel (PUT /api/hikvision/employees/{id}/mark-synced)
```

### Digest Authentication Flow

```
1. Send initial request
2. Receive 401 with WWW-Authenticate header
3. Parse realm, nonce, qop, opaque
4. Compute:
   - HA1 = MD5(username:realm:password)
   - HA2 = MD5(method:uri)
   - response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
5. Send request with Authorization: Digest header
```

## Logs

The service logs all activities with timestamps:

```
[2026-05-15T10:00:00.000Z] [INFO] Starting attendance sync...
[2026-05-15T10:00:01.000Z] [INFO] Fetching attendance page (position: 0)...
[2026-05-15T10:00:02.000Z] [INFO] Fetched 15 punches from device
[2026-05-15T10:00:03.000Z] [SUCCESS] ✅ Sync complete: 12 synced, 3 skipped
```

## API Endpoints Used

### Hikvision Device

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ISAPI/System/deviceInfo` | GET | Test connection |
| `/ISAPI/AccessControl/AcsEvent?format=json` | POST | Fetch attendance |
| `/ISAPI/AccessControl/UserInfo/Record?format=json` | POST | Create user |
| `/ISAPI/AccessControl/FingerPrint/SetUp?format=json` | POST | Store fingerprint |

### Laravel API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/hikvision/device-info` | GET | Test connection |
| `/api/v1/hikvision/attendance/sync` | POST | Sync attendance |
| `/api/hikvision/pending-employees` | GET | Get pending employees |
| `/api/hikvision/employees/{id}/mark-synced` | PUT | Mark employee synced |

## Time Conversion

The middleware converts device time (UTC) to Pakistan Time (PKT = UTC+5):

```javascript
function convertToPKT(utcTime) {
    const date = new Date(utcTime);
    date.setHours(date.getHours() + 5);
    return date.toISOString();
}
```

## Error Handling

- All errors are logged with timestamps
- Failed requests are retried on next interval
- Service continues running even if individual operations fail
- Graceful shutdown on SIGINT/SIGTERM

## Running as a Service

### Using PM2 (Recommended)

```bash
npm install -g pm2
pm2 start middleware.js --name hikvision-middleware
pm2 save
pm2 startup
```

### Using systemd (Linux)

Create `/etc/systemd/system/hikvision-middleware.service`:

```ini
[Unit]
Description=Hikvision Middleware Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/node middleware.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable hikvision-middleware
sudo systemctl start hikvision-middleware
sudo systemctl status hikvision-middleware
```

## Troubleshooting

### Device Connection Failed

- Check device IP is correct
- Verify device is on same network
- Test device credentials
- Check firewall settings

### Laravel Connection Failed

- Verify Laravel URL is correct
- Check internet connection
- Verify API endpoints exist
- Check Railway deployment status

### Digest Auth Failed

- Verify username and password
- Check device supports digest auth
- Review device logs

### No Attendance Synced

- Check device has attendance records
- Verify date/time on device
- Check employee numbers match
- Review Laravel logs

## Development

### Test Individual Functions

```javascript
// Test device connection
testDeviceConnection();

// Test Laravel connection
testLaravelConnection();

// Run attendance sync once
syncAttendance();

// Run pending employees sync once
syncPendingEmployees();
```

### Adjust Sync Intervals

Edit the intervals in `main()`:

```javascript
// Change from 5 minutes to 10 minutes
setInterval(syncAttendance, 10 * 60 * 1000);

// Change from 1 minute to 30 seconds
setInterval(syncPendingEmployees, 30 * 1000);
```

## Security Notes

- Store credentials in `.env` file
- Never commit `.env` to version control
- Use HTTPS for Laravel API
- Keep device on secure network
- Regularly update dependencies

## License

MIT
