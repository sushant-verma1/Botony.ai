import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-6xl mb-4">🩺</div>
      <h1 className="text-6xl font-bold text-blue-600 mb-2">404</h1>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">
        Page Not Found
      </h2>
      <p className="text-gray-500 text-center mb-8 max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/login"
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
      >
        ← Back to login
      </Link>
      <p className="mt-10 text-xs text-gray-400 text-center max-w-xs">
         Medical AI Prototype — For evaluation purposes only. Not a licensed
        medical service.
      </p>
    </div>
  );
}
