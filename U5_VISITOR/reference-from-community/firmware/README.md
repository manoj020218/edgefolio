# ESP32-S3 U5 Gateway Firmware

PlatformIO firmware for an `ESP32-S3 WROOM-1 N16R8` gateway that:

- polls one or more U5 terminals over LAN HTTP
- parses `getWorkNoteList` from the response stream so `pic_large` is never buffered
- forwards fresh attendance rows to the existing Jenix device push endpoint
- stores per-device dedupe state in `Preferences`
- exposes a browser-based setup portal for Wi‑Fi and per-device API keys

## Target board

- Module: `ESP32-S3 WROOM-1 N16R8`
- Flash / PSRAM: `16MB / 8MB`
- PlatformIO env: `esp32-s3-wroom-1-n16r8`

## Fast path

```powershell
cd firmware
pio run
pio run -t upload
pio device monitor -b 115200
```

If Wi‑Fi is not configured or connection fails, the board starts a SoftAP:

- SSID: `Jenix-U5-Setup-XXXX`
- Password: `jenix12345`
- Portal URL: `http://192.168.4.1/`

From the portal you can set:

- Wi‑Fi SSID and password
- U5 IP and password per slot
- Jenix push base URL
- Jenix device API key per slot
- poll interval

## Bootstrap config

The firmware seeds initial values from [BootstrapConfig.h](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/include/BootstrapConfig.h) on first boot only.

- Wi‑Fi defaults are blank
- push base defaults to `http://community.iotsoft.in/api/devices/push`
- API keys are placeholders and should be replaced from the web portal or serial console

## Serial fallback

```text
help
show
set wifi.ssid YourWifiName
set wifi.password YourWifiPassword
set device.0.enabled 1
set device.0.label main-gate-u5
set device.0.u5_ip 192.168.1.92
set device.0.u5_password 123456
set device.0.push_base_url http://community.iotsoft.in/api/devices/push
set device.0.api_key your-real-device-api-key
set device.0.poll_ms 15000
portal-on
clear-last 0
poll-now
reboot
```

## Notes

- This firmware expects plain `http://` push URLs, not `https://`.
- Each U5 terminal is polled serially. No concurrent requests are sent to a terminal.
- The full S3 flashing and setup procedure is documented in [HANDOFF.md](/D:/IOT%20Device/Society/Jenix%20Community%20One/firmware/HANDOFF.md).
