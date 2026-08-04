// ============================================================
// АНОНИМНАЯ СОЦИАЛЬНАЯ СЕТЬ - ТОЛЬКО GITHUB PAGES
// Все посты общие, только ник и аватар
// Данные синхронизируются между вкладками
// ============================================================

const DEFAULT_AVATAR = 'https://i.pinimg.com/236x/ca/32/a0/ca32a08ba5cdefbffa115c6cced9f519.jpg';
const MAX_FILE_SIZE = 67 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let profileId = getProfileId();
let currentProfile = null;
let allPosts = [];
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

// --- РАБОТА С ID ПРОФИЛЯ ---

function getProfileId() {
    let id = localStorage.getItem('anon_profile_id');
    if (!id) {
        id = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        localStorage.setItem('anon_profile_id', id);
    }
    return id;
}

// --- РАБОТА С ДАННЫМИ ---

function getData() {
    try {
        const raw = localStorage.getItem('anon_social_data');
        if (raw) {
            const data = JSON.parse(raw);
            if (!data.posts) data.posts = [];
            if (!data.profiles) data.profiles = {};
            if (!data.notifications) data.notifications = [];
            return data;
        }
    } catch (e) {
        console.warn('Ошибка чтения:', e);
    }
    return { posts: [], profiles: {}, notifications: [] };
}

function saveData(data) {
    try {
        localStorage.setItem('anon_social_data', JSON.stringify(data));
        // Уведомляем другие вкладки
        broadcastMessage({ type: 'data_updated' });
    } catch (e) {
        console.warn('Ошибка сохранения:', e);
    }
}

// --- СИНХРОНИЗАЦИЯ МЕЖДУ ВКЛАДКАМИ ---

let broadcastChannel = null;

function initBroadcast() {
    try {
        broadcastChannel = new BroadcastChannel('anon_social_channel');
        broadcastChannel.onmessage = (event) => {
            if (event.data?.type === 'data_updated') {
                loadData();
            }
        };
    } catch (e) {
        // BroadcastChannel не поддерживается в некоторых браузерах
        console.log('BroadcastChannel не поддерживается, синхронизация между вкладками недоступна');
    }
}

function broadcastMessage(message) {
    try {
        if (broadcastChannel) {
            broadcastChannel.postMessage(message);
        }
    } catch (e) {}
}

// --- ЗАГРУЗКА ДАННЫХ ---

function loadData() {
    const data = getData();
    
    // Загружаем профиль
    if (data.profiles[profileId]) {
        currentProfile = data.profiles[profileId];
    } else {
        // Создаём новый профиль
        data.profiles[profileId] = {
            nickname: '',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
        saveData(data);
        currentProfile = data.profiles[profileId];
    }
    
    // Загружаем посты
    allPosts = data.posts.map(post => {
        const authorProfile = data.profiles[post.authorId];
        return {
            ...post,
            author: authorProfile?.nickname || 'Аноним',
            avatarData: authorProfile?.avatarData || DEFAULT_AVATAR,
        };
    });
    
    updateUI();
}

// --- ОБНОВЛЕНИЕ UI ---

function updateUI() {
    updateProfileUI();
    renderAllPosts();
    updateNotifCount();
}

function updateProfileUI() {
    if (!currentProfile) return;
    
    const nickname = document.activeElement === nicknameInput
        ? nicknameInput.value.trim()
        : (currentProfile.nickname || '');
    
    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nickname;
    }
    profileNicknameEl.textContent = nickname || 'Без имени';
    
    const avatarData = currentProfile.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatarData;
    profileBigAvatarEl.src = avatarData;
}

function renderAllPosts() {
    const sorted = [...allPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Лента
    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p)).join('');
    } else {
        postsListFeedEl.innerHTML = `
            <div class="empty-posts">
                🌐 Пока нет постов<br>
                <span style="font-size:0.8rem;color:var(--muted)">Будьте первым!</span>
            </div>
        `;
    }
    
    // Мои посты
    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsListProfileEl.innerHTML = myPosts.map(p => renderPostCard(p)).join('');
    } else {
        postsListProfileEl.innerHTML = '<div class="empty-posts">У вас пока нет постов</div>';
    }
}

