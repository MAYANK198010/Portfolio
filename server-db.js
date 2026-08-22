import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '.db');
if (!fs.existsSync(DB_DIR)) {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create .db directory:', e);
  }
}

// File paths
const PATHS = {
  requests: path.join(DB_DIR, 'requests.json'),
  users: path.join(DB_DIR, 'users.json'),
  messages: path.join(DB_DIR, 'messages.json'),
  admins: path.join(DB_DIR, 'admins.json'),
};

// Safe atomic file operations
function readJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(filePath, fallback);
      return fallback;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '{}');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`Error writing ${filePath}:`, e);
    }
  }
}

// Master Admin definitions
const MASTER_ADMINS = ['admin@mayankzen.in', 'mayank198010@gmail.com'];

// Initial seeds
function initSeeds() {
  // 1. Seed Admins
  const admins = readJSON(PATHS.admins, []);
  let updatedAdmins = Array.isArray(admins) ? [...admins] : [];
  MASTER_ADMINS.forEach(email => {
    if (!updatedAdmins.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === email.toLowerCase())) {
      updatedAdmins.push({
        email,
        name: email === 'mayank198010@gmail.com' ? 'Mayank (Founder)' : 'Studio Admin',
        role: 'admin',
        isMaster: true,
        addedAt: new Date().toISOString()
      });
    }
  });
  writeJSON(PATHS.admins, updatedAdmins);

  // 2. Seed Users
  const users = readJSON(PATHS.users, {});
  let usersChanged = false;
  MASTER_ADMINS.forEach(email => {
    const key = email.toLowerCase();
    if (!users[key]) {
      users[key] = {
        id: 'admin_' + key.replace(/[^a-zA-Z0-9]/g, '_'),
        email,
        name: email === 'mayank198010@gmail.com' ? 'Mayank (Founder)' : 'Studio Admin',
        role: 'admin',
        isMaster: true,
        createdAt: 'Primary System Account',
        lastActive: new Date().toISOString()
      };
      usersChanged = true;
    }
  });
  if (usersChanged) {
    writeJSON(PATHS.users, users);
  }

  // 3. Requests & Messages initialization
  readJSON(PATHS.requests, {});
  readJSON(PATHS.messages, {});
}

initSeeds();

