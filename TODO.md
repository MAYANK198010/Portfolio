# 3D Models Fix TODO

1. [x] Robustify Three.js init in script.js (error handling, WebGL check)
2. [x] Update Three.js CDN to latest (r128 → r161)
3. [x] Test on live-server http://localhost:8080/index.html - Fixed THREE undefined + Skypack error (switched to unpkg.com)
4. [x] Check console for load errors - Now expects "✅ 3D city hero initialized successfully"
5. [x] 3D Three.js fixed (module CDN unpkg, error handling)

**NEW AUTH TASKS:**
1. [x] Add auth listener to script.js (nav update, persist) — hides login/register when logged in, shows logout
2. [x] Fix admin.js (approvedAdmins Firestore check — main email auto, others via collection)
3. [x] dashboard.js already has auth (user info + logout)
4. [x] Test login persist/nav hide — live-server reload tests
5. [x] Added enhanced CSS to request service page (glassmorphism chat/form matching theme)
6. [ ] attempt_completion

