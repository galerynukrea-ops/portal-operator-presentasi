const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3333;
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'data') : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'presentations.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
  presentations: [],
  activeId: null,
  isStandby: true
};

function loadDatabase() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      db = {
        presentations: parsed.presentations || [],
        activeId: parsed.activeId || null,
        isStandby: parsed.isStandby !== undefined ? parsed.isStandby : true
      };
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error('Failed to load database file:', err.message);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save database file:', err.message);
  }
}

loadDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get local network IPv4 address
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Normalizer for Canva URLs (supports canva.com, canva.link, canva.me, canv.as)
async function normalizeCanvaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let trimmed = rawUrl.trim();

  // Basic check for Canva domains
  const isCanvaDomain = /canva\.(com|link|me)|canv\.as/i.test(trimmed);
  if (!isCanvaDomain) {
    return null;
  }

  // If it's a shortened link (e.g. canva.link/xxxx) or does not contain /design/, resolve redirect
  if (trimmed.includes('canva.link') || trimmed.includes('canva.me') || !trimmed.includes('/design/')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(trimmed, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res && res.url && res.url.includes('/design/')) {
        trimmed = res.url;
      }
    } catch (err) {
      console.warn('Redirect resolution warning:', err.message);
    }
  }

  // Regex to extract Canva design ID and optional slug
  const match = trimmed.match(/canva\.com\/design\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?/i);

  if (match) {
    const designId = match[1];
    const optionalSlug = match[2];

    const basePath = optionalSlug && optionalSlug !== 'view' && optionalSlug !== 'edit' && optionalSlug !== 'watch'
      ? `${designId}/${optionalSlug}`
      : designId;

    const embedUrl = `https://www.canva.com/design/${basePath}/view?embed`;
    const presentUrl = `https://www.canva.com/design/${basePath}/view`;

    return {
      original: rawUrl.trim(),
      resolvedUrl: trimmed,
      embedUrl,
      presentUrl,
      designId
    };
  }

  // Fallback for shortlinks if redirect resolution was skipped or returned unformatted
  let fallbackEmbed = trimmed;
  if (!fallbackEmbed.includes('embed')) {
    fallbackEmbed += (fallbackEmbed.includes('?') ? '&' : '?') + 'embed';
  }

  return {
    original: rawUrl.trim(),
    resolvedUrl: trimmed,
    embedUrl: fallbackEmbed,
    presentUrl: trimmed,
    designId: 'custom'
  };
}