function renderPostCard(post) {
    const isMine = post.authorId === profileId;
    const deleteButton = isMine ? `
        <button class="delete-post-btn" type="button" data-delete-post="${post.id}" title="Удалить пост">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>
            </svg>
        </button>` : '';
    
    // Медиа
    let mediaHTML = '';
    if (post.media && post.media.length) {
        mediaHTML = `<div class="post-media">${post.media.map(m => {
            if (m.type === 'video') {
                return `<video controls src="${m.data || ''}" preload="metadata"></video>`;
            } else {
                return `<img src="${m.data || ''}" alt="media" loading="lazy">`;
            }
        }).join('')}</div>`;
    }
    
    // Комментарии
    const comments = post.comments || [];
    const data = getData();
    const commentsHTML = comments.map(c => {
        const authorProfile = data.profiles[c.authorId];
        return `
            <div class="comment">
                <img class="comment-avatar" src="${authorProfile?.avatarData || DEFAULT_AVATAR}" alt="avatar">
                <div class="comment-content">
                    <span class="comment-nick">${escapeHtml(authorProfile?.nickname || 'Аноним')}</span>
                    <div class="comment-text">${escapeHtml(c.text)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    const isOpen = openComments.has(post.id);
    const viewerVote = post.votes?.[profileId] || 0;
    
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
                <button class="vote-btn ${viewerVote === 1 ? 'liked' : ''}" type="button" data-postid="${post.id}" data-vote="1" aria-label="Нравится">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 1.96-2.45l-1.38-7A2 2 0 0 0 17.05 11H14z"/>
                        <rect x="4" y="11" width="3" height="11" rx="1"/>
                    </svg>${post.likes || 0}
                </button>
                <button class="vote-btn ${viewerVote === -1 ? 'disliked' : ''}" type="button" data-postid="${post.id}" data-vote="-1" aria-label="Не нравится">
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
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="Напишите комментарий...">
                    <button class="btn add-comment-btn" type="button" data-add-comment="${post.id}">▶</button>
                </div>
            </div>
        </article>
    `;
}

function updateNotifCount() {
    const data = getData();
    const count = data.notifications?.filter(n => !n.read).length || 0;
    notifCountEl.textContent = String(count);
    notifCountEl.classList.toggle('visible', count > 0);
}

function renderNotifications() {
    const data = getData();
    const notifications = data.notifications || [];
    if (notifications.length) {
        notificationPanelEl.innerHTML = notifications.map(n => `
            <div class="notif-item">
                ${escapeHtml(n.message)}
                <span class="notif-time">${formatDate(n.createdAt)}</span>
            </div>
        `).join('');
    } else {
        notificationPanelEl.innerHTML = '<div class="notif-item">Нет уведомлений</div>';
    }
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
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
    setTimeout(() => toast.remove(), 3200);
}

function generateId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// --- СОХРАНЕНИЕ ПРОФИЛЯ ---

function saveProfile(nickname, avatarData) {
    const data = getData();
    
    // Проверка на занятость ника
    const taken = Object.keys(data.profiles).some(id => 
        id !== profileId && data.profiles[id]?.nickname?.toLowerCase() === nickname.toLowerCase()
    );
    
    if (taken) {
        nicknameInput.classList.add('error');
        nickErrorMsg.textContent = '❌ Этот ник уже занят!';
        nickErrorMsg.classList.add('visible');
        return false;
    }
    
    if (!data.profiles[profileId]) {
        data.profiles[profileId] = {};
    }
    
    if (nickname) data.profiles[profileId].nickname = nickname;
    if (avatarData) data.profiles[profileId].avatarData = avatarData;
    data.profiles[profileId].updatedAt = new Date().toISOString();
    
    saveData(data);
    
    // Обновляем currentProfile
    currentProfile = data.profiles[profileId];
    
    nicknameInput.classList.remove('error');
    nickErrorMsg.classList.remove('visible');
    
    updateUI();
    return true;
}

// --- ПОСТЫ ---

function createPost(text, mediaData) {
    const data = getData();
    
    if (!currentProfile?.nickname) {
        showToast('Сначала установите ник!', true);
        return false;
    }
    
    const post = {
        id: generateId(),
        authorId: profileId,
        text: text || '',
        media: mediaData || [],
        likes: 0,
        dislikes: 0,
        votes: {},
        comments: [],
        createdAt: new Date().toISOString()
    };
    
    data.posts.unshift(post);
    saveData(data);
    loadData();
    return true;
}

function deletePost(postId) {
    const data = getData();
    const index = data.posts.findIndex(p => p.id === postId);
    if (index === -1) return false;
    if (data.posts[index].authorId !== profileId) {
        showToast('Это не ваш пост', true);
        return false;
    }
    data.posts.splice(index, 1);
    saveData(data);
    loadData();
    return true;
}

function votePost(postId, value) {
    const data = getData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return false;
    
    const currentVote = post.votes?.[profileId] || 0;
    
    if (currentVote === value) {
        // Отмена
        delete post.votes[profileId];
        if (value === 1) post.likes--;
        else post.dislikes--;
    } else {
        // Смена или новый голос
        if (currentVote === 1) post.likes--;
        else if (currentVote === -1) post.dislikes--;
        
        if (!post.votes) post.votes = {};
        post.votes[profileId] = value;
        if (value === 1) post.likes++;
        else post.dislikes++;
    }
    
    saveData(data);
    loadData();
    return true;
}

function addComment(postId, text) {
    const data = getData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return false;
    
    if (!currentProfile?.nickname) {
        showToast('Сначала установите ник!', true);
        return false;
    }
    
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: generateId(),
        authorId: profileId,
        text: text,
        createdAt: new Date().toISOString()
    });
    
    saveData(data);
    loadData();
    return true;
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---

// Никнейм
nicknameInput.addEventListener('input', () => {
    const nickname = nicknameInput.value.trim();
    profileNicknameEl.textContent = nickname || 'Без имени';
    clearTimeout(profileSaveTimer);
    
    if (!nickname) {
        nicknameInput.classList.remove('error');
        nickErrorMsg.classList.remove('visible');
        return;
    }
    
    profileSaveTimer = setTimeout(() => {
        saveProfile(nickname);
    }, 400);
});

nicknameInput.addEventListener('blur', () => {
    clearTimeout(profileSaveTimer);
    const nickname = nicknameInput.value.trim();
    if (nickname) saveProfile(nickname);
});

// Аватар
profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    
    if (!currentProfile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    if (file.size > MAX_AVATAR_SIZE) {
        return showToast('Аватар должен быть меньше 5 МБ', true);
    }
    if (!file.type.startsWith('image/')) {
        return showToast('Выберите изображение', true);
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        saveProfile(currentProfile.nickname, e.target.result);
        showToast('Аватар обновлён');
    };
    reader.readAsDataURL(file);
});

