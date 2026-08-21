import { auth, db } from "./firebase.js";
import { initChat } from "./chat.js";
import { downloadAttachment, openAttachmentPreview, formatBytes, getFileIcon } from "./attachments.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  doc, getDoc, getDocs, collection, updateDoc, setDoc, deleteDoc, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Toast Helper
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'circle-exclamation' : 'info-circle');
  toast.innerHTML = `<i class="fa-solid fa-${icon}"></i> <span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

let allRequests = [];
let allUsers = [];
let statusChartInstance = null;
let servicesChartInstance = null;
let currentAdminUser = null;

// Admin Verification Check
async function isApprovedAdmin(user) {
  if (!user || !user.email) return false;
  const email = user.email.toLowerCase().trim();
  if (email === 'admin@mayankzen.in' || email === 'mayank198010@gmail.com') return true;

  // Check local approved admins list
  try {
    const localAdmins = JSON.parse(localStorage.getItem('mayankzen_approved_admins') || '[]');
    if (localAdmins.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === email)) {
      return true;
    }
  } catch (e) {}
  
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === 'admin') return true;
  } catch (e) {
    console.debug('User role lookup notice:', e?.message || e);
  }

  try {
    const approvedSnap = await getDocs(collection(db, "approvedAdmins"));
    return approvedSnap.docs.some(d => d.data().email?.toLowerCase() === email);
  } catch (e) {
    console.debug('Approved admins remote lookup notice (handled):', e?.message || e);
    return false;
  }
}

// Authentication Listener
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login/?redirect=/admin.html";
    return;
  }

  const isAdmin = await isApprovedAdmin(user);
  if (!isAdmin) {
    showToast("Access Denied: Only Admin (admin@mayankzen.in) can access the Admin Panel. Redirecting to your Dashboard...", "error");
    setTimeout(() => {
      window.location.href = "/dashboard/";
    }, 1500);
    return;
  }

  currentAdminUser = user;
  const displayEl = document.getElementById('adminEmailDisplay');
  if (displayEl) displayEl.textContent = user.email;

  loadRequests();
  loadUsers();
  loadApprovedAdmins();
});

// Logout Handler
const logoutBtn = document.getElementById('adminLogoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = '/login/';
  });
}

// Load All Requests
async function loadRequests() {
  const tableBody = document.getElementById("requestsTable");
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;"><span class="loading"></span> Fetching requests...</td></tr>';

  let requestsMap = new Map();

  // Read local cached requests if any
  try {
    const localList = JSON.parse(localStorage.getItem('mayankzen_local_requests') || '[]');
    localList.forEach(r => {
      requestsMap.set(r.trackingId, { id: 'local_' + r.trackingId, ...r });
    });
  } catch (e) {
    console.warn("Local storage read error in admin:", e);
  }

  try {
    const snapshot = await getDocs(collection(db, "service_requests"));
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      requestsMap.set(data.trackingId || docSnap.id, {
        id: docSnap.id,
        ...data
      });
    });
  } catch (error) {
    console.warn("Firestore admin query note:", error.message);
  }

  allRequests = Array.from(requestsMap.values());

  // Sort newest first
  allRequests.sort((a, b) => {
    const timeA = a.timestamp?.seconds || new Date(a.createdAt || 0).getTime() / 1000;
    const timeB = b.timestamp?.seconds || new Date(b.createdAt || 0).getTime() / 1000;
    return timeB - timeA;
  });

  renderMetricsAndCharts();
  renderTable(allRequests);
}

// Render Metrics and Charts
function renderMetricsAndCharts() {
  let stats = { total: 0, pending: 0, working: 0, completed: 0, pipeline: 0 };
  let serviceCounts = {};

  allRequests.forEach(req => {
    stats.total++;
    const st = (req.status || 'Pending').toLowerCase();
    if (st.includes('pending')) stats.pending++;
    else if (st.includes('working') || st.includes('progress') || st.includes('review')) stats.working++;
    else if (st.includes('complete') || st.includes('done')) stats.completed++;

    stats.pipeline += Number(req.budget) || 0;

    const sName = req.service || 'Custom';
    serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;
  });

  const totalEl = document.getElementById('totalRequests');
  const pendingEl = document.getElementById('pendingCount');
  const activeEl = document.getElementById('activeCount');
  const completeEl = document.getElementById('completeCount');
  const revenueEl = document.getElementById('totalRevenue');

  if (totalEl) totalEl.textContent = stats.total;
  if (pendingEl) pendingEl.textContent = stats.pending;
  if (activeEl) activeEl.textContent = stats.working;
  if (completeEl) completeEl.textContent = stats.completed;
  if (revenueEl) revenueEl.textContent = '₹' + stats.pipeline.toLocaleString('en-IN');

  // Render Status Chart if Chart.js is loaded
  if (typeof Chart !== 'undefined') {
    const statusCtx = document.getElementById('statusChart')?.getContext('2d');
    if (statusCtx) {
      if (statusChartInstance) statusChartInstance.destroy();
      statusChartInstance = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'In Progress', 'Completed'],
          datasets: [{
            data: [stats.pending, stats.working, stats.completed],
            backgroundColor: ['#fbbf24', '#8b5cf6', '#10b981'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#a1a8c0' } }
          }
        }
      });
    }

    // Render Services Chart
    const servCtx = document.getElementById('servicesChart')?.getContext('2d');
    if (servCtx) {
      if (servicesChartInstance) servicesChartInstance.destroy();
      servicesChartInstance = new Chart(servCtx, {
        type: 'bar',
        data: {
          labels: Object.keys(serviceCounts),
          datasets: [{
            label: 'Requests Count',
            data: Object.values(serviceCounts),
            backgroundColor: '#10b981',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { ticks: { color: '#a1a8c0', stepSize: 1 } },
            x: { ticks: { color: '#a1a8c0' } }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  }
}

// Render Table
function renderTable(requests) {
  const tableBody = document.getElementById("requestsTable");
  if (!tableBody) return;

  if (requests.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);">No matching requests found.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  requests.forEach(req => {
    const row = document.createElement("tr");
    const dateStr = req.timestamp ? new Date(req.timestamp.seconds * 1000).toLocaleDateString() : (req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'Recent');
    const statusVal = req.status || 'Pending';

    row.innerHTML = `
      <td><strong style="color: var(--accent-green);">${req.trackingId || 'N/A'}</strong></td>
      <td>
        <div style="font-weight: 600; color: white;">${req.name || 'Anonymous'}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${req.email || 'No email'}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${req.mobile || ''}</div>
      </td>
      <td><span style="color: #cbd5e1;">${req.service || 'Web Development'}</span></td>
      <td><strong style="color: var(--accent-green);">₹${(req.budget || 0).toLocaleString('en-IN')}</strong></td>
      <td>
        <select data-id="${req.id}" class="statusSelect" style="background: rgba(0,0,0,0.5); color: white; border: 1px solid var(--primary-purple); border-radius: 6px; padding: 0.4rem 0.6rem;">
          <option value="Pending" ${statusVal === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Working" ${statusVal === 'Working' || statusVal === 'In Progress' ? 'selected' : ''}>Working</option>
          <option value="Review" ${statusVal === 'Review' ? 'selected' : ''}>In Review</option>
          <option value="Completed" ${statusVal === 'Completed' ? 'selected' : ''}>Completed</option>
        </select>
      </td>
      <td style="color: var(--text-secondary); font-size: 0.9rem;">${dateStr}</td>
      <td>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          <button class="btn primary btn-sm" onclick="openAdminChat('${req.trackingId}')" title="Chat with Client"><i class="fa-solid fa-comments"></i> Chat</button>
          <button class="btn secondary btn-sm" onclick="openEditRequestModal('${req.id}')" title="Edit Budget/Service/Status"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="btn secondary btn-sm" onclick="viewRequestDetail('${req.id}')" title="View Full Brief"><i class="fa-solid fa-file-lines"></i></button>
          ${req.mobile ? `<a href="https://wa.me/${req.mobile.replace(/[^0-9]/g, '')}" target="_blank" class="btn secondary btn-sm" style="border-color:#25d366; color:#25d366;" title="WhatsApp Client"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
          <button class="btn secondary btn-sm" onclick="deleteRequestRecord('${req.id}')" style="border-color:#ef4444; color:#ef4444;" title="Delete Request"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });

  // Attach Status Change Listeners
  document.querySelectorAll(".statusSelect").forEach(select => {
    select.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const newStatus = e.target.value;
      try {
        if (!id.startsWith('local_')) {
          await updateDoc(doc(db, "service_requests", id), {
            status: newStatus,
            updatedAt: serverTimestamp()
          });
        }
        
        // Update local storage cache
        try {
          const localList = JSON.parse(localStorage.getItem('mayankzen_local_requests') || '[]');
          const match = localList.find(r => r.trackingId === id || 'local_' + r.trackingId === id);
          if (match) {
            match.status = newStatus;
            localStorage.setItem('mayankzen_local_requests', JSON.stringify(localList));
          }
        } catch (le) {
          console.debug('Local storage status update note:', le);
        }

        showToast(`Status updated to "${newStatus}"`, 'success');
        
        // Update local dataset and recalculate metrics
        const req = allRequests.find(r => r.id === id);
        if (req) req.status = newStatus;
        renderMetricsAndCharts();
      } catch (err) {
        console.error("Status update error:", err);
        showToast("Failed to update status: " + err.message, 'error');
      }
    });
  });
}

// Table Filter Handler
window.filterTable = function() {
  const searchTerm = document.getElementById("requestSearchInput")?.value.toLowerCase() || '';
  const statusFilter = document.getElementById("statusFilterSelect")?.value || 'ALL';

  const filtered = allRequests.filter(req => {
    const matchesSearch = 
      (req.name && req.name.toLowerCase().includes(searchTerm)) ||
      (req.email && req.email.toLowerCase().includes(searchTerm)) ||
      (req.trackingId && req.trackingId.toLowerCase().includes(searchTerm)) ||
      (req.service && req.service.toLowerCase().includes(searchTerm));

    const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  renderTable(filtered);
};

// Edit Request Modal Logic
window.openEditRequestModal = function(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  document.getElementById('editReqDocId').value = id;
  document.getElementById('editReqTrackingId').value = req.trackingId || id;
  document.getElementById('editReqService').value = req.service || 'Web Development';
  document.getElementById('editReqBudget').value = req.budget || 0;
  document.getElementById('editReqStatus').value = req.status || 'Pending';

  document.getElementById('adminEditModal').classList.add('open');
};

window.closeAdminEditModal = function() {
  document.getElementById('adminEditModal').classList.remove('open');
};

window.handleUpdateRequestSubmit = async function(event) {
  event.preventDefault();
  const id = document.getElementById('editReqDocId').value;
  const service = document.getElementById('editReqService').value;
  const budget = Number(document.getElementById('editReqBudget').value) || 0;
  const status = document.getElementById('editReqStatus').value;

  try {
    if (!id.startsWith('local_')) {
      await updateDoc(doc(db, "service_requests", id), {
        service,
        budget,
        status,
        updatedAt: serverTimestamp()
      });
    }

    // Update in local requests
    const req = allRequests.find(r => r.id === id);
    if (req) {
      req.service = service;
      req.budget = budget;
      req.status = status;
    }

    try {
      const localList = JSON.parse(localStorage.getItem('mayankzen_local_requests') || '[]');
      const match = localList.find(r => r.trackingId === id || 'local_' + r.trackingId === id);
      if (match) {
        match.service = service;
        match.budget = budget;
        match.status = status;
        localStorage.setItem('mayankzen_local_requests', JSON.stringify(localList));
      }
    } catch (le) {}

    renderMetricsAndCharts();
    renderTable(allRequests);
    closeAdminEditModal();
    showToast("Project request updated successfully!", "success");
  } catch (err) {
    console.error("Update request error:", err);
    showToast("Failed to update: " + err.message, "error");
  }
};

// Admin Chat Modal Handlers
window.openAdminChat = function(trackingId) {
  if (!trackingId) {
    showToast("No tracking ID available for this request.", "error");
    return;
  }
  document.getElementById('adminChatTargetId').textContent = trackingId;
  document.getElementById('adminChatModal').classList.add('open');
  initChat(trackingId, 'admin_mayank');
};

window.closeAdminChatModal = function() {
  document.getElementById('adminChatModal').classList.remove('open');
};

// Request Detail Modal Handlers
window.viewRequestDetail = function(id) {
  const req = allRequests.find(r => r.id === id);
  if (!req) return;

  const attachmentsHtml = (req.attachments && req.attachments.length > 0) ? `
    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 1rem 0;">
    <h4 style="color: var(--accent-green); margin-bottom: 0.5rem;"><i class="fa-solid fa-paperclip"></i> Attached Client Files (${req.attachments.length}):</h4>
    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      ${req.attachments.map(att => {
        const fileTarget = att.fileId || att.url || '';
        const safeName = (att.name || 'attachment').replace(/'/g, "\\'");
        const safeTarget = String(fileTarget).replace(/'/g, "\\'");
        return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 0.5rem 0.85rem; font-size: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <i class="${getFileIcon(att.name, att.type)}" style="color: var(--accent-green);"></i>
            <span style="color: white; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">${att.name}</span>
            <span style="color: var(--text-secondary); font-size: 0.75rem;">(${formatBytes(att.size)})</span>
          </div>
          <div style="display: flex; gap: 0.4rem;">
            <button type="button" class="btn secondary btn-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="window.openAttachmentPreview('${safeTarget}', '${safeName}')">
              <i class="fa-solid fa-eye"></i> View
            </button>
            <button type="button" class="btn secondary btn-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="window.downloadAttachment('${safeTarget}', '${safeName}')">
              <i class="fa-solid fa-download"></i> Download
            </button>
          </div>
        </div>
      `;
      }).join('')}
    </div>
  ` : '';

  document.getElementById('detailClientName').textContent = `Project Brief: ${req.trackingId || 'N/A'}`;
  document.getElementById('detailContent').innerHTML = `
    <p><strong>Client Name:</strong> ${req.name || 'N/A'}</p>
    <p><strong>Email:</strong> ${req.email || 'N/A'}</p>
    <p><strong>Phone:</strong> ${req.mobile || 'N/A'}</p>
    <p><strong>Service:</strong> ${req.service || 'N/A'}</p>
    <p><strong>Estimated Budget:</strong> ₹${(req.budget || 0).toLocaleString('en-IN')}</p>
    <p><strong>Status:</strong> <span class="status ${(req.status || 'pending').toLowerCase()}">${req.status || 'Pending'}</span></p>
    <p><strong>Submitted Date:</strong> ${req.createdAt ? new Date(req.createdAt).toLocaleString() : 'N/A'}</p>
    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 1rem 0;">
    <h4 style="color: var(--accent-green); margin-bottom: 0.5rem;">Project Requirements:</h4>
    <p style="white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px;">${req.description || 'No description provided.'}</p>
    ${attachmentsHtml}
  `;
  document.getElementById('adminDetailModal').classList.add('open');
};

window.closeAdminDetailModal = function() {
  document.getElementById('adminDetailModal').classList.remove('open');
};

// Delete Request Record
window.deleteRequestRecord = async function(id) {
  if (!confirm("Are you sure you want to permanently delete this project request?")) return;
  try {
    if (!id.startsWith('local_')) {
      await deleteDoc(doc(db, "service_requests", id));
    }
    try {
      const localList = JSON.parse(localStorage.getItem('mayankzen_local_requests') || '[]');
      const filteredLocal = localList.filter(r => r.trackingId !== id && 'local_' + r.trackingId !== id);
      localStorage.setItem('mayankzen_local_requests', JSON.stringify(filteredLocal));
    } catch (le) {}

    showToast("Request record deleted.", "info");
    allRequests = allRequests.filter(r => r.id !== id);
    renderMetricsAndCharts();
    renderTable(allRequests);
  } catch (err) {
    console.error("Delete error:", err);
    showToast("Delete failed: " + err.message, "error");
  }
};

// Load and Manage Users
window.loadUsers = async function() {
  const usersTable = document.getElementById("usersTable");
  if (!usersTable) return;
  usersTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem;"><span class="loading"></span> Fetching user accounts...</td></tr>';

  let usersMap = new Map();

  // Add master admin users by default
  usersMap.set('master_admin_main', {
    id: 'master_admin_main',
    name: 'Studio Admin',
    email: 'admin@mayankzen.in',
    role: 'admin',
    createdAt: 'Primary Admin'
  });

  usersMap.set('master_founder', {
    id: 'master_founder',
    name: 'Mayank (Founder)',
    email: 'mayank198010@gmail.com',
    role: 'admin',
    createdAt: 'Master Account'
  });

  try {
    const snapshot = await getDocs(collection(db, "users"));
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      usersMap.set(docSnap.id, {
        id: docSnap.id,
        ...data
      });
    });
  } catch (error) {
    console.warn("Firestore users query notice:", error.message);
  }

  allUsers = Array.from(usersMap.values());
  renderUsersTable(allUsers);
};

function renderUsersTable(users) {
  const tableBody = document.getElementById("usersTable");
  if (!tableBody) return;

  if (users.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);">No user accounts found.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement("tr");
    const emailLower = (u.email || '').toLowerCase();
    const isMaster = emailLower === 'admin@mayankzen.in' || emailLower === 'mayank198010@gmail.com';
    const isAdmin = u.role === 'admin' || isMaster;
    const dateStr = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : (typeof u.createdAt === 'string' ? u.createdAt : 'Recent');

    row.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: ${isAdmin ? 'linear-gradient(135deg, #10b981, #047857)' : 'rgba(139,92,246,0.2)'}; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">
            ${(u.name || u.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <strong style="color: white;">${u.name || 'User'}</strong>
            ${isMaster ? '<span style="font-size: 0.7rem; color: var(--accent-green); margin-left: 0.35rem;">(Master Admin)</span>' : ''}
          </div>
        </div>
      </td>
      <td style="color: #cbd5e1;">${u.email || 'N/A'}</td>
      <td>
        <span class="status ${isAdmin ? 'completed' : 'pending'}" style="margin-bottom: 0;">
          ${isAdmin ? '<i class="fa-solid fa-crown"></i> Admin' : '<i class="fa-solid fa-user"></i> Client'}
        </span>
      </td>
      <td style="color: var(--text-secondary); font-size: 0.9rem;">${dateStr}</td>
      <td>
        ${isMaster ? '<span style="color: var(--text-secondary); font-size: 0.85rem;">Protected</span>' : `
          <button class="btn secondary btn-sm" onclick="toggleUserRole('${u.id}', '${u.role || 'user'}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
            ${isAdmin ? '<i class="fa-solid fa-arrow-down"></i> Set Client' : '<i class="fa-solid fa-arrow-up"></i> Make Admin'}
          </button>
        `}
      </td>
    `;
    tableBody.appendChild(row);
  });
}

window.filterUsersTable = function() {
  const searchTerm = document.getElementById("userSearchInput")?.value.toLowerCase() || '';
  const filtered = allUsers.filter(u => 
    (u.name && u.name.toLowerCase().includes(searchTerm)) ||
    (u.email && u.email.toLowerCase().includes(searchTerm)) ||
    (u.role && u.role.toLowerCase().includes(searchTerm))
  );
  renderUsersTable(filtered);
};

window.toggleUserRole = async function(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    await updateDoc(doc(db, "users", userId), {
      role: newRole,
      updatedAt: serverTimestamp()
    });
    showToast(`User role updated to "${newRole}"`, 'success');
    const u = allUsers.find(user => user.id === userId);
    if (u) u.role = newRole;
    renderUsersTable(allUsers);
  } catch (err) {
    console.error("Toggle role error:", err);
    showToast("Failed to change user role: " + err.message, "error");
  }
};

// Tab Switching
window.switchAdminTab = function(tabName, evt) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabName || (btn.textContent || '').toLowerCase().includes(tabName);
    btn.classList.toggle('active', isTarget);
  });

  if (evt && evt.currentTarget) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    evt.currentTarget.classList.add('active');
  } else if (typeof window !== 'undefined' && window.event && window.event.currentTarget) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    window.event.currentTarget.classList.add('active');
  }

  const requestsTab = document.getElementById('requestsTabContent');
  const usersTab = document.getElementById('usersTabContent');
  const adminsTab = document.getElementById('adminsTabContent');

  if (requestsTab) requestsTab.style.display = tabName === 'requests' ? 'block' : 'none';
  if (usersTab) usersTab.style.display = tabName === 'users' ? 'block' : 'none';
  if (adminsTab) adminsTab.style.display = tabName === 'admins' ? 'block' : 'none';

  if (tabName === 'users') {
    loadUsers();
  } else if (tabName === 'admins') {
    loadApprovedAdmins();
  } else if (tabName === 'requests') {
    loadRequests();
  }
};

// Manage Approved Admins
async function loadApprovedAdmins() {
  const container = document.getElementById('adminsList');
  if (!container) return;

  // Retrieve cached local admins
  let localAdmins = [];
  try {
    localAdmins = JSON.parse(localStorage.getItem('mayankzen_approved_admins') || '[]');
  } catch (e) {
    localAdmins = [];
  }

  const adminsMap = new Map();
  // Always include primary master admin & founder
  adminsMap.set('admin@mayankzen.in', {
    id: 'master_admin_main',
    email: 'admin@mayankzen.in',
    isMaster: true,
    source: 'system'
  });

  adminsMap.set('mayank198010@gmail.com', {
    id: 'master_founder',
    email: 'mayank198010@gmail.com',
    isMaster: true,
    source: 'system'
  });

  // Populate local admins
  localAdmins.forEach(item => {
    const email = typeof item === 'string' ? item : item.email;
    if (email && !adminsMap.has(email.toLowerCase())) {
      adminsMap.set(email.toLowerCase(), {
        id: typeof item === 'object' && item.id ? item.id : 'local_' + email,
        email: email,
        isMaster: false,
        source: 'local'
      });
    }
  });

  try {
    const snapshot = await getDocs(collection(db, "approvedAdmins"));
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.email) {
        adminsMap.set(data.email.toLowerCase(), {
          id: docSnap.id,
          email: data.email,
          isMaster: data.email.toLowerCase() === 'mayank198010@gmail.com',
          source: 'cloud'
        });
      }
    });
  } catch (err) {
    console.debug("Remote approvedAdmins query note (using local cache & user management):", err?.message || err);
  }

  const adminsList = Array.from(adminsMap.values());

  let html = '';
  adminsList.forEach(admin => {
    if (admin.isMaster) {
      html += `
        <div style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span><strong>${admin.email}</strong> <span style="font-size: 0.75rem; color: var(--accent-green); margin-left: 0.25rem;">(Founder / Master)</span></span>
          <span class="status completed" style="margin-bottom: 0;">Master</span>
        </div>
      `;
    } else {
      html += `
        <div style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>${admin.email}</span>
          <button onclick="removeApprovedAdmin('${admin.id}', '${admin.email}')" class="btn secondary btn-sm" style="border-color:#ef4444; color:#ef4444; padding:0.25rem 0.5rem;"><i class="fa-solid fa-user-minus"></i> Remove</button>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

window.addApprovedAdmin = async function() {
  const input = document.getElementById('newAdminEmail');
  const email = input?.value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    showToast("Please enter a valid email address.", "error");
    return;
  }

  // Save to local storage cache immediately
  try {
    const localAdmins = JSON.parse(localStorage.getItem('mayankzen_approved_admins') || '[]');
    if (!localAdmins.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === email)) {
      localAdmins.push({ id: 'local_' + Date.now(), email: email, addedAt: new Date().toISOString() });
      localStorage.setItem('mayankzen_approved_admins', JSON.stringify(localAdmins));
    }
  } catch (e) {}

  // Attempt Firestore remote add
  try {
    await addDoc(collection(db, "approvedAdmins"), {
      email,
      addedAt: serverTimestamp(),
      addedBy: currentAdminUser?.email || 'master'
    });
  } catch (err) {
    console.debug("Approved admins remote save note (cached locally):", err?.message || err);
  }

  showToast(`Granted admin rights to ${email}`, 'success');
  if (input) input.value = '';
  loadApprovedAdmins();
};

window.removeApprovedAdmin = async function(id, email) {
  if (!confirm(`Revoke admin rights for ${email || 'this account'}?`)) return;

  // Remove from local cache
  try {
    const localAdmins = JSON.parse(localStorage.getItem('mayankzen_approved_admins') || '[]');
    const filtered = localAdmins.filter(a => {
      const aEmail = typeof a === 'string' ? a : a.email;
      const aId = typeof a === 'object' ? a.id : null;
      return aEmail?.toLowerCase() !== email?.toLowerCase() && aId !== id;
    });
    localStorage.setItem('mayankzen_approved_admins', JSON.stringify(filtered));
  } catch (e) {}

  // Attempt Firestore remote delete
  if (id && !id.startsWith('local_')) {
    try {
      await deleteDoc(doc(db, "approvedAdmins", id));
    } catch (err) {
      console.debug("Remote delete notice:", err?.message || err);
    }
  }

  showToast("Admin access revoked.", "info");
  loadApprovedAdmins();
};

// Export Requests to CSV
window.exportRequestsCSV = function() {
  if (allRequests.length === 0) {
    showToast("No requests to export.", "info");
    return;
  }

  const headers = ["Tracking ID", "Client Name", "Email", "Phone", "Service", "Budget (INR)", "Status", "Date", "Description"];
  const rows = allRequests.map(r => [
    `"${r.trackingId || ''}"`,
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${(r.email || '').replace(/"/g, '""')}"`,
    `"${(r.mobile || '').replace(/"/g, '""')}"`,
    `"${(r.service || '').replace(/"/g, '""')}"`,
    r.budget || 0,
    `"${r.status || 'Pending'}"`,
    `"${r.createdAt || ''}"`,
    `"${(r.description || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `MayankZen_Requests_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("CSV export downloaded!", "success");
};

window.refreshData = function() {
  loadRequests();
  loadUsers();
  showToast("Data refreshed", "info");
};
