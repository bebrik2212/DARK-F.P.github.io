// ============================================================
// СОЦИАЛЬНАЯ СЕТЬ - ПОЛНЫЙ БЭКЕНД НА POCKETBASE
// ============================================================

// --- КОНФИГУРАЦИЯ ---
// Замените на ваш URL после деплоя на Render
const API_URL = 'https://your-app.onrender.com/api/collections';
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
let currentProfile = null;

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

// --- API КЛИЕНТ ДЛЯ POCKETBASE ---

async function pbApi(path, options = {}) {
    const url = `${API_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    // Добавляем profile_id в заголовки для авторизации
    if (profileId) {
        headers['X-Profile-Id'] = profileId;
    }
    
    const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
        let errorMessage = 'Ошибка сервера';
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
            errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }
    
    return response.json();
}

// --- РАБОТА С ПРОФИЛЕМ ---

async function getProfileFromServer() {
    try {
        const result = await pbApi('/profiles', {
            method: 'GET',
            headers: { 'X-Profile-Id': profileId }
        });
        
        // Ищем профиль по profileId
        const profile = result.items?.find(p => p.profileId === profileId);
        if (profile) {
            currentProfile = profile;
            localStorage.setItem('social_profile_cache', JSON.stringify(profile));
            return profile;
        }
        return null;
    } catch (error) {
        // Пробуем взять из кэша
        const cached = localStorage.getItem('social_profile_cache');
        if (cached) {
            try {
                currentProfile = JSON.parse(cached);
                return currentProfile;
            } catch {}
        }
        return null;
    }
}

async function saveProfileToServer(nickname, avatarData) {
    const profile = await getProfileFromServer();
    
    if (profile?.id) {
        // Обновляем существующий профиль
        await pbApi(`/profiles/${profile.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ 
                nickname, 
                avatarData: avatarData || profile.avatarData,
            }),
        });
    } else {
        // Создаём новый профиль
        await pbApi('/profiles', {
            method: 'POST',
            body: JSON.stringify({ 
                profileId,
                nickname, 
                avatarData: avatarData || DEFAULT_AVATAR,
            }),
        });
    }
    
    // Обновляем кэш
    await getProfileFromServer();
    localStorage.setItem('social_pending_nickname', nickname);
    updateProfileUI();
    await loadPosts();
}

// --- РАБОТА С ПОСТАМИ ---

async function loadPosts() {
    try {
        const result = await pbApi('/posts', {
            method: 'GET',
            headers: { 'X-Profile-Id': profileId }
        });
        
        // Расширяем посты данными авторов
        const posts = result.items || [];
        
        // Загружаем информацию об авторах
        const enrichedPosts = await Promise.all(posts.map(async (post) => {
            try {
                // Получаем автора
                const authorResult = await pbApi(`/profiles/${post.authorId}`);
                const author = authorResult;
                return {
                    ...post,
                    author: author?.nickname || 'Аноним',
                    avatarData: author?.avatarData || DEFAULT_AVATAR,
                };
            } catch {
                return {
                    ...post,
                    author: 'Аноним',
                    avatarData: DEFAULT_AVATAR,
                };
            }
        }));
        
        allPosts = enrichedPosts;
        renderAllPosts();
        return enrichedPosts;
    } catch (error) {
        showToast('Не удалось загрузить посты: ' + error.message, true);
        return [];
    }
}

async function createPostOnServer(text, mediaData) {
    const profile = await getProfileFromServer();
    if (!profile) {
        throw new Error('Сначала создайте профиль (установите ник)');
    }
    
    const post = await pbApi('/posts', {
        method: 'POST',
        body: JSON.stringify({
            text: text,
            media: mediaData || [],
            authorId: profile.id,
            likes: 0,
            dislikes: 0,
            comments: [],
            createdAt: new Date().toISOString(),
        }),
    });
    
    await loadPosts();
    return post;
}

async function deletePostFromServer(postId) {
    await pbApi(`/posts/${postId}`, {
        method: 'DELETE',
    });
    await loadPosts();
}

async function votePost(postId, value) {
    const profile = await getProfileFromServer();
    if (!profile) {
        throw new Error('Сначала установите ник');
    }
    
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    // Проверяем, голосовал ли уже
    const existingVoteIndex = post.votes?.findIndex(v => v.profileId === profileId) ?? -1;
    
    if (existingVoteIndex >= 0) {
        const existingVote = post.votes[existingVoteIndex];
        if (existingVote.value === value) {
            // Отмена голоса
            post.votes.splice(existingVoteIndex, 1);
            if (value === 1) post.likes--;
            else post.dislikes--;
        } else {
            // Меняем голос
            if (existingVote.value === 1) post.likes--;
            else post.dislikes--;
            if (value === 1) post.likes++;
            else post.dislikes++;
            existingVote.value = value;
        }
    } else {
        // Новый голос
        if (!post.votes) post.votes = [];
        post.votes.push({ profileId, value });
        if (value === 1) post.likes++;
        else post.dislikes++;
    }
    
    // Сохраняем на сервере
    await pbApi(`/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            likes: post.likes,
            dislikes: post.dislikes,
            votes: post.votes,
        }),
    });
    
    await loadPosts();
}

async function addCommentToPost(postId, text) {
    const profile = await getProfileFromServer();
    if (!profile) {
        throw new Error('Сначала установите ник');
    }
    
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    
    if (!post.comments) post.comments = [];
    post.comments.push({
        id: generateId(),
        authorId: profile.id,
        author: profile.nickname,
        avatarData: profile.avatarData || DEFAULT_AVATAR,
        text: text,
        createdAt: new Date().toISOString(),
    });
    
    await pbApi(`/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            comments: post.comments,
        }),
    });
    
    await loadPosts();
}

// --- UI ФУНКЦИИ ---

