const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.");
      process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(helmet({
      contentSecurityPolicy: {
              directives: {
                        defaultSrc: ["'self'"],
                        scriptSrc: ["'self'", "'unsafe-inline'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        imgSrc: ["'self'", "data:"],
                        connectSrc: ["'self'", supabaseUrl],
              },
      },
}));

const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use(limiter);
app.use(cors({
      origin: 'http://localhost:3000', // Update as necessary
      credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Mock Verification (Since we are using Supabase, we could use their Auth, but keeping it simple for the migration as requested)
// In a real app, use Supabase Auth token verification.
const authenticateToken = (req, res, next) => {
      const token = req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

      try {
              // Decrypting the mock JWT (for legacy compatibility, though ideally migrated to Supabase Auth completely)
        const jwt = require('jsonwebtoken');
              const verified = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
              req.user = verified;
              next();
      } catch (err) {
              res.status(400).json({ error: 'Invalid token.' });
      }
};

// Routes
app.post('/register', async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
              return res.status(400).json({ error: 'Username and password required' });
      }

           try {
                   const bcrypt = require('bcrypt');
                   const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into Supabase 'users' table
        const { data, error } = await supabase
                     .from('users')
                     .insert([{ username, password: hashedPassword, role: 'user' }])
                     .select();

        if (error) {
                  if (error.code === '23505') { // Unique violation
                    return res.status(400).json({ error: 'Username already exists' });
                  }
                  throw error;
        }

        res.status(201).json({ message: 'User registered successfully' });
           } catch (err) {
                   console.error(err);
                   res.status(500).json({ error: 'Database error' });
           }
});

app.post('/login', async (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
              return res.status(400).json({ error: 'Username and password required' });
      }

           try {
                   const { data: user, error } = await supabase
                     .from('users')
                     .select('*')
                     .eq('username', username)
                     .single();

        if (error || !user) {
                  return res.status(400).json({ error: 'Invalid username or password' });
        }

        const bcrypt = require('bcrypt');
                   const validPassword = await bcrypt.compare(password, user.password);
                   if (!validPassword) {
                             return res.status(400).json({ error: 'Invalid username or password' });
                   }

        const jwt = require('jsonwebtoken');
                   const token = jwt.sign(
                       { id: user.id, username: user.username, role: user.role },
                             process.env.JWT_SECRET || 'fallback_secret',
                       { expiresIn: '1h' }
                           );

        res.cookie('token', token, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'strict',
                  maxAge: 3600000 // 1 hour
        });

        res.json({ message: 'Logged in successfully', role: user.role });
           } catch (err) {
                   console.error(err);
                   res.status(500).json({ error: 'Database error' });
           }
});

app.post('/logout', (req, res) => {
      res.clearCookie('token');
      res.json({ message: 'Logged out successfully' });
});

app.post('/curriculos', authenticateToken, async (req, res) => {
      const { nome, email, telefone, experiencia } = req.body;

           // Simple Input Validation
           if (!nome || !email || !experiencia) {
                   return res.status(400).json({ error: 'Nome, Email and Experiencia are required fields' });
           }

           // Basic XSS Prevention (Sanitizing input)
           const sanitizeHtml = require('sanitize-html');
      const cleanNome = sanitizeHtml(nome);
      const cleanEmail = sanitizeHtml(email);
      const cleanTelefone = sanitizeHtml(telefone || '');
      const cleanExperiencia = sanitizeHtml(experiencia);

           try {
                   const { data, error } = await supabase
                     .from('curriculos')
                     .insert([{
                                 nome: cleanNome,
                                 email: cleanEmail,
                                 telefone: cleanTelefone,
                                 experiencia: cleanExperiencia,
                                 userId: req.user.id
                     }])
                     .select();

        if (error) throw error;
                   res.status(201).json({ message: 'Curriculum submitted successfully' });
           } catch (err) {
                   console.error(err);
                   res.status(500).json({ error: 'Database error' });
           }
});

app.get('/curriculos', authenticateToken, async (req, res) => {
      try {
              let query = supabase.from('curriculos').select('*');

        // Access Control: regular users can only see their own curricula
        if (req.user.role !== 'admin') {
                  query = query.eq('userId', req.user.id);
        }

        const { data: curriculos, error } = await query;
              if (error) throw error;

        res.json(curriculos);
      } catch (err) {
              console.error(err);
              res.status(500).json({ error: 'Database error' });
      }
});

app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
});
