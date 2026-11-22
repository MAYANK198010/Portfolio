import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
// Use Firestore Lite (stateless HTTPS REST) on the Node server to avoid
// persistent gRPC 'Listen' streams dropping with HTTP/2 RST_STREAM code 2 in Cloud Run.
import { getFirestore, collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore/lite';
import { getDatabase, ref, onChildAdded, get } from 'firebase/database';
import { ServerDB } from './server-db.js';
import { sendAllProjectSubmissionEmails, getEmailLogs } from './emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write'
});

// In-memory set of tracking IDs already processed in this runtime
const processedTrackingIds = new Set();
let isInitialized = false;
let isSweeping = false;
let sweepIntervalId = null;

// Load config
const configPath = path.join(__dirname, 'firebase-applet-config.json');
let firebaseConfig = null;
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error('[FirebaseBridge] Failed to load firebase-applet-config.json:', e.message);
}

let app = null;
let db = null;
let rtdb = null;

if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig, 'server-bridge');
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') {
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } else {
      db = getFirestore(app);
    }
    if (firebaseConfig.databaseURL) {
      rtdb = getDatabase(app);
    }
    console.log('[FirebaseBridge] Firebase Bridge initialized (Firestore Lite REST mode).');
  } catch (err) {
    console.error('[FirebaseBridge] Failed to initialize Firebase Bridge:', err.message);
  }
}

function logFirestoreError(error, operationType, pathStr) {
  const message = error instanceof Error ? error.message : String(error);
  const errInfo = {
    error: message,
    operationType,
    path: pathStr,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: true,
      tenantId: null,
      providerInfo: []
    }
  };
  if (message.includes('Missing or insufficient permissions') || message.includes('PERMISSION_DENIED')) {
    console.error('[FirebaseBridge] Firestore Permission Error:', JSON.stringify(errInfo));
  } else {
    console.warn(`[FirebaseBridge] Firestore ${operationType} notice (${pathStr}):`, message);
  }
}

async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDoc(doc(db, 'test', 'connection'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('[FirebaseBridge] Please check your Firebase configuration (client offline).');
    }
    // Expected permission denial on /test/connection confirms Firestore endpoint is reachable
  }
}

/**
 * Checks if an email has already been dispatched for this tracking ID
 */
function hasAlreadyDispatched(trackingId) {
  if (!trackingId) return true;
  if (processedTrackingIds.has(trackingId)) return true;

  try {
    const logs = getEmailLogs();
    const found = logs.some(l => l.trackingId === trackingId && (l.sentLive || l.adminSent || l.type === 'admin_alert'));
    if (found) {
      processedTrackingIds.add(trackingId);
      return true;
    }
  } catch (e) {}

  return false;
}

/**
 * Processes an incoming service request from any cloud channel (Firestore or RTDB)
 */
export async function processIncomingRequest(requestData, docId = null) {
  if (!requestData || !requestData.trackingId) return;

  const trackingId = requestData.trackingId;

  // Prevent double-processing
  if (hasAlreadyDispatched(trackingId)) {
    return;
  }

  processedTrackingIds.add(trackingId);
  console.log(`[FirebaseBridge] Detected new project request [${trackingId}] from client/device! Processing...`);

  // 1. Sync to local ServerDB so Admin Console displays it immediately
  try {
    ServerDB.saveRequest(requestData);
  } catch (err) {
    console.debug('[FirebaseBridge] Local ServerDB sync notice:', err.message);
  }

  // 2. Dispatch Automated Emails (Admin alert to account@mayankzen.in + Client confirmation)
  let emailResult = null;
  try {
    emailResult = await sendAllProjectSubmissionEmails(requestData);
    console.log(`[FirebaseBridge] Emails dispatched for [${trackingId}]:`, {
      adminSent: emailResult.adminSent,
      clientSent: emailResult.clientSent,
      unblockRequired: emailResult.unblockRequired
    });
  } catch (err) {
    console.error(`[FirebaseBridge] Error dispatching emails for [${trackingId}]:`, err.message);
  }

  // 3. Mark Firestore document as processed if docId provided
  if (db && docId) {
    try {
      await updateDoc(doc(db, 'service_requests', docId), {
        emailDispatched: true,
        emailDispatchedAt: new Date().toISOString(),
        processedByServer: true
      });
    } catch (e) {
      logFirestoreError(e, OperationType.UPDATE, `service_requests/${docId}`);
    }
  }
}

/**
 * Sweeps Firestore (via stateless REST) and RTDB for any unsent requests
 */
export async function sweepUnsentRequests() {
  if (!db || isSweeping) return;
  isSweeping = true;

  try {
    try {
      const snapshot = await getDocs(collection(db, 'service_requests'));
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data && data.trackingId && !data.emailDispatched) {
          if (!hasAlreadyDispatched(data.trackingId)) {
            await processIncomingRequest(data, docSnap.id);
          }
        }
      }
    } catch (err) {
      logFirestoreError(err, OperationType.LIST, 'service_requests');
    }

    // Also sweep Realtime Database if configured
    if (rtdb) {
      try {
        const snap = await get(ref(rtdb, 'service_requests'));
        if (snap.exists()) {
          const val = snap.val();
          for (const [, req] of Object.entries(val)) {
            if (req && req.trackingId && !req.emailDispatched) {
              if (!hasAlreadyDispatched(req.trackingId)) {
                await processIncomingRequest(req);
              }
            }
          }
        }
      } catch (err) {
        console.debug('[FirebaseBridge] Sweep RTDB notice:', err.message);
      }
    }
  } finally {
    isSweeping = false;
  }
}

/**
 * Starts cloud bridge sync using stateless Firestore Lite REST polling & RTDB listener
 */
export function startFirebaseBridge() {
  if (isInitialized || !db) return;
  isInitialized = true;

  console.log('[FirebaseBridge] Starting Firestore REST sync & Realtime DB listener...');
  testFirestoreConnection();

  // 1. Real-time Realtime Database Listener (with error callback)
  if (rtdb) {
    try {
      onChildAdded(
        ref(rtdb, 'service_requests'),
        (snap) => {
          const data = snap.val();
          if (data && data.trackingId && !data.emailDispatched) {
            processIncomingRequest(data);
          }
        },
        (err) => {
          console.debug('[FirebaseBridge] Realtime DB listener notice:', err?.message || err);
        }
      );
    } catch (err) {
      console.warn('[FirebaseBridge] Realtime DB listener setup notice:', err.message);
    }
  }

  // 2. Initial sweep of any existing unsent submissions
  setTimeout(() => {
    sweepUnsentRequests();
  }, 1000);

  // 3. Fast stateless REST polling every 10 seconds (immune to gRPC RST_STREAM drops)
  if (sweepIntervalId) clearInterval(sweepIntervalId);
  sweepIntervalId = setInterval(() => {
    sweepUnsentRequests();
  }, 10000);
}
