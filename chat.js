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
  fileToDataUrl 
} from './attachments.js';

// Advanced real-time project chat manager with multi-tab broadcast, IndexedDB caching & attachments
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

    messages.forEach((msg) => {
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
      const fileTarget = msg.fileUrl || msg.dataUrl || msg.fileId;
      if (fileTarget || msg.filename) {
        const filename = msg.filename || 'attachment';
        const fileExt = (filename.split('.').pop() || '').toLowerCase();
        const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(fileExt) || (msg.fileType && msg.fileType.startsWith('image/')) || (typeof fileTarget === 'string' && fileTarget.startsWith('data:image/'));
        const sizeStr = msg.fileSize ? formatBytes(msg.fileSize) : '';

        if (isImg && (msg.fileUrl || msg.dataUrl)) {
          const imgSrc = msg.fileUrl || msg.dataUrl;
          contentHtml += `
            <div class="chat-image-preview-wrapper" onclick="window.openAttachmentPreview('${escapeHtml(imgSrc)}', '${escapeHtml(filename)}')">
              <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(filename)}" loading="lazy" />
              <div class="chat-image-overlay">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;">${escapeHtml(filename)}</span>
                <button type="button" class="chat-file-action-btn" onclick="event.stopPropagation(); window.downloadAttachment('${escapeHtml(imgSrc)}', '${escapeHtml(filename)}')" title="Download Image">
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
                ${fileTarget ? `
                  <button type="button" class="chat-file-action-btn" onclick="window.downloadAttachment('${escapeHtml(fileTarget)}', '${escapeHtml(filename)}')" title="Download file">
                    <i class="fa-solid fa-download"></i> Download
                  </button>
                ` : ''}
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
          console.debug('Realtime database sync note (using local & broadcast storage):', error?.message || error);
          syncFromLocalStorage();
        }
      );
    } catch (err) {
      console.debug('Realtime DB connection note:', err?.message || err);
    }
  }

  // Dispatch and save a message
  async function dispatchMessage(newMsg, attachmentPayload = null) {
    try {
      // 1. If there is an attachment, store in IndexedDB
      if (attachmentPayload && newMsg.fileId) {
        await storeAttachment(newMsg.fileId, attachmentPayload);
      }

      // 2. Optimistically update local messages in localStorage (limit base64 size if needed)
      const msgs = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const localMsgCopy = { ...newMsg };
      // If dataUrl is massive, avoid overflowing localStorage quota
      if (localMsgCopy.dataUrl && localMsgCopy.dataUrl.length > 500000) {
        delete localMsgCopy.dataUrl; // will load from IndexedDB
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
    } catch (e) {
      console.debug('Local storage save error:', e);
    }

    // 4. Push to Firebase Realtime Database
    if (realtimeDb) {
      try {
        const chatRef = dbRef(realtimeDb, `chats/${requestId}`);
        // Strip large dataUrl before pushing to RTDB to preserve database bandwidth
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
    let dataUrl = null;

    try {
      dataUrl = await fileToDataUrl(file);
    } catch (readErr) {
      console.warn('Could not read file as dataUrl:', readErr);
    }

    // Save attachment in IndexedDB
    const attachmentPayload = {
      id: fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: dataUrl,
      blob: file
    };

    let remoteFileUrl = null;

    // Attempt Firebase Storage upload if available
    if (storage) {
      try {
        const fileRef = storageRef(storage, `chats/${requestId}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        remoteFileUrl = await getDownloadURL(fileRef);
      } catch (storageErr) {
        console.debug('Firebase storage upload fallback:', storageErr?.message || storageErr);
      }
    }

    const newMsg = {
      fileId: fileId,
      fileUrl: remoteFileUrl,
      dataUrl: (dataUrl && dataUrl.length < 500000) ? dataUrl : null,
      filename: file.name,
      fileType: file.type,
      fileSize: file.size,
      uid: userId,
      sender: isAdmin ? 'admin' : 'client',
      timestamp: Date.now(),
      type: 'file'
    };

    await dispatchMessage(newMsg, attachmentPayload);
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
