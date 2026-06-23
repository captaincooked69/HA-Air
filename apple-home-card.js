/**
 * Apple Home Card
 * An Apple Home-inspired tile card for Home Assistant.
 *
 * Zero-build: borrows LitElement from Home Assistant's own runtime, so it ships
 * as a single .js resource with no compile step and no external dependencies.
 *
 * @license MIT
 */

const HELPERS = window.loadCardHelpers ? window.loadCardHelpers() : undefined;

// Grab Lit from a base element Home Assistant has already loaded.
const LitElement =
  customElements.get("ha-panel-lovelace") &&
  Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const VERSION = "0.6.0";

/* eslint-disable no-console */
console.info(
  `%c APPLE-HOME-CARD %c v${VERSION} `,
  "color:white;background:#0a84ff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
  "color:#0a84ff;background:#1c1c1e;border-radius:0 4px 4px 0;padding:2px 6px;"
);

// Domains we treat as toggleable, with the right "on" detection + service.
const DOMAIN_BEHAVIOR = {
  light: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  switch: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  input_boolean: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  fan: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  automation: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  // Momentary: tap fires once and the tile pulses, rather than staying "on".
  script: { on: (s) => s.state === "on", toggle: ["script", "turn_on"], momentary: true },
  scene: { on: () => false, toggle: ["scene", "turn_on"], momentary: true },
  button: { on: () => false, toggle: ["button", "press"], momentary: true },
  input_button: { on: () => false, toggle: ["input_button", "press"], momentary: true },
  lock: {
    on: (s) => s.state === "unlocked",
    toggle: (s) => ["lock", s.state === "locked" ? "unlock" : "lock"],
  },
  cover: {
    on: (s) => ["open", "opening"].includes(s.state),
    toggle: (s) => ["cover", ["closed", "closing"].includes(s.state) ? "open_cover" : "close_cover"],
  },
  vacuum: {
    on: (s) => ["cleaning", "returning"].includes(s.state),
    toggle: (s) => ["vacuum", s.state === "cleaning" ? "return_to_base" : "start"],
  },
  climate: { on: (s) => s.state !== "off", toggle: null },
  media_player: { on: (s) => !["off", "idle", "standby", "unavailable"].includes(s.state), toggle: ["media_player", "media_play_pause"] },
  alarm_control_panel: { on: (s) => !["disarmed", "unavailable"].includes(s.state), toggle: null },
  binary_sensor: { on: (s) => s.state === "on", toggle: null },
  person: { on: (s) => s.state === "home", toggle: null },
  device_tracker: { on: (s) => s.state === "home", toggle: null },
};

// Apple-ish default accent per domain (used when no `color` configured).
const DOMAIN_ACCENT = {
  light: "#ffd60a", // warm
  switch: "#0a84ff",
  input_boolean: "#0a84ff",
  fan: "#64d2ff",
  lock: "#30d158",
  cover: "#0a84ff",
  vacuum: "#64d2ff",
  climate: "#ff9f0a",
  media_player: "#bf5af2",
  automation: "#5e5ce6",
  script: "#ff9f0a",
  scene: "#ff9f0a",
  button: "#8e8e93",
  input_button: "#8e8e93",
  alarm_control_panel: "#ff453a",
  binary_sensor: "#30d158",
  person: "#30d158",
  device_tracker: "#30d158",
  _default: "#0a84ff",
};

function domainOf(entityId) {
  return entityId ? entityId.split(".")[0] : "";
}

// Shared "is this entity active?" using the same rules as the tile.
function isEntityOn(stateObj) {
  if (!stateObj) return false;
  const b = DOMAIN_BEHAVIOR[domainOf(stateObj.entity_id)];
  return b ? b.on(stateObj) : stateObj.state === "on";
}

// Open the Apple Home detail sheet for an entity. Returns the element so the
// caller can keep feeding it fresh `hass`.
function createSheet(hass, entityId, accent, onClosed) {
  const sheet = document.createElement("apple-home-sheet");
  sheet.hass = hass;
  sheet.entityId = entityId;
  sheet.accent = accent;
  if (onClosed) sheet.addEventListener("sheet-closed", onClosed);
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.show());
  return sheet;
}

// A CSSResult so it can be interpolated into other css`` blocks.
const FONT_STACK_CSS = css`-apple-system, BlinkMacSystemFont, "SF Pro Display",
  "Segoe UI", Roboto, sans-serif`;

// Named tile footprints for the sections grid (12-col). `size: large` etc.
const TILE_SIZES = {
  small: { columns: 2, rows: 2 },
  medium: { columns: 3, rows: 2 },
  large: { columns: 4, rows: 3 },
  wide: { columns: 6, rows: 2 },
  hero: { columns: 6, rows: 4 },
};

function gridFor(size, fallback) {
  return { ...(TILE_SIZES[size] || fallback), min_columns: 2, min_rows: 1 };
}

// ---------------------------------------------------------------------------
// LightField — a single shared light source (the pointer) drives a specular
// highlight on every registered icon badge, so the glass icons appear to react
// to one another. One pointer listener + a cached-rect rAF loop keeps it cheap.
// ---------------------------------------------------------------------------
const LightField = (() => {
  const badges = new Set();
  const rects = new Map();
  let px = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  let py = -180; // gentle ambient light from above when idle
  let raf = 0;
  let rectsDirty = true;
  let inited = false;
  const RANGE = 360;

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function markRects() {
    rectsDirty = true;
    schedule();
  }
  function frame() {
    raf = 0;
    if (rectsDirty) {
      rects.clear();
      badges.forEach((b) => {
        if (b.isConnected) rects.set(b, b.getBoundingClientRect());
      });
      rectsDirty = false;
    }
    badges.forEach((b) => {
      const r = rects.get(b);
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(px - cx, py - cy);
      const glow = Math.max(0, Math.min(1, 1 - dist / RANGE));
      b.style.setProperty("--sx", `${px - r.left}px`);
      b.style.setProperty("--sy", `${py - r.top}px`);
      b.style.setProperty("--glow", glow.toFixed(3));
    });
  }
  function onMove(e) {
    px = e.clientX;
    py = e.clientY;
    schedule();
  }
  function init() {
    if (inited || typeof window === "undefined") return;
    inited = true;
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", markRects, { passive: true, capture: true });
    window.addEventListener("resize", markRects, { passive: true });
  }
  return {
    register(b) {
      if (!b) return;
      init();
      badges.add(b);
      markRects();
    },
    unregister(b) {
      badges.delete(b);
      rects.delete(b);
    },
  };
})();

// Glass-icon styling shared by every card's badge: a frosted body with a static
// top sheen plus the LightField specular driven by --sx/--sy/--glow.
const GLASS_BADGE_CSS = css`
  .badge {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 2px rgba(0, 0, 0, 0.12);
  }
  .badge ha-state-icon,
  .badge ha-icon {
    position: relative;
    z-index: 1;
  }
  .badge::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      155deg,
      rgba(255, 255, 255, 0.28),
      rgba(255, 255, 255, 0) 55%
    );
    pointer-events: none;
  }
  .badge::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    background: radial-gradient(
      circle 58px at var(--sx, 50%) var(--sy, 50%),
      rgba(255, 255, 255, 0.85),
      rgba(255, 255, 255, 0) 70%
    );
    opacity: var(--glow, 0);
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .badge::after { transition: none; }
  }
`;

class AppleHomeCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _pressed: { state: true },
      _flash: { state: true },
      _pop: { state: true },
    };
  }

  static getStubConfig(hass) {
    // Pick a light if one exists, for a nice first-add experience.
    const light = Object.keys(hass.states).find((e) => e.startsWith("light."));
    return { entity: light || "" };
  }

  static async getConfigElement() {
    return document.createElement("apple-home-card-editor");
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an entity");
    }
    this._config = {
      tap_action: { action: "toggle" },
      hold_action: { action: "controls" },
      double_tap_action: { action: "controls" },
      ...config,
    };
  }

  // Keep an open detail sheet fed with fresh state, and fire a tiny "pop"
  // animation whenever the entity flips on/off.
  updated(changed) {
    if (!changed.has("hass")) return;
    if (this._sheet && this.hass) this._sheet.hass = this.hass;
    const s = this._stateObj;
    if (!s) return;
    const on = this._isOn(s);
    if (this._prevOn !== undefined && on !== this._prevOn) {
      this._pop = on ? "on" : "off";
      window.clearTimeout(this._popTimer);
      this._popTimer = window.setTimeout(() => (this._pop = null), 500);
    }
    this._prevOn = on;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sheet) this._sheet.close();
    if (this._badge) LightField.unregister(this._badge);
  }

  _openControls() {
    if (this._sheet) return;
    this._sheet = createSheet(
      this.hass,
      this._config.entity,
      this._accent(),
      () => (this._sheet = undefined)
    );
  }

  getCardSize() {
    return 1;
  }

  // Sections view: footprint follows the optional `size` (default square-ish).
  getGridOptions() {
    return gridFor(this._config && this._config.size, TILE_SIZES.medium);
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  // --- Helpers -------------------------------------------------------------

  get _stateObj() {
    return this._config && this.hass
      ? this.hass.states[this._config.entity]
      : undefined;
  }

  _isOn(stateObj) {
    if (this._flash) return true; // momentary pulse for scenes/scripts/buttons
    const behavior = DOMAIN_BEHAVIOR[domainOf(stateObj.entity_id)];
    return behavior ? behavior.on(stateObj) : stateObj.state === "on";
  }

  _accent() {
    if (this._config.color) return this._config.color;
    const d = domainOf(this._config.entity);
    return DOMAIN_ACCENT[d] || DOMAIN_ACCENT._default;
  }

  _name(stateObj) {
    return (
      this._config.name ||
      stateObj.attributes.friendly_name ||
      this._config.entity
    );
  }

  // Brightness 0..1 for lights, used to scale the fill intensity.
  _intensity(stateObj) {
    if (domainOf(stateObj.entity_id) === "light" && this._isOn(stateObj)) {
      const b = stateObj.attributes.brightness;
      return b == null ? 1 : Math.max(0.35, b / 255);
    }
    return 1;
  }

  _stateText(stateObj) {
    const domain = domainOf(stateObj.entity_id);
    const s = stateObj.state;
    if (s === "unavailable") return "Unavailable";
    if (s === "unknown") return "—";

    if (domain === "light" && this._isOn(stateObj)) {
      const b = stateObj.attributes.brightness;
      if (b != null) return `${Math.round((b / 255) * 100)}%`;
      return "On";
    }
    if (domain === "cover") return this._capitalize(s);
    if (domain === "lock") return s === "locked" ? "Locked" : "Unlocked";
    if (domain === "scene") return "Scene";
    if (domain === "script") return s === "on" ? "Running…" : "Run";
    if (domain === "button" || domain === "input_button") return "Press";
    if (domain === "vacuum") {
      const map = { cleaning: "Cleaning", returning: "Returning", docked: "Docked", idle: "Idle", paused: "Paused", error: "Error" };
      return map[s] || this._capitalize(s);
    }
    if (domain === "alarm_control_panel") {
      const map = {
        disarmed: "Off",
        armed_home: "Home",
        armed_away: "Away",
        armed_night: "Night",
        triggered: "Triggered",
      };
      return map[s] || this._capitalize(s);
    }
    if (domain === "media_player") {
      if (this._isOn(stateObj)) {
        const t = stateObj.attributes.media_title;
        return t || this._capitalize(s);
      }
      return "Off";
    }
    if (domain === "climate") {
      const t = stateObj.attributes.current_temperature;
      return t != null ? `${t}°` : this._capitalize(s);
    }
    if (
      ["sensor", "binary_sensor"].includes(domain) ||
      stateObj.attributes.unit_of_measurement
    ) {
      const u = stateObj.attributes.unit_of_measurement || "";
      return `${this._formatNumber(s)}${u ? ` ${u}` : ""}`;
    }
    return this._capitalize(s);
  }

  _capitalize(s) {
    return typeof s === "string" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  _formatNumber(s) {
    const n = Number(s);
    return Number.isNaN(n) ? this._capitalize(s) : n.toLocaleString();
  }

  _icon(stateObj) {
    if (this._config.icon) return this._config.icon;
    return undefined; // let ha-state-icon infer from device_class / domain
  }

  // --- Actions -------------------------------------------------------------

  _haptic(type = "light") {
    const e = new Event("haptic", { bubbles: true, composed: true });
    e.detail = type;
    this.dispatchEvent(e);
  }

  _moreInfo() {
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: this._config.entity };
    this.dispatchEvent(e);
  }

  _toggle() {
    const stateObj = this._stateObj;
    if (!stateObj) return;
    const domain = domainOf(stateObj.entity_id);
    const behavior = DOMAIN_BEHAVIOR[domain];
    if (!behavior || !behavior.toggle) {
      // Nothing to toggle (sensor, climate, alarm…) → open the detail sheet.
      this._openControls();
      return;
    }
    const spec =
      typeof behavior.toggle === "function"
        ? behavior.toggle(stateObj)
        : behavior.toggle;
    this.hass.callService(spec[0], spec[1], { entity_id: stateObj.entity_id });

    // Scenes/scripts/buttons have no "on" state — pulse the tile so the tap
    // feels acknowledged, the way Apple Home flashes a scene.
    if (behavior.momentary) {
      this._flash = true;
      window.clearTimeout(this._flashTimer);
      this._flashTimer = window.setTimeout(() => (this._flash = false), 600);
    }
  }

  _runAction(actionConfig) {
    if (!actionConfig) return;
    switch (actionConfig.action) {
      case "none":
        return;
      case "toggle":
        this._haptic("light");
        this._toggle();
        return;
      case "more-info":
        this._moreInfo();
        return;
      case "controls":
        this._openControls();
        return;
      case "navigate":
        if (actionConfig.navigation_path) {
          history.pushState(null, "", actionConfig.navigation_path);
          const e = new Event("location-changed", { bubbles: true, composed: true });
          e.detail = { replace: false };
          this.dispatchEvent(e);
        }
        return;
      case "url":
        if (actionConfig.url_path) window.open(actionConfig.url_path);
        return;
      case "call-service":
      case "perform-action": {
        const svc = actionConfig.service || actionConfig.perform_action;
        if (!svc) return;
        const [d, s] = svc.split(".");
        this.hass.callService(d, s, actionConfig.data || actionConfig.service_data || {});
        return;
      }
      default:
        this._moreInfo();
    }
  }

  // Pointer handling: distinguish tap / hold / double-tap.
  _onPointerDown() {
    this._pressed = true;
    this._holdFired = false;
    this._holdTimer = window.setTimeout(() => {
      this._holdFired = true;
      this._haptic("medium");
      this._runAction(this._config.hold_action);
    }, 500);
  }

  _onPointerUp() {
    this._pressed = false;
    window.clearTimeout(this._holdTimer);
    if (this._holdFired) return;

    // Double-tap detection.
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 250) {
      this._lastTap = 0;
      window.clearTimeout(this._tapTimer);
      this._runAction(this._config.double_tap_action);
      return;
    }
    this._lastTap = now;
    this._tapTimer = window.setTimeout(() => {
      this._lastTap = 0;
      this._runAction(this._config.tap_action);
    }, 250);
  }

  _onPointerCancel() {
    this._pressed = false;
    window.clearTimeout(this._holdTimer);
  }

  // --- Render --------------------------------------------------------------

  render() {
    if (!this._config || !this.hass) return html``;
    const stateObj = this._stateObj;

    if (!stateObj) {
      return html`
        <ha-card class="unavailable">
          <div class="tile" data-state="unavailable">
            <div class="badge"><ha-icon icon="mdi:help"></ha-icon></div>
            <div class="info">
              <span class="name">${this._config.entity}</span>
              <span class="state">Not found</span>
            </div>
          </div>
        </ha-card>
      `;
    }

    const on = this._isOn(stateObj);
    const unavailable = ["unavailable", "unknown"].includes(stateObj.state);
    const accent = this._accent();
    const intensity = this._intensity(stateObj);

    const style = `
      --aha-accent: ${accent};
      --aha-fill-opacity: ${on ? intensity : 0};
    `;

    return html`
      <ha-card
        style=${style}
        class=${[on ? "on" : "off", unavailable ? "unavailable" : ""].join(" ")}
      >
        <div
          class="tile"
          data-state=${unavailable ? "unavailable" : on ? "on" : "off"}
          data-pop=${this._pop || "none"}
          ?data-pressed=${this._pressed}
          role="button"
          tabindex="0"
          @pointerdown=${this._onPointerDown}
          @pointerup=${this._onPointerUp}
          @pointercancel=${this._onPointerCancel}
          @pointerleave=${this._onPointerCancel}
          @keydown=${(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this._runAction(this._config.tap_action);
            }
          }}
        >
          <div class="fill"></div>
          <div class="content">
            <div class="badge">
              <ha-state-icon
                .hass=${this.hass}
                .stateObj=${stateObj}
                .icon=${this._icon(stateObj)}
              ></ha-state-icon>
            </div>
            <div class="info">
              <span class="name">${this._name(stateObj)}</span>
              <span class="state">${this._stateText(stateObj)}</span>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host {
        --aha-radius: var(--aha-card-radius, 22px);
        --aha-tile-bg: var(
          --aha-tile-background,
          rgba(120, 120, 128, 0.16)
        );
        --aha-text: var(--aha-tile-foreground, var(--primary-text-color));
        --aha-subtext: var(--aha-tile-subforeground, var(--secondary-text-color));
        --aha-badge-bg: var(--aha-badge-background, rgba(120, 120, 128, 0.24));
        /* The tile is a size container so its contents scale to whatever cell
           the grid (or a drag-resize) gives it. */
        container-type: inline-size;
        container-name: ahatile;
        display: block;
        height: 100%;
      }

      ha-card {
        background: transparent;
        border: none;
        box-shadow: none;
        height: 100%;
        overflow: visible;
      }

      /* Content scales up as the tile gets wider. */
      @container ahatile (min-width: 175px) {
        .content { padding: 16px 18px; }
        .badge { width: 44px; height: 44px; --mdc-icon-size: 24px; }
        .name { font-size: 17px; }
        .state { font-size: 14px; }
      }
      @container ahatile (min-width: 250px) {
        .content { padding: 20px 22px; }
        .badge { width: 54px; height: 54px; --mdc-icon-size: 30px; }
        .name { font-size: 20px; }
        .state { font-size: 15px; }
      }

      .tile {
        position: relative;
        height: 100%;
        min-height: var(--aha-tile-min-height, 80px);
        border-radius: var(--aha-radius);
        background: var(--aha-tile-bg);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08),
          0 8px 24px rgba(0, 0, 0, 0.1);
        transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2),
          box-shadow 0.28s ease;
        outline: none;
      }

      .tile[data-pressed] {
        transform: scale(0.95);
        filter: brightness(1.05);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      }

      .tile:focus-visible {
        box-shadow: 0 0 0 3px var(--aha-accent), 0 8px 24px rgba(0, 0, 0, 0.1);
      }

      /* The state-driven color fill — the soul of the Apple Home look. */
      .fill {
        position: absolute;
        inset: 0;
        background: var(--aha-accent);
        opacity: var(--aha-fill-opacity, 0);
        transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .content {
        position: relative;
        height: 100%;
        box-sizing: border-box;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
      }

      .badge {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--aha-badge-bg);
        color: var(--aha-text);
        transition: background 0.4s ease, color 0.4s ease;
        --mdc-icon-size: 20px;
      }

      .tile[data-state="on"] .badge {
        background: rgba(255, 255, 255, 0.92);
        color: #1c1c1e;
      }

      /* --- Micro-animations: a gentle "pop" on state change ---------------- */
      @keyframes aha-badge-pop {
        0% { transform: scale(1); }
        40% { transform: scale(1.16); }
        100% { transform: scale(1); }
      }
      @keyframes aha-fill-settle {
        0% { transform: scale(1.06); opacity: 0; }
        100% { transform: scale(1); opacity: var(--aha-fill-opacity, 1); }
      }
      @keyframes aha-icon-spin {
        0% { transform: rotate(-12deg) scale(0.9); }
        100% { transform: rotate(0) scale(1); }
      }
      .tile[data-pop="on"] .badge,
      .tile[data-pop="off"] .badge {
        animation: aha-badge-pop 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.25);
      }
      .tile[data-pop="on"] .badge ha-state-icon {
        animation: aha-icon-spin 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.25);
        display: inline-flex;
      }
      .tile[data-pop="on"] .fill {
        animation: aha-fill-settle 0.5s cubic-bezier(0.2, 0.8, 0.3, 1);
      }

      @media (prefers-reduced-motion: reduce) {
        .tile,
        .fill,
        .badge,
        .badge ha-state-icon {
          transition-duration: 0.01ms !important;
          animation: none !important;
        }
      }

      .info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .name {
        font-family: var(
          --aha-font,
          -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI",
          Roboto, sans-serif
        );
        font-weight: 600;
        font-size: 15px;
        line-height: 1.2;
        letter-spacing: -0.01em;
        color: var(--aha-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .state {
        font-family: var(
          --aha-font,
          -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI",
          Roboto, sans-serif
        );
        font-size: 13px;
        font-weight: 500;
        color: var(--aha-subtext);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* When on, text sits on the colored fill — make it legible. */
      .tile[data-state="on"] .name,
      .tile[data-state="on"] .state {
        color: #1c1c1e;
      }

      .tile[data-state="unavailable"] {
        opacity: 0.5;
        cursor: default;
      }
    `;
  }
}

