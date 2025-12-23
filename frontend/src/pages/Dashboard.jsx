import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { victimsApi, healthApi } from '../api';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [recentVictims, setRecentVictims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, healthData, victimsData] = await Promise.all([
        victimsApi.getStats(),
        healthApi.check(),
        victimsApi.list({ limit: 5 })
      ]);
      setStats(statsData);
      setHealth(healthData);
      setRecentVictims(victimsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading dashboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-sm text-gray-500">
          Overview of ransomware victim tracking and monitoring
        </p>
      </div>

      {/* System Health */}
      {health && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
              <p className="text-sm text-gray-500">API v{health.version}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-green-700 font-medium">
                {health.status}
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Database</p>
              <p className="text-lg font-semibold text-gray-900">{health.database}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Monitors</p>
              <p className="text-lg font-semibold text-gray-900">{health.active_monitors}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Victims</p>
              <p className="text-lg font-semibold text-gray-900">{health.total_victims}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">Total Victims</h3>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stats.total_victims}</p>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">Pending Review</h3>
            <p className="mt-2 text-3xl font-bold text-yellow-600">{stats.pending_count}</p>
            <p className="mt-1 text-xs text-gray-500">
              {Math.round((stats.pending_count / stats.total_victims) * 100)}% of total
            </p>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">Reviewed</h3>
            <p className="mt-2 text-3xl font-bold text-green-600">{stats.reviewed_count}</p>
            <p className="mt-1 text-xs text-gray-500">
              {Math.round((stats.reviewed_count / stats.total_victims) * 100)}% of total
            </p>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-gray-500">Ransomware Groups</h3>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {Object.keys(stats.by_group).length}
            </p>
          </div>
        </div>
      )}

      {/* Breakdown Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Review Status */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">By Review Status</h3>
            <div className="space-y-3">
              {Object.entries(stats.by_review_status).map(([status, count]) => (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{status}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        status === 'pending' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(count / stats.total_victims) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Company Type */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">By Company Type</h3>
            <div className="space-y-3">
              {Object.entries(stats.by_company_type).map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${(count / stats.total_victims) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Victims */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Victims</h3>
          <Link to="/victims" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Victim
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Group
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentVictims.map((victim) => (
                <tr key={victim.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-900">
                    {victim.company_name || victim.victim_raw}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {victim.group_name}
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {new Date(victim.post_date).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    <span className={`badge badge-${victim.review_status}`}>
                      {victim.review_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
