'use strict';
/**
 * U5 Access Control / Face Recognition Machine -- HTTP Adapter
 *
 * Self-contained module. No imports from the rest of the backend.
 * Copy this folder (hardware/u5/) into any Node.js project; inject config via constructor.
 *
 * Confirmed against firmware V3.0-20240912 (Mongoose/6.18 single-connection HTTP server).
 * Response format: {"result": 0, "message": "...", "data": ...}  (result=0 means OK)
 * Exception: /insertEmployee returns {"code": 200}
 *
 * IMPORTANT: The device HTTP stack is single-threaded -- call endpoints serially.
 */

const U5_CODE_OK        = 200;
const U5_CODE_DUPLICATE = 12;  // face too similar to an existing enrolled person

class U5Adapter {
  /**
   * @param {{ ip: string, port?: number, password?: string, username?: string, timeoutMs?: number }} cfg
   */
  constructor(cfg) {
    this._base     = 'http://' + cfg.ip + ':' + (cfg.port || 80);
    this._password = cfg.password  || '123456';
    this._username = cfg.username  || 'admin';
    this._timeout  = cfg.timeoutMs || 15000;
  }

  async _post(endpoint, body) {
    const res = await fetch(this._base + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(this._timeout),
    });
    if (!res.ok) throw new Error('U5 HTTP ' + res.status + ' from ' + endpoint);
    return res.json();
  }

  // Verify device is reachable and read firmware/hardware info.
  // POST /getDeviceVersion {"password":"..."}
  async getDeviceVersion() {
    try {
      const data = await this._post('/getDeviceVersion', { password: this._password });
      if (data.result !== 0 || !data.data) {
        return { success: false, message: 'Device returned result ' + data.result };
      }
      return {
        success: true,
        info: {
          sn:              data.data.sn,
          deviceName:      data.data.device_name,
          firmwareVersion: data.data.firmware_version,
          faceAlgVersion:  data.data.face_recg_alg_version,
          mac:             data.data.mac,
        },
      };
    } catch (err) {
      return { success: false, message: err.message || 'Network error' };
    }
  }

  // Login to the device web UI -- verifies credentials. Use as first step when onboarding.
  // POST /deviceLogin {"username":"admin","password":"..."}
  async deviceLogin() {
    try {
      const data = await this._post('/deviceLogin', {
        username: this._username,
        password: this._password,
      });
      return data.result === 0
        ? { success: true }
        : { success: false, code: data.result, message: data.message || ('Login failed (result ' + data.result + ')') };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error' };
    }
  }

  // Read current cloud server / MQTT settings from the device. set:0 = READ.
  async getServerSettings() {
    try {
      const data = await this._post('/serverSetting', { password: this._password, set: 0 });
      return {
        success: true,
        settings: {
          cloudServerAddress:    data.cloudserver_address     || '',
          cloudServerPollingSec: data.cloudserver_pollingtime || 10,
          protocolType:          data.protocol_type           || 0,
          mqttAppAddress:        data.mqtt_app_address        || '',
          mqttRegisterAddress:   data.mqtt_register_address   || '',
          thirdPartyAddress:     data.third_ip_ddr            || '',
          thirdPartyEnabled:     (data.third_ip || 0) === 1,
        },
      };
    } catch (err) {
      return { success: false, message: err.message || 'Network error' };
    }
  }

  // Point the device at our server. Reads current settings first and merges. set:1 = WRITE.
  async setServerSettings(settings) {
    try {
      const current = await this.getServerSettings();
      const merged  = current.success ? current.settings : {};
      const data    = await this._post('/serverSetting', {
        password:                this._password,
        set:                     1,
        cloudserver_address:     settings.cloudServerAddress    || merged.cloudServerAddress    || 'http://',
        cloudserver_pollingtime: settings.cloudServerPollingSec || merged.cloudServerPollingSec || 10,
        protocol_type:           settings.protocolType          || merged.protocolType          || 0,
        mqtt_app_address:        settings.mqttAppAddress        || merged.mqttAppAddress        || '',
        mqtt_register_address:   settings.mqttRegisterAddress   || merged.mqttRegisterAddress   || '',
        third_ip_ddr:            settings.thirdPartyAddress     || merged.thirdPartyAddress     || '',
        third_ip:               (settings.thirdPartyEnabled     || merged.thirdPartyEnabled)    ? 1 : 0,
      });
      return data.result === 0
        ? { success: true }
        : { success: false, code: data.result, message: data.message || ('serverSetting failed (result ' + data.result + ')') };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error' };
    }
  }

  /**
   * Enroll a face on the device.
   *   opts.idNumber   -- unique ID on the machine (use emp_code)
   *   opts.name       -- display name, max 10 chars
   *   opts.picLarge   -- full data URL: "data:image/jpeg;base64,..."
   *   opts.cardNumber -- optional RFID card to bind
   */
  async enrollFace(opts) {
    try {
      const data = await this._post('/insertEmployee', {
        password:           this._password,
        name:               opts.name.slice(0, 10),
        id_number:          opts.idNumber,
        access_card_number: opts.cardNumber || '',
        pass_date:          '0',
        pass_time:          '0',
        pic_large:          opts.picLarge,
      });
      if (data.code === U5_CODE_OK)        return Object.assign({ success: true }, data.userid ? { userId: data.userid } : {});
      if (data.code === U5_CODE_DUPLICATE) return { success: false, code: 12, message: 'Face already enrolled or too similar -- use a different/clearer photo' };
      return { success: false, code: data.code, message: 'U5 enrollment rejected (code ' + data.code + ')' };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error reaching U5' };
    }
  }

  // Fetch all enrolled employees from the device.
  async getEmployeeList() {
    try {
      const data = await this._post('/getEmployeeList', { password: this._password });
      const ok = data.result === 0 || data.code === U5_CODE_OK ||
                 (data.result === undefined && data.code === undefined);
      if (!ok) return { success: false, code: data.result || data.code || -1, message: 'U5 list failed' };
      return {
        success: true,
        data: (data.data || []).map(function(e) {
          const out = { userId: e.userid, name: e.name };
          if (e.id_number !== undefined) out.id_number = e.id_number;
          if (e.pic_large !== undefined) out.pic_large = e.pic_large;
          return out;
        }),
      };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error reaching U5' };
    }
  }

  // Delete an enrolled person by machine-assigned userId.
  // To delete by id_number (emp_code): call getEmployeeList first to resolve userId.
  async deleteEmployee(userId) {
    try {
      const data = await this._post('/deleteEmployee', { password: this._password, userId });
      const ok = data.result === 0 || data.code === U5_CODE_OK;
      return ok
        ? { success: true }
        : { success: false, code: data.result || data.code || -1, message: data.message || 'U5 delete failed' };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error reaching U5' };
    }
  }

  /**
   * Fetch punch/attendance records from the device via /getWorkNoteList.
   *
   * Safety: pic_large is stripped from every row -- the raw base64 can exceed 300 KB per row
   * and locks the Mongoose/6.18 single-connection HTTP server.
   *
   * @param {string} [afterTime]  ISO string -- only returns records newer than this timestamp.
   */
  async getAttendanceLogs(afterTime) {
    const cutoff = afterTime ? new Date(afterTime).getTime() : 0;
    try {
      const data = await this._post('/getWorkNoteList', { password: this._password, type: 2 });
      const failed = (data.result !== undefined && data.result !== 0) ||
                     (data.code   !== undefined && data.code   !== U5_CODE_OK);
      if (failed) return { success: false, code: data.result || data.code || -1, message: 'U5 attendance fetch failed' };

      const rows = (data.data || [])
        .filter(function(row) { return !cutoff || new Date(row.checkin_time).getTime() > cutoff; })
        .map(function(row) {
          const out = {
            userId:       row.userid || row.userId || '',
            checkin_time: row.checkin_time,
          };
          if (row.ispass    !== undefined) out.ispass    = row.ispass;
          if (row.id_number !== undefined) out.id_number = row.id_number;
          if (row.name      !== undefined) out.name      = row.name;
          if (row.temp      !== undefined) out.temp      = row.temp;
          // pic_large intentionally stripped to avoid locking the device
          return out;
        });

      return { success: true, data: rows };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error reaching U5' };
    }
  }

  // Trigger the door relay -- manual unlock from the operator console.
  async openDoor() {
    try {
      const data = await this._post('/openDoor', { password: this._password });
      const ok = data.result === 0 || data.code === U5_CODE_OK;
      return ok
        ? { success: true }
        : { success: false, code: data.result || data.code || -1, message: data.message || 'Door open rejected by device' };
    } catch (err) {
      return { success: false, code: 0, message: err.message || 'Network error reaching U5' };
    }
  }

  // Quick reachability check -- returns true if device responds.
  async ping() {
    try {
      return (await this.getDeviceVersion()).success;
    } catch {
      return false;
    }
  }

  /**
   * Full onboarding sequence for a new device:
   *  1. deviceLogin       -- confirm credentials work
   *  2. getDeviceVersion  -- read SN / firmware
   *  3. setServerSettings -- point device at our server
   */
  async onboard(ourServerUrl) {
    const login = await this.deviceLogin();
    if (!login.success) return { success: false, message: 'Login failed: ' + login.message };

    const version = await this.getDeviceVersion();
    if (!version.success) return { success: false, message: 'getDeviceVersion failed: ' + version.message };

    const cfg = await this.setServerSettings({ cloudServerAddress: ourServerUrl });
    if (!cfg.success) return { success: false, message: 'serverSetting failed: ' + cfg.message };

    return { success: true, info: version.info };
  }
}

module.exports = { U5Adapter };