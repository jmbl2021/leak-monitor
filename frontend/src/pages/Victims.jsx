import { useState, useEffect } from 'react';
import { victimsApi, analysisApi, monitorsApi } from '../api';
import VictimModal from '../components/VictimModal';

function Victims() {
  const [victims, setVictims] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVictim, setSelectedVictim] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({
    review_status: '',
    company_type: '',
    group_name: '',
    limit: 50
  });

  useEffect(() => {
    loadVictims();
    loadGroups();
  }, [filters, showHidden]);

  const loadVictims = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.review_status) params.review_status = filters.review_status;
      if (filters.company_type) params.company_type = filters.company_type;
      if (filters.group_name) params.group_name = filters.group_name;
      params.limit = filters.limit;
      params.include_hidden = showHidden;

      const data = await victimsApi.list(params);
      setVictims(data);
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

  const handleExport = async () => {
    try {
      const blob = await victimsApi.exportToExcel({
        group_name: filters.group_name || null
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leak-monitor-victims-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleClassifyAll = async () => {
    if (!confirm('Classify all pending victims? This will use API credits.')) return;

    try {
      setLoading(true);
      await analysisApi.classifyAllPending(50);
      alert('Batch classification completed');
      loadVictims();
    } catch (err) {
      alert('Classification failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Please select victims to delete');
      return;
    }

    if (!confirm(`Delete ${selectedIds.length} selected victims? They can be restored later.`)) return;

    try {
      setLoading(true);
      await victimsApi.bulkDelete(selectedIds);
      alert(`Deleted ${selectedIds.length} victims`);
      setSelectedIds([]);
      loadVictims();
    } catch (err) {
      alert('Bulk delete failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === victims.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(victims.map(v => v.id));
    }
  };

  const handleSelectVictim = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Victims</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse and manage ransomware victims
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleClassifyAll}
            className="btn btn-secondary"
            disabled={loading}
          >
            🤖 Classify All Pending
          </button>
          <button
            onClick={handleExport}
            className="btn btn-primary"
          >
            📥 Export to Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Review Status
            </label>
            <select
              value={filters.review_status}
              onChange={(e) => setFilters({ ...filters, review_status: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Type
            </label>
            <select
              value={filters.company_type}
              onChange={(e) => setFilters({ ...filters, company_type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="government">Government</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ransomware Group
            </label>
            <select
              value={filters.group_name}
              onChange={(e) => setFilters({ ...filters, group_name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Groups</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Results Limit
            </label>
            <select
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </div>

        {/* Show Hidden Toggle */}
        <div className="pt-4 border-t">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">
              Show flagged and deleted victims
            </span>
          </label>
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Results ({victims.length})
            {selectedIds.length > 0 && (
              <span className="text-sm text-gray-500 ml-2">
                ({selectedIds.length} selected)
              </span>
            )}
          </h3>
          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="btn btn-danger text-sm"
            >
              🗑️ Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">
            Loading victims...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        ) : victims.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No victims found matching your filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === victims.length && victims.length > 0}
                      onChange={handleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Company/Victim
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Group
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Country
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Post Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    SEC
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {victims.map((victim) => (
                  <tr key={victim.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(victim.id)}
                        onChange={() => handleSelectVictim(victim.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {victim.company_name || victim.victim_raw}
                      </div>
                      {victim.company_name && victim.company_name !== victim.victim_raw && (
                        <div className="text-xs text-gray-500">
                          ({victim.victim_raw})
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="badge badge-secondary text-xs">
                        {victim.group_name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {victim.company_type ? (
                        <span className={`badge badge-${victim.company_type}`}>
                          {victim.company_type}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {victim.country || '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {new Date(victim.post_date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <span className={`badge badge-${victim.review_status}`}>
                          {victim.review_status}
                        </span>
                        {victim.lifecycle_status !== 'active' && (
                          <span className={`badge badge-${victim.lifecycle_status}`}>
                            {victim.lifecycle_status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-center">
                      {victim.is_sec_regulated ? (
                        <span className="text-green-600" title="SEC Regulated">✓</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setSelectedVictim(victim)}
                        className="btn btn-secondary text-xs"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Victim Modal */}
      {selectedVictim && (
        <VictimModal
          victim={selectedVictim}
          onClose={() => setSelectedVictim(null)}
          onUpdate={() => {
            loadVictims();
            setSelectedVictim(null);
          }}
        />
      )}
    </div>
  );
}

export default Victims;
