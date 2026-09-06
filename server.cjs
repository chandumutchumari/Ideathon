const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

const { GoogleGenAI } = require("@google/genai");

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

// Load .env
dotenv.config();

// Firebase / Google Cloud project
process.env.GOOGLE_CLOUD_PROJECT = "studypilot-ai-9965e";

initializeApp();

const firebaseAuth = getAuth();

const app = express();

// -------------------------
// Middleware
// -------------------------

app.use(cors());

app.use(
  express.json({
    limit: "1mb",
  })
);

// -------------------------
// Gemini
// -------------------------

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// -------------------------
// Health Check
// -------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "StudyPilot AI backend is running 🚀",
  });
});

// -------------------------
// Firebase Authentication
// -------------------------

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const idToken = authHeader.substring(7);

    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    req.user = decodedToken;

    console.log(
      `Authenticated user: ${
        decodedToken.email || decodedToken.uid
      }`
    );

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(401).json({
      success: false,
      error: "Invalid or expired authentication token",
    });
  }
}

// -------------------------
// Gemini Ask API
// -------------------------

app.post("/api/ask", verifyFirebaseToken, async (req, res) => {
  try {
    const { question, history } = req.body;

    // Validate question
    if (
      !question ||
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    const cleanQuestion = question.trim();

    console.log("Question:", cleanQuestion);

    // Gemini conversation contents
    const contents = [];

    // Previous conversation
    if (Array.isArray(history)) {
      for (const message of history) {
        if (
          !message ||
          typeof message.text !== "string" ||
          !message.text.trim()
        ) {
          continue;
        }

        const role =
          message.role === "model" ? "model" : "user";

        contents.push({
          role: role,
          parts: [
            {
              text: message.text,
            },
          ],
        });
      }
    }

    // Current question
    contents.push({
      role: "user",
      parts: [
        {
          text: cleanQuestion,
        },
      ],
    });

    console.log(
      `Conversation messages: ${contents.length}`
    );

    // Gemini request
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
    });

    const answer =
      response.text ||
      "Gemini returned an empty response.";

    console.log("Gemini response received.");

    return res.json({
      success: true,
      answer: answer,
    });
  } catch (error) {
    console.error("Gemini error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to get response from Gemini",
    });
  }
});

// -------------------------
// Serve React Production Build
// -------------------------

const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

// React SPA fallback
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// -------------------------
// Start Server
// -------------------------

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `StudyPilot AI running on port ${PORT}`
  );
});