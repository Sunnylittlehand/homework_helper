import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import Database from 'better-sqlite3';
import twilio from 'twilio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const TWILIO_WHATSAPP_TO = process.env.TWILIO_WHATSAPP_TO;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Check if Twilio is configured
const isTwilioConfigured = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && TWILIO_WHATSAPP_TO;
const twilioClient = isTwilioConfigured ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

// System prompt for OpenAI
const systemPrompt = `You are a helpful homework assistant for children. You should:
1. Help with homework questions in a clear, friendly way
2. Encourage good study habits
3. Be patient and supportive
4. Use simple language appropriate for children
5. When asked about playing games or screen time, explain that you need to ask their parent first`;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Cache control for CSS files
app.use((req, res, next) => {
  if (req.path.endsWith('.css')) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

// --- SQLite DB Setup ---
let db;
try {
  db = new Database('chatbot.db');
  
  // Create tables if not exist
  db.prepare(`CREATE TABLE IF NOT EXISTS parent_homework_override (
    id INTEGER PRIMARY KEY,
    homework TEXT,
    timestamp INTEGER,
    from_source TEXT,
    override_date TEXT
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS parent_reply (
    id INTEGER PRIMARY KEY,
    from_number TEXT,
    body TEXT,
    timestamp INTEGER
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS permission_questions (
    id INTEGER PRIMARY KEY,
    question TEXT,
    asked_at INTEGER,
    answered_at INTEGER,
    parent_reply TEXT,
    status TEXT
  )`).run();
} catch (error) {
  console.error('Database initialization error:', error);
  // Continue without database functionality
  db = null;
}

// Helper functions
function setParentHomeworkOverride(homework, from_source = 'ui') {
  if (!db) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    db.prepare('DELETE FROM parent_homework_override').run();
    db.prepare('INSERT INTO parent_homework_override (homework, timestamp, from_source, override_date) VALUES (?, ?, ?, ?)')
      .run(homework, Date.now(), from_source, today);
  } catch (error) {
    console.error('Error setting homework override:', error);
  }
}

function getParentHomeworkOverride() {
  if (!db) return null;
  try {
    const today = new Date().toISOString().split('T')[0];
    const override = db.prepare('SELECT * FROM parent_homework_override LIMIT 1').get();
    if (!override || override.override_date !== today) {
      return null;
    }
    return override;
  } catch (error) {
    console.error('Error getting homework override:', error);
    return null;
  }
}

function setLatestParentReply(from, body) {
  if (!db) return;
  try {
    db.prepare('DELETE FROM parent_reply').run();
    db.prepare('INSERT INTO parent_reply (from_number, body, timestamp) VALUES (?, ?, ?)')
      .run(from, body, Date.now());
  } catch (error) {
    console.error('Error setting parent reply:', error);
  }
}

function getLatestParentReply() {
  if (!db) return null;
  try {
    return db.prepare('SELECT * FROM parent_reply LIMIT 1').get();
  } catch (error) {
    console.error('Error getting parent reply:', error);
    return null;
  }
}

function recordPermissionQuestion(question) {
  if (!db) return;
  try {
    return db.prepare('INSERT INTO permission_questions (question, asked_at, status) VALUES (?, ?, ?)')
      .run(question, Date.now(), 'pending');
  } catch (error) {
    console.error('Error recording permission question:', error);
    return null;
  }
}

function updateWithParentReply(from, body) {
  if (!db) return null;
  try {
    const pendingQuestion = db.prepare('SELECT * FROM permission_questions WHERE status = "pending" ORDER BY asked_at DESC LIMIT 1').get();
    if (pendingQuestion) {
      db.prepare('UPDATE permission_questions SET parent_reply = ?, answered_at = ?, status = ? WHERE id = ?')
        .run(body, Date.now(), 'answered', pendingQuestion.id);
      setLatestParentReply(from, body);
      return pendingQuestion.question;
    }
    setLatestParentReply(from, body);
    return null;
  } catch (error) {
    console.error('Error updating parent reply:', error);
    return null;
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      OPENAI_API_KEY: OPENAI_API_KEY ? 'Present' : 'Missing',
      TWILIO_CONFIGURED: isTwilioConfigured ? 'Yes' : 'No',
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || 3001,
      PWD: process.cwd(),
      __dirname: __dirname
    }
  });
});

app.post('/api/parent-homework-override', (req, res) => {
  const { homework } = req.body;
  if (typeof homework === 'string') {
    setParentHomeworkOverride(homework, 'ui');
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Missing or invalid homework' });
  }
});

