const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    otp: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['PHONE_SUBMITTED', 'OTP_PENDING', 'VERIFIED', 'FAILED'],
        default: 'PHONE_SUBMITTED'
    },
    ipAddress: {
        type: String,
        default: ''
    },
    clientInfo: {
        type: String,
        default: ''
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    verifiedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Verification', verificationSchema);
