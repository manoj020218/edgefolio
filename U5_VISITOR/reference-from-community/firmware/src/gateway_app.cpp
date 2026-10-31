#include "GatewayApp.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_mac.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <lwip/inet.h>
#include <lwip/sockets.h>
#include <mbedtls/sha256.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <vector>

#include "BootstrapConfig.h"

namespace gateway {
namespace {

constexpr char kFirmwareVersion[] = "1.0.0";
constexpr char kDeviceModel[] = "u5-gateway";
constexpr uint32_t kSerialBaudRate = 115200;
constexpr uint32_t kLoopDelayMs = 50;
constexpr uint32_t kWifiRetryMs = 10000;
constexpr uint32_t kWifiScanCacheMs = 30000;
constexpr uint32_t kDiscoveryCacheMs = 30000;
constexpr uint32_t kDiscoveryConnectTimeoutMs = 220;
constexpr uint32_t kPortalShutdownDelayMs = 1500;
constexpr uint32_t kMinPollMs = 5000;
constexpr uint32_t kDefaultPollMs = 15000;
constexpr uint32_t kHttpTimeoutMs = 15000;
constexpr uint32_t kBackendHttpTimeoutMs = 20000;
constexpr uint32_t kHeartbeatMs = 10UL * 60UL * 1000UL;
constexpr uint32_t kFirmwareCheckMs = 24UL * 60UL * 60UL * 1000UL;
constexpr uint32_t kLogicWatchdogMs = 60UL * 60UL * 1000UL;
constexpr uint32_t kButtonHoldMs = 10000;
constexpr uint32_t kLedSlowBlinkMs = 800;
constexpr uint32_t kLedFastBlinkMs = 180;
constexpr size_t kMaxDevices = 6;
constexpr size_t kPushBatchSize = 25;
constexpr uint16_t kDnsPort = 53;
constexpr uint16_t kHttpPort = 80;
constexpr uint16_t kBootButtonPin = 0;
constexpr char kGatewayNs[] = "gateway";
constexpr char kDefaultPushBaseUrl[] = "http://community.iotsoft.in/api/devices/push";
constexpr char kDefaultPhotoBaseUrl[] = "http://community.iotsoft.in/api/devices/photo";
constexpr char kVerifyBaseUrl[] = "https://community.iotsoft.in/api/devices/verify";
constexpr char kHeartbeatBaseUrl[] = "https://community.iotsoft.in/api/devices/heartbeat";
constexpr char kLatestFirmwareUrl[] = "https://community.iotsoft.in/api/devices/firmware/u5-gateway/latest";
constexpr char kAdminUsername[] = "admin";

#if defined(LED_BUILTIN)
constexpr int kStatusLedPin = LED_BUILTIN;
#else
constexpr int kStatusLedPin = -1;
#endif

enum class LedMode { Off, Solid, SlowBlink, FastBlink };

struct DeviceSlotConfig {
  bool enabled = false;
  String label;
  String u5Ip;
  String u5Password = "123456";
  String pushBaseUrl = kDefaultPushBaseUrl;
  String apiKey;
  uint32_t pollIntervalMs = kDefaultPollMs;
  uint64_t lastCheckinUnix = 0;
  uint32_t nextPollMs = 0;
};

struct WorkNoteRecord {
  String userid;
  String name;
  String checkinTime;
  String idNumber;
  int ispass = 0;
  uint64_t checkinUnix = 0;
};

struct PhotoRequest {
  String requestId;
  String deviceExternalUserId;
  String checkinTime;

  bool isValid() const { return !requestId.isEmpty() && !deviceExternalUserId.isEmpty() && !checkinTime.isEmpty(); }
};

struct PushResult {
  bool success = false;
  int statusCode = 0;
  size_t received = 0;
  String warning;
  PhotoRequest photoRequest;
};

struct DiscoveredDevice {
  String ip;
  String sn;
  String deviceName;
  String firmwareVersion;
  String mac;
  bool needsPassword = false;
};

struct WifiScanEntry {
  String ssid;
  int32_t rssi = 0;
  uint8_t encryption = 0;
  bool hidden = false;
};

struct VerifyResult {
  bool success = false;
  String deviceName;
  String societyName;
  String error;
};

struct FirmwareRelease {
  bool available = false;
  String version;
  String url;
  String sha256;
  String releaseNotes;
  String error;
};

WebServer gWebServer(80);
DNSServer gDnsServer;
String gWifiSsid;
String gWifiPassword;
String gPortalSsid;
String gPortalPassword;
String gSerialLine;
String gLastResetReason;
std::array<DeviceSlotConfig, kMaxDevices> gDevices;
std::vector<DiscoveredDevice> gDiscoveryResults;
std::vector<WifiScanEntry> gWifiScanResults;
uint32_t gWifiScanFetchedMs = 0;
uint32_t gDiscoveryFetchedMs = 0;
uint32_t gNextWifiAttemptMs = 0;
uint32_t gPendingApShutdownMs = 0;
uint32_t gNextHeartbeatMs = 0;
uint32_t gNextFirmwareCheckMs = 0;
uint32_t gLastU5SuccessMs = 0;
uint32_t gLastBackendSuccessMs = 0;
wl_status_t gLastWifiStatus = WL_IDLE_STATUS;
bool gSetupComplete = false;
bool gPortalForced = false;
bool gAutoUpdate = true;
bool gApStarted = false;
bool gDnsStarted = false;
bool gOtaInProgress = false;
bool gPendingOtaRequest = false;
bool gRollbackMarkedValid = false;
bool gButtonHandled = false;
uint32_t gButtonDownMs = 0;
LedMode gLedMode = LedMode::Off;
bool gLedOn = false;
FirmwareRelease gCachedFirmwareRelease;

String deviceNamespace(const size_t index) {
  return String("u5_") + String(static_cast<unsigned>(index));
}

bool isDue(const uint32_t now, const uint32_t dueAt) {
  return dueAt == 0 || static_cast<int32_t>(now - dueAt) >= 0;
}

uint32_t clampPollMs(const uint32_t value) {
  return value < kMinPollMs ? kMinPollMs : value;
}

String toStringU64(const uint64_t value) {
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "%llu", static_cast<unsigned long long>(value));
  return String(buffer);
}

uint64_t parseU64(const String& value) {
  return static_cast<uint64_t>(strtoull(value.c_str(), nullptr, 10));
}

String htmlEscape(String value) {
  value.replace("&", "&amp;");
  value.replace("<", "&lt;");
  value.replace(">", "&gt;");
  value.replace("\"", "&quot;");
  value.replace("'", "&#39;");
  return value;
}

String redact(const String& value) {
  if (value.isEmpty()) {
    return "<empty>";
  }
  if (value.length() <= 8) {
    return "********";
  }
  return value.substring(0, 4) + "..." + value.substring(value.length() - 4);
}

String normalizeHost(String value) {
  value.trim();
  if (value.startsWith("http://")) {
    value.remove(0, 7);
  } else if (value.startsWith("https://")) {
    value.remove(0, 8);
  }
  while (value.endsWith("/")) {
    value.remove(value.length() - 1);
  }
  return value;
}

String normalizeBaseUrl(String value) {
  value.trim();
  while (value.endsWith("/")) {
    value.remove(value.length() - 1);
  }
  return value;
}

String slugify(String value) {
  value.trim();
  String out;
  out.reserve(value.length());
  bool lastHyphen = false;
  for (size_t i = 0; i < value.length(); ++i) {
    const char ch = static_cast<char>(std::tolower(static_cast<unsigned char>(value[i])));
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
      out += ch;
      lastHyphen = false;
    } else if (!lastHyphen) {
      out += '-';
      lastHyphen = true;
    }
  }
  while (out.startsWith("-")) {
    out.remove(0, 1);
  }
  while (out.endsWith("-")) {
    out.remove(out.length() - 1);
  }
  if (out.isEmpty()) {
    out = "u5-slot";
  }
  return out;
}

String makeSetupPasswordSuffix() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "jenix%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buffer);
}

String buildPortalSsid() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buffer[32];
  snprintf(buffer, sizeof(buffer), "Jenix-U5-Setup-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buffer);
}

String composeU5Url(const DeviceSlotConfig& device) {
  return "http://" + normalizeHost(device.u5Ip) + "/getWorkNoteList";
}

String composeDeviceVersionUrl(const String& host) {
  return "http://" + normalizeHost(host) + "/getDeviceVersion";
}

String composeDeviceLoginUrl(const String& host) {
  return "http://" + normalizeHost(host) + "/deviceLogin";
}

String composePushUrl(const DeviceSlotConfig& device) {
  const String base = normalizeBaseUrl(device.pushBaseUrl);
  if (base.isEmpty()) {
    return "";
  }
  if (device.apiKey.isEmpty()) {
    return base;
  }
  return base + "/" + device.apiKey;
}

String composePhotoUrl(const DeviceSlotConfig& device) {
  if (device.apiKey.isEmpty()) {
    return "";
  }
  return String(kDefaultPhotoBaseUrl) + "/" + device.apiKey;
}

String composeVerifyUrl(const String& apiKey) {
  return String(kVerifyBaseUrl) + "/" + apiKey;
}

String composeHeartbeatUrl(const DeviceSlotConfig& device) {
  if (device.apiKey.isEmpty()) {
    return "";
  }
  return String(kHeartbeatBaseUrl) + "/" + device.apiKey;
}

int compareSemver(const String& left, const String& right) {
  int la = 0, lb = 0, lc = 0;
  int ra = 0, rb = 0, rc = 0;
  sscanf(left.c_str(), "%d.%d.%d", &la, &lb, &lc);
  sscanf(right.c_str(), "%d.%d.%d", &ra, &rb, &rc);
  if (la != ra) {
    return la < ra ? -1 : 1;
  }
  if (lb != rb) {
    return lb < rb ? -1 : 1;
  }
  if (lc != rc) {
    return lc < rc ? -1 : 1;
  }
  return 0;
}

uint32_t ipToU32(const IPAddress& ip) {
  return (static_cast<uint32_t>(ip[0]) << 24) | (static_cast<uint32_t>(ip[1]) << 16) |
         (static_cast<uint32_t>(ip[2]) << 8) | static_cast<uint32_t>(ip[3]);
}

