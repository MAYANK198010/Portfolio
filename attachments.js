// MayankZen Studios - Robust File & Attachment Engine
// Provides high-capacity IndexedDB caching, multi-tab sync, secure downloading, and modal previews

const DB_NAME = 'MayankZenAttachmentsDB';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

let dbPromise = null;

// Initialize IndexedDB
function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not supported in this environment');
        return resolve(null);
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

// Store an attachment locally in IndexedDB
export async function storeAttachment(id, fileData) {
  try {
    const db = await getDB();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id, ...fileData, savedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.debug('Failed to store attachment in IDB:', err);
    return false;
  }
}

// Retrieve an attachment from IndexedDB
export async function getAttachment(id) {
  try {
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.debug('Failed to get attachment from IDB:', err);
    return null;
  }
}

// Convert File / Blob to Data URL
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Format bytes into human readable string
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Determine font awesome icon class from filename/mimetype
export function getFileIcon(filename = '', mimeType = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || mimeType.startsWith('image/')) {
    return 'fa-solid fa-file-image';
  }
  if (ext === 'pdf' || mimeType.includes('pdf')) {
    return 'fa-solid fa-file-pdf';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('compressed')) {
    return 'fa-solid fa-file-zipper';
  }
  if (['js', 'ts', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'php'].includes(ext)) {
    return 'fa-solid fa-file-code';
  }
  if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) {
    return 'fa-solid fa-file-lines';
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'fa-solid fa-file-excel';
  }
  return 'fa-solid fa-file-arrow-down';
}

// Safely trigger browser file download without data-URI navigation restriction
export async function downloadAttachment(fileRef, filename = 'attachment') {
  try {
    let dataUrlOrBlob = fileRef;
    
    // Check if it's an attachment ID
    if (typeof fileRef === 'string' && fileRef.startsWith('att_')) {
      const stored = await getAttachment(fileRef);
      if (stored && (stored.dataUrl || stored.blob)) {
        dataUrlOrBlob = stored.blob || stored.dataUrl;
        if (stored.name) filename = stored.name;
      }
    }

    if (!dataUrlOrBlob) {
      alert('Attachment data is not available for download.');
      return;
    }

    // If it is a remote HTTPS url, open or download via fetch blob
    if (typeof dataUrlOrBlob === 'string' && dataUrlOrBlob.startsWith('http')) {
      try {
        const response = await fetch(dataUrlOrBlob);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return;
      } catch (fetchErr) {
        // Fallback to opening in new window if CORS forbids fetch
        window.open(dataUrlOrBlob, '_blank');
        return;
      }
    }

    // If it's a Data URL
    if (typeof dataUrlOrBlob === 'string' && dataUrlOrBlob.startsWith('data:')) {
      const parts = dataUrlOrBlob.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return;
    }

    // If it's already a Blob
    if (dataUrlOrBlob instanceof Blob) {
      const blobUrl = URL.createObjectURL(dataUrlOrBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return;
    }
  } catch (err) {
    console.error('Download attachment failed:', err);
    alert('Could not download file: ' + err.message);
  }
}

// Global preview modal for images and documents
export function openAttachmentPreview(fileUrl, filename = 'Attachment Preview') {
  let modal = document.getElementById('globalAttachmentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalAttachmentModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 850px; text-align: center; padding: 1.5rem; position: relative;">
        <button class="modal-close" onclick="document.getElementById('globalAttachmentModal').classList.remove('open')">&times;</button>
        <h3 id="globalPreviewTitle" style="color: var(--accent-green); margin-bottom: 1rem; font-size: 1.15rem; word-break: break-all; padding-right: 2rem;">Preview</h3>
        <div id="globalPreviewBody" style="max-height: 70vh; overflow: auto; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); border-radius: 12px; padding: 1rem; border: 1px solid rgba(139,92,246,0.3);"></div>
        <div style="margin-top: 1.25rem; display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
          <button id="globalPreviewDownloadBtn" class="btn primary btn-sm"><i class="fa-solid fa-download"></i> Download File</button>
          <button class="btn secondary btn-sm" onclick="document.getElementById('globalAttachmentModal').classList.remove('open')">Close</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.body.appendChild(modal);
  }

  const titleEl = document.getElementById('globalPreviewTitle');
  const bodyEl = document.getElementById('globalPreviewBody');
  const downloadBtn = document.getElementById('globalPreviewDownloadBtn');

  if (titleEl) titleEl.textContent = filename;
  
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadAttachment(fileUrl, filename);
  }

  if (bodyEl) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || (typeof fileUrl === 'string' && fileUrl.startsWith('data:image/'));

    if (isImg) {
      bodyEl.innerHTML = `<img src="${fileUrl}" alt="${filename}" style="max-width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">`;
    } else {
      bodyEl.innerHTML = `
        <div style="padding: 2rem; color: #cbd5e1;">
          <i class="${getFileIcon(filename)}" style="font-size: 3.5rem; color: var(--accent-green); margin-bottom: 1rem; display: block;"></i>
          <h4 style="color: white; margin-bottom: 0.5rem; font-size: 1.1rem;">${filename}</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 400px; margin: 0 auto 1.5rem;">
            This file type is ready for download and local editing.
          </p>
        </div>
      `;
    }
  }

  modal.classList.add('open');
}

// Bind to window for HTML inline access
if (typeof window !== 'undefined') {
  window.downloadAttachment = downloadAttachment;
  window.openAttachmentPreview = openAttachmentPreview;
}
