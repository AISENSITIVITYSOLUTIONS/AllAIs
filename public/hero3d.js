// AllAIs · Esfera neuronal 3D del estado inicial.
// Red de nodos y sinapsis con niebla de profundidad, núcleo contrarrotante
// y pulsos de señal. Se renderiza solo mientras el estado inicial es visible.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js";

const host = document.getElementById("heroCanvas");

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function isDarkTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function fibonacciSphere(count, radius) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const jitter = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.06;
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius * jitter));
  }
  return points;
}

function buildEdges(points, neighbours) {
  const edges = [];
  const seen = new Set();
  const adjacency = points.map(() => []);
  points.forEach((point, index) => {
    const nearest = points
      .map((other, otherIndex) => ({ otherIndex, distance: point.distanceToSquared(other) }))
      .filter((item) => item.otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, neighbours);
    for (const { otherIndex } of nearest) {
      const key = index < otherIndex ? `${index}-${otherIndex}` : `${otherIndex}-${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([index, otherIndex]);
      adjacency[index].push(otherIndex);
      adjacency[otherIndex].push(index);
    }
  });
  return { edges, adjacency };
}

function dotTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function start() {
  if (!host) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    document.documentElement.classList.add("no-webgl");
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
  camera.position.set(0, 0, 4.2);
  scene.fog = new THREE.Fog(0xffffff, 3.3, 5.4);

  const world = new THREE.Group();
  world.rotation.x = 0.32;
  scene.add(world);

  // Capa externa: nodos y sinapsis.
  const points = fibonacciSphere(170, 1);
  const { edges, adjacency } = buildEdges(points, 3);

  const nodeGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const sprite = dotTexture();
  const nodeMaterial = new THREE.PointsMaterial({ size: 0.065, map: sprite, transparent: true, depthWrite: false, sizeAttenuation: true, fog: true });
  const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
  world.add(nodes);

  const linePositions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], index) => {
    linePositions.set([points[a].x, points[a].y, points[a].z, points[b].x, points[b].y, points[b].z], index * 6);
  });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, fog: true });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  world.add(lines);

  // Núcleo: icosaedro facetado contrarrotante.
  const core = new THREE.Group();
  const coreGeometry = new THREE.IcosahedronGeometry(0.42, 1);
  const coreFill = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.1, depthWrite: false, fog: true }));
  const coreWire = new THREE.LineSegments(new THREE.WireframeGeometry(coreGeometry), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, fog: true }));
  core.add(coreFill, coreWire);
  world.add(core);

  // Órbita: anillo fino inclinado.
  const ringCurve = new THREE.EllipseCurve(0, 0, 1.28, 1.28, 0, Math.PI * 2);
  const ringGeometry = new THREE.BufferGeometry().setFromPoints(ringCurve.getPoints(160).map((p) => new THREE.Vector3(p.x, 0, p.y)));
  const ring = new THREE.LineLoop(ringGeometry, new THREE.LineDashedMaterial({ dashSize: 0.04, gapSize: 0.05, transparent: true, opacity: 0.45, fog: true }));
  ring.computeLineDistances();
  ring.rotation.set(0.5, 0, -0.35);
  world.add(ring);

  // Pulsos de señal que recorren la red.
  const pulseMaterial = new THREE.PointsMaterial({ size: 0.12, map: sprite, transparent: true, depthWrite: false, fog: true });
  const pulseCount = 7;
  const pulsePositions = new Float32Array(pulseCount * 3);
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
  const pulseLayer = new THREE.Points(pulseGeometry, pulseMaterial);
  world.add(pulseLayer);
  const pulses = Array.from({ length: pulseCount }, (_, index) => {
    const from = Math.floor((index / pulseCount) * points.length);
    return { from, to: adjacency[from][0], t: Math.random(), speed: 0.6 + Math.random() * 0.6 };
  });
  const scratch = new THREE.Vector3();

  function applyTheme() {
    const dark = isDarkTheme();
    const ground = new THREE.Color(cssVar("--ground", dark ? "#0c1620" : "#edf1f5"));
    scene.fog.color.copy(ground);
    nodeMaterial.color.set(dark ? "#8fd4e8" : "#176b87");
    lineMaterial.color.set(dark ? "#4f93ad" : "#5f8aa3");
    lineMaterial.opacity = dark ? 0.38 : 0.42;
    coreFill.material.color.set(dark ? "#5cb8d3" : "#17324d");
    coreWire.material.color.set(dark ? "#a9dbea" : "#17324d");
    coreWire.material.opacity = dark ? 0.55 : 0.4;
    ring.material.color.set(dark ? "#5cb8d3" : "#176b87");
    pulseMaterial.color.set(dark ? "#e6f7fc" : "#0f5a73");
    const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    for (const material of [nodeMaterial, pulseMaterial, lineMaterial]) {
      material.blending = blending;
      material.needsUpdate = true;
    }
    render();
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  }

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (event) => {
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function updatePulses(delta) {
    pulses.forEach((pulse, index) => {
      pulse.t += delta * pulse.speed;
      if (pulse.t >= 1) {
        pulse.t = 0;
        const options = adjacency[pulse.to].filter((next) => next !== pulse.from);
        pulse.from = pulse.to;
        pulse.to = options[Math.floor(Math.random() * options.length)] ?? adjacency[pulse.to][0];
      }
      scratch.lerpVectors(points[pulse.from], points[pulse.to], pulse.t);
      pulsePositions.set([scratch.x, scratch.y, scratch.z], index * 3);
    });
    pulseGeometry.attributes.position.needsUpdate = true;
  }

  function render() {
    renderer.render(scene, camera);
  }

  let frame = 0;
  let last = performance.now();

  function shouldAnimate() {
    return document.body.classList.contains("is-empty") && !document.hidden && !reducedMotion.matches;
  }

  function tick(now) {
    frame = 0;
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    world.rotation.y += delta * 0.12;
    world.rotation.x = 0.32 + pointer.y * 0.18;
    world.rotation.z = pointer.x * -0.08;
    camera.position.x = pointer.x * 0.25;
    camera.lookAt(0, 0, 0);
    core.rotation.y -= delta * 0.35;
    core.rotation.x += delta * 0.18;
    ring.rotation.z += delta * 0.05;
    updatePulses(delta);
    render();
    schedule();
  }

  function schedule() {
    if (!frame && shouldAnimate()) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  new ResizeObserver(resize).observe(host);
  new MutationObserver(() => { applyTheme(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  reducedMotion.addEventListener("change", schedule);
  document.addEventListener("visibilitychange", schedule);

  updatePulses(0);
  resize();
  applyTheme();
  host.classList.add("is-ready");
  schedule();
}

start();