customElements.define("apple-home-card", AppleHomeCard);

// ===========================================================================
// Detail sheet — the Apple Home "delve into the accessory" controls.
// Slides up as a frosted panel: a big draggable brightness slider for lights,
// color/temperature, media transport, cover position, climate, vacuum, etc.
// ===========================================================================

class AppleHomeSheet extends LitElement {
  static get properties() {
    return {
      hass: {},
      entityId: {},
      accent: {},
      _open: { state: true },
      _dragPct: { state: true },
    };
  }

  get _stateObj() {
    return this.hass && this.entityId
      ? this.hass.states[this.entityId]
      : undefined;
  }

  show() {
    this._open = true;
  }

  close() {
    if (this._closing) return;
    this._closing = true;
    this._open = false;
    window.setTimeout(() => {
      this.dispatchEvent(new Event("sheet-closed"));
      this.remove();
    }, 320);
  }

  _service(domain, service, data) {
    this.hass.callService(domain, service, {
      entity_id: this.entityId,
      ...data,
    });
  }

  _moreInfo() {
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: this.entityId };
    // dispatch from the active HA root so the dialog mounts correctly
    (document.querySelector("home-assistant") || this).dispatchEvent(e);
    this.close();
  }

  // ---- Light brightness slider (vertical drag) ----------------------------

  _brightnessPct(s) {
    if (this._dragPct != null) return this._dragPct;
    if (s.state !== "on") return 0;
    const b = s.attributes.brightness;
    return b == null ? 100 : Math.round((b / 255) * 100);
  }

  _onSliderDown(e) {
    e.preventDefault();
    this._sliderEl = e.currentTarget;
    this._sliderEl.setPointerCapture(e.pointerId);
    this._dragStartY = e.clientY;
    this._dragMoved = false;
    this._dragStartPct = this._brightnessPct(this._stateObj);
  }

  _onSliderMove(e) {
    if (!this._sliderEl) return;
    const rect = this._sliderEl.getBoundingClientRect();
    const pct = Math.round(((rect.bottom - e.clientY) / rect.height) * 100);
    const clamped = Math.max(0, Math.min(100, pct));
    if (Math.abs(e.clientY - this._dragStartY) > 4) this._dragMoved = true;
    this._dragPct = clamped;
  }

  _onSliderUp(e) {
    if (!this._sliderEl) return;
    this._sliderEl.releasePointerCapture?.(e.pointerId);
    this._sliderEl = undefined;
    const s = this._stateObj;
    if (!this._dragMoved) {
      // A tap toggles the light.
      this._dragPct = null;
      this._service("light", s.state === "on" ? "turn_off" : "turn_on");
      return;
    }
    const pct = this._dragPct;
    this._dragPct = null;
    if (pct <= 0) this._service("light", "turn_off");
    else this._service("light", "turn_on", { brightness_pct: pct });
  }

  _setColorTemp(kelvin) {
    this._service("light", "turn_on", { color_temp_kelvin: kelvin });
  }

  _setColor(hs) {
    this._service("light", "turn_on", { hs_color: hs });
  }

  // ---- Renderers per domain ----------------------------------------------

  _renderLight(s) {
    const pct = this._brightnessPct(s);
    const on = s.state === "on";
    const modes = s.attributes.supported_color_modes || [];
    const hasTemp = modes.includes("color_temp");
    const hasColor = modes.some((m) =>
      ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m)
    );
    const minK = s.attributes.min_color_temp_kelvin || 2200;
    const maxK = s.attributes.max_color_temp_kelvin || 6500;
    const colors = [
      [40, 90], [25, 100], [0, 0], [210, 90], [270, 80], [320, 80], [120, 70],
    ];

    return html`
      <div
        class="big-slider ${on ? "on" : ""}"
        @pointerdown=${this._onSliderDown}
        @pointermove=${this._onSliderMove}
        @pointerup=${this._onSliderUp}
        @pointercancel=${this._onSliderUp}
      >
        <div class="fill" style="height:${pct}%"></div>
        <div class="slider-foot">
          <ha-state-icon
            .hass=${this.hass}
            .stateObj=${s}
          ></ha-state-icon>
          <span class="pct">${on ? `${pct}%` : "Off"}</span>
        </div>
      </div>

      ${hasTemp
        ? html`<div class="control-row">
            <span class="row-label">Temperature</span>
            <input
              class="temp"
              type="range"
              min=${minK}
              max=${maxK}
              .value=${String(s.attributes.color_temp_kelvin || Math.round((minK + maxK) / 2))}
              @change=${(e) => this._setColorTemp(Number(e.target.value))}
            />
          </div>`
        : ""}
      ${hasColor
        ? html`<div class="swatches">
            ${colors.map(
              (hs) => html`<button
                class="swatch"
                style="background:hsl(${hs[0]},${hs[1]}%,${hs[1] === 0 ? 90 : 55}%)"
                @click=${() => this._setColor(hs)}
              ></button>`
            )}
          </div>`
        : ""}
    `;
  }

  _renderMedia(s) {
    const a = s.attributes;
    const playing = s.state === "playing";
    return html`
      <div class="media">
        ${a.entity_picture
          ? html`<img class="art" src=${a.entity_picture} alt="" />`
          : html`<div class="art placeholder">
              <ha-icon icon="mdi:music"></ha-icon>
            </div>`}
        <div class="media-title">${a.media_title || "Not playing"}</div>
        <div class="media-sub">${a.media_artist || a.app_name || ""}</div>
        <div class="transport">
          <button @click=${() => this._service("media_player", "media_previous_track")}>
            <ha-icon icon="mdi:skip-previous"></ha-icon>
          </button>
          <button class="primary" @click=${() => this._service("media_player", "media_play_pause")}>
            <ha-icon icon=${playing ? "mdi:pause" : "mdi:play"}></ha-icon>
          </button>
          <button @click=${() => this._service("media_player", "media_next_track")}>
            <ha-icon icon="mdi:skip-next"></ha-icon>
          </button>
        </div>
        <div class="control-row">
          <ha-icon icon="mdi:volume-low"></ha-icon>
          <input
            type="range" min="0" max="100"
            .value=${String(Math.round((a.volume_level || 0) * 100))}
            @change=${(e) =>
              this._service("media_player", "volume_set", {
                volume_level: Number(e.target.value) / 100,
              })}
          />
          <ha-icon icon="mdi:volume-high"></ha-icon>
        </div>
      </div>
    `;
  }

  _renderCover(s) {
    const pos = s.attributes.current_position;
    const supportsPos = pos != null;
    return html`
      <div class="cover">
        <div class="transport">
          <button @click=${() => this._service("cover", "open_cover")}>
            <ha-icon icon="mdi:arrow-up"></ha-icon>
          </button>
          <button @click=${() => this._service("cover", "stop_cover")}>
            <ha-icon icon="mdi:stop"></ha-icon>
          </button>
          <button @click=${() => this._service("cover", "close_cover")}>
            <ha-icon icon="mdi:arrow-down"></ha-icon>
          </button>
        </div>
        ${supportsPos
          ? html`<div class="control-row">
              <span class="row-label">Position</span>
              <input
                type="range" min="0" max="100" .value=${String(pos)}
                @change=${(e) =>
                  this._service("cover", "set_cover_position", {
                    position: Number(e.target.value),
                  })}
              />
            </div>`
          : ""}
      </div>
    `;
  }

  _renderClimate(s) {
    const a = s.attributes;
    const target = a.temperature;
    const step = a.target_temp_step || 0.5;
    return html`
      <div class="climate">
        <div class="big-number">
          <button @click=${() => this._service("climate", "set_temperature", { temperature: target - step })}>
            <ha-icon icon="mdi:minus"></ha-icon>
          </button>
          <div class="temp-readout">
            <span class="t">${target != null ? `${target}°` : "—"}</span>
            <span class="sub">${a.current_temperature != null ? `Now ${a.current_temperature}°` : ""}</span>
          </div>
          <button @click=${() => this._service("climate", "set_temperature", { temperature: target + step })}>
            <ha-icon icon="mdi:plus"></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  _renderVacuum(s) {
    const cleaning = s.state === "cleaning";
    return html`
      <div class="grid-btns">
        <button @click=${() => this._service("vacuum", cleaning ? "pause" : "start")}>
          <ha-icon icon=${cleaning ? "mdi:pause" : "mdi:play"}></ha-icon>
          <span>${cleaning ? "Pause" : "Start"}</span>
        </button>
        <button @click=${() => this._service("vacuum", "return_to_base")}>
          <ha-icon icon="mdi:home-import-outline"></ha-icon><span>Dock</span>
        </button>
        <button @click=${() => this._service("vacuum", "locate")}>
          <ha-icon icon="mdi:map-marker"></ha-icon><span>Locate</span>
        </button>
      </div>
    `;
  }

  _renderToggle(s) {
    const domain = domainOf(s.entity_id);
    const behavior = DOMAIN_BEHAVIOR[domain];
    const on = behavior ? behavior.on(s) : s.state === "on";
    const toggleable = behavior && behavior.toggle;
    if (!toggleable) {
      return html`<div class="readout">
        <span class="big-state">${this._capitalize(s.state)}</span>
        ${s.attributes.unit_of_measurement
          ? html`<span class="unit">${s.attributes.unit_of_measurement}</span>`
          : ""}
      </div>`;
    }
    return html`
      <button
        class="toggle-big ${on ? "on" : ""}"
        @click=${() => this._service("homeassistant", on ? "turn_off" : "turn_on")}
      >
        <ha-state-icon .hass=${this.hass} .stateObj=${s}></ha-state-icon>
        <span>${on ? "On" : "Off"}</span>
      </button>
    `;
  }

  _capitalize(s) {
    return typeof s === "string" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  _body(s) {
    const domain = domainOf(s.entity_id);
    switch (domain) {
      case "light": return this._renderLight(s);
      case "media_player": return this._renderMedia(s);
      case "cover": return this._renderCover(s);
      case "climate": return this._renderClimate(s);
      case "vacuum": return this._renderVacuum(s);
      default: return this._renderToggle(s);
    }
  }

  render() {
    const s = this._stateObj;
    const name = s
      ? s.attributes.friendly_name || this.entityId
      : this.entityId;
    return html`
      <div
        class="backdrop ${this._open ? "open" : ""}"
        @click=${(e) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div
          class="sheet ${this._open ? "open" : ""}"
          style="--sheet-accent:${this.accent || "#0a84ff"}"
        >
          <div class="grabber"></div>
          <div class="head">
            <span class="title">${name}</span>
            <button class="close" @click=${() => this.close()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="content">
            ${s ? this._body(s) : html`<div class="readout">Unavailable</div>`}
          </div>
          <button class="more" @click=${() => this._moreInfo()}>
            Open in Home Assistant
          </button>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host {
        --sheet-fg: #fff;
        --sheet-sub: rgba(235, 235, 245, 0.6);
        --sheet-bg: rgba(28, 28, 30, 0.82);
        --sheet-control: rgba(120, 120, 128, 0.32);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
          "Segoe UI", Roboto, sans-serif;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        background: rgba(0, 0, 0, 0);
        transition: background 0.3s ease;
      }
      .backdrop.open {
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
      }
      .sheet {
        width: 100%;
        max-width: 420px;
        margin: 0 8px;
        box-sizing: border-box;
        background: var(--sheet-bg);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        color: var(--sheet-fg);
        border-radius: 28px 28px 0 0;
        padding: 10px 20px 20px;
        transform: translateY(110%);
        transition: transform 0.36s cubic-bezier(0.2, 0.9, 0.3, 1);
        box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.4);
      }
      @media (min-width: 600px) {
        .backdrop { align-items: center; }
        .sheet { border-radius: 28px; transform: translateY(20px) scale(0.96); opacity: 0; transition: transform 0.32s cubic-bezier(0.2,0.9,0.3,1), opacity 0.32s ease; }
        .sheet.open { transform: translateY(0) scale(1); opacity: 1; }
      }
      .sheet.open { transform: translateY(0); }
      .grabber {
        width: 38px; height: 5px; border-radius: 3px;
        background: rgba(235, 235, 245, 0.3);
        margin: 6px auto 12px;
      }
      .head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 18px;
      }
      .title { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
      .close {
        width: 30px; height: 30px; border: none; border-radius: 50%;
        background: var(--sheet-control); color: var(--sheet-sub);
        display: grid; place-items: center; cursor: pointer;
        --mdc-icon-size: 18px;
      }
      .content { display: flex; flex-direction: column; gap: 18px; }

      /* Big vertical brightness slider */
      .big-slider {
        position: relative;
        height: 280px;
        border-radius: 26px;
        background: var(--sheet-control);
        overflow: hidden;
        cursor: pointer;
        touch-action: none;
        user-select: none;
      }
      .big-slider .fill {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        background: var(--sheet-accent);
        transition: height 0.1s linear;
      }
      .slider-foot {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        padding: 18px;
        display: flex; align-items: center; justify-content: space-between;
        --mdc-icon-size: 26px;
        color: #fff;
        mix-blend-mode: difference;
        pointer-events: none;
      }
      .pct { font-size: 22px; font-weight: 600; }

      .control-row {
        display: flex; align-items: center; gap: 12px;
        --mdc-icon-size: 20px; color: var(--sheet-sub);
      }
      .row-label { font-size: 14px; min-width: 84px; }
      .control-row input[type="range"] { flex: 1; }

      input[type="range"] {
        -webkit-appearance: none; appearance: none;
        height: 30px; border-radius: 15px;
        background: var(--sheet-control);
        outline: none; margin: 0;
      }
      input[type="range"].temp {
        background: linear-gradient(to right, #ffb15c, #fff4e8, #cfe5ff);
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 26px; height: 26px; border-radius: 50%;
        background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        cursor: pointer;
      }
      input[type="range"]::-moz-range-thumb {
        width: 26px; height: 26px; border: none; border-radius: 50%;
        background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.4); cursor: pointer;
      }

      .swatches { display: flex; gap: 12px; justify-content: space-between; }
      .swatch {
        width: 36px; height: 36px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.25); cursor: pointer; padding: 0;
      }

      /* Media */
      .media { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .art {
        width: 160px; height: 160px; border-radius: 16px; object-fit: cover;
        box-shadow: 0 8px 30px rgba(0,0,0,0.5); margin-bottom: 8px;
      }
      .art.placeholder {
        display: grid; place-items: center; background: var(--sheet-control);
        --mdc-icon-size: 56px; color: var(--sheet-sub);
      }
      .media-title { font-size: 17px; font-weight: 600; text-align: center; }
      .media-sub { font-size: 14px; color: var(--sheet-sub); margin-bottom: 8px; }

      .transport {
        display: flex; align-items: center; justify-content: center; gap: 26px;
        --mdc-icon-size: 30px; margin: 6px 0 4px;
      }
      .transport button {
        background: none; border: none; color: #fff; cursor: pointer;
        display: grid; place-items: center;
      }
      .transport button.primary { --mdc-icon-size: 44px; }

      /* Climate */
      .big-number {
        display: flex; align-items: center; justify-content: space-between;
        background: var(--sheet-control); border-radius: 26px; padding: 18px 24px;
      }
      .big-number button {
        width: 48px; height: 48px; border-radius: 50%; border: none;
        background: rgba(120,120,128,0.4); color: #fff; cursor: pointer;
        --mdc-icon-size: 24px; display: grid; place-items: center;
      }
      .temp-readout { text-align: center; display: flex; flex-direction: column; }
      .temp-readout .t { font-size: 40px; font-weight: 600; letter-spacing: -0.02em; }
      .temp-readout .sub { font-size: 13px; color: var(--sheet-sub); }

      /* Vacuum / generic grid buttons */
      .grid-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .grid-btns button, .toggle-big {
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        padding: 18px 0; border: none; border-radius: 20px;
        background: var(--sheet-control); color: #fff; cursor: pointer;
        font-size: 14px; --mdc-icon-size: 26px;
      }
      .toggle-big {
        width: 100%; padding: 40px 0; --mdc-icon-size: 40px; font-size: 17px;
        transition: background 0.3s ease;
      }
      .toggle-big.on { background: var(--sheet-accent); color: #1c1c1e; }

      .readout { text-align: center; padding: 30px 0; }
      .big-state { font-size: 40px; font-weight: 600; }
      .unit { font-size: 20px; color: var(--sheet-sub); margin-left: 4px; }

      .more {
        margin-top: 22px; width: 100%; padding: 14px; border: none;
        border-radius: 16px; background: var(--sheet-control);
        color: var(--sheet-accent); font-size: 15px; font-weight: 600;
        cursor: pointer;
      }
    `;
  }
}

customElements.define("apple-home-sheet", AppleHomeSheet);

// ===========================================================================
// Wide media tile — artwork background + inline transport, à la Apple Home.
// ===========================================================================

class AppleHomeMediaCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true }, _pressed: { state: true } };
  }

  static getStubConfig(hass) {
    const mp = Object.keys(hass.states).find((e) => e.startsWith("media_player."));
    return { entity: mp || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a media_player entity");
    this._config = config;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 6, rows: 2 });
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  updated(changed) {
    if (changed.has("hass") && this._sheet && this.hass) this._sheet.hass = this.hass;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sheet) this._sheet.close();
    if (this._badge) LightField.unregister(this._badge);
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _svc(service) {
    this.hass.callService("media_player", service, {
      entity_id: this._config.entity,
    });
  }

  _openSheet() {
    if (this._sheet) return;
    this._sheet = createSheet(
      this.hass,
      this._config.entity,
      "#bf5af2",
      () => (this._sheet = undefined)
    );
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    if (!s) {
      return html`<ha-card><div class="tile off"><div class="info">
        <span class="title">${this._config.entity}</span>
        <span class="sub">Not found</span></div></div></ha-card>`;
    }
    const a = s.attributes;
    const playing = s.state === "playing";
    const active = !["off", "idle", "standby", "unavailable"].includes(s.state);
    const art = a.entity_picture;
    const name = this._config.name || a.friendly_name || this._config.entity;

    return html`
      <ha-card>
        <div
          class="tile ${active ? "on" : "off"}"
          ?data-pressed=${this._pressed}
          style=${art && active ? `--art:url('${art}')` : ""}
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => (this._pressed = false)}
          @pointerleave=${() => (this._pressed = false)}
          @click=${this._openSheet}
        >
          ${art && active ? html`<div class="art"></div><div class="scrim"></div>` : ""}
          <div class="content">
            <div class="top">
              <div class="badge">
                <ha-state-icon .hass=${this.hass} .stateObj=${s}></ha-state-icon>
              </div>
              <div class="labels">
                <span class="title">${active ? a.media_title || name : name}</span>
                <span class="sub">${active ? a.media_artist || a.app_name || "" : "Not playing"}</span>
              </div>
            </div>
            <div class="transport" @click=${(e) => e.stopPropagation()}>
              <button @click=${() => this._svc("media_previous_track")}>
                <ha-icon icon="mdi:skip-previous"></ha-icon>
              </button>
              <button class="primary" @click=${() => this._svc("media_play_pause")}>
                <ha-icon icon=${playing ? "mdi:pause" : "mdi:play"}></ha-icon>
              </button>
              <button @click=${() => this._svc("media_next_track")}>
                <ha-icon icon="mdi:skip-next"></ha-icon>
              </button>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host { display: block; height: 100%; }
      ha-card { background: transparent; border: none; box-shadow: none; height: 100%; }
      .tile {
        position: relative; height: 100%; min-height: 96px;
        border-radius: 22px; overflow: hidden; cursor: pointer;
        background: rgba(120, 120, 128, 0.16);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        transition: transform 0.28s cubic-bezier(0.2,0.9,0.3,1.2);
        font-family: ${FONT_STACK_CSS};
      }
      .tile[data-pressed] { transform: scale(0.97); }
      .art {
        position: absolute; inset: 0; background-image: var(--art);
        background-size: cover; background-position: center;
      }
      .scrim {
        position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.65));
      }
      .content {
        position: relative; height: 100%; box-sizing: border-box;
        padding: 14px 16px; display: flex; flex-direction: column;
        justify-content: space-between; gap: 8px;
      }
      .top { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .badge {
        width: 38px; height: 38px; border-radius: 50%; flex: none;
        display: grid; place-items: center; --mdc-icon-size: 22px;
        background: rgba(255,255,255,0.92); color: #1c1c1e;
      }
      .tile.off .badge { background: rgba(120,120,128,0.28); color: var(--primary-text-color); }
      .labels { display: flex; flex-direction: column; min-width: 0; }
      .title {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: var(--primary-text-color);
      }
      .sub {
        font-size: 13px; font-weight: 500; color: var(--secondary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .tile.on .art ~ .content .title, .tile.on .scrim ~ .content .title,
      .tile.on .content .title { color: #fff; }
      .tile.on .content .sub { color: rgba(255,255,255,0.75); }
      .transport {
        display: flex; align-items: center; gap: 18px; --mdc-icon-size: 24px;
      }
      .transport button {
        background: none; border: none; padding: 0; cursor: pointer;
        color: var(--primary-text-color); display: grid; place-items: center;
      }
      .tile.on .transport button { color: #fff; }
      .transport button.primary { --mdc-icon-size: 32px; }
    `;
  }
}

customElements.define("apple-home-media-card", AppleHomeMediaCard);

// ===========================================================================
// Thermostat tile — current + target temperature with inline +/-.
// ===========================================================================

class AppleHomeClimateCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true } };
  }

  static getStubConfig(hass) {
    const c = Object.keys(hass.states).find((e) => e.startsWith("climate."));
    return { entity: c || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a climate entity");
    this._config = config;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 3, rows: 2 });
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  updated(changed) {
    if (changed.has("hass") && this._sheet && this.hass) this._sheet.hass = this.hass;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sheet) this._sheet.close();
    if (this._badge) LightField.unregister(this._badge);
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _bump(delta) {
    const s = this._stateObj;
    const step = s.attributes.target_temp_step || 0.5;
    const t = s.attributes.temperature;
    if (t == null) return;
    this.hass.callService("climate", "set_temperature", {
      entity_id: this._config.entity,
      temperature: Math.round((t + delta * step) * 10) / 10,
    });
  }

  _openSheet() {
    if (this._sheet) return;
    this._sheet = createSheet(this.hass, this._config.entity, "#ff9f0a", () => (this._sheet = undefined));
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    if (!s) return html`<ha-card><div class="tile">Not found</div></ha-card>`;
    const a = s.attributes;
    const on = s.state !== "off";
    const accent = on ? this._config.color || "#ff9f0a" : "transparent";
    const name = this._config.name || a.friendly_name || this._config.entity;

    return html`
      <ha-card style="--accent:${accent}">
        <div class="tile ${on ? "on" : "off"}">
          <div class="head" @click=${this._openSheet}>
            <div class="badge"><ha-state-icon .hass=${this.hass} .stateObj=${s}></ha-state-icon></div>
            <div class="labels">
              <span class="name">${name}</span>
              <span class="sub">${a.current_temperature != null ? `Now ${a.current_temperature}°` : this._cap(s.state)}</span>
            </div>
          </div>
          <div class="dial">
            <button @click=${() => this._bump(-1)} ?disabled=${!on}><ha-icon icon="mdi:minus"></ha-icon></button>
            <span class="target">${a.temperature != null ? `${a.temperature}°` : "—"}</span>
            <button @click=${() => this._bump(1)} ?disabled=${!on}><ha-icon icon="mdi:plus"></ha-icon></button>
          </div>
        </div>
      </ha-card>
    `;
  }

  _cap(s) {
    return typeof s === "string" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host { display: block; height: 100%; }
      ha-card { background: transparent; border: none; box-shadow: none; height: 100%; }
      .tile {
        position: relative; height: 100%; min-height: 96px; box-sizing: border-box;
        border-radius: 22px; padding: 14px 16px; cursor: default;
        display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
        background: rgba(120,120,128,0.16);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        font-family: ${FONT_STACK_CSS};
      }
      .tile.on { background: var(--accent); }
      .head { display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 0; }
      .badge {
        width: 34px; height: 34px; border-radius: 50%; flex: none;
        display: grid; place-items: center; --mdc-icon-size: 20px;
        background: rgba(120,120,128,0.28); color: var(--primary-text-color);
      }
      .tile.on .badge { background: rgba(255,255,255,0.92); color: #1c1c1e; }
      .labels { display: flex; flex-direction: column; min-width: 0; }
      .name {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em;
        color: var(--primary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sub { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); }
      .tile.on .name, .tile.on .sub { color: #1c1c1e; }
      .dial { display: flex; align-items: center; justify-content: space-between; }
      .dial button {
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(120,120,128,0.28); color: var(--primary-text-color);
        display: grid; place-items: center; --mdc-icon-size: 20px;
      }
      .tile.on .dial button { background: rgba(255,255,255,0.35); color: #1c1c1e; }
      .dial button[disabled] { opacity: 0.4; cursor: default; }
      .target { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; color: var(--primary-text-color); }
      .tile.on .target { color: #1c1c1e; }
    `;
  }
}

customElements.define("apple-home-climate-card", AppleHomeClimateCard);

// ===========================================================================
// Area / group tile — summarises a room: "2 of 3 on", taps toggle the group.
// ===========================================================================

class AppleHomeAreaCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true }, _pressed: { state: true } };
  }

  static getStubConfig() {
    return { name: "Room", icon: "mdi:sofa", entities: [] };
  }

  setConfig(config) {
    if (!config.entities || !config.entities.length) {
      throw new Error("You must define a list of entities");
    }
    this._config = { tap_action: "toggle", ...config };
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 3, rows: 2 });
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._badge) LightField.unregister(this._badge);
  }

  get _states() {
    return (this._config.entities || [])
      .map((e) => this.hass.states[e])
      .filter(Boolean);
  }

  _onCount() {
    return this._states.filter(isEntityOn).length;
  }

  _summary() {
    const total = this._states.length;
    const on = this._onCount();
    if (total === 0) return "—";
    if (on === 0) return "All off";
    if (on === total) return total === 1 ? "On" : "All on";
    return `${on} of ${total} on`;
  }

  _tap() {
    if (this._config.navigation_path) {
      history.pushState(null, "", this._config.navigation_path);
      const e = new Event("location-changed", { bubbles: true, composed: true });
      e.detail = { replace: false };
      this.dispatchEvent(e);
      return;
    }
    // Toggle the group: if anything is on, turn all off; else turn all on.
    const anyOn = this._onCount() > 0;
    const haptic = new Event("haptic", { bubbles: true, composed: true });
    haptic.detail = "light";
    this.dispatchEvent(haptic);
    this.hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", {
      entity_id: this._config.entities,
    });
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const on = this._onCount() > 0;
    const accent = this._config.color || "#ffd60a";
    return html`
      <ha-card style="--accent:${accent}">
        <div
          class="tile ${on ? "on" : "off"}"
          ?data-pressed=${this._pressed}
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => (this._pressed = false)}
          @pointerleave=${() => (this._pressed = false)}
          @click=${this._tap}
        >
          <div class="badge"><ha-icon icon=${this._config.icon || "mdi:home"}></ha-icon></div>
          <div class="info">
            <span class="name">${this._config.name || "Room"}</span>
            <span class="sub">${this._summary()}</span>
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host {
        display: block; height: 100%;
        container-type: inline-size; container-name: ahatile;
      }
      ha-card { background: transparent; border: none; box-shadow: none; height: 100%; }

      @container ahatile (min-width: 175px) {
        .tile { padding: 16px 18px; }
        .badge { width: 44px; height: 44px; --mdc-icon-size: 24px; }
        .name { font-size: 17px; }
        .sub { font-size: 14px; }
      }
      @container ahatile (min-width: 250px) {
        .badge { width: 54px; height: 54px; --mdc-icon-size: 30px; }
        .name { font-size: 20px; }
      }
      .tile {
        position: relative; height: 100%; min-height: 84px; box-sizing: border-box;
        border-radius: 22px; padding: 14px 16px; cursor: pointer;
        display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
        background: rgba(120,120,128,0.16);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        transition: transform 0.28s cubic-bezier(0.2,0.9,0.3,1.2), background 0.4s ease;
        font-family: ${FONT_STACK_CSS};
      }
      .tile[data-pressed] { transform: scale(0.95); }
      .tile.on { background: var(--accent); }
      .badge {
        width: 36px; height: 36px; border-radius: 50%;
        display: grid; place-items: center; --mdc-icon-size: 20px;
        background: rgba(120,120,128,0.28); color: var(--primary-text-color);
        transition: background 0.4s ease, color 0.4s ease;
      }
      .tile.on .badge { background: rgba(255,255,255,0.92); color: #1c1c1e; }
      .info { display: flex; flex-direction: column; min-width: 0; }
      .name {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em;
        color: var(--primary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sub { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); }
      .tile.on .name, .tile.on .sub { color: #1c1c1e; }
    `;
  }
}

