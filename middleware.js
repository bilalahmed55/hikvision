import axios from 'axios';
import crypto from 'crypto';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const DEVICE_IP = process.env.DEVICE_IP || '192.168.100.150';
const DEVICE_USER = process.env.DEVICE_USER || 'admin';
const DEVICE_PASS = process.env.DEVICE_PASS || '321321321!';
const LARAVEL_URL = process.env.LARAVEL_URL || 'https://hikvision-production.up.railway.app';
let lastSyncTime = null;

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
            `nonce="${authParams.nonce}", uri="${uri}", response="${response}"`;

        if (authParams.qop) {
            authHeader += `, qop=${authParams.qop}, nc=${ncStr}, cnonce="${cnonce}"`;
        }
        if (authParams.opaque) {
            authHeader += `, opaque="${authParams.opaque}"`;
        }

        return authHeader;
    }

    async request(method, url, data = null, contentType = 'application/json', timeoutMs = 35000) {
        const urlObj = new URL(url);
        const uri = urlObj.pathname + urlObj.search;

        try {
            const firstResponse = await axios({
                method, url, data,
                headers: { 'Content-Type': contentType },
                validateStatus: () => true,
                timeout: timeoutMs
            });

            if (firstResponse.status === 401) {
                const authHeader = firstResponse.headers['www-authenticate'];
                if (!authHeader) throw new Error('No WWW-Authenticate header in 401 response');

                const authParams = this.parseAuthHeader(authHeader);
                const digestHeader = this.generateAuthHeader(method, uri, authParams);

                const secondResponse = await axios({
                    method, url, data,
                    headers: {
                        'Content-Type': contentType,
                        'Authorization': digestHeader
                    },
                    validateStatus: () => true,
                    timeout: timeoutMs
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

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

async function testDeviceConnection() {
    log('Testing device connection...');
    try {
        const response = await digestAuth.request('GET', `http://${DEVICE_IP}/ISAPI/System/deviceInfo`, null, 'application/xml');
        if (response.status === 200) {
            log('✅ Device connection successful', 'SUCCESS');
            return true;
        }
        log(`Device connection failed: ${response.status}`, 'ERROR');
        return false;
    } catch (error) {
        log(`Device connection error: ${error.message}`, 'ERROR');
        return false;
    }
}

async function testLaravelConnection() {
    log('Testing Laravel connection...');
    try {
        const response = await axios.get(`${LARAVEL_URL}/api/hikvision/commands/pending`, {
            headers: { 'Accept': 'application/json' },
            validateStatus: () => true
        });
        if (response.status === 200) {
            log('✅ Laravel connection successful', 'SUCCESS');
            return true;
        }
        log(`Laravel connection failed: ${response.status}`, 'ERROR');
        return false;
    } catch (error) {
        log(`Laravel connection error: ${error.message}`, 'ERROR');
        return false;
    }
}

async function checkPendingCommands() {
    log('Checking for pending commands...');
    try {
        const response = await axios.get(`${LARAVEL_URL}/api/hikvision/commands/pending`, {
            headers: { 'Accept': 'application/json' },
            validateStatus: () => true
        });

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

async function processCommand(command) {
    log(`Processing command ${command.id}: ${command.type} for ${command.employee_name} (${command.employee_no})`);

    try {
        if (command.type === 'delete_employee') {
            await processDeleteEmployee(command);
        } else if (command.type === 'enroll_fingerprint') {
            await processEnrollFingerprint(command);
        } else {
            throw new Error(`Unknown command type: ${command.type}`);
        }
    } catch (error) {
        log(`❌ Error processing command ${command.id}: ${error.message}`, 'ERROR');
        try {
            await axios.put(
                `${LARAVEL_URL}/api/hikvision/commands/${command.id}`,
                { status: 'failed', result: `Error: ${error.message}` },
                { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, validateStatus: () => true }
            );
        } catch (updateError) {
            log(`Failed to update command status: ${updateError.message}`, 'ERROR');
        }
    }
}

async function processDeleteEmployee(command) {
    log(`Deleting employee ${command.employee_no} from device...`);

    try {
        // Delete user from device using employeeNo
        const deleteBody = {
            UserInfoDelCond: {
                EmployeeNoList: [
                    {
                        employeeNo: String(command.employee_no)
                    }
                ]
            }
        };

        const deleteResponse = await digestAuth.request(
            'PUT',
            `http://${DEVICE_IP}/ISAPI/AccessControl/UserInfo/Delete?format=json`,
            JSON.stringify(deleteBody),
            'application/json'
        );

        // Check response status - only 200 is success
        if (deleteResponse.status === 200) {
            log(`✅ Employee ${command.employee_no} deleted from device successfully`, 'SUCCESS');

            await axios.put(
                `${LARAVEL_URL}/api/hikvision/commands/${command.id}`,
                { status: 'completed', result: `Employee deleted from device successfully` },
                { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, validateStatus: () => true }
            );

            log(`✅ Command ${command.id} completed successfully`, 'SUCCESS');
        } else {
            throw new Error(`Device returned status: ${deleteResponse.status}`);
        }
    } catch (error) {
        log(`❌ Failed to delete employee ${command.employee_no}: ${error.message}`, 'ERROR');
        throw error;
    }
}

async function processEnrollFingerprint(command) {
    log(`Creating employee ${command.employee_no} on device...`);
    const userBody = {
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
    };

    const createResponse = await digestAuth.request(
        'POST',
        `http://${DEVICE_IP}/ISAPI/AccessControl/UserInfo/Record?format=json`,
        JSON.stringify(userBody), 'application/json'
    );

    if (createResponse.status === 200) {
        log(`✅ Employee ${command.employee_no} created on device`, 'SUCCESS');
    } else {
        log(`Employee ${command.employee_no} already exists on device (${createResponse.status}), continuing...`, 'INFO');
    }

    log(`Triggering fingerprint scanner for ${command.employee_no}...`);
    log('⏳ Waiting for employee to place finger (30 seconds timeout)...');

    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<CaptureFingerPrintCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
        '<fingerNo>1</fingerNo><readerID>1</readerID>' +
        '<cancelFlag>false</cancelFlag><collectingPhases>1</collectingPhases>' +
        '</CaptureFingerPrintCond>';

    const captureResponse = await digestAuth.request(
        'POST',
        `http://${DEVICE_IP}/ISAPI/AccessControl/CaptureFingerPrint`,
        xml, 'application/xml', 35000
    );

    if (captureResponse.status !== 200) {
        throw new Error(`Failed to capture fingerprint: ${captureResponse.status}`);
    }

    log(`✅ Fingerprint captured for ${command.employee_no}`, 'SUCCESS');

    const parser = new xml2js.Parser();
    const xmlResult = await parser.parseStringPromise(captureResponse.data);
    const fingerData = xmlResult?.CaptureFingerPrint?.fingerData?.[0] || '';
    const quality = xmlResult?.CaptureFingerPrint?.fingerPrintQuality?.[0] || 0;

    log(`Fingerprint quality: ${quality}`);
    if (!fingerData) throw new Error('No fingerprint data received from device');

    log(`Storing fingerprint for ${command.employee_no}...`);
    const fingerprintBody = {
        FingerPrintCfg: {
            employeeNo: command.employee_no,
            fingerPrintID: 1,
            fingerData: fingerData,
            fingerType: 'normalFP',
            enableCardReader: [1]
        }
    };

    const storeResponse = await digestAuth.request(
        'POST',
        `http://${DEVICE_IP}/ISAPI/AccessControl/FingerPrint/SetUp?format=json`,
        JSON.stringify(fingerprintBody), 'application/json'
    );

    if (storeResponse.status !== 200) {
        throw new Error(`Failed to store fingerprint: ${storeResponse.status}`);
    }

    log(`✅ Fingerprint stored for ${command.employee_no}`, 'SUCCESS');

    await axios.put(
        `${LARAVEL_URL}/api/hikvision/commands/${command.id}`,
        { status: 'completed', result: `Fingerprint enrolled successfully. Quality: ${quality}` },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, validateStatus: () => true }
    );

    log(`✅ Command ${command.id} completed successfully`, 'SUCCESS');
}

async function syncAttendanceToLaravel() {
    log('Starting attendance sync to Laravel...');

    try {
        // Capture sync start time BEFORE any async operations
        const syncStartedAt = new Date();

        // PKT is UTC+5, device stores time in PKT
        // We need to send startTime in PKT format to device
        const PKT_OFFSET = 5 * 60 * 60 * 1000; // 5 hours in ms

        let syncFromPKT;
        if (lastSyncTime) {
            syncFromPKT = new Date(lastSyncTime.getTime());
        } else {
            // Start of today in PKT
            const nowPKT = new Date(syncStartedAt.getTime() + PKT_OFFSET);
            nowPKT.setUTCHours(0, 0, 0, 0);
            syncFromPKT = new Date(nowPKT.getTime() - PKT_OFFSET);
        }

        // End of today in PKT
        const nowPKT = new Date(syncStartedAt.getTime() + PKT_OFFSET);
        nowPKT.setUTCHours(23, 59, 59, 999);
        const endOfDayPKT = new Date(nowPKT.getTime() - PKT_OFFSET);

        const startTime = syncFromPKT.toISOString().replace(/\.\d{3}Z$/, '');
        const endTime = endOfDayPKT.toISOString().replace(/\.\d{3}Z$/, '');

        log(`Syncing punches from ${startTime} to ${endTime}`);

        let allPunches = [];
        let searchResultPosition = 0;
        let hasMore = true;

        while (hasMore) {
            const randomId = crypto.randomBytes(8).toString('hex');
            const body = {
                AcsEventCond: {
                    searchID: randomId,
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
                JSON.stringify(body), 'application/json'
            );

            if (response.status === 200) {
                const data = response.data;
                const events = data.AcsEvent?.InfoList || [];

                if (Array.isArray(events) && events.length > 0) {
                    events.forEach(event => {
                        if (event.employeeNoString) {
                            // Device returns time with +05:00 timezone, keep it as-is
                            allPunches.push({
                                employeeNo: event.employeeNoString,
                                time: event.time,
                                type: 'PUNCH',
                                serialNo: event.serialNo
                            });
                        }
                    });

                    searchResultPosition += events.length;
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
            const laravelResponse = await axios.post(
                `${LARAVEL_URL}/api/attendance/sync`,
                { punches: allPunches },
                {
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    validateStatus: () => true
                }
            );

            if (laravelResponse.status === 200) {
                const result = laravelResponse.data;
                log(`✅ Attendance sync complete: ${result.clocked_in || 0} clocked in, ${result.clocked_out || 0} clocked out, ${result.updated || 0} updated`, 'SUCCESS');
                if (result.errors && result.errors.length > 0) {
                    result.errors.forEach(err => log(`Error: ${JSON.stringify(err)}`, 'WARN'));
                }
            } else {
                log(`Failed to sync to Laravel: ${laravelResponse.status} - ${JSON.stringify(laravelResponse.data)}`, 'ERROR');
            }
        } else {
            log('No new attendance records to sync');
        }

        // Always update lastSyncTime to syncStartedAt (UTC)
        lastSyncTime = syncStartedAt;
        log(`Next sync will fetch punches after: ${lastSyncTime.toISOString()} UTC`);

    } catch (error) {
        log(`Attendance sync error: ${error.message}`, 'ERROR');
        if (error.response) {
            log(`Response: ${JSON.stringify(error.response.data)}`, 'ERROR');
        }
    }
}

async function main() {
    log('=================================================');
    log('Hikvision Middleware Service Starting...');
    log('=================================================');
    log(`Device IP: ${DEVICE_IP}`);
    log(`Laravel URL: ${LARAVEL_URL}`);
    log('=================================================');

    const deviceOk = await testDeviceConnection();
    const laravelOk = await testLaravelConnection();

    if (!deviceOk) log('⚠️  Device connection failed. Will retry...', 'WARN');
    if (!laravelOk) log('⚠️  Laravel connection failed. Will retry...', 'WARN');

    log('Scheduling command check every 2 seconds...');
    setInterval(checkPendingCommands, 2000);
    setTimeout(checkPendingCommands, 3000);

    log('Scheduling attendance sync every 10 seconds...');
    setInterval(syncAttendanceToLaravel, 10000);

    log('✅ Middleware service is running!', 'SUCCESS');
    log('Press Ctrl+C to stop');
}

process.on('SIGINT', () => { log('Shutting down middleware service...'); process.exit(0); });
process.on('SIGTERM', () => { log('Shutting down middleware service...'); process.exit(0); });

main().catch(error => { log(`Fatal error: ${error.message}`, 'ERROR'); process.exit(1); });