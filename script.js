// ============================================================
// СОЦИАЛЬНАЯ СЕТЬ - ПОЛНОСТЬЮ НА LOCALSTORAGE (БЕЗ БЭКЕНДА)
// ============================================================

const DEFAULT_AVATAR = 'https://litmir.club/data/Author/279000/279758/Фото_Нуремхет_Аноним_b86a9.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
const profileId = getProfileId();
let pendingMedia = [];
let profileSaveTimer = 0;
let notificationPanelOpen = false;
const openComments = new Set();

// --- DOM ЭЛЕМЕНТЫ ---
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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function getProfileId() {
    const stored = localStorage.getItem('social_profile_id');
    if (stored) return stored;
    const created = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random();
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
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(value));
    } catch {
        return '';
    }
}

function showToast(message, isError = false) {
    document.querySelector('.toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 3200);
}

function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2);
}

// --- РАБОТА С ДАННЫМИ ---

function getData() {
    try {
        const raw = localStorage.getItem('social_data');
        if (!raw) return { profile: null, posts: [], notifications: [] };
        const data = JSON.parse(raw);
        // Убеждаемся, что все поля есть
        if (!data.posts) data.posts = [];
        if (!data.notifications) data.notifications = [];
        if (!data.profile) data.profile = null;
        return data;
    } catch {
        return { profile: null, posts: [], notifications: [] };
    }
}

function saveData(data) {
    try {
        localStorage.setItem('social_data', JSON.stringify(data));
    } catch (e) {
        console.warn('Ошибка сохранения:', e);
    }
}

function getProfile() {
    const data = getData();
    return data.profile;
}

function getPosts() {
    const data = getData();
    return data.posts || [];
}

function getNotifications() {
    const data = getData();
    return data.notifications || [];
}

// --- ОБНОВЛЕНИЕ UI ---

function updateProfileUI() {
    const profile = getProfile();
    const nickname = document.activeElement === nicknameInput
        ? nicknameInput.value.trim()
        : (profile?.nickname || localStorage.getItem('social_pending_nickname') || '');
    
    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nickname;
    }
    profileNicknameEl.textContent = nickname || 'Без имени';
    
    const avatarData = profile?.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatarData;
    profileBigAvatarEl.src = avatarData;
}

function renderAllPosts() {
    const posts = getPosts();
    const profile = getProfile();
    
    // Сортируем по дате (новые сверху)
    const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Лента
    postsListFeedEl.innerHTML = sorted.length
        ? sorted.map(p => renderPostCard(p, profile)).join('')
        : '<div class="empty-posts">Пока нет постов. Создайте первый!</div>';
    
    // Мои посты
    const myPosts = sorted.filter(p => p.authorId === profileId);
    postsListProfileEl.innerHTML = myPosts.length
        ? myPosts.map(p => renderPostCard(p, profile)).join('')
        : '<div class="empty-posts">У вас пока нет постов</div>';
}

