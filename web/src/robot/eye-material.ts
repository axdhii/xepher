import * as THREE from "three";

// The robot's face: an LED-matrix screen. Every shape (eyes and the six
// service icons) is a signed-distance function sampled at each LED's centre,
// so everything reads as glowing pixels. Output is HDR so Bloom picks it up.

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uAspect;
uniform float uOpen;    // 0 closed .. 1 open (blinks and mode switches)
uniform float uPower;   // 0 off .. 1 on (boot)
uniform int   uMode;    // 0 eyes, 1-6 services, 7 happy, 8 asleep, 9 surprised, 10 angry, 11 wink, 12 love, 13 text, 14 flying, 15 thinking, 16 nope, 17 talking, 18 terminal, 19 kiss
uniform vec2  uLook;    // gaze, -1..1
uniform vec3  uColor;
uniform sampler2D uText; // white text on black, 16:1 canvas
uniform float uTextX;   // left edge of the text, screen units
uniform float uTextH;   // height of the text band, screen units
uniform sampler2D uTerm; // terminal mode: the whole chat, drawn to fill the screen
uniform float uTermOn;  // 0 off .. 1 on (CRT power-on / off)
uniform float uGlitch;  // 0..1 static for "access denied"

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - sqrt(2.0) / 4.0;
  vec2 a = p - vec2(0.0, 1.0), b = p - 0.5 * max(p.x + p.y, 0.0);
  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}

// 1: gear (custom software & ERPs)
float iconGear(vec2 l, float side) {
  float r = length(l);
  float a = atan(l.y, l.x) + uTime * 1.2 * side;
  float teeth = smoothstep(-0.25, 0.25, cos(a * 8.0));
  return max(r - (0.085 + 0.03 * teeth), 0.035 - r);
}
// 2: < / > (full-stack apps)
float iconCode(vec2 l, float side) {
  vec2 q = vec2(l.x * -side, l.y);
  float d = min(sdSeg(q, vec2(0.05, 0.1), vec2(-0.055, 0.0)),
                sdSeg(q, vec2(-0.055, 0.0), vec2(0.05, -0.1)));
  return d - 0.017;
}
// 3: spinning wireframe cube (3D websites)
float iconCube(vec2 l) {
  float ay = uTime * 0.9, ax = 0.55;
  mat3 ry = mat3(cos(ay), 0.0, sin(ay), 0.0, 1.0, 0.0, -sin(ay), 0.0, cos(ay));
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(ax), -sin(ax), 0.0, sin(ax), cos(ax));
  vec2 v[8];
  for (int i = 0; i < 8; i++) {
    vec3 c = vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1)) * 2.0 - 1.0;
    v[i] = (rx * ry * c).xy * 0.068;
  }
  float d = 1e5;
  for (int i = 0; i < 8; i++) {
    for (int b = 0; b < 3; b++) {
      int j = i ^ (1 << b);
      if (j > i) d = min(d, sdSeg(l, v[i], v[j]));
    }
  }
  return d - 0.011;
}
// 4: cursor clicking (UI/UX)
float iconCursor(vec2 l) {
  float k = fract(uTime * 0.8);
  vec2 off = vec2(0.012, -0.012) * smoothstep(0.55, 0.62, k) * (1.0 - smoothstep(0.75, 0.9, k));
  vec2 q = l - off;
  float arrow = sdTri(q, vec2(-0.06, 0.1), vec2(-0.06, -0.045), vec2(0.045, 0.005));
  float tail = sdSeg(q, vec2(-0.025, -0.0), vec2(0.025, -0.085)) - 0.016;
  float d = min(arrow, tail);
  float rr = smoothstep(0.6, 1.0, k) * 0.12;
  float ring = abs(length(l - vec2(-0.06, 0.1)) - rr) - 0.01;
  ring += step(k, 0.6) * 1.0 + smoothstep(0.85, 1.0, k) * 0.05;
  return min(d, ring);
}
// 6: phone <-> laptop (cross-platform apps)
float iconDevice(vec2 l, float side) {
  float m = smoothstep(-0.4, 0.4, sin(uTime * 1.8 + (side > 0.0 ? 3.14159 : 0.0)));
  vec2 size = mix(vec2(0.05, 0.095), vec2(0.105, 0.065), m);
  vec2 c = vec2(0.0, mix(0.0, 0.025, m));
  float d = abs(sdBox(l - c, size, 0.02)) - 0.013;
  float base = sdSeg(l, vec2(-0.13, -0.075), vec2(0.13, -0.075)) - 0.013;
  base += (1.0 - m) * 0.2;
  return min(d, base);
}

// Distance to the lit shape at point p (screen space, y in -0.5..0.5).
float shapeAt(vec2 p);
float shape(vec2 p) {
  // Everything below is authored at 1x; draw it 30% larger on the screen.
  return shapeAt(p / 1.3) * 1.3;
}

