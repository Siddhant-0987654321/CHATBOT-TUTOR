require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.set('strictQuery', true);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/examprep', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

connectToDatabase();

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  qualifications: [{
    title: String,
    institution: String,
    year: String,
    description: String
  }],
  tokens: [{
    token: { type: String, required: true }
  }],
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  badges: [String],
  interactions: [{
    subject: String,
    topic: String,
    complexity: String,
    timestamp: Date
  }],
  weakAreas: [{
    subject: String,
    topic: String,
    accuracy: Number,
    attempts: Number
  }],
  challenges: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Challenge'
  }]
}, { timestamps: true });

UserSchema.methods.generateAuthToken = async function() {
  const user = this;
  const token = jwt.sign({ _id: user._id.toString() }, process.env.JWT_SECRET);
  user.tokens = user.tokens.concat({ token });
  await user.save();
  return token;
};

UserSchema.methods.updateStreak = async function() {
  const user = this;
  const now = new Date();
  const lastActive = new Date(user.lastActive);
  const diffDays = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return;
  
  if (diffDays === 1) {
    user.streak += 1;
  } else {
    user.streak = 1;
  }
  
  user.lastActive = now;
  await user.save();
};

UserSchema.methods.addXP = async function(points) {
  const user = this;
  user.xp += points;
  
  if (user.xp >= 100) {
    user.level += 1;
    user.xp -= 100;
  }
  
  await user.save();
};

const User = mongoose.model('User', UserSchema);

const FlashcardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  nextReview: { type: Date, default: Date.now },
  interval: { type: Number, default: 1 },
  easeFactor: { type: Number, default: 2.5 },
  timesReviewed: { type: Number, default: 0 },
  lastScore: { type: Number, default: 0 }
}, { timestamps: true });

FlashcardSchema.methods.updateSpacedRepetition = async function(score) {
  const card = this;
  card.lastScore = score;
  card.timesReviewed += 1;
  
  if (score < 3) {
    card.interval = 1;
  } else {
    if (card.timesReviewed === 1) {
      card.interval = 1;
    } else if (card.timesReviewed === 2) {
      card.interval = 3;
    } else {
      card.interval = Math.round(card.interval * card.easeFactor);
    }
  }
  
  card.nextReview = new Date(Date.now() + card.interval * 24 * 60 * 60 * 1000);
  await card.save();
};

const Flashcard = mongoose.model('Flashcard', FlashcardSchema);

const ChallengeSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  toEmail: { type: String, required: true },
  topic: { type: String, required: true },
  subject: { type: String, required: true },
  questionCount: { type: Number, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  status: { type: String, enum: ['pending', 'accepted', 'completed'], default: 'pending' },
  testContent: String,
  results: {
    fromUserScore: Number,
    toUserScore: Number,
    fromUserAnswers: [{
      question: String,
      answer: String,
      isCorrect: Boolean
    }],
    toUserAnswers: [{
      question: String,
      answer: String,
      isCorrect: Boolean
    }]
  },
  completedAt: Date
}, { timestamps: true });

ChallengeSchema.methods.sendEmailNotification = async function() {
  console.log(`Sending challenge email to ${this.toEmail}`);
};

const Challenge = mongoose.model('Challenge', ChallengeSchema);

const TestResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  type: { type: String, enum: ['Multiple Choice', 'Short Answer', 'True/False', 'Coding Problem', 'Essay'], required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  questionsCount: { type: Number, required: true },
  content: { type: String, required: true },
  score: Number,
  correctAnswers: Number,
  timeTaken: Number,
  weakAreas: [{
    topic: String,
    accuracy: Number
  }]
}, { timestamps: true });

const TestResult = mongoose.model('TestResult', TestResultSchema);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Authentication required');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded._id, 'tokens.token': token });

    if (!user) throw new Error('User not found');
    
    req.token = token;
    req.user = user;
    next();
  } catch (err) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

app.get('/', (req, res) => {
  res.send('AI Tutor Backend is Running');
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).send({ error: 'All fields are required' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ error: 'Email already in use' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    
    const token = await user.generateAuthToken();
    res.status(201).send({ user, token });
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }

    await user.updateStreak();
    const token = await user.generateAuthToken();
    res.send({ user, token });
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    req.user.tokens = req.user.tokens.filter(token => token.token !== req.token);
    await req.user.save();
    res.send();
  } catch (err) {
    res.status(500).send();
  }
});

