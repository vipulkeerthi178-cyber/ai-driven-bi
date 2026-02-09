export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg">
      <div className="relative">
        {/* Spinner */}
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>

        {/* Inner circle for better visual */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="w-8 h-8 bg-white rounded-full"></div>
        </div>
      </div>

      {/* Loading message */}
      <p className="mt-6 text-gray-600 font-medium">{message}</p>
    </div>
  )
}
