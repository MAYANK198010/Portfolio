import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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
