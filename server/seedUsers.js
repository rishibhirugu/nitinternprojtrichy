require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./db');
const { User } = require('./models/User');

const USERS = [
  { username: 'admin',      name: 'Owner Admin',      role: 'ADMIN',      password: 'password123' },
  { username: 'salesman1',  name: 'Salesman One',     role: 'SALESMAN',   password: 'password123' },
  { username: 'salesman2',  name: 'Salesman Two',     role: 'SALESMAN',   password: 'password123' },
  { username: 'production', name: 'Production Lead',  role: 'PRODUCTION', password: 'password123' },
  { username: 'accountant', name: 'Accounts Officer', role: 'ACCOUNTANT', password: 'password123' },
  { username: 'store',      name: 'Store Keeper',     role: 'STORE',      password: 'password123' }
];

async function run() {
  await connectDB();
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await User.findOneAndUpdate(
      { username: u.username },
      { username: u.username, name: u.name, role: u.role, passwordHash },
      { upsert: true, new: true }
    );
  }
  console.log(`Seeded ${USERS.length} users across 5 roles.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