// API: Get Network Info & QR Code
app.get('/api/network-info', async (req, res) => {
  const isVercel = Boolean(process.env.VERCEL);
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');

  let networkUrl;
  let isCloud = false;

  if (isVercel || (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1') && !forwardedHost.startsWith('192.168.') && !forwardedHost.startsWith('10.') && !forwardedHost.startsWith('172.'))) {
    networkUrl = `${forwardedProto}://${forwardedHost}`;
    isCloud = true;
  } else {
    const localIp = getLocalNetworkIp();
    networkUrl = `http://${localIp}:${PORT}`;
  }

  const localUrl = `http://localhost:${PORT}`;

  try {
    const qrCodeDataUrl = await QRCode.toDataURL(networkUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      localUrl,
      networkUrl,
      qrCodeDataUrl,
      isCloud
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get State
app.get('/api/state', (req, res) => {
  const activeItem = db.presentations.find(p => p.id === db.activeId) || null;
  const queueIndex = db.presentations.findIndex(p => p.id === db.activeId);
  const nextItem = queueIndex >= 0 && queueIndex < db.presentations.length - 1
    ? db.presentations[queueIndex + 1]
    : null;

  res.json({
    presentations: db.presentations,
    activeId: db.activeId,
    activeItem,
    nextItem,
    isStandby: db.isStandby,
    totalCount: db.presentations.length
  });
});

// API: Register Presentation (User Form)
app.post('/api/presentations', async (req, res) => {
  const { name, topic, canvaUrl } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Nama peserta wajib diisi.' });
  }

  const normalized = await normalizeCanvaUrl(canvaUrl);
  if (!normalized) {
    return res.status(400).json({ success: false, error: 'Link Canva tidak valid. Harap gunakan link share Canva yang benar.' });
  }

  const newPresentation = {
    id: 'pres_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name: name.trim(),
    topic: topic && topic.trim() ? topic.trim() : 'Presentasi',
    originalUrl: normalized.original,
    embedUrl: normalized.embedUrl,
    presentUrl: normalized.presentUrl,
    designId: normalized.designId,
    order: db.presentations.length + 1,
    status: 'queue', // queue | active | completed
    createdAt: new Date().toISOString()
  };

  db.presentations.push(newPresentation);
  saveDatabase();

  // Broadcast to all clients
  broadcastState();

  res.status(201).json({
    success: true,
    data: newPresentation,
    queueNumber: newPresentation.order
  });
});

// API: Update Presentation
app.patch('/api/presentations/:id', async (req, res) => {
  const { id } = req.params;
  const { name, topic, canvaUrl, status } = req.body;

  const item = db.presentations.find(p => p.id === id);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Data tidak ditemukan.' });
  }

  if (name !== undefined) item.name = name.trim();
  if (topic !== undefined) item.topic = topic.trim();
  if (status !== undefined) item.status = status;

  if (canvaUrl) {
    const normalized = await normalizeCanvaUrl(canvaUrl);
    if (normalized) {
      item.originalUrl = normalized.original;
      item.embedUrl = normalized.embedUrl;
      item.presentUrl = normalized.presentUrl;
      item.designId = normalized.designId;
    }
  }

  saveDatabase();
  broadcastState();

  res.json({ success: true, data: item });
});

// API: Delete Presentation
app.delete('/api/presentations/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = db.presentations.length;
  db.presentations = db.presentations.filter(p => p.id !== id);

  if (db.presentations.length === initialLength) {
    return res.status(404).json({ success: false, error: 'Data tidak ditemukan.' });
  }

  if (db.activeId === id) {
    db.activeId = null;
    db.isStandby = true;
  }

  // Recalculate order numbers
  db.presentations.forEach((p, idx) => {
    p.order = idx + 1;
  });

  saveDatabase();
  broadcastState();

  res.json({ success: true, message: 'Presentasi berhasil dihapus.' });
});

// API: Reorder Presentations
app.post('/api/presentations/reorder', (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ success: false, error: 'orderedIds harus berupa array ID.' });
  }

  const newArray = [];
  orderedIds.forEach((id, index) => {
    const item = db.presentations.find(p => p.id === id);
    if (item) {
      item.order = index + 1;
      newArray.push(item);
    }
  });

  // Add any items not in orderedIds to the end
  db.presentations.forEach(p => {
    if (!orderedIds.includes(p.id)) {
      p.order = newArray.length + 1;
      newArray.push(p);
    }
  });

  db.presentations = newArray;
  saveDatabase();
  broadcastState();

  res.json({ success: true, message: 'Urutan berhasil diperbarui.' });
});

// API: Reset All
app.post('/api/presentations/reset', (req, res) => {
  db.presentations = [];
  db.activeId = null;
  db.isStandby = true;
  saveDatabase();
  broadcastState();
  res.json({ success: true, message: 'Semua antrian telah direset.' });
});

// API: Activate Specific Presentation for Projector
app.post('/api/projector/activate', (req, res) => {
  const { id } = req.body;
  const item = db.presentations.find(p => p.id === id);

  if (!item) {
    return res.status(404).json({ success: false, error: 'Presentasi tidak ditemukan.' });
  }

  // Update statuses
  db.presentations.forEach(p => {
    if (p.id === id) {
      p.status = 'active';
    } else if (p.status === 'active') {
      p.status = 'completed';
    }
  });

  db.activeId = id;
  db.isStandby = false;
  saveDatabase();
  broadcastState();

  res.json({ success: true, activeItem: item });
});

