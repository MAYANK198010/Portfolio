import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ServerDB } from './server-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Attachments storage directory
const ATTACHMENTS_DIR = path.join(__dirname, '.attachments');
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  try {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create attachments dir:', e);
  }
}

// In-memory metadata map for fast lookups
const attachmentMetaStore = new Map();

// Enable JSON body parsing with large limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets
app.use(express.static(__dirname));

/* ==============================================
   LOCAL SERVER DATABASE (REST APIS)
   Ensures all data is persistently stored on disk
   and never vanishes after logout or cache purge.
============================================== */

// --- 1. Requests API ---
app.get('/api/db/requests', (req, res) => {
  try {
    const { email, status, search } = req.query;
    const requests = ServerDB.getAllRequests({ email, status, search });
    res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error('API get requests error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/db/requests/:id', (req, res) => {
  try {
    const request = ServerDB.getRequestById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/db/requests', (req, res) => {
  try {
    const saved = ServerDB.saveRequest(req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    console.error('API save request error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/db/requests/:id', (req, res) => {
  try {
    const updated = ServerDB.updateRequest(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/db/requests/:id', (req, res) => {
  try {
    const deleted = ServerDB.deleteRequest(req.params.id);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- 2. Users API (Divided into Admins and Clients) ---
app.get('/api/db/users', (req, res) => {
  try {
    const users = ServerDB.getAllUsers();
    const adminUsers = users.filter(u => u.role === 'admin');
    const clientUsers = users.filter(u => u.role !== 'admin');

    res.json({
      success: true,
      total: users.length,
      adminsCount: adminUsers.length,
      clientsCount: clientUsers.length,
      data: users,
      admins: adminUsers,
      clients: clientUsers
    });
  } catch (err) {
    console.error('API get users error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/db/users/:idOrEmail', (req, res) => {
  try {
    const user = ServerDB.getUserByEmailOrId(req.params.idOrEmail);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/db/users', (req, res) => {
  try {
    const saved = ServerDB.saveUser(req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/db/users/:idOrEmail/role', (req, res) => {
  try {
    const { role } = req.body;
    if (!role || (role !== 'admin' && role !== 'user')) {
      return res.status(400).json({ success: false, message: 'Role must be "admin" or "user"' });
    }
    const updated = ServerDB.updateUserRole(req.params.idOrEmail, role);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/db/users/:idOrEmail', (req, res) => {
  try {
    const deleted = ServerDB.deleteUser(req.params.idOrEmail);
    if (!deleted) {
      return res.status(400).json({ success: false, message: 'Cannot delete master account or user not found' });
    }
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- 3. Chat Messages API ---
app.get('/api/db/messages/:requestId', (req, res) => {
  try {
    const msgs = ServerDB.getMessages(req.params.requestId);
    res.json({ success: true, data: msgs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/db/messages/:requestId', (req, res) => {
  try {
    const saved = ServerDB.saveMessage(req.params.requestId, req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- 4. Approved Admins API ---
app.get('/api/db/admins', (req, res) => {
  try {
    const admins = ServerDB.getApprovedAdmins();
    res.json({ success: true, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/db/admins', (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    const list = ServerDB.addApprovedAdmin(email, name);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/db/admins/:email', (req, res) => {
  try {
    const removed = ServerDB.removeApprovedAdmin(req.params.email);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- 5. Overall System Stats API ---
app.get('/api/db/stats', (req, res) => {
  try {
    const stats = ServerDB.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Attachment Upload API
app.post('/api/upload', (req, res) => {
  try {
    const { name, type, size, dataUrl, fileId } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ success: false, message: 'No file data provided' });
    }

    const safeName = (name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
    const id = fileId || ('att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    
    // Extract base64 content
    let base64Data = dataUrl;
    let mimeType = type || 'application/octet-stream';

    if (dataUrl.includes(';base64,')) {
      const parts = dataUrl.split(';base64,');
      mimeType = parts[0].replace('data:', '') || mimeType;
      base64Data = parts[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(ATTACHMENTS_DIR, id);

    fs.writeFileSync(filePath, buffer);

    const meta = {
      id,
      name: name || safeName,
      type: mimeType,
      size: size || buffer.length,
      createdAt: Date.now()
    };
    attachmentMetaStore.set(id, meta);

    // Also write a meta JSON sidecar for persistence
    try {
      fs.writeFileSync(filePath + '.json', JSON.stringify(meta));
    } catch (e) {}

    const fileUrl = `/api/attachments/${id}`;
    res.json({
      success: true,
      fileId: id,
      fileUrl: fileUrl,
      name: meta.name,
      type: meta.type,
      size: meta.size
    });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// Attachment Retrieval API
app.get('/api/attachments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const filePath = path.join(ATTACHMENTS_DIR, cleanId);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Attachment not found');
    }

    let meta = attachmentMetaStore.get(cleanId);
    if (!meta && fs.existsSync(filePath + '.json')) {
      try {
        meta = JSON.parse(fs.readFileSync(filePath + '.json', 'utf8'));
        if (meta) attachmentMetaStore.set(cleanId, meta);
      } catch (e) {}
    }

    const mimeType = meta?.type || 'application/octet-stream';
    const filename = meta?.name || 'attachment';

    res.setHeader('Content-Type', mimeType);
    
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error('Attachment serve error:', err);
    res.status(500).send('Error reading attachment');
  }
});

// Route handlers for the pages
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login', 'index.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register', 'index.html'));
});

app.get('/request', (req, res) => {
  res.sendFile(path.join(__dirname, 'request', 'index.html'));
});

app.get('/request/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'request', 'index.html'));
});

app.get('/track', (req, res) => {
  res.sendFile(path.join(__dirname, 'track', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MayankZen Studios running at http://0.0.0.0:${PORT}`);
});
