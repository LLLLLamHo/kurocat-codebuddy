import robotBaseUrl from './assets/codebuddy/robot_base.png';
import type { DaFeiYuLayout } from './dafeiyuRenderer';

interface HandState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  lastAt: number;
  squash: number;
  heldVks: Set<number>;
}

interface CyberRipple {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface CyberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  kind: 'hex' | 'spark';
  color: string;
}

/**
 * CodeBuddy Robot companion renderer for KuroCat.
 * Renders the 3D white cat-eared CodeBuddy robot sprite with:
 * - Dynamic glowing neon cyan/violet LED visor expressions (iconic `| <` wink, blink, coding flow, happy, privacy)
 * - Smooth Live2D-style gaze tracking inside the curved glossy black glass visor
 * - 3D-shaded articulated white/charcoal mechanical robot arms & rounded mittens
 * - Orbiting glowing purple-cyan CodeBuddy Hexagon Bit acting as the 3rd-hand key tapper
 * - Privacy mode where both mechanical hands raise up to shield the visor
 */
export class CodeBuddyRenderer {
  private baseSprite: HTMLImageElement;

  private lastKeyAt = -10000;
  private lastKeyGazeAt = -10000;
  private lastKeyPtX = 214;
  private lastKeyPtY = 353;
  private lastMouseClickAt = -10000;
  private keyTimes: number[] = [];
  private typingHeat = 0;
  private blushLevel = 0;
  private moodTier: 0 | 1 | 2 = 0;
  private moodChangedAt = -10000;
  private nextBlinkAt = performance.now() + 3800 + Math.random() * 2400;
  private blinkUntil = 0;

  // Eye gaze offset in native 448x556 sprite coordinates
  private eyeGazeX = 0;
  private eyeGazeY = 0;

  private bodyShiftX = 0;
  private bodyShiftVel = 0;
  private bodyShiftTarget = 0;
  private bodyTilt = 0;
  private bodyTiltVel = 0;
  private bodyTiltTarget = 0;
  private bodyDiveY = 0;
  private bodyBob = 0;

  private leftHand: HandState = {
    x: 148,
    y: 312,
    tx: 148,
    ty: 312,
    lastAt: -10000,
    squash: 0,
    heldVks: new Set(),
  };
  private rightHand: HandState = {
    x: 242,
    y: 312,
    tx: 242,
    ty: 312,
    lastAt: -10000,
    squash: 0,
    heldVks: new Set(),
  };

  // Floating CodeBuddy Hexagon Bit (3rd hand / tail-key tapper)
  private hexBit = {
    relX: 86,
    relY: -44,
    spin: 0,
    slapAt: -10000,
    releaseAt: -10000,
    slapTargetX: 340,
    slapTargetY: 355,
    heldVks: new Set<number>(),
    squash: 0,
    phase: 0,
  };

  private ripples: CyberRipple[] = [];
  private particles: CyberParticle[] = [];

  constructor() {
    const img = new Image();
    img.src = robotBaseUrl;
    this.baseSprite = img;
  }

  public onPrivacyModeChanged(active: boolean): void {
    if (active) {
      this.leftHand.heldVks.clear();
      this.rightHand.heldVks.clear();
      this.hexBit.heldVks.clear();
      this.ripples.length = 0;
    }
  }

  public onPrivacyTyping(): void {
    this.bodyBob = Math.min(0.6, this.bodyBob + 0.38);
  }

  public resetLeftHandForMouse(): void {
    this.leftHand.lastAt = -10000;
  }

  public onMouseAction(now: number = performance.now()): void {
    this.lastMouseClickAt = now;
  }

  public getHandBusyState(now: number): { leftHeld: number; rightHeld: number; rightBusy: boolean } {
    const leftHeld = this.leftHand.heldVks.size;
    const rightHeld = this.rightHand.heldVks.size;
    const rightBusy = rightHeld > 0 || now - this.rightHand.lastAt < 135;
    return { leftHeld, rightHeld, rightBusy };
  }

  public triggerTailPreview(pt: { x: number; y: number }, layout: DaFeiYuLayout): void {
    if (layout.privacyMode) return;
    const now = performance.now();
    this.lastKeyGazeAt = now;
    this.lastKeyPtX = pt.x;
    this.lastKeyPtY = pt.y;
    this.hexBit.slapAt = now;
    this.hexBit.releaseAt = now + 220;
    this.hexBit.slapTargetX = pt.x;
    this.hexBit.slapTargetY = pt.y;
    this.hexBit.squash = 1;
    this.bodyBob = Math.min(1.0, this.bodyBob + 0.5);
    const normX = Math.max(-1, Math.min(1, (pt.x - layout.kbCenterX) / (layout.kbWidth * 0.46)));
    this.bodyTiltTarget = normX * 0.06;
    this.bodyShiftTarget = normX * 7;
    this.ripples.push({ x: pt.x, y: pt.y, r: 5, life: 1 });
    this.ripples.push({ x: pt.x, y: pt.y, r: 2, life: 0.85 });
    this.spawnParticles(pt.x, pt.y - 6, 4, true);
  }

