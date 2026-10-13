/* ===========================================================================
   GLASS CAROUSEL
   Lens shader and scroll model adapted from Yousuf Soomro's liquid glass
   carousel, used under the MIT licence.

   Changes from the original snippet:
   - No GSAP. It was only used for matchMedia and one caption fade; native
     matchMedia and the Web Animations API cover both.
   - three.js is imported only when it will actually be used (not for
     reduced-motion visitors).
   - The page is rendered by a React-based runtime after this file runs, so the
     carousel waits for its section to appear instead of DOMContentLoaded.
   - The render loop sleeps while the section is off screen.
   - Prev / next buttons, so the row works without a mouse or trackpad.
   - Lens ring tinted to the page accent.
   Every knob lives in LENS / MOTION below.
   =========================================================================== */

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js";

const LENS = {
  panelHeight: 0.35, // panel height as a share of the section height
  panelGap: 40, // px between photos
  panelWidthMax: 0.78, // the widest photo never passes this share of the section width
  wheel: "horizontal", // "horizontal" | "all" | "off"
  width: 1, height: 0.6, rotation: 90, // oval, desktop
  widthNarrow: 1, heightNarrow: 0.7, rotationNarrow: 90, // oval, under narrowBreakpoint
  color: "#7CC79E", // ring and aura; matches --accent-ink
  glow: 4, // 0 to 17
  ring: 1,
  ringRadius: 0.49,
  ringWidth: 0.01,
  rimLine: 1,
  nova: 0.1,
  dispersion: 11,
  rimWave: 0.3,
  zoom: 0.4,
  vignette: 0,
  shimmer: true,
  // finer shader detail, rarely worth touching
  novaSize: 12, shimmerFreq: 12, shimmerSpeed: 3.5, shimmerDepth: 0.12,
  rimStart: 0.578, rimFreq1: 2, rimFreq2: 1, rimLinePos: 0.488, rimLineWidth: 0.003,
  vignetteSize: 0.3, samples: 16,
  textureDetail: 1.5,
  narrowBreakpoint: 768,
};

const MOTION = {
  repeats: 4, ease: 0.09, wheelSpeed: 1.4, dragSpeed: 1.6, touchSpeed: 1, touchEase: 0.22,
  friction: 0.865, snapIdle: 120, snapEase: 0.05, shrinkMax: 60, shrinkAttack: 0.25,
  shrinkDecay: 0.06, clickSlop: 6, touchClickSlop: 12, flickIdle: 90,
};