IPAddress u32ToIp(const uint32_t value) {
  return IPAddress((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
}

int64_t daysFromCivil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(year - era * 400);
  const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

uint64_t parseCheckinUnix(const String& checkinTime) {
  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (sscanf(checkinTime.c_str(), "%d-%d-%d %d:%d:%d", &year, &month, &day, &hour, &minute, &second) != 6) {
    return 0;
  }
  const int64_t days = daysFromCivil(year, static_cast<unsigned>(month), static_cast<unsigned>(day));
  if (days < 0) {
    return 0;
  }
  return static_cast<uint64_t>(days) * 86400ULL + static_cast<uint64_t>(hour) * 3600ULL +
         static_cast<uint64_t>(minute) * 60ULL + static_cast<uint64_t>(second);
}

String wifiStatusText(const wl_status_t status) {
  switch (status) {
    case WL_CONNECTED:
      return "connected";
    case WL_NO_SSID_AVAIL:
      return "ssid-not-found";
    case WL_CONNECT_FAILED:
      return "connect-failed";
    case WL_CONNECTION_LOST:
      return "connection-lost";
    case WL_DISCONNECTED:
      return "disconnected";
    case WL_IDLE_STATUS:
      return "idle";
    default:
      return String("status-") + String(static_cast<int>(status));
  }
}

String resetReasonToString(const esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON_RESET";
    case ESP_RST_EXT: return "EXTERNAL_RESET";
    case ESP_RST_SW: return "SW_RESET";
    case ESP_RST_PANIC: return "PANIC_RESET";
    case ESP_RST_INT_WDT: return "INT_WDT_RESET";
    case ESP_RST_TASK_WDT: return "TASK_WDT_RESET";
    case ESP_RST_WDT: return "WDT_RESET";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP_RESET";
    case ESP_RST_BROWNOUT: return "BROWNOUT_RESET";
    case ESP_RST_SDIO: return "SDIO_RESET";
    default: return "UNKNOWN_RESET";
  }
}

bool hasConfiguredWifi() {
  return !gWifiSsid.isEmpty();
}

bool deviceReady(const DeviceSlotConfig& device) {
  return device.enabled && !device.u5Ip.isEmpty() && !device.pushBaseUrl.isEmpty() && !device.apiKey.isEmpty();
}

bool hasAnyReadyDevice() {
  for (const DeviceSlotConfig& device : gDevices) {
    if (deviceReady(device)) {
      return true;
    }
  }
  return false;
}

bool shouldMarkSetupComplete() {
  return hasConfiguredWifi() && hasAnyReadyDevice();
}

bool shouldKeepApRunning() {
  return !gSetupComplete || gPortalForced;
}

bool putStringIfChanged(Preferences& prefs, const char* key, const String& value) {
  const String current = prefs.getString(key, "");
  if (current == value) {
    return false;
  }
  prefs.putString(key, value);
  return true;
}

bool putBoolIfChanged(Preferences& prefs, const char* key, const bool value) {
  const bool current = prefs.getBool(key, !value);
  if (current == value) {
    return false;
  }
  prefs.putBool(key, value);
  return true;
}

bool putUIntIfChanged(Preferences& prefs, const char* key, const uint32_t value) {
  const uint32_t current = prefs.getUInt(key, value == 0 ? 1U : 0U);
  if (current == value) {
    return false;
  }
  prefs.putUInt(key, value);
  return true;
}

void saveGatewaySettings() {
  Preferences prefs;
  if (!prefs.begin(kGatewayNs, false)) {
    return;
  }
  putStringIfChanged(prefs, "wifi_ssid", gWifiSsid);
  putStringIfChanged(prefs, "wifi_pass", gWifiPassword);
  putBoolIfChanged(prefs, "auto_update", gAutoUpdate);
  putBoolIfChanged(prefs, "setup_done", gSetupComplete);
  prefs.end();
}

void saveDeviceConfig(const size_t index, const DeviceSlotConfig& device) {
  Preferences prefs;
  const String ns = deviceNamespace(index);
  if (!prefs.begin(ns.c_str(), false)) {
    return;
  }
  putBoolIfChanged(prefs, "enabled", device.enabled);
  putStringIfChanged(prefs, "label", device.label);
  putStringIfChanged(prefs, "u5_ip", device.u5Ip);
  putStringIfChanged(prefs, "u5_pass", device.u5Password);
  putStringIfChanged(prefs, "push_base", normalizeBaseUrl(device.pushBaseUrl));
  putStringIfChanged(prefs, "api_key", device.apiKey);
  putUIntIfChanged(prefs, "poll_ms", clampPollMs(device.pollIntervalMs));
  putStringIfChanged(prefs, "last_unix", toStringU64(device.lastCheckinUnix));
  prefs.end();
}

void saveLastCheckinUnix(const size_t index, const uint64_t value) {
  if (gDevices[index].lastCheckinUnix == value) {
    return;
  }
  gDevices[index].lastCheckinUnix = value;
  Preferences prefs;
  const String ns = deviceNamespace(index);
  if (!prefs.begin(ns.c_str(), false)) {
    return;
  }
  putStringIfChanged(prefs, "last_unix", toStringU64(value));
  prefs.end();
}

void seedBootstrapIfNeeded() {
  Preferences prefs;
  if (!prefs.begin(kGatewayNs, false)) {
    return;
  }
  const bool seeded = prefs.getBool("seeded", false);
  if (!seeded) {
    prefs.putString("wifi_ssid", kBootstrapWifiSsid);
    prefs.putString("wifi_pass", kBootstrapWifiPassword);
    prefs.putBool("auto_update", true);
    prefs.putBool("setup_done", false);
    prefs.putBool("seeded", true);
  }
  prefs.end();

  const size_t count = std::min(kBootstrapDeviceCount, kMaxDevices);
  for (size_t index = 0; index < count; ++index) {
    Preferences devicePrefs;
    const String ns = deviceNamespace(index);
    if (!devicePrefs.begin(ns.c_str(), false)) {
      continue;
    }
    if (!devicePrefs.getBool("seeded", false)) {
      devicePrefs.putBool("enabled", kBootstrapDevices[index].enabled);
      devicePrefs.putString("label", kBootstrapDevices[index].label);
      devicePrefs.putString("u5_ip", kBootstrapDevices[index].u5Ip);
      devicePrefs.putString("u5_pass", kBootstrapDevices[index].u5Password);
      devicePrefs.putString("push_base", kBootstrapDevices[index].pushBaseUrl);
      devicePrefs.putString("api_key", kBootstrapDevices[index].apiKey);
      devicePrefs.putUInt("poll_ms", clampPollMs(kBootstrapDevices[index].pollIntervalMs));
      devicePrefs.putString("last_unix", "0");
      devicePrefs.putBool("seeded", true);
    }
    devicePrefs.end();
  }
}

void loadConfig() {
  Preferences prefs;
  if (prefs.begin(kGatewayNs, true)) {
    gWifiSsid = prefs.getString("wifi_ssid", "");
    gWifiPassword = prefs.getString("wifi_pass", "");
    gAutoUpdate = prefs.getBool("auto_update", true);
    gSetupComplete = prefs.getBool("setup_done", false);
    prefs.end();
  }

  for (size_t index = 0; index < kMaxDevices; ++index) {
    Preferences devicePrefs;
    const String ns = deviceNamespace(index);
    if (!devicePrefs.begin(ns.c_str(), true)) {
      continue;
    }
    DeviceSlotConfig& device = gDevices[index];
    device.enabled = devicePrefs.getBool("enabled", false);
    device.label = devicePrefs.getString("label", String("u5-slot-") + String(static_cast<unsigned>(index)));
    device.u5Ip = devicePrefs.getString("u5_ip", "");
    device.u5Password = devicePrefs.getString("u5_pass", "123456");
    device.pushBaseUrl = devicePrefs.getString("push_base", kDefaultPushBaseUrl);
    device.apiKey = devicePrefs.getString("api_key", "");
    device.pollIntervalMs = clampPollMs(devicePrefs.getUInt("poll_ms", kDefaultPollMs));
    device.lastCheckinUnix = parseU64(devicePrefs.getString("last_unix", "0"));
    device.nextPollMs = millis() + 1000U + static_cast<uint32_t>(index) * 500U;
    devicePrefs.end();
  }
}

void refreshSetupCompleteFlag() {
  const bool computed = shouldMarkSetupComplete();
  if (computed != gSetupComplete) {
    gSetupComplete = computed;
    saveGatewaySettings();
  }
}

String stationUrl() {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }
  return "http://" + WiFi.localIP().toString() + "/";
}

void startDnsServer() {
  if (gDnsStarted) {
    return;
  }
  gDnsServer.start(kDnsPort, "*", WiFi.softAPIP());
  gDnsStarted = true;
}

void stopDnsServer() {
  if (!gDnsStarted) {
    return;
  }
  gDnsServer.stop();
  gDnsStarted = false;
}

void startSetupAp() {
  if (gApStarted) {
    startDnsServer();
    return;
  }
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.mode(hasConfiguredWifi() ? WIFI_AP_STA : WIFI_AP);
  if (!WiFi.softAP(gPortalSsid.c_str(), gPortalPassword.c_str())) {
    Serial.println("[ap] softAP start failed");
    return;
  }
  gApStarted = true;
  startDnsServer();
  Serial.printf("[ap] ssid=%s password=%s ip=%s\n", gPortalSsid.c_str(), gPortalPassword.c_str(),
                WiFi.softAPIP().toString().c_str());
}

void stopSetupAp() {
  if (!gApStarted) {
    stopDnsServer();
    return;
  }
  stopDnsServer();
  WiFi.softAPdisconnect(true);
  gApStarted = false;
  WiFi.mode(hasConfiguredWifi() ? WIFI_STA : WIFI_OFF);
  Serial.println("[ap] stopped");
}

void scheduleApShutdown() {
  gPendingApShutdownMs = millis() + kPortalShutdownDelayMs;
}

void ensurePortalState() {
  if (shouldKeepApRunning()) {
    if (!gApStarted) {
      startSetupAp();
    }
  } else if (gApStarted && WiFi.status() == WL_CONNECTED) {
    scheduleApShutdown();
  }
}

void servicePendingApShutdown() {
  if (gPendingApShutdownMs == 0) {
    return;
  }
  if (!isDue(millis(), gPendingApShutdownMs)) {
    return;
  }
  gPendingApShutdownMs = 0;
  if (gApStarted && WiFi.status() == WL_CONNECTED && !shouldKeepApRunning()) {
    stopSetupAp();
  }
}

void scheduleAllDevicesNow() {
  for (DeviceSlotConfig& device : gDevices) {
    device.nextPollMs = 0;
  }
}

void factoryReset() {
  Preferences prefs;
  if (prefs.begin(kGatewayNs, false)) {
    prefs.clear();
    prefs.end();
  }
  for (size_t index = 0; index < kMaxDevices; ++index) {
    Preferences devicePrefs;
    const String ns = deviceNamespace(index);
    if (devicePrefs.begin(ns.c_str(), false)) {
      devicePrefs.clear();
      devicePrefs.end();
    }
    gDevices[index] = DeviceSlotConfig{};
  }

  gWifiSsid = "";
  gWifiPassword = "";
  gAutoUpdate = true;
  gSetupComplete = false;
  gPortalForced = true;
  gPendingOtaRequest = false;
  gCachedFirmwareRelease = FirmwareRelease{};
  gDiscoveryResults.clear();
  gWifiScanResults.clear();
  seedBootstrapIfNeeded();
  loadConfig();
  WiFi.disconnect(true, true);
  gNextWifiAttemptMs = 0;
  startSetupAp();
  Serial.println("[cfg] factory reset complete");
}

void printSummary() {
  Serial.println();
  Serial.println("=== Jenix U5 Gateway ===");
  Serial.printf("Firmware: %s\n", kFirmwareVersion);
  Serial.printf("Setup complete: %s\n", gSetupComplete ? "1" : "0");
  Serial.printf("Auto update: %s\n", gAutoUpdate ? "1" : "0");
  Serial.printf("Reset reason: %s\n", gLastResetReason.c_str());
  Serial.printf("AP active: %s\n", gApStarted ? "1" : "0");
  Serial.printf("AP SSID: %s\n", gPortalSsid.c_str());
  Serial.printf("AP password: %s\n", gPortalPassword.c_str());
  Serial.printf("AP IP: %s\n", gApStarted ? WiFi.softAPIP().toString().c_str() : "<inactive>");
  Serial.printf("Wi-Fi SSID: %s\n", gWifiSsid.isEmpty() ? "<empty>" : gWifiSsid.c_str());
  Serial.printf("Wi-Fi password: %s\n", redact(gWifiPassword).c_str());
  Serial.printf("Wi-Fi status: %d (%s)\n", static_cast<int>(WiFi.status()), wifiStatusText(WiFi.status()).c_str());
  Serial.printf("Station IP: %s\n",
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "<disconnected>");
  for (size_t index = 0; index < kMaxDevices; ++index) {
    const DeviceSlotConfig& device = gDevices[index];
    Serial.printf("device.%u enabled=%s label=%s ip=%s api=%s poll=%u last=%s\n",
                  static_cast<unsigned>(index), device.enabled ? "1" : "0", device.label.c_str(),
                  device.u5Ip.c_str(), redact(device.apiKey).c_str(),
                  static_cast<unsigned>(device.pollIntervalMs), toStringU64(device.lastCheckinUnix).c_str());
  }
  Serial.println("========================");
}

