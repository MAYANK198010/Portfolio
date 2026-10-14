// ==========================================================================
// MayankZen Studios - Main Application Script
// Includes: Dual-Theme 3D WebGL Cyber City, Auth State, Dynamic UI
// ==========================================================================

import * as THREE from '/vendor/three.module.js';
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// 3D Cyber City Hero Scene State
let scene, camera, renderer;
let buildings = [];
let stars = null;
let rings = [];
let gridDark = null;
let gridLight = null;
let ambientLight = null;
let hemiLight = null;
let purpleLight = null;
let greenLight = null;
let cyanLight = null;
let mouseX = 0, mouseY = 0;
let isAnimationRunning = true;
let animFrameId = null;

// Palette definitions for dark vs clean light mode
const darkPalette = [0x8b5cf6, 0x10b981, 0x3b82f6, 0x1e293b, 0x0f172a, 0x6366f1, 0x2e1065, 0x064e3b];
const lightPalette = [0x8b5cf6, 0x10b981, 0x3b82f6, 0xf1f5f9, 0xe2e8f0, 0xc4b5fd, 0xa7f3d0, 0xbae6fd];

function applyThemeTo3D(isLight) {
  if (!scene) return;

  // Fog adaptation
  if (scene.fog) {
    scene.fog.color.setHex(isLight ? 0xf8fafc : 0x0a0e17);
  }

  // Ambient & Hemisphere lighting
  if (ambientLight) {
    ambientLight.color.setHex(isLight ? 0xffffff : 0x241e38);
    ambientLight.intensity = isLight ? 2.5 : 1.4;
  }
  if (hemiLight) {
    hemiLight.color.setHex(isLight ? 0xffffff : 0x38bdf8);
    hemiLight.groundColor.setHex(isLight ? 0xe2e8f0 : 0x0a0e17);
    hemiLight.intensity = isLight ? 1.6 : 0.8;
  }

  // Dynamic Point Lights
  if (purpleLight) {
    purpleLight.color.setHex(isLight ? 0x7c3aed : 0x8b5cf6);
    purpleLight.intensity = isLight ? 3.8 : 3.5;
  }
  if (greenLight) {
    greenLight.color.setHex(isLight ? 0x059669 : 0x10b981);
    greenLight.intensity = isLight ? 3.5 : 3.5;
  }
  if (cyanLight) {
    cyanLight.color.setHex(isLight ? 0x0284c7 : 0x06b6d4);
    cyanLight.intensity = isLight ? 2.2 : 2.0;
  }

  // Ground Grid visibility toggle
  if (gridDark && gridLight) {
    gridDark.visible = !isLight;
    gridLight.visible = isLight;
  }

  // Quantum Star particles
  if (stars && stars.material) {
    stars.material.color.setHex(isLight ? 0x6366f1 : 0xa78bfa);
    stars.material.size = isLight ? 1.8 : 1.3;
    stars.material.opacity = isLight ? 0.85 : 0.7;
    stars.material.needsUpdate = true;
  }

  // Dynamic Building finishes
  buildings.forEach((b) => {
    if (b.material) {
      b.material.color.setHex(isLight ? b.userData.lightColor : b.userData.darkColor);
      b.material.roughness = isLight ? 0.2 : 0.3;
      b.material.metalness = isLight ? 0.35 : 0.8;
      b.material.needsUpdate = true;
    }
  });

  // Holographic Rings
  if (rings[0] && rings[0].material) {
    rings[0].material.color.setHex(isLight ? 0x7c3aed : 0x8b5cf6);
    rings[0].material.opacity = isLight ? 0.35 : 0.45;
  }
  if (rings[1] && rings[1].material) {
    rings[1].material.color.setHex(isLight ? 0x059669 : 0x10b981);
    rings[1].material.opacity = isLight ? 0.3 : 0.4;
  }
}

