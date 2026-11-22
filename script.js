// ==========================================================================
// MayankZen Studios - Main Application Script
// Includes: Dual-Theme 3D WebGL Cyber City, Auth State, Dynamic UI
// ==========================================================================

import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Centralized 3D Hero Configuration
const HERO_3D_CONFIG = {
  camera: {
    fov: 58,
    near: 0.5,
    far: 450,
    baseX: 0,
    baseY: 26,
    baseZ: 68,
    lookAtY: 16,
    orbitAmpX: 11,
    orbitAmpY: 3.2,
    parallaxX: 14,
    parallaxY: 7,
    damping: 3.5
  },
  city: {
    towerCount: 64,
    spreadX: 190,
    spreadZ: 185,
    corridorHalfWidth: 16,
    corridorMinZ: 14,
    starCount: 720
  },
  themes: {
    dark: {
      fogColor: 0x0a0e17,
      fogDensity: 0.0068,
      exposure: 1.15,
      envIntensity: 0.55,
      hemiSky: 0x6366f1,
      hemiGround: 0x090d16,
      hemiIntensity: 1.15,
      keyColor: 0xe0e7ff,
      keyIntensity: 1.35,
      rimColor: 0x10b981,
      rimIntensity: 0.95,
      purpleLight: { color: 0x8b5cf6, intensity: 420 },
      greenLight: { color: 0x10b981, intensity: 360 },
      cyanLight: { color: 0x38bdf8, intensity: 280 },
      groundColor: 0x070b14,
      groundOpacity: 0.72,
      towerPalette: [0x1e293b, 0x1e1b4b, 0x0f172a, 0x312e81, 0x132a2e, 0x261c47],
      crownPalette: [0x334155, 0x4338ca, 0x0f766e, 0x4c1d95, 0x1d4ed8, 0x3730a3],
      accentPalette: [0x8b5cf6, 0x10b981, 0x38bdf8, 0xa855f7],
      towerRoughness: 0.32,
      towerMetalness: 0.78,
      crownRoughness: 0.22,
      crownMetalness: 0.85,
      emissiveIntensity: 0.42,
      beaconIntensity: 1.35,
      starColor: 0xc4b5fd,
      starSize: 2.3,
      starOpacity: 0.85,
      ring1: { color: 0x8b5cf6, opacity: 0.52 },
      ring2: { color: 0x10b981, opacity: 0.44 },
      coreColor: 0x38bdf8,
      coreOpacity: 0.36
    },
    light: {
      fogColor: 0xf4f7fb,
      fogDensity: 0.0052,
      exposure: 1.04,
      envIntensity: 0.75,
      hemiSky: 0xffffff,
      hemiGround: 0xcbd5e1,
      hemiIntensity: 1.45,
      keyColor: 0xffffff,
      keyIntensity: 1.6,
      rimColor: 0x7c3aed,
      rimIntensity: 0.85,
      purpleLight: { color: 0x7c3aed, intensity: 280 },
      greenLight: { color: 0x059669, intensity: 240 },
      cyanLight: { color: 0x0284c7, intensity: 220 },
      groundColor: 0xe2e8f0,
      groundOpacity: 0.45,
      towerPalette: [0x6366f1, 0x7c3aed, 0x0ea5e9, 0x64748b, 0x8b5cf6, 0x475569],
      crownPalette: [0x4f46e5, 0x059669, 0x0284c7, 0x6d28d9, 0x334155, 0x0d9488],
      accentPalette: [0x7c3aed, 0x059669, 0x0284c7, 0x4f46e5],
      towerRoughness: 0.28,
      towerMetalness: 0.45,
      crownRoughness: 0.2,
      crownMetalness: 0.58,
      emissiveIntensity: 0.22,
      beaconIntensity: 0.9,
      starColor: 0x4f46e5,
      starSize: 2.5,
      starOpacity: 0.75,
      ring1: { color: 0x6d28d9, opacity: 0.45 },
      ring2: { color: 0x059669, opacity: 0.4 },
      coreColor: 0x0284c7,
      coreOpacity: 0.34
    }
  }
};

