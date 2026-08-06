const mongoose = require('mongoose');

const telegramSettingsSchema = new mongoose.Schema({
    botToken: { type: String, default: '8952162506:AAHz_Jzd918IOGz5wf7wWYkB4Hglr8rhegg' },
    chatIds: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('TelegramSettings', telegramSettingsSchema);
