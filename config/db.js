const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://guber_admin:GuberSecurePass123%21@cluster0.hqljspd.mongodb.net/guber_verification?retryWrites=true&w=majority';
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log(`[MongoDB Cloud] Connected successfully to Cluster0`);
        return true;
    } catch (err) {
        console.warn(`[MongoDB Warning] Could not connect (${err.message}). Using local store.`);
        return false;
    }
};

module.exports = connectDB;
