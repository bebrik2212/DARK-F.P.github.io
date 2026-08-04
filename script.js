// Полностью переписываем для работы без бэкенда
const DEFAULT_AVATAR = 'https://litmir.club/data/Author/279000/279758/Фото_Нуремхет_Аноним_b86a9.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const profileId = getProfileId();
let socialData = { profile: null, posts: [], notifications: [] };
let pendingMedia = [];
let profileSaveTimer = 0;
let notificationPanelOpen = false;
const openComments = new Set();

// Эмуляция загрузки файлов через localStorage (только для аватаров, медиа не храним)
const uploadedFiles = new Map();

const nicknameInput = document.getElementById('nicknameInput');
const profileAvatarEl = document.getElementById('profileAvatar');
const profileBigAvatarEl = document.getElementById('profileBigAvatar');
const profileNicknameEl = document.getElementById('profileNickname');
const avatarUploadEl = document.getElementById('avatarUpload');
const bellBtnEl = document.getElementById('bellBtn');
const notifCountEl = document.getElementById('notifCount');
const notificationPanelEl = document.getElementById('notificationPanel');
const nickErrorMsg = document.getElementById('nickErrorMsg');
const postTextEl = document.getElementById('postText');
const mediaUploadEl = document.getElementById('mediaUpload');
const mediaPreviewEl = document.getElementById('mediaPreview');
const publishBtnEl = document.getElementById('publishBtn');
const uploadStatusEl = document.getElementById('uploadStatus');
const postsListFeedEl = document.getElementById('postsListFeed');
const postsListProfileEl = document.getElementById('postsListProfile');

function getProfileId() {
  const stored = localStorage.getItem('social_profile_id');
  if (stored) return stored;
  const created = crypto.randomUUID();
  localStorage.setItem('social_profile_id', created);
  return created;
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value == null ? '' : String(value);
  return element.innerHTML;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function showToast(message, isError = false) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem('social_network_data');
    if (data) {
      const parsed = JSON.parse(data);
      // Восстанавливаем даты
      if (parsed.posts) {
        parsed.posts.forEach(post => {
          post.createdAt = post.createdAt || new Date().toISOString();
          post.comments = post.comments || [];
          post.media = post.media || [];
          post.likes = post.likes || 0;
          post.dislikes = post.dislikes || 0;
          post.viewerVote = 0;
        });
      }
      socialData = parsed;
    } else {
      socialData = { profile: null, posts: [], notifications: [] };
    }
  } catch {
    socialData = { profile: null, posts: [], notifications: [] };
  }
}

function saveToStorage() {
  try {
    localStorage.setItem('social_network_data', JSON.stringify(socialData));
  } catch (e) {
    console.warn('Failed to save:', e);
  }
}

function syncWithCloud({ silent = false } = {}) {
  loadFromStorage();
  updateProfileUI();
  renderAllPosts();
  updateNotifCount();
  if (!silent && !socialData.profile) {
    // Если нет профиля, создаём
    if (nicknameInput.value.trim()) {
      saveProfile(nicknameInput.value.trim());
    }
  }
  return Promise.resolve();
}

function updateProfileUI() {
  const nickname = document.activeElement === nicknameInput
    ? nicknameInput.value.trim()
    : socialData.profile?.nickname || localStorage.getItem('social_pending_nickname') || '';
  if (document.activeElement !== nicknameInput) nicknameInput.value = nickname;
  profileNicknameEl.textContent = nickname || 'Без имени';
  
  // Для аватара используем data URL
  if (socialData.profile?.avatarData) {
    profileAvatarEl.src = socialData.profile.avatarData;
    profileBigAvatarEl.src = socialData.profile.avatarData;
  } else {
    profileAvatarEl.src = DEFAULT_AVATAR;
    profileBigAvatarEl.src = DEFAULT_AVATAR;
  }
}

function saveProfile(nickname, avatarData) {
  return new Promise((resolve) => {
    // Проверяем, не занят ли ник (только среди существующих профилей)
    const existing = JSON.parse(localStorage.getItem('social_network_data') || '{"posts":[]}');
    const taken = existing.posts?.some(p => p.author === nickname && p.authorId !== profileId) || false;
    
    if (taken) {
      nicknameInput.classList.add('error');
      nickErrorMsg.textContent = '❌ Этот ник уже занят!';
      nickErrorMsg.classList.add('visible');
      resolve(false);
      return;
    }
    
    if (!socialData.profile) {
      socialData.profile = {};
    }
    socialData.profile.nickname = nickname;
    if (avatarData) {
      socialData.profile.avatarData = avatarData;
    }
    socialData.profile.updatedAt = new Date().toISOString();
    
    // Обновляем все посты автора
    if (socialData.posts) {
      socialData.posts.forEach(post => {
        if (post.authorId === profileId) {
          post.author = nickname;
        }
      });
    }
    
    saveToStorage();
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    localStorage.setItem('social_pending_nickname', nickname);
    updateProfileUI();
    renderAllPosts();
    resolve(true);
  });
}

