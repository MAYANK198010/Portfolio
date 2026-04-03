import { auth, db } from "./firebase.js";
import { 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  doc, getDoc, getDocs, collection, query, where, updateDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Check if user is approved admin (controlled by main admin)
async function isApprovedAdmin(userUid) {
  try {
    // Check users doc role first
    const userDoc = await getDoc(doc(db, "users", userUid));
    if (!userDoc.exists()) return false;
    const userData = userDoc.data();
    
    // Main admin auto-approved
    if (userData.email === 'mayank198010@gmail.com') return true;
    
    // Check approvedAdmins list
    const approvedSnap = await getDocs(collection(db, "approvedAdmins"));
    return approvedSnap.docs.some(d => d.data().email === userData.email);
  } catch (e) {
    console.error('Admin check error:', e);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "/login/";
    return;
  }

  const isAdmin = await isApprovedAdmin(user.uid);
  if (!isAdmin) {
    alert("Access Denied: Admin privileges required (contact mayank198010@gmail.com)");
    await signOut(auth);
    location.href = "/";
    return;
  }

  // Load requests...
  loadRequests();
});


const table = document.getElementById("requestsTable");

async function loadRequests(){

const snapshot = await getDocs(collection(db,"service_requests"));

let stats = {total: 0, pending: 0, working: 0, completed: 0};

snapshot.forEach((request)=>{

const data = request.data();

stats.total++;
stats[data.status || 'pending'] = (stats[data.status || 'pending'] || 0) + 1;

const row = document.createElement("tr");

row.innerHTML = `
<td>${data.name}</td>
<td>${data.service}</td>
<td>
<select data-id="${request.id}" class="statusSelect">
<option ${data.status=='Pending'?'selected':''}>Pending</option>
<option ${data.status=='Working'?'selected':''}>Working</option>
<option ${data.status=='Completed'?'selected':''}>Completed</option>
</select>
</td>
<td>${data.trackingId}</td>
<td><a href="/request/${data.trackingId}" target="_blank">Chat</a></td>
<td><button onclick="viewDesc('${request.id}')">View</button></td>
`;

table.appendChild(row);

});

listenStatusChange();

// Update stats
document.getElementById('totalRequests').textContent = stats.total;
document.getElementById('pendingCount').textContent = stats.pending;
document.getElementById('activeCount').textContent = stats.working;
document.getElementById('completeCount').textContent = stats.completed;

// Update chart
updateChart(stats);
}

function listenStatusChange(){

const selects = document.querySelectorAll(".statusSelect");

selects.forEach(select=>{

select.addEventListener("change", async ()=>{

const id = select.dataset.id;

const newStatus = select.value;

await updateDoc(doc(db,"service_requests",id),{
status:newStatus
});

alert("Status updated");

});

});

}


// Chart.js integration
let chart;

async function updateChart(stats) {
  const ctx = document.getElementById('statusChart')?.getContext('2d');
  if (!ctx || chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'Working', 'Completed'],
      datasets: [{
        data: [stats.pending, stats.working, stats.completed],
        backgroundColor: ['#fbbf24', '#3b82f6', '#10b981']
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' }}
    }
  });
}

// Description view
window.viewDesc = async (id) => {
  const docSnap = await getDoc(doc(db, 'service_requests', id));
  if (docSnap.exists()) alert(docSnap.data().description);
};

listenStatusChange();
loadRequests();
