import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Firebase imports not used for 3D hero - commented out
// import { db } from "./firebase.js";
// import { collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// 3D City Hero Scene
let scene, camera, renderer, buildings = [];

function init3DCity() {
  const canvas = document.getElementById('hero3d');
  if (!canvas) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  // City lights
  const light = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(light);
  const pointLight = new THREE.PointLight(0x8b5cf6, 1, 100);
  pointLight.position.set(0, 50, 0);
  scene.add(pointLight);

  // Buildings
  for (let i = 0; i < 100; i++) {
    const geometry = new THREE.BoxGeometry(
      Math.random() * 5 + 2,
      Math.random() * 40 + 10,
      Math.random() * 5 + 2
    );
    const material = new THREE.MeshPhongMaterial({ color: Math.random() * 0xffffff });
    const building = new THREE.Mesh(geometry, material);
    building.position.set(
      (Math.random() - 0.5) * 200,
      geometry.parameters.height / 2,
      (Math.random() - 0.5) * 200
    );
    scene.add(building);
    buildings.push(building);
  }

  camera.position.set(0, 30, 50);
  camera.lookAt(0, 0, 0);

  function animate() {
    requestAnimationFrame(animate);
    buildings.forEach((b, i) => {
      b.rotation.y += 0.005;
      b.position.y += Math.sin(Date.now() * 0.001 + i) * 0.01;
    });
    camera.position.x = Math.sin(Date.now() * 0.0005) * 10;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Typing animation
function typeWriter(element, text, speed = 100) {
  let i = 0;
  element.innerHTML = '';
  function type() {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

// Global auth listener
onAuthStateChanged(auth, (user) => {
  const loginLinks = document.querySelectorAll('a[href="/login/"], a[href="/register/"]');
  const navLogout = document.querySelector('nav');
  
  if (user) {
    // Hide login/register, show logout
    loginLinks.forEach(link => link.style.display = 'none');
    const logoNav = document.querySelector('.logo');
    const newNavItem = document.createElement('li');
    newNavItem.innerHTML = `<a href="#" id="globalLogout" style="color: var(--accent-green); font-weight: bold;">Logout (${user.email.split('@')[0]})</a>`;
    navLogout.appendChild(newNavItem);
    
    // Logout handler
    document.getElementById('globalLogout').onclick = async (e) => {
      e.preventDefault();
      await signOut(auth);
    };
  } else {
    // Show login/register
    loginLinks.forEach(link => link.style.display = 'block');
    const logoutLink = document.getElementById('globalLogout');
    if (logoutLink) logoutLink.parentElement.remove();
  }
});

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  // WebGL support check
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    console.error('WebGL not supported - 3D scene disabled');
    return;
  }

  try {
    init3DCity();
    console.log('✅ 3D city hero initialized successfully');
  } catch (error) {
    console.error('❌ 3D init failed:', error);
  }

  const typingEl = document.querySelector('.typing');
  if (typingEl) typeWriter(typingEl, 'Maynix Studios - 3D Digital Worlds');
});

// =============================
  // SMOOTH SCROLL
  // =============================

function scrollContact() {

const contact = document.getElementById("contact");

if(contact){
contact.scrollIntoView({
behavior:"smooth"
});
}

}


// =============================
// MOBILE MENU
// =============================

const menuBtn = document.getElementById("menuBtn");
const nav = document.querySelector("nav");

if(menuBtn && nav){
menuBtn.addEventListener("click",()=>{
nav.classList.toggle("show");
});
}


// =============================
// SERVICE REQUEST SUBMIT
// =============================

const form = document.getElementById("serviceForm");

if(form){

form.addEventListener("submit", async (e)=>{

e.preventDefault();

try{

const name = document.getElementById("name").value;
const email = document.getElementById("email").value;
const mobile = document.getElementById("mobile").value;
const service = document.getElementById("service").value;
const budget = document.getElementById("budget").value;
const description = document.getElementById("description").value;

const trackingId = "MS-" + Math.floor(10000 + Math.random()*90000);

await addDoc(collection(db,"service_requests"),{

trackingId,
name,
email,
mobile,
service,
budget,
description,
status:"Pending",
timestamp:serverTimestamp()

});

alert("✅ Request submitted successfully!\nTracking ID: "+trackingId);

form.reset();

}catch(error){

console.error("Submit Error:",error);
alert("❌ Error submitting request");

}

});

}


// =============================
// TRACK REQUEST
// =============================

async function trackRequest(){

const trackingInput = document.getElementById("trackId");
const emailInput = document.getElementById("trackEmail");
const resultDiv = document.getElementById("trackResult");

if(!trackingInput || !emailInput || !resultDiv) return;

const trackingId = trackingInput.value.trim();
const email = emailInput.value.trim();

resultDiv.innerHTML = "Checking...";

try{

const q = query(
collection(db,"service_requests"),
where("trackingId","==",trackingId),
where("email","==",email)
);

const querySnapshot = await getDocs(q);

if(querySnapshot.empty){

resultDiv.innerHTML = "❌ No request found.";
return;

}

querySnapshot.forEach((doc)=>{

const data = doc.data();

resultDiv.innerHTML = `
<div class="track-card">

<h3>Request Status</h3>

<p><strong>Service:</strong> ${data.service}</p>
<p><strong>Status:</strong> ${data.status}</p>
<p><strong>Budget:</strong> ₹${data.budget}</p>
<p><strong>Description:</strong> ${data.description}</p>

</div>
`;

});

}catch(error){

console.error("Tracking Error:",error);
resultDiv.innerHTML = "❌ Error fetching request.";

}

}


// =============================
// TRACK BUTTON EVENT
// =============================

const trackBtn = document.getElementById("trackBtn");

if(trackBtn){

trackBtn.addEventListener("click",trackRequest);

}
