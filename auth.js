import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Toast Notification Helper
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
  }, 4500);
}

// Friendly Firebase Auth Error Formatter
function formatAuthError(error) {
  if (!error) return "An unexpected error occurred. Please try again.";
  const code = error.code || '';
  const message = error.message || '';

  if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
    return 'unauthorized-domain';
  }
  if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
    return 'Google sign-in window was closed before completing.';
  }
  if (code === 'auth/popup-blocked' || message.includes('popup-blocked')) {
    return 'Sign-in popup was blocked by browser. Please allow popups for this domain.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Sign-in was cancelled.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'This email address is already registered. Please sign in instead.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Invalid email or password. Please verify your credentials.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please wait a moment or reset your password.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection.';
  }

  return message.replace('Firebase: ', '').replace(/\(auth\/[^)]+\)\.?/, '').trim() || 'Authentication failed. Please try again.';
}

// Show Firebase Domain Authorization Modal
function showDomainAuthModal() {
  const currentHost = window.location.hostname;
  let modal = document.getElementById('firebaseDomainModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'firebaseDomainModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 580px; text-align: left;">
        <button class="modal-close" onclick="document.getElementById('firebaseDomainModal').classList.remove('open')">&times;</button>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(234, 67, 53, 0.15); border: 1px solid #ea4335; display: flex; align-items: center; justify-content: center; color: #ea4335; font-size: 1.25rem;">
            <i class="fa-brands fa-google"></i>
          </div>
          <div>
            <h3 style="color: #ffffff; margin: 0; font-size: 1.2rem;">Firebase Domain Whitelist Required</h3>
            <p style="color: var(--text-secondary); margin: 0; font-size: 0.85rem;">Google OAuth security restriction</p>
          </div>
        </div>

        <p style="color: #cbd5e1; font-size: 0.92rem; line-height: 1.6; margin-bottom: 1rem;">
          Google popup sign-in requires this web host domain to be whitelisted in your Firebase Console project (<strong>matnix-studios</strong>):
        </p>

        <div style="background: rgba(0, 0, 0, 0.6); border: 1px solid var(--primary-purple); border-radius: 8px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem;">
          <code id="currentHostCode" style="color: var(--accent-green); font-family: monospace; font-size: 0.9rem; word-break: break-all;">${currentHost}</code>
          <button id="copyDomainBtn" class="btn secondary btn-sm" style="white-space: nowrap; padding: 0.4rem 0.8rem; font-size: 0.8rem;">
            <i class="fa-solid fa-copy"></i> Copy
          </button>
        </div>

        <div style="background: rgba(139, 92, 246, 0.1); border-left: 3px solid var(--primary-purple); padding: 0.85rem; border-radius: 0 8px 8px 0; margin-bottom: 1.5rem; font-size: 0.88rem; color: #e2e8f0;">
          <strong>Quick Setup Steps:</strong>
          <ol style="margin: 0.5rem 0 0 1.2rem; padding: 0; line-height: 1.5;">
            <li>Go to <a href="https://console.firebase.google.com/project/matnix-studios/authentication/settings" target="_blank" style="color: var(--accent-green); text-decoration: underline;">Firebase Console &gt; Authentication &gt; Settings</a></li>
            <li>Scroll to <strong>Authorized domains</strong> and click <strong>Add domain</strong></li>
            <li>Paste <code style="color: var(--accent-green);">${currentHost}</code> and Save</li>
          </ol>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: flex-end; align-items: center;">
          <span style="color: var(--text-secondary); font-size: 0.85rem; margin-right: auto;">💡 Tip: You can register or log in with Email &amp; Password right now!</span>
          <button type="button" class="btn primary btn-sm" onclick="document.getElementById('firebaseDomainModal').classList.remove('open')">
            Use Email &amp; Password
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const copyBtn = modal.querySelector('#copyDomainBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentHost).then(() => {
          copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
          }, 2000);
        });
      });
    }
  }

  modal.classList.add('open');
}

// Expose modal trigger globally
window.showDomainAuthModal = showDomainAuthModal;

