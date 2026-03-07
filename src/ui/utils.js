/**
 * Shared Utility Functions
 *
 * Common utilities used across all UI modules.
 *
 * @module utils
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML-safe string
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {'info'|'success'|'error'|'warning'} type - Toast type
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('[Utils] Toast container not found');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
}

/**
 * Format a date/time for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date/time string
 */
export function formatDateTime(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString();
}

/**
 * Format a time for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted time string
 */
export function formatTime(date) {
    if (!date) return '-';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format relative time (e.g., "5 minutes ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
    if (!date) return '-';

    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDate(date);
}

/**
 * Direct RPC call for APIs that don't go through the api.js wrapper
 * @param {string} method - API method name
 * @param {object} args - API arguments
 * @returns {Promise<any>} API response data
 */
export async function rpcCallDirect(method, args) {
    const url = 'https://smoothcurves.nexus/mcp';
    const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
            name: method,
            arguments: args
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const json = await response.json();
    if (json.error) throw new Error(json.error.message || json.error.data);
    return json.result?.data || json.result;
}

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Get avatar character from name
 * @param {string} name - Name to get avatar from
 * @returns {string} Single uppercase character
 */
export function getAvatarChar(name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
}

/**
 * Get status class for CSS
 * @param {string} status - Status string
 * @returns {string} CSS class name
 */
export function getStatusClass(status) {
    return `status-${(status || 'unknown').toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Get priority class for CSS
 * @param {string} priority - Priority string
 * @returns {string} CSS class name
 */
export function getPriorityClass(priority) {
    return `priority-${(priority || 'medium').toLowerCase()}`;
}

export default {
    escapeHtml,
    showToast,
    formatDate,
    formatDateTime,
    formatTime,
    formatRelativeTime,
    rpcCallDirect,
    debounce,
    getAvatarChar,
    getStatusClass,
    getPriorityClass
};
