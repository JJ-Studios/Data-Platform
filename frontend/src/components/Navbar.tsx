"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Home", href: "/" },
    { name: "Dashboard", href: "/dashboard" },
    { name: "Ingest", href: "/ingest" }, // Replaces "Scraper" (Future home of Web Scraper, File Uploads)
    { name: "Catalog", href: "/catalog" }, // Replaces "Database" (Data Catalog & Browser)
    { name: "Pipelines", href: "/pipelines" }, // Orchestration & Jobs
    { name: "Lab", href: "/lab" }, // SQL Editor & Transformations
    { name: "AI Chat", href: "/chat" }, // Your AI Assistant
    { name: "AI Analytics", href: "/analytics" },
    { name: "Settings", href: "/settings" }, // API Keys & Config
  ];

  return (
    <nav className="bg-background/90 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-foreground">
              Data Platform
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    pathname === item.href
                      ? "bg-blue-600 text-white"
                      : "text-foreground hover:bg-background/50"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
