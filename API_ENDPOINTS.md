# Hikvision API Endpoints - Fixed

## Issues Fixed:

1. ✅ **Moved routes from web.php to api.php** - This removes CSRF token requirement
2. ✅ **Enabled API routes in bootstrap/app.php** - Added `api: __DIR__.'/../routes/api.php'`
3. ✅ **All controller methods return JSON** - Using `response()->json()`
4. ✅ **No authentication required** - Routes are accessible without auth (for testing)
5. ✅ **Updated frontend to use /api prefix** - Changed API_BASE to include /api

## Base URL

All endpoints are now prefixed with: `http://localhost:8000/api`

## Available Endpoints

### 1. Get Device Info
- **URL:** `GET http://localhost:8000/api/hikvision/device-info`
- **Response:** JSON with device model, firmware, serial number
- **Example:**
```json
{
  "success": true,
  "data": {
    "DeviceInfo": {
      "model": "DS-K1A8503MF",
      "firmwareVersion": "V1.2.3",
      "serialNumber": "ABC123456"
    }
  }
}
```

### 2. Get Users List
- **URL:** `GET http://localhost:8000/api/hikvision/users`
- **Response:** JSON with list of employees
- **Example:**
```json
{
  "success": true,
  "data": {
    "UserInfoSearch": {
      "UserInfo": [
        {
          "employeeNo": "1001",
          "name": "John Doe",
          "userType": "normal"
        }
      ]
    }
  }
}
```

### 3. Create User
- **URL:** `POST http://localhost:8000/api/hikvision/users/create`
- **Body:**
```json
{
  "employeeNo": "1001",
  "name": "John Doe"
}
```
- **Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": { ... }
}
```

### 4. Capture Fingerprint
- **URL:** `POST http://localhost:8000/api/hikvision/fingerprint/capture`
- **Body:**
```json
{
  "employeeNo": "1001"
}
```
- **Response:**
```json
{
  "success": true,
  "message": "Fingerprint captured successfully",
  "data": {
    "fingerData": "..."
  }
}
```

### 5. Store Fingerprint
- **URL:** `POST http://localhost:8000/api/hikvision/fingerprint/store`
- **Body:**
```json
{
  "employeeNo": "1001",
  "fingerData": "captured_data_here"
}
```
- **Response:**
```json
{
  "success": true,
  "message": "Fingerprint stored successfully",
  "data": { ... }
}
```

### 6. Get Attendance Logs
- **URL:** `POST http://localhost:8000/api/hikvision/attendance`
- **Body:**
```json
{
  "startDate": "2026-05-13",
  "endDate": "2026-05-13"
}
```
- **Response:**
```json
{
  "success": true,
  "data": {
    "AcsEvent": {
      "InfoList": [
        {
          "employeeNoString": "1001",
          "time": "2026-05-13T09:00:00",
          "eventType": 0
        }
      ]
    }
  }
}
```

## Testing

1. Start Laravel server:
```bash
php artisan serve
```

2. Open browser:
```
http://localhost:8000/index.html
```

3. All endpoints should now return JSON instead of HTML

## Notes

- All routes are in `routes/api.php`
- No CSRF token required (API routes don't use CSRF by default)
- No authentication required (for testing purposes)
- All responses are JSON format
- Frontend updated to use `/api` prefix
