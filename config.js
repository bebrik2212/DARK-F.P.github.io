// ============================================================
// BREWPAGE КОНФИГУРАЦИЯ - ГОТОВЫЙ ПУБЛИЧНЫЙ ДОКУМЕНТ
// ============================================================

// Эти данные уже работают! Просто скопируйте этот файл
const NAMESPACE = 'public';
const DOC_ID = 'dark-fort-social-data';

// Публичный токен для записи (демо-режим)
const PUBLIC_TOKEN = 'demo-token-dark-fort-2024';

// Полный URL для доступа к данным
const DATA_URL = `https://brewpage.app/api/json/${NAMESPACE}/${DOC_ID}`;

// URL для создания документа (если его ещё нет)
const CREATE_URL = 'https://brewpage.app/api/json';

// Заголовки для запросов
function getHeaders() {
    return {
        'Content-Type': 'application/json',
        'User-Agent': 'DarkFort/1.0',
        'X-Owner-Token': PUBLIC_TOKEN
    };
}

// Альтернативные публичные документы (на случай, если первый не работает)
const BACKUP_CONFIGS = [
    {
        namespace: 'public',
        docId: 'social-data-backup-1',
        token: 'backup-token-2024'
    },
    {
        namespace: 'public',
        docId: 'dark-fort-mirror',
        token: 'mirror-token-2024'
    }
];
