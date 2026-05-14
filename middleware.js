const axios = require('axios');
const crypto = require('crypto');
const xml2js = require('xml2js');
require('dotenv').config();

// Configuration
const DEVICE_IP = process.env.DEVICE_IP || '192.168.100.150';
const DEVICE_USER = process.env.DEVICE_USER || 'admin';
const DEVICE_PASS = process.env.DEVICE_PASS || '321321321!';
const LARAVEL_URL = process.env.LARAVEL_URL || 'https://hikvision-production.up.railway.app';

// Digest Auth Helper
class DigestAuth {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.nc = 0;
    }

    md5(data) {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    parseAuthHeader(authHeader) {
        const params = {};
        const regex = /(\w+)=["']?([^"',]+)["']?/g;
        let match;

        while ((match = regex.exec(authHeader)) !== null) {
            params[match[1]] = match[2];
        }

        return params;
    }

    generateAuthHeader(method, uri, authParams) {
        this.nc++;
        const cnonce = crypto.randomBytes(16).toString('hex');
        const ncStr = ('00000000' + this.nc).slice(-8);

        const ha1 = this.md5(`${this.username}:${authParams.realm}:${this.password}`);
        const ha2 = this.md5(`${method}:${uri}`);

        let response;
        if (authParams.qop === 'auth' || authParams.qop === 'auth-int') {
            response = this.md5(`${ha1}:${authParams.nonce}:${ncStr}:${cnonce}:${authParams.qop}:${ha2}`);
        } else {
            response = this.md5(`${ha1}:${authParams.nonce}:${ha2}`);
        }

        let authHeader = `Digest username="${this.username}", realm="${authParams.realm}", ` +
            `nonce="${authParams.nonce}", uri="${uri}", ` +
            `response="${response}"`;

        if (authParams.qop) {
            authHeader += `, qop=${authParams.qop}, nc=${ncStr}, cnonce="${cnonce}"`;
        }

        if (authParams.opaque) {
            authHeader += `, opaque="${authParams.opaque}"`;
        }

        return authHeader;
    }

    async request(method, url, data = null, contentType = 'application/json') {
        const urlObj = new URL(url);
        const uri = urlObj.pathname + urlObj.search;

        try {
            // First request to get auth challenge
            const firstResponse = await axios({
                method,
                url,
                data,
                headers: {
                    'Content-Type': contentType
                },
                validateStatus: () => true
            });

            if (firstResponse.status === 401) {
                const authHeader = firstResponse.headers['www-authenticate'];
                if (!authHeader) {
                    throw new Error('No WWW-Authenticate header in 401 response');
                }

                const authParams = this.parseAuthHeader(authHeader);
                const digestHeader = this.generateAuthHeader(method, uri, authParams);

                // Second request with digest auth
                const secondResponse = await axios({
                    method,
                    url,
                    data,
                    headers: {
                        'Content-Type': contentType,
                        'Authorization': digestHeader
                    }
                });

                return secondResponse;
            }

            return firstResponse;
        } catch (error) {
            throw error;
        }
    }
}

const digestAuth = new DigestAuth(DEVICE_USER, DEVICE_PASS);

// Logging Helper
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type}]`;
    console.log(`${prefix} ${message}`);
}

// Convert UTC to PKT (UTC+5)
function convertToPKT(utcTime) {
    const date = new Date(utcTime);
    date.setHours(date.getHours() + 5);
    return date.toISOString();
}

// Sync Attendance from Device to Laravel
async function syncAttendance() {
    log('Starting attendance sync...');

    try {
        const today = new Date();
        const startTime = new Date(today.setHours(0, 0, 0, 0)).toISOString().replace(/\.\d{3}Z$/, '');
        const endTime = new Date(today.setHours(23, 59, 59, 999)).toISOString().replace(/\.\d{3}Z$/, '');

        let allPunches = [];
        let searchResultPosition = 0;
        let hasMore = true;

        // Paginate through all results
        while (hasMore) {
            const body = {
                AcsEventCond: {
                    searchID: '1',
                    searchResultPosition,
                    maxResults: 30,
                    major: 5,
                    minor: 0,
                    startTime,
                    endTime
                }
            };

            log(`Fetching attendance page (position: ${searchResultPosition})...`);

            const response = await digestAuth.request(
                'POST',
                `http://${DEVICE_IP}/ISAPI/AccessControl/AcsEvent?format=json`,
                JSON.stringify(body),
                'application/json'
            );

            if (response.status === 200) {
                const data = response.data;
                const events = data.AcsEvent?.InfoList || [];

                if (Array.isArray(events) && events.length > 0) {
                    events.forEach(event => {
                        allPunches.push({
                            employeeNo: event.employeeNoString,
                            time: convertToPKT(event.time),
                            type: event.eventType === 0 ? 'IN' : event.eventType === 1 ? 'OUT' : 'PUNCH'
                        });
                    });

                    searchResultPosition += events.length;

                    // Check if there are more results
                    const numOfMatches = data.AcsEvent?.numOfMatches || 0;
                    hasMore = searchResultPosition < numOfMatches;
                } else {
                    hasMore = false;
                }
            } else {
                log(`Failed to fetch attendance: ${response.status}`, 'ERROR');
                hasMore = false;
            }
        }

        log(`Fetched ${allPunches.length} punches from device`);

        if (allPunches.length > 0) {
            // Send to Laravel
            const laravelResponse = await axios.post(
                `${LARAVEL_URL}/api/v1/hikvision/attendance/sync`,
                { punches: allPunches },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            if (laravelResponse.status === 200) {
                const result = laravelResponse.data;
                log(`✅ Sync complete: ${result.synced_count} synced, ${result.skipped_count} skipped`, 'SUCCESS');

                if (result.errors && result.errors.length > 0) {
                    log(`Errors: ${result.errors.join(', ')}`, 'WARN');
                }
            } else {
                log(`Failed to sync to Laravel: ${laravelResponse.status}`, 'ERROR');
            }
        } else {
            log('No attendance records to sync');
        }
    } catch (error) {
        log(`Attendance sync error: ${error.message}`, 'ERROR');
        if (error.response) {
            log(`Response: ${JSON.stringify(error.response.data)}`, 'ERROR');
        }
    }
}