customElements.define("apple-home-area-card", AppleHomeAreaCard);

// ===========================================================================
// Background — a full-screen Apple-style geometric/glass backdrop for the whole
// dashboard, plus an optional inline selector to switch between presets.
// ===========================================================================

const BACKGROUNDS = {
  aurora: {
    name: "Aurora",
    dark: true,
    css:
      "radial-gradient(at 18% 22%, #5e5ce6 0px, transparent 45%)," +
      "radial-gradient(at 82% 8%, #ff375f 0px, transparent 40%)," +
      "radial-gradient(at 75% 85%, #0a84ff 0px, transparent 45%)," +
      "radial-gradient(at 8% 88%, #bf5af2 0px, transparent 40%)," +
      "linear-gradient(135deg, #0b0b1f, #18112e)",
  },
  sunset: {
    name: "Sunset",
    dark: true,
    css:
      "radial-gradient(at 15% 20%, #ff9f0a 0px, transparent 45%)," +
      "radial-gradient(at 85% 15%, #ff375f 0px, transparent 42%)," +
      "radial-gradient(at 70% 90%, #bf5af2 0px, transparent 48%)," +
      "linear-gradient(135deg, #2a0f1f, #1a0f2e)",
  },
  ocean: {
    name: "Ocean",
    dark: true,
    css:
      "radial-gradient(at 20% 25%, #0a84ff 0px, transparent 45%)," +
      "radial-gradient(at 80% 20%, #64d2ff 0px, transparent 42%)," +
      "radial-gradient(at 75% 85%, #30d158 0px, transparent 48%)," +
      "linear-gradient(135deg, #06121f, #0a1f2e)",
  },
  midnight: {
    name: "Midnight",
    dark: true,
    css:
      "radial-gradient(at 50% 0%, #232357 0px, transparent 55%)," +
      "radial-gradient(at 85% 90%, #1d3a5e 0px, transparent 50%)," +
      "linear-gradient(180deg, #0a0a14, #050510)",
  },
  mesh: {
    name: "Mesh",
    dark: false,
    css:
      "radial-gradient(at 0% 0%, #ffd9ec 0px, transparent 50%)," +
      "radial-gradient(at 100% 0%, #cfe5ff 0px, transparent 50%)," +
      "radial-gradient(at 100% 100%, #d7fbe8 0px, transparent 50%)," +
      "radial-gradient(at 0% 100%, #fff4cc 0px, transparent 50%)," +
      "linear-gradient(#f6f7fb, #eef0f7)",
  },
  mono: {
    name: "Mono",
    dark: false,
    css: "linear-gradient(160deg, #fbfbfd, #e9ebf1)",
  },
};

