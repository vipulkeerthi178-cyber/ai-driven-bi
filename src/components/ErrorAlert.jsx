import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorAlert({ error, retry, title = 'Failed to Load Data' }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="bg-red-50 border-l-4 border-red-500 p-8 rounded-lg max-w-md w-full shadow-lg">
        <div className="flex items-start">
          <AlertTriangle className="w-8 h-8 text-red-600 mr-4 mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-xl font-bold text-red-900 mb-3">
              {title}
            </h3>
            <p className="text-sm text-red-700 mb-5 leading-relaxed">
              {error?.message || error || 'An unexpected error occurred while loading data'}
            </p>
            {retry && (
              <button
                onClick={retry}
                className="bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2 font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
