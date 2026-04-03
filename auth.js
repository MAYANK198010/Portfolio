import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");


/* =========================
   REGISTER SYSTEM
========================= */

if (registerBtn) {

  registerBtn.addEventListener("click", async () => {

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!name || !email || !password) {
      alert("Please fill all fields.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    try {

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔐 Send Email Verification
      await sendEmailVerification(user);

      // 🔥 Save User in Firestore
      await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        role: email === "mayank198010@gmail.com" ? "admin" : "user",
        createdAt: new Date()
      });

      alert("Account created successfully! Please verify your email before logging in.");

      window.location.href = "/login/";

    } catch (error) {
      alert(error.message);
    }

  });

}


/* =========================
   LOGIN SYSTEM
========================= */

if (loginBtn) {

  loginBtn.addEventListener("click", async () => {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    try {

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🚫 Block unverified users
      if (!user.emailVerified) {
        alert("Please verify your email before logging in.");
        return;
      }

      window.location.href = "/dashboard/";

    } catch (error) {
      alert("Invalid email or password.");
    }

  });

}
