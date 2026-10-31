#include <Arduino.h>
#include <WiFi.h>
#include <esp_mac.h>

namespace {

char gSsid[32] = {};
uint32_t gLastLogMs = 0;

void buildSsid() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(gSsid, sizeof(gSsid), "Jenix-AP-Diag-%02X%02X%02X", mac[3], mac[4], mac[5]);
}

void logStatus() {
  Serial.printf("[AP-DIAG] ssid=%s status=%d ip=%s stations=%d\n", gSsid, WiFi.status(),
                WiFi.softAPIP().toString().c_str(), WiFi.softAPgetStationNum());
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("=== Jenix AP Diagnostic ===");

  buildSsid();

  WiFi.persistent(false);
  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);

  const bool apOk = WiFi.softAP(gSsid);
  Serial.printf("[AP-DIAG] softAP()=%s\n", apOk ? "true" : "false");
  logStatus();
}

void loop() {
  if (millis() - gLastLogMs >= 2000UL) {
    gLastLogMs = millis();
    logStatus();
  }
  delay(50);
}
