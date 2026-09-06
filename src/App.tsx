import { useEffect, useState } from "react";
import {
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  auth,
  googleProvider,
  db,
} from "./firebase";

type Tab =
  | "dashboard"
  | "planner"
  | "quiz"
  | "history";

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  createdAt?: unknown;
};

type ChatItem = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export default function App() {
  const [tab, setTab] =
    useState<Tab>("dashboard");

  const [question, setQuestion] =
    useState("");

  const [answer, setAnswer] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [user, setUser] =
    useState(auth.currentUser);

  const [chatHistory, setChatHistory] =
    useState<ChatMessage[]>([]);

  const [studyHistory, setStudyHistory] =
    useState<HistoryItem[]>([]);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  // ==============================
  // MULTIPLE CHATS
  // ==============================

  const [chats, setChats] =
    useState<ChatItem[]>([]);

  const [activeChatId, setActiveChatId] =
    useState<string | null>(null);

  const [chatsLoading, setChatsLoading] =
    useState(false);

  // ==============================
  // LOAD FIRESTORE HISTORY
  // ==============================

  const loadStudyHistory = async (
    uid: string
  ) => {
    try {
      setHistoryLoading(true);

      const historyRef = collection(
        db,
        "users",
        uid,
        "history"
      );

      const historyQuery = query(
        historyRef,
        orderBy("createdAt", "desc")
      );

      const snapshot =
        await getDocs(historyQuery);

      const items: HistoryItem[] =
        snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<
            HistoryItem,
            "id"
          >),
        }));

      setStudyHistory(items);
    } catch (error) {
      console.error(
        "History loading error:",
        error
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // ==============================
  // LOAD MULTIPLE CHATS
  // ==============================

  const loadChats = async (
    uid: string
  ) => {
    try {
      setChatsLoading(true);

      const chatsRef = collection(
        db,
        "users",
        uid,
        "chats"
      );

      const chatsQuery = query(
        chatsRef,
        orderBy("updatedAt", "desc")
      );

      const snapshot =
        await getDocs(chatsQuery);

      const items: ChatItem[] =
        snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            title:
              typeof data.title === "string"
                ? data.title
                : "New Chat",

            messages:
              Array.isArray(data.messages)
                ? data.messages
                : [],

            createdAt:
              data.createdAt,

            updatedAt:
              data.updatedAt,
          };
        });

      setChats(items);
    } catch (error) {
      console.error(
        "Chats loading error:",
        error
      );
    } finally {
      setChatsLoading(false);
    }
  };

  // ==============================
  // GOOGLE LOGIN
  // ==============================

  const handleLogin = async () => {
    try {
      const result =
        await signInWithPopup(
          auth,
          googleProvider
        );

      setUser(result.user);

      await setDoc(
        doc(
          db,
          "users",
          result.user.uid
        ),
        {
          name:
            result.user.displayName ||
            "Student",

          email:
            result.user.email || "",

          photoURL:
            result.user.photoURL || "",

          lastLogin:
            new Date().toISOString(),
        },
        {
          merge: true,
        }
      );

      console.log(
        "User saved to Firestore!"
      );

      await loadStudyHistory(
        result.user.uid
      );

      await loadChats(
        result.user.uid
      );
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      alert(
        "Google Sign-In failed. Please try again."
      );
    }
  };

  // ==============================
  // LOGOUT
  // ==============================

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setUser(null);
      setAnswer("");
      setQuestion("");
      setChatHistory([]);
      setStudyHistory([]);
      setChats([]);
      setActiveChatId(null);
      setTab("dashboard");
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );
    }
  };

  // ==============================
  // LOAD DATA WHEN USER EXISTS
  // ==============================

  useEffect(() => {
    if (user) {
      loadStudyHistory(user.uid);
      loadChats(user.uid);
    }
  }, [user]);

  // ==============================
  // ASK GEMINI
  // ==============================

  const askGemini = async () => {
    if (!user) {
      alert(
        "Please sign in with Google first."
      );
      return;
    }

    if (!question.trim()) {
      alert("Enter a question first.");
      return;
    }

    try {
      setLoading(true);

      const currentQuestion =
        question.trim();

      // ==========================
      // FIREBASE AUTH TOKEN
      // ==========================

      const token =
        await user.getIdToken(true);

      // ==========================
      // API URL
      // ==========================

      const API_BASE_URL =
        import.meta.env.DEV
          ? "http://localhost:8080"
          : "";

      // ==========================
      // CURRENT USER MESSAGE
      // ==========================

      const updatedHistory:
        ChatMessage[] = [
          ...chatHistory,
          {
            role: "user",
            text: currentQuestion,
          },
        ];

      // ==========================
      // SEND TO BACKEND
      // ==========================

      const response =
        await fetch(
          `${API_BASE_URL}/api/ask`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              question:
                currentQuestion,

              history:
                chatHistory,
            }),
          }
        );

      // ==========================
      // READ RESPONSE
      // ==========================

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Request failed with status ${response.status}`
        );
      }

      if (
        !data.success ||
        !data.answer
      ) {
        throw new Error(
          data.error ||
            "Gemini returned an empty response."
        );
      }

      const geminiAnswer =
        data.answer;

      // ==========================
      // FINAL CONVERSATION
      // ==========================

      const finalHistory:
        ChatMessage[] = [
          ...updatedHistory,
          {
            role: "model",
            text: geminiAnswer,
          },
        ];

      setChatHistory(
        finalHistory
      );

      setAnswer(
        geminiAnswer
      );

      // ==========================
      // SAVE STUDY HISTORY
      // ==========================

      const historyRef =
        doc(
          collection(
            db,
            "users",
            user.uid,
            "history"
          )
        );

      await setDoc(
        historyRef,
        {
          question:
            currentQuestion,

          answer:
            geminiAnswer,

          createdAt:
            serverTimestamp(),
        }
      );

      console.log(
        "Study session saved!"
      );

      // ==========================
      // MULTIPLE CHAT SAVE
      // ==========================

      let chatId =
        activeChatId;

      let chatTitle =
        chats.find(
          (chat) =>
            chat.id === chatId
        )?.title;

      // Create a new chat if
      // there is no active chat
      if (!chatId) {
        const newChatRef =
          doc(
            collection(
              db,
              "users",
              user.uid,
              "chats"
            )
          );

        chatId =
          newChatRef.id;

        chatTitle =
          currentQuestion.length >
          35
            ? currentQuestion.slice(
                0,
                35
              ) + "..."
            : currentQuestion;

        setActiveChatId(
          chatId
        );

        await setDoc(
          newChatRef,
          {
            title:
              chatTitle,

            messages:
              finalHistory,

            createdAt:
              new Date().toISOString(),

            updatedAt:
              new Date().toISOString(),
          }
        );
      } else {
        // Existing chat
        const chatRef =
          doc(
            db,
            "users",
            user.uid,
            "chats",
            chatId
          );

        await setDoc(
          chatRef,
          {
            title:
              chatTitle ||
              "Study Chat",

            messages:
              finalHistory,

            updatedAt:
              new Date().toISOString(),
          },
          {
            merge: true,
          }
        );
      }

      console.log(
        "Chat saved!"
      );

      // ==========================
      // REFRESH DATA
      // ==========================

      await loadStudyHistory(
        user.uid
      );

      await loadChats(
        user.uid
      );

      // ==========================
      // CLEAR INPUT
      // ==========================

      setQuestion("");
    } catch (error) {
      console.error(
        "Gemini request error:",
        error
      );

      setAnswer(
        error instanceof Error
          ? error.message
          : "Sorry, I couldn't get a response from Gemini."
      );
    } finally {
      setLoading(false);
    }
  };

  // ==============================
  // OPEN MULTIPLE CHAT
  // ==============================

  const openChat = (
    chat: ChatItem
  ) => {
    setActiveChatId(
      chat.id
    );

    setChatHistory(
      chat.messages || []
    );

    setAnswer("");

    setQuestion("");

    setTab("dashboard");
  };

  // ==============================
  // LOAD OLD HISTORY ITEM
  // ==============================

  const openHistory = (
    item: HistoryItem
  ) => {
    setTab("dashboard");

    setQuestion("");

    setAnswer(
      item.answer
    );

    // History item is a separate
    // study session, not an active chat.
    setActiveChatId(null);

    setChatHistory([
      {
        role: "user",
        text: item.question,
      },
      {
        role: "model",
        text: item.answer,
      },
    ]);
  };

  // ==============================
  // START NEW CHAT
  // ==============================

  const startNewChat = () => {
    setQuestion("");
    setAnswer("");
    setChatHistory([]);
    setActiveChatId(null);
    setTab("dashboard");
  };

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "⌂",
    },
    {
      id: "planner",
      label: "Study Planner",
      icon: "◫",
    },
    {
      id: "quiz",
      label: "Quiz Generator",
      icon: "?",
    },
    {
      id: "history",
      label: "Study History",
      icon: "◷",
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f8fc",
        color: "#172033",
        fontFamily:
          "Inter, Arial, sans-serif",
      }}
    >
      {/* HEADER */}

      <header
        style={{
          height: 70,
          background: "white",
          borderBottom:
            "1px solid #e7eaf0",

          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",

          padding:
            "0 32px",
        }}
      >
        {/* LOGO */}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background:
                "#111827",
              color: "white",

              display: "grid",
              placeItems: "center",

              fontWeight: 800,
              fontSize: 18,
            }}
          >
            S
          </div>

          <div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
              }}
            >
              StudyPilot AI
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#7b8495",
              }}
            >
              Your intelligent
              study workspace
            </div>
          </div>
        </div>

        {/* USER AREA */}

        {user ? (
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 12,
            }}
          >
            <div
              style={{
                textAlign:
                  "right",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {user.displayName ||
                  "Student"}
              </div>

              <div
                style={{
                  fontSize: 11,
                  color:
                    "#7b8495",
                }}
              >
                {user.email}
              </div>
            </div>

            {user.photoURL && (
              <img
                src={
                  user.photoURL
                }
                alt="Profile"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius:
                    "50%",
                  objectFit:
                    "cover",
                }}
              />
            )}

            <button
              onClick={
                handleLogout
              }
              style={{
                border:
                  "1px solid #e1e5ec",

                background:
                  "white",

                borderRadius: 10,

                padding:
                  "9px 14px",

                cursor:
                  "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={
              handleLogin
            }
            style={{
              border:
                "1px solid #e1e5ec",

              background:
                "white",

              borderRadius: 10,

              padding:
                "10px 16px",

              cursor:
                "pointer",

              fontWeight: 600,
            }}
          >
            Sign in with Google
          </button>
        )}
      </header>

      {/* MAIN LAYOUT */}

      <div
        style={{
          display: "flex",
          minHeight:
            "calc(100vh - 70px)",
        }}
      >
        {/* SIDEBAR */}

        <aside
          style={{
            width: 230,
            background:
              "white",

            borderRight:
              "1px solid #e7eaf0",

            padding: 20,

            overflowY:
              "auto",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color:
                "#929aaa",

              marginBottom:
                12,

              textTransform:
                "uppercase",
            }}
          >
            Workspace
          </div>

          {navItems.map(
            (item) => (
              <button
                key={
                  item.id
                }
                onClick={() =>
                  setTab(
                    item.id as Tab
                  )
                }
                style={{
                  width: "100%",

                  textAlign:
                    "left",

                  border:
                    "none",

                  borderRadius:
                    10,

                  padding:
                    "12px 14px",

                  marginBottom:
                    6,

                  cursor:
                    "pointer",

                  background:
                    tab ===
                    item.id
                      ? "#eef2ff"
                      : "transparent",

                  color:
                    tab ===
                    item.id
                      ? "#4338ca"
                      : "#4b5563",

                  fontWeight:
                    tab ===
                    item.id
                      ? 700
                      : 500,
                }}
              >
                {item.icon}
                &nbsp;
                {item.label}
              </button>
            )
          )}

          {/* NEW CHAT */}

          {user && (
            <>
              <button
                onClick={
                  startNewChat
                }
                style={{
                  width:
                    "100%",

                  marginTop: 20,

                  padding:
                    "11px 14px",

                  border:
                    "1px solid #e1e5ec",

                  borderRadius:
                    10,

                  background:
                    "white",

                  cursor:
                    "pointer",

                  fontWeight:
                    700,

                  color:
                    "#4338ca",
                }}
              >
                + New Chat
              </button>

              {/* RECENT CHATS */}

              <div
                style={{
                  marginTop: 22,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color:
                      "#929aaa",
                    marginBottom:
                      8,
                    textTransform:
                      "uppercase",
                  }}
                >
                  Recent Chats
                </div>

                {chatsLoading ? (
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        "#929aaa",
                      padding:
                        "8px 4px",
                    }}
                  >
                    Loading chats...
                  </div>
                ) : chats.length ===
                  0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color:
                        "#929aaa",
                      padding:
                        "8px 4px",
                      lineHeight:
                        1.5,
                    }}
                  >
                    No chats yet.
                  </div>
                ) : (
                  <div>
                    {chats.map(
                      (chat) => (
                        <button
                          key={
                            chat.id
                          }
                          onClick={() =>
                            openChat(
                              chat
                            )
                          }
                          style={{
                            width:
                              "100%",

                            textAlign:
                              "left",

                            border:
                              "none",

                            borderRadius:
                              9,

                            padding:
                              "10px 10px",

                            marginBottom:
                              4,

                            cursor:
                              "pointer",

                            background:
                              activeChatId ===
                              chat.id
                                ? "#eef2ff"
                                : "transparent",

                            color:
                              activeChatId ===
                              chat.id
                                ? "#4338ca"
                                : "#4b5563",

                            fontSize:
                              13,

                            fontWeight:
                              activeChatId ===
                              chat.id
                                ? 700
                                : 500,

                            overflow:
                              "hidden",

                            textOverflow:
                              "ellipsis",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          💬{" "}
                          {chat.title}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* CONTENT */}

        <main
          style={{
            flex: 1,
            padding:
              "38px 45px",
          }}
        >
          {/* =====================
              DASHBOARD
          ====================== */}

          {tab ===
            "dashboard" && (
            <>
              <div
                style={{
                  marginBottom:
                    30,
                }}
              >
                <div
                  style={{
                    color:
                      "#6b7280",

                    fontSize: 14,

                    marginBottom:
                      6,
                  }}
                >
                  {user
                    ? `Welcome back, ${
                        user.displayName?.split(
                          " "
                        )[0] ||
                        "Student"
                      } 👋`
                    : "Welcome to StudyPilot AI 👋"}
                </div>

                <h1
                  style={{
                    fontSize: 34,
                    margin: 0,
                    letterSpacing:
                      -1,
                  }}
                >
                  What do you want
                  to learn today?
                </h1>
              </div>

              {/* GEMINI ASSISTANT */}

              <section
                style={{
                  background:
                    "#111827",

                  color:
                    "white",

                  borderRadius:
                    20,

                  padding: 28,

                  marginBottom:
                    28,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity:
                      0.7,

                    letterSpacing:
                      1,
                  }}
                >
                  GEMINI STUDY
                  ASSISTANT
                </div>

                <h2
                  style={{
                    margin:
                      "8px 0 8px",

                    fontSize: 25,
                  }}
                >
                  Ask anything
                  about your studies.
                </h2>

                <p
                  style={{
                    opacity:
                      0.75,

                    marginTop:
                      0,
                  }}
                >
                  Get explanations,
                  examples, summaries
                  and study guidance
                  powered by Gemini.
                </p>

                {/* ACTIVE CHAT TITLE */}

                {activeChatId && (
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 12,
                      opacity: 0.65,
                    }}
                  >
                    {chats.find(
                      (chat) =>
                        chat.id ===
                        activeChatId
                    )?.title ||
                      "Current Chat"}
                  </div>
                )}

                {/* CHAT HISTORY */}

                {chatHistory.length >
                  0 && (
                  <div
                    style={{
                      marginTop:
                        20,

                      display:
                        "flex",

                      flexDirection:
                        "column",

                      gap: 12,

                      maxHeight:
                        380,

                      overflowY:
                        "auto",
                    }}
                  >
                    {chatHistory.map(
                      (
                        message,
                        index
                      ) => (
                        <div
                          key={
                            index
                          }
                          style={{
                            background:
                              message.role ===
                              "user"
                                ? "#273449"
                                : "white",

                            color:
                              message.role ===
                              "user"
                                ? "white"
                                : "#172033",

                            borderRadius:
                              14,

                            padding:
                              16,

                            lineHeight:
                              1.6,
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                12,

                              fontWeight:
                                700,

                              marginBottom:
                                6,

                              opacity:
                                0.75,
                            }}
                          >
                            {message.role ===
                            "user"
                              ? "You"
                              : "✨ Gemini"}
                          </div>

                          <div
                            style={{
                              whiteSpace:
                                "pre-wrap",

                              fontSize:
                                14,
                            }}
                          >
                            {
                              message.text
                            }
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* INPUT */}

                <div
                  style={{
                    display:
                      "flex",

                    gap: 10,

                    marginTop:
                      22,
                  }}
                >
                  <input
                    value={
                      question
                    }
                    onChange={(
                      e
                    ) =>
                      setQuestion(
                        e.target
                          .value
                      )
                    }
                    onKeyDown={(
                      e
                    ) => {
                      if (
                        e.key ===
                          "Enter" &&
                        !loading
                      ) {
                        askGemini();
                      }
                    }}
                    placeholder="e.g. Explain merge sort in simple terms..."
                    style={{
                      flex: 1,

                      padding:
                        "14px 16px",

                      borderRadius:
                        11,

                      border:
                        "none",

                      outline:
                        "none",

                      fontSize:
                        14,
                    }}
                  />

                  <button
                    onClick={
                      askGemini
                    }
                    disabled={
                      loading
                    }
                    style={{
                      padding:
                        "0 22px",

                      borderRadius:
                        11,

                      border:
                        "none",

                      background:
                        loading
                          ? "#d1d5db"
                          : "white",

                      color:
                        "#111827",

                      fontWeight:
                        700,

                      cursor:
                        loading
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {loading
                      ? "Thinking..."
                      : "Ask AI →"}
                  </button>
                </div>

                {/* CURRENT ANSWER */}

                {answer &&
                  chatHistory.length ===
                    0 && (
                    <div
                      style={{
                        marginTop:
                          20,

                        background:
                          "white",

                        color:
                          "#172033",

                        borderRadius:
                          14,

                        padding:
                          20,

                        lineHeight:
                          1.6,
                      }}
                    >
                      <div
                        style={{
                          fontSize:
                            13,

                          fontWeight:
                            700,

                          color:
                            "#4338ca",

                          marginBottom:
                            8,
                        }}
                      >
                        ✨ Gemini
                      </div>

                      <div
                        style={{
                          whiteSpace:
                            "pre-wrap",

                          fontSize:
                            14,
                        }}
                      >
                        {answer}
                      </div>
                    </div>
                  )}
              </section>

              {/* STUDY TOOLS */}

              <h2
                style={{
                  fontSize: 20,
                  marginBottom:
                    16,
                }}
              >
                Study Tools
              </h2>

              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",

                  gap: 18,
                }}
              >
                <FeatureCard
                  icon="📅"
                  title="Study Planner"
                  description="Create a personalized study schedule."
                  onClick={() =>
                    setTab(
                      "planner"
                    )
                  }
                />

                <FeatureCard
                  icon="💡"
                  title="Smart Explainer"
                  description="Understand difficult concepts with Gemini."
                  onClick={() =>
                    setTab(
                      "dashboard"
                    )
                  }
                />

                <FeatureCard
                  icon="🧠"
                  title="Quiz Generator"
                  description="Generate practice questions from any topic."
                  onClick={() =>
                    setTab(
                      "quiz"
                    )
                  }
                />

                <FeatureCard
                  icon="📚"
                  title="Study History"
                  description="Continue your previous AI study sessions."
                  onClick={() =>
                    setTab(
                      "history"
                    )
                  }
                />
              </div>
            </>
          )}

          {/* =====================
              PLANNER
          ====================== */}

          {tab ===
            "planner" && (
            <Page
              title="Study Planner 📅"
              description="Build your personalized study plan with AI."
            />
          )}

          {/* =====================
              QUIZ
          ====================== */}

          {tab ===
            "quiz" && (
            <Page
              title="Quiz Generator 🧠"
              description="Generate quizzes based on your subjects and topics."
            />
          )}

          {/* =====================
              HISTORY
          ====================== */}

          {tab ===
            "history" && (
            <div>
              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "center",

                  marginBottom:
                    20,
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize:
                        32,

                      marginBottom:
                        8,
                    }}
                  >
                    Study History 📚
                  </h1>

                  <p
                    style={{
                      color:
                        "#6b7280",
                    }}
                  >
                    Your previous
                    Gemini study
                    sessions.
                  </p>
                </div>

                <button
                  onClick={
                    startNewChat
                  }
                  style={{
                    border:
                      "none",

                    background:
                      "#111827",

                    color:
                      "white",

                    padding:
                      "11px 16px",

                    borderRadius:
                      10,

                    cursor:
                      "pointer",

                    fontWeight:
                      700,
                  }}
                >
                  + New Chat
                </button>
              </div>

              {historyLoading ? (
                <div
                  style={{
                    background:
                      "white",

                    border:
                      "1px solid #e7eaf0",

                    borderRadius:
                      16,

                    padding: 30,

                    color:
                      "#6b7280",
                  }}
                >
                  Loading your
                  study history...
                </div>
              ) : studyHistory.length ===
                0 ? (
                <div
                  style={{
                    background:
                      "white",

                    border:
                      "1px solid #e7eaf0",

                    borderRadius:
                      16,

                    padding: 35,

                    textAlign:
                      "center",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        40,
                    }}
                  >
                    📚
                  </div>

                  <h3>
                    No study
                    sessions yet
                  </h3>

                  <p
                    style={{
                      color:
                        "#6b7280",
                    }}
                  >
                    Ask Gemini a
                    question and
                    your session
                    will appear
                    here.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display:
                      "flex",

                    flexDirection:
                      "column",

                    gap: 14,
                  }}
                >
                  {studyHistory.map(
                    (item) => (
                      <button
                        key={
                          item.id
                        }
                        onClick={() =>
                          openHistory(
                            item
                          )
                        }
                        style={{
                          textAlign:
                            "left",

                          background:
                            "white",

                          border:
                            "1px solid #e7eaf0",

                          borderRadius:
                            16,

                          padding:
                            20,

                          cursor:
                            "pointer",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              12,

                            color:
                              "#4338ca",

                            fontWeight:
                              700,

                            marginBottom:
                              8,
                          }}
                        >
                          STUDY
                          SESSION
                        </div>

                        <div
                          style={{
                            fontSize:
                              16,

                            fontWeight:
                              700,

                            marginBottom:
                              8,
                          }}
                        >
                          {
                            item.question
                          }
                        </div>

                        <div
                          style={{
                            color:
                              "#6b7280",

                            fontSize:
                              14,

                            lineHeight:
                              1.5,

                            display:
                              "-webkit-box",

                            WebkitLineClamp:
                              2,

                            WebkitBoxOrient:
                              "vertical",

                            overflow:
                              "hidden",
                          }}
                        >
                          {
                            item.answer
                          }
                        </div>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ==================================
// FEATURE CARD
// ==================================

function FeatureCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign:
          "left",

        background:
          "white",

        border:
          "1px solid #e7eaf0",

        borderRadius:
          16,

        padding: 22,

        cursor:
          "pointer",

        transition:
          "0.2s",
      }}
    >
      <div
        style={{
          fontSize: 28,
        }}
      >
        {icon}
      </div>

      <h3
        style={{
          margin:
            "14px 0 7px",

          fontSize: 17,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          margin: 0,

          color:
            "#6b7280",

          fontSize: 14,

          lineHeight:
            1.5,
        }}
      >
        {description}
      </p>
    </button>
  );
}

// ==================================
// GENERIC PAGE
// ==================================

function Page({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1
        style={{
          fontSize: 32,

          marginBottom:
            8,
        }}
      >
        {title}
      </h1>

      <p
        style={{
          color:
            "#6b7280",
        }}
      >
        {description}
      </p>

      <div
        style={{
          marginTop: 30,

          background:
            "white",

          border:
            "1px solid #e7eaf0",

          borderRadius:
            16,

          padding: 30,

          maxWidth: 700,
        }}
      >
        <h3>
          Coming next 🚀
        </h3>

        <p
          style={{
            color:
              "#6b7280",

            lineHeight:
              1.6,
          }}
        >
          This feature will
          be connected to
          Gemini, Firebase
          and Firestore.
        </p>
      </div>
    </div>
  );
}