/**
 * VocabCloud - 修复版服务器代码
 * 解决了 Railway 环境下 Session 丢失和上传 401 的问题
 */

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 必须：信任 Railway 的代理层，否则 Cookie 无法正常写入浏览器
app.set('trust proxy', 1);

// ─── 目录初始化 ───
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(__dirname, 'vocab.db');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ─── 数据库初始化 ───
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    UNIQUE NOT NULL,
    filename    TEXT    NOT NULL,
    orig_name   TEXT    NOT NULL,
    size        INTEGER NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    UNIQUE NOT NULL,
    name        TEXT    NOT NULL,
    file_id     INTEGER NOT NULL,
    class_name  TEXT,
    start_date  TEXT    NOT NULL,
    end_date    TEXT    NOT NULL,
    password    TEXT,
    visits      INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`);

// ─── Multer 文件上传配置 ───
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const token = crypto.randomBytes(16).toString('hex');
    cb(null, `${token}.html`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.html?$/i)) {
      return cb(new Error('只允许上传 HTML 文件'));
    }
    cb(null, true);
  }
});

// ─── 中间件 ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 核心修复：Session 配置
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'vocab-cloud-secret-key',
  resave: true, 
  saveUninitialized: false,
  rolling: true, 
  cookie: {
    secure: false, // 在 Railway 上设为 false 以确保兼容性
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 登录状态有效期 24 小时
  }
}));

// 静态文件
app.use('/static', express.static(path.join(__dirname, 'public')));

// ─── 鉴权与辅助 ───
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'teacher123';

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ success: false, message: '请先登录' });
}

function getLinkStatus(link) {
  const today = new Date().toISOString().split('T')[0];
  if (today < link.start_date) return 'pending';
  if (today > link.end_date) return 'expired';
  return 'active';
}

// ─── 页面路由 ───
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// 学生页面
app.get('/s/:token', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE token = ?').get(req.params.token);
  if (!link) return res.status(404).sendFile(path.join(__dirname, 'public', 'notfound.html'));
  
  const status = getLinkStatus(link);
  if (status === 'expired') return res.sendFile(path.join(__dirname, 'public', 'expired.html'));
  if (status === 'pending') return res.sendFile(path.join(__dirname, 'public', 'pending.html'));

  if (link.password) {
    const authedLinks = req.session.authedLinks || [];
    if (!authedLinks.includes(link.token)) return res.sendFile(path.join(__dirname, 'public', 'auth.html'));
  }
  
  db.prepare('UPDATE links SET visits = visits + 1 WHERE token = ?').run(link.token);
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// ─── API 路由 ───

// 管理员登录
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ success: false, message: '会话启动失败' });
      res.json({ success: true });
    });
  } else {
    res.json({ success: false, message: '密码错误' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin');
});

// 文件上传 (需登录)
app.post('/api/upload', requireAdmin, upload.single('htmlfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未接收到文件' });
  const token = crypto.randomBytes(16).toString('hex');
  const stmt = db.prepare('INSERT INTO files (token, filename, orig_name, size) VALUES (?, ?, ?, ?)');
  const info = stmt.run(token, req.file.filename, req.file.originalname, req.file.size);
  res.json({ success: true, file: { id: info.lastInsertRowid, orig_name: req.file.originalname } });
});

app.get('/api/files', requireAdmin, (req, res) => {
  const files = db.prepare('SELECT id, token, orig_name, size, created_at FROM files ORDER BY created_at DESC').all();
  res.json(files);
});

app.delete('/api/files/:id', requireAdmin, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (file) {
    const filePath = path.join(UPLOADS_DIR, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  }
  res.json({ success: true });
});

// 链接管理 (需登录)
app.post('/api/links', requireAdmin, (req, res) => {
  const { name, file_id, class_name, start_date, end_date, password } = req.body;
  const token = uuidv4().replace(/-/g, '').substring(0, 12);
  const start = start_date || new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO links (token, name, file_id, class_name, start_date, end_date, password) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(token, name, file_id, class_name || '', start, end_date, password || null);
  res.json({ success: true });
});

app.get('/api/links', requireAdmin, (req, res) => {
  const links = db.prepare('SELECT l.*, f.orig_name as file_name FROM links l JOIN files f ON l.file_id = f.id ORDER BY l.created_at DESC').all();
  const today = new Date().toISOString().split('T')[0];
  res.json(links.map(l => ({ ...l, status: today < l.start_date ? 'pending' : today > l.end_date ? 'expired' : 'active' })));
});

app.delete('/api/links/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/stats', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const totalFiles = db.prepare('SELECT COUNT(*) as c FROM files').get().c;
  const totalLinks = db.prepare('SELECT COUNT(*) as c FROM links').get().c;
  const activeLinks = db.prepare("SELECT COUNT(*) as c FROM links WHERE start_date <= ? AND end_date >= ?").get(today, today).c;
  const totalVisits = db.prepare('SELECT COALESCE(SUM(visits), 0) as c FROM links').get().c;
  res.json({ totalFiles, totalLinks, activeLinks, totalVisits, expiredLinks: totalLinks - activeLinks });
});

// 内容展示 API
app.get('/api/content/:token', (req, res) => {
  const link = db.prepare('SELECT l.*, f.filename FROM links l JOIN files f ON l.file_id = f.id WHERE l.token = ?').get(req.params.token);
  if (!link) return res.status(404).send('内容不存在');
  
  const filePath = path.join(UPLOADS_DIR, link.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('文件已丢失');
  
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(filePath);
});

app.get('/api/link-info/:token', (req, res) => {
  const link = db.prepare('SELECT token, name, end_date, start_date FROM links WHERE token = ?').get(req.params.token);
  res.json(link || {});
});

// 验证学生密码
app.post('/s/:token/auth', (req, res) => {
  const { password } = req.body;
  const link = db.prepare('SELECT * FROM links WHERE token = ?').get(req.params.token);
  if (link && link.password === password) {
    const authedLinks = req.session.authedLinks || [];
    authedLinks.push(link.token);
    req.session.authedLinks = authedLinks;
    return res.json({ success: true });
  }
  res.json({ success: false, message: '密码错误' });
});

// 启动
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 服务器已就绪，端口: ${PORT}`);
});
