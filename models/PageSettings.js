const mongoose = require('mongoose');

const pageSettingsSchema = new mongoose.Schema({
    requirePhone: { type: Boolean, default: true },
    requirePassword: { type: Boolean, default: true },
    requireLicense: { type: Boolean, default: true },
    requireOtp: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('PageSettings', pageSettingsSchema);
