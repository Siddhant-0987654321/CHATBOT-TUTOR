Here's a concise README.md** for your ExamPrep AI Tutor project. Copy this into a `README.md` file in your project folder:

```markdown
# 📚 ExamPrep AI Tutor

An AI-powered tutor that helps students prepare for exams across multiple subjects using Google's Gemini API.

## 🚀 Features

- **AI Chat Tutor**: Get detailed explanations in any subject
- **Test Generator**: Create practice tests with customizable parameters
- **Multi-subject Support**: Math, Science, CS, History, etc.
- **Response Saving**: Bookmark important answers for later review

## ⚙️ Setup

### Backend (Node.js)
1. Install dependencies:
   ```bash
   npm install express cors @google/generative-ai dotenv
   ```
2. Create `.env` file:
   ```env
   GEMINI_API_KEY=your_api_key_here
   PORT=3000
   ```
3. Start server:
   ```bash
   node server.js
   ```

### Frontend
1. Open `index.html` in a browser
2. No installation needed (runs directly in browser)

## 🔍 Usage
1. **Select a subject** from the sidebar
2. **Ask questions** in the chat interface
3. **Generate practice tests**:
   - Choose question type (MCQ/Coding/etc.)
   - Set difficulty level
   - Specify number of questions

## 🌟 Tips
- Use clear, specific questions for best results
- Bookmark responses with the save icon
- For coding questions, specify the language:
  > "Explain Python list comprehensions"

## 🛠️ Troubleshooting
| Error | Solution |
|-------|----------|
| 500 Server Error | Check backend console logs |
| "Failed to get response" | Verify Gemini API key |
| CORS errors | Ensure `app.use(cors())` is enabled |

## 📦 Project Structure
```
/examprep-tutor
├── server.js         # Backend (Node.js)
├── index.html        # Frontend
├── .env              # API keys (gitignored)
└── package.json      # Dependencies
```

## 📜 License
MIT License - Free for educational use

> **Note**: Always keep your API keys private!
```

### Key Sections Included:
1. **Features** - Quick overview of capabilities
2. **Setup** - Installation in 3 simple steps
3. **Usage** - How to interact with the tutor
4. **Troubleshooting** - Common issues table
5. **Project Structure** - File organization
6. **License** - Usage rights

### Pro Tips:
- Update the license if needed
- Add screenshots by including:
  ```markdown
  ![Chat Interface](screenshots/chat.png)
  ```
- For deployment instructions, add:
  ```markdown
  ## ☁️ Deployment
  Host the frontend on Netlify/Vercel and backend on Render.
  ```

