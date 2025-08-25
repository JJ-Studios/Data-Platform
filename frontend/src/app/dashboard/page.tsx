"use client";

import { useState, useEffect } from "react";

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"json" | "table">("json");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [tableName, setTableName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  useEffect(() => {
    // Extract available columns when result changes
    if (result) {
      let dataToAnalyze: any[] = [];
      
      if (typeof result === 'string') {
        try {
          const parsedResult = JSON.parse(result);
          // Handle case where content is a JSON string
          let content = parsedResult.content;
          if (typeof content === 'string') {
            try {
              content = JSON.parse(content);
            } catch {
              // If parsing fails, keep as string
            }
          }
          
          if (Array.isArray(content)) {
            dataToAnalyze = content;
          } else if (content && typeof content === 'object') {
            dataToAnalyze = [content];
          }
        } catch {
          // If parsing fails, we can't analyze the structure
          setAvailableColumns([]);
          return;
        }
      } else if (result && typeof result === 'object') {
        let content = result.content;
        // Handle case where content is a JSON string
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch {
            // If parsing fails, keep as string
          }
        }
        
        if (Array.isArray(content)) {
          dataToAnalyze = content;
        } else if (content && typeof content === 'object') {
          dataToAnalyze = [content];
        }
      }
      
      // Extract unique column names from the data
      const columnsSet = new Set<string>();
      dataToAnalyze.forEach(item => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach(key => columnsSet.add(key));
        }
      });
      
      const columns = Array.from(columnsSet);
      setAvailableColumns(columns);
      setSelectedColumns(columns); // Select all by default
    } else {
      setAvailableColumns([]);
      setSelectedColumns([]);
    }
  }, [result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveSuccess(null);
    setSaveError(null);
    setAvailableColumns([]);
    setSelectedColumns([]);
    
    try {
      const response = await fetch("http://localhost:8000/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, prompt }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      // Try to parse the response as JSON, but if that fails, use the raw text
      let parsedData;
      try {
        parsedData = JSON.parse(text);
      } catch {
        // If parsing fails, use the raw text (it might already be formatted JSON)
        parsedData = text;
      }
      setResult(parsedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error submitting form:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDB = async () => {
    if (!tableName.trim()) {
      setSaveError("Table name is required");
      return;
    }
    
    if (selectedColumns.length === 0) {
      setSaveError("At least one column must be selected");
      return;
    }
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(null);
    
    try {
      // Extract data to save
      let dataToSave: any[] = [];
      
      if (typeof result === 'string') {
        try {
          const parsedResult = JSON.parse(result);
          // Handle case where content is a JSON string
          let content = parsedResult.content;
          if (typeof content === 'string') {
            try {
              content = JSON.parse(content);
            } catch {
              // If parsing fails, keep as string
            }
          }
          
          if (Array.isArray(content)) {
            dataToSave = content;
          } else if (content && typeof content === 'object') {
            // Convert object to array with single item
            dataToSave = [content];
          }
        } catch {
          throw new Error("Failed to parse result data");
        }
      } else if (result && typeof result === 'object') {
        let content = result.content;
        // Handle case where content is a JSON string
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch {
            // If parsing fails, keep as string
          }
        }
        
        if (Array.isArray(content)) {
          dataToSave = content;
        } else if (content && typeof content === 'object') {
          // Convert object to array with single item
          dataToSave = [content];
        }
      }
      
      if (dataToSave.length === 0) {
        throw new Error("No data found to save");
      }
      
      // Create column mapping for selected columns (original name to same name)
      const columns: { [key: string]: string } = {};
      selectedColumns.forEach(col => {
        columns[col] = col; // Map original column name to same name
      });
      
      // Filter data to only include selected columns
      const filteredData = dataToSave.map(row => {
        const filteredRow: { [key: string]: any } = {};
        selectedColumns.forEach(col => {
          filteredRow[col] = row[col];
        });
        return filteredRow;
      });
      
      const response = await fetch("http://localhost:8000/v1/save-results", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table_name: tableName,
          data: filteredData,
          columns: columns
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setSaveSuccess(data.message);
      setShowSaveForm(false);
      setTableName("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error saving to database:", err);
    } finally {
      setSaveLoading(false);
    }
  };

  // Function to render table view for different data structures
  const renderTableView = () => {
    if (!result) return null;
    
    // Try to parse if it's a string
    let data;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
      } catch {
        return <div className="text-red-500">Unable to parse data for table view</div>;
      }
    } else {
      data = result;
    }
    
    // Handle case where content is a JSON string
    let content = data?.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        return <div className="text-red-500">Unable to parse content for table view</div>;
      }
    }
    
    if (!content) {
      return <div className="text-red-500">No content found for table view</div>;
    }
    
    // Check if content is an array (list of fights)
    if (Array.isArray(content)) {
      // Handle array of fight data
      const fightData = content;
      
      // Get all unique keys for table headers
      const allKeys = new Set();
      fightData.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });
      const headers = Array.from(allKeys) as string[];
      
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-background/50 rounded-lg">
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} className="px-4 py-2 border-b border-gray-600 text-left">
                    {header.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fightData.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-background/30' : ''}>
                  {headers.map(header => (
                    <td key={header} className="px-4 py-2 border-b border-gray-700">
                      {row[header] !== undefined ? row[header] : 'N/A'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } 
    // Check if we have daily data (array) 
    else if (content.daily_data_last_30_days && Array.isArray(content.daily_data_last_30_days)) {
      // Handle daily data array
      const dailyData = content.daily_data_last_30_days;
      
      // Get all unique keys for table headers
      const allKeys = new Set();
      dailyData.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });
      const headers = Array.from(allKeys) as string[];
      
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-background/50 rounded-lg">
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} className="px-4 py-2 border-b border-gray-600 text-left">
                    {header.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyData.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-background/30' : ''}>
                  {headers.map(header => (
                    <td key={header} className="px-4 py-2 border-b border-gray-700">
                      {row[header] !== undefined ? row[header] : 'N/A'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } 
    // Check if we have fighter data (objects)
    else if (content.fighter_a || content.fighter_b) {
      // Handle fighter data
      const fighters = [];
      if (content.fighter_a) fighters.push({ ...content.fighter_a, fighter: 'Fighter A' });
      if (content.fighter_b) fighters.push({ ...content.fighter_b, fighter: 'Fighter B' });
      
      if (fighters.length === 0) {
        return <div className="text-red-500">No fighter data found</div>;
      }
      
      // Get all unique keys for table headers
      const allKeys = new Set(['fighter']);
      fighters.forEach(fighter => {
        Object.keys(fighter).forEach(key => allKeys.add(key));
      });
      const headers = Array.from(allKeys) as string[];
      
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-background/50 rounded-lg">
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header} className="px-4 py-2 border-b border-gray-600 text-left">
                    {header.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fighters.map((fighter, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-background/30' : ''}>
                  {headers.map(header => (
                    <td key={header} className="px-4 py-2 border-b border-gray-700">
                      {fighter[header] !== undefined ? fighter[header] : 'N/A'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } 
    // Handle generic object data
    else {
      const entries = Object.entries(content);
      if (entries.length === 0) {
        return <div className="text-red-500">No data found for table view</div>;
      }
      
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-background/50 rounded-lg">
            <thead>
              <tr>
                <th className="px-4 py-2 border-b border-gray-600 text-left">Key</th>
                <th className="px-4 py-2 border-b border-gray-600 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, value], index) => (
                <tr key={key} className={index % 2 === 0 ? 'bg-background/30' : ''}>
                  <td className="px-4 py-2 border-b border-gray-700">{key.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 border-b border-gray-700">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Dashboard</h1>
        
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 shadow-lg mb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="url" className="block text-sm font-medium mb-2">
                URL
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://example.com"
                required
              />
            </div>
            
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium mb-2">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full px-4 py-2 bg-background border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your prompt here..."
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className={`w-full font-bold py-3 px-4 rounded-lg transition duration-300 ${
                loading 
                  ? "bg-gray-500 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {loading ? "Processing..." : "Submit"}
            </button>
          </form>
        </div>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-2 text-red-500">Error</h2>
            <p className="text-red-300">{error}</p>
          </div>
        )}
        
        {saveSuccess && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-green-500">Success</h2>
            <p className="text-green-300">{saveSuccess}</p>
          </div>
        )}
        
        {saveError && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-2 text-red-500">Save Error</h2>
            <p className="text-red-300">{saveError}</p>
          </div>
        )}
        
        {result && (
          <div className="bg-green-500/20 border border-green-500 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-green-500">Result</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setViewMode("json")}
                  className={`px-3 py-1 rounded-lg transition ${
                    viewMode === "json"
                      ? "bg-blue-600 text-white"
                      : "bg-background/50 hover:bg-background/70"
                  }`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1 rounded-lg transition ${
                    viewMode === "table"
                      ? "bg-blue-600 text-white"
                      : "bg-background/50 hover:bg-background/70"
                  }`}
                >
                  Table
                </button>
                <button
                  onClick={() => setShowSaveForm(!showSaveForm)}
                  className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition"
                >
                  Save to DB
                </button>
              </div>
            </div>
            
            {showSaveForm && (
              <div className="bg-background/50 p-4 rounded-lg mb-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="Enter table name"
                    className="w-full px-3 py-2 bg-background border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                
                {availableColumns.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                      Select Columns to Save ({selectedColumns.length}/{availableColumns.length} selected)
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-gray-600 rounded-lg p-2 bg-background/30">
                      {availableColumns.map((column) => (
                        <div key={column} className="flex items-center mb-1">
                          <input
                            type="checkbox"
                            id={`column-${column}`}
                            checked={selectedColumns.includes(column)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedColumns([...selectedColumns, column]);
                              } else {
                                setSelectedColumns(selectedColumns.filter(col => col !== column));
                              }
                            }}
                            className="mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`column-${column}`} className="text-sm">
                            {column}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <div>
                    <button
                      onClick={() => setSelectedColumns(availableColumns)}
                      disabled={availableColumns.length === 0}
                      className="px-3 py-1 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm mr-2 disabled:opacity-50"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedColumns([])}
                      disabled={availableColumns.length === 0}
                      className="px-3 py-1 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-sm disabled:opacity-50"
                    >
                      Deselect All
                    </button>
                  </div>
                  <button
                    onClick={handleSaveToDB}
                    disabled={saveLoading || !tableName.trim()}
                    className={`px-4 py-2 rounded-lg font-bold transition ${
                      saveLoading || !tableName.trim()
                        ? "bg-gray-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700 text-white"
                    }`}
                  >
                    {saveLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
            
            {viewMode === "json" ? (
              <pre className="bg-background/50 p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <div className="bg-background/50 p-4 rounded-lg overflow-auto max-h-96">
                {renderTableView()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
