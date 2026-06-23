# Apple Home Card

An Apple Home–inspired tile card for [Home Assistant](https://www.home-assistant.io/). Turns ordinary lights, switches, covers, locks and sensors into rounded frosted-glass tiles that **fill with color when they're on** — the signature Apple Home look — with tap-to-toggle, hold-for-details, and a brightness-aware fill.

![Apple Home Card](docs/preview.png)

> Status: **v0.1.0** — early but usable. Feedback and PRs welcome.

## Features

- 🟦 **State-driven color fill** — tiles tint to an accent when active; lights scale the fill with brightness.
- 🍏 **Apple-style tile language** — big corner radius, frosted backdrop, circular icon badge, soft depth.
- 👆 **Native interactions** — tap toggles, hold opens more-info, double-tap configurable; haptics on supported devices.
- 🎛️ **GUI editor** — full visual config in the dashboard editor, no YAML required.
- 🌗 **Light & dark** — ships with a companion theme tuned for both.
- 🧩 **Broad domain support** — light, switch, fan, cover, lock, climate, media_player, sensor, binary_sensor, person, and more.
- ⚡ **Zero-build, zero-dependency** — a single `.js` file. No Node, no compile step.

## Installation

### Via HACS (recommended)

1. HACS → **Frontend** → ⋮ → **Custom repositories**.
2. Add this repo URL, category **Dashboard** (Lovelace).
3. Install **Apple Home Card**. HACS adds the resource automatically.
4. Hard-refresh your browser (Ctrl/Cmd-Shift-R).

### Manual

1. Copy `apple-home-card.js` to `<config>/www/`.
2. Settings → Dashboards → ⋮ → **Resources** → Add:
   - URL `/local/apple-home-card.js`, type **JavaScript Module**.
3. Hard-refresh.

## Usage

Add a card and pick **Apple Home Card**, or in YAML:

```yaml
type: custom:apple-home-card
entity: light.living_room
```

### Options

| Option              | Type   | Default                  | Description                                                    |
| ------------------- | ------ | ------------------------ | -------------------------------------------------------------- |
| `entity`            | string | **required**             | Any entity.                                                    |
| `name`              | string | friendly name            | Override the title.                                            |
| `icon`              | string | inferred                 | Override the icon (e.g. `mdi:sofa`).                           |
| `color`             | string | per-domain               | Accent color when on (hex, e.g. `#ffd60a`).                    |
| `tap_action`        | object | `{action: toggle}`       | Standard HA action object.                                     |
| `hold_action`       | object | `{action: more-info}`    | Standard HA action object.                                     |
| `double_tap_action` | object | `{action: more-info}`    | Standard HA action object.                                     |

### Example

See [`examples/dashboard.yaml`](examples/dashboard.yaml) for a full sections-view layout.

## Companion theme (optional but recommended)

The card looks good on any theme, but `themes/apple-home.yaml` rounds the rest of the UI and provides matching light/dark tokens.

1. Copy `themes/apple-home.yaml` into `<config>/themes/`.
2. In `configuration.yaml`:
   ```yaml
   frontend:
     themes: !include_dir_merge_named themes
   ```
3. Restart, then profile → **Theme** → **Apple Home**.

## Roadmap

- [ ] Hold-to-open custom control sheet (sliders for brightness/color/temp) instead of more-info
- [ ] Wider "feature" tiles (climate with target temp controls, media with transport)
- [ ] Per-tile size hints / aspect options
- [ ] Bundled build option for stricter CSP setups

## Why a single file?

It borrows `LitElement` from Home Assistant's own runtime, so there's no dependency to bundle and no build step to run — install is literally one file. If you later want a CSP-strict bundled build, the source is structured to migrate cleanly.

## License

MIT — see [LICENSE](LICENSE).