// 3D Cyber City Hero Scene State
let scene = null;
let camera = null;
let renderer = null;
let isSoftwareGl = false;
let clock = null;
let towers = [];
let stars = null;
let rings = [];
let gyroCore = null;
let gridDark = null;
let gridLight = null;
let groundPlane = null;
let hemiLight = null;
let keyLight = null;
let rimLight = null;
let purpleLight = null;
let greenLight = null;
let cyanLight = null;
let facadeTexDark = null;
let facadeTexLight = null;
let starSpriteTex = null;
let targetMouseX = 0;
let targetMouseY = 0;
let isTabVisible = !document.hidden;
let isHeroInView = true;
let isContextLost = false;
let animFrameId = 0;
let isLoopScheduled = false;

// Reusable math objects (zero GC allocations inside render loop)
const _lookAtTarget = new THREE.Vector3(0, HERO_3D_CONFIG.camera.lookAtY, 0);

function detectSoftwareWebGL() {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch (e) {
    return false;
  }
}

function getIsLightTheme() {
  if (window.MayankZenTheme && typeof window.MayankZenTheme.isLight === 'function') {
    return window.MayankZenTheme.isLight();
  }
  return document.documentElement.getAttribute('data-theme') === 'light' ||
         document.documentElement.classList.contains('light-mode');
}

// Procedural skyscraper facade window texture (zero external 404 assets)
function createFacadeTexture(mode, maxAnisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const isLight = mode === 'light';
  ctx.fillStyle = isLight ? '#dbe4f0' : '#0d1424';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle architectural panel seams
  ctx.strokeStyle = isLight ? 'rgba(51, 65, 85, 0.16)' : 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  // Lit & reflective window bays
  const cols = 8;
  const rows = 24;
  const padX = 5;
  const padY = 5;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  const darkGlows = ['#a78bfa', '#34d399', '#38bdf8', '#c4b5fd'];
  const lightGlass = ['#ffffff', '#e0e7ff', '#d1fae5', '#bae6fd'];

  let seed = isLight ? 4217 : 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let r = 0; r < rows; r++) {
    const floorLitBias = nextRand() > 0.25 ? 0.58 : 0.22;
    for (let c = 0; c < cols; c++) {
      const lit = nextRand() < floorLitBias;
      if (lit) {
        const palette = isLight ? lightGlass : darkGlows;
        ctx.fillStyle = palette[Math.floor(nextRand() * palette.length)];
        ctx.globalAlpha = isLight ? 0.85 : (0.45 + nextRand() * 0.5);
      } else {
        ctx.fillStyle = isLight ? '#94a3b8' : '#172036';
        ctx.globalAlpha = isLight ? 0.45 : 0.65;
      }
      ctx.fillRect(
        c * cellW + padX,
        r * cellH + padY,
        cellW - padX * 2,
        cellH - padY * 2
      );
    }
  }
  ctx.globalAlpha = 1.0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

