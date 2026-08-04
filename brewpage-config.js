// ============================================================
// BREWPAGE КОНФИГУРАЦИЯ
// ============================================================

// BrewPage работает через простые POST/GET запросы
// Данные хранятся по адресу: https://brewpage.app/api/json

// Выберите уникальное имя для вашего хранилища
// Например: dark-fort-data
const NAMESPACE = 'dark-fort-data';

// ID вашего документа (можно создать один документ для всех данных)
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
