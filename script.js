// --- Parent Homework Override Logic ---
const parentHomeworkInput = document.getElementById('parentHomeworkInput');
const saveParentHomeworkBtn = document.getElementById('saveParentHomeworkBtn');
const parentHomeworkStatus = document.getElementById('parentHomeworkStatus');
let parentHomeworkOverride = null;

// Fetch override on load
async function fetchParentHomeworkOverride() {
  try {
    const res = await fetch('http://localhost:3001/api/parent-homework-override');
    const data = await res.json();
    if (data && data.homework) {
      parentHomeworkOverride = data.homework;
      parentHomeworkInput.value = data.homework;
    } else {
      parentHomeworkOverride = null;
      parentHomeworkInput.value = '';
    }
  } catch (e) {
    parentHomeworkOverride = null;
  }
}

// Save override
saveParentHomeworkBtn.addEventListener('click', async () => {
  const homework = parentHomeworkInput.value.trim();
  try {
    const res = await fetch('http://localhost:3001/api/parent-homework-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homework })
    });
    const data = await res.json();
    if (data.success) {
      parentHomeworkStatus.textContent = 'Saved!';
      parentHomeworkOverride = homework;
      showHomework();
      setTimeout(() => { parentHomeworkStatus.textContent = ''; }, 2000);
    } else {
      parentHomeworkStatus.textContent = 'Error saving.';
    }
  } catch (e) {
    parentHomeworkStatus.textContent = 'Network error.';
  }
});

fetchParentHomeworkOverride();
// --- Poll for parent WhatsApp replies and show in chat ---
let lastParentReply = null;
async function pollParentReply() {
  try {
    const response = await fetch('http://localhost:3001/api/parent-reply');
    const data = await response.json();
    console.log('[Parent Reply Poll]', data); // Debug log
    if (data.body && (!lastParentReply || lastParentReply.body !== data.body || lastParentReply.timestamp !== data.timestamp)) {
      appendChatMessage('Parent', data.body);
      lastParentReply = data;
    }
  } catch (e) {
    // Ignore polling errors
  }
}
setInterval(pollParentReply, 4000); // Poll every 4 seconds
// --- Chatbot logic with Hugging Face LLM ---
const chatDisplay = document.getElementById('chatDisplay');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

// Replace with your Hugging Face API key
const HF_API_KEY = 'YOUR_HUGGINGFACE_API_KEY_HERE';
const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';

function appendChatMessage(sender, message) {
  const msgDiv = document.createElement('div');
  msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
  msgDiv.style.marginBottom = '0.5rem';
  msgDiv.style.textAlign = 'left';
  chatDisplay.appendChild(msgDiv);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

async function callHuggingFaceLLM(userMsg) {
  appendChatMessage('You', userMsg);
  appendChatMessage('Bot', '<em>Thinking...</em>');
  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: userMsg })
    });
    const data = await response.json();
    // Remove the "Thinking..." message
    chatDisplay.removeChild(chatDisplay.lastChild);
    if (data.error) {
      appendChatMessage('Bot', 'Sorry, there was an error: ' + data.error);
    } else if (Array.isArray(data) && data[0]?.generated_text) {
      appendChatMessage('Bot', data[0].generated_text);
    } else if (typeof data.generated_text === 'string') {
      appendChatMessage('Bot', data.generated_text);
    } else {
      appendChatMessage('Bot', 'Sorry, I could not understand the response.');
    }
  } catch (err) {
    chatDisplay.removeChild(chatDisplay.lastChild);
    appendChatMessage('Bot', 'Sorry, there was a network error.');
  }
}

sendChatBtn.addEventListener('click', () => {
  const userMsg = chatInput.value;
  if (!userMsg) return;
  callHuggingFaceLLM(userMsg);
  chatInput.value = '';
});
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const userMsg = chatInput.value;
    if (!userMsg) return;
    callHuggingFaceLLM(userMsg);
    chatInput.value = '';
  }
});

// 11+ level vocabulary words (sample set, can be expanded)
const vocabularyWords = [
  "abandon", "abundant", "acquire", "adept", "adverse", "advocate", "aesthetic", "alleviate", "ambiguous", "anomaly",
  "antagonist", "arbitrary", "aspire", "benevolent", "candid", "coherent", "complacent", "concur", "contemplate", "conventional",
  "copious", "cynical", "debilitate", "diligent", "discrepancy", "disseminate", "elaborate", "elicit", "emulate", "enigma",
  "epitome", "exacerbate", "feasible", "fluctuate", "formidable", "futile", "gregarious", "hypothetical", "imminent", "imperative"
];