// Shared geometric/glass overlay — smooth bezier lines + soft frosted blobs.
const GLASS_OVERLAY_SVG = `
<svg class="aha-bg-glass" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="ahaBlur" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="2.4"/></filter></defs>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="0.18">
    <path d="M-5 30 C 25 15, 55 45, 105 25"/>
    <path d="M-5 55 C 30 40, 60 70, 105 50"/>
    <path d="M-5 80 C 25 66, 70 94, 105 74"/>
  </g>
  <g filter="url(#ahaBlur)">
    <ellipse cx="22" cy="26" rx="22" ry="17" fill="#ffffff" fill-opacity="0.05"/>
    <ellipse cx="82" cy="74" rx="26" ry="19" fill="#ffffff" fill-opacity="0.05"/>
    <rect x="58" y="14" width="30" height="20" rx="8" fill="#ffffff" fill-opacity="0.04"/>
  </g>
</svg>`;

function ensureBackgroundLayer() {
  let layer = document.getElementById("aha-bg-layer");
  if (layer) return layer;

  // Make HA's own surfaces see-through so the backdrop shows behind the cards.
  if (!document.getElementById("aha-bg-transparency")) {
    const t = document.createElement("style");
    t.id = "aha-bg-transparency";
    t.textContent =
      "html, body { background: transparent !important; }" +
      ":root { --lovelace-background: transparent !important;" +
      " --view-background: transparent !important; }" +
      "hui-view, hui-sections-view, hui-masonry-view, hui-panel-view," +
      " hui-root, ha-drawer .content { background: transparent !important; }";
    document.head.appendChild(t);
  }

  if (!document.getElementById("aha-bg-anim")) {
    const a = document.createElement("style");
    a.id = "aha-bg-anim";
    a.textContent =
      "#aha-bg-layer{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;}" +
      "#aha-bg-layer .aha-bg-gradient{position:absolute;inset:-12%;background-size:cover;" +
      "animation:aha-bg-drift 44s ease-in-out infinite alternate;}" +
      "#aha-bg-layer .aha-bg-glass{position:absolute;inset:0;width:100%;height:100%;" +
      "animation:aha-bg-float 52s ease-in-out infinite alternate;}" +
      "@keyframes aha-bg-drift{from{transform:scale(1) translate(0,0)}" +
      "to{transform:scale(1.08) translate(1%,-1.5%)}}" +
      "@keyframes aha-bg-float{from{transform:translate(0,0)}to{transform:translate(-2%,2%)}}" +
      "@media (prefers-reduced-motion: reduce){#aha-bg-layer .aha-bg-gradient," +
      "#aha-bg-layer .aha-bg-glass{animation:none !important}}";
    document.head.appendChild(a);
  }

  layer = document.createElement("div");
  layer.id = "aha-bg-layer";
  const grad = document.createElement("div");
  grad.className = "aha-bg-gradient";
  layer.appendChild(grad);
  layer.insertAdjacentHTML("beforeend", GLASS_OVERLAY_SVG);
  document.body.appendChild(layer);
  return layer;
}

