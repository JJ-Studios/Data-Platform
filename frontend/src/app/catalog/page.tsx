"use client";

import { useState, useEffect } from "react";
import axios from "axios";

// --- Types ---
interface TableMeta {
  id: string;
  name: string;
  rowCount: number;
  description: string;
  lastUpdated?: string;
}

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}

export default function CatalogPage() {
  // State
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "schema">("data");

  // Data State
  const [tableData, setTableData] = useState<any[]>([]);
  const [schema, setSchema] = useState<ColumnDef[]>([]);

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Base API URL
  const API_BASE = "http://localhost:8000";

  // 1. Fetch List of Tables on Load
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await axios.get(`${API_BASE}/v1/api/catalog/tables`);
        setTables(res.data);

        // Auto-select first table if available
        if (res.data.length > 0 && !selectedTable) {
          setSelectedTable(res.data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch tables", err);
        setError("Could not load dataset list. Is the backend running?");
      }
    };
    fetchTables();
  }, []);

  // 2. Fetch Data & Schema when Selection Changes
  useEffect(() => {
    if (!selectedTable) return;

    const fetchDataAndSchema = async () => {
      setLoading(true);
      setError("");

      try {
        // Run both requests in parallel for speed
        const [dataRes, schemaRes] = await Promise.all([
          axios.get(`${API_BASE}/v1/api/catalog/data`, {
            params: { table_id: selectedTable, limit: 100 },
          }),
          axios.get(`${API_BASE}/v1/api/catalog/schema`, {
            params: { table_id: selectedTable },
          }),
        ]);

        setTableData(dataRes.data);
        setSchema(schemaRes.data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail || "Failed to load table data.");
      } finally {
        setLoading(false);
      }
    };

    fetchDataAndSchema();
  }, [selectedTable]);

  // Helper to generate SQL DDL on the fly
  const generateDDL = () => {
    if (!selectedTable || schema.length === 0) return "";
    const cols = schema
      .map(
        (col) =>
          `  ${col.name} ${col.type} ${col.nullable ? "NULL" : "NOT NULL"}`
      )
      .join(",\n");
    return `CREATE TABLE ${selectedTable} (\n${cols}\n);`;
  };

  const currentTableMeta = tables.find((t) => t.id === selectedTable);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* Sidebar: Table List */}
      <div className="w-64 border-r border-gray-700 bg-gray-900/30 flex-shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-lg text-foreground">Datasets</h2>
        </div>
        <ul className="p-2 space-y-1">
          {tables.length === 0 && !error && (
            <li className="text-gray-500 text-sm px-3 py-2 italic">
              Loading tables...
            </li>
          )}
          {tables.map((table) => (
            <li key={table.id}>
              <button
                onClick={() => setSelectedTable(table.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedTable === table.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <div className="font-medium truncate">{table.name}</div>
                <div className="text-xs opacity-70 mt-1 flex justify-between">
                  <span>{table.rowCount} rows</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Tabs */}
        <div className="border-b border-gray-700 bg-background/50">
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {currentTableMeta?.name || "Select a Dataset"}
            </h1>
            <p className="text-sm text-gray-400">
              {currentTableMeta?.description || "Browse your scraped data."}
            </p>
          </div>

          {/* Tab Navigation */}
          {selectedTable && (
            <div className="flex px-6 space-x-6">
              <button
                onClick={() => setActiveTab("data")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "data"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Data Preview
              </button>
              <button
                onClick={() => setActiveTab("schema")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "schema"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Schema & DDL
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 relative">
          {error ? (
            <div className="p-4 bg-red-900/20 border border-red-800 text-red-200 rounded">
              {error}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 animate-pulse">
              Loading data...
            </div>
          ) : !selectedTable ? (
            <div className="text-center text-gray-500 mt-20">
              Select a table from the sidebar to view data.
            </div>
          ) : activeTab === "data" ? (
            // --- DATA TAB ---
            <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-800 text-gray-200 border-b border-gray-700">
                    <tr>
                      {schema.length > 0
                        ? schema.map((col) => (
                            <th
                              key={col.name}
                              className="px-4 py-3 font-medium uppercase text-xs tracking-wider"
                            >
                              <div className="flex items-center space-x-1">
                                <span>{col.name}</span>
                                <span className="text-[10px] text-gray-500 font-normal lowercase">
                                  ({col.type})
                                </span>
                              </div>
                            </th>
                          ))
                        : // Fallback if schema fails but data exists (rare)
                          Object.keys(tableData[0] || {}).map((key) => (
                            <th
                              key={key}
                              className="px-4 py-3 text-xs uppercase"
                            >
                              {key}
                            </th>
                          ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {tableData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={schema.length || 1}
                          className="px-4 py-8 text-center text-gray-500"
                        >
                          Table is empty.
                        </td>
                      </tr>
                    ) : (
                      tableData.map((row, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-gray-800/50 transition-colors"
                        >
                          {schema.map((col) => (
                            <td
                              key={col.name}
                              className="px-4 py-3 text-gray-100 border-r border-gray-700/50 last:border-r-0"
                            >
                              {/* Handle objects/arrays for display */}
                              {typeof row[col.name] === "object" &&
                              row[col.name] !== null
                                ? JSON.stringify(row[col.name])
                                : String(row[col.name] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            // --- SCHEMA TAB ---
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Column Definitions */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Column Definitions
                </h3>
                <div className="border border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800 text-gray-200">
                      <tr>
                        <th className="px-4 py-3">Column Name</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Nullable</th>
                        <th className="px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-900/30">
                      {schema.map((col) => (
                        <tr key={col.name}>
                          <td className="px-4 py-3 font-mono text-blue-200 font-medium">
                            {col.name}
                          </td>
                          <td className="px-4 py-3 text-purple-200 font-mono text-xs">
                            {col.type}
                          </td>
                          <td className="px-4 py-3 text-gray-200">
                            {col.nullable ? "Yes" : "No"}
                          </td>
                          <td className="px-4 py-3 text-gray-200 italic">
                            {col.description || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right: DDL Snippet */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">DDL</h3>
                <div className="relative group">
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(generateDDL())
                      }
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="bg-gray-950 p-4 rounded-lg border border-gray-800 font-mono text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
                    {generateDDL()}
                  </pre>
                </div>
                <p className="text-xs text-gray-300">
                  Use this SQL to recreate this table structure in your data
                  warehouse.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
