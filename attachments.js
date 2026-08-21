// MayankZen Studios - Robust File & Attachment Engine
// Provides high-capacity IndexedDB caching, server upload, multi-tab sync, secure downloading, and modal previews

const DB_NAME = 'MayankZenAttachmentsDB';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';

let dbPromise = null;

// Initialize IndexedDB
function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
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
  if (!id) return null;
  try {
    const cleanId = String(id).replace(/.*\/api\/attachments\//, '').replace(/\?.*/, '').trim();
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cleanId);
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

// Helper to extract clean fileId
export function extractFileId(fileRef) {
  if (!fileRef || typeof fileRef !== 'string') return null;
  const match = fileRef.match(/att_[a-zA-Z0-9_-]+/);
  return match ? match[0] : (fileRef.startsWith('att_') ? fileRef : null);
}

// Determine font awesome icon class from filename/mimetype
export function getFileIcon(filename = '', mimeType = '') {
  const ext = (String(filename).split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || (mimeType && mimeType.startsWith('image/'))) {
    return 'fa-solid fa-file-image';
  }
  if (ext === 'pdf' || (mimeType && mimeType.includes('pdf'))) {
    return 'fa-solid fa-file-pdf';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || (mimeType && (mimeType.includes('zip') || mimeType.includes('compressed')))) {
    return 'fa-solid fa-file-zipper';
  }
  if (['js', 'ts', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'php', 'jsx', 'tsx', 'sql'].includes(ext)) {
    return 'fa-solid fa-file-code';
  }
  if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) {
    return 'fa-solid fa-file-lines';
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'fa-solid fa-file-excel';
  }
  if (['ppt', 'pptx'].includes(ext)) {
    return 'fa-solid fa-file-powerpoint';
  }
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) || (mimeType && mimeType.startsWith('video/'))) {
    return 'fa-solid fa-file-video';
  }
  return 'fa-solid fa-file-arrow-down';
}

// Upload attachment to backend server API
export async function uploadAttachmentToServer(file, fileId = null) {
  const id = fileId || ('att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
  let dataUrl = '';
  
  try {
    dataUrl = await fileToDataUrl(file);
    
    // Save to IndexedDB locally first
    await storeAttachment(id, {
      id,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl,
      blob: file
    });

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: id,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl
      })
    });

    if (response.ok) {
      const resData = await response.json();
      return {
        fileId: id,
        fileUrl: resData.fileUrl || `/api/attachments/${id}`,
        dataUrl: dataUrl,
        name: file.name,
        type: file.type,
        size: file.size
      };
    }
  } catch (err) {
    console.debug('Server upload fallback (using client IDB):', err?.message || err);
  }

  // Fallback if network fails
  if (!dataUrl) {
    try {
      dataUrl = await fileToDataUrl(file);
    } catch (e) {}
  }

  return {
    fileId: id,
    fileUrl: `/api/attachments/${id}`,
    dataUrl: dataUrl,
    name: file.name,
    type: file.type,
    size: file.size
  };
}

// Trigger file download reliably across all browsers & environments
export async function downloadAttachment(fileRef, filename = 'attachment') {
  try {
    if (!fileRef) {
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Attachment reference is missing.', 'error');
      }
      return;
    }

    const fileId = extractFileId(fileRef);
    let resolvedData = null;

    // 1. Check IndexedDB first for fastest direct download
    if (fileId) {
      const stored = await getAttachment(fileId);
      if (stored) {
        resolvedData = stored.blob || stored.dataUrl;
        if (stored.name) filename = stored.name;
      }
    }

    // 2. If it's already a Blob
    if (resolvedData instanceof Blob) {
      const blobUrl = URL.createObjectURL(resolvedData);
      triggerDownload(blobUrl, filename);
      return;
    }

    // 3. If it's a Data URL
    if (typeof (resolvedData || fileRef) === 'string' && (resolvedData || fileRef).startsWith('data:')) {
      const targetDataUrl = resolvedData || fileRef;
      const parts = targetDataUrl.split(',');
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
      triggerDownload(blobUrl, filename);
      return;
    }

    // 4. If it is a remote HTTPS or relative server URL
    const fetchUrl = typeof fileRef === 'string' && !fileRef.startsWith('http') && !fileRef.startsWith('/')
      ? `/api/attachments/${fileRef}?download=1`
      : (fileRef.includes('?') ? fileRef : `${fileRef}?download=1`);

    try {
      const response = await fetch(fetchUrl);
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, filename);
        return;
      }
    } catch (fetchErr) {
      console.debug('Fetch download failed, attempting direct link navigation:', fetchErr);
    }

    // 5. Fallback link navigation
    triggerDownload(fetchUrl, filename);

  } catch (err) {
    console.error('Download attachment failed:', err);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Could not download file: ' + err.message, 'error');
    }
  }
}

