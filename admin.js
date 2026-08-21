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
let statusChartInstance = null;
let servicesChartInstance = null;
let currentAdminUser = null;

// Admin Verification Check
async function isApprovedAdmin(user) {
  if (!user) return false;
  if (user.email === 'mayank198010@gmail.com') return true;
  
  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists() && userDoc.data().role === 'admin') return true;
  } catch (e) {
    console.debug('User role lookup notice:', e);
  }

  try {
    const approvedSnap = await getDocs(collection(db, "approvedAdmins"));
    return approvedSnap.docs.some(d => d.data().email === user.email);
  } catch (e) {
    console.debug('Admin verification notice:', e);
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
    showToast("Access Denied: Admin privileges required.", "error");
    setTimeout(async () => {
      await signOut(auth);
      window.location.href = "/";
    }, 2000);
    return;
  }

  currentAdminUser = user;
  const displayEl = document.getElementById('adminEmailDisplay');
  if (displayEl) displayEl.textContent = user.email;

  loadRequests();
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

  document.getElementById('totalRequests').textContent = stats.total;
  document.getElementById('pendingCount').textContent = stats.pending;
  document.getElementById('activeCount').textContent = stats.working;
  document.getElementById('completeCount').textContent = stats.completed;
  document.getElementById('totalRevenue').textContent = '₹' + stats.pipeline.toLocaleString('en-IN');

  // Render Status Chart
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
        await updateDoc(doc(db, "service_requests", id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
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
      ${req.attachments.map(att => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 0.5rem 0.85rem; font-size: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
            <i class="${getFileIcon(att.name, att.type)}" style="color: var(--accent-green);"></i>
            <span style="color: white; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">${att.name}</span>
            <span style="color: var(--text-secondary); font-size: 0.75rem;">(${formatBytes(att.size)})</span>
          </div>
          <button type="button" class="btn secondary btn-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="window.downloadAttachment('${att.fileId || att.url}', '${att.name}')">
            <i class="fa-solid fa-download"></i> Download
          </button>
        </div>
      `).join('')}
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
    await deleteDoc(doc(db, "service_requests", id));
    showToast("Request record deleted.", "info");
    allRequests = allRequests.filter(r => r.id !== id);
    renderMetricsAndCharts();
    renderTable(allRequests);
  } catch (err) {
    console.error("Delete error:", err);
    showToast("Delete failed: " + err.message, "error");
  }
};

// Tab Switching
window.switchAdminTab = function(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');

  if (tabName === 'requests') {
    document.getElementById('requestsTabContent').style.display = 'block';
    document.getElementById('adminsTabContent').style.display = 'none';
  } else {
    document.getElementById('requestsTabContent').style.display = 'none';
    document.getElementById('adminsTabContent').style.display = 'block';
  }
};

// Manage Approved Admins
async function loadApprovedAdmins() {
  const container = document.getElementById('adminsList');
  if (!container) return;

  try {
    const snapshot = await getDocs(collection(db, "approvedAdmins"));
    let html = `
      <div style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span><strong>mayank198010@gmail.com</strong> (Founder / Master)</span>
        <span class="status completed" style="margin-bottom: 0;">Master</span>
      </div>
    `;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      html += `
        <div style="padding: 0.75rem 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>${data.email}</span>
          <button onclick="removeApprovedAdmin('${docSnap.id}')" class="btn secondary btn-sm" style="border-color:#ef4444; color:#ef4444; padding:0.25rem 0.5rem;"><i class="fa-solid fa-user-minus"></i> Remove</button>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error("Error loading approved admins:", err);
  }
}

window.addApprovedAdmin = async function() {
  const input = document.getElementById('newAdminEmail');
  const email = input?.value.trim();
  if (!email || !email.includes('@')) {
    showToast("Please enter a valid email address.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "approvedAdmins"), {
      email,
      addedAt: serverTimestamp(),
      addedBy: currentAdminUser?.email || 'master'
    });
    showToast(`Granted admin rights to ${email}`, 'success');
    input.value = '';
    loadApprovedAdmins();
  } catch (err) {
    console.error("Add admin error:", err);
    showToast("Failed to add admin: " + err.message, 'error');
  }
};

window.removeApprovedAdmin = async function(id) {
  if (!confirm("Revoke admin rights for this email?")) return;
  try {
    await deleteDoc(doc(db, "approvedAdmins", id));
    showToast("Admin access revoked.", "info");
    loadApprovedAdmins();
  } catch (err) {
    console.error("Revoke admin error:", err);
    showToast("Failed to revoke admin: " + err.message, 'error');
  }
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
  showToast("Data refreshed", "info");
};