app.post('/api/logout-all', authenticate, async (req, res) => {
  try {
    req.user.tokens = [];
    await req.user.save();
    res.send();
  } catch (err) {
    res.status(500).send();
  }
});

app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -tokens -__v')
      .populate('challenges', 'topic subject status createdAt');
    
    res.send(user);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

app.patch('/api/profile', authenticate, async (req, res) => {
  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['name', 'qualifications'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));
    
    if (!isValidOperation) {
      return res.status(400).send({ error: 'Invalid updates!' });
    }
    
    updates.forEach(update => req.user[update] = req.body[update]);
    await req.user.save();
    
    res.send(req.user);
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});
// Add this utility function
function formatPointByPoint(text) {
  // Process numbered points
  let formatted = text.replace(/(\d+\.)\s*/g, '\n$1 ');
  
  // Process bullet points
  formatted = formatted.replace(/\n\s*-/g, '\n    -');
  
  // Add space between sections
  formatted = formatted.replace(/(\n\d+\.\s)/g, '\n\n$1');
  
  return formatted.trim();
}
const activeRequests = new Map();
app.post('/api/chat', authenticate, async (req, res) => {
  try {
    const { message, subject, complexity = 'medium' } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    
    const prompt = `Explain "${message}" in ${subject} (${complexity} level) using this exact format:
    1. [Main Concept] - Brief definition
    2. Key Features:
       - Feature 1 (short)
       - Feature 2 (short)
    3. Example: One clear example
    4. Application: Real-world use
    Keep each point concise. Use exactly this structure.`;

    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }]
    });

    const response = await result.response;
    const rawReply = response.text();
    const formattedReply = formatPointByPoint(rawReply);
    // Store ongoing requests
const activeRequests = new Map();

// Add to your existing /api/chat endpoint
app.post('/api/chat', authenticate, async (req, res) => {
  const { message, requestId = generateId() } = req.body;
  
  const controller = new AbortController();
  activeRequests.set(requestId, controller);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const result = await model.generateContent({
      contents: [{ parts: [{ text: message }] }],
      signal: controller.signal // Enable cancellation
    });

    const response = await result.response;
    res.json({
      reply: formatResponse(response.text()),
      requestId,
      isComplete: true
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      res.json({ status: "stopped", requestId });
    } else {
      res.status(500).json({ error: err.message });
    }
  } finally {
    activeRequests.delete(requestId);
  }
});

// Add stop endpoint
app.post('/api/stop', (req, res) => {
  const { requestId } = req.body;
  const controller = activeRequests.get(requestId);
  
  if (controller) {
    controller.abort();
    res.json({ status: "stopped" });
  } else {
    res.status(404).json({ error: "Request not found" });
  }
});

