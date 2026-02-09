import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, TrendingUp, Package, 
  AlertTriangle, DollarSign, LogOut, Bot 
} from 'lucide-react';

export default function Dashboard({ user, onLogout, children }) {
  const location = useLocation();
  
  const navigation = [
    { name: 'Executive Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Sales Intelligence', path: '/sales', icon: TrendingUp },
    { name: 'Inventory Management', path: '/inventory', icon: Package },
    { name: 'Risk Management', path: '/risk', icon: AlertTriangle },
    { name: 'Cash Flow Forecast', path: '/cashflow', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-bg">
      {/* Top Navigation */}
      <nav className="bg-primary text-white shadow-lg">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Bot className="w-8 h-8" />
              <div>
                <h1 className="text-xl font-bold">AI Business Intelligence</h1>
                <p className="text-sm text-blue-200">ProGoXperts - Growth Partner</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="font-medium">{user.full_name}</p>
                <p className="text-sm text-blue-200">{user.role}</p>
              </div>
              <button
                onClick={onLogout}
                className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-lg min-h-screen">
          <nav className="p-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