const GLASS_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const GLASS_FRAG = `
  #define PI 3.14159265
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2  uRes;
  uniform vec2  uCenter;
  uniform float uSizeX;
  uniform float uSizeY;
  uniform float uAspect;
  uniform float uZoom;
  uniform float uDispersion;
  uniform float uGlow;
  uniform float uWhiteGlow;
  uniform float uNovaSize;
  uniform float uBlueRing;
  uniform float uRingRadius;
  uniform float uRingWidth;
  uniform float uShimmer;
  uniform float uShimmerFreq;
  uniform float uShimmerSpeed;
  uniform float uShimmerDepth;
  uniform float uTime;
  uniform float uRimStart;
  uniform float uRimTangential;
  uniform float uRimFreq1;
  uniform float uRimFreq2;
  uniform vec3  uBlueColor;
  uniform float uRimLine;
  uniform float uRimLinePos;
  uniform float uRimLineWidth;
  uniform float uVignette;
  uniform float uVignetteSize;
  uniform float uRotation;
  uniform int   uSamples;

  const int MAX_SAMPLES = 16;

  vec3 discLens(vec2 center, float aspectCorrect, out float outA) {
    vec2 p = (vUv - center);
    p.x *= aspectCorrect;
    float ca = cos(uRotation), sa = sin(uRotation);
    p = mat2(ca, -sa, sa, ca) * p;
    vec2 halfSize = vec2(uSizeX, uSizeY);
    float dist = length(p / halfSize);
    outA = 0.0;

    float maskND = dist;
    if (maskND > 1.0) return vec3(0.0);

    float shapeND = clamp(maskND, 0.0, 1.0);
    float nd = clamp(dist, 0.0, 1.0);
    vec2  offset = vUv - center;
    vec2  radialDir = normalize(offset + 1e-6);
    vec2  tangentDir = vec2(-radialDir.y, radialDir.x);
    float angle = atan(p.y, p.x);

    float pull = uZoom * 0.30 * (nd * nd);
    float rimStrength = smoothstep(uRimStart, 1.0, nd);
    float fluidWave = sin(angle * uRimFreq1) * 0.55 + sin(angle * uRimFreq2) * 0.25;
    float rScreen = (uSizeX + uSizeY) * 0.5;
    vec2  rimOff = tangentDir * fluidWave * rimStrength * rScreen * uRimTangential;

    vec2 baseUV = center + offset * (1.0 - pull) + rimOff;

    float rimMask = smoothstep(0.55, 1.0, nd);
    vec2  dispDir = offset * uDispersion * 0.004 * rimMask;
    int N = uSamples;
    if (N < 2) N = 2;
    if (N > MAX_SAMPLES) N = MAX_SAMPLES;
    vec3 col = vec3(0.0);
    vec3 caW = vec3(0.0);
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= N) break;
      float t = float(i) / float(N - 1);
      vec2 sUV = baseUV + dispDir * (t - 0.5);
      vec3 s = texture2D(uTex, sUV).rgb;
      vec3 w = vec3(
        exp(-pow((t - 0.00) / 0.38, 2.0)),
        exp(-pow((t - 0.50) / 0.38, 2.0)),
        exp(-pow((t - 1.00) / 0.38, 2.0))
      );
      col += s * w;
      caW += w;
    }
    col /= max(caW, vec3(0.001));

    col *= mix(0.91, 1.0, smoothstep(0.0, 0.38, shapeND));

    float r2 = shapeND * shapeND * 0.25;
    float gs = max(uNovaSize * uGlow * 0.003, 0.004);
    float nova = exp(-r2 / gs) + exp(-r2 / (gs * 7.0)) * 0.18;
    nova *= uWhiteGlow * (uGlow / 17.0) * 1.15;
    col += vec3(nova);

    float dC = shapeND * 0.5;
    float tR = clamp(uRingRadius, 0.1, 0.49);
    float rW = max(uRingWidth, 0.003);
    float ring = exp(-pow((dC - tR) / rW, 2.0));
    ring *= uBlueRing * (uGlow / 17.0) * 1.8;
    if (uShimmer > 0.5) ring *= sin(angle * uShimmerFreq + uTime * uShimmerSpeed) * uShimmerDepth + (1.0 - uShimmerDepth);
    float ringAura = exp(-pow((dC - tR) / (rW * 6.0), 2.0)) * 0.28 * uBlueRing * (uGlow / 17.0);
    col += uBlueColor * (ring + ringAura);
    col += vec3(exp(-pow((dC - uRimLinePos) / max(uRimLineWidth, 0.0001), 2.0)) * uRimLine);

    outA = smoothstep(1.0, 0.93, maskND);
    return col;
  }

  void main(){
    vec3 base = texture2D(uTex, vUv).rgb;
    vec3 outc = base;

    float a = 0.0;
    vec3 c = discLens(uCenter, uAspect, a);
    outc = mix(outc, c, a);

    if (uVignette > 0.001) {
      vec2 vc = vUv - 0.5;
      vc.x *= uAspect;
      float d = length(vc) / max(uVignetteSize, 0.0001);
      float vig = 1.0 - uVignette * smoothstep(0.5, 1.0, d);
      outc *= clamp(vig, 0.0, 1.0);
    }

    gl_FragColor = vec4(outc, 1.0);
  }
`;

/* The canvas is painted with whatever colour sits behind the section, so the lens
   blends into the page instead of sitting on a hard-coded white. */
