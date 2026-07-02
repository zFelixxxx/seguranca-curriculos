const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Módulo interno de Logging de Segurança
const securityLogPath = path.join(__dirname, 'security.log');

const securityLogger = {
  log(level, message, details = '') {
    const timestamp = new Date().toISOString();
    const cleanDetails = details ? ` | Detalhes: ${JSON.stringify(details)}` : '';
    const logLine = `[${timestamp}] [${level}] ${message}${cleanDetails}\n`;
    fs.appendFile(securityLogPath, logLine, (err) => {
      if (err) {
        console.error('Falha ao escrever no log de segurança:', err.message);
      }
    });
  },
  info(msg, details) { this.log('INFO', msg, details); },
  warn(msg, details) { this.log('WARN', msg, details); },
  error(msg, details) { this.log('ERROR', msg, details); }
};

// Configuração do Supabase carregada de forma segura
let config = {};
try {
  const configFile = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
  config = JSON.parse(configFile);
} catch (err) {
  securityLogger.error('Falha crítica ao ler config.json. O Supabase não pôde ser iniciado.', { error: err.message });
}

const supabase = createClient(
  config.SUPABASE_URL || '',
  config.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      persistSession: false
    }
  }
);

// Validação de conexão inicial
async function verifySupabaseConnection() {
  try {
    const { data, error } = await supabase
      .from('curriculos')
      .select('id')
      .limit(1);
    
    if (error) {
      securityLogger.error('Falha ao conectar com a tabela curriculos no Supabase.', { error: error.message });
    } else {
      securityLogger.info('Conexão estabelecida com Supabase com sucesso.');
    }
  } catch (err) {
    securityLogger.error('Erro inesperado na verificação da conexão Supabase.', { error: err.message });
  }
}
verifySupabaseConnection();

// Configurações do Helmet para Headers HTTP robustos
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], 
        styleSrc: ["'self'", "https://fonts.googleapis.com"], 
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
        connectSrc: ["'self'"],
      },
    },
    xFrameOptions: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginOpenerPolicy: { value: "same-origin" },
    crossOriginEmbedderPolicy: { policy: "require-corp" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    originAgentCluster: true,
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  })
);

// Middleware para cabeçalhos anti-caching adicionais e permissões
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  next();
});

// Middleware para restringir o CORS à mesma origem (Host)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    const hostUrl = req.secure ? `https://${host}` : `http://${host}`;
    if (origin !== hostUrl) {
      securityLogger.warn('Tentativa suspeita de requisição Cross-Origin bloqueada.', {
        origin,
        hostUrl,
        ip: req.ip,
        url: req.originalUrl
      });
      return res.status(403).json({ error: 'Origem não autorizada.' });
    }
  }
  next();
});

// Parsers com limites estritos de tamanho
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Rate Limiter para rotas de API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityLogger.warn('Rate limit excedido por IP.', { ip: req.ip, url: req.originalUrl });
    res.status(429).json({ error: 'Muitas requisições. Por favor, tente novamente mais tarde.' });
  }
});
app.use('/api/', apiLimiter);

// Gerenciamento de Sessão/CSRF Token
const sessions = new Map(); // sessionId -> csrfToken

app.use((req, res, next) => {
  let sessionId = req.cookies['session_id'];
  
  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    
    if (sessions.size > 10000) {
      const oldestSession = sessions.keys().next().value;
      sessions.delete(oldestSession);
    }
    
    sessions.set(sessionId, csrfToken);
    
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: isProduction || req.secure,
      sameSite: 'Strict',
      path: '/'
    });
  }
  
  req.sessionId = sessionId;
  req.csrfToken = sessions.get(sessionId);
  next();
});

// Middleware de verificação de CSRF
function verifyCsrf(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const clientToken = req.headers['x-csrf-token'];
    const serverToken = req.csrfToken;
    
    const referer = req.headers.referer;
    const origin = req.headers.origin;
    if (!origin && !referer) {
      securityLogger.warn('CSRF bloqueado: Sem cabeçalhos de origem.', { ip: req.ip });
      return res.status(403).json({ error: 'Verificação de segurança falhou (origem ausente).' });
    }

    if (!clientToken || clientToken !== serverToken) {
      securityLogger.warn('CSRF bloqueado: Token inválido ou ausente.', {
        ip: req.ip,
        clientToken,
        userAgent: req.headers['user-agent']
      });
      return res.status(403).json({ error: 'Verificação de segurança falhou (CSRF inválido).' });
    }
  }
  next();
}

