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

const VERSION = "0.1.0";

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
  script: { on: (s) => s.state === "on", toggle: ["homeassistant", "toggle"] },
  lock: {
    on: (s) => s.state === "unlocked",
    toggle: (s) => ["lock", s.state === "locked" ? "unlock" : "lock"],
  },
  cover: {
    on: (s) => s.state === "open",
    toggle: (s) => ["cover", s.state === "closed" ? "open_cover" : "close_cover"],
  },
  climate: { on: (s) => s.state !== "off", toggle: null },
  media_player: { on: (s) => !["off", "idle", "standby"].includes(s.state), toggle: ["media_player", "media_play_pause"] },
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
  climate: "#ff9f0a",
  media_player: "#bf5af2",
  automation: "#5e5ce6",
  script: "#5e5ce6",
  binary_sensor: "#30d158",
  person: "#30d158",
  device_tracker: "#30d158",
  _default: "#0a84ff",
};

function domainOf(entityId) {
  return entityId ? entityId.split(".")[0] : "";
}

class AppleHomeCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: { state: true },
      _pressed: { state: true },
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
      hold_action: { action: "more-info" },
      double_tap_action: { action: "more-info" },
      ...config,
    };
  }

  getCardSize() {
    return 1;
  }

  // --- Helpers -------------------------------------------------------------

  get _stateObj() {
    return this._config && this.hass
      ? this.hass.states[this._config.entity]
      : undefined;
  }

  _isOn(stateObj) {
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
    if (domain === "cover") return s === "open" ? "Open" : "Closed";
    if (domain === "lock") return s === "locked" ? "Locked" : "Unlocked";
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
      this._moreInfo();
      return;
    }
    const spec =
      typeof behavior.toggle === "function"
        ? behavior.toggle(stateObj)
        : behavior.toggle;
    this.hass.callService(spec[0], spec[1], { entity_id: stateObj.entity_id });
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
      :host {
        --aha-radius: var(--aha-card-radius, 22px);
        --aha-tile-bg: var(
          --aha-tile-background,
          rgba(120, 120, 128, 0.16)
        );
        --aha-text: var(--aha-tile-foreground, var(--primary-text-color));
        --aha-subtext: var(--aha-tile-subforeground, var(--secondary-text-color));
        --aha-badge-bg: var(--aha-badge-background, rgba(120, 120, 128, 0.24));
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
        selector: { ui_action: { default_action: "more-info" } },
      },
      {
        name: "double_tap_action",
        selector: { ui_action: { default_action: "more-info" } },
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
window.customCards = window.customCards || [];
window.customCards.push({
  type: "apple-home-card",
  name: "Apple Home Card",
  description: "An Apple Home-inspired tile for lights, switches, and more.",
  preview: true,
  documentationURL: "https://github.com/your-username/apple-home-card",
});