export const ServerDB = {
  // =====================
  // REQUESTS OPERATIONS
  // =====================
  getAllRequests(filters = {}) {
    const reqs = readJSON(PATHS.requests, {});
    let list = Object.values(reqs);

    if (filters.email) {
      const emailLower = filters.email.toLowerCase().trim();
      list = list.filter(r => r.email && r.email.toLowerCase().trim() === emailLower);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(r => (r.status || '').toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.search) {
      const s = filters.search.toLowerCase().trim();
      list = list.filter(r =>
        (r.trackingId && r.trackingId.toLowerCase().includes(s)) ||
        (r.name && r.name.toLowerCase().includes(s)) ||
        (r.email && r.email.toLowerCase().includes(s)) ||
        (r.service && r.service.toLowerCase().includes(s))
      );
    }

    // Sort newest first
    list.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return list;
  },

  getRequestById(trackingId) {
    if (!trackingId) return null;
    const reqs = readJSON(PATHS.requests, {});
    const cleanId = trackingId.trim().toUpperCase();
    
    // Check direct key or case-insensitive match
    if (reqs[cleanId]) return reqs[cleanId];
    return Object.values(reqs).find(r => 
      r.trackingId && r.trackingId.toUpperCase() === cleanId
    ) || null;
  },

  saveRequest(requestData) {
    if (!requestData || !requestData.trackingId) {
      throw new Error('trackingId is required');
    }

    const reqs = readJSON(PATHS.requests, {});
    const key = requestData.trackingId.trim().toUpperCase();
    const existing = reqs[key] || {};

    const record = {
      ...existing,
      ...requestData,
      trackingId: key,
      budget: Number(requestData.budget) || existing.budget || 0,
      status: requestData.status || existing.status || 'Pending',
      attachments: requestData.attachments || existing.attachments || [],
      createdAt: existing.createdAt || requestData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    reqs[key] = record;
    writeJSON(PATHS.requests, reqs);

    // Auto-update user record for client
    if (record.email) {
      this.touchUserFromRequest(record);
    }

    return record;
  },

  updateRequest(trackingId, updates) {
    if (!trackingId) throw new Error('trackingId is required');
    const reqs = readJSON(PATHS.requests, {});
    const key = trackingId.trim().toUpperCase();

    if (!reqs[key]) {
      const found = Object.values(reqs).find(r => r.trackingId && r.trackingId.toUpperCase() === key);
      if (!found) return null;
      trackingId = found.trackingId;
    }

    const currentKey = trackingId.trim().toUpperCase();
    reqs[currentKey] = {
      ...reqs[currentKey],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    writeJSON(PATHS.requests, reqs);
    return reqs[currentKey];
  },

  deleteRequest(trackingId) {
    if (!trackingId) return false;
    const reqs = readJSON(PATHS.requests, {});
    const key = trackingId.trim().toUpperCase();

    let deleted = false;
    if (reqs[key]) {
      delete reqs[key];
      deleted = true;
    } else {
      for (const [k, v] of Object.entries(reqs)) {
        if (v.trackingId && v.trackingId.toUpperCase() === key) {
          delete reqs[k];
          deleted = true;
          break;
        }
      }
    }

    if (deleted) {
      writeJSON(PATHS.requests, reqs);
    }
    return deleted;
  },

  // =====================
  // USERS OPERATIONS
  // =====================
  getAllUsers() {
    const users = readJSON(PATHS.users, {});
    const requests = this.getAllRequests();
    const admins = this.getApprovedAdmins();

    // Map request counts per email
    const reqCountMap = {};
    requests.forEach(r => {
      if (r.email) {
        const e = r.email.toLowerCase().trim();
        reqCountMap[e] = (reqCountMap[e] || 0) + 1;
      }
    });

    const userList = Object.values(users).map(u => {
      const emailLower = (u.email || '').toLowerCase().trim();
      const isAdmin = MASTER_ADMINS.includes(emailLower) || 
                      admins.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === emailLower) ||
                      u.role === 'admin';
      const isMaster = MASTER_ADMINS.includes(emailLower);

      return {
        ...u,
        role: isAdmin ? 'admin' : 'user',
        isMaster,
        requestCount: reqCountMap[emailLower] || 0
      };
    });

    // Also include and persist any clients who submitted requests
    let usersUpdated = false;
    requests.forEach(r => {
      if (r.email) {
        const emailLower = r.email.toLowerCase().trim();
        if (!users[emailLower]) {
          const isAdm = MASTER_ADMINS.includes(emailLower) || admins.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === emailLower);
          const clientRecord = {
            id: 'client_' + emailLower.replace(/[^a-zA-Z0-9]/g, '_'),
            email: r.email,
            name: r.name || emailLower.split('@')[0] || 'Client',
            role: isAdm ? 'admin' : 'user',
            isMaster: MASTER_ADMINS.includes(emailLower),
            createdAt: r.createdAt || new Date().toISOString(),
            lastActive: r.createdAt || new Date().toISOString(),
            requestCount: reqCountMap[emailLower] || 1
          };
          users[emailLower] = clientRecord;
          usersUpdated = true;
          userList.push(clientRecord);
        }
      }
    });

    if (usersUpdated) {
      writeJSON(PATHS.users, users);
    }

    return userList;
  },

  getUserByEmailOrId(identifier) {
    if (!identifier) return null;
    const users = this.getAllUsers();
    const idLower = identifier.toLowerCase().trim();
    return users.find(u => 
      (u.id && u.id.toLowerCase() === idLower) ||
      (u.email && u.email.toLowerCase() === idLower)
    ) || null;
  },

  saveUser(userData) {
    if (!userData || !userData.email) {
      throw new Error('Email is required for user record');
    }

    const users = readJSON(PATHS.users, {});
    const emailLower = userData.email.toLowerCase().trim();
    const existing = users[emailLower] || {};

    const isMaster = MASTER_ADMINS.includes(emailLower);
    const isAdmin = isMaster || userData.role === 'admin' || existing.role === 'admin';

    const record = {
      ...existing,
      ...userData,
      id: userData.id || existing.id || ('usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      email: userData.email,
      name: userData.name || existing.name || emailLower.split('@')[0],
      role: isAdmin ? 'admin' : 'user',
      isMaster,
      createdAt: existing.createdAt || userData.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    users[emailLower] = record;
    writeJSON(PATHS.users, users);
    return record;
  },

  touchUserFromRequest(request) {
    if (!request.email) return;
    const emailLower = request.email.toLowerCase().trim();
    const users = readJSON(PATHS.users, {});
    if (!users[emailLower]) {
      users[emailLower] = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        email: request.email,
        name: request.name || 'Client',
        role: MASTER_ADMINS.includes(emailLower) ? 'admin' : 'user',
        createdAt: request.createdAt || new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      writeJSON(PATHS.users, users);
    }
  },

  updateUserRole(emailOrId, role) {
    const users = readJSON(PATHS.users, {});
    const emailKey = emailOrId.toLowerCase().trim();

    // Find the record
    let targetKey = null;
    if (users[emailKey]) {
      targetKey = emailKey;
    } else {
      for (const [k, v] of Object.entries(users)) {
        if (v.id === emailOrId || (v.email && v.email.toLowerCase() === emailKey)) {
          targetKey = k;
          break;
        }
      }
    }

    if (!targetKey) {
      // Create user if not yet stored
      targetKey = emailKey;
      users[targetKey] = {
        id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        email: emailKey,
        name: emailKey.split('@')[0],
        createdAt: new Date().toISOString()
      };
    }

    if (MASTER_ADMINS.includes(targetKey)) {
      // Cannot demote master founder
      role = 'admin';
    }

    users[targetKey].role = role;
    users[targetKey].updatedAt = new Date().toISOString();
    writeJSON(PATHS.users, users);

    // Also update admins table if needed
    if (role === 'admin') {
      this.addApprovedAdmin(users[targetKey].email, users[targetKey].name);
    } else {
      this.removeApprovedAdmin(users[targetKey].email);
    }

    return users[targetKey];
  },

  deleteUser(emailOrId) {
    const emailKey = emailOrId.toLowerCase().trim();
    if (MASTER_ADMINS.includes(emailKey)) {
      return false; // Cannot delete master accounts
    }

    const users = readJSON(PATHS.users, {});
    let deleted = false;
    if (users[emailKey]) {
      delete users[emailKey];
      deleted = true;
    } else {
      for (const [k, v] of Object.entries(users)) {
        if (v.id === emailOrId || (v.email && v.email.toLowerCase() === emailKey)) {
          delete users[k];
          deleted = true;
          break;
        }
      }
    }

    if (deleted) {
      writeJSON(PATHS.users, users);
    }
    return deleted;
  },

  // =====================
  // CHAT MESSAGES OPERATIONS
  // =====================
  getMessages(requestId) {
    if (!requestId) return [];
    const allMsgs = readJSON(PATHS.messages, {});
    const key = requestId.trim().toUpperCase();
    return allMsgs[key] || [];
  },

  saveMessage(requestId, message) {
    if (!requestId || !message) throw new Error('requestId and message are required');
    const allMsgs = readJSON(PATHS.messages, {});
    const key = requestId.trim().toUpperCase();

    if (!allMsgs[key]) {
      allMsgs[key] = [];
    }

    const msgRecord = {
      id: message.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      text: message.text || '',
      uid: message.uid || 'anonymous',
      sender: message.sender || 'client',
      type: message.type || (message.fileId ? 'file' : 'text'),
      timestamp: message.timestamp || Date.now(),
      fileId: message.fileId || null,
      fileUrl: message.fileUrl || (message.fileId ? `/api/attachments/${message.fileId}` : null),
      filename: message.filename || null,
      fileType: message.fileType || null,
      fileSize: message.fileSize || null
    };

    allMsgs[key].push(msgRecord);
    writeJSON(PATHS.messages, allMsgs);
    return msgRecord;
  },

  // =====================
  // ADMINS OPERATIONS
  // =====================
  getApprovedAdmins() {
    const raw = readJSON(PATHS.admins, []);
    let list = Array.isArray(raw) ? raw : [];
    
    // Ensure masters are included
    MASTER_ADMINS.forEach(m => {
      if (!list.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === m.toLowerCase())) {
        list.push({
          email: m,
          name: m === 'mayank198010@gmail.com' ? 'Mayank (Founder)' : 'Studio Admin',
          role: 'admin',
          isMaster: true,
          addedAt: 'Master Access'
        });
      }
    });
    return list;
  },

  addApprovedAdmin(email, name = '') {
    if (!email) throw new Error('Email is required');
    const emailLower = email.toLowerCase().trim();
    const list = this.getApprovedAdmins();

    if (!list.some(a => (typeof a === 'string' ? a : a.email).toLowerCase() === emailLower)) {
      list.push({
        email: emailLower,
        name: name || emailLower.split('@')[0],
        role: 'admin',
        isMaster: MASTER_ADMINS.includes(emailLower),
        addedAt: new Date().toISOString()
      });
      writeJSON(PATHS.admins, list);
    }
    return list;
  },

  removeApprovedAdmin(email) {
    if (!email) return false;
    const emailLower = email.toLowerCase().trim();
    if (MASTER_ADMINS.includes(emailLower)) {
      return false; // Cannot remove master founder
    }

    let list = this.getApprovedAdmins();
    list = list.filter(a => (typeof a === 'string' ? a : a.email).toLowerCase() !== emailLower);
    writeJSON(PATHS.admins, list);
    return true;
  },

  // =====================
  // METRICS & STATS
  // =====================
  getStats() {
    const reqs = this.getAllRequests();
    const users = this.getAllUsers();
    
    const pendingCount = reqs.filter(r => (r.status || 'Pending').toLowerCase() === 'pending').length;
    const activeCount = reqs.filter(r => (r.status || '').toLowerCase() === 'working' || (r.status || '').toLowerCase() === 'review').length;
    const completedCount = reqs.filter(r => (r.status || '').toLowerCase() === 'completed').length;
    const totalRevenue = reqs.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);

    const adminCount = users.filter(u => u.role === 'admin').length;
    const clientCount = users.filter(u => u.role !== 'admin').length;

    return {
      totalRequests: reqs.length,
      pendingCount,
      activeCount,
      completedCount,
      totalRevenue,
      totalUsers: users.length,
      adminCount,
      clientCount
    };
  }
};
