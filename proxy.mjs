import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import Database from 'better-sqlite3';

const app = express();
app.use(cors());
app.use(express.json());

// --- SQLite DB Setup ---
const db = new Database('chatbot.db');

// Create tables if not exist
db.prepare(`CREATE TABLE IF NOT EXISTS parent_homework_override (
  id INTEGER PRIMARY KEY,
  homework TEXT,
  timestamp INTEGER,
  from_source TEXT
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS parent_reply (
  id INTEGER PRIMARY KEY,
  from_number TEXT,
  body TEXT,
  timestamp INTEGER
)`).run();

// Helper functions for DB
function setParentHomeworkOverride(homework, from_source = 'ui') {
  db.prepare('DELETE FROM parent_homework_override').run();
  db.prepare('INSERT INTO parent_homework_override (homework, timestamp, from_source) VALUES (?, ?, ?)')
    .run(homework, Date.now(), from_source);
}
function getParentHomeworkOverride() {
  return db.prepare('SELECT * FROM parent_homework_override LIMIT 1').get();
}
function setLatestParentReply(from, body) {
  db.prepare('DELETE FROM parent_reply').run();
  db.prepare('INSERT INTO parent_reply (from_number, body, timestamp) VALUES (?, ?, ?)')
    .run(from, body, Date.now());
}
function getLatestParentReply() {
  return db.prepare('SELECT * FROM parent_reply LIMIT 1').get();
}

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

app.use(cors());
app.use(express.json());

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
    res.json({ homework: override.homework, timestamp: override.timestamp, from: override.from_source });
  } else {
    res.json({ homework: null });
  }
});
import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();



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
    setLatestParentReply(from, body);
  }
  // Respond to Twilio (must return 200 OK)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
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
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Store your OpenAI key in .env

app.post('/api/chat', async (req, res) => {
  // Debug: log Twilio env variables
  console.log('TWILIO_WHATSAPP_FROM:', TWILIO_WHATSAPP_FROM);
  console.log('TWILIO_WHATSAPP_TO:', TWILIO_WHATSAPP_TO);
  const userMsg = req.body.inputs;

  // Detect Minecraft/permission questions
  const permissionPatterns = [
    /can i play minecraft/i,
    /can i play roblox/i,
    /can i play a game/i,
    /can i play on the computer/i,
    /can i play video games/i,
    /can I have a playdate/i,
    /can i watch tv/i,
    /can i have more screen time/i
  ];
  if (permissionPatterns.some(re => re.test(userMsg))) {
    // Log that a permission question was detected
    console.log('[WHATSAPP BOT] Permission question detected:', userMsg);
    // Send WhatsApp message to parent
    try {
      if (!TWILIO_WHATSAPP_FROM || !TWILIO_WHATSAPP_TO) {
        console.error('[WHATSAPP BOT] Twilio WhatsApp FROM or TO is missing');
        throw new Error('Twilio WhatsApp FROM or TO is missing');
      }
      const msg = await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: TWILIO_WHATSAPP_TO,
        body: `Freddie asked: "${userMsg}". Please reply to him directly!`
      });
      console.log('[WHATSAPP BOT] WhatsApp message sent! SID:', msg.sid);
    } catch (err) {
      console.error('[WHATSAPP BOT] Twilio WhatsApp error:', err.message);
    }
    return res.json({ generated_text: "I've asked your parent! Please wait for their answer. 😊" });
  }

  // Block inappropriate or out-of-scope topics for a 9-year-old
  const forbiddenPatterns = [
    /inappropriate|violence|drugs|alcohol|sex|gambling|dating|suicide|self-harm|kill|murder|weapon|gun|shoot|blood|scary|horror|creep|curse|swear|bad word|adult|nude|naked|death|die|terror/i
  ];
  if (forbiddenPatterns.some(re => re.test(userMsg))) {
    return res.json({ generated_text: "Sorry, I can't talk about that. Let's chat about homework, fun facts, or something else!" });
  }

  // Detect homework-related questions
  const homeworkPatterns = [
    /what('?s| is) my homework/i,
    /today'?s homework/i,
    /homework for today/i,
    /do i have homework/i,
    /what do i need to do/i,
    /what are my assignments/i
  ];
  let parentOverrideMsg = null;
  const dbOverride = getParentHomeworkOverride();
  if (dbOverride && dbOverride.homework && homeworkPatterns.some(re => re.test(userMsg))) {
    parentOverrideMsg =
      `Note for the assistant: The parent has set a custom homework override for today. ` +
      `Here is the parent's homework for today: ${dbOverride.homework}`;
  }

  // System prompt for a brief, easy, patient, and humorous 9-year-old-friendly chatbot
  let systemPrompt =
    "You are a friendly, patient, and humorous homework helper for a 9-year-old. " +
    "Always keep your answers brief (1-3 sentences), easy to understand, and appropriate for a child. " +
    "Never discuss scary, violent, or adult topics. If asked something inappropriate, gently refuse. " +
    "Use simple words, and add a touch of humor or encouragement when possible.";
  if (parentOverrideMsg) {
    systemPrompt += "\n" + parentOverrideMsg;
  }

  try {
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
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      res.json({ generated_text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: 'OpenAI API error: ' + (data.error?.message || 'Unknown error') });
    }
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));
