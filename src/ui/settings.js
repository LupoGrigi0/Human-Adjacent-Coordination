/**
 * Settings Module
 *
 * Handles user preferences, theme, and configuration.
 *
 * @module settings
 */

import { state, CONFIG } from './state.js';
import { showToast } from './utils.js';

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Initialize theme from localStorage
 */
export function initTheme() {
    const savedTheme = localStorage.getItem('v2_theme') || 'dark';
    setTheme(savedTheme);
}

/**
 * Set theme
 * @param {string} theme - 'light' | 'dark'
 */
export function setTheme(theme) {
    state.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('v2_theme', theme);

    // Update theme toggle button
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.textContent = theme === 'dark' ? '\u2600' : '\u263D'; // sun/moon
    }
}

/**
 * Toggle between light and dark themes
 */
export function toggleTheme() {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// ============================================================================
// SETTINGS PANEL
// ============================================================================

/**
 * Load settings panel
 */
export function loadSettings() {
    const container = document.getElementById('settings-container');
    if (!container) return;

    container.innerHTML = `
        <div class="settings-section">
            <h3>Appearance</h3>
            <div class="setting-item">
                <label>Theme</label>
                <select id="setting-theme">
                    <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Dark</option>
                    <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Light</option>
                </select>
            </div>
        </div>

        <div class="settings-section">
            <h3>Identity</h3>
            <div class="setting-item">
                <label>Instance ID</label>
                <span class="setting-value">${state.instanceId || 'Not bootstrapped'}</span>
            </div>
            <div class="setting-item">
                <label>Name</label>
                <span class="setting-value">${state.name || CONFIG.defaultName}</span>
            </div>
            <div class="setting-item">
                <label>Role</label>
                <span class="setting-value">${state.role || CONFIG.defaultRole}</span>
            </div>
        </div>

        <div class="settings-section">
            <h3>Connection</h3>
            <div class="setting-item">
                <label>Status</label>
                <span class="setting-value ${state.connected ? 'connected' : 'disconnected'}">
                    ${state.connected ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <div class="setting-item">
                <label>Last Update</label>
                <span class="setting-value">${state.lastUpdate ? new Date(state.lastUpdate).toLocaleString() : 'Never'}</span>
            </div>
        </div>
    `;

    // Theme select handler
    const themeSelect = document.getElementById('setting-theme');
    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            setTheme(themeSelect.value);
        });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make toggle available globally
window.toggleTheme = toggleTheme;

export default {
    initTheme,
    setTheme,
    toggleTheme,
    loadSettings
};
