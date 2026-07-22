const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      tls: true,
      tlsAllowInvalidCertificates: process.env.NODE_ENV !== 'production',
      retryWrites: true,
      w: 'majority',
    });
    logger.info('mongodb connected', { host: conn.connection.host });
  } catch (error) {
    logger.error('mongodb connection failed', { message: error.message });
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('mongodb disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('mongodb error', { message: err.message });
});

module.exports = connectDB;
