import { auth, storage, realtimeDb, ref as storageRef, uploadBytes, getDownloadURL, dbRef, push, onValue } from './firebase.js';

// Chat room functions for request pages
export function initChat(requestId, userId) {
  const chatContainer = document.getElementById('chatMessages');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const fileInput = document.getElementById('fileInput');

const chatRef = dbRef(realtimeDb, `chats/${requestId}`); // Use dbRef alias

  // Load messages
  onValue(chatRef, (snapshot) => {
    chatContainer.innerHTML = '';
    snapshot.forEach((child) => {
      const msg = child.val();
      const div = document.createElement('div');
      div.className = `message ${msg.uid === userId ? 'sent' : 'received'}`;
      div.innerHTML = `<p>${msg.text}</p><span>${new Date(msg.timestamp).toLocaleString()}</span>`;
      if (msg.fileUrl) {
        const a = document.createElement('a');
        a.href = msg.fileUrl;
        a.textContent = 'Download File';
        div.appendChild(a);
      }
      chatContainer.appendChild(div);
    });
  });

  // Send text
  sendBtn.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (text) {
      push(chatRef, {
        text,
        uid: userId,
        timestamp: Date.now(),
        type: 'text'
      });
      messageInput.value = '';
    }
  });

  // Upload file
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
const storageRef = storageRef(storage, `chats/${requestId}/${file.name}`); // Correct ref alias
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      push(chatRef, {
        fileUrl: url,
        filename: file.name,
        uid: userId,
        timestamp: Date.now(),
        type: 'file'
      });
      fileInput.value = '';
    }
  });
}