const urlParams = new URLSearchParams(window.location.search);
const redirectParam = urlParams.get('redirect');

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const forgotPassBtn = document.getElementById("forgotPasswordBtn");

// Helper to check if email is admin
function isStudioAdminEmail(email) {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return clean === 'admin@mayankzen.in' || clean === 'mayank198010@gmail.com';
}

// Check if user is already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (window.location.pathname.includes('/login') || window.location.pathname.includes('/register')) {
      // If user came to login while logged in, let them redirect if they want or stay
    }
  }
});

/* =========================
   REGISTER SYSTEM
========================= */
if (registerBtn) {
  registerBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    if (!name || !email || !password) {
      showToast("Please fill in all fields.", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    registerBtn.disabled = true;
    registerBtn.innerHTML = '<span class="loading"></span> Creating Account...';

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const isAdminAccount = isStudioAdminEmail(email);

      try {
        await sendEmailVerification(user);
      } catch (e) {
        console.warn("Email verification could not be sent:", e);
      }

      // 1. Immediately persist client user to Server Database (primary source of truth)
      try {
        await fetch('/api/db/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.uid,
            name: name,
            email: email,
            role: isAdminAccount ? "admin" : "user",
            createdAt: new Date().toISOString()
          })
        });
      } catch (srvErr) {
        console.debug("Server DB registration sync notice:", srvErr);
      }

      // 2. Safely attempt Firestore user record write
      try {
        await setDoc(doc(db, "users", user.uid), {
          name: name,
          email: email,
          role: isAdminAccount ? "admin" : "user",
          createdAt: new Date()
        });
      } catch (fsErr) {
        console.debug("Firestore registration profile notice (using server DB):", fsErr?.message || fsErr);
      }

      showToast("Account created successfully! Redirecting to login...", "success");
      setTimeout(() => {
        window.location.href = "/login/";
      }, 1500);

    } catch (error) {
      const formatted = formatAuthError(error);
      if (formatted === 'unauthorized-domain') {
        console.warn("Registration domain notice:", window.location.hostname);
        showDomainAuthModal();
      } else {
        console.warn("Registration notice:", error?.message || error);
        showToast(formatted, "error");
      }
    } finally {
      registerBtn.disabled = false;
      registerBtn.innerHTML = 'Create Account';
    }
  });
}

/* =========================
   LOGIN SYSTEM
========================= */
if (loginBtn) {
  loginBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    if (!email || !password) {
      showToast("Please enter email and password.", "error");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading"></span> Signing in...';

    try {
      let userCredential;
      const isAdminAttempt = isStudioAdminEmail(email);

      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr) {
        // If admin@mayankzen.in is logging in with admin@mayankzen.in for the first time, auto-provision
        if (isAdminAttempt && (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential')) {
          try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
          } catch (createErr) {
            throw signInErr;
          }
        } else {
          throw signInErr;
        }
      }

      const user = userCredential.user;
      const isAdmin = isStudioAdminEmail(user.email);
      const uName = isAdmin ? "MayankZen Admin" : (user.displayName || email.split('@')[0]);

      // 1. Immediately sync to persistent server database
      try {
        await fetch('/api/db/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.uid,
            name: uName,
            email: email,
            role: isAdmin ? "admin" : "user",
            createdAt: new Date().toISOString()
          })
        });
      } catch (srvErr) {
        console.debug("Server DB login sync note:", srvErr);
      }

      // 2. Safe Firestore user document update
      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            name: uName,
            email: email,
            role: isAdmin ? "admin" : "user",
            createdAt: new Date()
          });
        } else if (isAdmin && userDoc.data().role !== 'admin') {
          await setDoc(userRef, { role: 'admin' }, { merge: true });
        }
      } catch (e) {
        console.debug("User doc Firestore sync note:", e?.message || e);
      }

      // Track admin status in local cache
      if (isAdmin) {
        localStorage.setItem('mayankzen_is_admin', 'true');
        localStorage.setItem('mayankzen_admin_email', user.email);
      } else {
        localStorage.removeItem('mayankzen_is_admin');
        localStorage.removeItem('mayankzen_admin_email');
      }

      showToast(isAdmin ? "Welcome to Admin Operations Center!" : "Signed in successfully!", "success");

      // Strictly enforce destination: Only admin account gets admin panel, rest users get dashboard
      let targetUrl = '/dashboard/';
      if (isAdmin) {
        targetUrl = redirectParam && redirectParam.includes('admin') ? redirectParam : '/admin.html';
      } else {
        targetUrl = redirectParam && !redirectParam.includes('admin') ? redirectParam : '/dashboard/';
      }

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1000);

    } catch (error) {
      const formatted = formatAuthError(error);
      if (formatted === 'unauthorized-domain') {
        console.warn("Login domain notice:", window.location.hostname);
        showDomainAuthModal();
      } else {
        console.warn("Login notice:", error?.message || error);
        showToast(formatted, "error");
      }
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'Sign In';
    }
  });
}

