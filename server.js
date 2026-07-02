require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
          return res.status(400).json({ error: 'Username and password required' });
    }

           try {
                 const hashedPassword = await bcrypt.hash(password, 10);
                 const userRole = role || 'user';
                 db.run(
                         'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                         [username, hashedPassword, userRole],
                         function (err) {
                                   if (err) {
                                               return res.status(400).json({ error: 'Username already exists' });
                                   }
                                   res.status(201).json({ id: this.lastID, username, role: userRole });
                         }
                       );
           } catch (error) {
                 res.status(500).json({ error: 'Internal server error' });
           }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
          if (err || !user) {
                  return res.status(401).json({ error: 'Invalid credentials' });
          }

               const match = await bcrypt.compare(password, user.password);
          if (!match) {
                  return res.status(401).json({ error: 'Invalid credentials' });
          }

               const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
          res.json({ token });
    });
});

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) return res.status(403).json({ error: 'Invalid token' });
          req.user = decoded;
          next();
    });
};

const authorize = (roles) => {
    return (req, res, next) => {
          if (!roles.includes(req.user.role)) {
                  return res.status(403).json({ error: 'Unauthorized' });
          }
          next();
    };
};

app.post('/candidates', authenticate, authorize(['admin']), (req, res) => {
    const { name, email, phone, education, experience } = req.body;
    db.run(
          'INSERT INTO candidates (name, email, phone, education, experience) VALUES (?, ?, ?, ?, ?)',
          [name, email, phone, education, experience],
          function (err) {
                  if (err) {
                            return res.status(500).json({ error: err.message });
                  }
                  res.status(201).json({ id: this.lastID, name, email });
          }
        );
});

app.get('/candidates', authenticate, authorize(['admin', 'user']), (req, res) => {
    db.all('SELECT * FROM candidates', [], (err, rows) => {
          if (err) {
                  return res.status(500).json({ error: err.message });
          }
          res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