void serviceWifi() {
  const wl_status_t status = WiFi.status();
  if (status != gLastWifiStatus) {
    gLastWifiStatus = status;
    if (status == WL_CONNECTED) {
      Serial.printf("[wifi] connected ip=%s rssi=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      if (!shouldKeepApRunning() && gApStarted) {
        scheduleApShutdown();
      }
    } else {
      Serial.printf("[wifi] status=%d (%s)\n", static_cast<int>(status), wifiStatusText(status).c_str());
    }
  }

  if (!hasConfiguredWifi() || status == WL_CONNECTED) {
    return;
  }
  if (!isDue(millis(), gNextWifiAttemptMs)) {
    return;
  }

  Serial.printf("[wifi] connecting to %s\n", gWifiSsid.c_str());
  WiFi.mode(gApStarted ? WIFI_AP_STA : WIFI_STA);
  WiFi.begin(gWifiSsid.c_str(), gWifiPassword.c_str());
  gNextWifiAttemptMs = millis() + kWifiRetryMs;
}

bool fetchFreshRecords(const DeviceSlotConfig& device, std::vector<WorkNoteRecord>& freshRecords, size_t& totalRows) {
  totalRows = 0;
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composeU5Url(device))) {
    return false;
  }
  http.setConnectTimeout(kHttpTimeoutMs);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");

  JsonDocument requestDoc;
  requestDoc["password"] = device.u5Password;
  requestDoc["type"] = 2;
  String requestBody;
  serializeJson(requestDoc, requestBody);
  const int status = http.POST(requestBody);
  if (status != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  JsonDocument filter;
  filter["result"] = true;
  filter["code"] = true;
  filter["data"][0]["userid"] = true;
  filter["data"][0]["name"] = true;
  filter["data"][0]["checkin_time"] = true;
  filter["data"][0]["ispass"] = true;
  filter["data"][0]["id_number"] = true;

  JsonDocument responseDoc;
  const DeserializationError error =
      deserializeJson(responseDoc, http.getStream(), DeserializationOption::Filter(filter));
  if (error) {
    http.end();
    return false;
  }

  if ((responseDoc["result"].is<int>() && responseDoc["result"].as<int>() != 0) ||
      (responseDoc["code"].is<int>() && responseDoc["code"].as<int>() != HTTP_CODE_OK)) {
    http.end();
    return false;
  }

  JsonArray data = responseDoc["data"].as<JsonArray>();
  totalRows = data.isNull() ? 0 : data.size();
  if (!data.isNull()) {
    for (JsonObject row : data) {
      WorkNoteRecord record;
      record.userid = row["userid"] | "";
      record.name = row["name"] | "";
      record.checkinTime = row["checkin_time"] | "";
      record.idNumber = row["id_number"] | "";
      record.ispass = row["ispass"] | 0;
      record.checkinUnix = parseCheckinUnix(record.checkinTime);
      if (record.checkinUnix == 0 || record.checkinUnix <= device.lastCheckinUnix) {
        continue;
      }
      freshRecords.push_back(record);
    }
  }
  http.end();

  std::sort(freshRecords.begin(), freshRecords.end(), [](const WorkNoteRecord& left, const WorkNoteRecord& right) {
    if (left.checkinUnix == right.checkinUnix) {
      return left.userid < right.userid;
    }
    return left.checkinUnix < right.checkinUnix;
  });
  return true;
}

bool parsePushResponse(const String& body, PushResult& result) {
  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    return false;
  }
  result.success = doc["success"] | false;
  JsonObject data = doc["data"].as<JsonObject>();
  if (!data.isNull()) {
    result.received = data["received"] | 0;
    result.warning = data["warning"] | "";
    JsonObject photo = data["photoRequest"].as<JsonObject>();
    if (!photo.isNull()) {
      result.photoRequest.requestId = photo["requestId"] | "";
      result.photoRequest.deviceExternalUserId = photo["deviceExternalUserId"] | "";
      result.photoRequest.checkinTime = photo["checkinTime"] | "";
    }
  }
  return true;
}

bool postPushBatch(const DeviceSlotConfig& device, const std::vector<WorkNoteRecord>& records, const size_t startIndex,
                   const size_t endIndex, PushResult& result) {
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composePushUrl(device))) {
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");

  JsonDocument payloadDoc;
  JsonArray data = payloadDoc["data"].to<JsonArray>();
  for (size_t index = startIndex; index < endIndex; ++index) {
    const WorkNoteRecord& record = records[index];
    JsonObject row = data.add<JsonObject>();
    row["userid"] = record.userid;
    row["name"] = record.name;
    row["checkin_time"] = record.checkinTime;
    row["ispass"] = record.ispass;
    if (!record.idNumber.isEmpty()) {
      row["id_number"] = record.idNumber;
    }
  }

  String requestBody;
  serializeJson(payloadDoc, requestBody);
  const int status = http.POST(requestBody);
  result.statusCode = status;
  const String responseBody = http.getString();
  http.end();
  if (status != HTTP_CODE_OK) {
    return false;
  }
  return parsePushResponse(responseBody, result) && result.success;
}

bool extractMatchingPhotoFromStream(Stream& stream, const String& targetUserId, const String& targetCheckinTime,
                                    String& outPhotoBase64) {
  enum class Phase { SearchDataKey, SearchArrayStart, CaptureObjects };
  Phase phase = Phase::SearchDataKey;
  String recent;
  recent.reserve(16);
  String objectJson;
  bool objectInString = false;
  bool objectEscape = false;
  int braceDepth = 0;
  const uint32_t startMs = millis();

  while (millis() - startMs < kHttpTimeoutMs) {
    while (stream.available() > 0) {
      const char ch = static_cast<char>(stream.read());
      if (phase == Phase::SearchDataKey) {
        recent += ch;
        if (recent.length() > 16) {
          recent.remove(0, recent.length() - 16);
        }
        if (recent.endsWith("\"data\"")) {
          phase = Phase::SearchArrayStart;
        }
        continue;
      }
      if (phase == Phase::SearchArrayStart) {
        if (ch == '[') {
          phase = Phase::CaptureObjects;
        }
        continue;
      }
      if (braceDepth == 0) {
        if (ch == '{') {
          objectJson = "{";
          braceDepth = 1;
          objectInString = false;
          objectEscape = false;
        } else if (ch == ']') {
          return false;
        }
        continue;
      }

      objectJson += ch;
      if (objectEscape) {
        objectEscape = false;
        continue;
      }
      if (ch == '\\') {
        objectEscape = true;
        continue;
      }
      if (ch == '"') {
        objectInString = !objectInString;
        continue;
      }
      if (!objectInString) {
        if (ch == '{') {
          ++braceDepth;
        } else if (ch == '}') {
          --braceDepth;
          if (braceDepth == 0) {
            JsonDocument rowDoc;
            if (deserializeJson(rowDoc, objectJson) == DeserializationError::Ok) {
              const String userid = rowDoc["userid"] | "";
              const String checkinTime = rowDoc["checkin_time"] | "";
              if (userid == targetUserId && checkinTime == targetCheckinTime) {
                outPhotoBase64 = rowDoc["pic_large"] | "";
                return !outPhotoBase64.isEmpty();
              }
            }
            objectJson = "";
          }
        }
      }
    }
    delay(1);
  }
  return false;
}

bool uploadPhotoForRequest(const DeviceSlotConfig& device, const PhotoRequest& request, const String& photoBase64) {
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composePhotoUrl(device))) {
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");

  String body;
  body.reserve(photoBase64.length() + request.requestId.length() + 64);
  body += "{\"requestId\":\"";
  body += request.requestId;
  body += "\",\"photoBase64\":\"";
  body += photoBase64;
  body += "\"}";
  const int status = http.POST(body);
  http.end();
  return status == HTTP_CODE_OK;
}

bool fulfillPhotoRequest(const DeviceSlotConfig& device, const PhotoRequest& request) {
  if (!request.isValid()) {
    return true;
  }

  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composeU5Url(device))) {
    return false;
  }
  http.setConnectTimeout(kHttpTimeoutMs);
  http.setTimeout(kHttpTimeoutMs);
  http.addHeader("Content-Type", "application/json");

  JsonDocument requestDoc;
  requestDoc["password"] = device.u5Password;
  requestDoc["type"] = 2;
  String requestBody;
  serializeJson(requestDoc, requestBody);
  const int status = http.POST(requestBody);
  if (status != HTTP_CODE_OK) {
    http.end();
    return false;
  }

  String photoBase64;
  Stream& stream = http.getStream();
  const bool found = extractMatchingPhotoFromStream(stream, request.deviceExternalUserId, request.checkinTime, photoBase64);
  http.end();
  if (!found) {
    Serial.printf("[photo] no match for %s @ %s\n", request.deviceExternalUserId.c_str(),
                  request.checkinTime.c_str());
    return true;
  }

  const bool uploaded = uploadPhotoForRequest(device, request, photoBase64);
  photoBase64 = "";
  Serial.printf("[photo] upload %s for %s @ %s\n", uploaded ? "ok" : "failed", request.deviceExternalUserId.c_str(),
                request.checkinTime.c_str());
  return uploaded;
}

void pollDevice(const size_t index) {
  DeviceSlotConfig& device = gDevices[index];
  if (!deviceReady(device)) {
    device.nextPollMs = millis() + 5000U;
    return;
  }

  std::vector<WorkNoteRecord> freshRecords;
  size_t totalRows = 0;
  if (!fetchFreshRecords(device, freshRecords, totalRows)) {
    device.nextPollMs = millis() + device.pollIntervalMs;
    Serial.printf("[%s] poll failed\n", device.label.c_str());
    return;
  }
  gLastU5SuccessMs = millis();

  PushResult lastPushResult;
  if (freshRecords.empty()) {
    if (!postPushBatch(device, freshRecords, 0, 0, lastPushResult)) {
      Serial.printf("[%s] empty push failed\n", device.label.c_str());
      device.nextPollMs = millis() + device.pollIntervalMs;
      return;
    }
    Serial.printf("[%s] %u total, no new\n", device.label.c_str(), static_cast<unsigned>(totalRows));
  } else {
    size_t pushed = 0;
    while (pushed < freshRecords.size()) {
      const size_t endIndex = std::min(pushed + kPushBatchSize, freshRecords.size());
      PushResult batchResult;
      if (!postPushBatch(device, freshRecords, pushed, endIndex, batchResult)) {
        Serial.printf("[%s] push failed\n", device.label.c_str());
        device.nextPollMs = millis() + device.pollIntervalMs;
        return;
      }
      saveLastCheckinUnix(index, freshRecords[endIndex - 1].checkinUnix);
      lastPushResult = batchResult;
      pushed = endIndex;
    }
    Serial.printf("[%s] pushed %u record(s)\n", device.label.c_str(), static_cast<unsigned>(freshRecords.size()));
  }

  gLastBackendSuccessMs = millis();
  if (lastPushResult.photoRequest.isValid()) {
    fulfillPhotoRequest(device, lastPushResult.photoRequest);
  }
  device.nextPollMs = millis() + device.pollIntervalMs;
}

void pollDueDevices() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  const uint32_t now = millis();
  for (size_t index = 0; index < kMaxDevices; ++index) {
    if (isDue(now, gDevices[index].nextPollMs)) {
      pollDevice(index);
      gWebServer.handleClient();
    }
  }
}

bool verifyApiKeyRemote(const String& apiKey, VerifyResult& out) {
  if (apiKey.isEmpty()) {
    out.error = "API key is required.";
    return false;
  }
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, composeVerifyUrl(apiKey))) {
    out.error = "Failed to prepare verification request.";
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  const int status = http.GET();
  const String body = http.getString();
  http.end();

  if (status != HTTP_CODE_OK) {
    out.error = status == HTTP_CODE_UNAUTHORIZED ? "API key not recognized." : "Verification request failed.";
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    out.error = "Verification response was not valid JSON.";
    return false;
  }
  JsonObject data = doc["data"].as<JsonObject>();
  if (data.isNull()) {
    out.error = "Verification response missing data.";
    return false;
  }
  out.success = true;
  out.deviceName = data["deviceName"] | "";
  out.societyName = data["societyName"] | "";
  return true;
}

bool postHealthReport(const DeviceSlotConfig& device) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, composeHeartbeatUrl(device))) {
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["firmwareVersion"] = kFirmwareVersion;
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["wifiRssi"] = WiFi.RSSI();
  doc["uptimeSeconds"] = millis() / 1000UL;
  doc["resetReason"] = gLastResetReason;
  String body;
  serializeJson(doc, body);

  const int status = http.POST(body);
  const bool ok = status == HTTP_CODE_OK;
  http.end();
  return ok;
}