app.get('/api/parent-homework-override', (req, res) => {
  const override = getParentHomeworkOverride();
  if (override) {
    res.json({ 
      homework: override.homework, 
      timestamp: override.timestamp, 
      from: override.from_source,
      date: override.override_date 
    });
  } else {
    res.json({ homework: null });
  }
});

app.post('/api/whatsapp-reply', (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log('[WHATSAPP BOT] Incoming WhatsApp reply from', from, ':', body);

  const homeworkMatch = body.match(/^(homework|hw)\s*[:\-]?\s*(.+)$/i);
  if (homeworkMatch) {
    const homeworkText = homeworkMatch[2].trim();
    setParentHomeworkOverride(homeworkText, 'whatsapp');
    setLatestParentReply(from, `Set today's homework: ${homeworkText}`);
  } else {
    const relatedQuestion = updateWithParentReply(from, body);
    if (relatedQuestion) {
      console.log(`[WHATSAPP BOT] Received reply to question: "${relatedQuestion}"`);
    } else {
      setLatestParentReply(from, body);
    }
  }
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

app.post('/api/simulate-parent-reply', (req, res) => {
  const { reply } = req.body;
  if (typeof reply === 'string') {
    updateWithParentReply('SIMULATED', reply);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Missing or invalid reply' });
  }
});

app.get('/api/parent-reply', (req, res) => {
  const reply = getLatestParentReply();
  if (reply) {
    res.json({ from: reply.from_number, body: reply.body, timestamp: reply.timestamp });
  } else {
    res.json({ body: null });
  }
});

app.post('/api/chat', async (req, res) => {
  const userMsg = req.body.inputs;

  if (!OPENAI_API_KEY) {
    console.error('[CHATBOT] OpenAI API key is missing');
    return res.json({ 
      response: "I'm sorry, I'm not fully configured right now. Please check the Render environment variables and try again later." 
    });
  }

  const permissionPatterns = [
    /can i play minecraft/i,
    /can i play roblox/i,
    /can i play (a )?(game|video game)/i,
    /can i (use|play on) the (computer|pc|laptop)/i,
    /can i play video games/i,
    /can I have a playdate/i,
    /can i watch (tv|television|youtube|videos)/i,
    /can i have (more )?(screen time|device time)/i,
    /am i allowed to play/i,
    /is it ok (for me )?to play/i,
    /can i have a snack/i,
    /can i eat/i
  ];
  
  if (permissionPatterns.some(re => re.test(userMsg))) {
    console.log('[CHATBOT] Permission question detected:', userMsg);
    recordPermissionQuestion(userMsg);
    
    if (isTwilioConfigured) {
      try {
        const msg = await twilioClient.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${TWILIO_WHATSAPP_TO}`,
          body: `Your child asked: "${userMsg}"`
        });
        console.log('[WHATSAPP BOT] Message sent:', msg.sid);
        res.json({ response: "I've asked your parent about this. Please wait for their reply." });
      } catch (error) {
        console.error('[WHATSAPP BOT] Error sending message:', error);
        res.json({ response: "I'm having trouble reaching your parent right now. Please try asking them directly." });
      }
    } else {
      console.log('[CHATBOT] Twilio not configured, skipping WhatsApp notification');
      res.json({ response: "I've recorded your question. Please ask your parent directly." });
    }
  } else {
    try {
      console.log('[OPENAI] Making API request...');
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMsg }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });
      
      console.log('[OPENAI] Response status:', response.status);
      const data = await response.json();
      
      if (response.status === 401) {
        console.error('[OPENAI] Authentication error - check API key');
        return res.json({ 
          response: "I'm having trouble connecting to my brain right now. Please check the OpenAI API key in Render environment variables." 
        });
      }
      
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        res.json({ generated_text: data.choices[0].message.content });
      } else {
        console.error('[OPENAI] Error in response:', data.error || 'Unknown error');
        res.json({ 
          response: "I'm having trouble thinking right now. Please try again later." 
        });
      }
    } catch (e) {
      console.error('[OPENAI] Network error:', e.message);
      res.json({ 
        response: "I'm having trouble connecting to my brain right now. Please try again later." 
      });
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER] Error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.path);
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', {
    OPENAI_API_KEY: OPENAI_API_KEY ? 'Present' : 'Missing',
    TWILIO_CONFIGURED: isTwilioConfigured ? 'Yes' : 'No',
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: PORT,
    PWD: process.cwd(),
    __dirname: __dirname
  });
});
