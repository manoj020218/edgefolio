#pragma once

#include <stddef.h>
#include <stdint.h>

struct BootstrapDeviceConfig {
  const char* label;
  bool enabled;
  const char* u5Ip;
  const char* u5Password;
  const char* pushBaseUrl;
  const char* apiKey;
  uint32_t pollIntervalMs;
};

// These are seed values only. The firmware copies them into Preferences once on first boot.
// After that, use the serial console commands to change runtime config without rebuilding.
constexpr const char* kBootstrapWifiSsid = "";
constexpr const char* kBootstrapWifiPassword = "";

constexpr BootstrapDeviceConfig kBootstrapDevices[] = {
    {
        "main-gate-u5",
        true,
        "192.168.1.92",
        "123456",
        "http://community.iotsoft.in/api/devices/push",
        "replace-with-device-api-key",
        15000,
    },
    {
        "service-gate-u5",
        false,
        "",
        "123456",
        "http://community.iotsoft.in/api/devices/push",
        "replace-with-second-device-api-key",
        15000,
    },
};

constexpr size_t kBootstrapDeviceCount = sizeof(kBootstrapDevices) / sizeof(kBootstrapDevices[0]);