float shapeAt(vec2 p) {
  float t = uTime;
  vec2 gaze = uLook * vec2(0.09, 0.06);
  float open = max(uOpen, 0.02);
  float d = 1e5;

  // 15: three bouncing dots (thinking)
  if (uMode == 15) {
    for (int i = -1; i <= 1; i++) {
      float fi = float(i);
      vec2 c = vec2(fi * 0.17, 0.02 + 0.06 * max(0.0, sin(t * 7.0 - fi * 1.1)));
      d = min(d, length(p - c) - 0.05);
    }
    return d;
  }

  // 5 / 17: waveform across both eyes (AI assistants, and talking in the chat)
  if (uMode == 5 || uMode == 17) {
    vec2 q = p - vec2(0.0, 0.02);
    float w = 0.05;
    float i = floor(q.x / w + 0.5);
    if (abs(i) <= 8.0) {
      float h = 0.025 + 0.15 * abs(sin(i * 1.7 + t * 5.0) * sin(i * 0.43 - t * 2.1))
              * (1.0 - abs(i) / 10.0);
      d = sdBox(vec2(q.x - i * w, q.y / open), vec2(0.012, h), 0.012);
    }
    return d;
  }

  for (int e = 0; e < 2; e++) {
    float side = e == 0 ? -1.0 : 1.0;
    vec2 c = vec2(0.27 * side, 0.03) + gaze;
    vec2 l = p - c;
    l.y /= open;
    float de;
    if (uMode == 0) {
      de = sdBox(l, vec2(0.075, 0.12), 0.06);
    } else if (uMode == 7) {
      // happy: ^ ^
      vec2 q = l + vec2(0.0, 0.07);
      de = abs(length(q) - 0.105) - 0.024;
      de = max(de, -(q.y - 0.025));
    } else if (uMode == 8) {
      // asleep: soft lines
      de = sdSeg(l, vec2(-0.08, -0.03), vec2(0.08, -0.03)) - 0.018;
    } else if (uMode == 9) {
      // surprised: O O
      de = abs(length(l) - 0.092) - 0.026;
    } else if (uMode == 10) {
      // angry: eyes cut by brows sloping down to the middle
      de = max(sdBox(l, vec2(0.08, 0.1), 0.05), l.y - (0.03 + 0.6 * side * l.x));
    } else if (uMode == 11) {
      // wink: left eye open, right eye ^
      vec2 q = l + vec2(0.0, 0.07);
      de = side < 0.0 ? sdBox(l, vec2(0.075, 0.12), 0.06)
                      : max(abs(length(q) - 0.105) - 0.024, -(q.y - 0.025));
    } else if (uMode == 19) {
      // kiss: both eyes closed in happy arcs
      vec2 q = l + vec2(0.0, 0.07);
      de = max(abs(length(q) - 0.105) - 0.024, -(q.y - 0.025));
    } else if (uMode == 16) {
      // nope: X X
      de = min(sdSeg(l, vec2(-0.07, -0.07), vec2(0.07, 0.07)), sdSeg(l, vec2(-0.07, 0.07), vec2(0.07, -0.07))) - 0.022;
    } else if (uMode == 14) {
      // flying: narrow focused slits, tilted in towards the middle
      de = sdBox(vec2(l.x, l.y + side * l.x * 0.35), vec2(0.095, 0.034), 0.03);
    } else if (uMode == 12) {
      // love: beating hearts
      float s = 0.16 * (1.0 + 0.12 * pow(abs(sin(t * 3.4)), 6.0));
      de = sdHeart((l + vec2(0.0, 0.09)) / s) * s;
    } else if (uMode == 1) {
      de = iconGear(l, side);
    } else if (uMode == 2) {
      de = iconCode(l, side);
    } else if (uMode == 3) {
      de = iconCube(l);
    } else if (uMode == 4) {
      de = iconCursor(l);
    } else {
      de = iconDevice(l, side);
    }
    d = min(d, de);
  }
  if (uMode == 19) {
    // a little beating heart between and below the closed eyes
    float hs = 0.075 * (1.0 + 0.18 * pow(abs(sin(t * 4.0)), 4.0));
    d = min(d, sdHeart((p - vec2(0.0, -0.27)) / hs) * hs);
  }
  if (uMode == 2) {
    float slash = sdSeg(vec2(p.x, (p.y - 0.03) / open), vec2(0.03, 0.1), vec2(-0.03, -0.1)) - 0.015;
    d = min(d, slash);
  }
  if (uMode == 8) {
    // a small "z" drifting up
    float k = fract(t * 0.35);
    vec2 z = (p - vec2(0.42, -0.05 + k * 0.3)) / (0.6 + k * 0.6);
    float zd = min(min(sdSeg(z, vec2(-0.04, 0.04), vec2(0.04, 0.04)),
                       sdSeg(z, vec2(0.04, 0.04), vec2(-0.04, -0.04))),
                       sdSeg(z, vec2(-0.04, -0.04), vec2(0.04, -0.04))) - 0.012;
    d = min(d, zd + k * k * 0.03);
  }
  return d;
}

