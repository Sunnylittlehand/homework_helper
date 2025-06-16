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

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Add cache control headers
app.use((req, res, next) => {
  if (req.path.endsWith('.css')) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[SERVER] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- SQLite DB Setup ---
const db = new Database('chatbot.db');

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

// Helper functions for DB
function setParentHomeworkOverride(homework, from_source = 'ui') {
  const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
  db.prepare('DELETE FROM parent_homework_override').run();
  db.prepare('INSERT INTO parent_homework_override (homework, timestamp, from_source, override_date) VALUES (?, ?, ?, ?)')
    .run(homework, Date.now(), from_source, today);
}
function getParentHomeworkOverride() {
  const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
  const override = db.prepare('SELECT * FROM parent_homework_override LIMIT 1').get();
  
  // If no override exists or it's from a different day, return null
  if (!override || override.override_date !== today) {
    return null;
  }
  
  return override;
}
function setLatestParentReply(from, body) {
  db.prepare('DELETE FROM parent_reply').run();
  db.prepare('INSERT INTO parent_reply (from_number, body, timestamp) VALUES (?, ?, ?)')
    .run(from, body, Date.now());
}
function getLatestParentReply() {
  return db.prepare('SELECT * FROM parent_reply LIMIT 1').get();
}
function recordPermissionQuestion(question) {
  return db.prepare('INSERT INTO permission_questions (question, asked_at, status) VALUES (?, ?, ?)')
    .run(question, Date.now(), 'pending');
}
function updateWithParentReply(from, body) {
  // Get the most recent pending question
  const pendingQuestion = db.prepare('SELECT * FROM permission_questions WHERE status = "pending" ORDER BY asked_at DESC LIMIT 1').get();
  
  if (pendingQuestion) {
    // Update it with the parent's reply
    db.prepare('UPDATE permission_questions SET parent_reply = ?, answered_at = ?, status = ? WHERE id = ?')
      .run(body, Date.now(), 'answered', pendingQuestion.id);
    
    // Also update the parent_reply table for backward compatibility
    setLatestParentReply(from, body);
    
    return pendingQuestion.question;
  }
  
  // If no pending question, just update the parent_reply table
  setLatestParentReply(from, body);
  return null;
}

// Endpoint to set parent homework override
app.post('/api/parent-homework-override', (req, res) => {
  const { homework } = req.body;
  if (typeof homework === 'string') {
    setParentHomeworkOverride(homework, 'ui');
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Missing or invalid homework' });
  }
});

// Endpoint to get parent homework override
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

// --- No in-memory parent reply, use DB ---

// Endpoint for Twilio to POST incoming WhatsApp messages (parent replies)
app.post('/api/whatsapp-reply', express.urlencoded({ extended: false }), (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log('[WHATSAPP BOT] Incoming WhatsApp reply from', from, ':', body);

  // If the message is about homework, set as override (e.g. starts with 'homework:' or 'hw:')
  const homeworkMatch = body.match(/^(homework|hw)\s*[:\-]?\s*(.+)$/i);
  if (homeworkMatch) {
    const homeworkText = homeworkMatch[2].trim();
    setParentHomeworkOverride(homeworkText, 'whatsapp');
    setLatestParentReply(from, `Set today's homework: ${homeworkText}`);
  } else {
    // Check if this is a reply to a permission question
    const relatedQuestion = updateWithParentReply(from, body);
    if (relatedQuestion) {
      console.log(`[WHATSAPP BOT] Received reply to question: "${relatedQuestion}"`);
    } else {
      // Just a regular message
      setLatestParentReply(from, body);
    }
  }
  // Respond to Twilio (must return 200 OK)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// Endpoint to simulate parent replies (for testing without WhatsApp)
app.post('/api/simulate-parent-reply', express.json(), (req, res) => {
  const { reply } = req.body;
  if (typeof reply === 'string') {
    updateWithParentReply('SIMULATED', reply);
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Missing or invalid reply' });
  }
});

// Endpoint for frontend to fetch the latest parent reply
app.get('/api/parent-reply', (req, res) => {
  const reply = getLatestParentReply();
  if (reply) {
    res.json({ from: reply.from_number, body: reply.body, timestamp: reply.timestamp });
  } else {
    res.json({ body: null });
  }
});

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const TWILIO_WHATSAPP_TO = process.env.TWILIO_WHATSAPP_TO;

// Check if Twilio is configured
const isTwilioConfigured = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && TWILIO_WHATSAPP_TO;
const twilioClient = isTwilioConfigured ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/api/chat', async (req, res) => {
  const userMsg = req.body.inputs;

  // Check if OpenAI is configured
  if (!OPENAI_API_KEY) {
    console.error('[CHATBOT] OpenAI API key is missing');
    return res.json({ 
      response: "I'm sorry, I'm not fully configured right now. Please check the Render environment variables and try again later." 
    });
  }

  // Detect Minecraft/permission questions
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
    
    // Record the question in our database
    recordPermissionQuestion(userMsg);
    
    // Send WhatsApp message to parent if Twilio is configured
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
      // If Twilio is not configured, just record the question and respond
      console.log('[CHATBOT] Twilio not configured, skipping WhatsApp notification');
      res.json({ response: "I've recorded your question. Please ask your parent directly." });
    }
  } else {
    // Handle non-permission questions
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      OPENAI_API_KEY: OPENAI_API_KEY ? 'Present' : 'Missing',
      TWILIO_CONFIGURED: isTwilioConfigured ? 'Yes' : 'No',
      NODE_ENV: process.env.NODE_ENV || 'development'
    }
  });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Environment:', {
    OPENAI_API_KEY: OPENAI_API_KEY ? 'Present' : 'Missing',
    TWILIO_CONFIGURED: isTwilioConfigured ? 'Yes' : 'No',
    NODE_ENV: process.env.NODE_ENV || 'development'
  });
});
