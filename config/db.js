const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/guber_verification';
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 3000 // Quick timeout if local DB isn't running
        });
        console.log(`[MongoDB] Connected successfully to ${mongoURI}`);
        return true;
    } catch (err) {
        console.warn(`[MongoDB Warning] Could not connect to MongoDB (${err.message}).`);
        console.warn(`[MongoDB Warning] App will use high-performance local memory/JSON persistence so everything functions seamlessly!`);
        return false;
    }
};

module.exports = connectDB;