// Generate 20 random mental maths questions (addition, subtraction, multiplication, division)
function generateMentalMaths() {
  const questions = [];
  const ops = ['+', '-', '×', '÷'];
  for (let i = 0; i < 20; i++) {
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, q;
    if (op === '+') {
      a = Math.floor(Math.random() * 100);
      b = Math.floor(Math.random() * 100);
      q = `${a} + ${b} = `;
    } else if (op === '-') {
      a = Math.floor(Math.random() * 100);
      b = Math.floor(Math.random() * a); // ensure non-negative
      q = `${a} - ${b} = `;
    } else if (op === '×') {
      a = Math.floor(Math.random() * 20);
      b = Math.floor(Math.random() * 20);
      q = `${a} × ${b} = `;
    } else {
      b = Math.floor(Math.random() * 19) + 2; // avoid divide by 0/1
      a = b * Math.floor(Math.random() * 10);
      q = `${a} ÷ ${b} = `;
    }
    questions.push(q);
  }
  return questions;
}

// Get 20 random vocabulary words
function getVocabulary() {
  const shuffled = vocabularyWords.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 20);
}


// Define homework for each day based on user requirements
const dailyApps = [
  '5 min using the app "Hit the Button"',
  '5 min using the app "Spelling Bees"',
  '5 min on the app "Duolingo"'
];

function getPiano(day) {
  // Piano for 30 minutes except for Wednesday/Monday/Friday
  return (day !== 'Wednesday' && day !== 'Monday' && day !== 'Friday') ? ['Piano for 30 minutes'] : [];
}

const weeklyHomework = {
  Sunday: [
    ...dailyApps,
    ...getPiano('Sunday'),
    'Ask Mama'
  ],
  Monday: [
    ...dailyApps,
    ...getPiano('Monday'),
    'Homework from Ms Carvy',
    'Memorise paragraphs from Krishna'
  ],
  Tuesday: [
    ...dailyApps,
    ...getPiano('Tuesday'),
    '2 tests on CGPs'
  ],
  Wednesday: [
    ...dailyApps,
    ...getPiano('Wednesday'),
    'Maths homework on Bonds'
  ],
  Thursday: [
    ...dailyApps,
    ...getPiano('Thursday'),
    '4 x 10 minutes tests on Bond'
  ],
  Friday: [
    ...dailyApps,
    ...getPiano('Friday'),
    'One comprehension'
  ],
  Saturday: [
    ...dailyApps,
    ...getPiano('Saturday'),
    'Ask Mama'
  ]
};


function getTodayHomework() {
  if (parentHomeworkOverride && parentHomeworkOverride.trim()) {
    // If override is a list, split by newlines or semicolons
    return parentHomeworkOverride.split(/\n|;/).map(s => s.trim()).filter(Boolean);
  }
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];
  return weeklyHomework[today] || [];
}


function showHomework() {
  const homeworkTypes = getTodayHomework();
  let html = `<h2>Today's Homework</h2><ul>`;
  if (parentHomeworkOverride && parentHomeworkOverride.trim()) {
    html += `<li style="color:#856404;"><em>(Parent override in effect)</em></li>`;
  }
  homeworkTypes.forEach(type => {
    html += `<li><strong>${type}</strong>`;
    if (type === "Mental Maths") {
      const questions = generateMentalMaths();
      html += `<ul>` + questions.map(q => `<li>${q}</li>`).join('') + `</ul>`;
    } else if (type === "Vocabulary") {
      const words = getVocabulary();
      html += `<ul>` + words.map(w => `<li>${w}</li>`).join('') + `</ul>`;
    } else {
      html += ` (Please check your homework notebook for details.)`;
    }
    html += `</li>`;
  });
  html += `</ul>`;
  document.getElementById('homeworkDisplay').innerHTML = html;
}

document.getElementById('getHomeworkBtn').addEventListener('click', showHomework);

// Re-fetch override before showing homework (in case another device/parent updates it)
document.getElementById('getHomeworkBtn').addEventListener('click', fetchParentHomeworkOverride);
