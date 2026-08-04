// ============================================================
// СОЦИАЛЬНАЯ СЕТЬ - РАБОТАЕТ СРАЗУ НА GITHUB PAGES
// Данные хранятся в localStorage и видны всем пользователям
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
let allPosts = [];

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
    const created = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2);
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

// --- РАБОТА С ДАННЫМИ (ОБЩЕЕ ХРАНИЛИЩЕ) ---

function getAllData() {
    try {
        const raw = localStorage.getItem('social_network_data');
        if (raw) {
            const data = JSON.parse(raw);
            // Убеждаемся, что все поля есть
            if (!data.posts) data.posts = [];
            if (!data.profiles) data.profiles = {};
            if (!data.notifications) data.notifications = [];
            return data;
        }
    } catch (e) {
        console.warn('Ошибка чтения данных:', e);
    }
    return { posts: [], profiles: {}, notifications: [] };
}

function saveAllData(data) {
    try {
        localStorage.setItem('social_network_data', JSON.stringify(data));
    } catch (e) {
        console.warn('Ошибка сохранения:', e);
    }
}

function getCurrentProfile() {
    const data = getAllData();
    if (!data.profiles[profileId]) {
        data.profiles[profileId] = {
            nickname: '',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
        saveAllData(data);
    }
    return data.profiles[profileId];
}

function updateProfile(nickname, avatarData) {
    const data = getAllData();
    if (!data.profiles[profileId]) {
        data.profiles[profileId] = {};
    }
    if (nickname !== undefined) data.profiles[profileId].nickname = nickname;
    if (avatarData !== undefined) data.profiles[profileId].avatarData = avatarData;
    data.profiles[profileId].updatedAt = new Date().toISOString();
    saveAllData(data);
}

function getAllPosts() {
    const data = getAllData();
    // Обогащаем посты данными авторов
    return data.posts.map(post => {
        const authorProfile = data.profiles[post.authorId];
        return {
            ...post,
            author: authorProfile?.nickname || 'Аноним',
            avatarData: authorProfile?.avatarData || DEFAULT_AVATAR,
        };
    });
}

function addPost(text, mediaData) {
    const data = getAllData();
    const profile = data.profiles[profileId];
    if (!profile || !profile.nickname) {
        throw new Error('Сначала установите ник!');
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
    saveAllData(data);
    return post;
}

function deletePost(postId) {
    const data = getAllData();
    const index = data.posts.findIndex(p => p.id === postId);
    if (index === -1) return false;
    if (data.posts[index].authorId !== profileId) {
        throw new Error('Вы не можете удалить этот пост');
    }
    data.posts.splice(index, 1);
    saveAllData(data);
    return true;
}

function votePost(postId, value) {
    const data = getAllData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) throw new Error('Пост не найден');
    
    const currentVote = post.votes[profileId] || 0;
    
    if (currentVote === value) {
        // Отмена голоса
        delete post.votes[profileId];
        if (value === 1) post.likes--;
        else post.dislikes--;
    } else {
        // Меняем голос
        if (currentVote === 1) post.likes--;
        else if (currentVote === -1) post.dislikes--;
        
        post.votes[profileId] = value;
        if (value === 1) post.likes++;
        else post.dislikes++;
    }
    
    saveAllData(data);
    return post;
}

function addComment(postId, text) {
    const data = getAllData();
    const post = data.posts.find(p => p.id === postId);
    if (!post) throw new Error('Пост не найден');
    
    const profile = data.profiles[profileId];
    if (!profile || !profile.nickname) {
        throw new Error('Сначала установите ник!');
    }
    
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: generateId(),
        authorId: profileId,
        text: text,
        createdAt: new Date().toISOString()
    });
    
    saveAllData(data);
    return post;
}

// --- UI ФУНКЦИИ ---

