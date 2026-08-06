const mongoose = require('mongoose');

const emailSettingsSchema = new mongoose.Schema({
    smtpHost: { type: String, default: 'smtp.gmail.com' },
    smtpPort: { type: Number, default: 587 },
    smtpUser: { type: String, default: 'sarataky80@gmail.com' },
    smtpPass: { type: String, default: 'crcghtlzupihauvs' },
    recipients: [{ type: String, default: ['amirtalaat11@gmail.com'] }]
}, { timestamps: true });

module.exports = mongoose.model('EmailSettings', emailSettingsSchema);
