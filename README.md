# 🚀 StudyPilot AI

> An AI-powered personalized study workspace for college students, built with Google Gemini, Firebase, Firestore, and Google Cloud Run.

StudyPilot AI is an intelligent academic assistant designed to help college students learn, revise, and organize their studies through personalized AI conversations.

It combines **Google Gemini**, **Firebase Authentication**, **Cloud Firestore**, and **Google Cloud Run** to provide a secure and scalable AI-powered study experience.

---

## ✨ Features

### 🔐 Secure Google Authentication
- Sign in with Google using Firebase Authentication.
- Each student's data is isolated using their Firebase UID.
- Authentication tokens are verified on the backend.

### 🤖 Gemini AI Academic Assistant
- Ask questions about programming, DSA, mathematics, algorithms, and other academic topics.
- Supports multi-turn conversations.
- Maintains conversation context for better follow-up answers.
- Powered by Google Gemini.

### 💬 Multiple Chat Sessions
- Create separate conversations using **New Chat**.
- Each conversation is stored independently.
- Continue previous conversations at any time.
- Recent chats are displayed in the sidebar.
- Chat titles are automatically generated from the first question.

### 📚 Study History
- Previous questions and AI responses are stored in Firestore.
- Students can revisit earlier explanations.
- History is private to the authenticated user.

### 🗂️ Personalized Workspace
StudyPilot AI provides a unified study workspace containing:

- Gemini AI Assistant
- Recent Chats
- Study History
- Planner
- Quiz
- New Chat

### 🔒 User-Isolated Data
Firestore security rules ensure that authenticated users can access only their own data.

Data is organized using the authenticated user's Firebase UID:

```text
users/{uid}/
    history/
    chats/
