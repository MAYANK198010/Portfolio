import { auth, storage, realtimeDb } from './firebase.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { ref as dbRef, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { 
  storeAttachment, 
  getAttachment, 
  downloadAttachment, 
  openAttachmentPreview, 
  formatBytes, 
  getFileIcon, 
  fileToDataUrl,
  uploadAttachmentToServer
} from './attachments.js';

// Advanced real-time project chat manager with multi-tab broadcast, server sync, IndexedDB caching & attachments
export function initChat(requestId, userId) {
  const chatContainer = document.getElementById('chatMessages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const fileInput = document.getElementById('fileInput');

  if (!chatContainer || !messageInput || !sendBtn) return;

  const storageKey = `mayankzen_chat_${requestId}`;
  const isAdmin = (typeof userId === 'string' && (userId.includes('admin') || userId.includes('mayank198010')));

  // Setup BroadcastChannel for instantaneous cross-tab live synchronization
  let broadcastChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel(`mayankzen_chat_channel_${requestId}`);
      broadcastChannel.onmessage = async (event) => {
        if (event.data && event.data.type === 'NEW_CHAT_MESSAGE') {
          if (event.data.attachmentPayload && event.data.msg && event.data.msg.fileId) {
            await storeAttachment(event.data.msg.fileId, event.data.attachmentPayload);
          }
          syncFromLocalStorage();
        }
      };
    }
  } catch (e) {
    console.debug('Broadcast channel not available:', e);
  }

  // Cross-tab fallback listener using storage event
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) {
      syncFromLocalStorage();
    }
  });

  // Render quick prompts above input if not already present
  let promptsBar = document.getElementById('chatQuickPrompts');
  if (!promptsBar && messageInput.parentElement) {
    promptsBar = document.createElement('div');
    promptsBar.id = 'chatQuickPrompts';
    promptsBar.className = 'chat-quick-prompts';
    promptsBar.innerHTML = `
      <button type="button" class="quick-prompt-chip" data-prompt="👋 Hello! Checking in for an update on project progress.">👋 Check Progress</button>
      <button type="button" class="quick-prompt-chip" data-prompt="🎨 I have uploaded reference assets / wireframes for review.">🎨 Shared Assets</button>
      <button type="button" class="quick-prompt-chip" data-prompt="📅 When is the next development milestone scheduled?">📅 Milestone Query</button>
      <button type="button" class="quick-prompt-chip" data-prompt="⚡ Would like to request a quick scope adjustment.">⚡ Scope Change</button>
    `;
    messageInput.parentElement.parentElement.insertBefore(promptsBar, messageInput.parentElement);

    promptsBar.querySelectorAll('.quick-prompt-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        messageInput.value = btn.dataset.prompt;
        messageInput.focus();
      });
    });
  }

  // Upload Progress / Status Indicator Bar
  let statusBanner = document.getElementById('chatAttachmentStatus');
  if (!statusBanner && messageInput.parentElement) {
    statusBanner = document.createElement('div');
    statusBanner.id = 'chatAttachmentStatus';
    statusBanner.style.display = 'none';
    statusBanner.style.padding = '0.35rem 0.85rem';
    statusBanner.style.fontSize = '0.8rem';
    statusBanner.style.color = 'var(--accent-green)';
    statusBanner.style.background = 'rgba(16, 185, 129, 0.1)';
    statusBanner.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    statusBanner.style.borderRadius = '6px';
    statusBanner.style.marginBottom = '0.5rem';
    messageInput.parentElement.parentElement.insertBefore(statusBanner, messageInput.parentElement);
  }

  function setUploadStatus(text = '') {
    if (!statusBanner) return;
    if (text) {
      statusBanner.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
      statusBanner.style.display = 'block';
    } else {
      statusBanner.style.display = 'none';
    }
  }

  // Delegated event listener for chat actions (previews & downloads)
  chatContainer.onclick = async (e) => {
    const downloadBtn = e.target.closest('[data-action="download"]');
    if (downloadBtn) {
      e.preventDefault();
      e.stopPropagation();
      const fileRef = downloadBtn.getAttribute('data-file-ref');
      const filename = downloadBtn.getAttribute('data-filename') || 'attachment';
      downloadAttachment(fileRef, filename);
      return;
    }

    const previewTrigger = e.target.closest('[data-action="preview"]');
    if (previewTrigger) {
      e.preventDefault();
      e.stopPropagation();
      const fileRef = previewTrigger.getAttribute('data-file-ref');
      const filename = previewTrigger.getAttribute('data-filename') || 'Attachment Preview';
      openAttachmentPreview(fileRef, filename);
      return;
    }
  };

  // Helper to render messages with modern bubble UI
  function renderMessages(messages) {
    if (!messages || messages.length === 0) {
      chatContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 2rem 1rem; margin: auto;">
          <div style="width: 50px; height: 50px; border-radius: 14px; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.35); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: var(--accent-green); font-size: 1.5rem;">
            <i class="fa-solid fa-comments"></i>
          </div>
          <h4 style="color: white; font-weight: 700; margin-bottom: 0.35rem; font-size: 1.05rem;">Project Workspace Chat</h4>
          <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 360px; margin: 0 auto 1rem; line-height: 1.5;">
            Direct encrypted channel for Tracking ID <strong style="color: var(--accent-green);">${escapeHtml(requestId)}</strong>.
          </p>
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(139,92,246,0.25); border-radius: 12px; padding: 0.85rem 1rem; font-size: 0.82rem; text-align: left; max-width: 420px; margin: 0 auto; color: #cbd5e1; line-height: 1.5;">
            <strong style="color: var(--accent-green); display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.25rem;">
              <i class="fa-solid fa-paperclip"></i> Attachments Supported:
            </strong>
            You can attach screenshots, PDFs, ZIP files, code, or design assets using the paperclip button, dragging files here, or pasting clipboard images (Ctrl+V).
          </div>
        </div>
      `;
      return;
    }

    chatContainer.innerHTML = '';
    
    // Add date separator
    const dateDiv = document.createElement('div');
    dateDiv.className = 'chat-date-separator';
    dateDiv.innerHTML = `<span><i class="fa-solid fa-lock" style="font-size: 0.65rem;"></i> Active Studio Session</span>`;
    chatContainer.appendChild(dateDiv);

    messages.forEach((msg, idx) => {
      const isSent = msg.uid === userId || (isAdmin && msg.sender === 'admin') || (!isAdmin && msg.sender === 'client' && (!msg.uid || msg.uid === userId || String(msg.uid).startsWith('client_')));
      const senderLabel = isSent ? 'You' : (msg.sender === 'admin' ? 'MayankZen Studio' : 'Client');
      const avatarIcon = isSent ? '<i class="fa-solid fa-user"></i>' : (msg.sender === 'admin' ? '<i class="fa-solid fa-crown"></i>' : '<i class="fa-solid fa-user-tie"></i>');

      const row = document.createElement('div');
      row.className = `message-row ${isSent ? 'sent' : 'received'}`;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.innerHTML = avatarIcon;

      const bubbleWrapper = document.createElement('div');
      bubbleWrapper.className = 'message-bubble-wrapper';

      const tag = document.createElement('div');
      tag.className = 'message-sender-tag';
      tag.textContent = senderLabel;
      bubbleWrapper.appendChild(tag);

      const bubble = document.createElement('div');
      bubble.className = `message ${isSent ? 'sent' : 'received'}`;

      let contentHtml = '';
      if (msg.text) {
        contentHtml += `<p>${escapeHtml(msg.text)}</p>`;
      }

      // Render Attachment
      const fileId = msg.fileId;
      const fileTarget = msg.fileUrl || (fileId ? `/api/attachments/${fileId}` : null) || msg.dataUrl || fileId;
      
      if (fileTarget || msg.filename) {
        const filename = msg.filename || 'attachment';
        const fileExt = (String(filename).split('.').pop() || '').toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(fileExt) || (msg.fileType && msg.fileType.startsWith('image/')) || (typeof fileTarget === 'string' && fileTarget.startsWith('data:image/'));
        const sizeStr = msg.fileSize ? formatBytes(msg.fileSize) : '';
        const effectiveSrc = msg.dataUrl || msg.fileUrl || (fileId ? `/api/attachments/${fileId}` : '');
        const targetRef = fileId || effectiveSrc || fileTarget;

        if (isImg && (effectiveSrc || fileId)) {
          const displaySrc = effectiveSrc || `/api/attachments/${fileId}`;
          const imgElId = `chat_img_${idx}_${Date.now()}`;
          contentHtml += `
            <div class="chat-image-preview-wrapper" data-action="preview" data-file-ref="${escapeHtml(targetRef)}" data-filename="${escapeHtml(filename)}" style="cursor: pointer;">
              <img id="${imgElId}" data-file-id="${escapeHtml(fileId || '')}" src="${escapeHtml(displaySrc)}" alt="${escapeHtml(filename)}" loading="lazy" onerror="if(window.getAttachment && this.dataset.fileId){ window.getAttachment(this.dataset.fileId).then(r=>{ if(r && (r.dataUrl || r.blob)) this.src = r.dataUrl || URL.createObjectURL(r.blob); }); }" />
              <div class="chat-image-overlay">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;">${escapeHtml(filename)}</span>
                <button type="button" class="chat-file-action-btn" data-action="download" data-file-ref="${escapeHtml(targetRef)}" data-filename="${escapeHtml(filename)}" title="Download Image">
                  <i class="fa-solid fa-download"></i>
                </button>
              </div>
            </div>
          `;
        } else {
          const iconClass = getFileIcon(filename, msg.fileType || '');
          contentHtml += `
            <div class="message-file-card">
              <div class="chat-file-icon">
                <i class="${iconClass}"></i>
              </div>
              <div class="chat-file-details">
                <div class="chat-file-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</div>
                <div class="chat-file-meta">${sizeStr ? `${sizeStr} • ` : ''}Attachment</div>
              </div>
              <div class="chat-file-btns">
                <button type="button" class="chat-file-action-btn" data-action="preview" data-file-ref="${escapeHtml(targetRef)}" data-filename="${escapeHtml(filename)}" title="Preview file">
                  <i class="fa-solid fa-eye"></i> View
                </button>
                <button type="button" class="chat-file-action-btn" data-action="download" data-file-ref="${escapeHtml(targetRef)}" data-filename="${escapeHtml(filename)}" title="Download file">
                  <i class="fa-solid fa-download"></i> Download
                </button>
              </div>
            </div>
          `;
        }
      }

      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      contentHtml += `
        <div class="message-meta">
          <span>${timeStr}</span>
          ${isSent ? '<i class="fa-solid fa-check-double" style="font-size: 0.7rem; color: #03140d;"></i>' : ''}
        </div>
      `;

      bubble.innerHTML = contentHtml;
      bubbleWrapper.appendChild(bubble);

      row.appendChild(avatar);
      row.appendChild(bubbleWrapper);
      chatContainer.appendChild(row);
    });

    // Auto scroll to bottom
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function syncFromLocalStorage() {
    try {
      const msgs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      renderMessages(msgs);
    } catch (e) {
      console.debug('Local storage sync error:', e);
    }
  }

  // Load from local storage first for instant rendering
  let localMessages = [];
  try {
    localMessages = JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch (e) {
    localMessages = [];
  }
  renderMessages(localMessages);

  // Connect to Firebase Realtime Database with graceful error handling
  if (realtimeDb) {
    try {
      const chatRef = dbRef(realtimeDb, `chats/${requestId}`);
      onValue(
        chatRef,
        (snapshot) => {
          try {
            const serverMessages = [];
            snapshot.forEach((child) => {
              serverMessages.push(child.val());
            });
            if (serverMessages.length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(serverMessages));
              renderMessages(serverMessages);
            } else if (localMessages.length > 0) {
              renderMessages(localMessages);
            }
          } catch (snapErr) {
            console.debug('Snapshot processing note:', snapErr);
          }
        },
        (error) => {
          console.debug('Realtime database sync note (using local & server storage):', error?.message || error);
          syncFromLocalStorage();
        }
      );
    } catch (err) {
      console.debug('Realtime DB connection note:', err?.message || err);
    }
  }

  // Poll server database for cross-device message synchronization
  async function syncFromServerDatabase() {
    try {
      const res = await fetch(`/api/db/messages/${encodeURIComponent(requestId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          const currentLocal = JSON.parse(localStorage.getItem(storageKey) || '[]');
          const msgMap = new Map();

          // Merge local first
          currentLocal.forEach(m => {
            const key = m.id || (m.timestamp + '_' + (m.text || m.fileId));
            msgMap.set(key, m);
          });

          // Merge server messages
          json.data.forEach(m => {
            const key = m.id || (m.timestamp + '_' + (m.text || m.fileId));
            if (!msgMap.has(key)) {
              msgMap.set(key, m);
            } else {
              msgMap.set(key, { ...msgMap.get(key), ...m });
            }
          });

          const merged = Array.from(msgMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          if (merged.length !== currentLocal.length || JSON.stringify(merged) !== JSON.stringify(currentLocal)) {
            localStorage.setItem(storageKey, JSON.stringify(merged));
            renderMessages(merged);
          }
        }
      }
    } catch (e) {
      console.debug('Server chat sync notice:', e);
    }
  }

  syncFromServerDatabase();
  const chatPollTimer = setInterval(syncFromServerDatabase, 2500);

  // Clean timer on page unload or container destruction
  window.addEventListener('beforeunload', () => clearInterval(chatPollTimer));

  // Dispatch and save a message
  async function dispatchMessage(newMsg, attachmentPayload = null) {
    try {
      // 1. If there is an attachment, store in IndexedDB
      if (attachmentPayload && newMsg.fileId) {
        await storeAttachment(newMsg.fileId, attachmentPayload);
      }

      // 2. Optimistically update local messages in localStorage
      const msgs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const localMsgCopy = { ...newMsg };
      if (localMsgCopy.dataUrl && localMsgCopy.dataUrl.length > 500000) {
        delete localMsgCopy.dataUrl; // will resolve from server endpoint or IDB
      }
      msgs.push(localMsgCopy);
      localStorage.setItem(storageKey, JSON.stringify(msgs));
      renderMessages(msgs);

      // 3. Notify other tabs immediately via broadcast channel with attachment data
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          type: 'NEW_CHAT_MESSAGE',
          msg: newMsg,
          attachmentPayload
        });
      }

      // 4. Send directly to Persistent Server Database (accessible across all devices & sessions)
      fetch(`/api/db/messages/${encodeURIComponent(requestId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMsg)
      }).catch(srvErr => console.debug('Server DB message sync error:', srvErr));
    } catch (e) {
      console.debug('Local storage save error:', e);
    }

    // 4. Push to Firebase Realtime Database if connected
    if (realtimeDb) {
      try {
        const chatRef = dbRef(realtimeDb, `chats/${requestId}`);
        const rtdbMsg = { ...newMsg };
        if (rtdbMsg.dataUrl && rtdbMsg.dataUrl.length > 20000) {
          delete rtdbMsg.dataUrl;
        }
        const pushPromise = push(chatRef, rtdbMsg);
        if (pushPromise && typeof pushPromise.catch === 'function') {
          pushPromise.catch((err) => {
            console.debug('Realtime DB push note:', err?.message || err);
          });
        }
      } catch (err) {
        console.debug('Could not push to realtime DB:', err?.message || err);
      }
    }
  }

  // Send regular text message
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    const newMsg = {
      text,
      uid: userId,
      sender: isAdmin ? 'admin' : 'client',
      timestamp: Date.now(),
      type: 'text'
    };

    dispatchMessage(newMsg);
    messageInput.value = '';
    messageInput.focus();
  }

  // Process and upload attached file
  async function processAndSendFile(file) {
    if (!file) return;

    const fileId = 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setUploadStatus(`Uploading ${file.name} (${formatBytes(file.size)})...`);

    try {
      // 1. Upload to local server / IDB engine
      const uploadRes = await uploadAttachmentToServer(file, fileId);

      let remoteStorageUrl = null;

      // 2. Concurrently attempt Firebase Storage upload if configured
      if (storage) {
        try {
          const fileRef = storageRef(storage, `chats/${requestId}/${Date.now()}_${file.name}`);
          await uploadBytes(fileRef, file);
          remoteStorageUrl = await getDownloadURL(fileRef);
        } catch (storageErr) {
          console.debug('Firebase storage upload fallback:', storageErr?.message || storageErr);
        }
      }

      const attachmentPayload = {
        id: fileId,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: uploadRes?.dataUrl || null,
        blob: file
      };

      const newMsg = {
        fileId: fileId,
        fileUrl: remoteStorageUrl || uploadRes?.fileUrl || `/api/attachments/${fileId}`,
        dataUrl: (uploadRes?.dataUrl && uploadRes.dataUrl.length < 500000) ? uploadRes.dataUrl : null,
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        uid: userId,
        sender: isAdmin ? 'admin' : 'client',
        timestamp: Date.now(),
        type: 'file'
      };

      await dispatchMessage(newMsg, attachmentPayload);
    } catch (err) {
      console.error('File process error:', err);
    } finally {
      setUploadStatus('');
    }
  }

  // Re-bind click event cleanly
  const newSendBtn = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
  newSendBtn.addEventListener('click', sendMessage);

  // Allow Enter key to send
  messageInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Bind attach button inside input bar
  const attachBtn = messageInput.parentElement.querySelector('.chat-btn-attach');
  if (attachBtn && fileInput) {
    attachBtn.onclick = (e) => {
      e.preventDefault();
      fileInput.click();
    };
  }

  // Bind file input handler
  if (fileInput) {
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await processAndSendFile(file);
      }
      fileInput.value = '';
    };
  }

  // Support Drag and Drop onto Chat Container
  chatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatContainer.style.background = 'rgba(16, 185, 129, 0.08)';
    chatContainer.style.borderColor = 'var(--accent-green)';
  });

  chatContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    chatContainer.style.background = '';
    chatContainer.style.borderColor = '';
  });

  chatContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    chatContainer.style.background = '';
    chatContainer.style.borderColor = '';
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        await processAndSendFile(file);
      }
    }
  });

  // Support Clipboard Paste (e.g. screenshots)
  messageInput.addEventListener('paste', async (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await processAndSendFile(file);
        }
      }
    }
  });
}

