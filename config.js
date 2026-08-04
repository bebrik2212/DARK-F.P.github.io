// ============================================================
// BREWPAGE КОНФИГУРАЦИЯ
// ============================================================

// BrewPage работает через простые POST/GET запросы
// Данные хранятся по адресу: https://brewpage.app/api/json

// УНИКАЛЬНОЕ ИМЯ ДЛЯ ВАШЕГО ХРАНИЛИЩА
// Можете придумать любое, например: dark-fort-2024
const NAMESPACE = 'dark-fort-2024';

// ID документа (одна база данных для всех данных)
const DOC_ID = 'social-data';

// Полный URL для доступа к данным
const DATA_URL = `https://brewpage.app/api/json/${NAMESPACE}/${DOC_ID}`;

// URL для создания документа (если его ещё нет)
const CREATE_URL = 'https://brewpage.app/api/json';

// Заголовки для запросов
function getHeaders(ownerToken) {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'DarkFort/1.0'
    };
    
    // Если есть токен владельца, добавляем его для записи
    if (ownerToken) {
        headers['X-Owner-Token'] = ownerToken;
    }
    
    return headers;
}

// Экспортируем для использования в других файлах
// (если используете модули, раскомментируйте)
// export { NAMESPACE, DOC_ID, DATA_URL, CREATE_URL, getHeaders };
