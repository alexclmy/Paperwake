# NOTE4C Control Tower

**Design, push and verify dashboards for the NOTE4C 400×300 four-colour (black / white / red / yellow) e-paper panel, from a local, private web app.**

![The "Good day" composition on a NOTE4C panel, rendered by the real panel renderer](docs/images/showcase/hero.png)

NOTE4C Control Tower is the composer half of [Paperwake](../README.md), an open-source companion app for the NOTE4C e-paper
devkit. It runs on your own machine. You lay out what the panel shows in a
visual editor, the tower sends that exact frame to the device on your LAN, and
then it reads back what the device reports. "Displayed" means the panel
confirmed it.

> Unofficial: not affiliated with, endorsed by, or supported by the NOTE4C
> devkit vendor.

Every picture on this page comes out of `npm run screenshots:all`, which uses
made-up sample data: a Lisbon forecast, an invented agenda and invented
sensors. None of it comes from a real home.

## Contents

- [Features](#features)
- [Showcase](#showcase)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Security and privacy](#security-and-privacy)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

**A modern editor where the preview *is* the renderer.** The canvas runs the
same TypeScript that packs the 30 000 bytes sent to the device, scaled up with
nearest-neighbour. There is no separate preview that could disagree with the
panel.

![The editor with the Headline block selected and its inspector open](docs/images/ui/desktop-editor.png)

- **16×12 grid + Auto layout.** Blocks snap to 25-pixel cells. You can move and
  resize them with the mouse or the keyboard. *Auto layout* re-packs a
  composition into tidy rows, and the *Auto* variants choose a format that
  suits each block's size.
- **Blocks:** headline, message, list, countdown, image,
  timestamp, sky, weather (hero, one-line or day summary, 24 h chart,
  7-day strip), next calendar events, Home Assistant sensors, and messages
  that show or hide depending on your Reminders.
- **Image library (CC0).** 25 original illustrations drawn for this panel,
  including a mascot, coffee, birthday balloons, do-not-disturb and seasonal
  pictures. Each one is pre-dithered at several sizes. You can also upload
  your own picture.

  ![The image library picker in the inspector](docs/images/ui/desktop-image-library.png)

- **Sources:** Open-Meteo weather (no API key), a local calendar snapshot,
  Home Assistant `sensor.*` readings and Apple Reminders counts. When data is
  missing or stale, the panel says so. It never shows a made-up value.

  | Weather formats | Home Assistant sensor picker |
  | --- | --- |
  | ![Compact weather format picker](docs/images/ui/desktop-weather-formats.png) | ![Home Assistant entity picker with sample sensors](docs/images/ui/desktop-home-assistant.png) |

- **Panel language FR / EN.** One switch translates every word the blocks
  write on the panel: days, months, weather conditions and empty states. Text
  you typed yourself is not touched.
- **Push verification: Sent → Received → Displayed.** Each stage lights up
  when the append-only ledger records it, not on a timer. If a confirmation
  never arrives, the push is marked *uncertain* (neither failed nor
  succeeded), and the next push waits until you re-check the device. A frame
  identical to the one already shown is not re-sent, because every e-paper
  refresh costs time and battery.
- **Honest power model.** Wi-Fi cannot wake a sleeping device. So the tower
  records your request as an *intent* and delivers it when the device next
  wakes. You set the wake interval and energy profile on the Device page.

  ![The Device page](docs/images/ui/desktop-device.png)

- **Secure by default.** It binds `localhost`. Every request that changes
  something needs the passphrase session and a CSRF token. Secrets stay on the
  server. There is no telemetry and the browser loads no third-party assets.
  You can reach it remotely through a private network you control, for
  example a Tailscale tailnet, without opening it to your LAN. See
  [Security and privacy](#security-and-privacy).
- **Works without hardware.** An in-repo mock device implements the same
  HTTP API. Every reading from it is labelled `SIMULATED`, which is the yellow
  strip you see in the screenshots.

| Home | Compositions |
| --- | --- |
| ![Home page](docs/images/ui/desktop-home.png) | ![Compositions gallery](docs/images/ui/desktop-compositions.png) |

## Showcase

Seven compositions from [`tools/showcase.ts`](tools/showcase.ts), rendered
by the real panel renderer. Each one exists at 1×, the panel's own 400×300
pixels, and at 2× with nearest-neighbour scaling:

| | | |
| --- | --- | --- |
| ![Home dashboard](docs/images/showcase/home-dashboard@2x.png) **Home dashboard**: weather hero, agenda, sensors, week | ![Good day](docs/images/showcase/good-day@2x.png) **Good day**: library picture, one line | ![Welcome to NOTE4C](docs/images/showcase/welcome@2x.png) **Welcome**: the mascot |
| ![Happy birthday](docs/images/showcase/happy-birthday@2x.png) **Happy birthday** | ![Weekend](docs/images/showcase/weekend@2x.png) **Weekend**: picture, week, checklist | ![Focus](docs/images/showcase/focus@2x.png) **Focus / Do not disturb** |
| ![Kitchen](docs/images/showcase/kitchen@2x.png) **Kitchen**: weather, shopping list, sensors | | |

## Quick start

Requires **Node 20+**. You don't need the hardware: when nothing is
configured, the tower talks to the in-repo mock device.

```bash
git clone https://github.com/alexclmy/Paperwake.git
cd Paperwake/control-tower
npm install
npm run dev          # http://localhost:8654
```

1. On first run, set a tower passphrase. It protects the device token and
   every push. There is no account and no recovery, because it is a local
   tool.
2. Go to **Compositions → + New composition** and pick a starting template
   (*Weather & agenda*, *Fridge morning*, *Welcome to NOTE4C*, *Birthday*…).
3. Edit in the canvas and the inspector and press **Save**. Then press **Show
   on panel** and watch it go through Sent → Received → Displayed.

To run a production build, build once and start the guarded server:

```bash
npm run build
npm start            # same bind policy as npm run dev
```

**[QUICKSTART.md](QUICKSTART.md)** has the ten-minute walkthrough, followed by
the steps for a real device.

## Configuration

Every setting specific to your machine is an environment variable. Nothing has
a hidden default. Copy the template and uncomment what you need:

```bash
cp .env.example .env.local
```

[`.env.example`](.env.example) documents every variable: what it does and what
happens when it is unset. The main ones:

| Variable | Purpose | Default |
| --- | --- | --- |
| `NOTE4C_DEVICE_ADDRESS` | The panel's private IPv4 address on your LAN (an RFC1918 literal only) | unset → mock device |
| `NOTE4C_BRIDGE_TOKEN_PATH` | File holding the device token | unset |
| `NOTE4C_TOWER_DATA_DIR` | Private data root (mode 0700) | `~/.note4c-control-tower` |
| `NOTE4C_TOWER_HOST` / `NOTE4C_TOWER_PORT` | Bind address and port | `localhost` / `8654` |
| `NOTE4C_TOWER_ALLOW_LAN` | Set to `1` to allow binding a non-loopback address (a passphrase is also required) | unset |
| `NOTE4C_PANEL_TIMEZONE` | Time zone for the times drawn on the panel | host zone |
| `NOTE4C_WEATHER_LATITUDE` / `NOTE4C_WEATHER_LONGITUDE` | Turn on the Open-Meteo forecast | unset → no forecast |
| `NOTE4C_WEATHER_LABEL` | Place name shown with the forecast | none |
| `NOTE4C_WEATHER_FALLBACK_URL` | Optional fallback forecast URL of your choice | unset |
| `NOTE4C_CALENDAR_SNAPSHOT_PATH` / `NOTE4C_CALENDAR_NAME` | Local calendar snapshot (JSON) and the calendar to show | unset |
| `NOTE4C_REMINDCTL_BIN` | Absolute path to `remindctl` for Apple Reminders counts | unset → nothing is run |
| `NOTE4C_HA_URL` / `NOTE4C_HA_TOKEN` | Home Assistant URL and long-lived token (`HASS_URL` / `HASS_TOKEN` also work) | unset |
| `NOTE4C_HA_ENV_PATH` | Read the Home Assistant URL and token from an existing `.env` file | unset |
| `NOTE4C_COMPOSER_ORIGIN` | Optional second renderer on your machine or LAN (read-only) | unset |

With no configuration, the tower uses the mock device, reports every source
as "not configured" (not as broken), and makes no network requests.

## Architecture

```
 sources ─┐                                ┌─ browser (editor, Home, Device)
 weather  │   ┌──────────────────────┐     │   same renderer → canvas preview
 calendar ├──▶│ renderer (src/core)  │─────┤
 HA, Rem. │   │ modules → 4-colour   │     └─ push pipeline (src/server/device)
          │   │ frame buffer → pack()│          30 000 bytes → panel over LAN
          ┘   └──────────────────────┘          ledger: Sent → Received → Displayed
```

```
app/                     Next.js routes and API handlers
src/core/                palette, frame buffer, pack(), model, renderer, modules, image library
src/server/config.ts     every environment variable, in one place
src/server/store/        atomic file store: dashboards, append-only versions
src/server/device/       device client, SSRF guard, push ledger, push pipeline
src/server/sources/      weather, calendar snapshot, Home Assistant, Reminders, fixtures
src/server/auth/         passphrase, sessions, CSRF, bind guard
src/ui/                  design system and shared components
mock-device/             in-repo mock of the device HTTP API
assets/                  vendored OFL fonts, CC0 image library sources
tools/                   launcher, screenshots, showcase renders, QA tools
tests/                   Vitest unit suite and Playwright browser suite
```

Your data lives outside the repository, in `~/.note4c-control-tower/`. That
folder holds dashboards, versions, the push ledger, the audit log, and secrets
stored with mode 0600. Further reading:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the internals,
[docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the device and firmware
matrix, and [docs/DESIGN-LANGUAGE.md](docs/DESIGN-LANGUAGE.md) for the visual
rules.

## Security and privacy

- **Loopback by default, enforced.** `npm run dev` and `npm start` both go
  through `tools/tower-serve.ts`, which checks the bind address *before* Next
  starts. Binding anything other than `localhost` requires both a passphrase
  and `NOTE4C_TOWER_ALLOW_LAN=1`. Binding every interface is always refused.
- **Remote access without LAN exposure.** The tower does not set up any
  tunnel or proxy. To reach it from your phone, leave it on loopback and
  publish it through a private network you control, such as Tailscale
  (`tailscale serve`). Then only your own devices can reach the login page.
- **Strict device client.** The device address must be a private IPv4
  literal. Hostnames are refused, which rules out DNS rebinding. The client
  uses port 80 and a fixed list of allowed paths, never follows redirects,
  and sends one request at a time.
- **Four optional outbound connections, all read-only:** Open-Meteo, a
  fallback forecast URL you choose, your Home Assistant, and a second renderer
  on your own network. Each is off until you configure it. Only Home Assistant
  uses a credential. Its token is read on each request and never sent to the
  browser. Only `sensor.*` and `binary_sensor.*` entities can be read.
- **Reminders** are read through `remindctl` at an absolute path, limited to
  read-only subcommands. Notes are discarded as soon as the output is parsed,
  and only counts reach the browser.
- **No telemetry, no CDN.** Fonts are served from the repository.

Threat model and private disclosure: [SECURITY.md](SECURITY.md).

## Development

```bash
npm run typecheck        # tsc --noEmit
npm test                 # Vitest unit suite
npm run build:check      # production build into a scratch directory
npm run test:e2e         # Playwright: desktop, phone, tablet, against the mock
npm run mock-device      # run the mock device on its own
npm run showcase         # docs/images/showcase/*: panel renders + hero
npm run screenshots      # docs/images/ui/*: UI screenshots on a throwaway tower
npm run screenshots:all  # both
```

`npm run screenshots` starts its own dev server on port 8658 with a throwaway
data directory and fixture sources (`NOTE4C_TOWER_E2E=1`,
`NOTE4C_TOWER_SHOWCASE=1`). Every real source is switched off, and it seeds
the showcase compositions before capturing. It cannot interfere with a tower
you are already running, and it cannot photograph your home.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
for setup, the required test checks and the house style (honest states,
comments that explain *why*), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Status

Working prototype. The mock path is covered by a unit suite and by a browser
suite across three viewports. The real-device path, including the hybrid
low-power mode, has been tested on one physical panel. No battery-life figure
is published. [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) lists exactly what
has been tested.

## License

Code: **MIT**, see [LICENSE](LICENSE). Image library
(`assets/image-library/`, `src/core/library/art/`): **CC0 1.0**, see
[assets/image-library/LICENSE](assets/image-library/LICENSE). Vendored fonts:
SIL OFL 1.1, attributions in [NOTICE](NOTICE).