// Middleware de proteção contra NoSQL / Object Injection e Prototype Pollution
function hasNoSqlOperators(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const key in obj) {
    if (
      key.startsWith('$') || 
      key === 'constructor' || 
      key === '__proto__' || 
      key === 'prototype'
    ) {
      return true;
    }
    if (typeof obj[key] === 'object' && hasNoSqlOperators(obj[key])) {
      return true;
    }
  }
  return false;
}

app.use((req, res, next) => {
  if (hasNoSqlOperators(req.body) || hasNoSqlOperators(req.query) || hasNoSqlOperators(req.params)) {
    securityLogger.warn('Tentativa de injeção de objeto/NoSQL bloqueada.', {
      ip: req.ip,
      body: req.body,
      query: req.query
    });
    return res.status(400).json({ error: 'Requisição inválida ou maliciosa detectada.' });
  }
  next();
});

// Servir frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Escapa HTML na camada de visualização (Defense-in-depth contra XSS)
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bloqueio de elementos HTML e protocolos de injeção em inputs (XSS preemptivo)
function containsHtmlOrInjects(text) {
  if (typeof text !== 'string') return false;
  return /<[^>]*>|javascript:|data:|vbscript:|file:|blob:/i.test(text);
}

// Regex patterns para validação rígida de formato
const NOME_REGEX = /^[a-zA-ZÀ-ÖØ-öø-ÿ\s'.~^-]{2,100}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const PHONE_REGEX = /^(?:\(?[1-9]{2}\)?\s?)?(?:(?:9\d|[2-9])\d{3}\-?\d{4})$/;
const URL_REGEX = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

// API Routes

// Rota para o frontend pegar o token CSRF
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken });
});

// 1. List resumes (Tela 1) - Apenas retorna id, nome e email
app.get('/api/curriculos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('curriculos')
      .select('id, nome, email')
      .order('created_at', { ascending: false });

    if (error) {
      securityLogger.error('Falha de leitura do banco de dados na listagem Supabase.', { error: error.message });
      return res.status(500).json({ error: 'Erro interno de processamento.' });
    }
    
    const safeRows = data.map(row => ({
      id: row.id,
      nome: escapeHtml(row.nome),
      email: escapeHtml(row.email)
    }));
    
    res.json(safeRows);
  } catch (err) {
    securityLogger.error('Exceção ao listar currículos.', { error: err.message });
    res.status(500).json({ error: 'Erro interno de processamento.' });
  }
});

// 2. Fetch specific resume details (Tela 3)
app.get('/api/curriculos/:id', async (req, res) => {
  const id = req.params.id;

  if (!/^\d+$/.test(id)) {
    securityLogger.warn('Tentativa de acesso com ID inválido.', { id, ip: req.ip });
    return res.status(400).json({ error: 'Parâmetro inválido.' });
  }

  try {
    const { data, error } = await supabase
      .from('curriculos')
      .select('id, nome, telefone, email, web_address, experiencia')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      securityLogger.error('Falha ao obter currículo individual no Supabase.', { error: error.message, id });
      return res.status(500).json({ error: 'Erro interno ao consultar dados.' });
    }
    
    if (!data) {
      securityLogger.info('Currículo não encontrado.', { id, ip: req.ip });
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    const safeRow = {
      id: data.id,
      nome: escapeHtml(data.nome),
      telefone: data.telefone ? escapeHtml(data.telefone) : '',
      email: escapeHtml(data.email),
      web_address: data.web_address ? escapeHtml(data.web_address) : '',
      experiencia: escapeHtml(data.experiencia)
    };

    res.json(safeRow);
  } catch (err) {
    securityLogger.error('Exceção ao obter currículo individual.', { error: err.message, id });
    res.status(500).json({ error: 'Erro interno ao consultar dados.' });
  }
});

