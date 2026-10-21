# LAN Photo Push API

This document describes the HTTP interface exposed by the 2BP photo-album
firmware when the device is in LAN Wi-Fi mode, so that a NAS, a script or any
service on the local network can push pictures to the device on a schedule.

## Prerequisites

The device must first be connected to the local Wi-Fi network. Then, on the
device's settings page, turn on `局域网服务` ("LAN service"). Once it is on, the
settings page shows the device's current LAN IP, for example:

```text
<panel-ip>
```

All the endpoints below are relative to that IP:

```text
http://<panel-ip>
```

With the LAN service on, opening `http://<device-ip>/` in a browser shows the
picture management page. A NAS or a script can also call the API below
directly.

## Image format requirements

The `/upload` endpoint does not accept common image files such as JPG, PNG or
WEBP directly. It accepts raw screen pixel data that has already been
converted.

The device's screen size is fixed:

```text
400 x 300
```

Two upload formats are supported:

| format | Meaning | File size |
| --- | --- | --- |
| `1bpp` | Black and white, 1 bit per pixel | `15000 bytes` |
| `bwry2bpp` or `2bpp` | Black / white / yellow / red four-colour, 2 bits per pixel | `30000 bytes` |

To push ordinary pictures from a NAS on a schedule, convert the JPG/PNG to one
of the bin formats above on the NAS first, then call `/upload`.

## Quick service check

```bash
curl "http://<panel-ip>/status"
```

Example successful response:

```json
{
  "status": "ready",
  "mode": "lan",
  "ip": "<panel-ip>",
  "url": "http://<panel-ip>/"
}
```

`mode=lan` means the LAN HTTP service is running; `mode=ap` means hotspot
(access-point) picture-transfer mode.

## Upload a picture

Upload a 2BP four-colour picture:

```bash
curl -X POST \
  "http://<panel-ip>/upload?format=bwry2bpp" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/path/to/image_400x300_2bpp.bin"
```

Upload a 1BP black-and-white picture:

```bash
curl -X POST \
  "http://<panel-ip>/upload?format=1bpp" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@/path/to/image_400x300_1bpp.bin"
```

Example successful response:

```json
{
  "success": true,
  "id": "ap12345678901"
}
```

Common causes of failure:

| Cause | Symptom |
| --- | --- |
| Wrong file size | Returns `需要400x300 2bpp四色数据` ("400x300 2bpp four-colour data required") or `需要400x300 1bpp数据` ("400x300 1bpp data required") |
| Device HTTP service not enabled | The NAS cannot connect to the device IP |
| IP changed | Re-read the LAN IP shown on the device's settings page |
| Album storage full | The device fails to save the picture |

## List pictures

```bash
curl "http://<panel-ip>/photos"
```