function applyBackground(key) {
  const bg = BACKGROUNDS[key] ? key : "aurora";
  const layer = ensureBackgroundLayer();
  layer.querySelector(".aha-bg-gradient").style.background = BACKGROUNDS[bg].css;
  layer.dataset.key = bg;
  try {
    localStorage.setItem("apple-home-background", bg);
  } catch (e) {
    /* private mode */
  }
}

function currentBackgroundKey() {
  try {
    return localStorage.getItem("apple-home-background");
  } catch (e) {
    return null;
  }
}

class AppleHomeBackground extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true } };
  }

  static getStubConfig() {
    return { background: "aurora", selector: true };
  }

  setConfig(config) {
    this._config = { background: "aurora", selector: true, ...config };
  }

  getCardSize() {
    return this._config && this._config.selector ? 2 : 1;
  }

  getGridOptions() {
    const tall = this._config && this._config.selector;
    return { columns: 12, rows: tall ? 3 : 1 };
  }

  connectedCallback() {
    super.connectedCallback();
    applyBackground(
      currentBackgroundKey() || (this._config && this._config.background) || "aurora"
    );
  }

  _select(key) {
    applyBackground(key);
    this.requestUpdate();
  }

  render() {
    if (!this._config || !this._config.selector) return html``;
    const cur = currentBackgroundKey() || this._config.background;
    return html`
      <ha-card>
        <div class="wrap">
          <div class="title">Background</div>
          <div class="row">
            ${Object.entries(BACKGROUNDS).map(
              ([k, b]) => html`
                <button
                  class="chip ${k === cur ? "sel" : ""}"
                  @click=${() => this._select(k)}
                >
                  <span class="sw" style="background:${b.css}"></span>
                  <span class="lbl">${b.name}</span>
                </button>
              `
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ha-card {
        background: var(--aha-tile-background, rgba(120, 120, 128, 0.16));
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: none;
        border-radius: 22px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.1);
        font-family: ${FONT_STACK_CSS};
      }
      .wrap { padding: 14px 16px; }
      .title {
        font-weight: 600;
        font-size: 15px;
        letter-spacing: -0.01em;
        margin-bottom: 12px;
        color: var(--primary-text-color);
      }
      .row {
        display: flex;
        gap: 14px;
        overflow-x: auto;
        padding-bottom: 4px;
        scrollbar-width: none;
      }
      .row::-webkit-scrollbar { display: none; }
      .chip {
        flex: none;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }
      .sw {
        width: 68px;
        height: 46px;
        border-radius: 13px;
        background-size: cover !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15),
          0 2px 8px rgba(0, 0, 0, 0.3);
        transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2);
      }
      .chip:active .sw { transform: scale(0.93); }
      .chip.sel .sw {
        box-shadow: 0 0 0 3px var(--primary-color, #0a84ff),
          0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .lbl { font-size: 12px; color: var(--secondary-text-color); }
    `;
  }
}

