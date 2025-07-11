const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toEmail: { type: String, required: true },
  topic: { type: String, required: true },
  questionCount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'completed'], default: 'pending' },
  results: {
    fromUserScore: Number,
    toUserScore: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('Challenge', challengeSchema);