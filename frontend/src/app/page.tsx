export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Welcome to Data Platform</h1>
          <p className="text-lg mb-8">
            Your one-stop solution for data processing and analysis
          </p>
          <div className="text-center text-gray-500">
            <p>Use the navigation bar above to access different features</p>
          </div>
        </div>
      </div>
    </div>
  );
}