nicknameInput.addEventListener('input', () => {
  const nickname = nicknameInput.value.trim();
  profileNicknameEl.textContent = nickname || 'Без имени';
  window.clearTimeout(profileSaveTimer);
  if (!nickname) {
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    return;
  }
  profileSaveTimer = window.setTimeout(() => saveProfile(nickname), 450);
});

nicknameInput.addEventListener('blur', () => {
  window.clearTimeout(profileSaveTimer);
  const nickname = nicknameInput.value.trim();
  if (nickname) saveProfile(nickname);
});

profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());
document.getElementById('attachBtn').addEventListener('click', () => mediaUploadEl.click());

avatarUploadEl.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!socialData.profile?.nickname) return showToast('Сначала установите ник!', true);
  if (file.size > MAX_AVATAR_SIZE) return showToast('Аватар должен быть меньше 5 МБ', true);
  if (!file.type.startsWith('image/')) return showToast('Выберите изображение', true);
  
  try {
    const reader = new FileReader();
    reader.onload = function(e) {
      const avatarData = e.target.result;
      saveProfile(socialData.profile.nickname, avatarData);
      showToast('Аватар обновлён');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    showToast(error.message, true);
  }
});

mediaUploadEl.addEventListener('change', (event) => {
  const files = Array.from(event.target.files);
  event.target.value = '';
  let totalSize = pendingMedia.reduce((sum, item) => sum + item.file.size, 0);
  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showToast(`Файл «${file.name}» не поддерживается`, true);
      continue;
    }
    if (file.size > MAX_FILE_SIZE || totalSize + file.size > MAX_FILE_SIZE) {
      showToast('Общий размер файлов превышает 67 МБ!', true);
      break;
    }
    totalSize += file.size;
    pendingMedia.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  renderMediaPreview();
  updateUploadStatus();
});