void maybeMarkRunningOtaValid() {
  if (gRollbackMarkedValid) {
    return;
  }
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (esp_ota_get_state_partition(running, &state) == ESP_OK && state == ESP_OTA_IMG_PENDING_VERIFY) {
    const esp_err_t err = esp_ota_mark_app_valid_cancel_rollback();
    Serial.printf("[ota] mark-valid err=%d\n", static_cast<int>(err));
  }
  gRollbackMarkedValid = true;
}

void serviceHeartbeat() {
  if (WiFi.status() != WL_CONNECTED || gOtaInProgress) {
    return;
  }
  if (!isDue(millis(), gNextHeartbeatMs)) {
    return;
  }

  bool anyOk = false;
  for (const DeviceSlotConfig& device : gDevices) {
    if (!deviceReady(device)) {
      continue;
    }
    const bool ok = postHealthReport(device);
    Serial.printf("[hb] %s %s\n", device.label.c_str(), ok ? "ok" : "failed");
    anyOk = anyOk || ok;
  }
  if (anyOk) {
    gLastBackendSuccessMs = millis();
    maybeMarkRunningOtaValid();
  }
  gNextHeartbeatMs = millis() + kHeartbeatMs;
}

bool fetchLatestFirmwareRelease(FirmwareRelease& out) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String(kLatestFirmwareUrl))) {
    out.error = "Failed to prepare firmware check.";
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  const int status = http.GET();
  const String body = http.getString();
  http.end();

  if (status == HTTP_CODE_NOT_FOUND) {
    out.available = false;
    out.error = "";
    return true;
  }
  if (status != HTTP_CODE_OK) {
    out.error = "Firmware check failed.";
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    out.error = "Firmware response was not valid JSON.";
    return false;
  }
  JsonObject data = doc["data"].as<JsonObject>();
  if (data.isNull()) {
    out.error = "Firmware response missing data.";
    return false;
  }
  out.available = true;
  out.version = data["version"] | "";
  out.url = data["url"] | "";
  out.sha256 = data["sha256"] | "";
  out.releaseNotes = data["releaseNotes"] | "";
  return true;
}

String bytesToHex(const uint8_t* bytes, const size_t len) {
  static constexpr char kHex[] = "0123456789abcdef";
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out += kHex[(bytes[i] >> 4) & 0x0F];
    out += kHex[bytes[i] & 0x0F];
  }
  return out;
}

bool performOtaUpdate(const FirmwareRelease& release) {
  if (!release.available || release.url.isEmpty() || release.sha256.isEmpty()) {
    return false;
  }
  if (compareSemver(kFirmwareVersion, release.version) >= 0) {
    Serial.printf("[ota] current firmware %s is already >= %s\n", kFirmwareVersion, release.version.c_str());
    return false;
  }

  gOtaInProgress = true;
  Serial.printf("[ota] downloading %s\n", release.url.c_str());
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, release.url)) {
    gOtaInProgress = false;
    return false;
  }
  http.setConnectTimeout(kBackendHttpTimeoutMs);
  http.setTimeout(kBackendHttpTimeoutMs);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  const int status = http.GET();
  if (status != HTTP_CODE_OK) {
    Serial.printf("[ota] GET failed status=%d\n", status);
    http.end();
    gOtaInProgress = false;
    return false;
  }

  const int contentLength = http.getSize();
  if (contentLength <= 0) {
    Serial.println("[ota] invalid content length");
    http.end();
    gOtaInProgress = false;
    return false;
  }

  if (!Update.begin(contentLength)) {
    Serial.printf("[ota] Update.begin failed: %s\n", Update.errorString());
    http.end();
    gOtaInProgress = false;
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts_ret(&sha, 0);

  WiFiClient* stream = http.getStreamPtr();
  std::array<uint8_t, 2048> buffer{};
  size_t totalWritten = 0;
  int remaining = contentLength;

  while (http.connected() && (remaining > 0 || remaining == -1)) {
    const size_t available = stream->available();
    if (available == 0) {
      delay(1);
      continue;
    }
    const size_t toRead = std::min(buffer.size(), available);
    const int readBytes = stream->readBytes(buffer.data(), toRead);
    if (readBytes <= 0) {
      delay(1);
      continue;
    }
    mbedtls_sha256_update_ret(&sha, buffer.data(), static_cast<size_t>(readBytes));
    if (Update.write(buffer.data(), static_cast<size_t>(readBytes)) != static_cast<size_t>(readBytes)) {
      Serial.printf("[ota] Update.write failed: %s\n", Update.errorString());
      Update.abort();
      http.end();
      mbedtls_sha256_free(&sha);
      gOtaInProgress = false;
      return false;
    }
    totalWritten += static_cast<size_t>(readBytes);
    if (remaining > 0) {
      remaining -= readBytes;
    }
  }

  uint8_t digest[32] = {};
  mbedtls_sha256_finish_ret(&sha, digest);
  mbedtls_sha256_free(&sha);
  const String actualSha = bytesToHex(digest, sizeof(digest));
  String expectedSha = release.sha256;
  expectedSha.toLowerCase();

  if (actualSha != expectedSha) {
    Serial.printf("[ota] sha mismatch expected=%s actual=%s\n", expectedSha.c_str(), actualSha.c_str());
    Update.abort();
    http.end();
    gOtaInProgress = false;
    return false;
  }
  if (totalWritten != static_cast<size_t>(contentLength)) {
    Serial.printf("[ota] size mismatch expected=%d actual=%u\n", contentLength, static_cast<unsigned>(totalWritten));
    Update.abort();
    http.end();
    gOtaInProgress = false;
    return false;
  }
  if (!Update.end()) {
    Serial.printf("[ota] Update.end failed: %s\n", Update.errorString());
    http.end();
    gOtaInProgress = false;
    return false;
  }
  http.end();
  if (!Update.isFinished()) {
    gOtaInProgress = false;
    return false;
  }

  Serial.printf("[ota] update complete -> %s, rebooting\n", release.version.c_str());
  delay(500);
  ESP.restart();
  return true;
}

void serviceFirmwareUpdates() {
  if (WiFi.status() != WL_CONNECTED || gOtaInProgress || !gSetupComplete) {
    return;
  }
  if (gPendingOtaRequest) {
    gPendingOtaRequest = false;
    if (!performOtaUpdate(gCachedFirmwareRelease)) {
      Serial.println("[ota] pending update failed or no newer release");
    }
    return;
  }
  if (!isDue(millis(), gNextFirmwareCheckMs)) {
    return;
  }

  FirmwareRelease latest;
  if (fetchLatestFirmwareRelease(latest)) {
    gCachedFirmwareRelease = latest;
    if (latest.available) {
      Serial.printf("[ota] latest=%s current=%s\n", latest.version.c_str(), kFirmwareVersion);
      if (gAutoUpdate && compareSemver(kFirmwareVersion, latest.version) < 0) {
        performOtaUpdate(latest);
      }
    } else {
      Serial.println("[ota] no release published yet");
    }
  } else {
    Serial.printf("[ota] check failed: %s\n", latest.error.c_str());
    gCachedFirmwareRelease = latest;
  }
  gNextFirmwareCheckMs = millis() + kFirmwareCheckMs;
}

bool fetchDeviceVersion(const String& host, const String& password, DiscoveredDevice& out) {
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composeDeviceVersionUrl(host))) {
    return false;
  }
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["password"] = password;
  String body;
  serializeJson(doc, body);
  const int status = http.POST(body);
  const String responseBody = http.getString();
  http.end();
  if (status != HTTP_CODE_OK) {
    return false;
  }

  JsonDocument responseDoc;
  if (deserializeJson(responseDoc, responseBody) != DeserializationError::Ok) {
    return false;
  }

  if (responseDoc["result"].is<int>() && responseDoc["result"].as<int>() == 0) {
    JsonObject data = responseDoc["data"].as<JsonObject>();
    if (!data.isNull()) {
      out.ip = normalizeHost(host);
      out.sn = data["sn"] | "";
      out.deviceName = data["device_name"] | "";
      out.firmwareVersion = data["firmware_version"] | "";
      out.mac = data["mac"] | "";
      out.needsPassword = out.sn.isEmpty();
      return true;
    }
  }

  if (responseDoc["result"].is<int>()) {
    out.ip = normalizeHost(host);
    out.needsPassword = true;
    return true;
  }
  return false;
}

bool verifyU5Login(const String& host, const String& password, String& errorOut) {
  HTTPClient http;
  WiFiClient client;
  if (!http.begin(client, composeDeviceLoginUrl(host))) {
    errorOut = "Failed to prepare login check.";
    return false;
  }
  http.setConnectTimeout(2000);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");

  JsonDocument bodyDoc;
  bodyDoc["username"] = kAdminUsername;
  bodyDoc["password"] = password;
  String body;
  serializeJson(bodyDoc, body);
  const int status = http.POST(body);
  const String responseBody = http.getString();
  http.end();
  if (status != HTTP_CODE_OK) {
    errorOut = "Device login request failed.";
    return false;
  }

  JsonDocument responseDoc;
  if (deserializeJson(responseDoc, responseBody) != DeserializationError::Ok) {
    errorOut = "Device login returned invalid JSON.";
    return false;
  }

  if ((responseDoc["result"].is<int>() && responseDoc["result"].as<int>() == 0) ||
      (responseDoc["code"].is<int>() && responseDoc["code"].as<int>() == HTTP_CODE_OK)) {
    return true;
  }

  errorOut = responseDoc["message"] | "Wrong password, try again.";
  return false;
}

