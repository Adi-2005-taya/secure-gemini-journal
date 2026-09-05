const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin SDK
initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();
const app = express();

app.use(cors());
app.use(express.json());

// Middleware to verify Firebase JWT from Frontend
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Unauthorized access" });
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Multi-turn chat & isolated Firestore logging
app.post("/api/chat", verifyToken, async (req, res) => {
  const { message, history } = req.body;
  const uid = req.user.uid;

  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    const chat = ai.chats.create({
      model: "gemini-3.6-flash",
      history: history || [],
      config: {
        systemInstruction: "You are a supportive, reflective journaling companion.",
      },
    });

    const response = await chat.sendMessage({ message });
    const reply = response.text;

    // Generate title and takeaway
    const summaryRes = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Summarize this exchange into a 3-word title and a 1-sentence reflection.\nUser: ${message}\nAssistant: ${reply}\nFormat: Title | Reflection`,
    });

    const [title, summary] = (summaryRes.text || "").split("|").map((s) => s?.trim());

    // Save strictly under /users/{uid}/entries
    const docRef = await db
      .collection("users")
      .doc(uid)
      .collection("entries")
      .add({
        userPrompt: message,
        aiResponse: reply,
        title: title || "Daily Reflection",
        summary: summary || "",
        createdAt: FieldValue.serverTimestamp(),
      });

    res.json({ id: docRef.id, reply, title, summary });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});

// Phase 3 Feature: Mindset & Resilience Trend Analysis
app.post("/api/analyze-trends", verifyToken, async (req, res) => {
  const uid = req.user.uid;
  try {
    const snapshot = await db
      .collection("users")
      .doc(uid)
      .collection("entries")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No past entries to analyze" });
    }

    const pastEntries = snapshot.docs.map((d) => d.data().userPrompt).join("\n---\n");

    const prompt = `Analyze these journal entries for cognitive trends. Output STRICT JSON:
    {
      "resilienceScore": 8,
      "dominantThemes": ["growth", "stress"],
      "mindsetAdvice": "string"
    }
    Entries:
    ${pastEntries}`;

    const analysis = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const result = JSON.parse(analysis.text);

    await db.collection("users").doc(uid).collection("insights").add({
      ...result,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json(result);
  } catch (err) {
    console.error("Trend analysis error:", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.listen(5000, () => console.log("Backend running on http://localhost:5000"));