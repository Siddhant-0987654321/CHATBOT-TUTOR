const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  nextReview: { type: Date, default: Date.now },
  interval: { type: Number, default: 1 }, // days
  easeFactor: { type: Number, default: 2.5 }
}, { timestamps: true });

module.exports = mongoose.model('Flashcard', flashcardSchema);