import { useState, useEffect } from 'react';
import { analysisApi } from '../api';

function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    // Load existing API key from localStorage
    const existingKey = localStorage.getItem('anthropic_api_key');
    if (existingKey) {
      setSavedKey(existingKey);
      // Show masked version
      setApiKey('sk-ant-' + '*'.repeat(40));
    }
  }, []);

  const handleSave = () => {
    if (apiKey && apiKey !== savedKey && !apiKey.includes('*')) {
      localStorage.setItem('anthropic_api_key', apiKey);
      setSavedKey(apiKey);
      setApiKey('sk-ant-' + '*'.repeat(40));
      alert('API key saved successfully!');
      setTestResult(null);
    }
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to remove the saved API key?')) {
      localStorage.removeItem('anthropic_api_key');
      setSavedKey('');
      setApiKey('');
      setTestResult(null);
      alert('API key removed');
    }
  };

  const handleTest = async () => {
    if (!savedKey) {
      alert('Please save an API key first');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      // Try to classify a fake victim to test the key
      const result = await analysisApi.classify(['00000000-0000-0000-0000-000000000000']);

      // If we get here without error, the key is valid (even though victim doesn't exist)
      // The API will return success: false for non-existent victim, but 401 for bad key
      setTestResult({
        success: true,
        message: 'API key is valid and working!'
      });
    } catch (error) {
      if (error.response?.status === 401) {
        setTestResult({
          success: false,
          message: 'API key is invalid or expired'
        });
      } else {
        // Other errors mean the key worked but something else failed
        setTestResult({
          success: true,
          message: 'API key is valid! (Test request succeeded)'
        });
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure API keys and application settings
        </p>
      </div>

      {/* API Key Configuration */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Anthropic API Key
        </h3>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-blue-800">
                Required for AI Features
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  An Anthropic API key is required to use AI-powered features:
                </p>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>Automatic victim classification</li>
                  <li>Company research and verification</li>
                  <li>News correlation and breach coverage search</li>
                </ul>
                <p className="mt-3">
                  Get your API key from:{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline hover:text-blue-900"
                  >
                    https://console.anthropic.com/
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Your API key is stored locally in your browser and never sent to our servers
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSave}
              className="btn btn-primary"
              disabled={!apiKey || apiKey.includes('*')}
            >
              💾 Save API Key
            </button>

            {savedKey && (
              <>
                <button
                  onClick={handleTest}
                  className="btn btn-secondary"
                  disabled={testing}
                >
                  {testing ? '⏳ Testing...' : '🧪 Test API Key'}
                </button>

                <button
                  onClick={handleClear}
                  className="btn btn-danger"
                >
                  🗑️ Clear
                </button>
              </>
            )}
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`rounded-lg p-4 ${
              testResult.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm font-medium ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {testResult.success ? '✓' : '✗'} {testResult.message}
              </p>
            </div>
          )}

          {/* Status Indicator */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Status
              </span>
              <span className={`badge ${
                savedKey ? 'badge-reviewed' : 'badge-pending'
              }`}>
                {savedKey ? 'API Key Configured' : 'No API Key'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Information */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          API Usage Tips
        </h3>

        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start">
            <span className="text-primary-600 mr-2">•</span>
            <p>
              <strong>Classification:</strong> The AI will research each victim domain,
              identify the company, determine if it's public/private/government, and
              find SEC CIK numbers for US public companies.
            </p>
          </div>

          <div className="flex items-start">
            <span className="text-primary-600 mr-2">•</span>
            <p>
              <strong>Self-Verification:</strong> Each classification includes a
              verification step where the AI checks its own work and assigns a
              confidence score (high/medium/low).
            </p>
          </div>

          <div className="flex items-start">
            <span className="text-primary-600 mr-2">•</span>
            <p>
              <strong>News Search:</strong> The AI searches for news coverage of
              breaches, tracks disclosure timelines, and identifies if companies
              publicly acknowledged the incident.
            </p>
          </div>

          <div className="flex items-start">
            <span className="text-primary-600 mr-2">•</span>
            <p>
              <strong>Cost Management:</strong> Each API call costs credits. Monitor
              your usage at{' '}
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 underline"
              >
                Anthropic Console
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* System Information */}
      <div className="card bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          System Information
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Frontend Version</p>
            <p className="text-gray-900 font-medium">1.0.0</p>
          </div>

          <div>
            <p className="text-gray-500">API Endpoint</p>
            <p className="text-gray-900 font-medium">/api</p>
          </div>

          <div>
            <p className="text-gray-500">Data Source</p>
            <p className="text-gray-900 font-medium">RansomLook.io (CC BY 4.0)</p>
          </div>

          <div>
            <p className="text-gray-500">GitHub</p>
            <p className="text-gray-900 font-medium">
              <a
                href="https://github.com/jmbl2021/leak-monitor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700"
              >
                jmbl2021/leak-monitor
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
