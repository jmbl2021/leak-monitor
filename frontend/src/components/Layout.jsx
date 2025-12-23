import { Link, useLocation } from 'react-router-dom';

function Layout({ children }) {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', path: '/', icon: '📊' },
    { name: 'Victims', path: '/victims', icon: '🎯' },
    { name: 'Monitors', path: '/monitors', icon: '👁️' },
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">
                🔒 Leak Monitor
              </h1>
              <span className="ml-3 text-sm text-gray-500">
                Ransomware Victim Tracking
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="https://github.com/jmbl2021/leak-monitor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-gray-900"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  px-3 py-4 text-sm font-medium border-b-2 transition-colors
                  ${
                    isActive(item.path)
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{item.icon}</span>
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            Data sourced from{' '}
            <a
              href="https://www.ransomlook.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700"
            >
              RansomLook.io
            </a>
            {' '}under CC BY 4.0 license
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