// 3. Register new resume (Tela 2) - Protegido por CSRF
app.post('/api/curriculos', verifyCsrf, async (req, res) => {
  const { nome, telefone, email, web_address, experiencia } = req.body;

  // Verificação estrita de tipo
  if (
    typeof nome !== 'string' ||
    (telefone !== undefined && telefone !== null && typeof telefone !== 'string') ||
    typeof email !== 'string' ||
    (web_address !== undefined && web_address !== null && typeof web_address !== 'string') ||
    typeof experiencia !== 'string'
  ) {
    securityLogger.warn('Tentativa de postagem com tipos inválidos.', { ip: req.ip });
    return res.status(400).json({ error: 'Dados fornecidos contêm formatos inválidos.' });
  }

  const trimmedNome = nome.trim();
  const trimmedTelefone = telefone ? telefone.trim() : '';
  const trimmedEmail = email.trim();
  const trimmedWeb = web_address ? web_address.trim() : '';
  const trimmedExperiencia = experiencia.trim();

  // Validação preventiva contra injeção de HTML/XSS
  if (
    containsHtmlOrInjects(trimmedNome) ||
    containsHtmlOrInjects(trimmedTelefone) ||
    containsHtmlOrInjects(trimmedEmail) ||
    containsHtmlOrInjects(trimmedWeb) ||
    containsHtmlOrInjects(trimmedExperiencia)
  ) {
    securityLogger.warn('Tentativa de injeção de tags HTML/XSS detectada e bloqueada.', {
      ip: req.ip,
      payload: { trimmedNome, trimmedEmail, trimmedWeb, trimmedTelefone }
    });
    return res.status(400).json({ error: 'Payload contém caracteres ou tags não permitidos.' });
  }

  // Validações de limites e padrões
  if (!NOME_REGEX.test(trimmedNome)) {
    securityLogger.warn('Falha na validação do nome.', { trimmedNome, ip: req.ip });
    return res.status(400).json({ error: 'Nome inválido. Use apenas letras e espaços (2 a 100 caracteres).' });
  }

  if (trimmedEmail.length > 100 || !EMAIL_REGEX.test(trimmedEmail)) {
    securityLogger.warn('Falha na validação do email.', { trimmedEmail, ip: req.ip });
    return res.status(400).json({ error: 'E-mail em formato inválido ou muito longo.' });
  }

  if (trimmedTelefone) {
    if (trimmedTelefone.length > 20 || !PHONE_REGEX.test(trimmedTelefone)) {
      securityLogger.warn('Falha na validação do telefone.', { trimmedTelefone, ip: req.ip });
      return res.status(400).json({ error: 'Telefone inválido. Formato aceito: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX.' });
    }
  }

  if (trimmedWeb) {
    if (trimmedWeb.length > 200 || !URL_REGEX.test(trimmedWeb)) {
      securityLogger.warn('Falha na validação da URL web.', { trimmedWeb, ip: req.ip });
      return res.status(400).json({ error: 'Endereço web inválido. Deve iniciar com http:// ou https://.' });
    }
  }

  if (trimmedExperiencia.length < 5 || trimmedExperiencia.length > 5000) {
    securityLogger.warn('Falha na validação da experiência.', { expLength: trimmedExperiencia.length, ip: req.ip });
    return res.status(400).json({ error: 'Experiência deve conter entre 5 e 5000 caracteres.' });
  }

  try {
    const { data, error } = await supabase
      .from('curriculos')
      .insert([
        {
          nome: trimmedNome,
          telefone: trimmedTelefone || null,
          email: trimmedEmail,
          web_address: trimmedWeb || null,
          experiencia: trimmedExperiencia
        }
      ])
      .select('id')
      .single();

    if (error) {
      securityLogger.error('Erro na inserção do currículo no Supabase.', { error: error.message });
      return res.status(500).json({ error: 'Erro interno ao salvar dados.' });
    }
    
    securityLogger.info('Currículo cadastrado com sucesso no Supabase.', { id: data.id });
    
    res.status(201).json({
      message: 'Currículo cadastrado com sucesso!',
      id: data.id,
      nome: escapeHtml(trimmedNome),
      email: escapeHtml(trimmedEmail)
    });
  } catch (err) {
    securityLogger.error('Exceção ao inserir currículo no Supabase.', { error: err.message });
    res.status(500).json({ error: 'Erro interno ao salvar dados.' });
  }
});

// Placeholder de Upload bloqueado
app.post('/api/upload', (req, res) => {
  securityLogger.warn('Tentativa de upload de arquivos bloqueada. Uploads estão desabilitados.', { ip: req.ip });
  res.status(400).json({ error: 'Função de upload indisponível.' });
});

// Fallback de roteamento SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware Global de Tratamento de Erros
app.use((err, req, res, next) => {
  securityLogger.error('Erro não tratado na aplicação Express.', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    ip: req.ip
  });
  
  res.status(500).json({ error: 'Ocorreu um erro interno de processamento.' });
});

const server = app.listen(PORT, () => {
  securityLogger.info(`Servidor seguro iniciado na porta ${PORT}`);
});

server.on('close', () => {
  securityLogger.info('Servidor encerrado.');
});

module.exports = server;
