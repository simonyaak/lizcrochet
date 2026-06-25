const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const args = process.argv.slice(2);
const username = args[0] || 'admin';
const password = args[1] || 'admin123';

console.log(`Setting up credentials for user: "${username}"`);

// Hash password with bcryptjs
const saltRounds = 10;
bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    process.exit(1);
  }

  const userData = {
    username: username,
    passwordHash: hash
  };

  try {
    fs.writeFileSync(usersFile, JSON.stringify(userData, null, 2), 'utf8');
    console.log('\x1b[32m%s\x1b[0m', 'Successfully configured admin credentials!');
    console.log(`Saved to: ${usersFile}`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password} (stored securely as a hash)`);
  } catch (writeErr) {
    console.error('Error writing users.json file:', writeErr);
    process.exit(1);
  }
});
