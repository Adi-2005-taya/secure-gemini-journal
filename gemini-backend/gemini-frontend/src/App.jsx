import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot } from "firebase/firestore";

// Your exact Firebase Web configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmUxwDqIVZJH7ctA4u-72u0VZOjlDBXkQ",
  authDomain: "gemini-journal-a23fa.firebaseapp.com",
  projectId: "gemini-journal-a23fa",
  storageBucket: "gemini-journal-a23fa.firebasestorage.app",
  messagingSenderId: "442054473530",
  appId: "1:442054473530:web:6f5c089bc2488f5f414203",
  measurementId: "G-S8RBB77P8W"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [insights, setInsights] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Enforce isolated Firestore reads directly scoped to UID
        const q = query(
          collection(db, "users", currentUser.uid, "entries"),
          orderBy("createdAt", "desc")
        );
        return onSnapshot(q, (snapshot) => {
          setEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        });
      } else {
        setEntries([]);
      }
    });
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: input }),
      });
      setInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("http://localhost:5000/api/analyze-trends", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInsights(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <div style={{ textAlign: "center", marginTop: 100, fontFamily: "sans-serif" }}>
        <h2>Personal Gemini Journal</h2>
        <p>Zero-leakage isolated personal journaling</p>
        <button
          onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
          style={{ padding: "10px 20px", fontSize: 16, cursor: "pointer" }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Logged in as: {user.displayName}</h3>
        <button onClick={() => signOut(auth)} style={{ padding: "6px 12px", cursor: "pointer" }}>
          Log Out
        </button>
      </div>

      <textarea
        rows={4}
        style={{ width: "100%", padding: 12, marginTop: 15, boxSizing: "border-box" }}
        placeholder="Brainstorm or reflect on your day..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button
          onClick={handleSend}
          disabled={loading}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          {loading ? "Thinking..." : "Save Entry"}
        </button>
        <button
          onClick={handleAnalyze}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          Analyze Mindset Trends (Phase 3)
        </button>
      </div>

      {insights && (
        <div style={{ background: "#f1f5f9", padding: 16, borderRadius: 8, marginTop: 24 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Cognitive Pattern Analysis</h4>
          <p><strong>Resilience Score:</strong> {insights.resilienceScore} / 10</p>
          <p><strong>Dominant Themes:</strong> {insights.dominantThemes?.join(", ")}</p>
          <p><strong>Mindset Advice:</strong> {insights.mindsetAdvice}</p>
        </div>
      )}

      <h3 style={{ marginTop: 40 }}>Your Past Reflections ({entries.length})</h3>
      {entries.map((e) => (
        <div
          key={e.id}
          style={{ border: "1px solid #cbd5e1", padding: 16, margin: "12px 0", borderRadius: 8 }}
        >
          <h4 style={{ margin: "0 0 6px 0" }}>{e.title}</h4>
          <p style={{ color: "#64748b", margin: "0 0 10px 0" }}><em>{e.summary}</em></p>
          <p style={{ margin: 0 }}><strong>Gemini:</strong> {e.aiResponse}</p>
        </div>
      ))}
    </div>
  );
}