// Soft circular particle sprite so energy motes look luminous instead of hard squares
function createStarSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyThemeTo3D(isLight) {
  if (!scene || !renderer) return;

  const t = isLight ? HERO_3D_CONFIG.themes.light : HERO_3D_CONFIG.themes.dark;

  renderer.toneMappingExposure = t.exposure;
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity = t.envIntensity;
  }

  if (scene.fog) {
    scene.fog.color.setHex(t.fogColor);
    scene.fog.density = t.fogDensity;
  }

  if (hemiLight) {
    hemiLight.color.setHex(t.hemiSky);
    hemiLight.groundColor.setHex(t.hemiGround);
    hemiLight.intensity = t.hemiIntensity;
  }
  if (keyLight) {
    keyLight.color.setHex(t.keyColor);
    keyLight.intensity = t.keyIntensity;
  }
  if (rimLight) {
    rimLight.color.setHex(t.rimColor);
    rimLight.intensity = t.rimIntensity;
  }
  if (purpleLight) {
    purpleLight.color.setHex(t.purpleLight.color);
    purpleLight.intensity = t.purpleLight.intensity;
  }
  if (greenLight) {
    greenLight.color.setHex(t.greenLight.color);
    greenLight.intensity = t.greenLight.intensity;
  }
  if (cyanLight) {
    cyanLight.color.setHex(t.cyanLight.color);
    cyanLight.intensity = t.cyanLight.intensity;
  }

  if (gridDark && gridLight) {
    gridDark.visible = !isLight;
    gridLight.visible = isLight;
  }

  if (groundPlane && groundPlane.material) {
    groundPlane.material.color.setHex(t.groundColor);
    groundPlane.material.opacity = t.groundOpacity;
    groundPlane.material.needsUpdate = true;
  }

  if (stars && stars.material) {
    stars.material.color.setHex(t.starColor);
    stars.material.size = t.starSize;
    stars.material.opacity = t.starOpacity;
    stars.material.needsUpdate = true;
  }

  const activeFacadeTex = isLight ? facadeTexLight : facadeTexDark;
  for (let i = 0; i < towers.length; i++) {
    const tower = towers[i];
    const ud = tower.userData;
    const baseColor = t.towerPalette[ud.paletteIdx % t.towerPalette.length];
    const crownColor = t.crownPalette[ud.paletteIdx % t.crownPalette.length];
    const accentColor = t.accentPalette[ud.accentIdx % t.accentPalette.length];

    if (ud.shaftMat) {
      ud.shaftMat.color.setHex(baseColor);
      ud.shaftMat.roughness = t.towerRoughness;
      ud.shaftMat.metalness = t.towerMetalness;
      if (!ud.isWire) {
        ud.shaftMat.map = activeFacadeTex;
        ud.shaftMat.emissive.setHex(accentColor);
        ud.shaftMat.emissiveMap = activeFacadeTex;
        ud.shaftMat.emissiveIntensity = t.emissiveIntensity;
      }
      ud.shaftMat.needsUpdate = true;
    }

    if (ud.crownMat) {
      ud.crownMat.color.setHex(crownColor);
      ud.crownMat.roughness = t.crownRoughness;
      ud.crownMat.metalness = t.crownMetalness;
      ud.crownMat.needsUpdate = true;
    }

    if (ud.beaconMat) {
      ud.beaconMat.color.setHex(accentColor);
      ud.beaconMat.emissive.setHex(accentColor);
      ud.beaconMat.emissiveIntensity = t.beaconIntensity;
      ud.beaconMat.needsUpdate = true;
    }
  }

  if (rings[0] && rings[0].material) {
    rings[0].material.color.setHex(t.ring1.color);
    rings[0].material.opacity = t.ring1.opacity;
  }
  if (rings[1] && rings[1].material) {
    rings[1].material.color.setHex(t.ring2.color);
    rings[1].material.opacity = t.ring2.opacity;
  }
  if (gyroCore && gyroCore.material) {
    gyroCore.material.color.setHex(t.coreColor);
    gyroCore.material.opacity = t.coreOpacity;
  }
}