function renderPostCard(post, profile) {
    const isMine = post.authorId === profileId;
    const deleteButton = isMine ? `
        <button class="delete-post-btn" type="button" data-delete-post="${post.id}" aria-label="Удалить пост">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>
            </svg>
        </button>` : '';
    
    // Медиа
    let mediaHTML = '';
    if (post.media && post.media.length) {
        mediaHTML = `<div class="post-media">${post.media.map(m => {
            if (m.type === 'video') {
                return `<video controls src="${m.data || ''}"></video>`;
            } else {
                return `<img src="${m.data || ''}" alt="media" loading="lazy">`;
            }
        }).join('')}</div>`;
    }
    
    // Комментарии
    const comments = post.comments || [];
    const commentsHTML = comments.map(c => `
        <div class="comment">
            <img class="comment-avatar" src="${c.avatarData || DEFAULT_AVATAR}" alt="avatar">
            <div class="comment-content">
                <span class="comment-nick">${escapeHtml(c.author) || 'Аноним'}</span>
                <div class="comment-text">${escapeHtml(c.text)}</div>
            </div>
        </div>
    `).join('');
    
    const isOpen = openComments.has(post.id);
    
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/>
                        <rect x="4" y="11" width="3" height="11" rx="1"/>
                    </svg>${post.likes || 0}
                </button>
                <button class="vote-btn ${post.viewerVote === -1 ? 'disliked' : ''}" type="button" data-postid="${post.id}" data-vote="-1" aria-label="Не нравится">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(180deg)">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/>
                        <rect x="4" y="11" width="3" height="11" rx="1"/>
                    </svg>${post.dislikes || 0}
                </button>
                <button class="comment-btn" type="button" data-toggle-comments="${post.id}" aria-label="Комментарии">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>${comments.length}
                </button>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display:${isOpen ? 'block' : 'none'}">
                ${commentsHTML}
                <div class="comment-input-row">
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="Комментарий...">
                    <button class="btn add-comment-btn" type="button" data-add-comment="${post.id}">▶</button>
                </div>
            </div>
        </article>
    `;
}

function updateNotifCount() {
    const notifications = getNotifications();
    const unread = notifications.filter(n => !n.read).length;
    notifCountEl.textContent = String(unread);
    notifCountEl.classList.toggle('visible', unread > 0);
    if (notificationPanelOpen) renderNotifications();
}

function renderNotifications() {
    const notifications = getNotifications();
    notificationPanelEl.innerHTML = notifications.length
        ? notifications.map(n => `
            <div class="notif-item">${escapeHtml(n.message)}
                <span class="notif-time">${formatDate(n.createdAt)}</span>
            </div>
        `).join('')
        : '<div class="notif-item">Нет уведомлений</div>';
}

// --- СОХРАНЕНИЕ ПРОФИЛЯ ---

function saveProfile(nickname, avatarData) {
    return new Promise((resolve) => {
        const data = getData();
        
        // Проверка на занятость ника (кроме себя)
        const taken = data.posts.some(p => 
            p.author === nickname && p.authorId !== profileId
        );
        
        if (taken && !avatarData) { // только при смене ника
            nicknameInput.classList.add('error');
            nickErrorMsg.textContent = '❌ Этот ник уже занят!';
            nickErrorMsg.classList.add('visible');
            resolve(false);
            return;
        }
        
        if (!data.profile) {
            data.profile = {};
        }
        data.profile.nickname = nickname;
        if (avatarData) {
            data.profile.avatarData = avatarData;
        }
        data.profile.updatedAt = new Date().toISOString();
        
        // Обновляем ник во всех постах автора
        data.posts.forEach(p => {
            if (p.authorId === profileId) {
                p.author = nickname;
                if (avatarData) p.avatarData = avatarData;
            }
        });
        
        saveData(data);
        nicknameInput.classList.remove('error');
        nickErrorMsg.classList.remove('visible');
        localStorage.setItem('social_pending_nickname', nickname);
        updateProfileUI();
        renderAllPosts();
        resolve(true);
    });
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

// Никнейм
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

// Аватар
profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    
    const profile = getProfile();
    if (!profile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    if (file.size > MAX_AVATAR_SIZE) {
        return showToast('Аватар должен быть меньше 5 МБ', true);
    }
    if (!file.type.startsWith('image/')) {
        return showToast('Выберите изображение', true);
    }
    
    try {
        const reader = new FileReader();
        reader.onload = function(e) {
            saveProfile(profile.nickname, e.target.result);
            showToast('Аватар обновлён');
        };
        reader.readAsDataURL(file);
    } catch (error) {
        showToast(error.message, true);
    }
});

// Прикрепление медиа
document.getElementById('attachBtn').addEventListener('click', () => mediaUploadEl.click());

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
        </div>
    `).join('');
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

// --- ПУБЛИКАЦИЯ ПОСТА ---