function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, 2500);

  if (typeof window !== 'undefined' && window.showToast) {
    window.showToast(`Downloaded ${filename}`, 'success');
  }
}

// Global preview modal for images and documents
export async function openAttachmentPreview(fileUrlOrId, filename = 'Attachment Preview') {
  let modal = document.getElementById('globalAttachmentModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'globalAttachmentModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 850px; text-align: center; padding: 1.5rem; position: relative;">
        <button class="modal-close" onclick="document.getElementById('globalAttachmentModal').classList.remove('open')">&times;</button>
        <h3 id="globalPreviewTitle" style="color: var(--accent-green); margin-bottom: 1rem; font-size: 1.15rem; word-break: break-all; padding-right: 2rem;">Preview</h3>
        <div id="globalPreviewBody" style="max-height: 70vh; overflow: auto; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); border-radius: 12px; padding: 1rem; border: 1px solid rgba(139,92,246,0.3);">
          <span class="loading"></span>
        </div>
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
  if (bodyEl) bodyEl.innerHTML = '<div style="padding: 2rem; color: #a1a8c0;"><span class="loading"></span> Loading preview...</div>';

  modal.classList.add('open');

  // Resolve true display URL
  let resolvedUrl = fileUrlOrId;
  const fileId = extractFileId(fileUrlOrId);

  if (fileId) {
    const stored = await getAttachment(fileId);
    if (stored) {
      if (stored.dataUrl) resolvedUrl = stored.dataUrl;
      else if (stored.blob) resolvedUrl = URL.createObjectURL(stored.blob);
      if (stored.name) filename = stored.name;
    } else if (!fileUrlOrId.startsWith('http') && !fileUrlOrId.startsWith('/')) {
      resolvedUrl = `/api/attachments/${fileId}`;
    }
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => downloadAttachment(resolvedUrl || fileUrlOrId, filename);
  }

  const ext = (String(filename).split('.').pop() || '').toLowerCase();
  const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext) || (typeof resolvedUrl === 'string' && (resolvedUrl.startsWith('data:image/') || resolvedUrl.includes('image')));

  if (bodyEl) {
    if (isImg && resolvedUrl) {
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; width: 100%;">
          <img src="${resolvedUrl}" alt="${filename}" style="max-width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" onerror="this.onerror=null; this.parentElement.innerHTML='<p style=\\'color:#cbd5e1;\\'>Preview not displayable. Use the download button below.</p>';" />
        </div>
      `;
    } else {
      bodyEl.innerHTML = `
        <div style="padding: 2rem; color: #cbd5e1;">
          <i class="${getFileIcon(filename)}" style="font-size: 3.5rem; color: var(--accent-green); margin-bottom: 1rem; display: block;"></i>
          <h4 style="color: white; margin-bottom: 0.5rem; font-size: 1.1rem; word-break: break-all;">${filename}</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 400px; margin: 0 auto 1.5rem;">
            Ready to download and inspect.
          </p>
        </div>
      `;
    }
  }
}

// Bind to window for HTML access
if (typeof window !== 'undefined') {
  window.storeAttachment = storeAttachment;
  window.getAttachment = getAttachment;
  window.downloadAttachment = downloadAttachment;
  window.openAttachmentPreview = openAttachmentPreview;
  window.formatBytes = formatBytes;
  window.getFileIcon = getFileIcon;
  window.uploadAttachmentToServer = uploadAttachmentToServer;
  window.extractFileId = extractFileId;
}