function init3DCity() {
  const canvas = document.getElementById('hero3d');
  if (!canvas || renderer) return;

  try {
    const container = canvas.parentElement || document.body;
    const initialWidth = Math.max(container.clientWidth || window.innerWidth, 1);
    const initialHeight = Math.max(container.clientHeight || window.innerHeight, 1);
    const isLightInitial = getIsLightTheme();
    const initialTheme = isLightInitial ? HERO_3D_CONFIG.themes.light : HERO_3D_CONFIG.themes.dark;

    isSoftwareGl = detectSoftwareWebGL();
    clock = new THREE.Clock();

    // 1. Scene & Atmospheric Horizon Fog
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(initialTheme.fogColor, initialTheme.fogDensity);

    // 2. Camera
    const camCfg = HERO_3D_CONFIG.camera;
    camera = new THREE.PerspectiveCamera(
      camCfg.fov,
      initialWidth / initialHeight,
      camCfg.near,
      camCfg.far
    );
    camera.position.set(camCfg.baseX, camCfg.baseY, camCfg.baseZ);
    camera.lookAt(_lookAtTarget);

    // 3. Modern WebGLRenderer (r186+ color pipeline & software WebGL guard)
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = initialTheme.exposure;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight, false);

    // 4. Procedural Studio Environment Reflection Map (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity = initialTheme.envIntensity;
    }
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 5. Physically Calibrated 3-Point + Accent Lighting Rig
    hemiLight = new THREE.HemisphereLight(
      initialTheme.hemiSky,
      initialTheme.hemiGround,
      initialTheme.hemiIntensity
    );
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    keyLight = new THREE.DirectionalLight(initialTheme.keyColor, initialTheme.keyIntensity);
    keyLight.position.set(55, 95, 65);
    scene.add(keyLight);

    rimLight = new THREE.DirectionalLight(initialTheme.rimColor, initialTheme.rimIntensity);
    rimLight.position.set(-70, 50, -60);
    scene.add(rimLight);

    // Controlled decay (1.2) so accent point lights wash across the architectural skyline
    purpleLight = new THREE.PointLight(
      initialTheme.purpleLight.color,
      initialTheme.purpleLight.intensity,
      240,
      1.2
    );
    purpleLight.position.set(-42, 48, 22);
    scene.add(purpleLight);

    greenLight = new THREE.PointLight(
      initialTheme.greenLight.color,
      initialTheme.greenLight.intensity,
      240,
      1.2
    );
    greenLight.position.set(42, 46, -24);
    scene.add(greenLight);

    cyanLight = new THREE.PointLight(
      initialTheme.cyanLight.color,
      initialTheme.cyanLight.intensity,
      220,
      1.2
    );
    cyanLight.position.set(0, 58, 32);
    scene.add(cyanLight);

    // 6. Dual-Theme Ground Grid & Subtle Ground Plane (offset Y = -0.05 to avoid Z-fighting)
    const groundGeo = new THREE.PlaneGeometry(340, 340);
    const groundMat = new THREE.MeshStandardMaterial({
      color: initialTheme.groundColor,
      roughness: 0.78,
      metalness: 0.25,
      transparent: true,
      opacity: initialTheme.groundOpacity,
      depthWrite: false
    });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.05;
    scene.add(groundPlane);

    gridDark = new THREE.GridHelper(280, 56, 0x8b5cf6, 0x1e293b);
    gridDark.position.y = 0;
    gridDark.visible = !isLightInitial;
    scene.add(gridDark);

    gridLight = new THREE.GridHelper(280, 56, 0x7c3aed, 0x94a3b8);
    gridLight.position.y = 0;
    gridLight.visible = isLightInitial;
    scene.add(gridLight);

    // 7. Procedural Facade & Particle Textures
    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy() || 1, 8);
    facadeTexDark = createFacadeTexture('dark', maxAnisotropy);
    facadeTexLight = createFacadeTexture('light', maxAnisotropy);
    starSpriteTex = createStarSpriteTexture();

    // 8. Composite 3-Part Procedural Architectural Towers (Shaft + Crown + Accent Beacon)
    towers = [];
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const spireGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
    const cityCfg = HERO_3D_CONFIG.city;

    // Deterministic pseudo-random generator for balanced, repeatable skyline composition
    let seed = 90210;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < cityCfg.towerCount; i++) {
      let px = 0;
      let pz = 0;
      let attempts = 0;
      do {
        px = (rand() - 0.5) * cityCfg.spreadX;
        pz = (rand() - 0.5) * cityCfg.spreadZ - 12;
        attempts++;
      } while (
        Math.abs(px) < cityCfg.corridorHalfWidth &&
        pz > cityCfg.corridorMinZ &&
        attempts < 25
      );

      const width = 3.8 + rand() * 5.6;
      const depth = 3.8 + rand() * 5.6;
      const distFactor = Math.min(Math.hypot(px, pz) / 95, 1);
      const height = 13 + rand() * 34 + distFactor * 12;
      const crownHeight = 2.2 + rand() * 5.2;
      const isWire = i % 11 === 0;
      const paletteIdx = i;
      const accentIdx = i % initialTheme.accentPalette.length;

      const towerGroup = new THREE.Group();
      towerGroup.position.set(px, 0, pz);

      const baseColor = initialTheme.towerPalette[paletteIdx % initialTheme.towerPalette.length];
      const crownColor = initialTheme.crownPalette[paletteIdx % initialTheme.crownPalette.length];
      const accentColor = initialTheme.accentPalette[accentIdx];

      // Primary silhouette: Main architectural tower shaft
      const shaftMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: initialTheme.towerRoughness,
        metalness: initialTheme.towerMetalness,
        wireframe: isWire,
        map: isWire ? null : (isLightInitial ? facadeTexLight : facadeTexDark),
        emissive: isWire ? new THREE.Color(0x000000) : new THREE.Color(accentColor),
        emissiveMap: isWire ? null : (isLightInitial ? facadeTexLight : facadeTexDark),
        emissiveIntensity: isWire ? 0 : initialTheme.emissiveIntensity
      });
      const shaft = new THREE.Mesh(unitBoxGeo, shaftMat);
      shaft.scale.set(width, height, depth);
      shaft.position.y = height / 2;
      towerGroup.add(shaft);

      // Secondary read: Stepped architectural penthouse crown
      const crownMat = new THREE.MeshStandardMaterial({
        color: crownColor,
        roughness: initialTheme.crownRoughness,
        metalness: initialTheme.crownMetalness,
        wireframe: isWire
      });
      const crown = new THREE.Mesh(unitBoxGeo, crownMat);
      crown.scale.set(width * 0.68, crownHeight, depth * 0.68);
      crown.position.y = height + crownHeight / 2;
      towerGroup.add(crown);

      // Accent detail: Illuminated roof trim band + spire on taller towers
      const beaconMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: initialTheme.beaconIntensity,
        roughness: 0.2,
        metalness: 0.4
      });
      const trimBand = new THREE.Mesh(unitBoxGeo, beaconMat);
      trimBand.scale.set(width * 0.74, 0.42, depth * 0.74);
      trimBand.position.y = height + crownHeight + 0.21;
      towerGroup.add(trimBand);

      if (height > 30) {
        const spireHeight = 4 + rand() * 5;
        const spire = new THREE.Mesh(spireGeo, beaconMat);
        spire.scale.set(1, spireHeight, 1);
        spire.position.y = height + crownHeight + 0.42 + spireHeight / 2;
        towerGroup.add(spire);
      }

      towerGroup.userData = {
        paletteIdx,
        accentIdx,
        isWire,
        shaftMat,
        crownMat,
        beaconMat,
        baseY: 0,
        floatSpeed: 0.45 + rand() * 0.45,
        floatOffset: rand() * Math.PI * 2,
        floatAmp: 0.35 + rand() * 0.45
      };

      scene.add(towerGroup);
      towers.push(towerGroup);
    }

    // 9. Quantum Energy Motes / Star Field
    const starGeo = new THREE.BufferGeometry();
    const starCount = cityCfg.starCount;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (rand() - 0.5) * 300;
      starPositions[i + 1] = rand() * 115 + 8;
      starPositions[i + 2] = (rand() - 0.5) * 300;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: initialTheme.starColor,
      map: starSpriteTex,
      size: initialTheme.starSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: initialTheme.starOpacity,
      depthWrite: false
    });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 10. Central Holographic Gyro Assembly
    rings = [];
    const gyroCenterY = 36;
    const gyroCenterZ = -26;

    const ringGeo1 = new THREE.TorusGeometry(26, 0.34, 14, 96);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: initialTheme.ring1.color,
      wireframe: true,
      transparent: true,
      opacity: initialTheme.ring1.opacity
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.position.set(0, gyroCenterY, gyroCenterZ);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);
    rings.push(ring1);

    const ringGeo2 = new THREE.TorusGeometry(35, 0.28, 14, 96);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: initialTheme.ring2.color,
      wireframe: true,
      transparent: true,
      opacity: initialTheme.ring2.opacity
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.position.set(0, gyroCenterY, gyroCenterZ);
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);
    rings.push(ring2);

    const coreGeo = new THREE.OctahedronGeometry(7.5, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: initialTheme.coreColor,
      wireframe: true,
      transparent: true,
      opacity: initialTheme.coreOpacity
    });
    gyroCore = new THREE.Mesh(coreGeo, coreMat);
    gyroCore.position.set(0, gyroCenterY, gyroCenterZ);
    scene.add(gyroCore);

    // 11. Interactive Pointer Parallax (Mouse & Touch Friendly)
    window.addEventListener('pointermove', (e) => {
      targetMouseX = (e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      targetMouseY = (e.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
    }, { passive: true });

    // 12. Live Theme Sync (CustomEvent & DOM MutationObserver)
    window.addEventListener('themeChanged', (e) => {
      const isLight = e.detail && typeof e.detail.isLight === 'boolean'
        ? e.detail.isLight
        : getIsLightTheme();
      applyThemeTo3D(isLight);
    });

    try {
      const themeObserver = new MutationObserver(() => {
        applyThemeTo3D(getIsLightTheme());
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class']
      });
    } catch (e) {
      // Ignore if MutationObserver is unavailable
    }

    // 13. WebGL Context Loss & Restoration Recovery
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      isContextLost = true;
      cancelScheduledFrame();
    }, false);

    canvas.addEventListener('webglcontextrestored', () => {
      isContextLost = false;
      applyThemeTo3D(getIsLightTheme());
      scheduleNextFrame();
    }, false);

    // 14. Frame Pacing (Software WebGL FenceSync vs Hardware rAF)
    function cancelScheduledFrame() {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        clearTimeout(animFrameId);
        animFrameId = 0;
      }
      isLoopScheduled = false;
    }

    function afterDraw(cb) {
      const gl = renderer.getContext();
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            animFrameId = window.setTimeout(poll, 8);
          } else {
            if (sync) gl.deleteSync(sync);
            animFrameId = window.setTimeout(cb, 80);
          }
        };
        animFrameId = window.setTimeout(poll, 8);
      } else {
        animFrameId = window.setTimeout(cb, 80);
      }
    }

    function shouldAnimate() {
      return isTabVisible && isHeroInView && !isContextLost && Boolean(renderer);
    }

    function scheduleNextFrame() {
      if (isLoopScheduled || !shouldAnimate()) return;
      isLoopScheduled = true;
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        animFrameId = requestAnimationFrame(tick);
      }
    }

    let elapsed = 0;
    function tick() {
      isLoopScheduled = false;
      if (!shouldAnimate()) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;

      // Subtle architectural breathing on towers
      for (let i = 0; i < towers.length; i++) {
        const tower = towers[i];
        const ud = tower.userData;
        tower.position.y = ud.baseY + Math.sin(elapsed * ud.floatSpeed + ud.floatOffset) * ud.floatAmp;
      }

      // Orbit accent lights gently for dynamic metallic reflections
      if (purpleLight) {
        purpleLight.position.x = -42 + Math.sin(elapsed * 0.35) * 14;
        purpleLight.position.z = 22 + Math.cos(elapsed * 0.3) * 14;
      }
      if (greenLight) {
        greenLight.position.x = 42 + Math.cos(elapsed * 0.32) * 14;
        greenLight.position.z = -24 + Math.sin(elapsed * 0.28) * 14;
      }

      // Constellation drift
      if (stars) {
        stars.rotation.y = elapsed * 0.018;
      }

      // Holographic gyro assembly rotation
      if (rings[0]) {
        rings[0].rotation.z = elapsed * 0.16;
        rings[0].rotation.x = Math.PI / 3 + Math.sin(elapsed * 0.25) * 0.12;
      }
      if (rings[1]) {
        rings[1].rotation.z = -elapsed * 0.12;
        rings[1].rotation.y = Math.PI / 4 + Math.cos(elapsed * 0.28) * 0.12;
      }
      if (gyroCore) {
        gyroCore.rotation.y = elapsed * 0.32;
        gyroCore.rotation.x = elapsed * 0.18;
      }

      // Frame-rate independent damped camera orbit & pointer parallax
      const desiredX = camCfg.baseX + Math.sin(elapsed * 0.18) * camCfg.orbitAmpX + targetMouseX * camCfg.parallaxX;
      const desiredY = camCfg.baseY + Math.cos(elapsed * 0.22) * camCfg.orbitAmpY - targetMouseY * camCfg.parallaxY;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, camCfg.damping, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, camCfg.damping, delta);
      camera.lookAt(_lookAtTarget);

      renderer.render(scene, camera);
      scheduleNextFrame();
    }

    // Pre-warm shaders on hardware GPUs and render initial frame immediately
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    renderer.render(scene, camera);
    scheduleNextFrame();

    // 15. Responsive Container Sizing (ResizeObserver + Window Fallback)
    const handleResize = () => {
      if (!camera || !renderer || !canvas) return;
      const p = canvas.parentElement || document.body;
      const w = Math.max(p.clientWidth || window.innerWidth, 1);
      const h = Math.max(p.clientHeight || window.innerHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      if (shouldAnimate()) {
        renderer.render(scene, camera);
      }
    };

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      window.setTimeout(handleResize, 150);
    });

    // 16. Pause Rendering Off-Screen or When Tab Is Hidden
    if (typeof IntersectionObserver !== 'undefined') {
      const heroObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        isHeroInView = Boolean(entry && entry.isIntersecting);
        if (isHeroInView && isTabVisible) {
          clock.getDelta();
          scheduleNextFrame();
        } else {
          cancelScheduledFrame();
        }
      }, { threshold: 0.02 });
      heroObserver.observe(container);
    }

    document.addEventListener('visibilitychange', () => {
      isTabVisible = !document.hidden;
      if (isTabVisible && isHeroInView) {
        clock.getDelta();
        scheduleNextFrame();
      } else {
        cancelScheduledFrame();
      }
    });

  } catch (err) {
    console.warn('MayankZen 3D scene initialization note:', err);
  }
}

