// The game's portrait bake, outside Unity.
//
// A champion with no painting under Resources/Portraits gets a portrait
// rendered from their own model in the game (ChampionPortrait.Render). This
// does the same for the website, from the same files, with the same framing
// rules: the head is where the skin weights say it is, the frame is a fixed
// 0.45-unit cube around the face shrunk by the Margin, the face is lit by
// the same key and fill lamps, the wash behind it is the champion's own
// colour, and the ink outline hugs the silhouette.
//
//   node tools/bake_portraits.mjs --unity ../alphamoba-unity --out assets/img/portraits azra bram ...
//
// Node built-ins only, plus the game's own PNG codecs (Tooling/Art). A model
// whose texture is not a PNG (Rime's GLB embeds JPEGs) is reported and
// skipped rather than guessed at.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1]; };
const UNITY = path.resolve(opt("unity") ?? path.join(process.cwd(), "..", "alphamoba-unity"));
const OUT = path.resolve(opt("out") ?? "assets/img/portraits");
const SIZE = Number(opt("size") ?? 512);
const SS = 2;                                  // supersample, like the camera's 4x AA
const ids = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));

const { decodePng } = await import(path.join(UNITY, "Tooling/Art/read_png.mjs"));
const { encodePng } = await import(path.join(UNITY, "Tooling/Art/write_png.mjs"));
const MODELS = path.join(UNITY, "Assets/Resources/Champions");

// --------------------------------------------------------- ChampionPortrait
// The game frames at Margin 0.72 (the face is nine tenths of a 192px tile).
// --margin loosens that: the site shows these at 512 beside painted busts.
const MARGIN = Number(opt("margin") ?? 0.72), FACE_LIFT = 0.03, HEAD_CUBE = 0.45, HEAD_NODE = "head";
const EDGE = [0.06, 0.07, 0.09];
const INK = [0.03, 0.025, 0.03], INK_PIXELS = 2, GAME_SIZE = 192;
const AMBIENT = [0.07, 0.07, 0.08];
const KEY = { colour: [1, 0.94, 0.86], intensity: 1.05, euler: [18, 205, 0] };
const FILL = { colour: [0.75, 0.82, 0.95], intensity: 0.3, euler: [-10, 25, 0] };
// Which model file stands for a champion when the id alone does not.
const MODEL_FOR = { wick: "wick_master", hollis: "hollis_solo", yip: "yip_solo", sable: "sable_remodel", quell: "quell_remodel" };