// Медиа
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
    if (pendingMedia.length) {
        mediaPreviewEl.innerHTML = pendingMedia.map((item, index) => `
            <div class="preview-item">
                ${item.file.type.startsWith('video/')
                    ? `<video src="${item.previewUrl}" muted></video>`
                    : `<img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}">`}
                <div class="preview-size">${escapeHtml(item.file.name)}</div>
                <button class="remove-media" type="button" data-remove-media="${index}">✕</button>
            </div>
        `).join('');
    } else {
        mediaPreviewEl.innerHTML = '';
    }
}

function updateUploadStatus(customText = '') {
    if (customText) {
        uploadStatusEl.textContent = customText;
        return;
    }
    const totalSize = pendingMedia.reduce((sum, item) => sum + item.file.size, 0);
    uploadStatusEl.textContent = pendingMedia.length
        ? `📎 ${pendingMedia.length} файлов (${(totalSize / 1048576).toFixed(1)} МБ)`
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

// Публикация
publishBtnEl.addEventListener('click', async () => {
    if (!currentProfile?.nickname) {
        return showToast('Сначала установите ник!', true);
    }
    
    const text = postTextEl.value.trim();
    if (!text && pendingMedia.length === 0) {
        return showToast('Напишите текст или прикрепите медиа', true);
    }
    
    publishBtnEl.disabled = true;
    publishBtnEl.textContent = '📤 Публикация...';
    
    try {
        const mediaData = [];
        for (const item of pendingMedia) {
            const data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(item.file);
            });
            mediaData.push({
                type: item.file.type.startsWith('video/') ? 'video' : 'image',
                data: data
            });
        }
        
        createPost(text, mediaData);
        
        postTextEl.value = '';
        pendingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        pendingMedia = [];
        renderMediaPreview();
        updateUploadStatus();
        
        setActiveTab('tabFeed', 'feedSection');
        showToast('✅ Пост опубликован!');
        
    } catch (error) {
        showToast(error.message, true);
    } finally {
        publishBtnEl.disabled = false;
        publishBtnEl.textContent = 'Опубликовать';
    }
});

// --- ОБРАБОТЧИКИ КЛИКОВ ---

document.addEventListener('click', (event) => {
    // Голоса
    const voteBtn = event.target.closest('[data-vote]');
    if (voteBtn) {
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = voteBtn.dataset.postid;
        const value = Number(voteBtn.dataset.vote);
        votePost(postId, value);
        return;
    }
    
    // Комментарии
    const toggleBtn = event.target.closest('[data-toggle-comments]');
    if (toggleBtn) {
        const postId = toggleBtn.dataset.toggleComments;
        const section = document.getElementById(`comments-${postId}`);
        if (!section) return;
        const opening = section.style.display !== 'block';
        section.style.display = opening ? 'block' : 'none';
        opening ? openComments.add(postId) : openComments.delete(postId);
        return;
    }
    
    const commentBtn = event.target.closest('[data-add-comment]');
    if (commentBtn) {
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = commentBtn.dataset.addComment;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input?.value.trim();
        if (!text) return;
        addComment(postId, text);
        openComments.add(postId);
        input.value = '';
        return;
    }
    
    // Удаление
    const deleteBtn = event.target.closest('[data-delete-post]');
    if (deleteBtn) {
        if (!confirm('Удалить этот пост?')) return;
        deletePost(deleteBtn.dataset.deletePost);
        return;
    }
});

// Enter для комментариев
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || !event.target.classList.contains('comment-input')) return;
    event.preventDefault();
    event.target.closest('.comment-input-row')?.querySelector('[data-add-comment]')?.click();
});

// Уведомления
bellBtnEl.addEventListener('click', () => {
    notificationPanelOpen = !notificationPanelOpen;
    notificationPanelEl.style.display = notificationPanelOpen ? 'block' : 'none';
    if (notificationPanelOpen) {
        renderNotifications();
        const data = getData();
        if (data.notifications) {
            data.notifications.forEach(n => { n.read = true; });
            saveData(data);
            updateNotifCount();
        }
    }
});

document.addEventListener('click', (event) => {
    if (!notificationPanelOpen || bellBtnEl.contains(event.target) || notificationPanelEl.contains(event.target)) return;
    notificationPanelOpen = false;
    notificationPanelEl.style.display = 'none';
});

// Вкладки
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

// --- ДЕМО-ПОСТЫ ---

function addDemoPosts() {
    const data = getData();
    if (data.posts.length > 0) return;
    
    // Создаём демо-профиль
    if (!data.profiles['demo_user']) {
        data.profiles['demo_user'] = {
            nickname: '👋 Демо-пользователь',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
    }
    
    data.posts = [
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '🌟 Добро пожаловать в анонимную социальную сеть!\n\nЗдесь вы можете:\n📝 Публиковать посты\n❤️ Ставить лайки\n💬 Комментировать\n🖼️ Прикреплять фото и видео\n\nУстановите свой ник и аватар!',
            media: [],
            likes: 0,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: new Date(Date.now() - 300000).toISOString()
        },
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '💡 Совет: нажмите на аватар чтобы загрузить своё фото. Ник можно изменить в любой момент.',
            media: [],
            likes: 0,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: new Date(Date.now() - 600000).toISOString()
        }
    ];
    
    saveData(data);
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function init() {
    // Добавляем демо-посты при первом запуске
    addDemoPosts();
    
    // Инициализируем BroadcastChannel
    initBroadcast();
    
    // Загружаем данные
    loadData();
    
    // Если нет ника - фокус на поле
    if (!currentProfile?.nickname) {
        nicknameInput.focus();
        nicknameInput.placeholder = '👤 Введите ваш ник...';
    }
    
    // Авто-обновление каждые 10 секунд
    setInterval(() => {
        loadData();
    }, 10000);
    
    console.log('✅ Анонимная социальная сеть запущена!');
    console.log('👤 Ваш ID:', profileId);
    console.log('📦 Данные хранятся в localStorage');
    console.log('🔄 Синхронизация между вкладками:', broadcastChannel ? 'включена' : 'выключена');
}

// Запускаем
init();
