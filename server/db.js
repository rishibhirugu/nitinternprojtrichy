const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/snack_factory?replicaSet=rs0';
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;