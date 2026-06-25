const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON and urlencoded data (increased size limit for base64 image uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session configuration
app.use(session({
  secret: 'liz-crochets-crafts-secret-key-13579',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if running on HTTPS
    maxAge: 1000 * 60 * 60 * 2 // 2 hours session life
  }
}));

// Paths
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const productsFile = path.join(dataDir, 'products.json');
const configFile = path.join(dataDir, 'config.json');
const imagesDir = path.join(__dirname, 'images');

// Helper function to read JSON files safely
function readJSON(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading file ${file}:`, err);
  }
  return fallback;
}

// Helper function to write JSON files safely
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing file ${file}:`, err);
    return false;
  }
}

// Authentication middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
}

// Protect admin.html access
app.get('/admin.html', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.sendFile(path.join(__dirname, 'admin.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Redirect simple /admin path to /admin.html
app.get('/admin', (req, res) => {
  res.redirect('/admin.html');
});

// --- API ROUTES ---

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const userData = readJSON(usersFile, null);
  if (!userData) {
    return res.status(500).json({ error: 'Admin credentials not configured. Please run setup-admin.js first.' });
  }

  if (username !== userData.username) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  bcrypt.compare(password, userData.passwordHash, (err, isMatch) => {
    if (err) {
      return res.status(500).json({ error: 'Error validating credentials.' });
    }
    if (isMatch) {
      req.session.isAdmin = true;
      res.json({ success: true, message: 'Logged in successfully.' });
    } else {
      res.status(401).json({ error: 'Invalid username or password.' });
    }
  });
});

// Logout API
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// Auth Status API
app.get('/api/status', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ loggedIn: true });
  } else {
    res.json({ loggedIn: false });
  }
});

// Get Configuration API
app.get('/api/config', (req, res) => {
  const config = readJSON(configFile, {});
  res.json(config);
});

// Update Configuration API (Protected)
app.post('/api/config', requireLogin, (req, res) => {
  const newConfig = req.body;
  if (writeJSON(configFile, newConfig)) {
    res.json({ success: true, message: 'Configuration updated successfully.', config: newConfig });
  } else {
    res.status(500).json({ error: 'Failed to write configuration.' });
  }
});

// Get Products API
app.get('/api/products', (req, res) => {
  const products = readJSON(productsFile, []);
  res.json(products);
});

// Add Product API (Protected)
app.post('/api/products', requireLogin, (req, res) => {
  const { title, tag, alt, imageBase64, imageName, gridClass, price } = req.body;

  if (!title || !tag) {
    return res.status(400).json({ error: 'Title and category tag are required.' });
  }

  let imgSrc = 'images/img1.jpg'; // default placeholder if no image provided

  // If a base64 image string is provided, save it to the images folder
  if (imageBase64 && imageName) {
    try {
      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir);
      }

      // Generate a unique filename to prevent overwriting
      const timestamp = Date.now();
      const extension = path.extname(imageName) || '.jpg';
      const cleanName = path.basename(imageName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const uniqueFilename = `${cleanName}_${timestamp}${extension}`;
      const imgPath = path.join(imagesDir, uniqueFilename);

      // Extract the raw base64 data and write the file
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(imgPath, buffer);

      imgSrc = `images/${uniqueFilename}`;
    } catch (err) {
      console.error('Error saving uploaded image:', err);
      return res.status(500).json({ error: 'Failed to save uploaded image.' });
    }
  }

  const products = readJSON(productsFile, []);
  
  // Auto-increment ID
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  
  // Determine grid placement automatically (sequential cycling through g1 to g4 if not specified)
  const defaultGridClass = `g${((products.length) % 4) + 1}`;

  const newProduct = {
    id: newId,
    title: title,
    imgSrc: imgSrc,
    alt: alt || title,
    tag: tag,
    gridClass: gridClass || defaultGridClass,
    price: price || '0'
  };

  products.push(newProduct);

  if (writeJSON(productsFile, products)) {
    res.json({ success: true, message: 'Product added successfully.', product: newProduct, products });
  } else {
    res.status(500).json({ error: 'Failed to save product list.' });
  }
});

// Edit Product API (Protected)
app.post('/api/products/edit', requireLogin, (req, res) => {
  const { id, title, tag, alt, imageBase64, imageName, gridClass, imgSrc: existingImgSrc, price } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  const products = readJSON(productsFile, []);
  const index = products.findIndex(p => p.id === parseInt(id));

  if (index === -1) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  let imgSrc = existingImgSrc || products[index].imgSrc;

  // Handle new image upload if present
  if (imageBase64 && imageName) {
    try {
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir);
      }

      const timestamp = Date.now();
      const extension = path.extname(imageName) || '.jpg';
      const cleanName = path.basename(imageName, extension).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const uniqueFilename = `${cleanName}_${timestamp}${extension}`;
      const imgPath = path.join(imagesDir, uniqueFilename);

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(imgPath, buffer);

      imgSrc = `images/${uniqueFilename}`;
    } catch (err) {
      console.error('Error saving updated image:', err);
      return res.status(500).json({ error: 'Failed to save updated image.' });
    }
  }

  products[index] = {
    id: parseInt(id),
    title: title || products[index].title,
    imgSrc: imgSrc,
    alt: alt || title,
    tag: tag || products[index].tag,
    gridClass: gridClass || products[index].gridClass,
    price: price !== undefined ? price : (products[index].price || '0')
  };

  if (writeJSON(productsFile, products)) {
    res.json({ success: true, message: 'Product updated successfully.', product: products[index], products });
  } else {
    res.status(500).json({ error: 'Failed to save updated product list.' });
  }
});

// Delete Product API (Protected)
app.post('/api/products/delete', requireLogin, (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  let products = readJSON(productsFile, []);
  const initialLength = products.length;
  products = products.filter(p => p.id !== parseInt(id));

  if (products.length === initialLength) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  // Optional: We could delete the image file from /images/ if it's not a default image

  if (writeJSON(productsFile, products)) {
    res.json({ success: true, message: 'Product deleted successfully.', products });
  } else {
    res.status(500).json({ error: 'Failed to write updated product database.' });
  }
});

// Serve other static assets
app.use(express.static(__dirname));

// Fallback to index.html for unknown routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n\x1b[36m====================================================\x1b[0m`);
  console.log(`\x1b[32m  Liz Crochets & Crafts Server is Running!\x1b[0m`);
  console.log(`\x1b[35m  URL:\x1b[0m \x1b[4mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[35m  Admin Panel:\x1b[0m \x1b[4mhttp://localhost:${PORT}/admin\x1b[0m`);
  console.log(`\x1b[36m====================================================\n\x1b[0m`);
});
