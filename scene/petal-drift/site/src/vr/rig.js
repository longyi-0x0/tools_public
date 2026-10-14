// First-person VR rig.
//
// In the 2D build the FollowCam chases the swarm from behind: it lerps its own yaw,
// auto-aligns behind the direction of travel once you stop steering, adds a handheld shake,
// and dollies in when you settle. Every one of those is a camera *rotation or translation*
// applied by the program rather than by the neck — and in a headset that is the fastest
// route to nausea, because the inner ear and the eyes stop agreeing.
//
// So this rig never touches the camera. three's WebXRManager owns the camera pose outright.
// We move the *reference space origin* underneath it instead: a pure translation of the
// player's floor anchor, with the head pose layered on top by the runtime. The swarm still
// does all the flying; we just ride it.
//
// Riding the swarm means the camera inherits its velocity, so the comfort work is mostly
// about speed: `speedScale` (applied in petals.js), a deadzone so a resting thumb is not
// drift, and letting go bleeds momentum rather than stopping dead.

import * as THREE from 'three';

export class VRRig {
  constructor(opts = {}) {
    /** @type {'ride'|'free'} ride = camera rides the swarm, free = independent walk */
    this.mode = opts.mode || 'ride';

    this.speedScale = opts.speedScale ?? 0.32;
    this.deadzone = opts.deadzone ?? 0.16;
    this.boostMul = opts.boostMul ?? 1.9;
    this.walkSpeed = opts.walkSpeed ?? 2.4;

    this.eye = new THREE.Vector3();
    this.freePos = new THREE.Vector3();
    this._baseSpace = null;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._fwd = new THREE.Vector3(0, 0, -1);
    this._right = new THREE.Vector3(1, 0, 0);
    this._move = new THREE.Vector3();
    this._flat = new THREE.Vector3();
    this._lastOffset = new THREE.Vector3(NaN, NaN, NaN);
    this._v3 = new THREE.Vector3();
  }

  /**
   * Capture the runtime's original reference space. Must be called once after the session
   * starts — every frame we derive a fresh offset space from *this* one, never from the
   * already-offset space, or the offsets would compound and the player would rocket away.
   */
  attach(renderer) {
    this._baseSpace = renderer.xr.getReferenceSpace() || null;
    this._lastOffset.set(NaN, NaN, NaN);
  }

  detach() {
    this._baseSpace = null;
  }

  /** Head yaw in world space, taken from the runtime — never from our own simulated camera. */
  headYaw(renderer) {
    const cam = renderer.xr.getCamera();
    if (cam && cam.matrixWorld) {
      this._q.setFromRotationMatrix(cam.matrixWorld);
      this._e.setFromQuaternion(this._q, 'YXZ');
      return this._e.y;
    }
    return 0;
  }

  /** Horizontal head forward, written into `out`. Mirrors the camera-space basis used above. */
  forward(out) {
    const yaw = this._lastYaw || 0;
    return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  /** Eye height above the reference space floor, with a sane fallback for odd runtimes. */
  headHeight(renderer) {
    const cam = renderer.xr.getCamera();
    const y = cam && cam.position ? cam.position.y : 0;
    return y > 0.3 && y < 3.0 ? y : 1.62;
  }

  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('./xr.js').XRSession} input
   * @param {number} dt
   * @param {object} petals the swarm this rig rides
   */
  update(renderer, input, dt, petals) {
    const yaw = this.headYaw(renderer);
    this._lastYaw = yaw;

    // ---- thumbstick -> world-space intent, in the frame the *head* is looking
    let ax = input.axis.x;
    let ay = input.axis.y;
    const mag = Math.hypot(ax, ay);
    if (mag < this.deadzone) {
      ax = 0; ay = 0;
    } else {
      // rescale past the deadzone so the first millimetre of travel is not a lurch
      const k = (mag - this.deadzone) / (1 - this.deadzone);
      ax = (ax / mag) * k;
      ay = (ay / mag) * k;
    }

    // three's forward for a given yaw is (-sin, 0, -cos); right is its cross with +Y
    this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this._move.set(0, 0, 0)
      .addScaledVector(this._fwd, -ay)   // stick up = fly forward
      .addScaledVector(this._right, ax);
    if (this._move.lengthSq() > 1) this._move.normalize();

    const boost = input.boost ? this.boostMul : 0;

    if (this.mode === 'ride') {
      // the swarm owns the motion; speedScale keeps it inside a comfort envelope
      petals.speedScale = this.speedScale;
      petals.steer(this._move, boost, input.lift ? 1 : 0);
      this.eye.copy(petals.guide);
    } else {
      // free walk: independent of the swarm, useful for looking at what you grew
      petals.speedScale = 1;
      petals.steer(this._move, 0, 0);
      const target = this.walkSpeed * (1 + boost * 0.8);
      this._flat.set(this._move.x, 0, this._move.z);
      if (this._flat.lengthSq() > 1e-6) this._flat.normalize().multiplyScalar(target * dt);
      this.freePos.add(this._flat);
      const gh = petals.terrainHeight ? petals.terrainHeight(this.freePos.x, this.freePos.z) : 0;
      this.freePos.y += ((gh + this.headHeight(renderer)) - this.freePos.y) * Math.min(1, dt * 6);
      this.eye.copy(this.freePos);
    }

    // ---- translate the reference space under the head
    if (this._baseSpace) {
      // the runtime reports the head relative to the floor anchor, so subtract it out:
      // the *eyes* should land on `this.eye`, not the floor
      const floorY = this.eye.y - this.headHeight(renderer);
      this._v3.set(this.eye.x, floorY, this.eye.z);
      // skip the alloc + runtime call when we have not actually moved
      if (!this._v3.equals(this._lastOffset)) {
        this._lastOffset.copy(this._v3);
        const t = new XRRigidTransform(
          { x: this._v3.x, y: this._v3.y, z: this._v3.z },
          { x: 0, y: 0, z: 0, w: 1 },
        );
        renderer.xr.setReferenceSpace(this._baseSpace.getOffsetReferenceSpace(t));
      }
    }
  }

  /** Seed free-walk mode from wherever the swarm currently is. */
  syncFreeFromSwarm(petals) {
    this.freePos.copy(petals.guide);
    this.freePos.y = petals.guide.y;
  }
}