/* =========================
   GOOGLE SIGN-IN
========================= */
if (googleLoginBtn) {
  googleLoginBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    googleLoginBtn.disabled = true;
    const originalText = googleLoginBtn.innerHTML;
    googleLoginBtn.innerHTML = '<span class="loading"></span> Connecting Google...';

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const isAdmin = isStudioAdminEmail(user.email);
      const uName = user.displayName || user.email?.split('@')[0] || 'User';

      // 1. Immediately sync to server DB
      try {
        await fetch('/api/db/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.uid,
            name: uName,
            email: user.email,
            role: isAdmin ? "admin" : "user",
            createdAt: new Date().toISOString()
          })
        });
      } catch (err) {
        console.debug("Server DB google sync notice:", err);
      }

      // 2. Safe Firestore user profile save
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            name: uName,
            email: user.email,
            role: isAdmin ? "admin" : "user",
            createdAt: new Date()
          });
        }
      } catch (e) {
        console.debug("Google user profile Firestore notice:", e?.message || e);
      }

      if (isAdmin) {
        localStorage.setItem('mayankzen_is_admin', 'true');
        localStorage.setItem('mayankzen_admin_email', user.email);
      } else {
        localStorage.removeItem('mayankzen_is_admin');
        localStorage.removeItem('mayankzen_admin_email');
      }

      showToast(isAdmin ? "Welcome Admin!" : "Google sign in successful!", "success");

      // Strictly enforce destination
      let targetUrl = '/dashboard/';
      if (isAdmin) {
        targetUrl = redirectParam && redirectParam.includes('admin') ? redirectParam : '/admin.html';
      } else {
        targetUrl = redirectParam && !redirectParam.includes('admin') ? redirectParam : '/dashboard/';
      }

      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1000);
    } catch (err) {
      const formatted = formatAuthError(err);
      if (formatted === 'unauthorized-domain') {
        console.warn("Firebase Auth Notice: Hostname is not yet whitelisted in Firebase Console Authorized Domains:", window.location.hostname);
        showToast("Firebase domain whitelist required for Google popup. See guide below.", "info");
        showDomainAuthModal();
      } else {
        console.warn("Google Auth notice:", err?.message || err);
        showToast(formatted, "error");
      }
    } finally {
      googleLoginBtn.disabled = false;
      googleLoginBtn.innerHTML = originalText;
    }
  });
}

/* =========================
   PASSWORD RESET
========================= */
if (forgotPassBtn) {
  forgotPassBtn.addEventListener("click", async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const emailInput = document.getElementById("email");
    let email = emailInput ? emailInput.value.trim() : '';

    if (!email) {
      email = prompt("Enter your registered email address to receive password reset instructions:");
      if (email) email = email.trim();
    }

    if (!email) {
      showToast("Please enter your email address in the field above or prompt.", "info");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      showToast(`Password reset link sent to ${email}! Check your inbox.`, "success");
    } catch (err) {
      console.warn("Reset notice:", err?.message || err);
      const formatted = formatAuthError(err);
      showToast(formatted, "error");
    }
  });
}