function backgroundOf(element) {
  let node = element;
  while (node && node !== document.documentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    node = node.parentElement;
  }
  return "#ffffff";
}

function setupGlassCarousel(wrapper, THREE) {
  const mount = wrapper.querySelector("[data-glass-carousel-canvas]");
  const items = Array.from(wrapper.querySelectorAll("[data-glass-carousel-item]"));
  if (!mount || !items.length) return null;
  if (wrapper.getAttribute("data-glass-carousel") === "canvas") return null;

  const captionEl = wrapper.querySelector("[data-glass-carousel-caption]");
  const counterEl = wrapper.querySelector("[data-glass-carousel-counter]");
  const prevEl = wrapper.querySelector("[data-glass-carousel-prev]");
  const nextEl = wrapper.querySelector("[data-glass-carousel-next]");

  const total = items.length;
  let W = Math.max(1, mount.clientWidth);
  let H = Math.max(1, mount.clientHeight);
  let narrow = W < LENS.narrowBreakpoint;
  let panelH = 0;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, canvas: mount });
  } catch {
    return null; // no WebGL: the authored row stays as it is
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(new THREE.Color(backgroundOf(wrapper)), 1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -100, 100);
  camera.position.z = 10;

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const sources = items.map((item) => ({
    tex: null,
    aspect: 1,
    image: item.querySelector("[data-glass-carousel-image]") || item.querySelector("img"),
  }));

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");

  function fitToPanel(image) {
    const cap = Math.round(panelH * Math.min(window.devicePixelRatio || 1, 2) * LENS.textureDetail);
    const height = image.naturalHeight || image.height;
    const width = image.naturalWidth || image.width;
    if (!height || height <= cap) return image;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(width * (cap / height)));
    scaled.height = cap;
    scaled.getContext("2d").drawImage(image, 0, 0, scaled.width, scaled.height);
    return scaled;
  }

  function adoptTexture(source) {
    const image = source.image;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    source.aspect = image.naturalWidth / image.naturalHeight;
    measurePanel();
    const url = image.currentSrc || image.src;
    loader.load(url, (tex) => {
      if (destroyed) return tex.dispose();
      tex.image = fitToPanel(tex.image);
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = maxAnisotropy;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      source.tex = tex;
      measurePanel();
      recomputeTotal();
      if (!userInteracted) {
        scroll = centerForIndex(0);
        target = scroll;
      }
    }, undefined, () => {
      console.warn("Glass carousel: image failed to load", url);
    });
  }

  function bindTextures() {
    sources.forEach((source) => {
      if (!source.image) return;
      if (source.image.complete) adoptTexture(source);
      else source.image.addEventListener("load", () => adoptTexture(source), { once: true });
    });
  }

  function measurePanel() {
    let widest = 1;
    for (let i = 0; i < sources.length; i++) widest = Math.max(widest, sources[i].aspect);
    panelH = Math.min(H * LENS.panelHeight, (W * LENS.panelWidthMax) / widest);
  }
  measurePanel();

  function slotWidth(index) {
    return sources[index].aspect * panelH + LENS.panelGap;
  }

  let offsets = [];
  let totalWidth = 0;
  function recomputeTotal() {
    offsets = [];
    let acc = 0;
    for (let i = 0; i < sources.length; i++) {
      offsets.push(acc);
      acc += slotWidth(i);
    }
    totalWidth = acc;
  }
  recomputeTotal();

  function slotCenter(index) {
    return offsets[index] + slotWidth(index) / 2 - LENS.panelGap / 2;
  }

  function centerForIndex(index) {
    const loop = Math.floor(index / total);
    const s = ((index % total) + total) % total;
    return slotCenter(s) + loop * totalWidth;
  }

  function nearestIndex(value) {
    if (!totalWidth) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < total; i++) {
      const center = slotCenter(i);
      const k = Math.round((value - center) / totalWidth);
      const dist = Math.abs(center + k * totalWidth - value);
      if (dist < bestDist) {
        bestDist = dist;
        best = i + k * total;
      }
    }
    return best;
  }

  function sourceIndex(value) {
    return ((nearestIndex(value) % total) + total) % total;
  }

  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const pool = [];
  for (let r = 0; r < MOTION.repeats; r++) {
    for (let i = 0; i < total; i++) {
      // Placeholder tone until the photo arrives; dark to suit this page
      const mat = new THREE.MeshBasicMaterial({ color: 0x1d2220, transparent: true });
      const mesh = new THREE.Mesh(panelGeometry, mat);
      mesh.visible = false;
      scene.add(mesh);
      pool.push({ mesh, mat, srcIndex: i, bound: false });
    }
  }

  let scroll = centerForIndex(0);
  let target = scroll;
  let userInteracted = false;
  let velocity = 0;
  let prevScroll = scroll;
  let scrollEnergy = 0;
  let lastInput = performance.now();
  let snapped = false;
  let lastCenter = -1;

  const dpr = renderer.getPixelRatio() || 1;
  const bufferW = () => Math.max(1, Math.round(W * dpr));
  const bufferH = () => Math.max(1, Math.round(H * dpr));
  const rt = new THREE.WebGLRenderTarget(bufferW(), bufferH());
  const lensScene = new THREE.Scene();
  const lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const lensUniforms = {
    uTex: { value: rt.texture },
    uRes: { value: new THREE.Vector2(bufferW(), bufferH()) },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSizeX: { value: 0 },
    uSizeY: { value: 0 },
    uRotation: { value: 0 },
    uAspect: { value: W / H },
    uZoom: { value: LENS.zoom },
    uDispersion: { value: LENS.dispersion },
    uGlow: { value: LENS.glow },
    uWhiteGlow: { value: LENS.nova },
    uNovaSize: { value: LENS.novaSize },
    uBlueRing: { value: LENS.ring },
    uRingRadius: { value: LENS.ringRadius },
    uRingWidth: { value: LENS.ringWidth },
    uShimmer: { value: LENS.shimmer ? 1 : 0 },
    uShimmerFreq: { value: LENS.shimmerFreq },
    uShimmerSpeed: { value: LENS.shimmerSpeed },
    uShimmerDepth: { value: LENS.shimmerDepth },
    uTime: { value: 0 },
    uRimStart: { value: LENS.rimStart },
    uRimTangential: { value: LENS.rimWave },
    uRimFreq1: { value: LENS.rimFreq1 },
    uRimFreq2: { value: LENS.rimFreq2 },
    uBlueColor: { value: new THREE.Color(LENS.color) },
    uRimLine: { value: LENS.rimLine },
    uRimLinePos: { value: LENS.rimLinePos },
    uRimLineWidth: { value: LENS.rimLineWidth },
    uVignette: { value: LENS.vignette },
    uVignetteSize: { value: LENS.vignetteSize },
    uSamples: { value: LENS.samples },
  };
  const lensMat = new THREE.ShaderMaterial({
    uniforms: lensUniforms,
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
  });
  const lensQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
  lensScene.add(lensQuad);

  function applyLook() {
    renderer.setClearColor(new THREE.Color(backgroundOf(wrapper)), 1);
    const active = sourceIndex(scroll);
    measurePanel();
    recomputeTotal();
    scroll = centerForIndex(active);
    target = scroll;
    lensUniforms.uAspect.value = W / H;
    lensUniforms.uSizeX.value = (narrow ? LENS.widthNarrow : LENS.width) * (W / H);
    lensUniforms.uSizeY.value = (narrow ? LENS.heightNarrow : LENS.height) * (W / H);
    lensUniforms.uRotation.value = ((narrow ? LENS.rotationNarrow : LENS.rotation) * Math.PI) / 180;
  }
  applyLook();

  let panelRects = [];
  let centeredPanel = null;

  function layout() {
    panelRects = [];
    centeredPanel = null;
    let centeredDist = Infinity;
    const half = W / 2;
    const buffer = panelH;

    pool.forEach((p, poolIdx) => {
      const rep = Math.floor(poolIdx / total);
      const i = p.srcIndex;
      const src = sources[i];

      let x = slotCenter(i) - scroll;
      x = ((x % totalWidth) + totalWidth) % totalWidth;
      x += (rep - Math.floor(MOTION.repeats / 2)) * totalWidth;
      if (x > half + totalWidth) x -= totalWidth * MOTION.repeats;

      const centerX = x;
      if (centerX < -half - buffer || centerX > half + buffer) {
        p.mesh.visible = false;
        return;
      }

      const shrink = 1 - 0.25 * scrollEnergy;
      const h = panelH * shrink;
      const w = src.aspect * panelH * shrink;

      if (src.tex && !p.bound) {
        p.mat.map = src.tex;
        p.mat.color.set(0xffffff);
        p.mat.needsUpdate = true;
        p.bound = true;
      }

      p.mesh.visible = true;
      p.mesh.position.set(centerX, 0, 0);
      p.mesh.scale.set(w, h, 1);

      const sx = centerX + W / 2;
      const sy = H / 2;
      panelRects.push({
        left: sx - w / 2,
        right: sx + w / 2,
        top: sy - h / 2,
        bottom: sy + h / 2,
        poolIdx,
        srcIndex: i,
        centerX,
      });

      if (Math.abs(centerX) < centeredDist) {
        centeredDist = Math.abs(centerX);
        centeredPanel = { srcIndex: i, poolIdx };
      }
    });
  }

  const el = mount;
  wrapper.setAttribute("data-glass-carousel-wheel", LENS.wheel);

  function rectOf(px, py) {
    const bounds = el.getBoundingClientRect();
    const x = px - bounds.left;
    const y = py - bounds.top;
    for (let i = 0; i < panelRects.length; i++) {
      const r = panelRects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r;
    }
    return null;
  }

  let dragging = false;
  let dragPointerId = null;
  let dragLastX = 0;
  let dragDist = 0;
  let dragVel = 0;
  let dragMoveT = 0;
  let suppressClick = false;
  let dragPointerType = "mouse";
  let lastPointerX = NaN;
  let lastPointerY = NaN;
  let pointerInside = false;
  let lastPointerType = "mouse";
  let pointerState = "";

  function setPointer(v) {
    if (v === pointerState) return;
    pointerState = v;
    wrapper.setAttribute("data-glass-carousel-pointer", v);
  }

  function setHover(on) {
    setPointer(dragging ? "grabbing" : on ? "grab" : "");
  }

  function refreshHover() {
    if (!pointerInside || lastPointerType !== "mouse") return;
    if (!Number.isFinite(lastPointerX)) return;
    setHover(rectOf(lastPointerX, lastPointerY) !== null);
  }

  function onWheel(e) {
    if (LENS.wheel === "off") return;
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (LENS.wheel === "horizontal" && !sideways) return;
    e.preventDefault();
    userInteracted = true;
    target += (sideways ? e.deltaX : e.deltaY) * MOTION.wheelSpeed;
    lastInput = performance.now();
    snapped = false;
  }

  function onPointerDown(e) {
    suppressClick = false;
    if (dragging) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragging = true;
    dragPointerId = e.pointerId;
    dragPointerType = e.pointerType || "mouse";
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    dragLastX = e.clientX;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragDist = 0;
    dragVel = 0;
    dragMoveT = performance.now();
    setHover(false);
    velocity = 0;
    userInteracted = true;
    snapped = false;
    lastInput = dragMoveT;
  }

  function onPointerMove(e) {
    if (dragging && e.pointerId === dragPointerId) {
      const sens = dragPointerType === "mouse" ? MOTION.dragSpeed : MOTION.touchSpeed;
      const dx = e.clientX - dragLastX;
      dragLastX = e.clientX;
      dragDist += Math.abs(dx);
      target -= dx * sens;
      dragVel = dragVel * 0.6 + -dx * sens * 0.4;
      dragMoveT = performance.now();
      lastInput = dragMoveT;
      snapped = false;
    }
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    lastPointerType = e.pointerType || "mouse";
    pointerInside = true;
    if (e.pointerType !== "mouse") return;
    setHover(rectOf(e.clientX, e.clientY) !== null);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    if (e && dragPointerId !== null && e.pointerId !== dragPointerId) return;
    dragging = false;
    if (dragPointerId !== null) {
      try {
        el.releasePointerCapture(dragPointerId);
      } catch {}
      dragPointerId = null;
    }
    velocity = performance.now() - dragMoveT > MOTION.flickIdle ? 0 : dragVel;
    dragVel = 0;
    lastInput = performance.now();
    snapped = false;
    suppressClick = dragDist > (dragPointerType === "mouse" ? MOTION.clickSlop : MOTION.touchClickSlop);
    if (dragPointerType === "mouse") setHover(rectOf(lastPointerX, lastPointerY) !== null);
    else setHover(false);
  }

  function onEnter(e) {
    pointerInside = true;
    lastPointerType = e.pointerType || "mouse";
  }

  function onLeave() {
    pointerInside = false;
    setHover(false);
  }

  function onClick(e) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const hit = rectOf(e.clientX, e.clientY);
    if (!hit) return;
    if (centeredPanel && hit.poolIdx === centeredPanel.poolIdx) {
      followLink(hit.srcIndex, e);
      return;
    }
    userInteracted = true;
    velocity = 0;
    target = centerForIndex(nearestIndex(scroll + hit.centerX));
    snapped = true;
    setHover(false);
  }

  function followLink(srcIndex, e) {
    const item = items[srcIndex];
    const link = item && (item.matches("a[href]") ? item : item.querySelector("a[href]"));
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || link.target === "_blank") {
      window.open(link.href, link.target || "_blank", "noopener");
      return;
    }
    link.click();
  }

  // The canvas is aria-hidden and can't take focus, so stepping lives on real buttons.
  function step(dir) {
    userInteracted = true;
    velocity = 0;
    target = centerForIndex(nearestIndex(target) + dir);
    snapped = true;
    lastInput = performance.now();
  }
  const onPrev = () => step(-1);
  const onNext = () => step(1);

  function showActive(index) {
    if (counterEl) {
      counterEl.textContent = `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
    }
    const content = items[index].querySelector("[data-glass-carousel-content]");
    if (captionEl && content) {
      captionEl.replaceChildren(content.cloneNode(true));
      captionEl.animate?.(
        [
          { transform: "translateY(25%)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
      );
    }
  }

  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("click", onClick);
  prevEl?.addEventListener("click", onPrev);
  nextEl?.addEventListener("click", onNext);

  let raf = 0;
  let running = false;
  let destroyed = false;

  function tick() {
    if (destroyed) return;
    if (!wrapper.isConnected) return destroy();
    if (!dragging) {
      target += velocity;
      velocity *= MOTION.friction;
      if (Math.abs(velocity) < 0.05) velocity = 0;

      if (!snapped && performance.now() - lastInput > MOTION.snapIdle) {
        target = centerForIndex(nearestIndex(scroll));
        snapped = true;
      }
    }

    const follow =
      dragging && dragPointerType !== "mouse" ? MOTION.touchEase : snapped ? MOTION.snapEase : MOTION.ease;
    scroll += (target - scroll) * follow;

    const ci = sourceIndex(scroll);
    if (ci !== lastCenter) {
      lastCenter = ci;
      showActive(ci);
    }

    const rawSpeed = scroll - prevScroll;
    prevScroll = scroll;
    const norm = Math.min(1, Math.abs(rawSpeed) / Math.max(1, MOTION.shrinkMax));
    const k = norm > scrollEnergy ? MOTION.shrinkAttack : MOTION.shrinkDecay;
    scrollEnergy += (norm - scrollEnergy) * k;

    layout();
    refreshHover();

    lensUniforms.uTime.value = performance.now() * 0.001;

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(lensScene, lensCam);

    raf = requestAnimationFrame(tick);
  }

  // A full-screen shader is wasteful when nobody can see it: only animate while on screen.
  function wake() {
    if (running || destroyed) return;
    running = true;
    raf = requestAnimationFrame(tick);
  }

  function sleep() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry && entry.isIntersecting) wake();
      else sleep();
    },
    { rootMargin: "200px 0px" }
  );
  visibility.observe(wrapper);

  function onResize() {
    const nextW = mount.clientWidth;
    const nextH = mount.clientHeight;
    if (!nextW || !nextH) return;
    W = nextW;
    H = nextH;
    renderer.setSize(W, H, false);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    rt.setSize(bufferW(), bufferH());
    lensUniforms.uRes.value.set(bufferW(), bufferH());
    narrow = W < LENS.narrowBreakpoint;
    applyLook();
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(mount);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    sleep();
    visibility.disconnect();
    resizeObserver.disconnect();
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.removeEventListener("click", onClick);
    prevEl?.removeEventListener("click", onPrev);
    nextEl?.removeEventListener("click", onNext);
    renderer.dispose();
    rt.dispose();
    lensQuad.geometry.dispose();
    lensMat.dispose();
    panelGeometry.dispose();
    pool.forEach((p) => p.mat.dispose());
    sources.forEach((s) => s.tex?.dispose());
    if (captionEl) captionEl.replaceChildren();
    wrapper.setAttribute("data-glass-carousel", "");
  }

  wrapper.setAttribute("data-glass-carousel", "canvas");
  bindTextures();
  showActive(0);
  wake();

  return { wrapper, destroy };
}

/* ---------------------------------------------------------------------------
   Boot
   Main.dc.html is rendered by its runtime (React) after this module runs, and
   that runtime may replace nodes later. So rather than a one-off
   DOMContentLoaded scan, watch the document for carousel sections appearing.
   Reduced motion: no canvas at all, the authored photo row stays as a normal
   scrollable, captioned list. Same if WebGL or three.js is unavailable.
   --------------------------------------------------------------------------- */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const instances = new Map(); // wrapper -> instance
let threePromise = null;

function loadThree() {
  if (!threePromise) {
    threePromise = import(THREE_URL).catch((err) => {
      console.warn("Glass carousel: three.js failed to load, keeping the plain photo row.", err);
      threePromise = null;
      throw err;
    });
  }
  return threePromise;
}

function prune() {
  for (const [wrapper, instance] of instances) {
    if (!wrapper.isConnected) {
      instance.destroy();
      instances.delete(wrapper);
    }
  }
}

async function initLiquidGlassCarousel() {
  prune();
  if (reducedMotion.matches) return;
  const pending = Array.from(document.querySelectorAll("[data-glass-carousel]")).filter(
    (w) => !instances.has(w) && w.getAttribute("data-glass-carousel") !== "canvas"
  );
  if (!pending.length) return;

  let THREE;
  try {
    THREE = await loadThree();
  } catch {
    return;
  }
  if (reducedMotion.matches) return;

  pending.forEach((wrapper) => {
    if (!wrapper.isConnected || instances.has(wrapper)) return;
    const instance = setupGlassCarousel(wrapper, THREE);
    if (instance) instances.set(wrapper, instance);
  });
}

function destroyAll() {
  for (const instance of instances.values()) instance.destroy();
  instances.clear();
}

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) destroyAll();
  else initLiquidGlassCarousel();
});

let scheduled = false;
const domWatcher = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    initLiquidGlassCarousel();
  });
});

function boot() {
  domWatcher.observe(document.body, { childList: true, subtree: true });
  initLiquidGlassCarousel();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

// For page transitions or manual re-init, as in the original snippet.
window.initLiquidGlassCarousel = initLiquidGlassCarousel;