// Check and Sync Pending Employees
async function syncPendingEmployees() {
    log('Checking for pending employees...');

    try {
        const response = await axios.get(
            `${LARAVEL_URL}/api/hikvision/pending-employees`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (response.status === 200) {
            const pendingEmployees = response.data.data || [];
            log(`Found ${pendingEmployees.length} pending employees`);

            for (const employee of pendingEmployees) {
                try {
                    log(`Processing employee: ${employee.device_employee_no} - ${employee.name}`);

                    // Create user on device
                    const userBody = {
                        UserInfo: {
                            employeeNo: employee.device_employee_no,
                            name: employee.name,
                            userType: 'normal',
                            Valid: {
                                enable: true,
                                beginTime: '2020-01-01T00:00:00',
                                endTime: '2037-12-31T23:59:59'
                            },
                            doorRight: '1',
                            RightPlan: [
                                {
                                    doorNo: 1,
                                    planTemplateNo: '1'
                                }
                            ]
                        }
                    };

                    const createResponse = await digestAuth.request(
                        'POST',
                        `http://${DEVICE_IP}/ISAPI/AccessControl/UserInfo/Record?format=json`,
                        JSON.stringify(userBody),
                        'application/json'
                    );

                    if (createResponse.status === 200) {
                        log(`✅ Created user ${employee.device_employee_no} on device`, 'SUCCESS');

                        // If fingerprint data exists, store it
                        if (employee.fingerprint_data) {
                            log(`Storing fingerprint for ${employee.device_employee_no}...`);

                            const fingerprintBody = {
                                FingerPrintCfg: {
                                    employeeNo: employee.device_employee_no,
                                    fingerPrintID: 1,
                                    fingerData: employee.fingerprint_data,
                                    fingerType: 'normalFP',
                                    enableCardReader: [1]
                                }
                            };

                            const fpResponse = await digestAuth.request(
                                'POST',
                                `http://${DEVICE_IP}/ISAPI/AccessControl/FingerPrint/SetUp?format=json`,
                                JSON.stringify(fingerprintBody),
                                'application/json'
                            );

                            if (fpResponse.status === 200) {
                                log(`✅ Stored fingerprint for ${employee.device_employee_no}`, 'SUCCESS');
                            } else {
                                log(`Failed to store fingerprint: ${fpResponse.status}`, 'WARN');
                            }
                        }

                        // Mark as synced on Laravel
                        await axios.put(
                            `${LARAVEL_URL}/api/hikvision/employees/${employee.id}/mark-synced`,
                            {},
                            {
                                headers: {
                                    'Accept': 'application/json'
                                }
                            }
                        );

                        log(`✅ Marked employee ${employee.id} as synced`, 'SUCCESS');
                    } else {
                        log(`Failed to create user on device: ${createResponse.status}`, 'ERROR');
                    }
                } catch (empError) {
                    log(`Error processing employee ${employee.device_employee_no}: ${empError.message}`, 'ERROR');
                }
            }
        }
    } catch (error) {
        log(`Pending employees sync error: ${error.message}`, 'ERROR');
        if (error.response) {
            log(`Response: ${JSON.stringify(error.response.data)}`, 'ERROR');
        }
    }
}

// Test Device Connection
async function testDeviceConnection() {
    log('Testing device connection...');

    try {
        const response = await digestAuth.request(
            'GET',
            `http://${DEVICE_IP}/ISAPI/System/deviceInfo`,
            null,
            'application/json'
        );

        if (response.status === 200) {
            log('✅ Device connection successful', 'SUCCESS');
            log(`Device: ${JSON.stringify(response.data).substring(0, 100)}...`);
            return true;
        } else {
            log(`Device connection failed: ${response.status}`, 'ERROR');
            return false;
        }
    } catch (error) {
        log(`Device connection error: ${error.message}`, 'ERROR');
        return false;
    }
}

// Test Laravel Connection
async function testLaravelConnection() {
    log('Testing Laravel connection...');

    try {
        const response = await axios.get(`${LARAVEL_URL}/api/hikvision/device-info`, {
            headers: { 'Accept': 'application/json' }
        });

        if (response.status === 200) {
            log('✅ Laravel connection successful', 'SUCCESS');
            return true;
        } else {
            log(`Laravel connection failed: ${response.status}`, 'ERROR');
            return false;
        }
    } catch (error) {
        log(`Laravel connection error: ${error.message}`, 'ERROR');
        return false;
    }
}

// Main Function
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

    // Schedule attendance sync every 5 minutes
    log('Scheduling attendance sync every 5 minutes...');
    setInterval(syncAttendance, 5 * 60 * 1000);

    // Run initial sync after 10 seconds
    setTimeout(syncAttendance, 10000);

    // Schedule pending employees check every 1 minute
    log('Scheduling pending employees check every 1 minute...');
    setInterval(syncPendingEmployees, 1 * 60 * 1000);

    // Run initial check after 15 seconds
    setTimeout(syncPendingEmployees, 15000);

    log('✅ Middleware service is running!', 'SUCCESS');
    log('Press Ctrl+C to stop');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('Shutting down middleware service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Shutting down middleware service...');
    process.exit(0);
});

// Start the service
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
