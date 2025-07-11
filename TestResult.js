const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  type: { type: String, enum: ['Multiple Choice', 'Short Answer', 'True/False', 'Coding Problem', 'Essay'], required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  questionsCount: { type: Number, required: true },
  content: { type: String, required: true },
  score: Number,
  correctAnswers: Number
}, { timestamps: true });

module.exports = mongoose.model('TestResult', testResultSchema);