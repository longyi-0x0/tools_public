// WebXR session lifecycle + controller input.
//
// Deliberately thin. three's WebXRManager already owns the camera, the eye framebuffers and
// the animation loop; all this class does is probe capability, open/close `immersive-vr`,
// and translate PICO / Quest controllers (xr-standard mapping) into the same axis shape the
// keyboard path already produces, so the steering code downstream does not care which one
// it is talking to.

const THUMBSTICK_XY = 2;   // xr-standard: axes 0/1 are the touchpad, 2/3 the thumbstick

export class XRSession {
  constructor(renderer) {
    this.renderer = renderer;
    this.session = null;
    this.supported = false;
    /** Why the last `enter()` refused. The DOM has nowhere else to read it from. */
    this.lastError = '';
    this.active = false;
    /** @type {'local-floor'|'local'} */
    this.spaceType = 'local-floor';

    // one entry per input source, refreshed every frame
    this.hands = [];
    this.axis = { x: 0, y: 0 };
    this.boost = false;
    this.lift = false;
    this.gaze = false;

    // edge-detected button names emitted this frame
    this.pressed = [];
    this._prev = new Map();

    this.onSessionStart = null;
    this.onSessionEnd = null;
    this.onButton = null;
  }

  /** Cheap, safe to call before showing any VR affordance. */
  async probe() {
    if (typeof navigator === 'undefined' || !navigator.xr || !navigator.xr.isSessionSupported) {
      this.supported = false;
      return false;
    }
    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (e) {
      this.supported = false;
    }
    return this.supported;
  }

  /**
   * Ask for an immersive session.
   *
   * `force` skips the capability check: some runtimes answer "no immersive-vr device" until
   * a session is actually requested, and a headset has no console to read a refusal from,
   * so the button always lets the request through and `lastError` carries the reply.
   */
  async enter({ force = false } = {}) {
    this.lastError = '';
    if (this.active) {
      this.lastError = '已经在 VR 会话里';
      return null;
    }
    if (!force && !this.supported) {
      this.lastError = '能力探测说这个运行时没有 immersive-vr 设备';
      return null;
    }
    if (typeof navigator === 'undefined' || !navigator.xr || typeof navigator.xr.requestSession !== 'function') {
      this.lastError = '这个浏览器没有 navigator.xr.requestSession';
      return null;
    }

    let session;
    try {
      session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
      });
    } catch (first) {
      // 'layers' or 'hand-tracking' being rejected should not cost us the session
      try {
        session = await navigator.xr.requestSession('immersive-vr');
      } catch (e) {
        this.lastError = `requestSession 被拒：${(e && e.message) || e}`;
        if (e && e.name) this.lastError += `（${e.name}）`;
        else if (first && first.name) this.lastError += `（${first.name}）`;
        return null;
      }
    }

    this.session = session;
    this.active = true;

    const xr = this.renderer.xr;
    xr.enabled = true;
    await xr.setSession(session);

    // Seated/standing both work; ask for the floor so the eye height is honest, and fall
    // back to 'local' on runtimes that refuse it.
    try {
      await xr.setReferenceSpaceType('local-floor');
      this.spaceType = 'local-floor';
    } catch (e) {
      await xr.setReferenceSpaceType('local');
      this.spaceType = 'local';
    }

    session.addEventListener('end', () => {
      this.active = false;
      this.session = null;
      this.hands = [];
      this.axis.x = this.axis.y = 0;
      this.boost = this.lift = this.gaze = false;
      this._prev.clear();
      if (this.onSessionEnd) this.onSessionEnd();
    });

    if (this.onSessionStart) this.onSessionStart(session);
    return session;
  }

  async exit() {
    if (this.session) {
      try { await this.session.end(); } catch (e) { /* already ending */ }
    }
  }

  /** Collapse a button into a stable name so callers never index raw arrays. */
  _name(scheme, profile, i) {
    const base = ['trigger', 'squeeze', 'touchpad', 'thumbstick', 'a', 'b'][i] || `btn${i}`;
    // PICO and Quest both ship xr-standard; index 4/5 are A/B on the right and X/Y on the left
    if (i === 4) return scheme === 'left' ? 'x' : 'a';
    if (i === 5) return scheme === 'left' ? 'y' : 'b';
    return base;
  }

  /** Call once per XR frame, before the rig reads `axis` / `boost` / `lift`. */
  update() {
    this.axis.x = 0;
    this.axis.y = 0;
    this.boost = false;
    this.lift = false;
    this.gaze = false;
    this.pressed.length = 0;
    if (!this.active || !this.session) return;

    const sources = this.session.inputSources;
    const nowDown = new Set();

    for (const src of sources) {
      const gp = src.gamepad;
      const scheme = src.handedness || 'none';

      if (gp) {
        const ax = gp.axes && gp.axes.length > THUMBSTICK_XY ? gp.axes[THUMBSTICK_XY] : 0;
        const ay = gp.axes && gp.axes.length > THUMBSTICK_XY + 1 ? gp.axes[THUMBSTICK_XY + 1] : 0;

        // either hand can drive; sum so a two-handed grip does not cancel out
        if (Math.abs(ax) > Math.abs(this.axis.x)) this.axis.x = ax;
        if (Math.abs(ay) > Math.abs(this.axis.y)) this.axis.y = ay;

        const btns = gp.buttons || [];
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i];
          if (!b || !b.pressed) continue;
          const name = this._name(scheme, src.profiles, i);
          nowDown.add(name);

          if (name === 'trigger') this.boost = true;
          if (name === 'squeeze') this.lift = true;
          // a button pressed this frame but not last frame -> an edge
          if (!this._prev.has(name)) this.pressed.push(name);
        }

        // thumbstick click doubles as an easy "up" so a single stick covers both axes
        if (btns[3] && btns[3].pressed) this.lift = true;
      }

      // gaze / controller pitch both feed the "where am I pointing" intent
      if (!gp || !gp.buttons || !gp.buttons.some((b) => b && b.pressed)) this.gaze = true;
    }

    this._prev = nowDown;

    if (this.onButton) {
      for (const name of this.pressed) this.onButton(name);
    }
  }

  /** True when the user is only looking around (no controller), so gaze steers. */
  get gazeOnly() {
    return this.active && this.hands.length === 0;
  }

  dispose() {
    if (this.active) this.exit();
  }
}
