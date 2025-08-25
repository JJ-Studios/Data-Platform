"use client";

import { useState } from "react";

export default function DatabaseInterface() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    setColumns(null);
    setMessage(null);
    
    try {
      const response = await fetch("http://localhost:8000/v1/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.results) {
        // SELECT query results
        setResults(data.results);
        setColumns(data.columns);
      } else {
        // Non-SELECT query (INSERT, UPDATE, DELETE)
        setMessage(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error executing query:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Database Interface</h1>
        
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 shadow-lg mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="query" className="block text-sm font-medium mb-2">
                SQL Query
              </label>
              <textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={6}
                className="w-full px-4 py-2 bg-background border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                placeholder="Enter your SQL query here..."
                required
              />
            </div>
            
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">
                <span>Database: generic.db</span>
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-2 rounded-lg font-bold transition duration-300 ${
                  loading 
                    ? "bg-gray-500 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {loading ? "Executing..." : "Execute Query"}
              </button>
            </div>
          </form>
        </div>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-2 text-red-500">Error</h2>
            <p className="text-red-300">{error}</p>
          </div>
        )}
        
        {message && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-green-500">Success</h2>
            <p className="text-green-300">{message}</p>
          </div>
        )}
        
        {results && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-green-500">Query Results</h2>
              <span className="text-sm text-gray-400">
                {results.length} {results.length === 1 ? "row" : "rows"}
              </span>
            </div>
            
            {results.length > 0 && columns && (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-background/50 rounded-lg">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="px-4 py-2 border-b border-gray-600 text-left">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-background/30' : ''}>
                        {columns.map((column) => (
                          <td key={column} className="px-4 py-2 border-b border-gray-700">
                            {row[column] !== undefined ? String(row[column]) : 'NULL'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}