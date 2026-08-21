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
  }, 4000);
}

const urlParams = new URLSearchParams(window.location.search);
const redirectTarget = urlParams.get('redirect') || '/dashboard/';

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const forgotPassBtn = document.getElementById("forgotPasswordBtn");

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

      try {
        await sendEmailVerification(user);
      } catch (e) {
        console.warn("Email verification could not be sent:", e);
      }

      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        role: email === "mayank198010@gmail.com" ? "admin" : "user",
        createdAt: new Date()
      });

      showToast("Account created successfully! Redirecting to login...", "success");
      setTimeout(() => {
        window.location.href = "/login/";
      }, 1500);

    } catch (error) {
      console.error("Registration error:", error);
      showToast(error.message || "Registration failed.", "error");
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Auto save or update user doc
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          name: user.displayName || email.split('@')[0],
          email: email,
          role: email === "mayank198010@gmail.com" ? "admin" : "user",
          createdAt: new Date()
        });
      }

      showToast("Signed in successfully!", "success");
      setTimeout(() => {
        window.location.href = redirectTarget;
      }, 1000);

    } catch (error) {
      console.error("Login error:", error);
      showToast("Invalid email or password.", "error");
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
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Save user to Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          role: user.email === "mayank198010@gmail.com" ? "admin" : "user",
          createdAt: new Date()
        });
      }

      showToast("Google sign in successful!", "success");
      setTimeout(() => {
        window.location.href = redirectTarget;
      }, 1000);
    } catch (err) {
      console.error("Google Auth error:", err);
      showToast("Google sign in failed: " + err.message, "error");
    }
  });
}

/* =========================
   PASSWORD RESET
========================= */
if (forgotPassBtn) {
  forgotPassBtn.addEventListener("click", async () => {
    const email = prompt("Enter your registered email address to receive password reset instructions:");
    if (!email) return;

    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Password reset link sent to your email!", "success");
    } catch (err) {
      console.error("Reset error:", err);
      showToast("Could not send reset email: " + err.message, "error");
    }
  });
}
