import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// 3D Cyber City Hero Scene
let scene, camera, renderer, buildings = [], stars;
let mouseX = 0, mouseY = 0;

function init3DCity() {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e17, 0.008);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 25, 60);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a2035, 1.5);
  scene.add(ambientLight);

  const purpleLight = new THREE.PointLight(0x8b5cf6, 3, 160);
  purpleLight.position.set(-30, 40, 30);
  scene.add(purpleLight);

  const greenLight = new THREE.PointLight(0x10b981, 3, 160);
  greenLight.position.set(30, 40, -30);
  scene.add(greenLight);

  // Buildings Geometry
  const colors = [0x8b5cf6, 0x10b981, 0x3b82f6, 0x1e293b, 0x0f172a];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  for (let i = 0; i < 90; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.8,
      wireframe: Math.random() > 0.85
    });

    const building = new THREE.Mesh(boxGeometry, material);
    const width = Math.random() * 6 + 3;
    const height = Math.random() * 45 + 10;
    const depth = Math.random() * 6 + 3;

    building.scale.set(width, height, depth);
    building.position.set(
      (Math.random() - 0.5) * 180,
      height / 2,
      (Math.random() - 0.5) * 180
    );
    scene.add(building);
    buildings.push(building);
  }

  // Particle Stars
  const starGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const starPositions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount * 3; i += 3) {
    starPositions[i] = (Math.random() - 0.5) * 300;
    starPositions[i + 1] = Math.random() * 120 + 10;
    starPositions[i + 2] = (Math.random() - 0.5) * 300;
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xa78bfa,
    size: 1.2,
    transparent: true,
    opacity: 0.7
  });
  stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // Grid Floor
  const gridHelper = new THREE.GridHelper(250, 50, 0x8b5cf6, 0x1e293b);
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  // Mouse Parallax listener
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) * 0.0005;
    mouseY = (e.clientY - window.innerHeight / 2) * 0.0005;
  });

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;

    buildings.forEach((b, idx) => {
      b.position.y += Math.sin(time + idx) * 0.015;
    });

    if (stars) {
      stars.rotation.y = time * 0.02;
    }

    camera.position.x += (Math.sin(time * 0.2) * 15 + mouseX * 40 - camera.position.x) * 0.05;
    camera.position.y += (25 + Math.cos(time * 0.3) * 4 - mouseY * 30 - camera.position.y) * 0.05;
    camera.lookAt(0, 15, 0);

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Typing Effect
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
      const isMayank = user.email === 'mayank198010@gmail.com';
      const item = document.createElement('li');
      item.className = 'dynamic-auth';
      item.innerHTML = `
        <a href="/dashboard/" style="color: var(--accent-green); font-weight: 600;"><i class="fa-solid fa-user"></i> Dashboard</a>
      `;
      navList.appendChild(item);

      if (isMayank) {
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

// Initialization
document.addEventListener('DOMContentLoaded', () => {
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
    });
  }

  // Init 3D Scene
  try {
    init3DCity();
  } catch (err) {
    console.error("3D Scene init failed:", err);
  }

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
});
