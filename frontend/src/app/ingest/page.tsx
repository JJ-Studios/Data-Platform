"use client";

import { useState } from "react";
import axios from "axios";

export default function ScraperPage() {
  // State management
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setData(null);

    try {
      // Axios handles the query string construction automatically via 'params'
      const response = await axios.get(
        "http://127.0.0.1:8000/v1/api/web_scraper/get_web_data",
        {
          params: {
            url: url,
            prompt: prompt,
          },
        }
      );

      // Axios automatically parses JSON, available in response.data
      setData(response.data);
    } catch (err: any) {
      // specific Axios error handling
      if (axios.isAxiosError(err)) {
        // Try to get the specific error message from the backend if available
        const errorMessage = err.response?.data?.detail || err.message;
        setError(`Error: ${errorMessage}`);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Web Scraper</h1>
          <p className="text-gray-400 mt-2">
            Extract structured data from any website using LLM instruction.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-gray-900/50 p-6 rounded-lg border border-gray-700">
          <form onSubmit={handleScrape} className="space-y-4">
            <div>
              <label
                htmlFor="url"
                className="block text-sm font-medium text-gray-200 mb-1"
              >
                Target URL
              </label>
              <input
                id="url"
                type="url"
                required
                placeholder="https://example.com/products"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-600 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium text-gray-200 mb-1"
              >
                Extraction Prompt
              </label>
              <textarea
                id="prompt"
                required
                rows={3}
                placeholder="e.g. Extract a list of products with their price, name, and rating."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full px-4 py-2 rounded bg-gray-800 border border-gray-600 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 rounded font-medium transition-colors ${
                loading
                  ? "bg-blue-800 text-gray-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {loading ? "Extracting Data..." : "Run Scraper"}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-700 text-red-200 rounded">
            {error}
          </div>
        )}

        {/* Results Display */}
        {data && (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Extraction Results
            </h2>
            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 overflow-auto max-h-[500px]">
              <pre className="text-sm text-green-400 font-mono">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
