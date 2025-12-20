"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import Editor from "@monaco-editor/react";

// --- Types ---

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}

// --- Components ---

const ResultTable = ({ data, columns }: { data: any[]; columns: string[] }) => {
  if (!data || data.length === 0)
    return <div className="text-gray-500 p-4">No results.</div>;

  return (
    <div className="overflow-auto h-full border-t border-gray-700 bg-gray-900/50">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-gray-800 text-gray-200 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-2 font-mono text-xs border-b border-gray-700"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800 font-mono text-xs">
          {data.map((row, idx) => (
            <tr key={idx} className="hover:bg-gray-800/50">
              {columns.map((col) => (
                <td
                  key={`${idx}-${col}`}
                  className="px-4 py-1.5 text-gray-300 border-r border-gray-800 last:border-r-0"
                >
                  {typeof row[col] === "object" && row[col] !== null
                    ? JSON.stringify(row[col])
                    : String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function LabPage() {
  // --- Editor State ---
  const [query, setQuery] = useState("SELECT * FROM youtube_channels LIMIT 10");
  const [results, setResults] = useState<{
    columns: string[];
    rows: any[];
  } | null>(null);
  const [tables, setTables] = useState<{ id: string; name: string }[]>([]);
  // NEW: Store DDL strings for context
  const [tableDDLs, setTableDDLs] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [executionTime, setExecutionTime] = useState(0);

  // --- Chat State ---
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [userId] = useState(
    () => "user_" + Math.random().toString(36).substr(2, 9)
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = "http://localhost:8000";

  // 1. Load Tables for Sidebar
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await axios.get(`${API_BASE}/v1/api/catalog/tables`);
        setTables(res.data);
      } catch (err) {
        console.error("Failed to load tables");
      }
    };
    fetchTables();
  }, []);

  // 2. NEW: Fetch Schemas and generate DDLs for all tables
  useEffect(() => {
    if (tables.length === 0) return;

    const fetchAllDDLs = async () => {
      const newDDLs: Record<string, string> = {};

      const fetchPromises = tables.map(async (table) => {
        try {
          const res = await axios.get(`${API_BASE}/v1/api/catalog/schema`, {
            params: { table_id: table.id },
          });
          const schema: ColumnDef[] = res.data;

          // Generate simple DDL
          const cols = schema
            .map(
              (col) =>
                `  ${col.name} ${col.type} ${
                  col.nullable ? "NULL" : "NOT NULL"
                }`
            )
            .join(",\n");

          newDDLs[table.id] = `CREATE TABLE ${table.id} (\n${cols}\n);`;
        } catch (err) {
          console.warn(`Could not fetch schema for ${table.id}`);
        }
      });

      await Promise.all(fetchPromises);
      setTableDDLs(newDDLs);
    };

    fetchAllDDLs();
  }, [tables]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRun = async () => {
    setLoading(true);
    setError("");
    setResults(null);
    const startTime = performance.now();

    try {
      const res = await axios.post(`${API_BASE}/v1/api/lab/execute`, { query });
      setResults(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Query failed");
    } finally {
      setExecutionTime(performance.now() - startTime);
      setLoading(false);
    }
  };

  const handleInsertTable = (tableName: string) => {
    setQuery((prev) => `${prev} ${tableName}`);
  };

  // --- Chat Logic ---

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInputMessage("");
    setIsChatLoading(true);

    let fullPrompt = userMsg;

    // Inject DDL context if it's the start of the conversation
    if (messages.length < 2) {
      const ddlString = Object.values(tableDDLs).join("\n\n");
      const schemaSummary = tables.map((t) => t.id).join(", ");

      // Use DDLs if we fetched them, otherwise fallback to just names
      const contextData =
        ddlString.length > 0
          ? `Here are the table definitions:\n${ddlString}`
          : `I have these tables: [${schemaSummary}]`;

      fullPrompt = `Context: I have a ClickHouse database. \n${contextData} \n\nUser Request: ${userMsg} \n\nProvide only the SQL query if possible or a brief explanation.`;
    }

    try {
      const response = await fetch(`${API_BASE}/v1/api/chatbot/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, message: fullPrompt }),
      });

      if (!response.ok) throw new Error("Chat failed");
      if (!response.body) return;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.replace("data: ", "");
              const event = JSON.parse(jsonStr);

              if (event.type === "text") {
                setMessages((prev) => {
                  const newArr = [...prev];
                  const lastMsg = newArr[newArr.length - 1];
                  if (lastMsg.role === "assistant") {
                    lastMsg.content += event.content;
                  }
                  return newArr;
                });
              }
            } catch (e) {
              console.error("Error parsing stream", e);
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Could not connect to AI." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background relative">
      {/* Left Sidebar: Schema Browser */}
      <div className="w-56 border-r border-gray-700 bg-gray-900/30 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-sm text-gray-100">
            Schema Browser
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
            Tables
          </div>
          <ul className="space-y-1">
            {tables.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => handleInsertTable(t.id)}
                  className="w-full text-left px-2 py-1.5 text-xs text-blue-300 hover:bg-gray-800 rounded truncate font-mono transition-colors"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Content: Split View (Editor Top, Results Bottom) */}
      <div className="flex-1 flex flex-col min-w-0 relative z-0">
        {/* Toolbar */}
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-gray-900/20">
          <div className="text-xs text-gray-400">
            <span className="mr-4">SQL Editor</span>
            <span className="text-gray-600 hidden sm:inline">
              Cmd+Enter to run
            </span>
          </div>
          <div className="flex items-center space-x-4">
            {executionTime > 0 && !loading && (
              <span className="text-xs text-green-500 font-mono hidden sm:inline">
                {results?.rows.length} rows in{" "}
                {(executionTime / 1000).toFixed(3)}s
              </span>
            )}

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={loading}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                loading
                  ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              }`}
            >
              {loading ? "Running..." : "Run"}
            </button>

            {/* Chat Toggle Button */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`ml-2 p-1.5 rounded-md transition-colors ${
                isChatOpen
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
              title="Toggle AI Assistant"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor Area (Top Half) */}
        <div className="h-[40%] min-h-[200px] border-b border-gray-700 relative group">
          <Editor
            height="100%"
            defaultLanguage="sql"
            theme="vs-dark"
            value={query}
            onChange={(val) => setQuery(val || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Results Area (Bottom Half) */}
        <div className="flex-1 overflow-hidden bg-background relative flex flex-col">
          {error ? (
            <div className="p-4 bg-red-900/20 text-red-200 font-mono text-sm border-b border-red-800/50">
              <span className="font-bold">Error:</span> {error}
            </div>
          ) : (
            results && (
              <ResultTable data={results.rows} columns={results.columns} />
            )
          )}

          {!results && !error && !loading && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Run a query to see results.
            </div>
          )}
        </div>
      </div>

      {/* --- Right Sidebar: Chat Assistant --- */}
      <div
        className={`absolute inset-y-0 right-0 w-96 bg-gray-900 border-l border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col z-10 ${
          isChatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-gray-800/50">
          <h3 className="font-semibold text-gray-100 flex items-center">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            SQL Copilot
          </h3>
          <button
            onClick={() => setIsChatOpen(false)}
            className="text-gray-400 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 text-sm mt-10">
              Ask me to write SQL for you!
              <br />
              <span className="text-xs opacity-70">
                "Show me all channels with less than 1k subs"
              </span>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-lg p-3 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-200 border border-gray-700"
                }`}
              >
                {msg.content}
              </div>

              {/* "Copy Code" shortcut for assistant messages */}
              {msg.role === "assistant" && (
                <button
                  onClick={() => setQuery(msg.content)}
                  className="mt-1 text-[10px] text-blue-400 hover:text-blue-300 flex items-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  Replace Editor Content
                </button>
              )}
            </div>
          ))}
          {isChatLoading && (
            <div className="flex items-start">
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask about your data..."
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={isChatLoading || !inputMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
