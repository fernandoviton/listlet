// Shared utility functions

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Generate a random list ID
 * @param {number} length - Length of ID (default 8)
 * @returns {string} - Random alphanumeric ID
 */
function generateListId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Get list name from URL query param, fallback to config default
 * @returns {string} - The list name to use
 */
function getListName() {
    const params = new URLSearchParams(window.location.search);
    const list = params.get('list');
    return (list && list.trim()) || CONFIG.DEFAULT_LIST_NAME;
}

/**
 * Check if a list name was explicitly provided in URL
 * @returns {boolean} - True if list param exists and is non-empty
 */
function hasExplicitListName() {
    const params = new URLSearchParams(window.location.search);
    const list = params.get('list');
    return !!(list && list.trim());
}
