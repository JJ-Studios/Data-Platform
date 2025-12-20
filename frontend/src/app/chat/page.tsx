"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: string;
  content: string;
}

interface StreamEvent {
  type: string;
  content: string;
  metadata?: Record<string, any>;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId] = useState("test_user");
  // toolActivity is less critical now that we log inline, but we can keep it for the "pulse" effect
  const [toolActivity, setToolActivity] = useState<string>("");
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load Chat History on Mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/v1/api/chatbot/get_chat_history?user_id=${userId}`
        );
        if (!response.ok) return;

        const history = await response.json();

        // Parse PydanticAI history format into UI messages
        const formattedMessages: Message[] = history.flatMap((item: any) => {
          if (!item.parts) return [];

          return item.parts
            .map((part: any) => {
              if (part.part_kind === "user-prompt") {
                return { role: "user", content: part.content };
              } else if (part.part_kind === "text") {
                return { role: "assistant", content: part.content };
              } else if (part.part_kind === "tool-call") {
                return {
                  role: "assistant",
                  content: `\n\n> 🔧 **Tool Call:** ${part.tool_name}\n> \`Args: ${part.args}\`\n`,
                };
              } else if (part.part_kind === "tool-return") {
                let contentDisplay = part.content;
                // Attempt to format JSON objects nicely if possible, otherwise stringify
                if (typeof part.content === "object") {
                  contentDisplay = JSON.stringify(part.content);
                }
                return {
                  role: "assistant",
                  content: `\n> 📋 **Result:** \`${contentDisplay}\`\n\n`,
                };
              }
              return null;
            })
            .filter((msg: Message | null): msg is Message => msg !== null);
        });

        setMessages(formattedMessages);
      } catch (error) {
        console.error("Failed to fetch chat history:", error);
      }
    };

    fetchHistory();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);

    const currentInput = input;
    setInput("");
    setIsLoading(true);
    setToolActivity("");

    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const response = await fetch(
        "http://localhost:8000/v1/api/chatbot/chat/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, message: currentInput }),
        }
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMessage = "";
      let currentPhase = "init"; // Track stream phase to format transitions

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: false });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonData = line.slice(6);
            try {
              const event: StreamEvent = JSON.parse(jsonData);

              switch (event.type) {
                case "thinking":
                  if (currentPhase !== "thinking") {
                    assistantMessage += "\n\n> 🧠 **Thinking:** ";
                    currentPhase = "thinking";
                  }
                  assistantMessage += event.content;

                  // Update UI
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content =
                      assistantMessage;
                    return newMessages;
                  });
                  break;

                case "text":
                  if (currentPhase === "thinking") {
                    assistantMessage += "\n\n"; // Break out of thinking block
                    currentPhase = "text";
                  }
                  assistantMessage += event.content;

                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content =
                      assistantMessage;
                    return newMessages;
                  });
                  break;

                case "tool_call":
                  setToolActivity(`🔧 ${event.content}...`);
                  // Append tool call to the message log
                  assistantMessage += `\n\n> 🔧 **Tool Call:** ${event.content}\n`;
                  if (event.metadata?.args) {
                    assistantMessage += `> \`Args: ${event.metadata.args}\`\n`;
                  }
                  currentPhase = "tool";

                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content =
                      assistantMessage;
                    return newMessages;
                  });
                  break;

                case "tool_result":
                  setToolActivity("");
                  // Append result to the message log
                  assistantMessage += `\n> 📋 **Result:** \`${event.content}\`\n\n`;
                  currentPhase = "tool";

                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content =
                      assistantMessage;
                    return newMessages;
                  });
                  break;

                case "final":
                  // Use the final cleaned output if preferred, or keep the built-up log.
                  // Usually 'final' is just the text response.
                  // If we want to keep the logs, we might ignore overwriting 'content' completely
                  // and just rely on the stream we built.
                  // However, if the backend sends a polished final string, we might want that.
                  // Strategy: If 'final' is substantially different, maybe use it,
                  // but for "showing all steps", relying on the stream buildup is better.
                  // Let's just append any remaining delta if needed or do nothing.
                  // For this implementation, we'll trust our stream buildup.
                  break;

                case "error":
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[
                      newMessages.length - 1
                    ].content += `\n\n**Error:** ${event.content}`;
                    return newMessages;
                  });
                  break;
              }
            } catch (parseError) {
              console.warn("Failed to parse SSE data:", jsonData);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in chat:", error);
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = `[Error occurred: ${
          (error as Error).message
        }]`;
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      setToolActivity("");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">
          AI Chat Assistant
        </h1>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6 shadow-lg flex flex-col h-[calc(100vh-200px)]">
          <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>Start a conversation by sending a message</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg shadow-sm border ${
                    message.role === "user"
                      ? "bg-blue-600/20 border-blue-600/30 ml-10"
                      : "bg-gray-800/80 border-gray-700 mr-10"
                  }`}
                >
                  <div
                    className={`font-bold mb-2 text-xs uppercase tracking-wider ${
                      message.role === "user"
                        ? "text-blue-300"
                        : "text-purple-300"
                    }`}
                  >
                    {message.role === "user" ? "You" : "Assistant"}
                  </div>

                  {/* React Markdown Component */}
                  <div className="markdown-content text-sm text-gray-200 leading-relaxed">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Styling Tables
                        table: ({ node, ...props }) => (
                          <div className="overflow-x-auto my-4 rounded-lg border border-gray-700">
                            <table
                              className="min-w-full divide-y divide-gray-700 bg-gray-900/50"
                              {...props}
                            />
                          </div>
                        ),
                        thead: ({ node, ...props }) => (
                          <thead className="bg-gray-800" {...props} />
                        ),
                        tbody: ({ node, ...props }) => (
                          <tbody
                            className="divide-y divide-gray-700 bg-gray-900/30"
                            {...props}
                          />
                        ),
                        tr: ({ node, ...props }) => (
                          <tr
                            className="hover:bg-gray-800/50 transition-colors"
                            {...props}
                          />
                        ),
                        th: ({ node, ...props }) => (
                          <th
                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                            {...props}
                          />
                        ),
                        td: ({ node, ...props }) => (
                          <td
                            className="px-4 py-3 whitespace-nowrap text-sm text-gray-300"
                            {...props}
                          />
                        ),
                        // Styling Headers
                        h1: ({ node, ...props }) => (
                          <h1
                            className="text-xl font-bold mt-6 mb-4 text-white"
                            {...props}
                          />
                        ),
                        h2: ({ node, ...props }) => (
                          <h2
                            className="text-lg font-bold mt-5 mb-3 text-gray-100"
                            {...props}
                          />
                        ),
                        h3: ({ node, ...props }) => (
                          <h3
                            className="text-md font-bold mt-4 mb-2 text-gray-200"
                            {...props}
                          />
                        ),
                        // Styling Lists
                        ul: ({ node, ...props }) => (
                          <ul
                            className="list-disc list-outside ml-5 mb-4 space-y-1"
                            {...props}
                          />
                        ),
                        ol: ({ node, ...props }) => (
                          <ol
                            className="list-decimal list-outside ml-5 mb-4 space-y-1"
                            {...props}
                          />
                        ),
                        // Styling Blockquotes (Used for Thinking/Tool steps)
                        blockquote: ({ node, ...props }) => (
                          <blockquote
                            className="border-l-4 border-gray-600 pl-4 italic text-gray-400 my-4 bg-gray-800/30 py-2 pr-2 rounded-r"
                            {...props}
                          />
                        ),
                        // Styling Code
                        code: ({
                          node,
                          className,
                          children,
                          ...props
                        }: any) => {
                          const match = /language-(\w+)/.exec(className || "");
                          const isInline =
                            !match && !String(children).includes("\n");
                          return isInline ? (
                            <code
                              className="bg-gray-900 px-1.5 py-0.5 rounded text-red-300 font-mono text-xs"
                              {...props}
                            >
                              {children}
                            </code>
                          ) : (
                            <div className="my-4 rounded-lg overflow-hidden border border-gray-700 bg-gray-950">
                              <code
                                className="block p-4 overflow-x-auto font-mono text-xs text-gray-300"
                                {...props}
                              >
                                {children}
                              </code>
                            </div>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}

            {toolActivity && (
              <div className="flex items-center space-x-2 text-yellow-500 bg-yellow-900/10 px-4 py-2 rounded-lg border border-yellow-900/30 w-fit">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <span className="text-xs font-mono">{toolActivity}</span>
              </div>
            )}

            {isLoading &&
              !messages[messages.length - 1]?.content &&
              !toolActivity && (
                <div className="p-4 rounded-lg bg-gray-800/50 mr-10 border border-gray-700 w-fit">
                  <div className="flex space-x-1.5">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex space-x-2 pt-2 border-t border-gray-700"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none text-white placeholder-gray-500"
              placeholder="Ask about your data..."
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
                isLoading || !input.trim()
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
              }`}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