// Typing Effect for Hero
function typeWriter(element, words, delay = 100) {
  let wordIdx = 0;
  let charIdx = 0;
  let isDeleting = false;

  function loop() {
    const currentWord = words[wordIdx];
    if (isDeleting) {
      element.innerHTML = currentWord.substring(0, charIdx - 1);
      charIdx--;
    } else {
      element.innerHTML = currentWord.substring(0, charIdx + 1);
      charIdx++;
    }

    let speed = delay;
    if (isDeleting) speed /= 2;

    if (!isDeleting && charIdx === currentWord.length) {
      speed = 2000;
      isDeleting = true;
    } else if (isDeleting && charIdx === 0) {
      isDeleting = false;
      wordIdx = (wordIdx + 1) % words.length;
      speed = 500;
    }

    setTimeout(loop, speed);
  }
  loop();
}

// Global Auth State
onAuthStateChanged(auth, (user) => {
  const authLinks = document.querySelectorAll('.auth-link');
  const navList = document.querySelector('nav ul');

  // Remove existing dynamic auth items
  const existingDynamic = document.querySelectorAll('.dynamic-auth');
  existingDynamic.forEach(el => el.remove());

  if (user) {
    authLinks.forEach(link => link.style.display = 'none');
    
    if (navList) {
      const emailLower = (user.email || '').toLowerCase().trim();
      const isStudioAdmin = emailLower === 'admin@mayankzen.in' || emailLower === 'mayank198010@gmail.com';
      const item = document.createElement('li');
      item.className = 'dynamic-auth';
      item.innerHTML = `
        <a href="/dashboard/" style="color: var(--accent-green); font-weight: 600;"><i class="fa-solid fa-user"></i> Dashboard</a>
      `;
      navList.appendChild(item);

      if (isStudioAdmin) {
        const adminItem = document.createElement('li');
        adminItem.className = 'dynamic-auth';
        adminItem.innerHTML = `
          <a href="/admin.html" style="color: #fbbf24; font-weight: 600;"><i class="fa-solid fa-shield"></i> Admin</a>
        `;
        navList.appendChild(adminItem);
      }
    }
  } else {
    authLinks.forEach(link => link.style.display = 'inline-block');
  }
});

// App Initialization Handler (Guaranteed to execute whether DOM is ready or loading)
function initApp() {
  // Mobile Nav Toggle & Auto-close on link click
  const menuBtn = document.getElementById('menuBtn');
  const navMenu = document.getElementById('navMenu');
  if (menuBtn && navMenu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navMenu.classList.toggle('show');
    });

    // Auto-close when clicking any link
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('show');
      });
    });

    // Auto-close when clicking outside
    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !menuBtn.contains(e.target)) {
        navMenu.classList.remove('show');
      }
    });
  }

  // Navbar Scroll Glass Effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // Initialize 3D City Scene
  init3DCity();

  // Typing Effect
  const typingEl = document.querySelector('.typing');
  if (typingEl) {
    typeWriter(typingEl, [
      'MayankZen Studios',
      'Where Code Meets Creativity',
      'Futuristic 3D Web Experiences',
      'Intelligent AI Automations',
      'High-Impact Digital Solutions'
    ], 90);
  }
}

// Trigger setup immediately if DOM is ready, or wait for event
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Window load safety net
window.addEventListener('load', () => {
  if (!renderer) {
    init3DCity();
  }
});