function renderMediaPreview() {
  mediaPreviewEl.innerHTML = pendingMedia.map((item, index) => `
    <div class="preview-item">
      ${item.file.type.startsWith('video/')
        ? `<video src="${item.previewUrl}" muted></video>`
        : `<img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}">`}
      <div class="preview-size">${escapeHtml(item.file.name)} · ${(item.file.size / 1048576).toFixed(1)} МБ</div>
      <button class="remove-media" type="button" data-remove-media="${index}" aria-label="Удалить файл">✕</button>
    </div>`).join('');
}

function updateUploadStatus(customText = '') {
  if (customText) {
    uploadStatusEl.textContent = customText;
    return;
  }
  const totalSize = pendingMedia.reduce((sum, item) => sum + item.file.size, 0);
  uploadStatusEl.textContent = pendingMedia.length
    ? `Прикреплено: ${(totalSize / 1048576).toFixed(1)} МБ / 67 МБ (${pendingMedia.length} файлов)`
    : '';
}

mediaPreviewEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-media]');
  if (!button) return;
  const index = Number(button.dataset.removeMedia);
  const [removed] = pendingMedia.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  renderMediaPreview();
  updateUploadStatus();
});

function renderPostCard(post) {
  const deleteButton = post.canDelete || post.authorId === profileId ? `
    <button class="delete-post-btn" type="button" data-delete-post="${post.id}" aria-label="Удалить пост">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
    </button>` : '';
  
  // Для медиа используем сохранённые data URL
  let mediaHTML = '';
  if (post.media && post.media.length) {
    mediaHTML = `<div class="post-media">${post.media.map(m => 
      m.type === 'video' 
        ? `<video controls src="${m.data || ''}"></video>` 
        : `<img src="${m.data || ''}" alt="media" loading="lazy">`
    ).join('')}</div>`;
  }
  
  return `
    <article class="post-card" data-postid="${post.id}">
      <div class="post-header">
        <img class="post-avatar" src="${post.avatarData || DEFAULT_AVATAR}" alt="avatar">
        <span class="post-nick">${escapeHtml(post.author) || 'Аноним'}</span>
        <time class="post-time">${formatDate(post.createdAt)}</time>
        ${deleteButton}
      </div>
      ${post.text ? `<div class="post-text">${escapeHtml(post.text)}</div>` : ''}
      ${mediaHTML}
      <div class="post-footer">
        <button class="vote-btn ${post.viewerVote === 1 ? 'liked' : ''}" type="button" data-postid="${post.id}" data-vote="1" aria-label="Нравится">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/><rect x="4" y="11" width="3" height="11" rx="1"/></svg>${post.likes || 0}
        </button>
        <button class="vote-btn ${post.viewerVote === -1 ? 'disliked' : ''}" type="button" data-postid="${post.id}" data-vote="-1" aria-label="Не нравится">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(180deg)"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/><rect x="4" y="11" width="3" height="11" rx="1"/></svg>${post.dislikes || 0}
        </button>
        <button class="comment-btn" type="button" data-toggle-comments="${post.id}" aria-label="Комментарии">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${(post.comments || []).length}
        </button>
      </div>
      <div class="comments-section" id="comments-${post.id}" style="display:${openComments.has(post.id) ? 'block' : 'none'}">
        ${(post.comments || []).map((comment) => `
          <div class="comment">
            <img class="comment-avatar" src="${comment.avatarData || DEFAULT_AVATAR}" alt="avatar">
            <div class="comment-content">
              <span class="comment-nick">${escapeHtml(comment.author) || 'Аноним'}</span>
              <div class="comment-text">${escapeHtml(comment.text)}</div>
            </div>
          </div>`).join('')}
        <div class="comment-input-row">
          <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="Комментарий...">
          <button class="btn add-comment-btn" type="button" data-add-comment="${post.id}">▶</button>
        </div>
      </div>
    </article>`;
}

function renderAllPosts() {
  const allPosts = socialData.posts || [];
  // Сортируем по времени
  allPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  postsListFeedEl.innerHTML = allPosts.length
    ? allPosts.map(renderPostCard).join('')
    : '<div class="empty-posts">Пока нет постов. Создайте первый!</div>';
  
  const myPosts = allPosts.filter((post) => post.authorId === profileId);
  postsListProfileEl.innerHTML = myPosts.length
    ? myPosts.map(renderPostCard).join('')
    : '<div class="empty-posts">У вас пока нет постов</div>';
}

document.addEventListener('click', async (event) => {
  const voteButton = event.target.closest('[data-vote]');
  if (voteButton) {
    if (!socialData.profile?.nickname) return showToast('Сначала установите ник!', true);
    const postId = voteButton.dataset.postid;
    const value = Number(voteButton.dataset.vote);
    const post = socialData.posts.find(p => p.id === postId);
    if (!post) return;
    
    if (post.viewerVote === value) {
      // Отмена голоса
      if (value === 1) post.likes--;
      else post.dislikes--;
      post.viewerVote = 0;
    } else {
      // Убираем предыдущий голос
      if (post.viewerVote === 1) post.likes--;
      else if (post.viewerVote === -1) post.dislikes--;
      if (value === 1) post.likes++;
      else post.dislikes++;
      post.viewerVote = value;
    }
    saveToStorage();
    renderAllPosts();
    return;
  }

  const toggleButton = event.target.closest('[data-toggle-comments]');
  if (toggleButton) {
    const postId = toggleButton.dataset.toggleComments;
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    const opening = section.style.display !== 'block';
    section.style.display = opening ? 'block' : 'none';
    opening ? openComments.add(postId) : openComments.delete(postId);
    return;
  }

  const commentButton = event.target.closest('[data-add-comment]');
  if (commentButton) {
    if (!socialData.profile?.nickname) return showToast('Сначала установите ник!', true);
    const postId = commentButton.dataset.addComment;
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input?.value.trim();
    if (!text) return;
    
    const post = socialData.posts.find(p => p.id === postId);
    if (!post) return;
    
    if (!post.comments) post.comments = [];
    post.comments.push({
      author: socialData.profile.nickname,
      authorId: profileId,
      text: text,
      createdAt: new Date().toISOString(),
      avatarData: socialData.profile.avatarData || DEFAULT_AVATAR
    });
    saveToStorage();
    openComments.add(postId);
    renderAllPosts();
    input.value = '';
    return;
  }

  const deleteButton = event.target.closest('[data-delete-post]');
  if (deleteButton) {
    if (!confirm('Удалить этот пост?')) return;
    const postId = deleteButton.dataset.deletePost;
    socialData.posts = socialData.posts.filter(p => p.id !== postId);
    saveToStorage();
    renderAllPosts();
    showToast('Пост удалён');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || !event.target.classList.contains('comment-input')) return;
  event.preventDefault();
  event.target.closest('.comment-input-row')?.querySelector('[data-add-comment]')?.click();
});

publishBtnEl.addEventListener('click', async () => {
  if (!socialData.profile?.nickname) return showToast('Сначала установите ник!', true);
  const text = postTextEl.value.trim();
  if (!text && pendingMedia.length === 0) return showToast('Напишите текст или прикрепите медиа', true);
  
  publishBtnEl.disabled = true;
  publishBtnEl.textContent = 'Публикация...';
  
  try {
    // Конвертируем медиа в data URL
    const mediaData = [];
    for (const item of pendingMedia) {
      const data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(item.file);
      });
      mediaData.push({
        type: item.file.type.startsWith('video/') ? 'video' : 'image',
        data: data,
        mimeType: item.file.type
      });
    }
    
    const post = {
      id: crypto.randomUUID(),
      author: socialData.profile.nickname,
      authorId: profileId,
      text: text,
      media: mediaData,
      comments: [],
      likes: 0,
      dislikes: 0,
      viewerVote: 0,
      createdAt: new Date().toISOString(),
      avatarData: socialData.profile.avatarData || DEFAULT_AVATAR
    };
    
    if (!socialData.posts) socialData.posts = [];
    socialData.posts.push(post);
    saveToStorage();
    
    postTextEl.value = '';
    pendingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    pendingMedia = [];
    renderMediaPreview();
    updateUploadStatus();
    setActiveTab('tabFeed', 'feedSection');
    renderAllPosts();
    showToast('Пост опубликован!');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    publishBtnEl.disabled = false;
    publishBtnEl.textContent = 'Опубликовать';
  }
});

function updateNotifCount() {
  const unread = (socialData.notifications || []).filter((notification) => !notification.read).length;
  notifCountEl.textContent = String(unread);
  notifCountEl.classList.toggle('visible', unread > 0);
  if (notificationPanelOpen) renderNotifications();
}

function renderNotifications() {
  const items = socialData.notifications || [];
  notificationPanelEl.innerHTML = items.length
    ? items.map((item) => `<div class="notif-item">${escapeHtml(item.message)}<span class="notif-time">${formatDate(item.createdAt)}</span></div>`).join('')
    : '<div class="notif-item">Нет уведомлений</div>';
}

bellBtnEl.addEventListener('click', async () => {
  if (!socialData.profile?.nickname) return showToast('Сначала установите ник!', true);
  notificationPanelOpen = !notificationPanelOpen;
  notificationPanelEl.style.display = notificationPanelOpen ? 'block' : 'none';
  if (!notificationPanelOpen) return;
  renderNotifications();
  if (socialData.notifications) {
    socialData.notifications.forEach((item) => { item.read = true; });
    saveToStorage();
    updateNotifCount();
  }
});

document.addEventListener('click', (event) => {
  if (!notificationPanelOpen || bellBtnEl.contains(event.target) || notificationPanelEl.contains(event.target)) return;
  notificationPanelOpen = false;
  notificationPanelEl.style.display = 'none';
});

function setActiveTab(buttonId, sectionId) {
  document.querySelectorAll('.tabs button').forEach((button) => button.classList.toggle('active', button.id === buttonId));
  document.querySelectorAll('.section').forEach((section) => section.classList.toggle('active', section.id === sectionId));
}

document.getElementById('tabFeed').addEventListener('click', () => setActiveTab('tabFeed', 'feedSection'));
document.getElementById('tabCreate').addEventListener('click', () => setActiveTab('tabCreate', 'createSection'));
document.getElementById('tabProfile').addEventListener('click', () => setActiveTab('tabProfile', 'profileSection'));

async function initialize() {
  const pendingNickname = localStorage.getItem('social_pending_nickname');
  if (pendingNickname) nicknameInput.value = pendingNickname;
  loadFromStorage();
  updateProfileUI();
  renderAllPosts();
  updateNotifCount();
  if (!socialData.profile && pendingNickname) await saveProfile(pendingNickname);
  // Авто-сохранение каждые 10 секунд
  window.setInterval(saveToStorage, 10000);
}

initialize();