// API: Switch to Next Presentation
app.post('/api/projector/next', (req, res) => {
  if (db.presentations.length === 0) {
    return res.status(400).json({ success: false, error: 'Belum ada presentasi dalam daftar.' });
  }

  let nextItem = null;
  if (!db.activeId) {
    // If nothing active, pick first queued or first item
    nextItem = db.presentations.find(p => p.status === 'queue') || db.presentations[0];
  } else {
    const currentIndex = db.presentations.findIndex(p => p.id === db.activeId);
    if (currentIndex >= 0 && currentIndex < db.presentations.length - 1) {
      nextItem = db.presentations[currentIndex + 1];
    }
  }

  if (!nextItem) {
    // No more presentations, go to standby
    db.presentations.forEach(p => {
      if (p.id === db.activeId) p.status = 'completed';
    });
    db.activeId = null;
    db.isStandby = true;
    saveDatabase();
    broadcastState();
    return res.json({ success: true, finished: true, message: 'Semua presentasi selesai.' });
  }

  // Set current to completed, next to active
  db.presentations.forEach(p => {
    if (p.id === nextItem.id) {
      p.status = 'active';
    } else if (p.status === 'active') {
      p.status = 'completed';
    }
  });

  db.activeId = nextItem.id;
  db.isStandby = false;
  saveDatabase();
  broadcastState();

  res.json({ success: true, activeItem: nextItem });
});

// API: Switch to Previous Presentation
app.post('/api/projector/prev', (req, res) => {
  if (db.presentations.length === 0 || !db.activeId) {
    return res.status(400).json({ success: false, error: 'Tidak ada presentasi aktif sebelumnya.' });
  }

  const currentIndex = db.presentations.findIndex(p => p.id === db.activeId);
  if (currentIndex <= 0) {
    return res.status(400).json({ success: false, error: 'Sudah berada di presentasi pertama.' });
  }

  const prevItem = db.presentations[currentIndex - 1];
  db.presentations.forEach(p => {
    if (p.id === prevItem.id) {
      p.status = 'active';
    } else if (p.id === db.activeId) {
      p.status = 'queue';
    }
  });

  db.activeId = prevItem.id;
  db.isStandby = false;
  saveDatabase();
  broadcastState();

  res.json({ success: true, activeItem: prevItem });
});

// API: Standby Mode (Projector Waiting Screen)
app.post('/api/projector/standby', (req, res) => {
  db.isStandby = true;
  saveDatabase();
  broadcastState();
  res.json({ success: true, isStandby: true });
});

// Broadcast state to all connected socket clients
function broadcastState() {
  const activeItem = db.presentations.find(p => p.id === db.activeId) || null;
  const queueIndex = db.presentations.findIndex(p => p.id === db.activeId);
  const nextItem = queueIndex >= 0 && queueIndex < db.presentations.length - 1
    ? db.presentations[queueIndex + 1]
    : (!db.activeId ? db.presentations.find(p => p.status === 'queue') || null : null);

  const payload = {
    presentations: db.presentations,
    activeId: db.activeId,
    activeItem,
    nextItem,
    isStandby: db.isStandby,
    totalCount: db.presentations.length
  };

  io.emit('state_updated', payload);
}

// Socket.io connection handling
io.on('connection', (socket) => {
  const clientType = socket.handshake.query.type || 'unknown';
  // Send current state immediately on connection
  const activeItem = db.presentations.find(p => p.id === db.activeId) || null;
  const queueIndex = db.presentations.findIndex(p => p.id === db.activeId);
  const nextItem = queueIndex >= 0 && queueIndex < db.presentations.length - 1
    ? db.presentations[queueIndex + 1]
    : (!db.activeId ? db.presentations.find(p => p.status === 'queue') || null : null);

  socket.emit('state_updated', {
    presentations: db.presentations,
    activeId: db.activeId,
    activeItem,
    nextItem,
    isStandby: db.isStandby,
    totalCount: db.presentations.length
  });

  socket.on('request_state', () => {
    broadcastState();
  });
});

// Routes for pretty URLs
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/projector', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'projector.html'));
});

// Start server if not running in serverless environment
if (!process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalNetworkIp();
    console.log(`\n======================================================`);
    console.log(`🚀 PORTAL OPERATOR PRESENTASI CANVA BERJALAN`);
    console.log(`======================================================`);
    console.log(`📱 Link Peserta (Bisa dibuka di HP/Laptop Peserta):`);
    console.log(`   Localhost : http://localhost:${PORT}`);
    console.log(`   Wi-Fi LAN : http://${localIp}:${PORT}`);
    console.log(`------------------------------------------------------`);
    console.log(`🎛️  Dashboard Admin Operator : http://localhost:${PORT}/admin`);
    console.log(`📽️  Layar Proyektor Fullscreen: http://localhost:${PORT}/projector`);
    console.log(`======================================================\n`);
  });
}

module.exports = server;