// Helper function
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}
    // User tracking (unchanged)
    await req.user.updateStreak();
    await req.user.addXP(5);
    req.user.interactions.push({
      subject,
      topic: message.substring(0, 50),
      complexity,
      timestamp: new Date()
    });
    await req.user.save();

    res.json({ 
      reply: formattedReply,
      isComplete: true 
    });

  } catch (error) {
    console.error("Chat Error:", error);
    res.status(500).json({ 
      error: "Failed to get AI response",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/api/generate-test', authenticate, async (req, res) => {
  try {
    const { subject, topic, type, difficulty, count, examType } = req.body;
    
    let prompt;
    if (examType) {
      const examPresets = {
        SAT: "Generate SAT-style questions focusing on critical thinking and problem-solving",
        JEE: "Generate JEE Advanced level questions with multiple correct options",
        NEET: "Generate NEET-style MCQs with AIPMT pattern",
        GATE: "Generate GATE CS questions with numerical answer type",
        CBSE: "Generate CBSE board exam pattern questions"
      };
      
      prompt = `${examPresets[examType]} about ${topic} in ${subject}. Include ${count} ${type} questions at ${difficulty} level. 
      Format each question clearly with:
      - Question number
      - The question text
      - Options (if multiple choice) labeled A), B), etc.
      - "Answer:" followed by the correct answer
      - "Explanation:" with a brief explanation
      
      Separate questions with two newlines.`;
    } else {
      prompt = `Generate a ${difficulty} ${subject} test about ${topic} with ${count} ${type} questions. 
      Format with:
      - Clear numbering
      - Separate sections for each question
      - Answer after each question
      - Explanation for answers
      
      For coding problems, include sample inputs/outputs.`;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const result = await model.generateContent({ contents: [{ parts: [{ text: prompt }] }] });
    const response = await result.response;
    
    const testContent = response.text();
    
    const testResult = new TestResult({
      user: req.user._id,
      subject,
      topic,
      type,
      difficulty,
      questionsCount: count,
      content: testContent
    });
    await testResult.save();
    
    await req.user.updateStreak();
    await req.user.addXP(10);

    res.json({ test: testContent });
  } catch (error) {
    console.error("Test Generation Error:", error);
    res.status(500).json({
      error: "Test generation failed",
      details: error.message
    });
  }
});

app.post('/api/flashcards', authenticate, async (req, res) => {
  try {
    const { subject, topic, count = 10 } = req.body;
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const prompt = `Generate ${count} flashcards about ${topic} in ${subject}. 
    Each flashcard should have:
    - A clear, concise question
    - A detailed, accurate answer
    - Format as JSON array: [{"question":"...","answer":"..."}]`;
    
    const result = await model.generateContent({ contents: [{ parts: [{ text: prompt }] }] });
    const response = await result.response;
    
    let flashcards;
    try {
      flashcards = JSON.parse(response.text());
    } catch (e) {
      flashcards = response.text().split('\n\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split('\n');
          return { 
            question: parts[0].replace('Question:', '').trim(), 
            answer: parts[1]?.replace('Answer:', '').trim() || 'See explanation' 
          };
        });
    }

    const savedCards = await Flashcard.insertMany(
      flashcards.map(card => ({
        user: req.user._id,
        subject,
        topic,
        ...card
      }))
    );

    await req.user.updateStreak();
    await req.user.addXP(5);

    res.json({ flashcards: savedCards });
  } catch (error) {
    console.error("Flashcard Error:", error);
    res.status(500).json({ error: "Failed to generate flashcards" });
  }
});

app.get('/api/flashcards', authenticate, async (req, res) => {
  try {
    const flashcards = await Flashcard.find({ user: req.user._id })
      .sort({ nextReview: 1 })
      .limit(20);
    
    res.send(flashcards);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/flashcards/:id/review', authenticate, async (req, res) => {
  try {
    const { score } = req.body;
    const flashcard = await Flashcard.findOne({
      _id: req.params.id,
      user: req.user._id
    });
    
    if (!flashcard) {
      return res.status(404).send({ error: 'Flashcard not found' });
    }
    
    await flashcard.updateSpacedRepetition(score);
    
    if (score < 3) {
      const weakArea = req.user.weakAreas.find(area => 
        area.subject === flashcard.subject && area.topic === flashcard.topic
      );
      
      if (weakArea) {
        weakArea.attempts += 1;
        weakArea.accuracy = ((weakArea.accuracy * (weakArea.attempts - 1)) / weakArea.attempts);
      } else {
        req.user.weakAreas.push({
          subject: flashcard.subject,
          topic: flashcard.topic,
          accuracy: 0,
          attempts: 1
        });
      }
    }
    
    await req.user.save();
    await req.user.addXP(2);
    
    res.send(flashcard);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.post('/api/challenges', authenticate, async (req, res) => {
  try {
    const { email, topic, subject, questionCount, difficulty } = req.body;
    
    const challenge = new Challenge({
      fromUser: req.user._id,
      toEmail: email,
      topic,
      subject,
      questionCount,
      difficulty,
      status: 'pending'
    });
    
    await challenge.save();
    await challenge.sendEmailNotification();
    
    req.user.challenges.push(challenge._id);
    await req.user.save();
    
    res.status(201).send(challenge);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/challenges', authenticate, async (req, res) => {
  try {
    const challenges = await Challenge.find({
      $or: [
        { fromUser: req.user._id },
        { toEmail: req.user.email }
      ]
    })
    .populate('fromUser', 'name email')
    .sort({ createdAt: -1 });
    
    res.send(challenges);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post('/api/challenges/:id/accept', authenticate, async (req, res) => {
  try {
    const challenge = await Challenge.findOne({
      _id: req.params.id,
      toEmail: req.user.email,
      status: 'pending'
    });
    
    if (!challenge) {
      return res.status(404).send({ error: 'Challenge not found or already accepted' });
    }
    
    challenge.toUser = req.user._id;
    challenge.status = 'accepted';
    await challenge.save();
    
    res.send(challenge);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.post('/api/challenges/:id/complete', authenticate, async (req, res) => {
  try {
    const { score, answers } = req.body;
    const challenge = await Challenge.findOne({
      _id: req.params.id,
      $or: [
        { fromUser: req.user._id },
        { toUser: req.user._id }
      ],
      status: 'accepted'
    });
    
    if (!challenge) {
      return res.status(404).send({ error: 'Challenge not found or not accepted' });
    }
    
    if (challenge.fromUser.equals(req.user._id)) {
      challenge.results.fromUserScore = score;
      challenge.results.fromUserAnswers = answers;
    } else {
      challenge.results.toUserScore = score;
      challenge.results.toUserAnswers = answers;
    }
    
    if (challenge.results.fromUserScore !== undefined && 
        challenge.results.toUserScore !== undefined) {
      challenge.status = 'completed';
      challenge.completedAt = new Date();
    }
    
    await challenge.save();
    
    await req.user.addXP(15);
    
    res.send(challenge);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get('/api/progress', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('xp level streak weakAreas');
    
    const testResults = await TestResult.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    const accuracyBySubject = await TestResult.aggregate([
      { $match: { user: req.user._id } },
      { $group: {
        _id: "$subject",
        totalQuestions: { $sum: "$questionsCount" },
        correctAnswers: { $sum: "$correctAnswers" }
      }},
      { $project: {
        subject: "$_id",
        accuracy: { $cond: [
          { $eq: ["$totalQuestions", 0] },
          0,
          { $divide: ["$correctAnswers", "$totalQuestions"] }
        ]},
        totalQuestions: 1
      }},
      { $sort: { accuracy: 1 } }
    ]);
    
    res.send({
      xp: user.xp,
      level: user.level,
      streak: user.streak,
      weakAreas: user.weakAreas,
      recentTests: testResults,
      subjectAccuracy: accuracyBySubject
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get('/api/progress/chart', authenticate, async (req, res) => {
  try {
    const testResults = await TestResult.find({ user: req.user._id })
      .sort({ createdAt: 1 });
    
    const data = testResults.map((test, index) => ({
      x: index + 1,
      y: test.correctAnswers / test.questionsCount * 100,
      test: test.topic
    }));
    
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#4361ee';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Your Progress Over Time', canvas.width / 2, 30);
    
    ctx.strokeStyle = '#4361ee';
    ctx.lineWidth = 2;
    
    const padding = 50;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 100; i += 20) {
      const y = canvas.height - padding - (i / 100 * chartHeight);
      ctx.fillText(`${i}%`, padding - 10, y);
      ctx.beginPath();
      ctx.moveTo(padding - 5, y);
      ctx.lineTo(padding, y);
      ctx.stroke();
    }
    
    ctx.textAlign = 'center';
    for (let i = 0; i < data.length; i++) {
      const x = padding + (i / (data.length - 1)) * chartWidth;
      ctx.fillText(`Test ${i + 1}`, x, canvas.height - padding + 20);
      ctx.beginPath();
      ctx.moveTo(x, canvas.height - padding);
      ctx.lineTo(x, canvas.height - padding + 5);
      ctx.stroke();
    }
    
    ctx.strokeStyle = '#4361ee';
    ctx.fillStyle = '#4361ee';
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
      const x = padding + (i / (data.length - 1)) * chartWidth;
      const y = canvas.height - padding - (data[i].y / 100 * chartHeight);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
    }
    
    ctx.stroke();
    
    const buffer = canvas.toBuffer('image/png');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': buffer.length
    });
    res.end(buffer);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});