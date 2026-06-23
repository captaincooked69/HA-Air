# Apple Home Card

An Apple Home–inspired tile card for [Home Assistant](https://www.home-assistant.io/). Turns ordinary lights, switches, covers, locks and sensors into rounded frosted-glass tiles that **fill with color when they're on** — the signature Apple Home look — with tap-to-toggle, hold-for-details, and a brightness-aware fill.

![Apple Home Card](docs/preview.png)

> Status: **v0.1.0** — early but usable. Feedback and PRs welcome.

## Features

- 🟦 **State-driven color fill** — tiles tint to an accent when active; lights scale the fill with brightness.
- 🍏 **Apple-style tile language** — big corner radius, frosted backdrop, circular icon badge, soft depth.
- 🎚️ **Detail sheet ("delve in")** — tap-and-hold slides up a frosted control panel: a big draggable brightness slider with color + temperature for lights, media transport + volume, cover position, climate +/-, vacuum controls. Falls through to full HA settings.
- 🔭 **Scalable tiles** — `size: small → hero`, and the contents auto-scale to the cell via container queries, so they look right whether you set a size or drag-resize in the UI.
- 💎 **Reactive glass icons** — one shared light source (your pointer) sweeps a specular highlight across every icon at once, so neighbouring icons catch the light together; a static frosted sheen keeps them glassy at rest.
- ✨ **Subtle motion** — spring press, a gentle badge "pop" and icon spin on state change, scene pulses — all quiet, all respecting `prefers-reduced-motion`.
- 🌌 **Geometric/glass backgrounds** — a full-dashboard backdrop with six presets (aurora, sunset, ocean, midnight, mesh, mono) and an inline selector.
- 👆 **Native interactions** — tap toggles, hold opens the detail sheet, double-tap configurable; haptics on supported devices; scenes/scripts pulse on activation.
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

## Card types

The package ships four cards, all sharing the same frosted look and the detail sheet:

| Card | For | Notes |
|------|-----|-------|
| `custom:apple-home-card` | Anything | The universal accessory tile. |
| `custom:apple-home-media-card` | `media_player` | Wide tile: artwork background + inline ⏮ ⏯ ⏭. |
| `custom:apple-home-climate-card` | `climate` | Current/target temperature with inline − / +. |
| `custom:apple-home-area-card` | A group of entities | Room summary ("2 of 3 on"); tap toggles the group or navigates. |
| `custom:apple-home-background` | The whole dashboard | Full-screen geometric/glass backdrop + a preset selector. |

## Usage

Add a card and pick **Apple Home Card**, or in YAML:

```yaml
type: custom:apple-home-card
entity: light.living_room
```

### Media tile

```yaml
type: custom:apple-home-media-card
entity: media_player.sonos_arc
```

### Area / room tile

```yaml
type: custom:apple-home-area-card
name: Living Room
icon: mdi:sofa
entities:               # used for the "N of M on" summary + group toggle
  - light.living_room
  - light.lamp
  - switch.tv
# navigation_path: /lovelace/living-room   # optional: tap navigates instead of toggling
```

### Background

Drop one of these anywhere on a dashboard. It paints a full-screen backdrop behind
**every** view and (optionally) shows a preset picker. The choice is saved per-browser.

```yaml
type: custom:apple-home-background
background: aurora      # aurora · sunset · ocean · midnight · mesh · mono
selector: true          # show the inline preset picker
```

The backdrop makes HA's own surfaces transparent so the frosted tiles glass over it — pair
it with the companion theme for the cleanest result. Both the backdrop drift and the tile
"pop" animations honour `prefers-reduced-motion`.

### Options

| Option              | Type   | Default                  | Description                                                    |
| ------------------- | ------ | ------------------------ | -------------------------------------------------------------- |
| `entity`            | string | **required**             | Any entity.                                                    |
| `name`              | string | friendly name            | Override the title.                                            |
| `icon`              | string | inferred                 | Override the icon (e.g. `mdi:sofa`).                           |
| `color`             | string | per-domain               | Accent color when on (hex, e.g. `#ffd60a`).                    |
| `size`              | string | `medium`                 | Tile footprint: `small` · `medium` · `large` · `wide` · `hero`. |
| `tap_action`        | object | `{action: toggle}`       | Standard HA action object.                                     |
| `hold_action`       | object | `{action: more-info}`    | Standard HA action object.                                     |
| `double_tap_action` | object | `{action: more-info}`    | Standard HA action object.                                     |

### Sizing

```yaml
- type: custom:apple-home-card
  entity: weather.home
  size: large        # small · medium · large · wide · hero
```

`size` sets the grid footprint; the tile's icon, text and padding scale to fit automatically.
In a **sections** dashboard you can also just drag the resize handle — the content adapts the
same way, because each tile is a CSS size container.

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

- [x] Hold-to-open detail sheet (brightness/color/temp, media, cover, climate, vacuum)
- [x] Wider "feature" tiles — inline media transport + thermostat tile
- [x] Group/area tiles (one tile summarising a whole room)
- [ ] Auto-populate area tiles from HA areas (no manual entity list)
- [ ] Per-tile size hints / aspect options
- [ ] Bundled build option for stricter CSP setups

## Why a single file?

It borrows `LitElement` from Home Assistant's own runtime, so there's no dependency to bundle and no build step to run — install is literally one file. If you later want a CSP-strict bundled build, the source is structured to migrate cleanly.

## License

MIT — see [LICENSE](LICENSE).