Example response (the Chinese strings are the default metadata the firmware
assigns to a Wi-Fi upload: "Wi-Fi four-colour picture" and "Phone Wi-Fi
transfer · 2 BP four-colour"):

```json
{
  "photos": [
    {
      "id": "ap12345678901",
      "title": "WiFi四色图片",
      "date": "2026-05-21",
      "location": "WiFi AP",
      "body": "手机 WiFi 传图 · 2 BP 四色",
      "width": 400,
      "height": 300,
      "size": 30000,
      "format": "bwry2bpp"
    }
  ]
}
```

Fields:

| Field | Meaning |
| --- | --- |
| `id` | Picture ID, used to read, delete or edit the picture |
| `title` | Picture title |
| `date` | Date string |
| `location` | Location |
| `body` | Description |
| `width` / `height` | Picture dimensions |
| `size` | Raw data size |
| `format` | `1bpp` or `bwry2bpp` |

## Download a picture's raw data

```bash
curl \
  "http://<panel-ip>/photo?id=ap12345678901" \
  --output image.bin
```

The response is the raw bin data the picture was saved with.

## Delete a picture

```bash
curl -X DELETE \
  "http://<panel-ip>/photo?id=ap12345678901"
```

Successful response:

```json
{"success":true}
```

## Update picture metadata

```bash
curl -X POST "http://<panel-ip>/photo/meta" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ap12345678901",
    "title": "Daily photo",
    "date": "2026-05-21",
    "location": "NAS",
    "body": "Daily automatic push from the NAS"
  }'
```

Successful response:

```json
{"success":true}
```

## Reorder pictures

Move up one position:

```bash
curl -X POST "http://<panel-ip>/photos/move" \
  -H "Content-Type: application/json" \
  -d '{"id":"ap12345678901","delta":-1}'
```

Move down one position:

```bash
curl -X POST "http://<panel-ip>/photos/move" \
  -H "Content-Type: application/json" \
  -d '{"id":"ap12345678901","delta":1}'
```

## Set the slideshow interval

Read the current slideshow settings:

```bash
curl "http://<panel-ip>/settings"
```

Example response:

```json
{
  "success": true,
  "slideshow_interval": 5,
  "service_running": true,
  "mode": "lan",
  "ip": "<panel-ip>",
  "url": "http://<panel-ip>/"
}
```

Set the slideshow interval:

```bash
curl -X POST "http://<panel-ip>/settings" \
  -H "Content-Type: application/json" \
  -d '{"slideshow_interval":5}'
```

Turn off the local HTTP service:

```bash
curl -X POST "http://<panel-ip>/settings" \
  -H "Content-Type: application/json" \
  -d '{"service_enabled":false}'
```

Turn off the service, turn off Wi-Fi and enter power-saving mode immediately:

```bash
curl -X POST "http://<panel-ip>/settings" \
  -H "Content-Type: application/json" \
  -d '{"service_enabled":false,"wifi_enabled":false,"sleep":true}'
```

Supported `slideshow_interval` values:

| Value | Meaning |
| --- | --- |
| `0` | Slideshow off |
| `5` | 5 minutes |
| `10` | 10 minutes |
| `30` | 30 minutes |

## Example NAS scheduled job

This directory provides a reusable conversion script:

```text
docs/inkscreen_image_converter.js
```

It is extracted from the conversion algorithm in the device's management HTML
page, and turns an ordinary picture into the raw bin the device's `/upload`
endpoint expects. Command-line mode relies on `sharp` to decode and resize the
picture:

```bash
npm install sharp
node docs/inkscreen_image_converter.js input.jpg daily_400x300_2bpp.bin bwry2bpp
```

It can also produce black-and-white 1BP:

```bash
node docs/inkscreen_image_converter.js input.jpg daily_400x300_1bpp.bin 1bpp
```

Assuming the NAS has already produced a `daily_400x300_2bpp.bin`, cron can push
it once a day:

```bash
#!/bin/sh
DEVICE="<panel-ip>"
BIN="/volume1/photo/daily_400x300_2bpp.bin"

curl -fsS -X POST \
  "http://${DEVICE}/upload?format=bwry2bpp" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${BIN}"
```

To add a description after the upload, parse the returned `id` first, then
call `/photo/meta`. For example:

```bash
#!/bin/sh
DEVICE="<panel-ip>"
BIN="/volume1/photo/daily_400x300_2bpp.bin"

RESP=$(curl -fsS -X POST \
  "http://${DEVICE}/upload?format=bwry2bpp" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${BIN}")

ID=$(printf "%s" "$RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

if [ -n "$ID" ]; then
  TODAY=$(date +%F)
  curl -fsS -X POST "http://${DEVICE}/photo/meta" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${ID}\",\"title\":\"Daily photo\",\"date\":\"${TODAY}\",\"location\":\"NAS\",\"body\":\"Automatic push from the NAS\"}"
fi
```

## Suggested future improvements

The API already supports scheduled pushes from a NAS, but letting the NAS send
JPG/PNG directly would need a new conversion step, either in the firmware or on
the NAS.

Options:

1. Convert on the NAS: a script on the NAS turns the JPG/PNG into a
   `400x300 bwry2bpp bin`, then calls `/upload`. This uses the least device
   memory.
2. Add a firmware endpoint `/upload-image`: the device accepts JPG/PNG directly
   and converts it. More convenient to develop against, but decoding and
   memory cost more on the ESP32.

Option 1 is currently recommended.