// ------------------------------------------------------------------- maths
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function mat4Identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mat4Mul(a, b) {            // column-major, a*b
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function mat4FromTRS(t = [0,0,0], q = [0,0,0,1], s = [1,1,1]) {
  const [x, y, z, w] = q;
  const xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
  return [
    (1 - 2*(yy+zz)) * s[0], (2*(xy+wz)) * s[0], (2*(xz-wy)) * s[0], 0,
    (2*(xy-wz)) * s[1], (1 - 2*(xx+zz)) * s[1], (2*(yz+wx)) * s[1], 0,
    (2*(xz+wy)) * s[2], (2*(yz-wx)) * s[2], (1 - 2*(xx+yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const xformPoint = (m, v) => [
  m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12],
  m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13],
  m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14],
];
// Unity's Euler order (Z, then X, then Y) applied to the light's +Z forward.
function lightForward([ex, ey, ez]) {
  const rad = Math.PI / 180;
  let v = [0, 0, 1];
  const rz = ez * rad, rx = ex * rad, ry = ey * rad;
  v = [v[0]*Math.cos(rz) - v[1]*Math.sin(rz), v[0]*Math.sin(rz) + v[1]*Math.cos(rz), v[2]];
  v = [v[0], v[1]*Math.cos(rx) - v[2]*Math.sin(rx), v[1]*Math.sin(rx) + v[2]*Math.cos(rx)];
  v = [v[0]*Math.cos(ry) + v[2]*Math.sin(ry), v[1], -v[0]*Math.sin(ry) + v[2]*Math.cos(ry)];
  return v;
}
const KEY_DIR = lightForward(KEY.euler).map((c) => -c);   // toward the lamp
const FILL_DIR = lightForward(FILL.euler).map((c) => -c);

// -------------------------------------------------------------------- glTF
function loadModel(file) {
  const dir = path.dirname(file);
  const bytes = fs.readFileSync(file);
  let json, glbBin = null;
  if (bytes.readUInt32LE(0) === 0x46546c67) {          // 'glTF' — a GLB container
    let pos = 12;
    while (pos < bytes.length) {
      const len = bytes.readUInt32LE(pos), type = bytes.readUInt32LE(pos + 4);
      const body = bytes.subarray(pos + 8, pos + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
      else if (type === 0x004e4942) glbBin = body;
      pos += 8 + len;
    }
  } else json = JSON.parse(bytes.toString("utf8"));
  const buffers = (json.buffers ?? []).map((b, i) =>
    !b.uri ? glbBin
      : b.uri.startsWith("data:") ? Buffer.from(b.uri.slice(b.uri.indexOf(",") + 1), "base64")
      : fs.readFileSync(path.join(dir, decodeURIComponent(b.uri))));

  const COMPONENT = { 5120: ["readInt8", 1, 127], 5121: ["readUInt8", 1, 255], 5122: ["readInt16LE", 2, 32767],
    5123: ["readUInt16LE", 2, 65535], 5125: ["readUInt32LE", 4, 1], 5126: ["readFloatLE", 4, 1] };
  const PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function accessor(i) {
    const a = json.accessors[i];
    const view = json.bufferViews[a.bufferView];
    const buf = buffers[view.buffer];
    const [read, width, maxv] = COMPONENT[a.componentType];
    const n = PER[a.type];
    const stride = view.byteStride || width * n;
    const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = new Float32Array(a.count * n);
    const norm = a.normalized ? 1 / maxv : 1;
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) out[k * n + c] = buf[read](base + k * stride + c * width) * norm;
    return out;
  }
  function imageBytes(index) {
    const img = json.images[index];
    if (img.uri) return { bytes: fs.readFileSync(path.join(dir, decodeURIComponent(img.uri))), name: img.uri };
    const view = json.bufferViews[img.bufferView];
    return { bytes: buffers[view.buffer].subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength),
      name: img.name ?? `image ${index} (${img.mimeType})` };
  }
  return { json, accessor, imageBytes };
}

// An 8-bit RGB (colour type 2) or RGBA (6) non-interlaced PNG, to RGBA.
function decodeRgbPng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let width = 0, height = 0, channels = 0; const idat = [];
  for (let pos = 8; pos < buffer.length;) {
    const len = buffer.readUInt32BE(pos), type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8], colour = data[9], interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour})`);
      channels = colour === 2 ? 3 : 4;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels, bpp = channels;
  const pixels = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride), src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]; const line = Buffer.from(raw.subarray(src, src + stride)); src += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a; else if (filter === 2) pred = b; else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      pixels[d] = line[s]; pixels[d+1] = line[s+1]; pixels[d+2] = line[s+2]; pixels[d+3] = channels === 4 ? line[s+3] : 255;
    }
    prev = line;
  }
  return { width, height, pixels };
}

// Global transforms for every node, walking down from the scene roots.
function nodeGlobals(json) {
  const nodes = json.nodes ?? [];
  const globals = new Array(nodes.length).fill(null);
  const local = (n) => n.matrix ? n.matrix.slice() : mat4FromTRS(n.translation, n.rotation, n.scale);
  const walk = (i, parent) => {
    globals[i] = mat4Mul(parent, local(nodes[i]));
    for (const c of nodes[i].children ?? []) walk(c, globals[i]);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i).filter((i) => !nodes.some((n) => (n.children ?? []).includes(i)));
  for (const r of roots) walk(r, mat4Identity());
  for (let i = 0; i < nodes.length; i++) if (!globals[i]) walk(i, mat4Identity());
  return globals;
}

// Every primitive posed into world space: positions, per-vertex head weight,
// its texture (decoded PNG) or flat colour, and whether it is double-sided.
function poseModel(model) {
  const { json, accessor, imageBytes } = model;
  const globals = nodeGlobals(json);
  const nodes = json.nodes ?? [];
  const headIndex = nodes.findIndex((n) => (n.name ?? "").toLowerCase() === HEAD_NODE)
    >= 0 ? nodes.findIndex((n) => (n.name ?? "").toLowerCase() === HEAD_NODE)
    : nodes.findIndex((n) => (n.name ?? "").toLowerCase().includes(HEAD_NODE));
  const textures = new Map();
  const texture = (matIndex) => {
    const mat = json.materials?.[matIndex];
    const ti = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (ti === undefined) return null;
    if (textures.has(ti)) return textures.get(ti);
    const src = json.textures[ti].source;
    const { bytes, name } = imageBytes(src);
    let decoded = null;
    try { decoded = decodePng(bytes); }
    catch (e) {
      // The game's codec reads only RGBA; a commissioned remodel's texture
      // can arrive as plain RGB. Read that here rather than skip the champion.
      try { decoded = decodeRgbPng(bytes); }
      catch (e2) { throw new Error(`texture ${name} is not a PNG this can read (${e.message})`); }
    }
    textures.set(ti, decoded);
    return decoded;
  };
  const prims = [];
  nodes.forEach((node, ni) => {
    if (node.mesh === undefined) return;
    const skin = node.skin !== undefined ? json.skins[node.skin] : null;
    let jointMats = null, headJoint = -1;
    if (skin) {
      const ibm = skin.inverseBindMatrices !== undefined ? accessor(skin.inverseBindMatrices) : null;
      jointMats = skin.joints.map((j, k) => {
        const inv = ibm ? Array.from(ibm.subarray(k * 16, k * 16 + 16)) : mat4Identity();
        return mat4Mul(globals[j], inv);
      });
      headJoint = skin.joints.indexOf(headIndex);
    }
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if (prim.indices === undefined || prim.attributes?.POSITION === undefined) continue;
      const P = accessor(prim.attributes.POSITION);
      const count = P.length / 3;
      const posed = new Float32Array(P.length);
      const headWeight = new Float32Array(count);
      const J = skin && prim.attributes.JOINTS_0 !== undefined ? accessor(prim.attributes.JOINTS_0) : null;
      const W = skin && prim.attributes.WEIGHTS_0 !== undefined ? accessor(prim.attributes.WEIGHTS_0) : null;
      for (let i = 0; i < count; i++) {
        const v = [P[i*3], P[i*3+1], P[i*3+2]];
        if (J && W) {
          let out = [0, 0, 0];
          for (let k = 0; k < 4; k++) {
            const w = W[i*4+k];
            if (w <= 0) continue;
            const j = J[i*4+k];
            const p = xformPoint(jointMats[j], v);
            out = [out[0] + p[0]*w, out[1] + p[1]*w, out[2] + p[2]*w];
            if (j === headJoint) headWeight[i] += w;
          }
          posed.set(out, i*3);
        } else posed.set(xformPoint(globals[ni], v), i*3);
      }
      const mat = json.materials?.[prim.material] ?? {};
      const uv = prim.attributes.TEXCOORD_0 !== undefined ? accessor(prim.attributes.TEXCOORD_0) : null;
      const tex = uv ? texture(prim.material) : null;
      const base = mat.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      prims.push({ posed, headWeight, indices: accessor(prim.indices), uv, tex, base,
        doubleSided: !!mat.doubleSided, skinned: !!(J && W), node: ni });
    }
  });
  const headPos = headIndex >= 0 ? xformPoint(globals[headIndex], [0, 0, 0]) : null;
  const headHasMesh = headIndex >= 0 && nodes[headIndex].mesh !== undefined;
  return { prims, headIndex, headPos, headHasMesh, globals };
}

// ------------------------------------------------------------ ChampionPortrait.Head
function findHead(model) {
  const { prims, headPos, headHasMesh, headIndex } = model;
  const bounds = (pts) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); }
    return { centre: lo.map((l, c) => (l + hi[c]) / 2), size: hi.map((h, c) => h - lo[c]) };
  };
  if (headIndex >= 0) {
    if (headHasMesh) {
      const pts = [];
      for (const pr of prims) if (pr.node === headIndex) for (let i = 0; i < pr.posed.length; i += 3) pts.push([pr.posed[i], pr.posed[i+1], pr.posed[i+2]]);
      if (pts.length) { const b = bounds(pts); if (b.size[1] > 0.01) return { ...b, how: "head mesh" }; }
    }
    // SkinnedHead: the vertices the head bone mostly drives, in front of it.
    let sx = 0, sz = 0, n = 0; const heights = [];
    for (const pr of prims) {
      if (!pr.skinned) continue;
      for (let i = 0; i < pr.headWeight.length; i++) {
        if (pr.headWeight[i] < 0.5) continue;
        const x = pr.posed[i*3], y = pr.posed[i*3+1], z = pr.posed[i*3+2];
        if (z <= headPos[2]) continue;
        sx += x; sz += z; heights.push(y); n++;
      }
    }
    if (n >= 8) {
      heights.sort((a, b) => a - b);
      const low = heights[Math.floor(n * 0.10)], high = heights[Math.min(Math.floor(n * 0.90), n - 1)];
      const centre = [sx / n, lerp(low, high, 0.45), sz / n];
      const d = Math.hypot(centre[0] - headPos[0], centre[1] - headPos[1], centre[2] - headPos[2]);
      if (d <= 0.6) return { centre, size: [HEAD_CUBE, HEAD_CUBE, HEAD_CUBE], how: `skin (${n} verts)` };
    }
    return { centre: headPos, size: [HEAD_CUBE, HEAD_CUBE, HEAD_CUBE], how: "head bone" };
  }
  const pts = [];
  for (const pr of prims) for (let i = 0; i < pr.posed.length; i += 3) pts.push([pr.posed[i], pr.posed[i+1], pr.posed[i+2]]);
  const whole = bounds(pts);
  const slice = Math.max(whole.size[1] * 0.28, 0.2);
  return { centre: [whole.centre[0], whole.centre[1] + whole.size[1] / 2 - slice / 2, whole.centre[2]],
    size: [slice, slice, slice], how: "top slice (no head node)" };
}

// ------------------------------------------------------ ChampionPortrait.MainColour
function mainColour(model) {
  let atlas = null;
  for (const pr of model.prims) if (pr.tex && (!atlas || pr.tex.width * pr.tex.height > atlas.width * atlas.height)) atlas = pr.tex;
  if (!atlas) return [0.30, 0.32, 0.36];
  const SW = 32, bins = 24;
  const weight = new Array(bins).fill(0), sr = new Array(bins).fill(0), sg = new Array(bins).fill(0), sb = new Array(bins).fill(0);
  let greyN = 0, greyR = 0, greyG = 0, greyB = 0;
  for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) {
    const ax = Math.floor((x + 0.5) / SW * atlas.width), ay = Math.floor((y + 0.5) / SW * atlas.height);
    const o = (ay * atlas.width + ax) * 4;
    const a = atlas.pixels[o+3] / 255;
    if (a < 0.5) continue;
    const r = atlas.pixels[o] / 255, g = atlas.pixels[o+1] / 255, b = atlas.pixels[o+2] / 255;
    const [h, s, v] = rgbToHsv(r, g, b);
    const w = s * clamp01((v - 0.08) * 4) * clamp01((1.05 - v) * 4);
    greyN++; greyR += r; greyG += g; greyB += b;
    if (w <= 0.02) continue;
    const k = Math.min(bins - 1, Math.max(0, Math.floor(h * bins)));
    weight[k] += w; sr[k] += r * w; sg[k] += g * w; sb[k] += b * w;
  }
  let best = 0, bestW = 0;
  for (let k = 0; k < bins; k++) {
    const around = weight[k] + weight[(k + 1) % bins] + weight[(k + bins - 1) % bins];
    if (around > bestW) { bestW = around; best = k; }
  }
  if (bestW < SW * SW * 0.02) {
    const mean = greyN ? (greyR + greyG + greyB) / (3 * greyN) : 0.4;
    return hsvToRgb(0.6, 0.25, Math.min(0.65, Math.max(0.45, mean)));
  }
  let r = 0, g = 0, b = 0, t = 0;
  for (const k of [(best + bins - 1) % bins, best, (best + 1) % bins]) { r += sr[k]; g += sg[k]; b += sb[k]; t += weight[k]; }
  const [h, s] = rgbToHsv(r / t, g / t, b / t);
  return hsvToRgb(h, Math.min(1, Math.max(0.85, s)), 0.78);
}
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return [h, max ? d / max : 0, max];
}
function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
}

// ------------------------------------------------------------------ render
function renderPortrait(model, head, colour) {
  const R = SIZE * SS;
  const reach = Math.max(head.size[0], head.size[1]) * MARGIN;
  const scale = R / reach;
  const cx = head.centre[0], cy = head.centre[1] + head.size[1] * FACE_LIFT, cz = head.centre[2];
  const nearZ = cz + 4 - 20, farZ = cz + 4 - 0.01;

  // The wash: the champion's colour over most of the tile, the Edge colour in the corners.
  const rgb = new Float32Array(R * R * 3);
  const covered = new Uint8Array(R * R);
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const u = ((x + 0.5) / R - 0.5) / 1.1, v = ((y + 0.5) / R - 0.5) / 1.1;
    const radius = Math.hypot(u, v) * 2;
    const glow = Math.pow(clamp01(1 - radius * 0.78), 1.1);
    const o = (y * R + x) * 3;
    for (let c = 0; c < 3; c++) rgb[o + c] = lerp(EDGE[c], colour[c], glow);
  }
  const zbuf = new Float32Array(R * R).fill(-Infinity);
  // Camera on +Z looking back: screen x runs against world x.
  const project = (x, y, z) => [R / 2 - (x - cx) * scale, R / 2 - (y - cy) * scale, z];

  for (const pr of model.prims) {
    const { posed: P, indices: I, uv: UV, tex, base, doubleSided } = pr;
    const baseLin = base.slice(0, 3).map(srgbToLinear);
    for (let t = 0; t < I.length / 3; t++) {
      const i0 = I[t*3], i1 = I[t*3+1], i2 = I[t*3+2];
      const a = [P[i0*3], P[i0*3+1], P[i0*3+2]], b = [P[i1*3], P[i1*3+1], P[i1*3+2]], c = [P[i2*3], P[i2*3+1], P[i2*3+2]];
      // Geometric normal in world space; single-sided faces turned away are culled.
      const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      let n = [e1[1]*e2[2] - e1[2]*e2[1], e1[2]*e2[0] - e1[0]*e2[2], e1[0]*e2[1] - e1[1]*e2[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-12) continue;
      n = n.map((k) => k / len);
      if (n[2] <= 0) { if (!doubleSided) continue; n = n.map((k) => -k); }
      const p = [project(...a), project(...b), project(...c)];
      if (p[0][2] < nearZ && p[1][2] < nearZ && p[2][2] < nearZ) continue;
      if (p[0][2] > farZ && p[1][2] > farZ && p[2][2] > farZ) continue;
      const minX = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0])));
      const maxX = Math.min(R - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0])));
      const minY = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1])));
      const maxY = Math.min(R - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1])));
      if (minX > maxX || minY > maxY) continue;
      const area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1]);
      if (Math.abs(area) < 1e-9) continue;
      const shade = [0, 1, 2].map((k) => AMBIENT[k]
        + KEY.colour[k] * KEY.intensity * Math.max(0, n[0]*KEY_DIR[0] + n[1]*KEY_DIR[1] + n[2]*KEY_DIR[2])
        + FILL.colour[k] * FILL.intensity * Math.max(0, n[0]*FILL_DIR[0] + n[1]*FILL_DIR[1] + n[2]*FILL_DIR[2]));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((p[1][0] - px) * (p[2][1] - py) - (p[2][0] - px) * (p[1][1] - py)) / area;
        const w1 = ((p[2][0] - px) * (p[0][1] - py) - (p[0][0] - px) * (p[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = p[0][2] * w0 + p[1][2] * w1 + p[2][2] * w2;
        const o = y * R + x;
        if (depth <= zbuf[o]) continue;
        let albedo;
        if (tex) {
          const u = UV[i0*2] * w0 + UV[i1*2] * w1 + UV[i2*2] * w2;
          const v = UV[i0*2+1] * w0 + UV[i1*2+1] * w1 + UV[i2*2+1] * w2;
          const ax = Math.min(tex.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.width)));
          const ay = Math.min(tex.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * tex.height)));
          const s = (ay * tex.width + ax) * 4;
          if (tex.pixels[s + 3] < 8) continue;
          albedo = [srgbToLinear(tex.pixels[s] / 255) * baseLin[0], srgbToLinear(tex.pixels[s+1] / 255) * baseLin[1], srgbToLinear(tex.pixels[s+2] / 255) * baseLin[2]];
        } else albedo = baseLin;
        zbuf[o] = depth; covered[o] = 1;
        for (let k = 0; k < 3; k++) rgb[o * 3 + k] = clamp01(linearToSrgb(albedo[k] * shade[k]));
      }
    }
  }

  // The ink outline: the hull the game draws is INK_PIXELS wide at its 192px
  // render, so the line here is that width scaled to this render's size.
  const inkRadius = INK_PIXELS * (R / GAME_SIZE);
  const dist = chamfer(covered, R);
  for (let o = 0; o < R * R; o++) {
    if (covered[o]) continue;
    const d = dist[o];
    if (d > inkRadius + 0.5) continue;
    const t = clamp01(inkRadius + 0.5 - d);   // a soft outer edge
    for (let k = 0; k < 3; k++) rgb[o * 3 + k] = lerp(rgb[o * 3 + k], INK[k], t);
  }

  // Box-filter the supersample down.
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0];
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const o = ((y * SS + dy) * R + (x * SS + dx)) * 3;
      acc[0] += rgb[o]; acc[1] += rgb[o+1]; acc[2] += rgb[o+2];
    }
    const o = (y * SIZE + x) * 4;
    out[o] = Math.round(acc[0] / (SS*SS) * 255); out[o+1] = Math.round(acc[1] / (SS*SS) * 255); out[o+2] = Math.round(acc[2] / (SS*SS) * 255); out[o+3] = 255;
  }
  return out;
}

// 3-4 chamfer distance from every uncovered pixel to the nearest covered one.
function chamfer(covered, R) {
  const BIG = 1e9;
  const d = new Float32Array(R * R);
  for (let o = 0; o < R * R; o++) d[o] = covered[o] ? 0 : BIG;
  const relax = (o, n, cost) => { if (d[n] + cost < d[o]) d[o] = d[n] + cost; };
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
    const o = y * R + x;
    if (x > 0) relax(o, o - 1, 1);
    if (y > 0) { relax(o, o - R, 1); if (x > 0) relax(o, o - R - 1, 1.4142); if (x < R - 1) relax(o, o - R + 1, 1.4142); }
  }
  for (let y = R - 1; y >= 0; y--) for (let x = R - 1; x >= 0; x--) {
    const o = y * R + x;
    if (x < R - 1) relax(o, o + 1, 1);
    if (y < R - 1) { relax(o, o + R, 1); if (x < R - 1) relax(o, o + R + 1, 1.4142); if (x > 0) relax(o, o + R - 1, 1.4142); }
  }
  return d;
}

// -------------------------------------------------------------------- main
fs.mkdirSync(OUT, { recursive: true });
let baked = 0;
for (const id of ids) {
  const stem = MODEL_FOR[id] ?? id;
  const file = [".gltf", ".glb"].map((e) => path.join(MODELS, stem + e)).find((f) => fs.existsSync(f));
  if (!file) { console.log(`${id}: no model file`); continue; }
  try {
    const started = Date.now();
    const model = poseModel(loadModel(file));
    const head = findHead(model);
    const colour = mainColour(model);
    const pixels = renderPortrait(model, head, colour);
    const dest = path.join(OUT, `${id}.png`);
    fs.writeFileSync(dest, encodePng(SIZE, SIZE, pixels));
    baked++;
    console.log(`${id}: baked (${head.how}) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.log(`${id}: skipped, ${e.message}`);
  }
}
console.log(`${baked} of ${ids.length} baked`);
