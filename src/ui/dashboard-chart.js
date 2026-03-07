/**
 * Dashboard Activity Chart — OpenRouter token usage
 *
 * Canvas-based stacked bar chart. Fetches from OpenRouter API.
 * No external dependencies.
 *
 * @module dashboard-chart
 * @author Ember-75b6
 */

// Model color palette
const MODEL_COLORS = {
    'claude-opus':   '#a78bfa',
    'claude-sonnet': '#60a5fa',
    'claude-haiku':  '#93c5fd',
    'grok':          '#fb923c',
    'gpt':           '#4ade80',
    'gemini':        '#fbbf24',
    'other':         '#94a3b8'
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function loadChart(container, apiKey) {
    if (!container) return;

    if (!apiKey) {
        container.innerHTML = `<div class="activity-chart">
            <div class="chart-header">
                <span class="chart-title">Token Activity</span>
            </div>
            <div class="chart-placeholder">Set OpenRouter key in Dashboard Settings</div>
        </div>`;
        return;
    }

    container.innerHTML = `<div class="activity-chart">
        <div class="chart-header">
            <span class="chart-title">Token Activity</span>
            <div class="chart-zoom">
                <button id="chart-refresh" title="Refresh" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:14px;padding:2px 4px;">&#8635;</button>
                <span id="chart-range-label">14d</span>
                <input type="range" id="chart-range" min="0" max="2" value="1" />
            </div>
        </div>
        <div class="chart-canvas-wrap">
            <canvas id="dash-chart-canvas"></canvas>
        </div>
        <div class="chart-legend" id="chart-legend"></div>
    </div>`;

    try {
        const data = await fetchActivity(apiKey);
        if (!data || data.length === 0) {
            container.querySelector('.chart-canvas-wrap').innerHTML = '<div class="chart-placeholder">No activity data</div>';
            return;
        }

        const aggregated = aggregateByDay(data);
        let currentRange = 14;

        function render() {
            const canvas = document.getElementById('dash-chart-canvas');
            if (!canvas) return;
            renderCanvas(canvas, aggregated, currentRange);
            renderLegend(document.getElementById('chart-legend'), aggregated);
        }

        render();

        // Zoom slider
        const rangeSlider = document.getElementById('chart-range');
        const rangeLabel = document.getElementById('chart-range-label');
        const ranges = [7, 14, 30];

        rangeSlider?.addEventListener('input', () => {
            const idx = parseInt(rangeSlider.value);
            currentRange = ranges[idx];
            if (rangeLabel) rangeLabel.textContent = currentRange + 'd';
            render();
        });

        // Refresh button
        document.getElementById('chart-refresh')?.addEventListener('click', async () => {
            try {
                const fresh = await fetchActivity(apiKey);
                if (fresh && fresh.length > 0) {
                    const newAgg = aggregateByDay(fresh);
                    Object.assign(aggregated, newAgg);
                    render();
                }
            } catch (e) {
                console.error('[Chart] Refresh failed:', e);
            }
        });
    } catch (error) {
        console.error('[Chart] Error:', error);
        container.querySelector('.chart-canvas-wrap').innerHTML = '<div class="chart-placeholder">Could not load activity</div>';
    }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchActivity(apiKey) {
    const resp = await fetch('https://openrouter.ai/api/v1/activity', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!resp.ok) throw new Error(`OpenRouter API ${resp.status}`);
    const json = await resp.json();
    return json.data || json;
}

// ============================================================================
// DATA AGGREGATION
// ============================================================================

function aggregateByDay(data) {
    const days = {};
    const modelSet = new Set();

    (Array.isArray(data) ? data : []).forEach(row => {
        const date = (row.created_at || row.date || '').slice(0, 10);
        if (!date) return;

        const model = categorizeModel(row.model || row.model_id || '');
        modelSet.add(model);

        if (!days[date]) days[date] = {};
        if (!days[date][model]) days[date][model] = 0;
        days[date][model] += (row.prompt_tokens || 0) + (row.completion_tokens || 0) + (row.total_tokens || 0);
    });

    const sortedDates = Object.keys(days).sort();
    const models = Array.from(modelSet).sort();

    return { days, sortedDates, models };
}

function categorizeModel(model) {
    const m = model.toLowerCase();
    if (m.includes('opus')) return 'claude-opus';
    if (m.includes('sonnet')) return 'claude-sonnet';
    if (m.includes('haiku')) return 'claude-haiku';
    if (m.includes('grok')) return 'grok';
    if (m.includes('gpt')) return 'gpt';
    if (m.includes('gemini')) return 'gemini';
    return 'other';
}

// ============================================================================
// CANVAS RENDERING
// ============================================================================

function renderCanvas(canvas, { days, sortedDates, models }, range) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 4, bottom: 18, left: 4, right: 4 };

    // Filter to range
    const visibleDates = sortedDates.slice(-range);
    if (visibleDates.length === 0) return;

    // Find max total for scaling
    let maxTotal = 0;
    visibleDates.forEach(date => {
        const dayData = days[date] || {};
        const total = Object.values(dayData).reduce((s, v) => s + v, 0);
        if (total > maxTotal) maxTotal = total;
    });
    if (maxTotal === 0) maxTotal = 1;

    const barAreaWidth = w - padding.left - padding.right;
    const barWidth = Math.max(2, Math.floor(barAreaWidth / visibleDates.length) - 2);
    const barGap = Math.max(1, Math.floor((barAreaWidth - barWidth * visibleDates.length) / Math.max(1, visibleDates.length - 1)));

    ctx.clearRect(0, 0, w, h);

    visibleDates.forEach((date, i) => {
        const x = padding.left + i * (barWidth + barGap);
        const dayData = days[date] || {};
        let y = h - padding.bottom;

        models.forEach(model => {
            const tokens = dayData[model] || 0;
            if (tokens === 0) return;
            const barH = (tokens / maxTotal) * (h - padding.top - padding.bottom);
            const color = MODEL_COLORS[model] || MODEL_COLORS.other;

            ctx.fillStyle = color;
            ctx.fillRect(x, y - barH, barWidth, barH);
            y -= barH;
        });

        // Date label (show every Nth)
        const showLabel = visibleDates.length <= 14 || i % Math.ceil(visibleDates.length / 10) === 0;
        if (showLabel) {
            ctx.fillStyle = '#64748b';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(date.slice(5), x + barWidth / 2, h - 2);
        }
    });
}

// ============================================================================
// LEGEND
// ============================================================================

function renderLegend(container, { models }) {
    if (!container) return;
    container.innerHTML = models.map(model => {
        const color = MODEL_COLORS[model] || MODEL_COLORS.other;
        const label = model.replace('claude-', 'Claude ').replace('gpt', 'GPT').replace('grok', 'Grok').replace('gemini', 'Gemini').replace('other', 'Other');
        return `<div class="legend-item">
            <span class="legend-dot" style="background:${color}"></span>
            <span>${label}</span>
        </div>`;
    }).join('');
}
