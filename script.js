// --- Chatbot logic ---
const chatDisplay = document.getElementById('chatDisplay');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

function appendChatMessage(sender, message) {
  const msgDiv = document.createElement('div');
  msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
  msgDiv.style.marginBottom = '0.5rem';
  chatDisplay.appendChild(msgDiv);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

let homeworkDone = false;

function isWeekend() {
  const day = new Date().getDay();
  // 0: Sunday, 5: Friday, 6: Saturday
  return day === 0 || day === 5 || day === 6;
}

function chatbotReply(userMsg) {
  const msg = userMsg.trim().toLowerCase();
  if (msg.includes("homework")) {
    // Show today's homework summary
    const homeworkTypes = getTodayHomework();
    let reply = `Today's homework: ` + homeworkTypes.join(', ') + '.';
    if (homeworkTypes.includes("Mental Maths")) reply += ' (Click the homework button for questions!)';
    if (homeworkTypes.includes("Vocabulary")) reply += ' (Click the homework button for your words!)';
    return reply;
  } else if (msg.includes("minecraft")) {
    if (isWeekend()) {
      if (homeworkDone) {
        return "Yes, you can play Minecraft! You've finished all your homework and it's the weekend.";
      } else {
        return "You need to finish all your homework before you can play Minecraft on the weekend.";
      }
    } else {
      return "You can only play Minecraft on Friday, Saturday, or Sunday after finishing all your homework.";
    }
  } else if (msg.includes("finished") && msg.includes("homework")) {
    homeworkDone = true;
    return "Great job! I've marked your homework as done.";
  } else {
    return "I'm here to help with your homework! Try asking about your homework or if you can play Minecraft.";
  }
}

function handleChatSend() {
  const userMsg = chatInput.value;
  if (!userMsg) return;
  appendChatMessage('You', userMsg);
  const botReply = chatbotReply(userMsg);
  setTimeout(() => appendChatMessage('Bot', botReply), 400);
  chatInput.value = '';
}

sendChatBtn.addEventListener('click', handleChatSend);
chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') handleChatSend();
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
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];
  return weeklyHomework[today] || [];
}

function showHomework() {
  const homeworkTypes = getTodayHomework();
  let html = `<h2>Today's Homework</h2><ul>`;
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