std::vector<String> scanOpenHttpHosts() {
  std::vector<String> results;
  if (WiFi.status() != WL_CONNECTED) {
    return results;
  }

  uint32_t local = ipToU32(WiFi.localIP());
  uint32_t mask = ipToU32(WiFi.subnetMask());
  uint32_t gateway = ipToU32(WiFi.gatewayIP());
  uint32_t network = local & mask;
  uint32_t broadcast = network | (~mask);
  uint32_t start = network + 1;
  uint32_t end = broadcast - 1;

  if (end <= start) {
    return results;
  }
  if ((end - start + 1) > 254) {
    start = (local & 0xFFFFFF00UL) + 1;
    end = (local & 0xFFFFFF00UL) + 254;
  }

  constexpr size_t kBatch = 16;
  for (uint32_t batchStart = start; batchStart <= end; batchStart += kBatch) {
    struct SocketProbe {
      int sock = -1;
      uint32_t ip = 0;
    };
    std::array<SocketProbe, kBatch> probes{};
    fd_set writefds;
    FD_ZERO(&writefds);
    int maxfd = -1;

    for (size_t i = 0; i < kBatch; ++i) {
      const uint32_t candidate = batchStart + static_cast<uint32_t>(i);
      if (candidate > end || candidate == local || candidate == gateway || candidate == ipToU32(WiFi.softAPIP())) {
        continue;
      }

      const int sock = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
      if (sock < 0) {
        continue;
      }
      const int flags = fcntl(sock, F_GETFL, 0);
      fcntl(sock, F_SETFL, flags | O_NONBLOCK);

      sockaddr_in addr{};
      addr.sin_family = AF_INET;
      addr.sin_port = htons(kHttpPort);
      addr.sin_addr.s_addr = htonl(candidate);

      const int rc = connect(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
      if (rc == 0 || errno == EINPROGRESS || errno == EALREADY || errno == EWOULDBLOCK) {
        probes[i].sock = sock;
        probes[i].ip = candidate;
        FD_SET(sock, &writefds);
        if (sock > maxfd) {
          maxfd = sock;
        }
      } else {
        closesocket(sock);
      }
    }

    if (maxfd >= 0) {
      timeval timeout{};
      timeout.tv_sec = 0;
      timeout.tv_usec = static_cast<long>(kDiscoveryConnectTimeoutMs) * 1000L;
      fd_set wfds = writefds;
      const int ready = select(maxfd + 1, nullptr, &wfds, nullptr, &timeout);
      if (ready > 0) {
        for (const SocketProbe& probe : probes) {
          if (probe.sock < 0 || !FD_ISSET(probe.sock, &wfds)) {
            continue;
          }
          int soError = 0;
          socklen_t len = sizeof(soError);
          getsockopt(probe.sock, SOL_SOCKET, SO_ERROR, reinterpret_cast<char*>(&soError), &len);
          if (soError == 0) {
            results.push_back(u32ToIp(probe.ip).toString());
          }
        }
      }
      for (const SocketProbe& probe : probes) {
        if (probe.sock >= 0) {
          closesocket(probe.sock);
        }
      }
    }
    delay(1);
  }

  return results;
}

void discoverU5Devices() {
  gDiscoveryResults.clear();
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  const std::vector<String> openHosts = scanOpenHttpHosts();
  for (const String& host : openHosts) {
    DiscoveredDevice candidate;
    if (fetchDeviceVersion(host, "123456", candidate)) {
      if (!candidate.sn.isEmpty() || candidate.needsPassword) {
        gDiscoveryResults.push_back(candidate);
      }
    }
    delay(1);
  }

  std::sort(gDiscoveryResults.begin(), gDiscoveryResults.end(),
            [](const DiscoveredDevice& left, const DiscoveredDevice& right) { return left.ip < right.ip; });
  gDiscoveryFetchedMs = millis();
}

void cacheWifiScan() {
  gWifiScanResults.clear();
  const int networks = WiFi.scanNetworks(false, true);
  for (int index = 0; index < networks; ++index) {
    WifiScanEntry entry;
    entry.ssid = WiFi.SSID(index);
    entry.rssi = WiFi.RSSI(index);
    entry.encryption = WiFi.encryptionType(index);
    entry.hidden = entry.ssid.isEmpty();
    gWifiScanResults.push_back(entry);
  }
  std::sort(gWifiScanResults.begin(), gWifiScanResults.end(),
            [](const WifiScanEntry& left, const WifiScanEntry& right) { return left.rssi > right.rssi; });
  gWifiScanFetchedMs = millis();
  WiFi.scanDelete();
}

void sendNoCacheHeaders() {
  gWebServer.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  gWebServer.sendHeader("Pragma", "no-cache");
}

void sendJsonDocument(const int code, JsonDocument& doc) {
  String body;
  serializeJson(doc, body);
  sendNoCacheHeaders();
  gWebServer.send(code, "application/json; charset=utf-8", body);
}

void sendJsonError(const int code, const String& error) {
  JsonDocument doc;
  doc["success"] = false;
  doc["error"] = error;
  sendJsonDocument(code, doc);
}

String buildWizardPage() {
  String html;
  html.reserve(9000);
  html += F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>Jenix U5 Gateway Setup</title><style>"
            "body{font-family:Segoe UI,Tahoma,sans-serif;background:#eef3f7;color:#10212b;margin:0}.wrap{max-width:920px;margin:0 auto;padding:16px}.card{background:#fff;border:1px solid #d8e2e8;border-radius:18px;padding:16px 18px;margin:0 0 14px;box-shadow:0 12px 28px rgba(15,23,42,.06)}"
            "h1,h2{margin:0 0 8px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}"
            "label{display:block;font-size:13px;font-weight:700;margin:10px 0 6px}input,button{font:inherit}input{width:100%;padding:10px 12px;border:1px solid #c7d4db;border-radius:12px;box-sizing:border-box}"
            ".choice{border:1px solid #d8e2e8;border-radius:14px;padding:10px;background:#f8fbfc;margin-top:8px;cursor:pointer}.choice.active{border-color:#0f766e;box-shadow:0 0 0 2px rgba(15,118,110,.12)}"
            "button{border:0;border-radius:12px;padding:11px 14px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer}button.secondary{background:#334155}button.ghost{background:#edf4f5;color:#153b46}"
            ".note{margin-top:10px;padding:10px 12px;border-radius:12px;background:#ecfdf5;border:1px solid #bbf7d0;color:#166534}.error{background:#fef2f2;border-color:#fecaca;color:#991b1b}code{background:#eef3f7;padding:2px 6px;border-radius:8px}</style></head><body><div class='wrap'>");
  html += "<div class='card'><h1>Jenix U5 Gateway Setup</h1><p class='muted'>Join the site Wi-Fi, find the U5 on the LAN, verify its password, then bind the Jenix API key.</p>";
  html += "<p><strong>Setup AP:</strong> <code>" + htmlEscape(gPortalSsid) + "</code> password <code>" + htmlEscape(gPortalPassword) + "</code></p>";
  html += "<p id='live-status' class='muted'>Loading status…</p></div>";
  html += F("<div class='card'><h2>1. Connect To Wi-Fi</h2><div class='row'><button type='button' onclick='scanWifi()'>Scan Networks</button><button type='button' class='ghost' onclick='showManualWifi()'>Enter Manually</button></div><div id='wifi-list'></div><div id='wifi-manual' style='display:none'><label>Wi-Fi SSID</label><input id='wifi-ssid' type='text'></div><label>Wi-Fi Password</label><input id='wifi-password' type='password'><div class='row' style='margin-top:10px'><button type='button' onclick='connectWifi()'>Connect</button><button type='button' class='secondary' onclick='checkWifi()'>Refresh Status</button></div><div id='wifi-note'></div></div>");
  html += F("<div class='card'><h2>2. Find The U5</h2><div class='row'><button type='button' onclick='discoverDevices()'>Search Network</button><button type='button' class='ghost' onclick='toggleManualIp()'>Use Manual IP</button></div><div id='device-list'></div><div id='manual-ip-wrap' style='display:none'><label>Manual U5 IP / host</label><input id='manual-ip' type='text' placeholder='192.168.1.92'></div><div id='discover-note'></div></div>");
  html += F("<div class='card'><h2>3. Verify U5 Login</h2><label>U5 Password</label><input id='u5-password' type='password' value='123456'><div class='row' style='margin-top:10px'><button type='button' onclick='verifyU5()'>Verify</button></div><div id='u5-note'></div></div>");
  html += F("<div class='card'><h2>4. Verify Jenix API Key</h2><label>API Key</label><input id='api-key' type='text'><div class='row' style='margin-top:10px'><button type='button' onclick='verifyApiKey()'>Test Connection</button><button type='button' class='ghost' onclick='pasteApiKey()'>Paste</button><a href='/advanced'><button type='button' class='secondary'>Advanced Page</button></a></div><div id='api-note'></div></div>");
  html += F("<div class='card'><h2>5. Save</h2><div class='grid'><div><label>Slot</label><input id='slot-index' type='number' min='0' max='5' value='0'></div><div><label>Slot Label</label><input id='slot-label' type='text' placeholder='main-gate-u5'></div><div><label>Poll ms</label><input id='slot-poll-ms' type='number' min='5000' step='1000' value='15000'></div></div><div class='row' style='margin-top:12px'><button type='button' onclick='saveWizard(\"finish\")'>Save & Finish</button><button type='button' class='secondary' onclick='saveWizard(\"add\")'>Save & Add Another Gate</button></div><div id='save-note'></div></div>");
  html += F(R"rawliteral(<script>
let selectedSsid=''; let selectedHost='';
function note(id,msg,bad){ const el=document.getElementById(id); el.className='note'+(bad?' error':''); el.textContent=msg; }
async function fetchJson(url, options){ const res=await fetch(url,Object.assign({cache:'no-store'},options||{})); const body=await res.json(); if(!res.ok||body.success===false) throw new Error(body.error||('HTTP '+res.status)); return body.data; }
async function refreshStatus(){ try{ const data=await fetchJson('/api/status'); document.getElementById('live-status').textContent=data.wifiConnected?('Connected to '+data.wifiSsid+' at '+data.stationIp):('Wi-Fi: '+data.wifiStatusText+' | AP: '+(data.apActive?data.apSsid:'inactive')); }catch(_){} }
function showManualWifi(){ document.getElementById('wifi-manual').style.display='block'; }
function toggleManualIp(){ const el=document.getElementById('manual-ip-wrap'); el.style.display=el.style.display==='none'?'block':'none'; }
async function scanWifi(){ note('wifi-note','Scanning nearby Wi-Fi networks...'); try{ const data=await fetchJson('/api/wifi/scan'); const list=document.getElementById('wifi-list'); list.innerHTML=''; if(!data.networks.length){ showManualWifi(); note('wifi-note','No visible SSIDs found. Enter the network manually.',true); return; } data.networks.forEach((n)=>{ const div=document.createElement('div'); div.className='choice'; div.textContent=n.ssid+' (RSSI '+n.rssi+' dBm)'; div.onclick=()=>{ selectedSsid=n.ssid; document.getElementById('wifi-ssid').value=n.ssid; document.getElementById('wifi-manual').style.display='block'; document.querySelectorAll('#wifi-list .choice').forEach((x)=>x.classList.remove('active')); div.classList.add('active'); }; list.appendChild(div); }); note('wifi-note','Pick the site SSID, enter the password, then press Connect.'); }catch(err){ showManualWifi(); note('wifi-note',err.message,true); } }
async function connectWifi(){ const ssid=(document.getElementById('wifi-ssid').value||selectedSsid||'').trim(); const password=document.getElementById('wifi-password').value||''; if(!ssid){ note('wifi-note','SSID is required.',true); return; } const body=new URLSearchParams({ssid,password}); try{ await fetchJson('/api/wifi/connect',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); await pollWifi(); }catch(err){ note('wifi-note',err.message,true); } }
async function pollWifi(){ const start=Date.now(); while(Date.now()-start<17000){ const data=await fetchJson('/api/wifi/status'); if(data.connected){ note('wifi-note','Connected to '+data.ssid+' with IP '+data.stationIp+'.'); refreshStatus(); return; } await new Promise((r)=>setTimeout(r,500)); } note('wifi-note','Timed out waiting for Wi-Fi. Re-enter the password and try again.',true); }
async function checkWifi(){ try{ const data=await fetchJson('/api/wifi/status'); note('wifi-note',data.connected?('Connected to '+data.ssid+' with IP '+data.stationIp+'.'):('Wi-Fi state: '+data.statusText),!data.connected); }catch(err){ note('wifi-note',err.message,true); } }
async function discoverDevices(){ note('discover-note','Searching the local subnet for U5 devices...'); try{ const data=await fetchJson('/api/u5/discover'); const list=document.getElementById('device-list'); list.innerHTML=''; if(!data.devices.length){ note('discover-note','No U5 device answered discovery. Use manual IP or retry.',true); return; } data.devices.forEach((d)=>{ const div=document.createElement('div'); div.className='choice'; div.textContent=d.ip+' - '+(d.sn||'password required')+' - '+(d.firmwareVersion||'U5 candidate'); div.onclick=()=>{ selectedHost=d.ip; document.getElementById('manual-ip').value=d.ip; document.getElementById('manual-ip-wrap').style.display='block'; document.querySelectorAll('#device-list .choice').forEach((x)=>x.classList.remove('active')); div.classList.add('active'); if(!document.getElementById('slot-label').value && d.deviceName){ document.getElementById('slot-label').value=d.deviceName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); } }; list.appendChild(div); }); note('discover-note','Pick the correct U5 or enter its IP manually.'); }catch(err){ note('discover-note',err.message,true); } }
function currentHost(){ return (document.getElementById('manual-ip').value||selectedHost||'').trim(); }
async function verifyU5(){ const host=currentHost(); const password=document.getElementById('u5-password').value||''; if(!host){ note('u5-note','Pick a discovered U5 or enter its IP.',true); return; } const body=new URLSearchParams({host,password}); try{ await fetchJson('/api/u5/verify-login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); note('u5-note','U5 login verified on '+host+'.'); }catch(err){ note('u5-note',err.message,true); } }
async function pasteApiKey(){ if(!navigator.clipboard||!navigator.clipboard.readText) return; try{ document.getElementById('api-key').value=await navigator.clipboard.readText(); }catch(_){} }
async function verifyApiKey(){ const apiKey=(document.getElementById('api-key').value||'').trim(); if(!apiKey){ note('api-note','Paste the Jenix API key first.',true); return; } const body=new URLSearchParams({api_key:apiKey}); try{ const data=await fetchJson('/api/jenix/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); note('api-note','Connected to: '+data.societyName+' - '+data.deviceName); if(!document.getElementById('slot-label').value){ document.getElementById('slot-label').value=data.deviceName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); } }catch(err){ note('api-note',err.message,true); } }
async function saveWizard(mode){ const host=currentHost(); const apiKey=(document.getElementById('api-key').value||'').trim(); if(!host||!apiKey){ note('save-note','U5 IP and API key are required.',true); return; } const body=new URLSearchParams({slot:document.getElementById('slot-index').value||'0',mode,label:document.getElementById('slot-label').value||'',u5_ip:host,u5_password:document.getElementById('u5-password').value||'123456',api_key:apiKey,poll_ms:document.getElementById('slot-poll-ms').value||'15000'}); try{ const data=await fetchJson('/api/wizard/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); if(mode==='finish'){ note('save-note','Setup complete. Reconnect to the site Wi-Fi and open '+(data.stationUrl||data.stationIp||'the station IP')+'.'); }else{ note('save-note','Saved slot '+data.savedSlot+'. Continue with slot '+data.nextSlot+'.'); document.getElementById('slot-index').value=data.nextSlot; } }catch(err){ note('save-note',err.message,true); } }
refreshStatus(); setInterval(refreshStatus,1500);
</script></div></body></html>)rawliteral");
  return html;
}

void sendWizardPage() {
  sendNoCacheHeaders();
  gWebServer.send(200, "text/html; charset=utf-8", buildWizardPage());
}

String buildAdvancedPage(const String& notice) {
  String html;
  html.reserve(12000);
  html += F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Jenix U5 Gateway</title><style>"
            "body{font-family:Segoe UI,Tahoma,sans-serif;background:#eef3f7;color:#10212b;margin:0}.wrap{max-width:1100px;margin:0 auto;padding:16px}.card{background:#fff;border:1px solid #d8e2e8;border-radius:18px;padding:16px 18px;margin:0 0 14px;box-shadow:0 12px 28px rgba(15,23,42,.06)}"
            "h1,h2,h3{margin:0 0 8px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}"
            "label{display:block;font-size:13px;font-weight:700;margin:10px 0 6px}input,button,textarea{font:inherit}input,textarea{width:100%;padding:10px 12px;border:1px solid #c7d4db;border-radius:12px;box-sizing:border-box}textarea{min-height:120px}"
            "button{border:0;border-radius:12px;padding:11px 14px;background:#0f766e;color:#fff;font-weight:800;cursor:pointer}button.secondary{background:#334155}button.warn{background:#9a3412}button.danger{background:#b91c1c}button.ghost{background:#edf4f5;color:#153b46}"
            ".device{border:1px solid #d8e2e8;border-radius:14px;background:#f8fbfc;padding:12px;margin-top:12px}.note{margin:0 0 12px;padding:10px 12px;border-radius:12px;background:#ecfdf5;border:1px solid #bbf7d0;color:#166534}code{background:#eef3f7;padding:2px 6px;border-radius:8px}</style></head><body><div class='wrap'>");
  html += "<div class='card'><div class='row' style='justify-content:space-between'><div><h1>Jenix U5 Gateway</h1><p class='muted'>Advanced support page for raw slot edits, actions, backup/restore, and update controls.</p></div><div class='row'><a href='/wizard'><button type='button' class='secondary'>Wizard</button></a><a href='/export'><button type='button' class='ghost'>Export Settings</button></a></div></div>";
  if (!notice.isEmpty()) {
    html += "<div class='note'>" + htmlEscape(notice) + "</div>";
  }
  html += "<p class='muted'>Firmware " + String(kFirmwareVersion) + " | Station " +
          htmlEscape(WiFi.status() == WL_CONNECTED ? stationUrl() : String("not connected")) + " | AP " +
          htmlEscape(gApStarted ? (gPortalSsid + " / " + WiFi.softAPIP().toString()) : String("inactive")) + "</p></div>";

  html += "<form method='post' action='/save'><div class='card'><h2>Gateway Settings</h2><div class='grid'>";
  html += "<div><label>Wi-Fi SSID</label><input type='text' name='wifi_ssid' value='" + htmlEscape(gWifiSsid) + "'></div>";
  html += "<div><label>Wi-Fi Password</label><input type='password' name='wifi_password' value='" + htmlEscape(gWifiPassword) + "'></div>";
  html += "<div><label>Setup AP SSID</label><input type='text' value='" + htmlEscape(gPortalSsid) + "' disabled></div>";
  html += "<div><label>Setup AP Password</label><input type='text' value='" + htmlEscape(gPortalPassword) + "' disabled></div></div>";
  html += "<div class='row' style='margin-top:10px'><label><input type='checkbox' name='auto_update' value='1'";
  if (gAutoUpdate) {
    html += " checked";
  }
  html += "> Auto-update firmware when a newer release is published</label></div>";
  html += "<div class='row' style='margin-top:12px'><button type='submit'>Save Gateway Settings</button></div></div><div class='card'><h2>Device Slots</h2>";

  for (size_t index = 0; index < kMaxDevices; ++index) {
    const DeviceSlotConfig& device = gDevices[index];
    const String prefix = String("d") + String(static_cast<unsigned>(index)) + "_";
    html += "<div class='device'><h3>Slot " + String(static_cast<unsigned>(index)) + "</h3>";
    html += "<div class='row'><label><input type='checkbox' name='" + prefix + "enabled' value='1'";
    if (device.enabled) {
      html += " checked";
    }
    html += "> Enabled</label></div><div class='grid'>";
    html += "<div><label>Label</label><input type='text' name='" + prefix + "label' value='" + htmlEscape(device.label) + "'></div>";
    html += "<div><label>U5 IP / host</label><input type='text' name='" + prefix + "u5_ip' value='" + htmlEscape(device.u5Ip) + "'></div>";
    html += "<div><label>U5 password</label><input type='password' name='" + prefix + "u5_password' value='" + htmlEscape(device.u5Password) + "'></div>";
    html += "<div><label>Poll ms</label><input type='number' min='5000' step='1000' name='" + prefix + "poll_ms' value='" + String(static_cast<unsigned>(device.pollIntervalMs)) + "'></div>";
    html += "<div><label>Push base URL</label><input type='text' name='" + prefix + "push_base' value='" + htmlEscape(normalizeBaseUrl(device.pushBaseUrl)) + "'></div>";
    html += "<div><label>API key</label><input type='text' name='" + prefix + "api_key' value='" + htmlEscape(device.apiKey) + "'></div></div>";
    html += "<p class='muted'>Push URL: <code>" + htmlEscape(composePushUrl(device)) + "</code></p>";
    html += "<p class='muted'>Last unix: <code>" + toStringU64(device.lastCheckinUnix) + "</code></p>";
    html += "<div class='row'><button class='warn' type='submit' formaction='/action' name='name' value='clear-" + String(static_cast<unsigned>(index)) + "'>Clear Last Timestamp</button></div></div>";
  }

  html += F("</div><div class='row' style='margin-top:12px'><button type='submit'>Save All Slot Settings</button></div></div></form>");
  html += F("<div class='card'><h2>Actions</h2><div class='row'>"
            "<form method='post' action='/action'><button name='name' value='poll-now'>Poll Now</button></form>"
            "<form method='post' action='/action'><button class='secondary' name='name' value='wifi-reconnect'>Reconnect Wi-Fi</button></form>"
            "<form method='post' action='/action'><button class='secondary' name='name' value='portal-on'>Enable Setup AP</button></form>"
            "<form method='post' action='/action'><button class='secondary' name='name' value='portal-off'>Disable Setup AP</button></form>"
            "<form method='post' action='/action'><button class='ghost' name='name' value='check-updates'>Check For Updates</button></form>"
            "<form method='post' action='/action'><button class='warn' name='name' value='update-now'>Apply Latest Update</button></form>"
            "<form method='post' action='/action'><button class='danger' name='name' value='reboot'>Reboot</button></form>"
            "<form method='post' action='/action'><button class='danger' name='name' value='factory-reset'>Factory Reset</button></form>"
            "</div></div>");
  html += F("<div class='card'><h2>Config Import</h2><p class='muted'>Paste a previously exported JSON blob to restore Wi-Fi, slots, and dedupe state.</p><form method='post' action='/import'><label>Config JSON</label><textarea name='config_json'></textarea><div class='row' style='margin-top:12px'><button type='submit'>Import Settings</button></div></form></div></div></body></html>");
  return html;
}

void sendAdvancedPage(const String& notice) {
  sendNoCacheHeaders();
  gWebServer.send(200, "text/html; charset=utf-8", buildAdvancedPage(notice));
}

void handleSaveAdvanced() {
  gWifiSsid = gWebServer.arg("wifi_ssid");
  gWifiPassword = gWebServer.arg("wifi_password");
  gAutoUpdate = gWebServer.hasArg("auto_update");

  for (size_t index = 0; index < kMaxDevices; ++index) {
    DeviceSlotConfig& device = gDevices[index];
    const String prefix = String("d") + String(static_cast<unsigned>(index)) + "_";
    device.enabled = gWebServer.hasArg(prefix + "enabled");
    device.label = gWebServer.arg(prefix + "label");
    device.u5Ip = gWebServer.arg(prefix + "u5_ip");
    device.u5Password = gWebServer.arg(prefix + "u5_password");
    const String pushBase = gWebServer.arg(prefix + "push_base");
    device.pushBaseUrl = pushBase.isEmpty() ? kDefaultPushBaseUrl : pushBase;
    device.apiKey = gWebServer.arg(prefix + "api_key");
    const uint32_t pollMs = static_cast<uint32_t>(gWebServer.arg(prefix + "poll_ms").toInt());
    device.pollIntervalMs = clampPollMs(pollMs == 0 ? kDefaultPollMs : pollMs);
    device.nextPollMs = 0;
    saveDeviceConfig(index, device);
  }

  refreshSetupCompleteFlag();
  saveGatewaySettings();
  WiFi.disconnect();
  gNextWifiAttemptMs = 0;
  ensurePortalState();
  sendAdvancedPage("Settings saved. Wi-Fi reconnect scheduled.");
}

void handleAction() {
  const String name = gWebServer.arg("name");
  if (name == "poll-now") {
    scheduleAllDevicesNow();
    sendAdvancedPage("Poll scheduled.");
    return;
  }
  if (name == "wifi-reconnect") {
    WiFi.disconnect();
    gNextWifiAttemptMs = 0;
    sendAdvancedPage("Wi-Fi reconnect scheduled.");
    return;
  }
  if (name == "portal-on") {
    gPortalForced = true;
    startSetupAp();
    sendAdvancedPage("Setup AP enabled.");
    return;
  }
  if (name == "portal-off") {
    gPortalForced = false;
    if (gSetupComplete && WiFi.status() == WL_CONNECTED) {
      stopSetupAp();
      sendAdvancedPage("Setup AP disabled.");
    } else {
      sendAdvancedPage("Setup AP will stay on until the gateway has a completed configuration and a Wi-Fi link.");
    }
    return;
  }
  if (name == "check-updates") {
    FirmwareRelease latest;
    if (fetchLatestFirmwareRelease(latest)) {
      gCachedFirmwareRelease = latest;
      sendAdvancedPage(latest.available ? ("Latest published firmware: " + latest.version + ".")
                                        : String("No firmware release has been published yet for this model."));
    } else {
      sendAdvancedPage("Firmware check failed: " + latest.error);
    }
    return;
  }
  if (name == "update-now") {
    FirmwareRelease latest = gCachedFirmwareRelease;
    if (!latest.available) {
      fetchLatestFirmwareRelease(latest);
      gCachedFirmwareRelease = latest;
    }
    if (!latest.available) {
      sendAdvancedPage("No newer firmware is currently available.");
      return;
    }
    gPendingOtaRequest = true;
    sendAdvancedPage("Firmware update scheduled. The gateway will reboot if the download and checksum succeed.");
    return;
  }
  if (name == "factory-reset") {
    factoryReset();
    sendWizardPage();
    return;
  }
  if (name == "reboot") {
    gWebServer.send(200, "text/plain", "Rebooting...");
    delay(300);
    ESP.restart();
    return;
  }
  if (name.startsWith("clear-")) {
    const int slot = name.substring(6).toInt();
    if (slot >= 0 && static_cast<size_t>(slot) < kMaxDevices) {
      saveLastCheckinUnix(static_cast<size_t>(slot), 0);
      sendAdvancedPage("Cleared last timestamp.");
      return;
    }
  }
  sendAdvancedPage("Unknown action.");
}

void handleExport() {
  JsonDocument doc;
  JsonObject wifi = doc["wifi"].to<JsonObject>();
  wifi["ssid"] = gWifiSsid;
  wifi["password"] = gWifiPassword;
  doc["autoUpdate"] = gAutoUpdate;
  doc["setupComplete"] = gSetupComplete;
  doc["firmwareVersion"] = kFirmwareVersion;
  JsonArray devices = doc["devices"].to<JsonArray>();
  for (size_t index = 0; index < kMaxDevices; ++index) {
    const DeviceSlotConfig& device = gDevices[index];
    JsonObject row = devices.add<JsonObject>();
    row["index"] = static_cast<unsigned>(index);
    row["enabled"] = device.enabled;
    row["label"] = device.label;
    row["u5_ip"] = device.u5Ip;
    row["u5_password"] = device.u5Password;
    row["push_base_url"] = normalizeBaseUrl(device.pushBaseUrl);
    row["api_key"] = device.apiKey;
    row["poll_ms"] = device.pollIntervalMs;
    row["last_checkin_unix"] = toStringU64(device.lastCheckinUnix);
  }
  String body;
  serializeJsonPretty(doc, body);
  sendNoCacheHeaders();
  gWebServer.sendHeader("Content-Disposition", "attachment; filename=\"u5-gateway-config.json\"");
  gWebServer.send(200, "application/json; charset=utf-8", body);
}

void handleImport() {
  JsonDocument doc;
  const String raw = gWebServer.arg("config_json");
  if (raw.isEmpty()) {
    sendAdvancedPage("Import failed: no JSON body provided.");
    return;
  }
  if (deserializeJson(doc, raw) != DeserializationError::Ok) {
    sendAdvancedPage("Import failed: invalid JSON.");
    return;
  }

  JsonObject wifi = doc["wifi"].as<JsonObject>();
  if (!wifi.isNull()) {
    gWifiSsid = wifi["ssid"] | gWifiSsid;
    gWifiPassword = wifi["password"] | gWifiPassword;
  }
  gAutoUpdate = doc["autoUpdate"] | gAutoUpdate;
  gSetupComplete = doc["setupComplete"] | gSetupComplete;

  JsonArray devices = doc["devices"].as<JsonArray>();
  if (!devices.isNull()) {
    for (JsonObject row : devices) {
      const int slot = row["index"] | -1;
      if (slot < 0 || static_cast<size_t>(slot) >= kMaxDevices) {
        continue;
      }
      DeviceSlotConfig& device = gDevices[static_cast<size_t>(slot)];
      device.enabled = row["enabled"] | false;
      device.label = row["label"] | device.label;
      device.u5Ip = row["u5_ip"] | "";
      device.u5Password = row["u5_password"] | "123456";
      device.pushBaseUrl = row["push_base_url"] | String(kDefaultPushBaseUrl);
      device.apiKey = row["api_key"] | "";
      device.pollIntervalMs = clampPollMs(row["poll_ms"] | kDefaultPollMs);
      device.lastCheckinUnix = parseU64(row["last_checkin_unix"] | "0");
      device.nextPollMs = 0;
      saveDeviceConfig(static_cast<size_t>(slot), device);
    }
  }

  refreshSetupCompleteFlag();
  saveGatewaySettings();
  WiFi.disconnect();
  gNextWifiAttemptMs = 0;
  ensurePortalState();
  sendAdvancedPage("Settings imported. Wi-Fi reconnect scheduled.");
}

void handleStatusApi() {
  JsonDocument doc;
  doc["success"] = true;
  JsonObject data = doc["data"].to<JsonObject>();
  data["firmwareVersion"] = kFirmwareVersion;
  data["setupComplete"] = gSetupComplete;
  data["autoUpdate"] = gAutoUpdate;
  data["apActive"] = gApStarted;
  data["apSsid"] = gPortalSsid;
  data["apPassword"] = gPortalPassword;
  data["apIp"] = gApStarted ? WiFi.softAPIP().toString() : "";
  data["wifiStatus"] = static_cast<int>(WiFi.status());
  data["wifiStatusText"] = wifiStatusText(WiFi.status());
  data["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  data["wifiSsid"] = gWifiSsid;
  data["stationIp"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  data["stationUrl"] = stationUrl();
  data["portalForced"] = gPortalForced;
  data["otaInProgress"] = gOtaInProgress;
  sendJsonDocument(200, doc);
}

void handleWifiScanApi() {
  if (WiFi.status() != WL_CONNECTED && !gApStarted) {
    sendJsonError(503, "Wi-Fi radio is not ready.");
    return;
  }
  if (isDue(millis(), gWifiScanFetchedMs + kWifiScanCacheMs)) {
    cacheWifiScan();
  }
  JsonDocument doc;
  doc["success"] = true;
  JsonArray networks = doc["data"]["networks"].to<JsonArray>();
  for (const WifiScanEntry& entry : gWifiScanResults) {
    JsonObject row = networks.add<JsonObject>();
    row["ssid"] = entry.ssid;
    row["rssi"] = entry.rssi;
    row["encryption"] = entry.encryption;
    row["hidden"] = entry.hidden;
  }
  sendJsonDocument(200, doc);
}

void handleWifiConnectApi() {
  const String ssid = gWebServer.arg("ssid");
  const String password = gWebServer.arg("password");
  if (ssid.isEmpty()) {
    sendJsonError(400, "SSID is required.");
    return;
  }
  gWifiSsid = ssid;
  gWifiPassword = password;
  saveGatewaySettings();
  WiFi.disconnect();
  gNextWifiAttemptMs = 0;
  ensurePortalState();

  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["message"] = "Wi-Fi credentials saved. Connection attempt started.";
  sendJsonDocument(200, doc);
}

void handleWifiStatusApi() {
  JsonDocument doc;
  doc["success"] = true;
  JsonObject data = doc["data"].to<JsonObject>();
  data["connected"] = WiFi.status() == WL_CONNECTED;
  data["ssid"] = gWifiSsid;
  data["status"] = static_cast<int>(WiFi.status());
  data["statusText"] = wifiStatusText(WiFi.status());
  data["stationIp"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  sendJsonDocument(200, doc);
}

void handleDiscoverApi() {
  if (WiFi.status() != WL_CONNECTED) {
    sendJsonError(503, "Connect station Wi-Fi first.");
    return;
  }
  if (isDue(millis(), gDiscoveryFetchedMs + kDiscoveryCacheMs)) {
    discoverU5Devices();
  }
  JsonDocument doc;
  doc["success"] = true;
  JsonArray devices = doc["data"]["devices"].to<JsonArray>();
  for (const DiscoveredDevice& device : gDiscoveryResults) {
    JsonObject row = devices.add<JsonObject>();
    row["ip"] = device.ip;
    row["sn"] = device.sn;
    row["deviceName"] = device.deviceName;
    row["firmwareVersion"] = device.firmwareVersion;
    row["mac"] = device.mac;
    row["needsPassword"] = device.needsPassword;
  }
  sendJsonDocument(200, doc);
}

void handleVerifyLoginApi() {
  const String host = gWebServer.arg("host");
  const String password = gWebServer.arg("password");
  if (host.isEmpty()) {
    sendJsonError(400, "U5 IP / host is required.");
    return;
  }
  if (password.isEmpty()) {
    sendJsonError(400, "U5 password is required.");
    return;
  }
  String error;
  if (!verifyU5Login(host, password, error)) {
    sendJsonError(401, error);
    return;
  }
  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["message"] = "Connected";
  sendJsonDocument(200, doc);
}

void handleVerifyApiKeyApi() {
  const String apiKey = gWebServer.arg("api_key");
  VerifyResult result;
  if (!verifyApiKeyRemote(apiKey, result)) {
    sendJsonError(401, result.error);
    return;
  }
  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["deviceName"] = result.deviceName;
  doc["data"]["societyName"] = result.societyName;
  sendJsonDocument(200, doc);
}

void handleWizardSaveApi() {
  const int slot = gWebServer.arg("slot").toInt();
  if (slot < 0 || static_cast<size_t>(slot) >= kMaxDevices) {
    sendJsonError(400, "Slot must be between 0 and 5.");
    return;
  }
  const String host = gWebServer.arg("u5_ip");
  const String apiKey = gWebServer.arg("api_key");
  const String u5Password = gWebServer.arg("u5_password");
  const uint32_t pollMs = static_cast<uint32_t>(gWebServer.arg("poll_ms").toInt());
  if (host.isEmpty() || apiKey.isEmpty()) {
    sendJsonError(400, "U5 IP and API key are required.");
    return;
  }

  DeviceSlotConfig& device = gDevices[static_cast<size_t>(slot)];
  device.enabled = true;
  device.label = gWebServer.arg("label");
  if (device.label.isEmpty()) {
    device.label = slugify(host);
  }
  device.u5Ip = host;
  device.u5Password = u5Password.isEmpty() ? "123456" : u5Password;
  device.pushBaseUrl = kDefaultPushBaseUrl;
  device.apiKey = apiKey;
  device.pollIntervalMs = clampPollMs(pollMs == 0 ? kDefaultPollMs : pollMs);
  device.nextPollMs = 0;
  saveDeviceConfig(static_cast<size_t>(slot), device);

  const String mode = gWebServer.arg("mode");
  if (mode == "finish") {
    gSetupComplete = shouldMarkSetupComplete();
    gPortalForced = false;
    saveGatewaySettings();
    if (WiFi.status() == WL_CONNECTED) {
      scheduleApShutdown();
    }
  } else {
    gPortalForced = true;
    saveGatewaySettings();
    startSetupAp();
  }

  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["savedSlot"] = slot;
  doc["data"]["nextSlot"] = std::min(slot + 1, static_cast<int>(kMaxDevices - 1));
  doc["data"]["stationIp"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["data"]["stationUrl"] = stationUrl();
  doc["data"]["setupComplete"] = gSetupComplete;
  sendJsonDocument(200, doc);
}

void handleUpdateCheckApi() {
  FirmwareRelease latest;
  if (!fetchLatestFirmwareRelease(latest)) {
    sendJsonError(502, latest.error);
    return;
  }
  gCachedFirmwareRelease = latest;
  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["available"] = latest.available;
  doc["data"]["version"] = latest.version;
  doc["data"]["releaseNotes"] = latest.releaseNotes;
  doc["data"]["currentVersion"] = kFirmwareVersion;
  doc["data"]["newer"] = latest.available && compareSemver(kFirmwareVersion, latest.version) < 0;
  sendJsonDocument(200, doc);
}

void handleUpdateStartApi() {
  if (!gCachedFirmwareRelease.available) {
    sendJsonError(400, "No cached update. Check for updates first.");
    return;
  }
  if (compareSemver(kFirmwareVersion, gCachedFirmwareRelease.version) >= 0) {
    sendJsonError(400, "Current firmware is already up to date.");
    return;
  }
  gPendingOtaRequest = true;
  JsonDocument doc;
  doc["success"] = true;
  doc["data"]["message"] = "Firmware update queued.";
  sendJsonDocument(202, doc);
}

void handleCaptivePortalProbe() {
  sendNoCacheHeaders();
  gWebServer.send(200, "text/html; charset=utf-8",
                  "<!doctype html><html><head><meta http-equiv='refresh' content='0;url=/'></head><body>Jenix U5 Gateway Setup</body></html>");
}

void beginWebServer() {
  gWebServer.on("/", HTTP_GET, []() {
    if (!gSetupComplete) {
      sendWizardPage();
    } else {
      sendAdvancedPage("");
    }
  });
  gWebServer.on("/wizard", HTTP_GET, []() { sendWizardPage(); });
  gWebServer.on("/advanced", HTTP_GET, []() { sendAdvancedPage(""); });
  gWebServer.on("/save", HTTP_POST, []() { handleSaveAdvanced(); });
  gWebServer.on("/action", HTTP_POST, []() { handleAction(); });
  gWebServer.on("/export", HTTP_GET, []() { handleExport(); });
  gWebServer.on("/import", HTTP_POST, []() { handleImport(); });
  gWebServer.on("/api/status", HTTP_GET, []() { handleStatusApi(); });
  gWebServer.on("/api/wifi/scan", HTTP_GET, []() { handleWifiScanApi(); });
  gWebServer.on("/api/wifi/status", HTTP_GET, []() { handleWifiStatusApi(); });
  gWebServer.on("/api/wifi/connect", HTTP_POST, []() { handleWifiConnectApi(); });
  gWebServer.on("/api/u5/discover", HTTP_GET, []() { handleDiscoverApi(); });
  gWebServer.on("/api/u5/verify-login", HTTP_POST, []() { handleVerifyLoginApi(); });
  gWebServer.on("/api/jenix/verify", HTTP_POST, []() { handleVerifyApiKeyApi(); });
  gWebServer.on("/api/wizard/save", HTTP_POST, []() { handleWizardSaveApi(); });
  gWebServer.on("/api/update/check", HTTP_GET, []() { handleUpdateCheckApi(); });
  gWebServer.on("/api/update/start", HTTP_POST, []() { handleUpdateStartApi(); });
  gWebServer.on("/generate_204", HTTP_GET, []() { handleCaptivePortalProbe(); });
  gWebServer.on("/hotspot-detect.html", HTTP_GET, []() { handleCaptivePortalProbe(); });
  gWebServer.on("/connecttest.txt", HTTP_GET, []() { handleCaptivePortalProbe(); });
  gWebServer.on("/redirect", HTTP_GET, []() { handleCaptivePortalProbe(); });
  gWebServer.on("/fwlink", HTTP_GET, []() { handleCaptivePortalProbe(); });
  gWebServer.on("/healthz", HTTP_GET, []() { gWebServer.send(200, "text/plain", "ok"); });
  gWebServer.onNotFound([]() {
    if (gApStarted) {
      gWebServer.sendHeader("Location", "/", true);
      gWebServer.send(302, "text/plain", "");
      return;
    }
    gWebServer.send(404, "text/plain", "Not found");
  });
  gWebServer.begin();
}

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  help");
  Serial.println("  show");
  Serial.println("  set wifi.ssid <value>");
  Serial.println("  set wifi.password <value>");
  Serial.println("  set global.auto_update <0|1>");
  Serial.println("  set device.<n>.enabled <0|1>");
  Serial.println("  set device.<n>.label <value>");
  Serial.println("  set device.<n>.u5_ip <value>");
  Serial.println("  set device.<n>.u5_password <value>");
  Serial.println("  set device.<n>.push_base_url <value>");
  Serial.println("  set device.<n>.api_key <value>");
  Serial.println("  set device.<n>.poll_ms <value>");
  Serial.println("  portal-on | portal-off");
  Serial.println("  poll-now | check-update | update-now");
  Serial.println("  clear-last <slot>");
  Serial.println("  reboot | factory-reset");
}

bool parseIndexedDeviceField(const String& key, size_t& indexOut, String& fieldOut) {
  if (!key.startsWith("device.")) {
    return false;
  }
  const int dot = key.indexOf('.', 7);
  if (dot <= 7) {
    return false;
  }
  const int index = key.substring(7, dot).toInt();
  if (index < 0 || static_cast<size_t>(index) >= kMaxDevices) {
    return false;
  }
  indexOut = static_cast<size_t>(index);
  fieldOut = key.substring(dot + 1);
  return true;
}

void applySetCommand(const String& key, const String& value) {
  if (key == "wifi.ssid") {
    gWifiSsid = value;
    saveGatewaySettings();
    WiFi.disconnect();
    gNextWifiAttemptMs = 0;
    Serial.println("[cmd] wifi.ssid updated");
    return;
  }
  if (key == "wifi.password") {
    gWifiPassword = value;
    saveGatewaySettings();
    WiFi.disconnect();
    gNextWifiAttemptMs = 0;
    Serial.println("[cmd] wifi.password updated");
    return;
  }
  if (key == "global.auto_update") {
    gAutoUpdate = value.toInt() != 0;
    saveGatewaySettings();
    Serial.println("[cmd] auto_update updated");
    return;
  }

  size_t index = 0;
  String field;
  if (!parseIndexedDeviceField(key, index, field)) {
    Serial.println("[cmd] unknown key");
    return;
  }

  DeviceSlotConfig& device = gDevices[index];
  if (field == "enabled") {
    device.enabled = value.toInt() != 0;
  } else if (field == "label") {
    device.label = value;
  } else if (field == "u5_ip") {
    device.u5Ip = value;
  } else if (field == "u5_password") {
    device.u5Password = value;
  } else if (field == "push_base_url") {
    device.pushBaseUrl = value;
  } else if (field == "api_key") {
    device.apiKey = value;
  } else if (field == "poll_ms") {
    device.pollIntervalMs = clampPollMs(static_cast<uint32_t>(value.toInt()));
  } else {
    Serial.println("[cmd] unknown device field");
    return;
  }
  device.nextPollMs = 0;
  saveDeviceConfig(index, device);
  refreshSetupCompleteFlag();
  ensurePortalState();
  Serial.printf("[cmd] updated device.%u.%s\n", static_cast<unsigned>(index), field.c_str());
}

void processCommand(String line) {
  line.trim();
  if (line.isEmpty()) {
    return;
  }
  if (line == "help") {
    printHelp();
    return;
  }
  if (line == "show") {
    printSummary();
    return;
  }
  if (line == "poll-now") {
    scheduleAllDevicesNow();
    Serial.println("[cmd] poll scheduled");
    return;
  }
  if (line == "portal-on") {
    gPortalForced = true;
    startSetupAp();
    Serial.println("[cmd] portal on");
    return;
  }
  if (line == "portal-off") {
    gPortalForced = false;
    if (gSetupComplete && WiFi.status() == WL_CONNECTED) {
      stopSetupAp();
    }
    Serial.println("[cmd] portal off requested");
    return;
  }
  if (line == "check-update") {
    FirmwareRelease latest;
    if (fetchLatestFirmwareRelease(latest)) {
      gCachedFirmwareRelease = latest;
      Serial.printf("[cmd] latest firmware: %s\n", latest.available ? latest.version.c_str() : "<none>");
    } else {
      Serial.printf("[cmd] check-update failed: %s\n", latest.error.c_str());
    }
    return;
  }
  if (line == "update-now") {
    if (!gCachedFirmwareRelease.available) {
      fetchLatestFirmwareRelease(gCachedFirmwareRelease);
    }
    gPendingOtaRequest = true;
    Serial.println("[cmd] ota update queued");
    return;
  }
  if (line == "reboot") {
    ESP.restart();
    return;
  }
  if (line == "factory-reset") {
    factoryReset();
    return;
  }
  if (line.startsWith("clear-last ")) {
    const int slot = line.substring(11).toInt();
    if (slot >= 0 && static_cast<size_t>(slot) < kMaxDevices) {
      saveLastCheckinUnix(static_cast<size_t>(slot), 0);
      Serial.println("[cmd] cleared");
    }
    return;
  }
  if (line.startsWith("set ")) {
    const int split = line.indexOf(' ', 4);
    if (split < 0) {
      Serial.println("[cmd] set requires <key> <value>");
      return;
    }
    applySetCommand(line.substring(4, split), line.substring(split + 1));
    return;
  }
  Serial.println("[cmd] supported: help, show, set, portal-on, portal-off, poll-now, check-update, update-now, clear-last, reboot, factory-reset");
}

void serviceSerial() {
  while (Serial.available() > 0) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r') {
      continue;
    }
    if (ch == '\n') {
      processCommand(gSerialLine);
      gSerialLine = "";
      continue;
    }
    if (gSerialLine.length() < 255) {
      gSerialLine += ch;
    }
  }
}

void serviceDns() {
  if (gDnsStarted) {
    gDnsServer.processNextRequest();
  }
}

void serviceLogicWatchdog() {
  if (WiFi.status() != WL_CONNECTED || !hasAnyReadyDevice()) {
    return;
  }
  if (gLastU5SuccessMs == 0 || gLastBackendSuccessMs == 0) {
    return;
  }
  if (static_cast<uint32_t>(millis() - gLastU5SuccessMs) > kLogicWatchdogMs &&
      static_cast<uint32_t>(millis() - gLastBackendSuccessMs) > kLogicWatchdogMs) {
    Serial.println("[wdt] both U5 and backend paths stale for too long; restarting");
    delay(200);
    ESP.restart();
  }
}

LedMode computeLedMode() {
  if (gOtaInProgress) {
    return LedMode::FastBlink;
  }
  if (WiFi.status() == WL_CONNECTED && hasAnyReadyDevice()) {
    return LedMode::Solid;
  }
  if (gApStarted || hasConfiguredWifi()) {
    return LedMode::SlowBlink;
  }
  return LedMode::FastBlink;
}

void applyLedState(const bool on) {
  if (kStatusLedPin < 0) {
    return;
  }
  gLedOn = on;
  digitalWrite(kStatusLedPin, on ? HIGH : LOW);
}

void serviceStatusLed() {
  const LedMode mode = computeLedMode();
  gLedMode = mode;
  if (kStatusLedPin < 0) {
    return;
  }
  if (mode == LedMode::Solid) {
    if (!gLedOn) {
      applyLedState(true);
    }
    return;
  }
  const uint32_t period = mode == LedMode::SlowBlink ? kLedSlowBlinkMs : kLedFastBlinkMs;
  const bool shouldBeOn = ((millis() / period) % 2U) == 0U;
  if (shouldBeOn != gLedOn) {
    applyLedState(shouldBeOn);
  }
}

void serviceBootButton() {
  const bool pressed = digitalRead(kBootButtonPin) == LOW;
  if (pressed) {
    if (gButtonDownMs == 0) {
      gButtonDownMs = millis();
      gButtonHandled = false;
    }
    if (!gButtonHandled && static_cast<uint32_t>(millis() - gButtonDownMs) >= kButtonHoldMs) {
      gButtonHandled = true;
      Serial.println("[button] boot button held -> factory reset");
      factoryReset();
    }
  } else {
    gButtonDownMs = 0;
    gButtonHandled = false;
  }
}

void initWatchdog() {
  esp_task_wdt_init(30, true);
  esp_task_wdt_add(nullptr);
}

}  // namespace

void gatewaySetup() {
  Serial.begin(kSerialBaudRate);
  delay(500);
  Serial.println();

  gLastResetReason = resetReasonToString(esp_reset_reason());
  gPortalSsid = buildPortalSsid();
  gPortalPassword = makeSetupPasswordSuffix();

  if (kStatusLedPin >= 0) {
    pinMode(kStatusLedPin, OUTPUT);
    applyLedState(false);
  }
  pinMode(kBootButtonPin, INPUT_PULLUP);

  Serial.println("Booting Jenix U5 Gateway...");
  Serial.printf("Reset reason: %s\n", gLastResetReason.c_str());

  seedBootstrapIfNeeded();
  loadConfig();
  ensurePortalState();
  beginWebServer();
  initWatchdog();
  printSummary();
}

void gatewayLoop() {
  esp_task_wdt_reset();
  serviceSerial();
  serviceDns();
  gWebServer.handleClient();
  serviceWifi();
  ensurePortalState();
  servicePendingApShutdown();
  pollDueDevices();
  serviceHeartbeat();
  serviceFirmwareUpdates();
  serviceLogicWatchdog();
  serviceBootButton();
  serviceStatusLed();
  delay(kLoopDelayMs);
}

}  // namespace gateway
