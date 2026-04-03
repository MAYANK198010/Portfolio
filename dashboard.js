import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "/login/";
  } else {

    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      userInfo.innerHTML = `
        <div class="dashboard-card">
          <h3>Welcome, ${data.name}</h3>
<p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Role:</strong> ${data.role || 'user'}</p>
          <p><strong>Member Since:</strong> ${new Date(data.createdAt.seconds * 1000).toLocaleDateString()}</p>
        </div>
      `;
    }
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login/";
});