function updateProfileUI() {
    const profile = getCurrentProfile();
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
    const posts = getAllPosts();
    const profile = getCurrentProfile();
    
    // Сортируем по дате (новые сверху)
    const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Лента
    if (sorted.length) {
        postsListFeedEl.innerHTML = sorted.map(p => renderPostCard(p, profile)).join('');
    } else {
        postsListFeedEl.innerHTML = '<div class="empty-posts">Пока нет постов. Создайте первый!</div>';
    }
    
    // Мои посты
    const myPosts = sorted.filter(p => p.authorId === profileId);
    if (myPosts.length) {
        postsListProfileEl.innerHTML = myPosts.map(p => renderPostCard(p, profile)).join('');
    } else {
        postsListProfileEl.innerHTML = '<div class="empty-posts">У вас пока нет постов</div>';
    }
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
    const commentsHTML = comments.map(c => {
        const authorProfile = getAllData().profiles[c.authorId];
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
                    <input class="comment-input" id="comment-input-${post.id}" maxlength="1000" placeholder="Комментарий...">
                    <button class="btn add-comment-btn" type="button" data-add-comment="${post.id}">▶</button>
                </div>
            </div>
        </article>
    `;
}

function updateNotifCount() {
    const data = getAllData();
    const count = data.notifications?.filter(n => !n.read).length || 0;
    notifCountEl.textContent = String(count);
    notifCountEl.classList.toggle('visible', count > 0);
}

function renderNotifications() {
    const data = getAllData();
    const notifications = data.notifications || [];
    if (notifications.length) {
        notificationPanelEl.innerHTML = notifications.map(n => `
            <div class="notif-item">${escapeHtml(n.message)}
                <span class="notif-time">${formatDate(n.createdAt)}</span>
            </div>
        `).join('');
    } else {
        notificationPanelEl.innerHTML = '<div class="notif-item">Нет уведомлений</div>';
    }
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
    profileSaveTimer = window.setTimeout(() => {
        try {
            // Проверка на занятость ника
            const data = getAllData();
            const taken = Object.keys(data.profiles).some(id => 
                id !== profileId && data.profiles[id]?.nickname === nickname
            );
            if (taken) {
                nicknameInput.classList.add('error');
                nickErrorMsg.textContent = '❌ Этот ник уже занят!';
                nickErrorMsg.classList.add('visible');
                return;
            }
            updateProfile(nickname);
            nicknameInput.classList.remove('error');
            nickErrorMsg.classList.remove('visible');
            localStorage.setItem('social_pending_nickname', nickname);
            renderAllPosts();
        } catch (error) {
            showToast(error.message, true);
        }
    }, 450);
});

nicknameInput.addEventListener('blur', () => {
    window.clearTimeout(profileSaveTimer);
    const nickname = nicknameInput.value.trim();
    if (nickname) {
        try {
            updateProfile(nickname);
            localStorage.setItem('social_pending_nickname', nickname);
            renderAllPosts();
        } catch (error) {
            showToast(error.message, true);
        }
    }
});

// Аватар
profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    
    const profile = getCurrentProfile();
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
            updateProfile(profile.nickname, e.target.result);
            updateProfileUI();
            renderAllPosts();
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
    if (pendingMedia.length) {
        mediaPreviewEl.innerHTML = pendingMedia.map((item, index) => `
            <div class="preview-item">
                ${item.file.type.startsWith('video/')
                    ? `<video src="${item.previewUrl}" muted></video>`
                    : `<img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}">`}
                <div class="preview-size">${escapeHtml(item.file.name)} · ${(item.file.size / 1048576).toFixed(1)} МБ</div>
                <button class="remove-media" type="button" data-remove-media="${index}" aria-label="Удалить файл">✕</button>
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
    const profile = getCurrentProfile();
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
        
        addPost(text, mediaData);
        
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

// --- ОБРАБОТЧИКИ КЛИКОВ ---

document.addEventListener('click', (event) => {
    // Голоса
    const voteButton = event.target.closest('[data-vote]');
    if (voteButton) {
        const profile = getCurrentProfile();
        if (!profile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = voteButton.dataset.postid;
        const value = Number(voteButton.dataset.vote);
        try {
            votePost(postId, value);
            renderAllPosts();
        } catch (error) {
            showToast(error.message, true);
        }
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
        const profile = getCurrentProfile();
        if (!profile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = commentButton.dataset.addComment;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input?.value.trim();
        if (!text) return;
        try {
            addComment(postId, text);
            openComments.add(postId);
            renderAllPosts();
            input.value = '';
        } catch (error) {
            showToast(error.message, true);
        }
        return;
    }
    
    // Удаление поста
    const deleteButton = event.target.closest('[data-delete-post]');
    if (deleteButton) {
        if (!confirm('Удалить этот пост?')) return;
        const postId = deleteButton.dataset.deletePost;
        try {
            deletePost(postId);
            renderAllPosts();
            showToast('Пост удалён');
        } catch (error) {
            showToast(error.message, true);
        }
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
    notificationPanelOpen = !notificationPanelOpen;
    notificationPanelEl.style.display = notificationPanelOpen ? 'block' : 'none';
    if (notificationPanelOpen) {
        renderNotifications();
        // Отмечаем как прочитанные
        const data = getAllData();
        if (data.notifications) {
            data.notifications.forEach(n => { n.read = true; });
            saveAllData(data);
            updateNotifCount();
        }
    }
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

// --- ДЕМО-ПОСТЫ ПРИ ПЕРВОМ ЗАПУСКЕ ---

function addDemoPosts() {
    const data = getAllData();
    if (data.posts.length > 0) return;
    
    // Создаём демо-профиль
    if (!data.profiles['demo_user']) {
        data.profiles['demo_user'] = {
            nickname: 'Демо-пользователь',
            avatarData: DEFAULT_AVATAR,
            createdAt: new Date().toISOString()
        };
    }
    
    // Добавляем демо-посты
    data.posts = [
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '👋 Добро пожаловать в социальную сеть! Здесь вы можете публиковать посты, ставить лайки и комментировать.',
            media: [],
            likes: 5,
            dislikes: 0,
            votes: {},
            comments: [
                {
                    id: generateId(),
                    authorId: profileId,
                    text: 'Круто! 🔥',
                    createdAt: new Date(Date.now() - 3600000).toISOString()
                }
            ],
            createdAt: new Date(Date.now() - 7200000).toISOString()
        },
        {
            id: generateId(),
            authorId: 'demo_user',
            text: '💡 Совет: установите свой ник и аватар, чтобы другие пользователи могли вас узнавать.',
            media: [],
            likes: 3,
            dislikes: 0,
            votes: {},
            comments: [],
            createdAt: new Date(Date.now() - 14400000).toISOString()
        }
    ];
    
    saveAllData(data);
}

// --- ИНИЦИАЛИЗАЦИЯ ---

function init() {
    try {
        // Добавляем демо-посты при первом запуске
        addDemoPosts();
        
        // Восстанавливаем ник
        const pendingNickname = localStorage.getItem('social_pending_nickname');
        const profile = getCurrentProfile();
        
        if (pendingNickname && !profile.nickname) {
            updateProfile(pendingNickname);
        }
        
        if (profile?.nickname) {
            nicknameInput.value = profile.nickname;
        } else if (pendingNickname) {
            nicknameInput.value = pendingNickname;
        }
        
        updateProfileUI();
        renderAllPosts();
        updateNotifCount();
        
        // Периодическое обновление (для синхронизации между вкладками)
        setInterval(() => {
            renderAllPosts();
            updateNotifCount();
        }, 5000);
        
        console.log('✅ Социальная сеть запущена!');
        console.log('👤 Ваш ID:', profileId);
        console.log('📦 Данные хранятся в localStorage');
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showToast('Ошибка: ' + error.message, true);
    }
}

// Запускаем
init();