function init3DCity() {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

  // Prevent multiple initializations on hot reloads
  if (renderer) {
    return;
  }

  try {
    const parent = canvas.parentElement || document.body;
    const initialWidth = parent.clientWidth || window.innerWidth;
    const initialHeight = parent.clientHeight || window.innerHeight;

    // Detect initial theme preference
    const isLightInitial = document.documentElement.getAttribute('data-theme') === 'light' ||
                           document.documentElement.classList.contains('light-mode');

    // 1. Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(isLightInitial ? 0xf8fafc : 0x0a0e17, 0.0075);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(65, initialWidth / initialHeight, 0.1, 1000);
    camera.position.set(0, 25, 60);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // 4. Lighting setup
    ambientLight = new THREE.AmbientLight(isLightInitial ? 0xffffff : 0x241e38, isLightInitial ? 2.5 : 1.4);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(
      isLightInitial ? 0xffffff : 0x38bdf8,
      isLightInitial ? 0xe2e8f0 : 0x0a0e17,
      isLightInitial ? 1.6 : 0.8
    );
    scene.add(hemiLight);

    purpleLight = new THREE.PointLight(isLightInitial ? 0x7c3aed : 0x8b5cf6, isLightInitial ? 3.8 : 3.5, 180);
    purpleLight.position.set(-35, 45, 30);
    scene.add(purpleLight);

    greenLight = new THREE.PointLight(isLightInitial ? 0x059669 : 0x10b981, isLightInitial ? 3.5 : 3.5, 180);
    greenLight.position.set(35, 45, -30);
    scene.add(greenLight);

    cyanLight = new THREE.PointLight(isLightInitial ? 0x0284c7 : 0x06b6d4, isLightInitial ? 2.2 : 2.0, 160);
    cyanLight.position.set(0, 60, 40);
    scene.add(cyanLight);

    // 5. Dual Grid Helpers for Dark & Light aesthetics
    gridDark = new THREE.GridHelper(260, 52, 0x8b5cf6, 0x1e293b);
    gridDark.position.y = 0;
    gridDark.visible = !isLightInitial;
    scene.add(gridDark);

    gridLight = new THREE.GridHelper(260, 52, 0x7c3aed, 0xcbd5e1);
    gridLight.position.y = 0;
    gridLight.visible = isLightInitial;
    scene.add(gridLight);

    // 6. Monolithic Buildings
    buildings = [];
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

    for (let i = 0; i < 90; i++) {
      const darkCol = darkPalette[i % darkPalette.length];
      const lightCol = lightPalette[i % lightPalette.length];
      const isWire = Math.random() > 0.88;

      const material = new THREE.MeshStandardMaterial({
        color: isLightInitial ? lightCol : darkCol,
        roughness: isLightInitial ? 0.2 : 0.3,
        metalness: isLightInitial ? 0.35 : 0.8,
        wireframe: isWire
      });

      const building = new THREE.Mesh(boxGeometry, material);
      const width = Math.random() * 6 + 3.5;
      const height = Math.random() * 45 + 12;
      const depth = Math.random() * 6 + 3.5;

      building.scale.set(width, height, depth);
      building.position.set(
        (Math.random() - 0.5) * 190,
        height / 2,
        (Math.random() - 0.5) * 190
      );

      building.userData = {
        darkColor: darkCol,
        lightColor: lightCol,
        baseY: height / 2,
        floatSpeed: 0.8 + Math.random() * 0.5,
        floatOffset: Math.random() * Math.PI * 2,
        isWire
      };

      scene.add(building);
      buildings.push(building);
    }

    // 7. Particle Star Field / Energy Motes
    const starGeo = new THREE.BufferGeometry();
    const starCount = 850;
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 320;
      starPositions[i + 1] = Math.random() * 130 + 5;
      starPositions[i + 2] = (Math.random() - 0.5) * 320;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: isLightInitial ? 0x6366f1 : 0xa78bfa,
      size: isLightInitial ? 1.8 : 1.3,
      transparent: true,
      opacity: isLightInitial ? 0.85 : 0.7
    });
    stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // 8. Holographic Gyro Rings
    rings = [];
    const ringGeo1 = new THREE.TorusGeometry(28, 0.35, 16, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: isLightInitial ? 0x7c3aed : 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: isLightInitial ? 0.35 : 0.45
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.position.set(0, 42, -20);
    ring1.rotation.x = Math.PI / 3;
    scene.add(ring1);
    rings.push(ring1);

    const ringGeo2 = new THREE.TorusGeometry(38, 0.3, 16, 100);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: isLightInitial ? 0x059669 : 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: isLightInitial ? 0.3 : 0.4
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.position.set(0, 42, -20);
    ring2.rotation.y = Math.PI / 4;
    scene.add(ring2);
    rings.push(ring2);

    // 9. Interactive Parallax Listener
    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX - window.innerWidth / 2) * 0.0006;
      mouseY = (e.clientY - window.innerHeight / 2) * 0.0006;
    }, { passive: true });

    // 10. Live Theme Change Listeners (CustomEvent & MutationObserver)
    window.addEventListener('themeChanged', (e) => {
      const isLight = !!e.detail?.isLight;
      applyThemeTo3D(isLight);
    });

    try {
      const themeObserver = new MutationObserver(() => {
        const isLightNow = document.documentElement.getAttribute('data-theme') === 'light' ||
                           document.documentElement.classList.contains('light-mode');
        applyThemeTo3D(isLightNow);
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class']
      });
    } catch (e) {
      // Ignore if MutationObserver is restricted
    }

    // 11. Animation Loop
    function animate() {
      animFrameId = requestAnimationFrame(animate);
      if (!isAnimationRunning) return;

      const time = Date.now() * 0.001;

      // Floating skyscrapers
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        b.position.y = b.userData.baseY + Math.sin(time * b.userData.floatSpeed + b.userData.floatOffset) * 0.8;
      }

      // Constellation rotation
      if (stars) {
        stars.rotation.y = time * 0.015;
      }

      // Gyro rings rotation
      if (rings[0]) {
        rings[0].rotation.z = time * 0.15;
        rings[0].rotation.x = Math.PI / 3 + Math.sin(time * 0.2) * 0.1;
      }
      if (rings[1]) {
        rings[1].rotation.z = -time * 0.12;
        rings[1].rotation.y = Math.PI / 4 + Math.cos(time * 0.25) * 0.1;
      }

      // Camera lerping
      camera.position.x += (Math.sin(time * 0.18) * 14 + mouseX * 45 - camera.position.x) * 0.04;
      camera.position.y += (25 + Math.cos(time * 0.25) * 4 - mouseY * 30 - camera.position.y) * 0.04;
      camera.lookAt(0, 16, 0);

      renderer.render(scene, camera);
    }
    animate();

    // 12. Viewport & Resize Management
    const handleResize = () => {
      if (!camera || !renderer || !canvas) return;
      const p = canvas.parentElement || document.body;
      const w = p.clientWidth || window.innerWidth;
      const h = p.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 150);
    });

    // Pause rendering when tab is hidden to conserve power and CPU
    document.addEventListener('visibilitychange', () => {
      isAnimationRunning = !document.hidden;
    });

  } catch (err) {
    console.warn("MayankZen 3D scene initialization note:", err);
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
