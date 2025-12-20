"use client";

import { useEffect } from "react";

export default function AnalyticsPage() {
  useEffect(() => {
    // Check if script exists to avoid duplicates
    if (
      !document.querySelector(
        'script[src="https://img.vanna.ai/vanna-components.js"]'
      )
    ) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://img.vanna.ai/vanna-components.js";
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* Container for the Vanna Chat. 
        We give it full height and width, and some padding if you want it "framed".
      */}
      <div className="flex-1 p-4 flex flex-col">
        <div className="flex-1 bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden relative">
          {/* @ts-ignore - Custom element definition handled in types/custom-elements.d.ts */}
          <vanna-chat
            api-base="http://localhost:8000"
            sse-endpoint="http://localhost:8000/api/vanna/v2/chat_sse"
            ws-endpoint="http://localhost:8000/api/vanna/v2/chat_websocket"
            poll-endpoint="http://localhost:8000/api/vanna/v2/chat_poll"
            theme="dark"
            debug
          />
        </div>
      </div>
    </div>
  );
}