  public onKeyDown(
    vk: number,
    pt: { x: number; y: number },
    layout: DaFeiYuLayout,
    repeat: boolean,
    useTail: boolean,
  ): void {
    if (layout.privacyMode || repeat) return;
    const now = performance.now();
    this.lastKeyAt = now;
    this.lastKeyGazeAt = now;
    this.lastKeyPtX = pt.x;
    this.lastKeyPtY = pt.y;
    this.keyTimes.push(now);
    this.bodyBob = Math.min(1.05, this.bodyBob + 0.65);

    const charX = layout.is108 ? 268 : 192;
    const normX = Math.max(-1, Math.min(1, (pt.x - layout.kbCenterX) / (layout.kbWidth * 0.46)));
    const mouseBusy = layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900;
    const isLeftSide = pt.x < layout.kbCenterX - 2;

    if (useTail) {
      this.hexBit.slapAt = now;
      this.hexBit.releaseAt = -10000;
      this.hexBit.heldVks.add(vk);
      this.hexBit.slapTargetX = pt.x;
      this.hexBit.slapTargetY = pt.y;
      this.hexBit.squash = 1;
      if (!mouseBusy) {
        this.bodyTiltTarget = normX >= 0 ? -0.065 : 0.05;
        this.bodyShiftTarget = normX >= 0 ? -6 : 7;
      }
      this.ripples.push({ x: pt.x, y: pt.y, r: 5, life: 1 });
      this.ripples.push({ x: pt.x, y: pt.y, r: 2, life: 0.85 });
      this.spawnParticles(pt.x, pt.y - 6, 4, true);
    } else if (mouseBusy) {
      const shiftBase = layout.is108 ? -96 : -22;
      const curCharX = charX + shiftBase;
      const comfortX = Math.max(curCharX - 10, Math.min(curCharX + 92, pt.x));
      const comfortY = Math.min(layout.kbCenterY + 6, pt.y);
      this.rightHand.tx = comfortX;
      this.rightHand.ty = comfortY;
      this.rightHand.lastAt = now;
      this.rightHand.squash = 1;
      this.rightHand.heldVks.add(vk);
    } else {
      this.bodyTiltTarget = normX * 0.085;
      this.bodyShiftTarget = normX * (layout.is108 ? 20 : 12);
      const comfortX =
        charX +
        this.bodyShiftTarget +
        Math.max(-76, Math.min(76, (pt.x - charX) * 0.78));
      const comfortY = Math.min(layout.kbCenterY + 10, pt.y);
      if (isLeftSide) {
        this.leftHand.tx = comfortX;
        this.leftHand.ty = comfortY;
        this.leftHand.lastAt = now;
        this.leftHand.squash = 1;
        this.leftHand.heldVks.add(vk);
      } else {
        this.rightHand.tx = comfortX;
        this.rightHand.ty = comfortY;
        this.rightHand.lastAt = now;
        this.rightHand.squash = 1;
        this.rightHand.heldVks.add(vk);
      }
    }
  }

  public onKeyUp(vk: number): void {
    const now = performance.now();
    this.leftHand.heldVks.delete(vk);
    this.rightHand.heldVks.delete(vk);
    if (this.hexBit.heldVks.has(vk)) {
      this.hexBit.heldVks.delete(vk);
      if (this.hexBit.heldVks.size === 0) {
        this.hexBit.releaseAt = now;
      }
    }
  }