publishBtnEl.addEventListener('click', async () => {
    const profile = getProfile();
    if (!profile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    
    const text = postTextEl.value.trim();
    if (!text && pendingMedia.length === 0) {
        return showToast('Напишите текст или прикрепите медиа', true);
    }
    
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
            id: generateId(),
            author: profile.nickname,
            authorId: profileId,
            text: text,
            media: mediaData,
            comments: [],
            likes: 0,
            dislikes: 0,
            viewerVote: 0,
            createdAt: new Date().toISOString(),
            avatarData: profile.avatarData || DEFAULT_AVATAR
        };
        
        const data = getData();
        data.posts.push(post);
        saveData(data);
        
        // Очищаем форму
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

// --- ГОЛОСА И КОММЕНТАРИИ ---

document.addEventListener('click', (event) => {
    // Голоса
    const voteButton = event.target.closest('[data-vote]');
    if (voteButton) {
        const profile = getProfile();
        if (!profile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        
        const postId = voteButton.dataset.postid;
        const value = Number(voteButton.dataset.vote);
        const data = getData();
        const post = data.posts.find(p => p.id === postId);
        if (!post) return;
        
        if (post.viewerVote === value) {
            // Отмена
            if (value === 1) post.likes--;
            else post.dislikes--;
            post.viewerVote = 0;
        } else {
            // Меняем голос
            if (post.viewerVote === 1) post.likes--;
            else if (post.viewerVote === -1) post.dislikes--;
            
            if (value === 1) post.likes++;
            else post.dislikes++;
            post.viewerVote = value;
        }
        
        saveData(data);
        renderAllPosts();
        return;
    }
    
    // Комментарии
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
        const profile = getProfile();
        if (!profile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        
        const postId = commentButton.dataset.addComment;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input?.value.trim();
        if (!text) return;
        
        const data = getData();
        const post = data.posts.find(p => p.id === postId);
        if (!post) return;
        
        if (!post.comments) post.comments = [];
        post.comments.push({
            author: profile.nickname,
            authorId: profileId,
            text: text,
            createdAt: new Date().toISOString(),
            avatarData: profile.avatarData || DEFAULT_AVATAR
        });
        
        saveData(data);
        openComments.add(postId);
        renderAllPosts();
        input.value = '';
        return;
    }
    
    // Удаление поста
    const deleteButton = event.target.closest('[data-delete-post]');
    if (deleteButton) {
        if (!confirm('Удалить этот пост?')) return;
        const postId = deleteButton.dataset.deletePost;
        const data = getData();
        data.posts = data.posts.filter(p => p.id !== postId);
        saveData(data);
        renderAllPosts();
        showToast('Пост удалён');
    }
});

// Enter для комментариев
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || !event.target.classList.contains('comment-input')) return;
    event.preventDefault();
    event.target.closest('.comment-input-row')?.querySelector('[data-add-comment]')?.click();
});

// --- УВЕДОМЛЕНИЯ ---

bellBtnEl.addEventListener('click', () => {
    const profile = getProfile();
    if (!profile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    
    notificationPanelOpen = !notificationPanelOpen;
    notificationPanelEl.style.display = notificationPanelOpen ? 'block' : 'none';
    if (!notificationPanelOpen) return;
    
    renderNotifications();
    const data = getData();
    data.notifications.forEach(n => { n.read = true; });
    saveData(data);
    updateNotifCount();
});

document.addEventListener('click', (event) => {
    if (!notificationPanelOpen || bellBtnEl.contains(event.target) || notificationPanelEl.contains(event.target)) return;
    notificationPanelOpen = false;
    notificationPanelEl.style.display = 'none';
});

// --- ВКЛАДКИ ---

function setActiveTab(buttonId, sectionId) {
    document.querySelectorAll('.tabs button').forEach(btn => 
        btn.classList.toggle('active', btn.id === buttonId)
    );
    document.querySelectorAll('.section').forEach(section => 
        section.classList.toggle('active', section.id === sectionId)
    );
}

document.getElementById('tabFeed').addEventListener('click', () => setActiveTab('tabFeed', 'feedSection'));
document.getElementById('tabCreate').addEventListener('click', () => setActiveTab('tabCreate', 'createSection'));
document.getElementById('tabProfile').addEventListener('click', () => setActiveTab('tabProfile', 'profileSection'));

// --- ИНИЦИАЛИЗАЦИЯ ---

function init() {
    const pendingNickname = localStorage.getItem('social_pending_nickname');
    if (pendingNickname) {
        nicknameInput.value = pendingNickname;
    }
    
    const profile = getProfile();
    if (profile?.nickname) {
        nicknameInput.value = profile.nickname;
    }
    
    updateProfileUI();
    renderAllPosts();
    updateNotifCount();
    
    // Проверяем, есть ли уже профиль
    if (!profile || !profile.nickname) {
        // Если нет ника, предлагаем ввести
        nicknameInput.focus();
    }
}

// Запускаем
init();

console.log('✅ Социальная сеть работает на localStorage! Все данные сохраняются в браузере.');
