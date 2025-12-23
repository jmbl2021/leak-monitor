import { useState, useEffect } from 'react';
import { monitorsApi } from '../api';

function Monitors() {
  const [monitors, setMonitors] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    group_name: '',
    start_date: '',
    end_date: '',
    poll_interval_hours: 6,
    auto_expire_days: 30
  });

  useEffect(() => {
    loadMonitors();
    loadGroups();
  }, []);

  const loadMonitors = async () => {
    try {
      setLoading(true);
      const data = await monitorsApi.list();
      setMonitors(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await monitorsApi.getGroups();
      setGroups(data);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await monitorsApi.create({
        ...formData,
        end_date: formData.end_date || null
      });
      setShowCreateForm(false);
      setFormData({
        group_name: '',
        start_date: '',
        end_date: '',
        poll_interval_hours: 6,
        auto_expire_days: 30
      });
      loadMonitors();
    } catch (err) {
      alert('Failed to create monitor: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this monitor?')) return;

    try {
      await monitorsApi.delete(id);
      loadMonitors();
    } catch (err) {
      alert('Failed to delete monitor: ' + err.message);
    }
  };

  const handlePoll = async (id, groupName) => {
    try {
      const result = await monitorsApi.poll(id);
      alert(
        `Polled ${groupName}:\n` +
        `New victims: ${result.inserted}\n` +
        `Duplicates: ${result.skipped}`
      );
      loadMonitors();
    } catch (err) {
      alert('Failed to poll monitor: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Monitors</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage ransomware group monitoring
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn btn-primary"
        >
          + Create Monitor
        </button>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Create Monitor</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ransomware Group *
                </label>
                <select
                  required
                  value={formData.group_name}
                  onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a group</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  required
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (optional)
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Poll Interval (hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={formData.poll_interval_hours}
                  onChange={(e) => setFormData({ ...formData, poll_interval_hours: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auto Expire (days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.auto_expire_days}
                  onChange={(e) => setFormData({ ...formData, auto_expire_days: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monitors List */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Active Monitors ({monitors.filter(m => m.is_active).length})
        </h3>

        {loading ? (
          <div className="text-center py-12 text-gray-500">
            Loading monitors...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        ) : monitors.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No monitors configured. Create one to start tracking ransomware groups.
          </div>
        ) : (
          <div className="space-y-4">
            {monitors.map((monitor) => (
              <div
                key={monitor.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {monitor.group_name}
                      </h4>
                      <span
                        className={`badge ${
                          monitor.is_active ? 'badge-reviewed' : 'badge-unknown'
                        }`}
                      >
                        {monitor.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Start:</span>{' '}
                        <span className="text-gray-900">{monitor.start_date}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">End:</span>{' '}
                        <span className="text-gray-900">{monitor.end_date || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Interval:</span>{' '}
                        <span className="text-gray-900">{monitor.poll_interval_hours}h</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Last Poll:</span>{' '}
                        <span className="text-gray-900">
                          {monitor.last_poll_at
                            ? new Date(monitor.last_poll_at).toLocaleString()
                            : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handlePoll(monitor.id, monitor.group_name)}
                      className="btn btn-primary text-sm"
                      disabled={!monitor.is_active}
                    >
                      🔄 Poll Now
                    </button>
                    <button
                      onClick={() => handleDelete(monitor.id)}
                      className="btn btn-danger text-sm"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Monitors;