function updateProfileUI() {
    const nickname = document.activeElement === nicknameInput
        ? nicknameInput.value.trim()
        : (currentProfile?.nickname || localStorage.getItem('social_pending_nickname') || '');
    
    if (document.activeElement !== nicknameInput) {
        nicknameInput.value = nickname;
    }
    profileNicknameEl.textContent = nickname || 'Без имени';
    
    const avatarData = currentProfile?.avatarData || DEFAULT_AVATAR;
    profileAvatarEl.src = avatarData;
    profileBigAvatarEl.src = avatarData;
}

function renderAllPosts() {
    const sorted = [...allPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Лента
    postsListFeedEl.innerHTML = sorted.length
        ? sorted.map(p => renderPostCard(p)).join('')
        : '<div class="empty-posts">Пока нет постов. Создайте первый!</div>';
    
    // Мои посты
    const myPosts = sorted.filter(p => p.authorId === currentProfile?.id);
    postsListProfileEl.innerHTML = myPosts.length
        ? myPosts.map(p => renderPostCard(p)).join('')
        : '<div class="empty-posts">У вас пока нет постов</div>';
}

function renderPostCard(post) {
    const isMine = post.authorId === currentProfile?.id;
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
    const viewerVote = post.votes?.find(v => v.profileId === profileId)?.value || 0;
    
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
    // Простая эмуляция уведомлений
    const count = 0;
    notifCountEl.textContent = String(count);
    notifCountEl.classList.toggle('visible', count > 0);
}

function renderNotifications() {
    notificationPanelEl.innerHTML = '<div class="notif-item">Нет уведомлений</div>';
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
    profileSaveTimer = window.setTimeout(async () => {
        try {
            await saveProfileToServer(nickname);
        } catch (error) {
            nicknameInput.classList.add('error');
            nickErrorMsg.textContent = `❌ ${error.message}`;
            nickErrorMsg.classList.add('visible');
        }
    }, 450);
});

nicknameInput.addEventListener('blur', async () => {
    window.clearTimeout(profileSaveTimer);
    const nickname = nicknameInput.value.trim();
    if (nickname) {
        try {
            await saveProfileToServer(nickname);
        } catch (error) {
            showToast(error.message, true);
        }
    }
});

// Аватар
profileAvatarEl.addEventListener('click', () => avatarUploadEl.click());

avatarUploadEl.addEventListener('change', async (event) => {
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
    
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                await saveProfileToServer(currentProfile.nickname, e.target.result);
                showToast('Аватар обновлён');
            } catch (error) {
                showToast(error.message, true);
            }
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
    if (!currentProfile?.nickname) {
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
        
        await createPostOnServer(text, mediaData);
        
        // Очищаем форму
        postTextEl.value = '';
        pendingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        pendingMedia = [];
        renderMediaPreview();
        updateUploadStatus();
        
        setActiveTab('tabFeed', 'feedSection');
        showToast('Пост опубликован!');
        
    } catch (error) {
        showToast(error.message, true);
    } finally {
        publishBtnEl.disabled = false;
        publishBtnEl.textContent = 'Опубликовать';
    }
});

// --- ОБРАБОТЧИКИ КЛИКОВ (ГОЛОСА, КОММЕНТАРИИ, УДАЛЕНИЕ) ---

document.addEventListener('click', async (event) => {
    // Голоса
    const voteButton = event.target.closest('[data-vote]');
    if (voteButton) {
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = voteButton.dataset.postid;
        const value = Number(voteButton.dataset.vote);
        voteButton.disabled = true;
        try {
            await votePost(postId, value);
        } catch (error) {
            showToast(error.message, true);
        } finally {
            voteButton.disabled = false;
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
        if (!currentProfile?.nickname) {
            return showToast('Сначала установите ник!', true);
        }
        const postId = commentButton.dataset.addComment;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input?.value.trim();
        if (!text) return;
        commentButton.disabled = true;
        try {
            await addCommentToPost(postId, text);
            openComments.add(postId);
            input.value = '';
        } catch (error) {
            showToast(error.message, true);
        } finally {
            commentButton.disabled = false;
        }
        return;
    }
    
    // Удаление поста
    const deleteButton = event.target.closest('[data-delete-post]');
    if (deleteButton) {
        if (!confirm('Удалить этот пост?')) return;
        const postId = deleteButton.dataset.deletePost;
        deleteButton.disabled = true;
        try {
            await deletePostFromServer(postId);
            showToast('Пост удалён');
        } catch (error) {
            showToast(error.message, true);
        } finally {
            deleteButton.disabled = false;
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
        updateNotifCount();
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

// --- ИНИЦИАЛИЗАЦИЯ ---

async function init() {
    try {
        // Загружаем профиль
        await getProfileFromServer();
        
        const pendingNickname = localStorage.getItem('social_pending_nickname');
        if (pendingNickname && !currentProfile) {
            // Создаём профиль, если его нет
            try {
                await saveProfileToServer(pendingNickname);
            } catch (error) {
                showToast('Ошибка создания профиля: ' + error.message, true);
            }
        }
        
        if (currentProfile?.nickname) {
            nicknameInput.value = currentProfile.nickname;
        } else if (pendingNickname) {
            nicknameInput.value = pendingNickname;
        }
        
        updateProfileUI();
        
        // Загружаем посты
        await loadPosts();
        updateNotifCount();
        
        // Периодическое обновление
        setInterval(async () => {
            try {
                await loadPosts();
            } catch {}
        }, 15000);
        
        console.log('✅ Социальная сеть запущена! Сервер: ' + API_URL);
        console.log('👤 Ваш ID: ' + profileId);
        
    } catch (error) {
        showToast('Ошибка инициализации: ' + error.message, true);
    }
}

// Запускаем
init();