customElements.define("apple-home-background", AppleHomeBackground);

// --- GUI editor ------------------------------------------------------------

class AppleHomeCardEditor extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true } };
  }

  setConfig(config) {
    this._config = config;
  }

  _schema() {
    return [
      { name: "entity", required: true, selector: { entity: {} } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "color", selector: { text: {} } },
      {
        name: "tap_action",
        selector: { ui_action: { default_action: "toggle" } },
      },
      {
        name: "hold_action",
        selector: { ui_action: { default_action: "controls" } },
      },
      {
        name: "double_tap_action",
        selector: { ui_action: { default_action: "controls" } },
      },
    ];
  }

  _label = (schema) => {
    const labels = {
      entity: "Entity (required)",
      name: "Name",
      icon: "Icon",
      color: "Accent color (hex, e.g. #ffd60a)",
      tap_action: "Tap action",
      hold_action: "Hold action",
      double_tap_action: "Double tap action",
    };
    return labels[schema.name] || schema.name;
  };

  _valueChanged(ev) {
    const e = new Event("config-changed", { bubbles: true, composed: true });
    e.detail = { config: ev.detail.value };
    this.dispatchEvent(e);
  }

  render() {
    if (!this.hass || !this._config) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${this._schema()}
        .computeLabel=${this._label}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

customElements.define("apple-home-card-editor", AppleHomeCardEditor);

// Register in the card picker.
const DOCS_URL = "https://github.com/your-username/apple-home-card";
window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "apple-home-card",
    name: "Apple Home Card",
    description: "An Apple Home-inspired tile for lights, switches, and more.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-media-card",
    name: "Apple Home Media",
    description: "Wide media tile with artwork and inline transport controls.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-climate-card",
    name: "Apple Home Thermostat",
    description: "Climate tile with current/target temperature and inline +/-.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-area-card",
    name: "Apple Home Area",
    description: "Room summary tile — shows how many accessories are on; taps toggle the group.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-background",
    name: "Apple Home Background",
    description: "Full-screen geometric/glass dashboard backdrop with a preset selector.",
    preview: true,
    documentationURL: DOCS_URL,
  }
);
