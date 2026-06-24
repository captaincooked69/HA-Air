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

const VERSION = "0.9.1";

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
function isDashboardViewHost(host) {
  return !!(
    host &&
    typeof host.closest === "function" &&
    host.closest("hui-view, hui-panel-view, hui-sections-view, hui-masonry-view")
  );
}
// Re-render only when one of the given entities actually changed (plus any
// local reactive state). Keeps big dashboards snappy.
function onlyIfEntitiesChanged(host, changed, entityIds, localKeys) {
  if (!host._config) return false;
  for (const k of localKeys || []) if (changed.has(k)) return true;
  if (changed.has("_config")) return true;
  if (changed.has("hass")) {
    const old = changed.get("hass");
    if (!old || !host.hass) return true;
    return entityIds.some((id) => old.states[id] !== host.hass.states[id]);
  }
  return false;
}

// Shared "is this entity active?" using the same rules as the tile.
function isEntityOn(stateObj) {
  if (!stateObj) return false;
  const b = DOMAIN_BEHAVIOR[domainOf(stateObj.entity_id)];
  return b ? b.on(stateObj) : stateObj.state === "on";
}

function capitalizeText(s) {
  return typeof s === "string" ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatNumberValue(s) {
  const n = Number(s);
  return Number.isNaN(n) ? capitalizeText(s) : n.toLocaleString();
}

function describeVacuumState(s) {
  const map = {
    cleaning: "Cleaning",
    returning: "Returning",
    docked: "Docked",
    idle: "Idle",
    paused: "Paused",
    error: "Error",
  };
  return map[s] || capitalizeText(s);
}

function describeEntityState(stateObj, active) {
  if (!stateObj) return "Unavailable";
  const domain = domainOf(stateObj.entity_id);
  const s = stateObj.state;
  if (s === "unavailable") return "Unavailable";
  if (s === "unknown") return "-";

  if (domain === "light" && active) {
    const b = stateObj.attributes.brightness;
    if (b != null) return `${Math.round((b / 255) * 100)}%`;
    return "On";
  }
  if (domain === "fan") {
    if (!active) return "Off";
    const pct = stateObj.attributes.percentage;
    const preset = stateObj.attributes.preset_mode;
    if (pct != null) return `${pct}%`;
    if (preset) return capitalizeText(preset);
    return "On";
  }
  if (domain === "cover") return capitalizeText(s);
  if (domain === "lock") return s === "locked" ? "Locked" : "Unlocked";
  if (domain === "scene") return "Scene";
  if (domain === "script") return s === "on" ? "Running..." : "Run";
  if (domain === "button" || domain === "input_button") return "Press";
  if (domain === "vacuum") return describeVacuumState(s);
  if (domain === "alarm_control_panel") {
    const map = {
      disarmed: "Off",
      armed_home: "Home",
      armed_away: "Away",
      armed_night: "Night",
      triggered: "Triggered",
    };
    return map[s] || capitalizeText(s);
  }
  if (domain === "media_player") {
    if (active) {
      const t = stateObj.attributes.media_title;
      return t || capitalizeText(s);
    }
    return "Off";
  }
  if (domain === "climate") {
    const t = stateObj.attributes.current_temperature;
    return t != null ? `${t}°` : capitalizeText(s);
  }
  if (
    ["sensor", "binary_sensor"].includes(domain) ||
    stateObj.attributes.unit_of_measurement
  ) {
    const u = stateObj.attributes.unit_of_measurement || "";
    return `${formatNumberValue(s)}${u ? ` ${u}` : ""}`;
  }
  return capitalizeText(s);
}

function getEntityDisplayName(stateObj, fallback) {
  return stateObj ? stateObj.attributes.friendly_name || fallback : fallback;
}

function buildConfiguredActionCall(action) {
  if (!action) return null;
  const svc = action.service || action.perform_action;
  if (!svc) return null;
  const [domain, service] = svc.split(".");
  if (!domain || !service) return null;

  const data = { ...(action.data || action.service_data || {}) };
  const target = action.target ? { ...action.target } : undefined;
  const entityId = action.entity || action.entity_id;

  if (entityId) {
    if (target) {
      const existing = target.entity_id;
      if (Array.isArray(existing)) {
        target.entity_id = existing.includes(entityId) ? existing : [...existing, entityId];
      } else if (typeof existing === "string") {
        target.entity_id = existing === entityId ? existing : [existing, entityId];
      } else if (existing == null && data.entity_id == null) {
        target.entity_id = entityId;
      }
    } else if (data.entity_id == null) {
      data.entity_id = entityId;
    }
  }

  return { domain, service, data, target };
}

function invokeConfiguredActionService(hass, action) {
  if (!hass) return false;
  const call = buildConfiguredActionCall(action);
  if (!call) return false;
  hass.callService(call.domain, call.service, call.data, call.target);
  return true;
}

function callConfiguredAction(hass, action) {
  if (!hass || !action) return;
  if (invokeConfiguredActionService(hass, action)) return;

  const entityId = action.entity || action.entity_id;
  if (!entityId) return;
  const stateObj = hass.states[entityId];
  if (!stateObj) return;
  const behavior = DOMAIN_BEHAVIOR[domainOf(entityId)];
  if (!behavior || !behavior.toggle) return;
  const spec =
    typeof behavior.toggle === "function"
      ? behavior.toggle(stateObj)
      : behavior.toggle;
  hass.callService(spec[0], spec[1], {
    entity_id: entityId,
    ...(action.data || action.service_data || {}),
  });
}
// Open the Apple Home detail sheet for an entity. Returns the element so the
// caller can keep feeding it fresh `hass`.
function createSheet(hass, entityId, accent, onClosed, direction) {
  const sheet = document.createElement("apple-home-sheet");
  sheet.hass = hass;
  sheet.entityId = entityId;
  sheet.accent = accent;
  sheet.direction = direction === "down" ? "down" : "up";
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
    flex: none; /* the icon circle never shrinks, at any tile size */
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
      _drag: { state: true },
      _optimistic: { state: true },
    };
  }

  // Only re-render when THIS entity changes (not on every state change across
  // the whole system) — keeps interactions snappy on big installs.
  shouldUpdate(changed) {
    if (!this._config) return false;
    if (
      changed.has("_config") || changed.has("_pressed") || changed.has("_flash") ||
      changed.has("_pop") || changed.has("_drag") || changed.has("_optimistic")
    ) return true;
    if (changed.has("hass")) {
      const old = changed.get("hass");
      if (!old || !this.hass) return true;
      return old.states[this._config.entity] !== this.hass.states[this._config.entity];
    }
    return false;
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

  // Keep an open detail sheet fed with fresh state, reconcile the optimistic
  // flag, and fire a tiny "pop" animation whenever the entity flips on/off.
  updated(changed) {
    if (!changed.has("hass")) return;
    if (this._sheet && this.hass) this._sheet.hass = this.hass;
    const s = this._stateObj;
    if (!s) return;
    const behavior = DOMAIN_BEHAVIOR[domainOf(s.entity_id)];
    const realOn = behavior ? behavior.on(s) : s.state === "on";
    if (this._optimistic != null && realOn === this._optimistic) {
      this._optimistic = null; // HA caught up with the optimistic guess
    }
    if (this._prevOn !== undefined && realOn !== this._prevOn) {
      this._pop = realOn ? "on" : "off";
      window.clearTimeout(this._popTimer);
      this._popTimer = window.setTimeout(() => (this._pop = null), 500);
    }
    this._prevOn = realOn;
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
      () => (this._sheet = undefined),
      this._config.slider_direction
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
    if (this._optimistic != null) return this._optimistic;
    const behavior = DOMAIN_BEHAVIOR[domainOf(stateObj.entity_id)];
    return behavior ? behavior.on(stateObj) : stateObj.state === "on";
  }

  _accent() {
    if (this._config.color) return this._config.color;
    const s = this._stateObj;
    const d = domainOf(this._config.entity);
    // Colour door/window/garage contacts amber when they matter.
    if (d === "binary_sensor" && s) {
      const dc = s.attributes.device_class;
      if (["door", "window", "garage_door", "opening"].includes(dc)) return "#ff9f0a";
    }
    return DOMAIN_ACCENT[d] || DOMAIN_ACCENT._default;
  }

  // Domains where a vertical drag sets a level (brightness / cover position).
  _isLevelDomain() {
    const s = this._stateObj;
    if (!s) return false;
    const d = domainOf(s.entity_id);
    if (d === "light") {
      const m = s.attributes.supported_color_modes || [];
      return m.length > 0 && !(m.length === 1 && m[0] === "onoff");
    }
    if (d === "cover") return s.attributes.current_position != null;
    return false;
  }

  _level(s) {
    const d = domainOf(s.entity_id);
    if (d === "light") {
      if (!this._isOn(s)) return 0;
      const b = s.attributes.brightness;
      return b == null ? 100 : Math.round((b / 255) * 100);
    }
    if (d === "cover") {
      return s.attributes.current_position != null
        ? s.attributes.current_position
        : this._isOn(s) ? 100 : 0;
    }
    return this._isOn(s) ? 100 : 0;
  }

  _applyLevel(pct) {
    const s = this._stateObj;
    if (!s) return;
    const d = domainOf(s.entity_id);
    const id = s.entity_id;
    if (d === "light") {
      if (pct <= 0) this.hass.callService("light", "turn_off", { entity_id: id });
      else this.hass.callService("light", "turn_on", { entity_id: id, brightness_pct: pct });
      this._optimistic = pct > 0;
    } else if (d === "cover") {
      this.hass.callService("cover", "set_cover_position", { entity_id: id, position: pct });
    }
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
    return describeEntityState(stateObj, this._isOn(stateObj));
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
    // Optimistic flip so the tile reacts instantly, before HA round-trips.
    if (!behavior.momentary) {
      const realOn = behavior.on(stateObj);
      this._optimistic = !realOn;
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
      case "perform-action":
        invokeConfiguredActionService(this.hass, actionConfig);
        return;
      default:
        this._moreInfo();
    }
  }

  // Pointer handling: tap / hold / double-tap, plus vertical drag-to-set-level
  // on dimmable lights and positionable covers.
  _onPointerDown(e) {
    this._pressed = true;
    this._holdFired = false;
    this._dragging = false;
    this._downY = e.clientY;
    this._tileEl = e.currentTarget;
    this._levelAtDown = this._isLevelDomain() ? this._level(this._stateObj) : null;
    try { this._tileEl.setPointerCapture(e.pointerId); } catch (x) {}
    this._holdTimer = window.setTimeout(() => {
      if (this._dragging) return;
      this._holdFired = true;
      this._haptic("medium");
      this._runAction(this._config.hold_action);
    }, 500);
  }

  _onPointerMove(e) {
    if (!this._pressed || this._levelAtDown == null) return;
    const dy = this._downY - e.clientY;
    if (!this._dragging && Math.abs(dy) < 6) return;
    this._dragging = true;
    window.clearTimeout(this._holdTimer);
    const rect = this._tileEl.getBoundingClientRect();
    const pct = this._levelAtDown + (dy / rect.height) * 100;
    this._drag = Math.max(0, Math.min(100, Math.round(pct)));
  }

  _onPointerUp(e) {
    this._pressed = false;
    window.clearTimeout(this._holdTimer);
    try { this._tileEl && this._tileEl.releasePointerCapture(e.pointerId); } catch (x) {}
    if (this._holdFired) { this._dragging = false; return; }
    if (this._dragging) {
      this._dragging = false;
      if (this._drag != null) this._applyLevel(this._drag);
      this._haptic("light");
      this._drag = null;
      return;
    }
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
    this._dragging = false;
    this._drag = null;
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

    const domain = domainOf(stateObj.entity_id);
    const on = this._isOn(stateObj);
    const unavailable = ["unavailable", "unknown"].includes(stateObj.state);
    const accent = this._accent();
    const intensity = this._intensity(stateObj);
    const levelDomain = this._isLevelDomain();

    // Fill: lights/covers fill to their level (a vertical slider); everything
    // else tints the whole tile when on.
    const fillH =
      this._drag != null ? this._drag : levelDomain ? this._level(stateObj) : on ? 100 : 0;
    const displayOn = this._drag != null ? this._drag > 0 : on;
    const fillOpacity = levelDomain ? (fillH > 0 ? 1 : 0) : on ? intensity : 0;

    const spin = domain === "fan" && displayOn;
    const spinDur = spin
      ? `${(1.7 - (stateObj.attributes.percentage || 60) / 100 * 1.2).toFixed(2)}s`
      : "";

    const style = `
      --aha-accent: ${accent};
      --aha-fill-opacity: ${fillOpacity};
      --aha-fill-height: ${fillH}%;
    `;

    const stateText =
      this._drag != null ? `${this._drag}%` : this._stateText(stateObj);

    return html`
      <ha-card
        style=${style}
        class=${[displayOn ? "on" : "off", unavailable ? "unavailable" : ""].join(" ")}
      >
        <div
          class="tile"
          data-state=${unavailable ? "unavailable" : displayOn ? "on" : "off"}
          data-pop=${this._pop || "none"}
          ?data-pressed=${this._pressed}
          ?data-dragging=${this._dragging}
          ?data-level=${levelDomain}
          role="button"
          tabindex="0"
          @pointerdown=${this._onPointerDown}
          @pointermove=${this._onPointerMove}
          @pointerup=${this._onPointerUp}
          @pointercancel=${this._onPointerCancel}
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
                class=${spin ? "spin" : ""}
                style=${spin ? `--spin:${spinDur}` : ""}
                .hass=${this.hass}
                .stateObj=${stateObj}
                .icon=${this._icon(stateObj)}
              ></ha-state-icon>
            </div>
            <div class="info">
              <span class="name">${this._name(stateObj)}</span>
              <span class="state">${stateText}</span>
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

      /* On a very small tile, shrink everything but keep the icon AND both
         lines of text visible (they ellipsis rather than disappear). */
      @container ahatile (max-width: 132px) {
        .content { padding: 11px 12px; gap: 4px; }
        .badge { width: 32px; height: 32px; --mdc-icon-size: 18px; }
        .name {
          font-size: 13px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .state {
          font-size: 11px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
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
        will-change: transform;
      }
      /* Only slider tiles capture vertical drag; everything else scrolls. */
      .tile[data-level] { touch-action: none; }

      .tile[data-pressed] {
        transform: scale(0.95);
        filter: brightness(1.05);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      }

      .tile:focus-visible {
        box-shadow: 0 0 0 3px var(--aha-accent), 0 8px 24px rgba(0, 0, 0, 0.1);
      }

      /* The state-driven color fill — the soul of the Apple Home look.
         Lights/covers fill to their level from the bottom (a slider); other
         accessories fill the whole tile. */
      .fill {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        height: var(--aha-fill-height, 100%);
        background: var(--aha-accent);
        opacity: var(--aha-fill-opacity, 0);
        transition: height 0.16s linear, opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .tile[data-dragging] .fill { transition: none; }
      .tile[data-dragging] { transform: none !important; }

      /* Fan blades spin while running; faster at higher speed. */
      @keyframes aha-fan-spin { to { transform: rotate(360deg); } }
      .badge ha-state-icon.spin {
        display: inline-flex;
        animation: aha-fan-spin var(--spin, 1.1s) linear infinite;
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
      direction: {},
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
    // "up" (default): fill anchored at the bottom, drag up = brighter.
    // "down": fill anchored at the top, drag down = brighter.
    const raw =
      this.direction === "down"
        ? (e.clientY - rect.top) / rect.height
        : (rect.bottom - e.clientY) / rect.height;
    const pct = Math.round(raw * 100);
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
        class="big-slider ${on ? "on" : ""} ${this.direction === "down" ? "dir-down" : ""}"
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

  _fmtTime(sec) {
    if (sec == null || isNaN(sec)) return "0:00";
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }

  _mediaPosition(a, playing) {
    let pos = a.media_position || 0;
    if (playing && a.media_position_updated_at) {
      pos += (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000;
    }
    return Math.min(pos, a.media_duration || pos);
  }

  _renderMedia(s) {
    const a = s.attributes;
    const playing = s.state === "playing";
    const dur = a.media_duration;
    const pos = this._mediaPosition(a, playing);
    const sources = a.source_list || [];
    return html`
      <div class="media">
        ${a.entity_picture
          ? html`<img class="art" src=${a.entity_picture} alt="" />`
          : html`<div class="art placeholder">
              <ha-icon icon="mdi:music"></ha-icon>
            </div>`}
        <div class="media-title">${a.media_title || "Not playing"}</div>
        <div class="media-sub">${a.media_artist || a.app_name || ""}</div>

        ${dur
          ? html`<div class="scrubber">
              <input
                type="range" min="0" max=${Math.round(dur)} .value=${String(Math.round(pos))}
                @change=${(e) =>
                  this._service("media_player", "media_seek", {
                    seek_position: Number(e.target.value),
                  })}
              />
              <div class="times">
                <span>${this._fmtTime(pos)}</span><span>${this._fmtTime(dur)}</span>
              </div>
            </div>`
          : ""}

        <div class="transport">
          <button
            aria-label="Previous track"
            title="Previous track"
            @click=${() => this._service("media_player", "media_previous_track")}>
            <ha-icon icon="mdi:skip-previous"></ha-icon>
          </button>
          <button
            class="primary"
            aria-label=${playing ? "Pause" : "Play"}
            title=${playing ? "Pause" : "Play"}
            @click=${() => this._service("media_player", "media_play_pause")}>
            <ha-icon icon=${playing ? "mdi:pause" : "mdi:play"}></ha-icon>
          </button>
          <button
            aria-label="Next track"
            title="Next track"
            @click=${() => this._service("media_player", "media_next_track")}>
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

        ${sources.length
          ? html`<select
              class="source"
              @change=${(e) =>
                this._service("media_player", "select_source", { source: e.target.value })}
            >
              ${sources.map(
                (src) => html`<option ?selected=${src === a.source}>${src}</option>`
              )}
            </select>`
          : ""}
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

  _renderFan(s) {
    const a = s.attributes;
    const on = s.state === "on";
    const pct = a.percentage != null ? a.percentage : 0;
    const pctStep = a.percentage_step || 1;
    const presets = Array.isArray(a.preset_modes) ? a.preset_modes : [];
    const hasPct = a.percentage != null || a.percentage_step != null;
    const canOsc = typeof a.oscillating === "boolean";
    const canDir = typeof a.direction === "string";
    return html`
      <div class="fan-sheet">
        <button
          class="toggle-big ${on ? "on" : ""}"
          @click=${() => this._service("fan", on ? "turn_off" : "turn_on")}
        >
          <ha-state-icon .hass=${this.hass} .stateObj=${s}></ha-state-icon>
          <span>${on ? "On" : "Off"}</span>
        </button>

        ${hasPct
          ? html`<div class="control-row">
              <span class="row-label">Speed</span>
              <input
                type="range" min="0" max="100" step=${pctStep}
                .value=${String(pct)}
                @change=${(e) => {
                  const value = Number(e.target.value);
                  if (value <= 0) this._service("fan", "turn_off");
                  else this._service("fan", "set_percentage", { percentage: value });
                }}
              />
              <span class="row-value">${pct}%</span>
            </div>`
          : ""}

        ${presets.length
          ? html`<select
              class="source"
              @change=${(e) =>
                this._service("fan", "set_preset_mode", { preset_mode: e.target.value })}
            >
              ${presets.map(
                (preset) => html`<option ?selected=${preset === a.preset_mode}>${preset}</option>`
              )}
            </select>`
          : ""}

        ${canOsc || canDir
          ? html`<div class="grid-btns fan-actions">
              ${canOsc
                ? html`<button @click=${() => this._service("fan", "oscillate", { oscillating: !a.oscillating })}>
                    <ha-icon icon="mdi:rotate-orbit"></ha-icon>
                    <span>${a.oscillating ? "Stop Swing" : "Swing"}</span>
                  </button>`
                : ""}
              ${canDir
                ? html`<button @click=${() =>
                    this._service("fan", "set_direction", {
                      direction: a.direction === "forward" ? "reverse" : "forward",
                    })}>
                    <ha-icon icon="mdi:swap-horizontal"></ha-icon>
                    <span>${a.direction === "forward" ? "Reverse" : "Forward"}</span>
                  </button>`
                : ""}
            </div>`
          : ""}
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
      case "fan": return this._renderFan(s);
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
      .big-slider.dir-down .fill {
        bottom: auto;
        top: 0;
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
      .row-value { font-size: 13px; color: var(--sheet-sub); min-width: 42px; text-align: right; }
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
      .scrubber { width: 100%; }
      .scrubber input[type="range"] { width: 100%; height: 6px; border-radius: 3px; }
      .scrubber input[type="range"]::-webkit-slider-thumb { width: 14px; height: 14px; }
      .times { display: flex; justify-content: space-between; font-size: 12px; color: var(--sheet-sub); margin-top: 4px; }
      .source {
        width: 100%; margin-top: 4px; padding: 10px 12px; border-radius: 12px;
        border: none; background: var(--sheet-control); color: #fff; font-size: 14px;
        font-family: inherit; cursor: pointer;
      }

      .transport {
        display: flex; align-items: center; justify-content: center; gap: 26px;
        --mdc-icon-size: 30px; margin: 6px 0 4px;
      }
      .transport button {
        background: none; border: none; color: #fff; cursor: pointer;
        display: grid; place-items: center;
      }
      .transport button.primary { --mdc-icon-size: 44px; }

      .fan-sheet { display: flex; flex-direction: column; gap: 16px; }
      .fan-actions { grid-template-columns: repeat(2, 1fr); }

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

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity], ["_pressed"]);
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
              <button
                aria-label="Previous track"
                title="Previous track"
                @click=${() => this._svc("media_previous_track")}>
                <ha-icon icon="mdi:skip-previous"></ha-icon>
              </button>
              <button
                class="primary"
                aria-label=${playing ? "Pause" : "Play"}
                title=${playing ? "Pause" : "Play"}
                @click=${() => this._svc("media_play_pause")}>
                <ha-icon icon=${playing ? "mdi:pause" : "mdi:play"}></ha-icon>
              </button>
              <button
                aria-label="Next track"
                title="Next track"
                @click=${() => this._svc("media_next_track")}>
                <ha-icon icon="mdi:skip-next"></ha-icon>
              </button>
            </div>
            ${active && a.media_duration
              ? html`<div class="pbar">
                  <div class="pfill" style="width:${Math.min(100, (this._pos(a, playing) / a.media_duration) * 100).toFixed(1)}%"></div>
                </div>`
              : ""}
          </div>
        </div>
      </ha-card>
    `;
  }

  _pos(a, playing) {
    let pos = a.media_position || 0;
    if (playing && a.media_position_updated_at) {
      pos += (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000;
    }
    return Math.min(pos, a.media_duration || pos);
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host { display: block; height: 100%; container-type: inline-size; container-name: ahamedia; }
      ha-card { background: transparent; border: none; box-shadow: none; height: 100%; }
      .pbar {
        height: 3px; border-radius: 2px; margin-top: 8px;
        background: rgba(255,255,255,0.22); overflow: hidden;
      }
      .pfill { height: 100%; background: #fff; border-radius: 2px; transition: width 0.3s linear; }
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
      .labels { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
      .title {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em; line-height: 1.12;
        overflow: hidden; color: var(--primary-text-color);
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
      }
      .sub {
        font-size: 13px; font-weight: 500; color: var(--secondary-text-color); line-height: 1.15;
        overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
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
      @container ahamedia (max-width: 180px) {
        .content { padding: 12px 13px; gap: 6px; }
        .top { gap: 10px; }
        .badge { width: 34px; height: 34px; --mdc-icon-size: 20px; }
        .title { font-size: 13px; }
        .sub { font-size: 11px; }
        .transport { gap: 12px; --mdc-icon-size: 20px; }
        .transport button.primary { --mdc-icon-size: 28px; }
      }
      @container ahamedia (min-width: 260px) {
        .content { padding: 16px 18px; }
        .badge { width: 42px; height: 42px; --mdc-icon-size: 24px; }
        .title { font-size: 17px; }
        .sub { font-size: 14px; }
        .transport button.primary { --mdc-icon-size: 36px; }
      }
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

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity]);
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
      :host { display: block; height: 100%; container-type: inline-size; container-name: ahaclimate; }
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
      .labels { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
      .name {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em; line-height: 1.12;
        color: var(--primary-text-color);
        overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
      }
      .sub { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); line-height: 1.15; }
      .tile.on .name, .tile.on .sub { color: #1c1c1e; }
      .dial { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .dial button {
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(120,120,128,0.28); color: var(--primary-text-color);
        display: grid; place-items: center; --mdc-icon-size: 20px;
      }
      .tile.on .dial button { background: rgba(255,255,255,0.35); color: #1c1c1e; }
      .dial button[disabled] { opacity: 0.4; cursor: default; }
      .target { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; color: var(--primary-text-color); }
      .tile.on .target { color: #1c1c1e; }
      @container ahaclimate (max-width: 180px) {
        .tile { padding: 12px 13px; gap: 8px; }
        .badge, .dial button { width: 30px; height: 30px; --mdc-icon-size: 18px; }
        .name { font-size: 13px; }
        .sub { font-size: 11px; }
        .target { font-size: 22px; }
      }
      @container ahaclimate (min-width: 250px) {
        .tile { padding: 16px 18px; }
        .badge, .dial button { width: 38px; height: 38px; --mdc-icon-size: 22px; }
        .name { font-size: 17px; }
        .sub { font-size: 14px; }
        .target { font-size: 30px; }
      }
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

  shouldUpdate(changed) {
    if (changed.has("_config") || changed.has("_pressed")) return true;
    if (changed.has("hass")) {
      const old = changed.get("hass");
      if (!old || !this.hass) return true;
      return (this._config.entities || []).some(
        (id) => old.states[id] !== this.hass.states[id]
      );
    }
    return false;
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

      @container ahatile (max-width: 132px) {
        .tile { padding: 12px 13px; gap: 8px; }
        .badge { width: 32px; height: 32px; --mdc-icon-size: 18px; }
        .name {
          font-size: 13px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .sub { font-size: 11px; }
      }

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

function ensureBackgroundLayer(doc) {
  if (!doc || !doc.head || !doc.body) return null;

  let layer = doc.getElementById("aha-bg-layer");
  if (layer) return layer;

  // Make HA's own surfaces see-through so the backdrop shows behind the cards.
  if (!doc.getElementById("aha-bg-transparency")) {
    const t = doc.createElement("style");
    t.id = "aha-bg-transparency";
    t.textContent =
      "html, body { background: transparent !important; }" +
      ":root { --lovelace-background: transparent !important;" +
      " --view-background: transparent !important; }" +
      "hui-view, hui-sections-view, hui-masonry-view, hui-panel-view," +
      " hui-root, ha-drawer .content { background: transparent !important; }";
    doc.head.appendChild(t);
  }

  if (!doc.getElementById("aha-bg-anim")) {
    const a = doc.createElement("style");
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
    doc.head.appendChild(a);
  }

  layer = doc.createElement("div");
  layer.id = "aha-bg-layer";
  const grad = doc.createElement("div");
  grad.className = "aha-bg-gradient";
  layer.appendChild(grad);
  layer.insertAdjacentHTML("beforeend", GLASS_OVERLAY_SVG);
  doc.body.appendChild(layer);
  return layer;
}

function applyBackground(key, doc) {
  const bg = BACKGROUNDS[key] ? key : "aurora";
  const layer = ensureBackgroundLayer(doc);
  if (!layer) return;
  const grad = layer.querySelector(".aha-bg-gradient");
  if (!grad) return;
  grad.style.background = BACKGROUNDS[bg].css;
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
    this._syncBackground();
  }

  _select(key) {
    const doc = this.ownerDocument || document;
    if (isDashboardViewHost(this)) applyBackground(key, doc);
    this.requestUpdate();
  }

  updated(changed) {
    if (changed.has("_config")) this._syncBackground();
  }

  _syncBackground() {
    const doc = this.ownerDocument || document;
    if (!isDashboardViewHost(this) || !doc || !doc.head || !doc.body) return;
    applyBackground(
      currentBackgroundKey() || (this._config && this._config.background) || "aurora",
      doc
    );
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

// ===========================================================================
// Weather tile — big condition, temperature, hi/lo + a forecast strip, with a
// gradient that reflects the current condition.
// ===========================================================================

const WEATHER_ICON = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
  exceptional: "mdi:alert-circle-outline",
};

const WEATHER_GRADIENT = {
  sunny: "linear-gradient(160deg, #2f8fff, #8ec9ff)",
  "clear-night": "linear-gradient(160deg, #0b1026, #243056)",
  partlycloudy: "linear-gradient(160deg, #4f93d6, #a9c7e8)",
  cloudy: "linear-gradient(160deg, #5f6773, #99a2ad)",
  fog: "linear-gradient(160deg, #7c828c, #b9bfc7)",
  rainy: "linear-gradient(160deg, #3c526b, #6d8aa6)",
  pouring: "linear-gradient(160deg, #2c3e52, #51708c)",
  "lightning-rainy": "linear-gradient(160deg, #2a2a40, #5a5f86)",
  lightning: "linear-gradient(160deg, #33334d, #6a6f96)",
  snowy: "linear-gradient(160deg, #8fa6bd, #dfe9f3)",
  "snowy-rainy": "linear-gradient(160deg, #7e93ad, #c7d6e6)",
  windy: "linear-gradient(160deg, #4a8fb0, #9fc4d6)",
  _default: "linear-gradient(160deg, #3a6ea5, #74a3d0)",
};

class AppleHomeWeatherCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true } };
  }

  static getStubConfig(hass) {
    const w = Object.keys(hass.states).find((e) => e.startsWith("weather."));
    return { entity: w || "", forecast_days: 7, animated: true };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a weather entity");
    this._config = { forecast_days: 7, animated: true, ...config };
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 6, rows: 3 });
  }

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity]);
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _unit() {
    const s = this._stateObj;
    return (
      (s && s.attributes.temperature_unit) ||
      (this.hass && this.hass.config.unit_system.temperature) ||
      "°"
    );
  }

  _round(n) {
    return n == null || isNaN(n) ? null : Math.round(n);
  }

  _forecast() {
    const s = this._stateObj;
    const days = Math.max(0, Math.min(7, Number(this._config.forecast_days ?? 7) || 0));
    if (!s || !days) return [];
    const raw = Array.isArray(s.attributes.forecast) ? s.attributes.forecast : [];
    return raw.slice(0, days);
  }

  _locationName() {
    return (this.hass && this.hass.config && this.hass.config.location_name) || null;
  }

  _animClass(cond) {
    if (["rainy", "pouring", "lightning-rainy"].includes(cond)) return "rain";
    if (["snowy", "snowy-rainy", "hail"].includes(cond)) return "snow";
    if (["lightning", "exceptional"].includes(cond)) return "storm";
    if (["cloudy", "partlycloudy"].includes(cond)) return "clouds";
    if (["windy", "windy-variant", "fog"].includes(cond)) return "wind";
    if (cond === "clear-night") return "night";
    if (cond === "sunny") return "sunny";
    return "calm";
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    if (!s) return html`<ha-card><div class="wx">Not found</div></ha-card>`;
    const a = s.attributes;
    const cond = s.state;
    const icon = WEATHER_ICON[cond] || "mdi:weather-cloudy";
    const grad = WEATHER_GRADIENT[cond] || WEATHER_GRADIENT._default;
    const unit = this._unit();
    const temp = this._round(a.temperature);
    const name = this._config.name || this._locationName() || a.friendly_name || "Weather";
    const fc = this._forecast();
    const hi = this._round(fc.length ? fc[0].temperature : a.temperature);
    const lo = this._round(fc.length ? fc[0].templow : undefined);
    const animClass = this._config.animated === false ? "off" : this._animClass(cond);

    return html`
      <ha-card style="--wx-grad:${grad}">
        <div class="sky ${animClass}" aria-hidden="true"></div>
        <div class="wx">
          <div class="head">
            <div class="now">
              <div class="temp">${temp != null ? `${temp}${unit}` : "—"}</div>
              <div class="meta">
                <span class="name">${name}</span>
                <span class="cond">${this._cap(cond)}</span>
                <span class="hilo">
                  ${hi != null ? html`H:${hi}${unit}` : ""}
                  ${lo != null ? html` L:${lo}${unit}` : ""}
                </span>
              </div>
            </div>
            <ha-icon class="big-ic" icon=${icon}></ha-icon>
          </div>
          ${fc.length
            ? html`<div class="strip">
                ${fc.map(
                  (f) => html`<div class="col">
                    <span class="d">${this._day(f.datetime || f.datetime_iso || f.native_datetime)}</span>
                    <ha-icon icon=${WEATHER_ICON[f.condition] || "mdi:weather-cloudy"}></ha-icon>
                    <span class="t">${this._round(f.temperature)}${unit}</span>
                  </div>`
                )}
              </div>`
            : ""}
        </div>
      </ha-card>
    `;
  }

  _cap(s) {
    return typeof s === "string"
      ? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())
      : s;
  }

  _day(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }

  static get styles() {
    return css`
      :host { display: block; height: 100%; container-type: inline-size; container-name: ahawx; }
      ha-card {
        position: relative;
        height: 100%;
        border: none;
        border-radius: 22px;
        background: var(--wx-grad);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.18);
        overflow: hidden;
        font-family: ${FONT_STACK_CSS};
        color: #fff;
        isolation: isolate;
      }
      .sky {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        opacity: 0.55;
      }
      .sky.off { display: none; }
      .sky::before,
      .sky::after {
        content: "";
        position: absolute;
        pointer-events: none;
      }
      .sky.sunny::before {
        width: 140px; height: 140px; border-radius: 50%;
        top: -26px; right: -20px;
        background: radial-gradient(circle, rgba(255,255,255,0.75), rgba(255,255,255,0));
        animation: aha-wx-pulse 6s ease-in-out infinite;
      }
      .sky.night::before {
        inset: 0;
        background:
          radial-gradient(circle at 18% 22%, rgba(255,255,255,0.95) 0 1px, transparent 2px),
          radial-gradient(circle at 72% 18%, rgba(255,255,255,0.7) 0 1px, transparent 2px),
          radial-gradient(circle at 52% 36%, rgba(255,255,255,0.8) 0 1px, transparent 2px),
          radial-gradient(circle at 82% 42%, rgba(255,255,255,0.55) 0 1px, transparent 2px);
        animation: aha-wx-twinkle 7s ease-in-out infinite;
      }
      .sky.night::after {
        width: 90px; height: 90px; border-radius: 50%;
        top: -12px; right: -8px;
        background: radial-gradient(circle, rgba(255,255,255,0.5), rgba(255,255,255,0));
      }
      .sky.clouds::before,
      .sky.storm::before,
      .sky.wind::before {
        width: 180px; height: 72px; border-radius: 999px;
        top: 18px; left: -40px;
        background: rgba(255,255,255,0.22);
        filter: blur(10px);
        animation: aha-wx-drift 14s linear infinite;
      }
      .sky.clouds::after,
      .sky.storm::after {
        width: 140px; height: 56px; border-radius: 999px;
        top: 58px; right: -24px;
        background: rgba(255,255,255,0.14);
        filter: blur(12px);
        animation: aha-wx-drift 18s linear infinite reverse;
      }
      .sky.rain::before,
      .sky.wind::after {
        inset: -20% -10%;
        background: repeating-linear-gradient(
          105deg,
          rgba(255,255,255,0) 0 12px,
          rgba(255,255,255,0.18) 12px 14px,
          rgba(255,255,255,0) 14px 28px
        );
        animation: aha-wx-rain 1.6s linear infinite;
      }
      .sky.snow::before {
        inset: -10%;
        background:
          radial-gradient(circle at 12% 18%, rgba(255,255,255,0.9) 0 2px, transparent 3px),
          radial-gradient(circle at 34% 58%, rgba(255,255,255,0.8) 0 2px, transparent 3px),
          radial-gradient(circle at 68% 26%, rgba(255,255,255,0.85) 0 2px, transparent 3px),
          radial-gradient(circle at 82% 72%, rgba(255,255,255,0.75) 0 2px, transparent 3px),
          radial-gradient(circle at 54% 86%, rgba(255,255,255,0.8) 0 2px, transparent 3px);
        background-size: 140px 140px;
        animation: aha-wx-snow 8s linear infinite;
      }
      .sky.storm::after {
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 70%);
        opacity: 0;
        animation: aha-wx-flash 4s ease-in-out infinite;
      }
      .wx {
        position: relative;
        z-index: 1;
        height: 100%;
        box-sizing: border-box;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .now { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
      .temp {
        flex: none;
        font-size: 52px;
        font-weight: 300;
        letter-spacing: -0.03em;
        line-height: 0.9;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.2);
      }
      .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .name {
        font-size: 15px; font-weight: 600; line-height: 1.12;
        overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
      }
      .cond { font-size: 14px; opacity: 0.92; }
      .hilo { font-size: 13px; opacity: 0.85; }
      .big-ic { --mdc-icon-size: 56px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25)); flex: none; }
      .strip {
        display: flex;
        justify-content: flex-start;
        gap: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.18);
        padding-top: 10px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .strip::-webkit-scrollbar { display: none; }
      .col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: none;
        min-width: 42px;
        --mdc-icon-size: 22px;
      }
      .col .d { font-size: 12px; opacity: 0.85; }
      .col .t { font-size: 13px; font-weight: 600; }
      @container ahawx (max-width: 210px) {
        .wx { padding: 12px 14px; gap: 10px; }
        .now { gap: 10px; }
        .temp { font-size: 38px; }
        .name { font-size: 13px; }
        .cond, .hilo, .col .t { font-size: 11px; }
        .col .d { font-size: 10px; }
        .big-ic { --mdc-icon-size: 42px; }
        .col { min-width: 36px; }
      }
      @container ahawx (max-width: 160px) {
        .wx { padding: 10px 12px; gap: 8px; }
        .temp { font-size: 30px; }
        .big-ic { --mdc-icon-size: 32px; }
        .cond, .hilo, .col .t { font-size: 10px; }
        .col .d { font-size: 9px; }
        .col { min-width: 32px; }
      }
      @container ahawx (min-width: 280px) {
        .temp { font-size: 60px; }
        .name { font-size: 16px; }
        .cond { font-size: 15px; }
        .hilo { font-size: 14px; }
        .big-ic { --mdc-icon-size: 64px; }
        .strip { gap: 8px; }
        .col { min-width: 46px; }
      }
      @keyframes aha-wx-pulse {
        0%, 100% { transform: scale(0.94); opacity: 0.72; }
        50% { transform: scale(1.04); opacity: 1; }
      }
      @keyframes aha-wx-twinkle {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 0.9; }
      }
      @keyframes aha-wx-drift {
        from { transform: translateX(0); }
        to { transform: translateX(26px); }
      }
      @keyframes aha-wx-rain {
        from { transform: translateY(-12px); }
        to { transform: translateY(18px); }
      }
      @keyframes aha-wx-snow {
        from { transform: translateY(-8px) translateX(0); }
        to { transform: translateY(16px) translateX(8px); }
      }
      @keyframes aha-wx-flash {
        0%, 82%, 100% { opacity: 0; }
        84% { opacity: 0.85; }
        88% { opacity: 0.15; }
        90% { opacity: 0.65; }
      }
      @media (prefers-reduced-motion: reduce) {
        .sky::before,
        .sky::after { animation: none !important; }
      }
    `;
  }
}

customElements.define("apple-home-weather-card", AppleHomeWeatherCard);

// ===========================================================================
// Graph tile — current value + a sparkline of recent history. For temperature,
// humidity, air-quality and any numeric sensor.
// ===========================================================================

const GRAPH_COLORS = {
  temperature: "#ff9f0a",
  humidity: "#0a84ff",
  pm25: "#30d158",
  pm10: "#30d158",
  aqi: "#bf5af2",
  carbon_dioxide: "#64d2ff",
  voc: "#5e5ce6",
  pressure: "#8e8e93",
  power: "#ffd60a",
  _default: "#0a84ff",
};

class AppleHomeGraphCard extends LitElement {
  static get properties() {
    return { hass: {}, _config: { state: true }, _points: { state: true } };
  }

  static getStubConfig(hass) {
    const s = Object.keys(hass.states).find(
      (e) => e.startsWith("sensor.") && !isNaN(parseFloat(hass.states[e].state))
    );
    return { entity: s || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a sensor entity");
    this._config = { hours: 24, ...config };
    this._points = undefined;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 6, rows: 2 });
  }

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity], ["_points"]);
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetch();
    this._timer = window.setInterval(() => this._fetch(), 5 * 60 * 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _color() {
    if (this._config.color) return this._config.color;
    const s = this._stateObj;
    const dc = s && s.attributes.device_class;
    if (dc && GRAPH_COLORS[dc]) return GRAPH_COLORS[dc];
    const id = this._config.entity;
    if (/pm2_?5|pm25/.test(id)) return GRAPH_COLORS.pm25;
    if (/humid/.test(id)) return GRAPH_COLORS.humidity;
    if (/temp/.test(id)) return GRAPH_COLORS.temperature;
    if (/voc/.test(id)) return GRAPH_COLORS.voc;
    return GRAPH_COLORS._default;
  }

  async _fetch() {
    if (!this.hass || !this._config) return;
    const end = new Date();
    const start = new Date(end.getTime() - (this._config.hours || 24) * 3600000);
    try {
      const path =
        `history/period/${start.toISOString()}` +
        `?filter_entity_id=${this._config.entity}` +
        `&minimal_response&significant_changes_only&no_attributes`;
      const res = await this.hass.callApi("GET", path);
      const series = (res && res[0]) || [];
      this._points = series
        .map((p) => ({
          t: new Date(p.last_changed || p.last_updated || p.lu || p.lc).getTime(),
          v: parseFloat(p.state != null ? p.state : p.s),
        }))
        .filter((p) => !isNaN(p.v) && !isNaN(p.t));
    } catch (e) {
      this._points = [];
    }
  }

  _path(pts, w, h, pad) {
    const xs = pts.map((p) => p.t);
    const vs = pts.map((p) => p.v);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minV = Math.min(...vs);
    const maxV = Math.max(...vs);
    const spanX = maxX - minX || 1;
    const spanV = maxV - minV || 1;
    const X = (t) => ((t - minX) / spanX) * w;
    const Y = (v) => pad + (1 - (v - minV) / spanV) * (h - pad * 2);
    const line = pts
      .map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`)
      .join(" ");
    const area = `${line} L${w} ${h} L0 ${h} Z`;
    return { line, area, minV, maxV };
  }
  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    const color = this._color();
    const unit = (s && s.attributes.unit_of_measurement) || "";
    const name =
      this._config.name || (s && s.attributes.friendly_name) || this._config.entity;
    const current = s ? this._fmt(s.state) : "—";

    const pts = this._points;
    let graph = html`<div class="loading">${pts ? "No history" : "…"}</div>`;
    if (pts && pts.length > 1) {
      const w = 300;
      const h = 90;
      const { line, area, minV, maxV } = this._path(pts, w, h, 6);
      graph = html`
        <svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="g-${this._gid()}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.35"></stop>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          <path d=${area} fill="url(#g-${this._gid()})"></path>
          <path
            d=${line}
            fill="none"
            stroke=${color}
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          ></path>
        </svg>
        <div class="minmax">
          <span>${this._fmt(minV)}</span><span>${this._fmt(maxV)}</span>
        </div>
      `;
    }

    return html`
      <ha-card style="--g-color:${color}">
        <div class="wrap" @click=${this._moreInfo}>
          <div class="head">
            <span class="name">${name}</span>
            <span class="val">${current}<span class="unit">${unit}</span></span>
          </div>
          <div class="chart">${graph}</div>
        </div>
      </ha-card>
    `;
  }

  _gid() {
    if (!this.__gid) this.__gid = Math.random().toString(36).slice(2, 8);
    return this.__gid;
  }

  _fmt(v) {
    const n = Number(v);
    if (isNaN(n)) return v;
    return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  }

  _moreInfo() {
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: this._config.entity };
    this.dispatchEvent(e);
  }

  static get styles() {
    return css`
      :host { display: block; height: 100%; container-type: inline-size; container-name: ahagraph; }
      ha-card {
        height: 100%;
        border: none;
        border-radius: 22px;
        background: var(--aha-tile-background, rgba(120, 120, 128, 0.16));
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        font-family: ${FONT_STACK_CSS};
      }
      .wrap {
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        cursor: pointer;
      }
      .head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 16px 6px;
      }
      .name {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--primary-text-color);
        line-height: 1.12;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .val {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--g-color);
        white-space: nowrap;
        flex: none;
      }
      .unit { font-size: 13px; font-weight: 500; opacity: 0.7; margin-left: 2px; }
      .chart { position: relative; flex: 1; min-height: 48px; }
      .spark { position: absolute; inset: 0; width: 100%; height: 100%; }
      .minmax {
        position: absolute;
        inset: 6px 12px 4px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-end;
        font-size: 11px;
        color: var(--secondary-text-color);
        pointer-events: none;
      }
      .loading {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--secondary-text-color);
        font-size: 13px;
      }
      @container ahagraph (max-width: 180px) {
        .head { flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 13px 4px; }
        .name { font-size: 13px; }
        .val { font-size: 18px; }
        .unit, .loading, .minmax { font-size: 11px; }
      }
      @container ahagraph (min-width: 250px) {
        .name { font-size: 17px; }
        .val { font-size: 26px; }
        .unit { font-size: 14px; }
      }
    `;
  }
}
customElements.define("apple-home-graph-card", AppleHomeGraphCard);

// ===========================================================================
// Pager — an iPhone-style swipeable, paged container. Each page is a room (or
// any group of cards); swipe horizontally with snap + page dots.
// ===========================================================================

class AppleHomeVacuumSheet extends LitElement {
  static get properties() {
    return {
      hass: {},
      entityId: {},
      accent: {},
      heading: {},
      batteryEntity: {},
      statusEntity: {},
      actions: {},
      _open: { state: true },
    };
  }

  get _stateObj() {
    return this.hass && this.entityId ? this.hass.states[this.entityId] : undefined;
  }

  get _batteryObj() {
    return this.hass && this.batteryEntity ? this.hass.states[this.batteryEntity] : undefined;
  }

  get _statusObj() {
    return this.hass && this.statusEntity ? this.hass.states[this.statusEntity] : undefined;
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

  _service(service) {
    this.hass.callService("vacuum", service, { entity_id: this.entityId });
  }

  _moreInfo() {
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: this.entityId };
    (document.querySelector("home-assistant") || this).dispatchEvent(e);
    this.close();
  }

  _batteryPct() {
    const s = this._stateObj;
    const direct = s && s.attributes.battery_level;
    if (direct != null && !Number.isNaN(Number(direct))) return Math.round(Number(direct));
    const sensor = this._batteryObj;
    if (!sensor) return null;
    const n = Number(sensor.state);
    return Number.isNaN(n) ? null : Math.round(n);
  }

  _statusText() {
    const sensor = this._statusObj;
    if (sensor && !["unknown", "unavailable", "none"].includes(sensor.state)) {
      return describeEntityState(sensor, isEntityOn(sensor));
    }
    const s = this._stateObj;
    return s ? describeVacuumState(s.state) : "Unavailable";
  }

  _primaryAction() {
    const s = this._stateObj;
    if (!s) return { label: "Start", service: "start", icon: "mdi:play" };
    if (s.state === "cleaning") {
      return { label: "Pause", service: "pause", icon: "mdi:pause" };
    }
    if (s.state === "paused") {
      return { label: "Resume", service: "start", icon: "mdi:play" };
    }
    return { label: "Start", service: "start", icon: "mdi:play" };
  }

  _actionConfigs() {
    return Array.isArray(this.actions) ? this.actions : [];
  }

  _actionLabel(action) {
    if (action.label) return action.label;
    const entityId = action.entity || action.entity_id;
    if (!entityId) return "Action";
    return getEntityDisplayName(this.hass.states[entityId], entityId);
  }

  _actionIcon(action) {
    return action.icon || "mdi:floor-plan";
  }

  _renderStatusPill(label, value, accent) {
    return html`<span class="pill ${accent ? "accent" : ""}"><span>${label}</span><strong>${value}</strong></span>`;
  }

  render() {
    const s = this._stateObj;
    const primary = this._primaryAction();
    const battery = this._batteryPct();
    const status = this._statusText();
    const cleaning = s && s.state === "cleaning";
    const returning = s && s.state === "returning";
    const name = this.heading || getEntityDisplayName(s, this.entityId);
    const quickActions = this._actionConfigs();
    const subtitle = cleaning
      ? "Cleaning is in progress."
      : returning
        ? "Heading back to the dock."
        : "Ready for the next run.";
    return html`
      <div
        class="backdrop ${this._open ? "open" : ""}"
        @click=${(e) => { if (e.target === e.currentTarget) this.close(); }}
      >
        <div class="sheet ${this._open ? "open" : ""}" style="--sheet-accent:${this.accent || "#64d2ff"}">
          <div class="grabber"></div>
          <div class="head">
            <span class="title">${name}</span>
            <button class="close" @click=${() => this.close()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>

          <div class="hero ${cleaning ? "cleaning" : returning ? "returning" : ""}">
            <div class="hero-main">
              <div class="hero-badge">
                <ha-icon icon="mdi:robot-vacuum"></ha-icon>
              </div>
              <div class="hero-copy">
                <div class="hero-state">${status}</div>
                <div class="hero-sub">${subtitle}</div>
              </div>
            </div>
            <div class="pill-row">
              ${battery != null ? this._renderStatusPill("Battery", `${battery}%`, true) : ""}
              ${s ? this._renderStatusPill("State", describeVacuumState(s.state), false) : ""}
            </div>
          </div>

          <div class="section-title">Controls</div>
          <div class="grid-btns primary-grid">
            <button @click=${() => this._service(primary.service)}>
              <ha-icon icon=${primary.icon}></ha-icon>
              <span>${primary.label}</span>
            </button>
            <button @click=${() => this._service("return_to_base")}>
              <ha-icon icon="mdi:home-import-outline"></ha-icon>
              <span>Dock</span>
            </button>
            <button @click=${() => this._service("locate")}>
              <ha-icon icon="mdi:map-marker"></ha-icon>
              <span>Locate</span>
            </button>
          </div>

          ${quickActions.length
            ? html`
                <div class="section-title">Quick Rooms</div>
                <div class="action-grid">
                  ${quickActions.map(
                    (action) => html`
                      <button class="room-action" @click=${() => callConfiguredAction(this.hass, action)}>
                        <ha-icon icon=${this._actionIcon(action)}></ha-icon>
                        <span>${this._actionLabel(action)}</span>
                      </button>
                    `
                  )}
                </div>
              `
            : ""}

          <button class="more" @click=${() => this._moreInfo()}>Open in Home Assistant</button>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      :host {
        --sheet-fg: #fff;
        --sheet-sub: rgba(235, 235, 245, 0.68);
        --sheet-bg: rgba(28, 28, 30, 0.84);
        --sheet-control: rgba(120, 120, 128, 0.22);
        font-family: ${FONT_STACK_CSS};
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
        max-width: 430px;
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
      .sheet.open { transform: translateY(0); }
      @media (min-width: 600px) {
        .backdrop { align-items: center; }
        .sheet {
          border-radius: 30px;
          transform: translateY(20px) scale(0.96);
          opacity: 0;
          transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.32s ease;
        }
        .sheet.open {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
      }
      .grabber {
        width: 38px;
        height: 5px;
        border-radius: 3px;
        background: rgba(235, 235, 245, 0.3);
        margin: 6px auto 12px;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }
      .title {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      .close {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 50%;
        background: rgba(120, 120, 128, 0.3);
        color: var(--sheet-sub);
        display: grid;
        place-items: center;
        cursor: pointer;
        --mdc-icon-size: 18px;
      }
      .hero {
        position: relative;
        overflow: hidden;
        border-radius: 26px;
        padding: 18px;
        margin-bottom: 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
          radial-gradient(circle at top right, color-mix(in srgb, var(--sheet-accent) 48%, transparent), transparent 58%),
          var(--sheet-control);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: -40% auto -40% -30%;
        width: 55%;
        background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.16), rgba(255,255,255,0));
        transform: rotate(14deg);
        opacity: 0;
        pointer-events: none;
      }
      .hero.cleaning::after {
        opacity: 1;
        animation: aha-vacuum-sheen 2.6s linear infinite;
      }
      .hero-main {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .hero-badge {
        width: 62px;
        height: 62px;
        border-radius: 20px;
        display: grid;
        place-items: center;
        flex: none;
        background: rgba(255, 255, 255, 0.9);
        color: #111;
        --mdc-icon-size: 34px;
        box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
      }
      .hero.cleaning .hero-badge {
        animation: aha-vacuum-badge 2.2s linear infinite;
      }
      .hero.returning .hero-badge {
        animation: aha-vacuum-return 1.5s ease-in-out infinite;
      }
      .hero-copy {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hero-state {
        font-size: 24px;
        font-weight: 650;
        letter-spacing: -0.03em;
      }
      .hero-sub {
        font-size: 14px;
        color: var(--sheet-sub);
      }
      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--sheet-sub);
        font-size: 12px;
      }
      .pill strong {
        color: #fff;
        font-size: 13px;
        font-weight: 600;
      }
      .pill.accent {
        background: color-mix(in srgb, var(--sheet-accent) 32%, rgba(255, 255, 255, 0.06));
        color: rgba(12, 12, 13, 0.72);
      }
      .pill.accent strong { color: #0f1115; }
      .section-title {
        margin: 18px 0 10px;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--sheet-sub);
      }
      .grid-btns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .grid-btns button,
      .room-action,
      .more {
        font-family: inherit;
      }
      .grid-btns button,
      .room-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 88px;
        padding: 16px 12px;
        border: none;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        cursor: pointer;
        --mdc-icon-size: 24px;
        transition: transform 0.24s ease, background 0.24s ease;
      }
      .grid-btns button:hover,
      .room-action:hover {
        transform: translateY(-1px);
        background: rgba(255, 255, 255, 0.12);
      }
      .action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .room-action {
        min-height: 92px;
        align-items: flex-start;
        justify-content: flex-end;
        text-align: left;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
          rgba(255, 255, 255, 0.06);
      }
      .room-action span {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
      }
      .more {
        margin-top: 20px;
        width: 100%;
        padding: 14px;
        border: none;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--sheet-accent);
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      @keyframes aha-vacuum-sheen {
        0% { transform: translateX(-10%) rotate(14deg); }
        100% { transform: translateX(220%) rotate(14deg); }
      }
      @keyframes aha-vacuum-badge {
        0% { transform: rotate(0deg) translateY(0); }
        25% { transform: rotate(8deg) translateY(-2px); }
        50% { transform: rotate(0deg) translateY(0); }
        75% { transform: rotate(-8deg) translateY(2px); }
        100% { transform: rotate(0deg) translateY(0); }
      }
      @keyframes aha-vacuum-return {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(4px); }
      }
      @media (max-width: 480px) {
        .sheet { padding: 10px 16px 18px; }
        .grid-btns {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .action-grid { gap: 10px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .sheet,
        .backdrop,
        .hero::after,
        .hero-badge,
        .grid-btns button,
        .room-action {
          transition-duration: 0.01ms !important;
          animation: none !important;
        }
      }
    `;
  }
}

customElements.define("apple-home-vacuum-sheet", AppleHomeVacuumSheet);

class AppleHomeVacuumCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _pressed: { state: true },
      _pop: { state: true },
    };
  }

  static getStubConfig(hass) {
    const vacuum = Object.keys(hass.states).find((e) => e.startsWith("vacuum."));
    return { entity: vacuum || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a vacuum entity");
    this._config = { actions: [], ...config };
  }

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, this._entityIds(), ["_pressed", "_pop"]);
  }

  updated(changed) {
    if (changed.has("hass") && this._sheet && this.hass) this._sheet.hass = this.hass;
    const s = this._stateObj;
    if (!s) return;
    const cleaning = s.state === "cleaning";
    if (this._prevCleaning !== undefined && cleaning !== this._prevCleaning) {
      this._pop = cleaning ? "cleaning" : "idle";
      window.clearTimeout(this._popTimer);
      this._popTimer = window.setTimeout(() => (this._pop = null), 650);
    }
    this._prevCleaning = cleaning;
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sheet) this._sheet.close();
    if (this._badge) LightField.unregister(this._badge);
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 4, rows: 3 });
  }

  _entityIds() {
    const ids = [this._config.entity, this._config.battery_entity, this._config.status_entity];
    (this._config.actions || []).forEach((action) => ids.push(action.entity || action.entity_id));
    return [...new Set(ids.filter(Boolean))];
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  get _batteryObj() {
    return this.hass && this._config.battery_entity ? this.hass.states[this._config.battery_entity] : undefined;
  }

  get _statusObj() {
    return this.hass && this._config.status_entity ? this.hass.states[this._config.status_entity] : undefined;
  }

  _batteryPct() {
    const s = this._stateObj;
    const direct = s && s.attributes.battery_level;
    if (direct != null && !Number.isNaN(Number(direct))) return Math.round(Number(direct));
    const sensor = this._batteryObj;
    if (!sensor) return null;
    const n = Number(sensor.state);
    return Number.isNaN(n) ? null : Math.round(n);
  }

  _statusText() {
    const sensor = this._statusObj;
    if (sensor && !["unknown", "unavailable", "none"].includes(sensor.state)) {
      return describeEntityState(sensor, isEntityOn(sensor));
    }
    const s = this._stateObj;
    return s ? describeVacuumState(s.state) : "Unavailable";
  }

  _actionConfigs() {
    return Array.isArray(this._config.actions) ? this._config.actions : [];
  }

  _accent() {
    return this._config.color || DOMAIN_ACCENT.vacuum;
  }

  _openSheet() {
    if (this._sheet || !this.hass) return;
    const sheet = document.createElement("apple-home-vacuum-sheet");
    sheet.hass = this.hass;
    sheet.entityId = this._config.entity;
    sheet.heading = this._config.name || getEntityDisplayName(this._stateObj, this._config.entity);
    sheet.accent = this._accent();
    sheet.batteryEntity = this._config.battery_entity;
    sheet.statusEntity = this._config.status_entity;
    sheet.actions = this._actionConfigs();
    sheet.addEventListener("sheet-closed", () => (this._sheet = undefined));
    document.body.appendChild(sheet);
    this._sheet = sheet;
    requestAnimationFrame(() => sheet.show());
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    if (!s) {
      return html`<ha-card><div class="tile unavailable"><div class="name">${this._config.entity}</div><div class="state">Not found</div></div></ha-card>`;
    }
    const cleaning = s.state === "cleaning";
    const active = ["cleaning", "returning"].includes(s.state);
    const battery = this._batteryPct();
    const status = this._statusText();
    const accent = this._accent();
    const icon = this._config.icon || "mdi:robot-vacuum";
    const rooms = this._actionConfigs().length;
    return html`
      <ha-card style="--accent:${accent}">
        <div
          class="tile ${active ? "on" : "off"} ${cleaning ? "cleaning" : ""}"
          ?data-pressed=${this._pressed}
          data-pop=${this._pop || "none"}
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => { this._pressed = false; this._openSheet(); }}
          @pointerleave=${() => (this._pressed = false)}
          role="button"
          tabindex="0"
          @keydown=${(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this._openSheet();
            }
          }}
        >
          <div class="wash"></div>
          ${battery != null ? html`<div class="corner-pill">${battery}%</div>` : ""}
          <div class="content">
            <div class="badge"><ha-icon icon=${icon}></ha-icon></div>
            <div class="copy">
              <div class="name">${this._config.name || getEntityDisplayName(s, this._config.entity)}</div>
              <div class="state">${status}</div>
            </div>
            <div class="meta">
              ${rooms ? html`<span class="meta-pill">${rooms} room${rooms == 1 ? "" : "s"}</span>` : ""}
              <span class="meta-pill">Tap to open</span>
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
        display: block;
        height: 100%;
        container-type: inline-size;
        container-name: ahavacuum;
      }
      ha-card {
        background: transparent;
        border: none;
        box-shadow: none;
        height: 100%;
        overflow: visible;
      }
      .tile {
        position: relative;
        min-height: 108px;
        height: 100%;
        border-radius: 26px;
        overflow: hidden;
        cursor: pointer;
        background: rgba(120, 120, 128, 0.16);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), background 0.32s ease, box-shadow 0.32s ease;
        outline: none;
      }
      .tile.on {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04)),
          color-mix(in srgb, var(--accent) 42%, rgba(120, 120, 128, 0.12));
      }
      .tile[data-pressed] {
        transform: scale(0.97);
        box-shadow: 0 1px 2px rgba(0,0,0,0.12);
      }
      .tile:focus-visible {
        box-shadow: 0 0 0 3px var(--accent), 0 8px 24px rgba(0,0,0,0.14);
      }
      .wash {
        position: absolute;
        inset: -45%;
        background: radial-gradient(circle at center, rgba(255,255,255,0.3), rgba(255,255,255,0) 58%);
        opacity: 0;
        transform: translateX(-30%);
        pointer-events: none;
      }
      .tile.cleaning .wash {
        opacity: 1;
        animation: aha-vacuum-sweep 3s linear infinite;
      }
      .corner-pill {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 1;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.88);
        color: #111;
        font-family: ${FONT_STACK_CSS};
        font-size: 12px;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .content {
        position: relative;
        height: 100%;
        box-sizing: border-box;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }
      .badge {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(120,120,128,0.26);
        color: var(--primary-text-color);
        --mdc-icon-size: 24px;
        transition: background 0.32s ease, color 0.32s ease;
      }
      .tile.on .badge {
        background: rgba(255,255,255,0.92);
        color: #111;
      }
      .copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .name {
        font-family: ${FONT_STACK_CSS};
        font-size: 18px;
        font-weight: 650;
        line-height: 1.1;
        letter-spacing: -0.02em;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state {
        font-family: ${FONT_STACK_CSS};
        font-size: 14px;
        font-weight: 500;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tile.on .name,
      .tile.on .state {
        color: #111;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .meta-pill {
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        color: inherit;
        font-family: ${FONT_STACK_CSS};
        font-size: 12px;
        font-weight: 600;
      }
      .tile.on .meta-pill {
        background: rgba(255,255,255,0.5);
      }
      .tile[data-pop="cleaning"] {
        animation: aha-vacuum-start 0.58s cubic-bezier(0.22, 0.9, 0.24, 1.16);
      }
      .tile[data-pop="cleaning"] .badge {
        animation: aha-vacuum-badge-pop 0.58s cubic-bezier(0.22, 0.9, 0.24, 1.16);
      }
      @container ahavacuum (max-width: 170px) {
        .content { padding: 14px; }
        .badge { width: 36px; height: 36px; --mdc-icon-size: 20px; }
        .name {
          font-size: 15px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .state { font-size: 12px; line-height: 1.12; }
        .meta-pill { font-size: 11px; padding: 6px 8px; }
      }
      @keyframes aha-vacuum-sweep {
        0% { transform: translateX(-30%); }
        100% { transform: translateX(30%); }
      }
      @keyframes aha-vacuum-start {
        0% { transform: scale(1); }
        40% { transform: scale(1.03); }
        100% { transform: scale(1); }
      }
      @keyframes aha-vacuum-badge-pop {
        0% { transform: scale(1); }
        45% { transform: scale(1.14) rotate(8deg); }
        100% { transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .tile,
        .wash,
        .badge {
          transition-duration: 0.01ms !important;
          animation: none !important;
        }
      }
    `;
  }
}

customElements.define("apple-home-vacuum-card", AppleHomeVacuumCard);

class AppleHomeFanCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _pressed: { state: true },
      _pop: { state: true },
    };
  }

  static getStubConfig(hass) {
    const fan = Object.keys(hass.states).find((e) => e.startsWith("fan."));
    return { entity: fan || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define a fan entity");
    this._config = config;
  }

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity], ["_pressed", "_pop"]);
  }

  updated(changed) {
    if (changed.has("hass") && this._sheet && this.hass) this._sheet.hass = this.hass;
    const s = this._stateObj;
    if (!s) return;
    const on = s.state === "on";
    if (this._prevOn !== undefined && on !== this._prevOn) {
      this._pop = on ? "on" : "off";
      window.clearTimeout(this._popTimer);
      this._popTimer = window.setTimeout(() => (this._pop = null), 520);
    }
    this._prevOn = on;
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._sheet) this._sheet.close();
    if (this._badge) LightField.unregister(this._badge);
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 4, rows: 3 });
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _accent() {
    return this._config.color || DOMAIN_ACCENT.fan;
  }

  _statusText(s) {
    return describeEntityState(s, s && s.state === "on");
  }

  _hasPercentage(s) {
    return !!(s && (s.attributes.percentage != null || s.attributes.percentage_step != null));
  }

  _percentage(s) {
    return s && s.attributes.percentage != null ? Number(s.attributes.percentage) : 0;
  }

  _stepAmount(s) {
    const step = s && Number(s.attributes.percentage_step);
    return Number.isFinite(step) && step > 0 ? step : 25;
  }

  _togglePower() {
    const s = this._stateObj;
    if (!s) return;
    this.hass.callService("fan", s.state === "on" ? "turn_off" : "turn_on", {
      entity_id: this._config.entity,
    });
  }

  _setPercentage(value) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    if (pct <= 0) {
      this.hass.callService("fan", "turn_off", { entity_id: this._config.entity });
      return;
    }
    this.hass.callService("fan", "set_percentage", {
      entity_id: this._config.entity,
      percentage: pct,
    });
  }

  _step(delta) {
    const s = this._stateObj;
    if (!s) return;
    const next = this._percentage(s) + delta * this._stepAmount(s);
    this._setPercentage(next);
  }

  _openSheet() {
    if (this._sheet) return;
    this._sheet = createSheet(this.hass, this._config.entity, this._accent(), () => (this._sheet = undefined));
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const s = this._stateObj;
    if (!s) {
      return html`<ha-card><div class="tile unavailable"><div class="name">${this._config.entity}</div><div class="state">Not found</div></div></ha-card>`;
    }
    const on = s.state === "on";
    const accent = this._accent();
    const preset = s.attributes.preset_mode;
    const oscillating = s.attributes.oscillating;
    const direction = s.attributes.direction;
    const hasPct = this._hasPercentage(s);
    const pct = this._percentage(s);
    const speedLabel = hasPct && on ? `${pct}%` : this._statusText(s);
    return html`
      <ha-card style="--accent:${accent}">
        <div
          class="tile ${on ? "on" : "off"}"
          ?data-pressed=${this._pressed}
          data-pop=${this._pop || "none"}
          role="button"
          tabindex="0"
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => (this._pressed = false)}
          @pointerleave=${() => (this._pressed = false)}
          @click=${() => this._openSheet()}
          @keydown=${(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              this._openSheet();
            }
          }}
        >
          <div class="wash"></div>
          <div class="content">
            <div class="top">
              <div class="badge">
                <ha-icon class="blade ${on ? "spin" : ""}" icon=${this._config.icon || "mdi:fan"}></ha-icon>
              </div>
              <div class="copy">
                <div class="name">${this._config.name || getEntityDisplayName(s, this._config.entity)}</div>
                <div class="state">${speedLabel}</div>
              </div>
            </div>

            <div class="meta">
              ${preset ? html`<span class="meta-pill">${capitalizeText(preset)}</span>` : ""}
              ${oscillating ? html`<span class="meta-pill">Swing</span>` : ""}
              ${direction ? html`<span class="meta-pill">${capitalizeText(direction)}</span>` : ""}
            </div>

            <div class="actions" @click=${(e) => e.stopPropagation()}>
              ${hasPct
                ? html`
                    <button class="control mini" aria-label="Decrease speed" @click=${() => this._step(-1)}>
                      <ha-icon icon="mdi:minus"></ha-icon>
                    </button>
                    <button class="control power ${on ? "on" : ""}" @click=${() => this._togglePower()}>
                      <ha-icon icon=${on ? "mdi:power" : "mdi:play"}></ha-icon>
                      <span>${on ? "Turn Off" : "Turn On"}</span>
                    </button>
                    <button class="control mini" aria-label="Increase speed" @click=${() => this._step(1)}>
                      <ha-icon icon="mdi:plus"></ha-icon>
                    </button>
                  `
                : html`
                    <button class="control power wide ${on ? "on" : ""}" @click=${() => this._togglePower()}>
                      <ha-icon icon=${on ? "mdi:power" : "mdi:play"}></ha-icon>
                      <span>${on ? "Turn Off" : "Turn On"}</span>
                    </button>
                  `}
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
        display: block;
        height: 100%;
        container-type: inline-size;
        container-name: ahafan;
      }
      ha-card {
        background: transparent;
        border: none;
        box-shadow: none;
        height: 100%;
      }
      .tile {
        position: relative;
        min-height: 108px;
        height: 100%;
        border-radius: 26px;
        overflow: hidden;
        cursor: pointer;
        background: rgba(120, 120, 128, 0.16);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        transition: transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2), background 0.32s ease;
      }
      .tile.on {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04)),
          color-mix(in srgb, var(--accent) 36%, rgba(120, 120, 128, 0.12));
      }
      .tile[data-pressed] { transform: scale(0.97); }
      .wash {
        position: absolute;
        inset: -40% -10%;
        background: radial-gradient(circle at top center, rgba(255,255,255,0.22), rgba(255,255,255,0) 58%);
        opacity: 0;
        pointer-events: none;
      }
      .tile.on .wash { opacity: 1; }
      .content {
        position: relative;
        height: 100%;
        box-sizing: border-box;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .badge {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(120,120,128,0.26);
        color: var(--primary-text-color);
        --mdc-icon-size: 24px;
        transition: background 0.32s ease, color 0.32s ease;
      }
      .tile.on .badge {
        background: rgba(255,255,255,0.92);
        color: #111;
      }
      .blade.spin {
        display: inline-flex;
        animation: aha-fan-card-spin 1.1s linear infinite;
      }
      .copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .name {
        font-family: ${FONT_STACK_CSS};
        font-size: 18px;
        font-weight: 650;
        line-height: 1.1;
        letter-spacing: -0.02em;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .state {
        font-family: ${FONT_STACK_CSS};
        font-size: 14px;
        font-weight: 500;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tile.on .name,
      .tile.on .state { color: #111; }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .meta-pill {
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        color: inherit;
        font-family: ${FONT_STACK_CSS};
        font-size: 12px;
        font-weight: 600;
      }
      .tile.on .meta-pill { background: rgba(255,255,255,0.48); }
      .actions {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr) 40px;
        gap: 10px;
      }
      .control {
        min-height: 40px;
        border: none;
        border-radius: 14px;
        background: rgba(255,255,255,0.12);
        color: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: ${FONT_STACK_CSS};
        font-size: 13px;
        font-weight: 650;
        transition: transform 0.24s ease, background 0.24s ease;
        --mdc-icon-size: 18px;
      }
      .control:hover { transform: translateY(-1px); }
      .control.power.on {
        background: rgba(255,255,255,0.9);
        color: #111;
      }
      .control.wide {
        grid-column: 1 / -1;
      }
      .tile[data-pop="on"] .badge {
        animation: aha-fan-card-pop 0.5s cubic-bezier(0.2, 0.8, 0.3, 1.2);
      }
      @container ahafan (max-width: 180px) {
        .content { padding: 14px; }
        .badge { width: 36px; height: 36px; --mdc-icon-size: 20px; }
        .name {
          font-size: 15px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .state { font-size: 12px; line-height: 1.12; }
        .actions { gap: 8px; grid-template-columns: 36px minmax(0, 1fr) 36px; }
        .control { min-height: 36px; font-size: 12px; }
      }
      @keyframes aha-fan-card-spin { to { transform: rotate(360deg); } }
      @keyframes aha-fan-card-pop {
        0% { transform: scale(1); }
        45% { transform: scale(1.14); }
        100% { transform: scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .tile,
        .blade,
        .badge,
        .control {
          transition-duration: 0.01ms !important;
          animation: none !important;
        }
      }
    `;
  }
}

customElements.define("apple-home-fan-card", AppleHomeFanCard);

class AppleHomeChip extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _pressed: { state: true },
    };
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find((e) => e.startsWith("sensor.")) || "";
    return { entity };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You must define an entity");
    this._config = {
      show_state: true,
      show_icon: true,
      tint: true,
      tap_action: { action: "more-info" },
      ...config,
    };
  }

  shouldUpdate(changed) {
    return onlyIfEntitiesChanged(this, changed, [this._config.entity], ["_pressed"]);
  }

  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".icon-badge");
    LightField.register(this._badge);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._badge) LightField.unregister(this._badge);
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: 2, rows: 1, min_columns: 1, min_rows: 1 };
  }

  get _stateObj() {
    return this.hass ? this.hass.states[this._config.entity] : undefined;
  }

  _accent(stateObj) {
    const domain = stateObj ? domainOf(stateObj.entity_id) : domainOf(this._config.entity);
    return this._config.color || DOMAIN_ACCENT[domain] || DOMAIN_ACCENT._default;
  }

  _moreInfo() {
    const e = new Event("hass-more-info", { bubbles: true, composed: true });
    e.detail = { entityId: this._config.entity };
    this.dispatchEvent(e);
  }

  _toggleEntity() {
    const stateObj = this._stateObj;
    if (!stateObj) return;
    const behavior = DOMAIN_BEHAVIOR[domainOf(stateObj.entity_id)];
    if (!behavior || !behavior.toggle) {
      this._moreInfo();
      return;
    }
    const spec = typeof behavior.toggle === "function" ? behavior.toggle(stateObj) : behavior.toggle;
    this.hass.callService(spec[0], spec[1], { entity_id: stateObj.entity_id });
  }

  _runAction(actionConfig) {
    const action = actionConfig || { action: "more-info" };
    switch (action.action) {
      case "none":
        return;
      case "toggle":
        this._toggleEntity();
        return;
      case "navigate":
        if (action.navigation_path) {
          history.pushState(null, "", action.navigation_path);
          const e = new Event("location-changed", { bubbles: true, composed: true });
          e.detail = { replace: false };
          this.dispatchEvent(e);
        }
        return;
      case "url":
        if (action.url_path) window.open(action.url_path);
        return;
      case "call-service":
      case "perform-action":
        callConfiguredAction(this.hass, action);
        return;
      case "controls":
      case "more-info":
      default:
        this._moreInfo();
    }
  }

  render() {
    if (!this._config || !this.hass) return html``;
    const stateObj = this._stateObj;
    if (!stateObj) {
      return html`<ha-card><button class="chip"><span class="label">${this._config.entity}</span><span class="value">Not found</span></button></ha-card>`;
    }
    const accent = this._accent(stateObj);
    const label = this._config.name || getEntityDisplayName(stateObj, this._config.entity);
    const value = this._config.state_text || describeEntityState(stateObj, isEntityOn(stateObj));
    const active = isEntityOn(stateObj);
    const tinted = this._config.tint !== false;
    return html`
      <ha-card style="--accent:${accent}">
        <button
          class="chip ${active ? "on" : "off"} ${tinted ? "tinted" : ""}"
          ?data-pressed=${this._pressed}
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => (this._pressed = false)}
          @pointerleave=${() => (this._pressed = false)}
          @click=${() => this._runAction(this._config.tap_action)}
        >
          ${this._config.show_icon !== false
            ? html`
                <span class="icon-badge">
                  <ha-state-icon
                    .hass=${this.hass}
                    .stateObj=${stateObj}
                    .icon=${this._config.icon || undefined}
                  ></ha-state-icon>
                </span>
              `
            : ""}
          <span class="label">${label}</span>
          ${this._config.show_state !== false ? html`<span class="value">${value}</span>` : ""}
        </button>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host {
        display: block;
        height: 100%;
        container-type: inline-size;
        container-name: ahachip;
      }
      ha-card {
        background: transparent;
        border: none;
        box-shadow: none;
        height: 100%;
      }
      .chip {
        width: 100%;
        min-height: 52px;
        padding: 10px 12px;
        border: none;
        border-radius: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(120, 120, 128, 0.14);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.08);
        cursor: pointer;
        transition: transform 0.24s ease, background 0.24s ease;
        text-align: left;
        font-family: ${FONT_STACK_CSS};
      }
      .chip.tinted {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04)),
          color-mix(in srgb, var(--accent) 18%, rgba(120, 120, 128, 0.14));
      }
      .chip.on {
        background:
          linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04)),
          color-mix(in srgb, var(--accent) 42%, rgba(120, 120, 128, 0.12));
      }
      .chip[data-pressed] { transform: scale(0.98); }
      .icon-badge {
        width: 28px;
        height: 28px;
        flex: none;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(255,255,255,0.72);
        color: #111;
        --mdc-icon-size: 16px;
      }
      .label {
        min-width: 0;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.15;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .value {
        margin-left: auto;
        min-width: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .chip.on .label,
      .chip.on .value { color: #111; }
      @container ahachip (max-width: 170px) {
        .chip { padding: 9px 10px; gap: 8px; }
        .label { font-size: 12px; }
        .value { font-size: 11px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .chip { transition-duration: 0.01ms !important; }
      }
    `;
  }
}

customElements.define("apple-home-chip", AppleHomeChip);

class AppleHomePager extends LitElement {
  static get properties() {
    return { _config: { state: true }, _cards: { state: true }, _page: { state: true } };
  }

  static getStubConfig() {
    return {
      pages: [
        { title: "Room 1", cards: [] },
        { title: "Room 2", cards: [] },
      ],
    };
  }

  set hass(v) {
    this._hass = v;
    if (this._cards) this._cards.forEach((c) => c && (c.hass = v));
  }
  get hass() {
    return this._hass;
  }

  setConfig(config) {
    if (!config.pages || !config.pages.length) {
      throw new Error("You must define at least one page");
    }
    this._config = config;
    this._page = 0;
    this._buildCards();
  }

  getCardSize() {
    return 8;
  }

  async _buildCards() {
    const helpers = await (window.loadCardHelpers
      ? window.loadCardHelpers()
      : HELPERS);
    this._cards = this._config.pages.map((page) => {
      const conf =
        page.card ||
        {
          type: "grid",
          columns: page.columns || this._config.columns || 2,
          square: false, // tiles size to content, not big squares
          cards: page.cards || [],
        };
      let el;
      try {
        el = helpers.createCardElement(conf);
      } catch (e) {
        el = helpers.createErrorCard
          ? helpers.createErrorCard({ type: "error", error: String(e), origConfig: conf })
          : document.createElement("div");
      }
      if (this._hass) el.hass = this._hass;
      el.addEventListener("ll-rebuild", (ev) => {
        ev.stopPropagation();
        this._buildCards();
      });
      return el;
    });
    this.requestUpdate();
  }

  firstUpdated() {
    this._track = this.renderRoot.querySelector(".track");
  }

  _onScroll() {
    if (!this._track) return;
    const i = Math.round(this._track.scrollLeft / this._track.clientWidth);
    if (i !== this._page) this._page = i;
  }

  _goto(i) {
    if (!this._track) return;
    this._track.scrollTo({ left: this._track.clientWidth * i, behavior: "smooth" });
  }

  render() {
    if (!this._config) return html``;
    const pages = this._config.pages;
    const showDots = this._config.show_dots !== false && pages.length > 1;
    return html`
      <div class="pager">
        <div class="track" @scroll=${this._onScroll}>
          ${pages.map(
            (p, i) => html`
              <div class="page">
                ${p.title
                  ? html`<div class="ptitle">
                      ${p.icon ? html`<ha-icon icon=${p.icon}></ha-icon>` : ""}
                      <span>${p.title}</span>
                    </div>`
                  : ""}
                <div class="pbody">${this._cards ? this._cards[i] : ""}</div>
              </div>
            `
          )}
        </div>
        ${showDots
          ? html`<div class="dots">
              ${pages.map(
                (_, i) => html`<button
                  class="dot ${i === this._page ? "active" : ""}"
                  aria-label="Page ${i + 1}"
                  @click=${() => this._goto(i)}
                ></button>`
              )}
            </div>`
          : ""}
      </div>
    `;
  }

  static get styles() {
    return css`
      :host { display: block; }
      .pager { width: 100%; }
      .track {
        display: flex;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .track::-webkit-scrollbar { display: none; }
      .page {
        flex: 0 0 100%;
        scroll-snap-align: center;
        box-sizing: border-box;
        padding: 0 2px;
      }
      .ptitle {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: ${FONT_STACK_CSS};
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--primary-text-color);
        margin: 2px 6px 14px;
        --mdc-icon-size: 24px;
      }
      .dots {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin-top: 16px;
      }
      .dot {
        width: 8px;
        height: 8px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--disabled-text-color, rgba(127, 127, 127, 0.4));
        cursor: pointer;
        transition: width 0.3s ease, border-radius 0.3s ease,
          background 0.3s ease;
      }
      .dot.active {
        width: 22px;
        border-radius: 4px;
        background: var(--primary-color, #0a84ff);
      }
    `;
  }
}

customElements.define("apple-home-pager", AppleHomePager);

// ===========================================================================
// Group — an Apple-style container tile. Shows a summary; tap opens a frosted
// panel containing the cards inside, for browsing/control.
// ===========================================================================

class AppleHomeGroupSheet extends LitElement {
  static get properties() {
    return { _open: { state: true }, _ready: { state: true } };
  }
  set hass(v) {
    this._hass = v;
    if (this._inner) this._inner.hass = v;
  }
  get hass() {
    return this._hass;
  }
  set cardsConfig(c) {
    this._cardsConfig = c;
    this._build();
  }
  async _build() {
    const helpers = await (window.loadCardHelpers ? window.loadCardHelpers() : HELPERS);
    try {
      this._inner = helpers.createCardElement(this._cardsConfig);
    } catch (e) {
      this._inner = document.createElement("div");
    }
    if (this._hass) this._inner.hass = this._hass;
    this._ready = true;
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
  render() {
    return html`
      <div
        class="backdrop ${this._open ? "open" : ""}"
        @click=${(e) => { if (e.target === e.currentTarget) this.close(); }}
      >
        <div class="sheet ${this._open ? "open" : ""}" style="--sheet-accent:${this.accent || "#0a84ff"}">
          <div class="grabber"></div>
          <div class="head">
            <span class="title">${this.heading || "Group"}</span>
            <button class="close" @click=${() => this.close()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="content">${this._inner || ""}</div>
        </div>
      </div>
    `;
  }
  static get styles() {
    return css`
      :host { font-family: ${FONT_STACK_CSS}; }
      .backdrop {
        position: fixed; inset: 0; z-index: 9999; display: flex;
        align-items: flex-end; justify-content: center;
        background: rgba(0, 0, 0, 0); transition: background 0.3s ease;
      }
      .backdrop.open { background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(2px); }
      .sheet {
        width: 100%; max-width: 540px; margin: 0 8px; box-sizing: border-box;
        max-height: 86vh; overflow-y: auto;
        background: rgba(28, 28, 30, 0.82);
        backdrop-filter: blur(40px) saturate(180%);
        -webkit-backdrop-filter: blur(40px) saturate(180%);
        color: #fff; border-radius: 28px 28px 0 0; padding: 10px 18px 20px;
        transform: translateY(110%);
        transition: transform 0.36s cubic-bezier(0.2, 0.9, 0.3, 1);
        box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.4);
      }
      @media (min-width: 600px) {
        .backdrop { align-items: center; }
        .sheet { border-radius: 28px; }
      }
      .sheet.open { transform: translateY(0); }
      .grabber { width: 38px; height: 5px; border-radius: 3px; background: rgba(235,235,245,0.3); margin: 6px auto 12px; }
      .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
      .close { width: 30px; height: 30px; border: none; border-radius: 50%; background: rgba(120,120,128,0.32); color: rgba(235,235,245,0.6); display: grid; place-items: center; cursor: pointer; --mdc-icon-size: 18px; }
    `;
  }
}
customElements.define("apple-home-group-sheet", AppleHomeGroupSheet);

class AppleHomeGroup extends LitElement {
  static get properties() {
    return { _config: { state: true }, _pressed: { state: true } };
  }
  static getStubConfig() {
    return { name: "Group", icon: "mdi:dots-grid", cards: [] };
  }
  setConfig(config) {
    if (!config.cards && !config.entities) {
      throw new Error("Define `cards` (and optionally `entities` for the summary)");
    }
    this._config = { columns: 2, ...config };
  }
  set hass(v) {
    const old = this._hass;
    this._hass = v;
    if (this._sheet) this._sheet.hass = v;
    if (!old || (this._config && this._entityIds().some((id) => old.states[id] !== v.states[id]))) {
      this.requestUpdate();
    }
  }
  get hass() {
    return this._hass;
  }
  getCardSize() {
    return 1;
  }
  getGridOptions() {
    return gridFor(this._config && this._config.size, { columns: 3, rows: 2 });
  }
  _entityIds() {
    if (this._config.entities) return this._config.entities;
    return (this._config.cards || []).map((c) => c.entity).filter(Boolean);
  }
  _summary() {
    if (!this._hass) return "";
    const states = this._entityIds().map((i) => this._hass.states[i]).filter(Boolean);
    const total = states.length;
    const on = states.filter(isEntityOn).length;
    if (!total) return `${(this._config.cards || []).length} items`;
    if (on === 0) return "All off";
    if (on === total) return total === 1 ? "On" : "All on";
    return `${on} of ${total} on`;
  }
  _open() {
    if (this._sheet) return;
    const el = document.createElement("apple-home-group-sheet");
    el.hass = this._hass;
    el.heading = this._config.name || "Group";
    el.accent = this._config.color || "#0a84ff";
    el.cardsConfig = { type: "grid", columns: this._config.columns || 2, square: false, cards: this._config.cards || [] };
    el.addEventListener("sheet-closed", () => (this._sheet = undefined));
    document.body.appendChild(el);
    this._sheet = el;
    requestAnimationFrame(() => el.show());
  }
  firstUpdated() {
    this._badge = this.renderRoot.querySelector(".badge");
    LightField.register(this._badge);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._badge) LightField.unregister(this._badge);
    if (this._sheet) this._sheet.close();
  }
  render() {
    if (!this._config || !this._hass) return html``;
    const on = this._hass && this._entityIds().some((id) => isEntityOn(this._hass.states[id]));
    const accent = this._config.color || "#0a84ff";
    return html`
      <ha-card style="--accent:${accent}">
        <div
          class="tile ${on ? "on" : "off"}"
          ?data-pressed=${this._pressed}
          @pointerdown=${() => (this._pressed = true)}
          @pointerup=${() => { this._pressed = false; this._open(); }}
          @pointerleave=${() => (this._pressed = false)}
        >
          <div class="badge"><ha-icon icon=${this._config.icon || "mdi:dots-grid"}></ha-icon></div>
          <div class="info">
            <span class="name">${this._config.name || "Group"}</span>
            <span class="sub">${this._summary()}</span>
          </div>
          <ha-icon class="chev" icon="mdi:chevron-right"></ha-icon>
        </div>
      </ha-card>
    `;
  }
  static get styles() {
    return css`
      ${GLASS_BADGE_CSS}
      :host { display: block; height: 100%; container-type: inline-size; container-name: ahatile; }
      ha-card { background: transparent; border: none; box-shadow: none; height: 100%; }
      .tile {
        position: relative; height: 100%; min-height: 84px; box-sizing: border-box;
        border-radius: 22px; padding: 14px 16px; cursor: pointer;
        display: flex; flex-direction: column; justify-content: space-between; gap: 10px;
        background: var(--aha-tile-background, rgba(120,120,128,0.16));
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.1);
        transition: transform 0.28s cubic-bezier(0.2,0.9,0.3,1.2);
        will-change: transform;
      }
      .tile[data-pressed] { transform: scale(0.95); }
      .badge {
        width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
        --mdc-icon-size: 20px; background: var(--accent); color: #fff;
      }
      .info { display: flex; flex-direction: column; min-width: 0; }
      .name {
        font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--primary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sub { font-size: 13px; font-weight: 500; color: var(--secondary-text-color); }
      .chev { position: absolute; top: 14px; right: 12px; color: var(--secondary-text-color); --mdc-icon-size: 20px; }
      @container ahatile (max-width: 132px) {
        .name {
          font-size: 13px;
          line-height: 1.12;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .sub { font-size: 11px; }
        .badge { width: 32px; height: 32px; --mdc-icon-size: 18px; }
      }
    `;
  }
}
customElements.define("apple-home-group", AppleHomeGroup);

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
const DOCS_URL = "https://github.com/captaincooked69/HA-Air";
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
  },
  {
    type: "apple-home-weather-card",
    name: "Apple Home Weather",
    description: "Condition + temperature + forecast strip with a condition-aware gradient.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-graph-card",
    name: "Apple Home Graph",
    description: "Current value + sparkline history for temperature, humidity, air quality, etc.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-vacuum-card",
    name: "Apple Home Vacuum",
    description: "Dedicated vacuum tile with an animated cleaning state and quick room actions.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-fan-card",
    name: "Apple Home Fan",
    description: "Dedicated fan tile with speed controls and a fan detail sheet.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-chip",
    name: "Apple Home Chip",
    description: "Compact standalone status chips for battery, mode, presence, and sensor state.",
    preview: true,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-pager",
    name: "Apple Home Pager",
    description: "iPhone-style swipeable pages of cards, one room per page, with page dots.",
    preview: false,
    documentationURL: DOCS_URL,
  },
  {
    type: "apple-home-group",
    name: "Apple Home Group",
    description: "A container tile that opens into a frosted panel of the cards inside.",
    preview: false,
    documentationURL: DOCS_URL,
  }
);