float hash(float n) { return fract(sin(n) * 43758.5453); }

// 0..1 text coverage at screen point p (mode 13).
float textAt(vec2 p) {
  vec2 uv = vec2((p.x - uTextX) / (uTextH * 16.0), p.y / max(uOpen, 0.02) / uTextH + 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(uText, uv).r;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Rounded screen edge; outside is the dark bezel.
  float edge = sdBox(p, vec2(uAspect * 0.5 - 0.01, 0.49), 0.12);
  vec3 bezel = vec3(0.018, 0.02, 0.024);
  if (edge > 0.0) { gl_FragColor = vec4(bezel, 1.0); return; }

  // Slight barrel bulge, like a CRT tube.
  vec2 pc = p * (1.0 + 0.07 * dot(p, p));

  // 18: terminal mode. The chat is drawn crisp (no LED grid) with fine scanlines.
  if (uMode == 18) {
    // power on: a bright line opens vertically; at the very end it was a dot
    float on = uTermOn;
    float shown = step(abs(p.y), on * 0.5) * step(abs(p.x), uAspect * 0.5 * clamp(on / 0.12, 0.0, 1.0));
    vec2 q = pc;
    if (uGlitch > 0.0) {
      float row = floor(q.y * 40.0);
      q.x += (hash(row + floor(uTime * 30.0)) - 0.5) * 0.09 * uGlitch;
    }
    float txt = texture2D(uTerm, vec2(q.x / uAspect + 0.5, q.y + 0.5)).r;
    vec3 tcol = uColor * txt * 1.3 * (0.8 + 0.2 * sin(q.y * 520.0)) + uColor * 0.025;
    // static and a red cast while glitching
    float noise = hash(floor(q.x * 260.0) * 17.0 + floor(q.y * 260.0) * 131.0 + floor(uTime * 24.0));
    tcol = mix(tcol, vec3(noise * 0.35) + vec3(0.9, 0.12, 0.05) * txt * 1.3, uGlitch * 0.65);
    float edgeLine = smoothstep(0.014, 0.0, abs(abs(p.y) - on * 0.5)) * (1.0 - on) * 4.0;
    vec3 c = vec3(0.012, 0.014, 0.017) + (tcol + uColor * edgeLine) * shown;
    c *= smoothstep(0.0, -0.09, edge) * 0.55 + 0.45;
    gl_FragColor = vec4(c, 1.0);
    return;
  }

  // LED grid
  float cells = 34.0;
  vec2 g = pc * cells;
  vec2 cell = floor(g) + 0.5;
  vec2 f = fract(g) - 0.5;
  float led = smoothstep(0.42, 0.28, length(f));

  float lit, halo;
  if (uMode == 13) {
    lit = step(0.45, textAt(cell / cells));
    halo = textAt(pc) * 0.8;
  } else {
    lit = 1.0 - smoothstep(-0.004, 0.004, shape(cell / cells));
    halo = 1.0 - smoothstep(-0.02, 0.06, shape(pc));
  }

  float flicker = uPower < 1.0 ? step(0.35, hash(floor(uTime * 24.0))) * uPower : 1.0;
  float scan = 0.9 + 0.1 * sin(p.y * 180.0 - uTime * 6.0);

  vec3 glass = vec3(0.012, 0.014, 0.017) + uColor * 0.012 * led * uPower;
  vec3 col = glass;
  col += uColor * lit * led * 3.2 * scan * flicker;
  col += uColor * halo * 0.16 * flicker;
  // inner shadow towards the rim, like a recessed CRT
  col *= smoothstep(0.0, -0.09, edge) * 0.55 + 0.45;
  // a faint diagonal glass reflection
  col += vec3(0.03) * smoothstep(0.05, 0.0, abs(p.x * 0.55 + p.y - 0.3)) * smoothstep(-0.02, -0.12, edge);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createEyeMaterial(aspect: number, color: THREE.ColorRepresentation, text: THREE.Texture, termTex: THREE.Texture) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uAspect: { value: aspect },
      uOpen: { value: 1 },
      uPower: { value: 0 },
      uMode: { value: 0 },
      uLook: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(color) },
      uText: { value: text },
      uTextX: { value: 0 },
      uTextH: { value: 0.42 },
      uTerm: { value: termTex },
      uTermOn: { value: 0 },
      uGlitch: { value: 0 },
    },
  });
}