  private spawnParticles(x: number, y: number, count: number, cyberBurst: boolean): void {
    const colors = ['#5eefff', '#a78bfa', '#7f60d4', '#38bdf8'];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * (cyberBurst ? 26 : 52),
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * (cyberBurst ? 2.0 : 0.7),
        vy: -1.0 - Math.random() * 1.1,
        life: 1,
        size: cyberBurst ? 3.2 + Math.random() * 2.2 : 4.0 + Math.random() * 2.4,
        kind: Math.random() > 0.45 ? 'hex' : 'spark',
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  public update(dt: number, now: number, layout: DaFeiYuLayout): void {
    this.bodyBob *= Math.exp(-12 * dt);

    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const isTyping =
      !layout.privacyMode &&
      (now - this.lastKeyAt < 550 ||
        this.hexBit.heldVks.size > 0 ||
        this.leftHand.heldVks.size > 0 ||
        this.rightHand.heldVks.size > 0);
    const mouseMode =
      !layout.privacyMode &&
      !isHappy &&
      (layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900);

    // 1) Typing speed heat & hysteresis-locked mood tier
    while (this.keyTimes.length && now - this.keyTimes[0] > 2800) {
      this.keyTimes.shift();
    }
    const typingCPS = this.keyTimes.length / 2.8;
    const heatTarget = layout.privacyMode
      ? 0
      : Math.min(1, Math.max(0, (typingCPS - 2.4) / 5.4));
    if (heatTarget > this.typingHeat) {
      this.typingHeat += (heatTarget - this.typingHeat) * (1 - Math.exp(-2.2 * dt));
    } else {
      this.typingHeat += (heatTarget - this.typingHeat) * (1 - Math.exp(-0.65 * dt));
    }

    const dwell = now - this.moodChangedAt;
    if (this.moodTier === 0) {
      if (this.typingHeat >= 0.4 && dwell >= 1400) {
        this.moodTier = 1;
        this.moodChangedAt = now;
      }
    } else if (this.moodTier === 1) {
      if (this.typingHeat >= 0.78 && dwell >= 1800) {
        this.moodTier = 2;
        this.moodChangedAt = now;
      } else if (this.typingHeat < 0.22 && dwell >= 2200) {
        this.moodTier = 0;
        this.moodChangedAt = now;
      }
    } else if (this.moodTier === 2) {
      if (this.typingHeat < 0.55 && dwell >= 2200) {
        this.moodTier = 1;
        this.moodChangedAt = now;
      }
    }

    const targetBlush = Math.max(
      this.typingHeat * 0.85,
      isHappy ? 0.55 : 0,
      layout.privacyMode ? 0.35 : 0,
      this.moodTier === 1 ? 0.5 : this.moodTier === 2 ? 0.85 : 0,
    );
    this.blushLevel += (targetBlush - this.blushLevel) * (1 - Math.exp(-3.2 * dt));

    // Natural calm blinking every 4.2 - 6.8s
    if (now >= this.nextBlinkAt) {
      this.blinkUntil = now + 140;
      this.nextBlinkAt = now + 4200 + Math.random() * 2600;
    }

    const charX = layout.is108 ? 268 : 192;
    if (isHappy && Math.random() < 0.065) {
      this.spawnParticles(charX + this.bodyShiftX, 118, 1, false);
    } else if (!layout.privacyMode && this.moodTier === 2 && Math.random() < 0.03) {
      this.spawnParticles(charX + this.bodyShiftX, 124, 1, false);
    }

    // 2) Body spring physics
    if (layout.privacyMode) {
      this.bodyShiftTarget = 0;
      const shySway =
        Math.sin(now * 0.0042) * 0.028 +
        (now - layout.privacyTypingAt < 240 ? Math.sin(now * 0.04) * 0.02 : 0);
      this.bodyTiltTarget = shySway;
      this.bodyDiveY *= Math.exp(-9 * dt);
    } else if (mouseMode) {
      // Lean comfortably toward the mouse without crowding directly over it,
      // so the left arm has a clear, natural reach from shoulder to mouse buttons!
      const baseShift = layout.is108 ? -96 : -22;
      this.bodyShiftTarget = baseShift + (layout.mouseNX - 0.5) * 10;
      this.bodyTiltTarget = -0.075;
      this.bodyDiveY += (3 - this.bodyDiveY) * (1 - Math.exp(-10 * dt));
    } else if (!isTyping) {
      this.bodyShiftTarget = 0;
      this.bodyTiltTarget = 0;
      this.bodyDiveY *= Math.exp(-9 * dt);
    } else {
      this.bodyDiveY *= Math.exp(-9 * dt);
    }

    const shiftAcc = (this.bodyShiftTarget - this.bodyShiftX) * 160 - this.bodyShiftVel * 18;
    this.bodyShiftVel += shiftAcc * dt;
    this.bodyShiftX += this.bodyShiftVel * dt;

    const tiltAcc = (this.bodyTiltTarget - this.bodyTilt) * 180 - this.bodyTiltVel * 17;
    this.bodyTiltVel += tiltAcc * dt;
    this.bodyTilt += this.bodyTiltVel * dt;

    // 3) Live2D LED eye gaze tracking inside black visor (in native 448x556 sprite coords)
    const lastClickTs = Math.max(this.lastMouseClickAt, layout.mouseClickAt || -10000);
    const activeMouseClick =
      !layout.privacyMode &&
      !isHappy &&
      (layout.mouseLeft || layout.mouseRight || now - lastClickTs < 950);
    const activeKeyGaze =
      !layout.privacyMode &&
      !isHappy &&
      (now - this.lastKeyGazeAt < 950 ||
        this.leftHand.heldVks.size > 0 ||
        this.rightHand.heldVks.size > 0 ||
        this.hexBit.heldVks.size > 0);

    let gazeTx = 0;
    let gazeTy = 0;
    let hasActiveLookTarget = false;
    let targetWX = 0;
    let targetWY = 0;

    if (activeMouseClick && (!activeKeyGaze || lastClickTs >= this.lastKeyGazeAt)) {
      hasActiveLookTarget = true;
      targetWX = layout.mouseBtnX;
      targetWY = layout.mouseBtnY;
    } else if (activeKeyGaze) {
      hasActiveLookTarget = true;
      targetWX = this.lastKeyPtX;
      targetWY = this.lastKeyPtY;
    } else if (mouseMode) {
      hasActiveLookTarget = true;
      targetWX = layout.mouseBtnX;
      targetWY = layout.mouseBtnY;
    }

    if (hasActiveLookTarget) {
      const g = this.computeGeom(now, layout);
      const eyeWorld = g.spritePointToWorld(0.499, 0.40);
      const wdx = targetWX - eyeWorld.x;
      const wdy = targetWY - eyeWorld.y;
      const c = Math.cos(-this.bodyTilt);
      const s = Math.sin(-this.bodyTilt);
      const localDx = wdx * c - wdy * s;
      const localDy = wdx * s + wdy * c;
      gazeTx = Math.max(-20, Math.min(20, localDx * 0.14));
      gazeTy = Math.max(-6, Math.min(18, localDy * 0.10));
    }

    const gazeRate = hasActiveLookTarget ? 22 : 8.5;
    const gazeLerp = 1 - Math.exp(-gazeRate * dt);
    this.eyeGazeX += (gazeTx - this.eyeGazeX) * gazeLerp;
    this.eyeGazeY += (gazeTy - this.eyeGazeY) * gazeLerp;

    // 4) Orbiting Hexagon Bit physics (anchored relative to right torso side)
    const gHex = this.computeGeom(now, layout);
    const hexAnchor = gHex.spritePointToWorld(0.75, 0.72);
    const orbitSpeed = isHappy ? 0.006 : isTyping ? 0.0045 : 0.0026;
    const maxIdleOffX = Math.max(46, Math.min(72, layout.logicalW - 24 - hexAnchor.x));
    const idleOffX = maxIdleOffX + Math.sin(now * orbitSpeed) * 5;
    const idleOffY = -42 + Math.cos(now * orbitSpeed * 1.25) * 6;

    const slapAge = Math.max(0, now - this.hexBit.slapAt);
    const holdingSlap =
      !layout.privacyMode &&
      (this.hexBit.heldVks.size > 0 || (this.hexBit.slapAt > 0 && slapAge < 250));
    let targetPhase = 0;
    if (holdingSlap) {
      targetPhase = Math.min(1, slapAge / 60);
    } else if (!layout.privacyMode && this.hexBit.slapAt > 0) {
      const holdEnd = Math.max(this.hexBit.slapAt + 250, this.hexBit.releaseAt);
      const retElapsed = Math.max(0, now - holdEnd);
      targetPhase = Math.max(0, 1 - retElapsed / 210);
    }
    this.hexBit.phase += (targetPhase - this.hexBit.phase) * (1 - Math.exp(-34 * dt));
    if (this.hexBit.phase < 0.002 && targetPhase === 0) this.hexBit.phase = 0;

    const slapOffX = this.hexBit.slapTargetX - hexAnchor.x;
    const slapOffY = this.hexBit.slapTargetY - hexAnchor.y;
    const targetRelX = idleOffX + (slapOffX - idleOffX) * this.hexBit.phase;
    const targetRelY = idleOffY + (slapOffY - idleOffY) * this.hexBit.phase;
    const tLerp = 1 - Math.exp(-36 * dt);
    this.hexBit.relX += (targetRelX - this.hexBit.relX) * tLerp;
    this.hexBit.relY += (targetRelY - this.hexBit.relY) * tLerp;
    this.hexBit.squash *= Math.exp(-11 * dt);
    this.hexBit.spin += dt * (1.2 + this.hexBit.phase * 5.0 + this.typingHeat * 2.4);

    // 5) Ripples & particles
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.r += 56 * dt;
      rp.life -= 2.3 * dt;
      if (rp.life <= 0) this.ripples.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.024 * (dt * 60);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private computeGeom(now: number, layout: DaFeiYuLayout) {
    const charX = layout.is108 ? 268 : 192;
    const baseCharY = layout.is108 ? 364 : 368;
    const breath = Math.sin(now * 0.0032) * 2.4 + this.bodyBob * 3.6 + this.bodyDiveY;
    const charCenterX = charX + this.bodyShiftX;
    const charBaseY = baseCharY + breath;
    const drawW = layout.is108 ? 254 : 248;
    const drawH = drawW * (278 / 224);
    const pivotOff = 48;
    const pivotY = charBaseY - pivotOff;

    const spritePointToWorld = (normX: number, normY: number) => {
      const lx = (normX - 0.5) * drawW;
      const ly = normY * drawH - drawH + pivotOff;
      const c = Math.cos(this.bodyTilt);
      const s = Math.sin(this.bodyTilt);
      return {
        x: charCenterX + lx * c - ly * s,
        y: pivotY + lx * s + ly * c,
      };
    };

    return {
      charCenterX,
      charBaseY,
      drawW,
      drawH,
      pivotOff,
      pivotY,
      spritePointToWorld,
    };
  }

  /**
   * Draws glowing CodeBuddy LED facial expressions inside the curved glossy black visor
   * in native 448x556 sprite coordinates.
   */
  private renderVisorFace(
    ctx: CanvasRenderingContext2D,
    expr: 'idle' | 'blink' | 'focus' | 'happy' | 'privacy',
    now: number,
  ): void {
    // Inner visor glass region measured on robot_base.png (448x556):
    // cx = 223.5, cy = 221.5, w = 247, h = 193
    const vx = 223.5;
    const vy = 221.5;
    const rx = 114;
    const ry = 85;

    ctx.save();
    // Clip tightly to the inner glossy visor curve
    ctx.beginPath();
    ctx.roundRect(vx - rx, vy - ry, rx * 2, ry * 2, 74);
    ctx.clip();

    // Subtle internal cyan-violet ambient screen glow
    const gx = vx + this.eyeGazeX * 0.8;
    const gy = vy + this.eyeGazeY * 0.8;
    const screenGlow = ctx.createRadialGradient(gx, gy, 12, gx, gy, 128);
    if (expr === 'privacy') {
      screenGlow.addColorStop(0, 'rgba(155, 110, 255, 0.22)');
      screenGlow.addColorStop(1, 'rgba(127, 96, 212, 0)');
    } else if (expr === 'happy') {
      screenGlow.addColorStop(0, 'rgba(94, 235, 255, 0.26)');
      screenGlow.addColorStop(0.55, 'rgba(139, 107, 255, 0.14)');
      screenGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    } else {
      screenGlow.addColorStop(0, 'rgba(56, 220, 255, 0.20)');
      screenGlow.addColorStop(0.6, 'rgba(127, 96, 212, 0.08)');
      screenGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = screenGlow;
    ctx.fillRect(vx - rx - 10, vy - ry - 10, rx * 2 + 20, ry * 2 + 20);

    const eyeCenterY = vy + 2 + this.eyeGazeY;
    const leftEyeX = vx - 50 + this.eyeGazeX;
    const rightEyeX = vx + 50 + this.eyeGazeX;
    const pulse = 0.94 + Math.sin(now * 0.005) * 0.06;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawGlowingBar = (x: number, y: number, w: number, h: number, color: string, glow: string) => {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20 * pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x - w * 0.5, y - h * 0.5, w, h, Math.min(w, h) * 0.5);
      ctx.fill();
      // Bright inner LED core
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e8fdff';
      ctx.beginPath();
      ctx.roundRect(x - w * 0.28, y - h * 0.38, w * 0.56, h * 0.76, Math.min(w, h) * 0.28);
      ctx.fill();
      ctx.restore();
    };

    const drawGlowingChevron = (
      x: number,
      y: number,
      dir: 'left' | 'right',
      color: string,
      glow: string,
    ) => {
      const sgn = dir === 'left' ? 1 : -1; // 'left' points left like `<`
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20 * pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(x + sgn * 16, y - 21);
      ctx.lineTo(x - sgn * 16, y);
      ctx.lineTo(x + sgn * 16, y + 21);
      ctx.stroke();

      // Inner bright neon core
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e8fdff';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(x + sgn * 15, y - 20);
      ctx.lineTo(x - sgn * 15, y);
      ctx.lineTo(x + sgn * 15, y + 20);
      ctx.stroke();
      ctx.restore();
    };

    const drawGlowingArc = (x: number, y: number, color: string, glow: string) => {
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20 * pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(x, y + 12, 23, Math.PI * 1.16, Math.PI * 1.84);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#eefeff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y + 12, 23, Math.PI * 1.18, Math.PI * 1.82);
      ctx.stroke();
      ctx.restore();
    };

    if (expr === 'privacy') {
      // Closed soft violet-cyan eyes
      drawGlowingBar(leftEyeX, eyeCenterY + 2, 34, 10, '#a78bfa', '#7f60d4');
      drawGlowingBar(rightEyeX, eyeCenterY + 2, 34, 10, '#a78bfa', '#7f60d4');
    } else if (expr === 'blink') {
      drawGlowingBar(leftEyeX, eyeCenterY + 2, 34, 10, '#5ceeff', '#22d3ee');
      drawGlowingBar(rightEyeX, eyeCenterY + 2, 34, 10, '#5ceeff', '#22d3ee');
    } else if (expr === 'happy') {
      drawGlowingArc(leftEyeX, eyeCenterY, '#67f3ff', '#38bdf8');
      drawGlowingArc(rightEyeX, eyeCenterY, '#a78bfa', '#7f60d4');
    } else if (expr === 'focus') {
      // Coding flow: energetic `> <` glowing eyes!
      drawGlowingChevron(leftEyeX, eyeCenterY, 'right', '#5ceeff', '#22d3ee');
      drawGlowingChevron(rightEyeX, eyeCenterY, 'left', '#5ceeff', '#22d3ee');
    } else {
      // Signature CodeBuddy idle eyes: glowing cyan `|` (left) and `<` wink (right)!
      drawGlowingBar(leftEyeX, eyeCenterY, 21, 52, '#5ceeff', '#22d3ee');
      drawGlowingChevron(rightEyeX, eyeCenterY, 'left', '#5ceeff', '#22d3ee');
    }

    // Subtle cyber digital blush lines on cheeks when typing fast or petted
    if (this.blushLevel > 0.14) {
      const blushAlpha = Math.min(0.68, this.blushLevel * 0.65);
      ctx.save();
      ctx.strokeStyle = `rgba(180, 148, 255, ${blushAlpha.toFixed(3)})`;
      ctx.lineWidth = 4.2;
      ctx.shadowColor = 'rgba(139, 107, 255, 0.7)';
      ctx.shadowBlur = 10;
      for (const side of [-1, 1]) {
        const bx = vx + side * 72 + this.eyeGazeX * 0.6;
        const by = vy + 40 + this.eyeGazeY * 0.5;
        ctx.beginPath();
        for (const ox of [-9, 0, 9]) {
          ctx.moveTo(bx + ox - 3, by + 6);
          ctx.lineTo(bx + ox + 3, by - 6);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Very subtle curved glass reflection along top of visor so LEDs sit behind glass
    const sheenGrad = ctx.createLinearGradient(vx, vy - ry, vx, vy - ry + 54);
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.ellipse(vx, vy - ry + 16, rx * 0.82, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** Layer 1 (drawn BEFORE keyboard & mouse): orbiting hex drone (back) + CodeBuddy robot sprite + LED visor. */
  public renderBody(ctx: CanvasRenderingContext2D, now: number, layout: DaFeiYuLayout): void {
    const g = this.computeGeom(now, layout);
    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const isBlinking = now < this.blinkUntil;

    // Draw orbiting CodeBuddy Hexagon Bit behind body when idle
    if (this.hexBit.phase <= 0.14) {
      const hexAnchor = g.spritePointToWorld(0.75, 0.72);
      const tipX = hexAnchor.x + this.hexBit.relX;
      const tipY = hexAnchor.y + this.hexBit.relY;
      this.drawHexagonBit(ctx, hexAnchor.x, hexAnchor.y, tipX, tipY, this.hexBit.phase, now, 'back');
    }

    let expr: 'idle' | 'blink' | 'focus' | 'happy' | 'privacy' = 'idle';
    if (layout.privacyMode) expr = 'privacy';
    else if (isHappy || this.moodTier === 2) expr = 'happy';
    else if (this.moodTier === 1) expr = 'focus';
    else if (isBlinking) expr = 'blink';

    if (this.baseSprite.complete && this.baseSprite.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, layout.logicalW, layout.kbCenterY - layout.kbHeight * 0.36);
      ctx.clip();
      ctx.translate(g.charCenterX, g.pivotY);
      ctx.rotate(this.bodyTilt);
      ctx.scale(1 + this.bodyBob * 0.02, 1 - this.bodyBob * 0.016);

      ctx.drawImage(this.baseSprite, -g.drawW * 0.5, -g.drawH + g.pivotOff, g.drawW, g.drawH);

      // Draw crisp glowing LED eyes in native 448x556 sprite coordinates
      ctx.save();
      ctx.translate(-g.drawW * 0.5, -g.drawH + g.pivotOff);
      ctx.scale(g.drawW / 448, g.drawH / 556);
      this.renderVisorFace(ctx, expr, now);
      ctx.restore();

      ctx.restore();
    }
  }

  /** Layer 2 (drawn AFTER keyboard & mouse): cyber ripples, active hex drone, articulated robot arms & particles. */
  public renderForeground(
    ctx: CanvasRenderingContext2D,
    dt: number,
    now: number,
    layout: DaFeiYuLayout,
  ): void {
    const g = this.computeGeom(now, layout);
    // Anchor strictly inside the white shoulder domes of robot_base.png (448x556)
    // so the continuous curved 3D arm NEVER separates from the body at any reach angle!
    const shL = g.spritePointToWorld(0.226, 0.758);
    const shR = g.spritePointToWorld(0.772, 0.758);
    const hexAnchor = g.spritePointToWorld(0.75, 0.72);

    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const mouseMode =
      !layout.privacyMode &&
      !isHappy &&
      (layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900);

    // 1) Neon violet-cyan cyber ripples on key impact
    for (const rp of this.ripples) {
      ctx.save();
      ctx.globalAlpha = rp.life * 0.85;
      ctx.strokeStyle = rp.r > 12 ? '#a78bfa' : '#5ceeff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2) Active Hexagon Bit darting over keyboard to tap 3rd-hand keys
    if (this.hexBit.phase > 0.14) {
      const tipX = hexAnchor.x + this.hexBit.relX;
      const tipY = hexAnchor.y + this.hexBit.relY;
      this.drawHexagonBit(ctx, hexAnchor.x, hexAnchor.y, tipX, tipY, this.hexBit.phase, now, 'front');
    }

    // 3) Articulated robotic arms & mittens
    const leftTyping =
      !layout.privacyMode &&
      !mouseMode &&
      (now - this.leftHand.lastAt < 380 || this.leftHand.heldVks.size > 0);
    const rightTyping =
      !layout.privacyMode &&
      (now - this.rightHand.lastAt < 380 || this.rightHand.heldVks.size > 0);

    let lTargetX: number;
    let lTargetY: number;
    let rTargetX: number;
    let rTargetY: number;

    if (layout.privacyMode) {
      // Raise both 3D robot hands gracefully to cover the black visor!
      const eyeL = g.spritePointToWorld(0.365, 0.425);
      const eyeR = g.spritePointToWorld(0.635, 0.425);
      const shyBob = Math.sin(now * 0.008) * 1.4;
      lTargetX = eyeL.x;
      lTargetY = eyeL.y + shyBob;
      rTargetX = eyeR.x;
      rTargetY = eyeR.y - shyBob;
    } else if (isHappy) {
      const cheer = Math.sin(now * 0.016) * 5.2;
      lTargetX = shL.x - 16;
      lTargetY = shL.y - 12 + cheer;
      rTargetX = shR.x + 16;
      rTargetY = shR.y - 12 - cheer;
    } else {
      const idleFloat = Math.sin(now * 0.0032 + 0.6) * 1.6;
      if (mouseMode) {
        const pressOff = layout.mouseLeft || layout.mouseRight ? 2.6 : 0;
        lTargetX = layout.mouseBtnX;
        lTargetY = layout.mouseBtnY + pressOff;
      } else if (leftTyping) {
        lTargetX = this.leftHand.tx;
        lTargetY = this.leftHand.ty;
      } else {
        // Natural relaxed home-row resting hover slightly angled inward
        lTargetX = shL.x + 12;
        lTargetY = shL.y + 24 + idleFloat;
      }
      if (rightTyping) {
        rTargetX = this.rightHand.tx;
        rTargetY = this.rightHand.ty;
      } else {
        rTargetX = shR.x - 12;
        rTargetY = shR.y + 24 + idleFloat;
      }
    }

    const hLerp = 1 - Math.exp(-24 * dt);
    this.leftHand.x += (lTargetX - this.leftHand.x) * hLerp;
    this.leftHand.y += (lTargetY - this.leftHand.y) * hLerp;
    this.rightHand.x += (rTargetX - this.rightHand.x) * hLerp;
    this.rightHand.y += (rTargetY - this.rightHand.y) * hLerp;
    this.leftHand.squash *= Math.exp(-13 * dt);
    this.rightHand.squash *= Math.exp(-13 * dt);

    const maxMouseReach = layout.is108 ? 104 : 96;
    const maxDefaultReach = layout.privacyMode ? 124 : 88;
    this.drawRobotArm(
      ctx,
      shL.x,
      shL.y,
      this.leftHand.x,
      this.leftHand.y,
      'left',
      this.leftHand.squash,
      mouseMode ? maxMouseReach : maxDefaultReach,
      layout.privacyMode,
    );
    this.drawRobotArm(
      ctx,
      shR.x,
      shR.y,
      this.rightHand.x,
      this.rightHand.y,
      'right',
      this.rightHand.squash,
      mouseMode ? 92 : maxDefaultReach,
      layout.privacyMode,
    );

    // 4) Crisp glowing cyber spark & hexagon particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      if (p.kind === 'hex') {
        ctx.lineWidth = 1.4;
        this.traceHexagon(ctx, p.size);
        ctx.stroke();
      } else {
        // 4-point star spark
        const r = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.quadraticCurveTo(0, 0, 0, r);
        ctx.quadraticCurveTo(0, 0, -r, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private traceHexagon(ctx: CanvasRenderingContext2D, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const hx = Math.cos(a) * radius;
      const hy = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  }

  /**
   * Draws the floating glowing CodeBuddy Hexagon Bit + subtle neon energy tether.
   */
  private drawHexagonBit(
    ctx: CanvasRenderingContext2D,
    rootX: number,
    rootY: number,
    tipX: number,
    tipY: number,
    slapPhase: number,
    now: number,
    layer: 'back' | 'front',
  ): void {
    ctx.save();

    // Subtle glowing purple-cyan energy tether arc from torso core to floating hexagon bit
    const ctrlX = (rootX + tipX) * 0.5 + 18;
    const ctrlY = Math.min(rootY, tipY) - 24;
    const tetherGrad = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
    tetherGrad.addColorStop(0, 'rgba(127, 96, 212, 0.08)');
    tetherGrad.addColorStop(0.55, `rgba(155, 125, 255, ${(0.28 + slapPhase * 0.42).toFixed(3)})`);
    tetherGrad.addColorStop(1, `rgba(92, 238, 255, ${(0.45 + slapPhase * 0.45).toFixed(3)})`);

    ctx.strokeStyle = tetherGrad;
    ctx.lineWidth = 2.0 + slapPhase * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    ctx.stroke();

    if (layer === 'front' && slapPhase > 0.25) {
      ctx.save();
      ctx.fillStyle = 'rgba(127, 96, 212, 0.24)';
      ctx.beginPath();
      ctx.ellipse(tipX, tipY + 5, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Floating 3D-styled metallic hexagon drone with glowing purple-cyan core
    ctx.translate(tipX, tipY);
    const pulse = 1 + Math.sin(now * 0.008) * 0.05;
    const sq = this.hexBit.squash;
    const sc = (1 + slapPhase * 0.12) * pulse;
    ctx.scale(sc * (1 + sq * 0.16), sc * (1 - sq * 0.12));
    ctx.rotate(Math.sin(this.hexBit.spin) * 0.25);

    // Outer metallic dark-slate hexagon shell
    ctx.shadowColor = 'rgba(139, 107, 255, 0.72)';
    ctx.shadowBlur = 12;
    const bodyGrad = ctx.createLinearGradient(-12, -12, 12, 12);
    bodyGrad.addColorStop(0, '#eef0f8');
    bodyGrad.addColorStop(0.45, '#52566e');
    bodyGrad.addColorStop(1, '#252736');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#1a1c28';
    ctx.lineWidth = 1.8;
    this.traceHexagon(ctx, 13.5);
    ctx.fill();
    ctx.stroke();

    // Inner dark recessed core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#131522';
    this.traceHexagon(ctx, 9.2);
    ctx.fill();

    // Neon purple-cyan glowing inner hex ring
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = slapPhase > 0.35 ? '#5ceeff' : '#b79df1';
    ctx.lineWidth = 2.0;
    this.traceHexagon(ctx, 6.4);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draws a continuous, seamlessly shoulder-anchored 3D vinyl-toy robot arm & cute rounded hand
   * from `(sx, sy)` inside the white shoulder dome all the way to the hand `(px, py)`.
   * Sampling a single continuous Bézier curve guarantees the arm NEVER detaches from the body
   * whether resting, reaching across the keyboard, clicking the mouse, or covering the visor.
   */
  private drawRobotArm(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    targetX: number,
    targetY: number,
    side: 'left' | 'right',
    squash: number,
    maxLen: number,
    raisedPose = false,
  ): void {
    const dx = targetX - sx;
    const dy = targetY - sy;
    const rawLen = Math.max(1, Math.hypot(dx, dy));
    const len = Math.min(rawLen, maxLen);
    const ux = dx / rawLen;
    const uy = dy / rawLen;
    const sgn = side === 'left' ? -1 : 1;

    // Subtle lift arc during key tap impact for tactile bounce
    const tapLiftY = -squash * 2.2;
    const handX = sx + ux * len;
    const handY = sy + uy * len + tapLiftY;

    const adx = handX - sx;
    const ady = handY - sy;
    const alen = Math.max(1, Math.hypot(adx, ady));
    const aux = adx / alen;
    const auy = ady / alen;

    // Wrist anchor smoothly positioned right behind the rounded 3D hand
    const wristBack = Math.min(alen * 0.36, 9.0);
    const wx = handX - aux * wristBack;
    const wy = handY - auy * wristBack;

    // Natural gentle outward elbow bow along the continuous shoulder->wrist curve
    const bowOut = Math.min(12, Math.max(3.5, alen * 0.17));
    // Always bow away from torso center (outward X) + slightly downward for organic elbow curve
    const ctrlX = (sx + wx) * 0.5 + sgn * bowOut;
    const ctrlY = (sy + wy) * 0.5 + (raisedPose ? 7.0 : Math.min(8, alen * 0.10));

    // Sample smooth spine points along quadratic Bézier from shoulder (t=0) to wrist (t=1)
    const steps = 12;
    const rSh = 9.4;
    const rWrist = 7.8;
    const pts: Array<{ x: number; y: number; nx: number; ny: number; tx: number; ty: number; r: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const omt = 1 - t;
      const x = omt * omt * sx + 2 * omt * t * ctrlX + t * t * wx;
      const y = omt * omt * sy + 2 * omt * t * ctrlY + t * t * wy;
      const txRaw = 2 * omt * (ctrlX - sx) + 2 * t * (wx - ctrlX);
      const tyRaw = 2 * omt * (ctrlY - sy) + 2 * t * (wy - ctrlY);
      const tLen = Math.max(0.001, Math.hypot(txRaw, tyRaw));
      const tx = txRaw / tLen;
      const ty = tyRaw / tLen;
      const nx = -ty;
      const ny = tx;
      // Smoothly taper from shoulder dome width to wrist width
      const r = rSh + (rWrist - rSh) * t;
      pts.push({ x, y, nx, ny, tx, ty, r });
    }

    const endPt = pts[pts.length - 1];
    const wristAng = Math.atan2(endPt.ty, endPt.tx);
    const midPt = pts[Math.floor(steps * 0.5)];

    ctx.save();

    // 1) Continuous 3D pearl-lilac arm tube anchored strictly inside the white shoulder dome
    ctx.save();
    ctx.shadowColor = 'rgba(18, 16, 30, 0.30)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = sgn * 1.0;
    ctx.shadowOffsetY = 3.2;

    // Cross-arm studio lighting gradient matching robot_base.png (#f6f2f7 -> #dcd6de -> #9c95a3)
    const gx = midPt.nx * 0.9;
    const gy = midPt.ny * 0.9;
    const armGrad = ctx.createLinearGradient(
      midPt.x - gx * 10,
      midPt.y - gy * 10,
      midPt.x + gx * 10,
      midPt.y + gy * 10,
    );
    if (side === 'left') {
      armGrad.addColorStop(0.0, '#a39ba6');
      armGrad.addColorStop(0.28, '#dcd6de');
      armGrad.addColorStop(0.62, '#f6f2f7');
      armGrad.addColorStop(0.86, '#dfd9e1');
      armGrad.addColorStop(1.0, '#9c95a3');
    } else {
      armGrad.addColorStop(0.0, '#9c95a3');
      armGrad.addColorStop(0.22, '#dfd9e1');
      armGrad.addColorStop(0.45, '#f6f2f7');
      armGrad.addColorStop(0.75, '#d6cfd8');
      armGrad.addColorStop(1.0, '#9e96a4');
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x + pts[0].nx * pts[0].r, pts[0].y + pts[0].ny * pts[0].r);
    for (let i = 1; i <= steps; i++) {
      ctx.lineTo(pts[i].x + pts[i].nx * pts[i].r, pts[i].y + pts[i].ny * pts[i].r);
    }
    ctx.arc(endPt.x, endPt.y, endPt.r, wristAng + Math.PI / 2, wristAng - Math.PI / 2, true);
    for (let i = steps; i >= 0; i--) {
      ctx.lineTo(pts[i].x - pts[i].nx * pts[i].r, pts[i].y - pts[i].ny * pts[i].r);
    }
    // Rounded blend cap buried cleanly inside the white shoulder dome
    ctx.arc(pts[0].x, pts[0].y, pts[0].r, Math.atan2(pts[0].ty, pts[0].tx) - Math.PI / 2, Math.atan2(pts[0].ty, pts[0].tx) + Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = armGrad;
    ctx.fill();
    ctx.restore();

    // Soft translucent contour along the two sides only (starting past t=0.18 so shoulder dome stays seamless!)
    ctx.strokeStyle = 'rgba(58, 55, 74, 0.25)';
    ctx.lineWidth = 1.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 2; i <= steps; i++) {
      const lx = pts[i].x + pts[i].nx * pts[i].r;
      const ly = pts[i].y + pts[i].ny * pts[i].r;
      if (i === 2) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    for (let i = 2; i <= steps; i++) {
      const rx = pts[i].x - pts[i].nx * pts[i].r;
      const ry = pts[i].y - pts[i].ny * pts[i].r;
      if (i === 2) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.stroke();

    // Soft glossy specular highlight streak along the continuous arm
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i <= steps - 1; i++) {
      const hx = pts[i].x - sgn * 2.0;
      const hy = pts[i].y - 1.4;
      if (i === 1) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();

    // 2) Flush subtle 3D dark-slate elbow joint band when arm is extended (len > 36px)
    if (alen > 36) {
      const ep = pts[Math.floor(steps * 0.44)];
      const eAng = Math.atan2(ep.ty, ep.tx);
      ctx.save();
      ctx.translate(ep.x, ep.y);
      ctx.rotate(eAng + Math.PI / 2);
      const elbowBandGrad = ctx.createLinearGradient(-ep.r, 0, ep.r, 0);
      elbowBandGrad.addColorStop(0, '#2e2e3d');
      elbowBandGrad.addColorStop(0.45, '#5d5b70');
      elbowBandGrad.addColorStop(1, '#2f2f3e');
      ctx.fillStyle = elbowBandGrad;
      ctx.beginPath();
      ctx.roundRect(-ep.r * 0.96, -2.1, ep.r * 1.92, 4.2, 2.1);
      ctx.fill();
      ctx.restore();
    }

    // 3) Subtle 3D dark-slate wrist joint ring right behind the hand
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(wristAng + Math.PI / 2);
    const cuffGrad = ctx.createLinearGradient(-8.0, 0, 8.0, 0);
    cuffGrad.addColorStop(0, '#2a2a38');
    cuffGrad.addColorStop(0.45, '#5b596e');
    cuffGrad.addColorStop(1, '#2d2d3b');
    ctx.fillStyle = cuffGrad;
    ctx.beginPath();
    ctx.roundRect(-7.8, -2.1, 15.6, 4.2, 2.1);
    ctx.fill();

    // Delicate soft lilac-purple micro highlight on the cuff
    ctx.fillStyle = 'rgba(182, 152, 255, 0.52)';
    ctx.beginPath();
    ctx.roundRect(-3.4, -0.65, 6.8, 1.3, 0.65);
    ctx.fill();
    ctx.restore();

    // 4) Cute plump 3D pearl-white robotic hand / mitten with soft inner thumb curve
    ctx.save();
    ctx.translate(handX, handY);
    const handRot = Math.atan2(endPt.ty, endPt.tx) - Math.PI / 2;
    ctx.rotate(handRot * 0.42);
    const sxScale = 1 + squash * 0.14;
    const syScale = 1 - squash * 0.12;
    ctx.scale(sxScale, syScale);

    ctx.save();
    ctx.shadowColor = 'rgba(20, 18, 34, 0.34)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2.4;

    const handRx = 10.4;
    const handRy = 9.8;
    const handGrad = ctx.createRadialGradient(-3.2, -3.6, 1.4, 0.5, 0.8, 12.0);
    handGrad.addColorStop(0.0, '#ffffff');
    handGrad.addColorStop(0.48, '#ede7ef');
    handGrad.addColorStop(0.82, '#ccc5d1');
    handGrad.addColorStop(1.0, '#9c94a3');

    ctx.fillStyle = handGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, handRx, handRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cute soft rounded inner thumb bump facing inward toward keyboard center
    const thumbX = -sgn * 8.0;
    const thumbY = -1.6;
    const thumbGrad = ctx.createRadialGradient(thumbX - 1.2, thumbY - 1.5, 0.6, thumbX, thumbY, 5.0);
    thumbGrad.addColorStop(0.0, '#fbf8fc');
    thumbGrad.addColorStop(0.6, '#dcd6df');
    thumbGrad.addColorStop(1.0, '#a39ba9');
    ctx.fillStyle = thumbGrad;
    ctx.beginPath();
    ctx.ellipse(thumbX, thumbY, 4.3, 3.7, sgn * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Ultra-soft translucent edge definition so white hand never blends flatly into white keycaps
    ctx.strokeStyle = 'rgba(58, 55, 74, 0.28)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(0, 0, handRx, handRy, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Soft vinyl specular highlight on upper-left of the hand
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.beginPath();
    ctx.ellipse(-3.2, -3.4, 3.8, 2.2, -0.45, 0, Math.PI * 2);
    ctx.fill();

    // Subtle dark-slate curved knuckle seam
    ctx.strokeStyle = 'rgba(72, 70, 88, 0.22)';
    ctx.lineWidth = 1.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 1.5, 6.2, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    // Subtle soft purple bounce glow on bottom rim when actively tapping a key
    if (squash > 0.08) {
      ctx.strokeStyle = `rgba(155, 125, 255, ${(squash * 0.55).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0.5, handRx - 0.8, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }

    ctx.restore();
    ctx.restore();
  }
}
