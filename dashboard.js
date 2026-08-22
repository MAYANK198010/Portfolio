import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login/?redirect=/dashboard/";
    return;
  }

  currentUser = user;

  // Display user info
  const nameEl = document.getElementById("userNameDisplay");
  const emailEl = document.getElementById("userEmailDisplay");
  const avatarEl = document.getElementById("userAvatar");
  const adminBanner = document.getElementById("adminNoticeBanner");

  if (emailEl) emailEl.textContent = user.email || 'No email';
  
  let displayName = user.displayName || user.email?.split('@')[0] || 'Client';
  const emailLower = (user.email || '').toLowerCase().trim();
  let isUserAdmin = emailLower === 'admin@mayankzen.in' || emailLower === 'mayank198010@gmail.com';

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const uData = userSnap.data();
      if (uData.name) displayName = uData.name;
      if (uData.role === 'admin') isUserAdmin = true;
    }
  } catch (err) {
    console.debug("User profile check note:", err);
  }

  if (!isUserAdmin && user.email) {
    try {
      const approvedSnap = await getDocs(collection(db, "approvedAdmins"));
      if (approvedSnap.docs.some(d => d.data().email?.toLowerCase() === emailLower)) {
        isUserAdmin = true;
      }
    } catch (err) {
      // Non-admin will not have read permissions for approvedAdmins collection, which is expected
      console.debug("Admin check notice:", err);
    }
  }

  if (nameEl) nameEl.textContent = `Welcome, ${displayName}`;
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
  if (adminBanner && isUserAdmin) {
    adminBanner.style.display = 'flex';
  }

  // Ensure client user profile is saved to persistent server DB
  if (user.email) {
    try {
      fetch('/api/db/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.uid,
          name: displayName,
          email: user.email,
          role: isUserAdmin ? 'admin' : 'user',
          createdAt: new Date().toISOString()
        })
      }).catch(e => console.debug("Server DB sync note:", e));
    } catch (e) {}
  }

  loadUserRequests();
});

window.loadUserRequests = async function() {
  const container = document.getElementById("userRequestsList");
  if (!container || !currentUser) return;

  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 2rem; grid-column: 1 / -1;">
      <span class="loading"></span>
      <p style="margin-top: 1rem; color: var(--text-secondary);">Querying your project requests...</p>
    </div>
  `;

  let requestsMap = new Map();

  // 1. Load from persistent server DB
  try {
    const srvRes = await fetch(`/api/db/requests?email=${encodeURIComponent(currentUser.email || '')}`);
    if (srvRes.ok) {
      const srvJson = await srvRes.json();
      if (srvJson.data && Array.isArray(srvJson.data)) {
        srvJson.data.forEach(r => {
          requestsMap.set(r.trackingId, { id: r.trackingId, ...r });
        });
      }
    }
  } catch (srvErr) {
    console.debug("Server DB request query note:", srvErr);
  }

  // 2. Load from local storage matching user email
  try {
    const localList = JSON.parse(localStorage.getItem('mayankzen_local_requests') || '[]');
    localList.forEach(r => {
      if (r.email && currentUser.email && r.email.toLowerCase() === currentUser.email.toLowerCase()) {
        if (!requestsMap.has(r.trackingId)) {
          requestsMap.set(r.trackingId, r);
        }
      }
    });
  } catch (e) {
    console.warn("Local storage check error:", e);
  }

  // 3. Load from Firestore
  try {
    const q = query(
      collection(db, "service_requests"),
      where("email", "==", currentUser.email)
    );
    const snapshot = await getDocs(q);

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const tId = data.trackingId || docSnap.id;
      const existing = requestsMap.get(tId) || {};
      requestsMap.set(tId, { id: docSnap.id, ...existing, ...data });
    });
  } catch (err) {
    console.warn("Firestore query note:", err.message);
  }

  const combinedList = Array.from(requestsMap.values());

  if (combinedList.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem; grid-column: 1 / -1;">
        <i class="fa-solid fa-folder-plus" style="font-size: 3rem; color: var(--primary-purple); margin-bottom: 1rem;"></i>
        <h3>No Requests Yet</h3>
        <p style="color: var(--text-secondary); margin: 0.5rem 0 1.5rem;">You haven't submitted any service requests under this email address.</p>
        <a href="/request/" class="btn primary"><i class="fa-solid fa-rocket"></i> Submit Your First Request</a>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  combinedList.forEach(data => {
    const status = data.status || 'Pending';
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Recent';

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <span class="status ${(status || 'pending').toLowerCase()}">${status}</span>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">${dateStr}</span>
      </div>
      <h3 style="color: white; margin-bottom: 0.5rem;">${data.service || 'Service Request'}</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">Tracking ID: <strong style="color: var(--accent-green);">${data.trackingId}</strong></p>
      <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${data.description || 'No description'}</p>
      
      ${data.attachments && data.attachments.length > 0 ? `
        <div style="font-size: 0.8rem; color: var(--accent-green); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-paperclip"></i> <span>${data.attachments.length} attached file${data.attachments.length > 1 ? 's' : ''}</span>
        </div>
      ` : ''}
      
      <div class="card-actions" style="margin-top: auto; display: flex; gap: 0.5rem; justify-content: flex-start;">
        <a href="/request/?id=${data.trackingId}" class="btn primary btn-sm"><i class="fa-solid fa-comments"></i> Open Chat</a>
        <a href="/track/?id=${data.trackingId}" class="btn secondary btn-sm"><i class="fa-solid fa-location-crosshairs"></i> Track</a>
      </div>
    `;
    container.appendChild(card);
  });
};

// Logout
const logoutBtn = document.getElementById("dashboardLogoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "/login/";
  });
}
