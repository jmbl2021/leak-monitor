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
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    review_status: '',
    company_type: '',
    group_name: '',
    limit: 50,
    offset: 0
  });

  useEffect(() => {
    loadVictims();
    loadGroups();
  }, [filters, showHidden]);

  // Load total count on initial load and filter changes
  useEffect(() => {
    loadTotalCount();
  }, [filters.review_status, filters.company_type, filters.group_name, showHidden]);

  const loadVictims = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.review_status) params.review_status = filters.review_status;
      if (filters.company_type) params.company_type = filters.company_type;
      if (filters.group_name) params.group_name = filters.group_name;
      params.limit = filters.limit;
      params.offset = filters.offset;
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

  const loadTotalCount = async () => {
    try {
      const stats = await victimsApi.getStats();
      // Use total from stats, adjusted for filters
      // For now, use total_victims as approximation
      // In future, backend could return filtered count
      setTotalCount(stats.total_victims);
    } catch (err) {
      console.error('Failed to load total count:', err);
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

  const toggleRowExpand = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Pagination handlers
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;
  const totalPages = Math.ceil(totalCount / filters.limit);

  const goToPage = (page) => {
    const newOffset = (page - 1) * filters.limit;
    setFilters({ ...filters, offset: newOffset });
    setExpandedRows(new Set());
  };

  const goToPrevPage = () => {
    if (currentPage > 1) goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) goToPage(currentPage + 1);
  };

  // Filter victims by search term (client-side for current page)
  const filteredVictims = searchTerm
    ? victims.filter(v =>
        (v.company_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.victim_raw || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : victims;

  // Truncate text helper
  const truncateText = (text, maxLength = 100) => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Company name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Review Status
            </label>
            <select
              value={filters.review_status}
              onChange={(e) => setFilters({ ...filters, review_status: e.target.value, offset: 0 })}
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
              onChange={(e) => setFilters({ ...filters, company_type: e.target.value, offset: 0 })}
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
              onChange={(e) => setFilters({ ...filters, group_name: e.target.value, offset: 0 })}
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
              Per Page
            </label>
            <select
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value), offset: 0 })}
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
            Results ({filteredVictims.length} shown, {totalCount} total)
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
        ) : filteredVictims.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No victims found matching your filters
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === filteredVictims.length && filteredVictims.length > 0}
                        onChange={handleSelectAll}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Company/Victim
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Group
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Country
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      SEC
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      AI
                    </th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredVictims.map((victim) => (
                    <>
                      <tr key={victim.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(victim.id)}
                            onChange={() => handleSelectVictim(victim.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => toggleRowExpand(victim.id)}
                            className="text-gray-400 hover:text-gray-600"
                            title={expandedRows.has(victim.id) ? "Collapse" : "Expand"}
                          >
                            {expandedRows.has(victim.id) ? '▼' : '▶'}
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm font-medium text-gray-900">
                            {victim.company_name || victim.victim_raw}
                          </div>
                          {victim.company_name && victim.company_name !== victim.victim_raw && (
                            <div className="text-xs text-gray-500">
                              ({victim.victim_raw})
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className="badge badge-secondary text-xs">
                            {victim.group_name}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-sm">
                          {victim.company_type ? (
                            <span className={`badge badge-${victim.company_type}`}>
                              {victim.company_type}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600">
                          {victim.country || '-'}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600">
                          {new Date(victim.post_date).toLocaleDateString()}
                        </td>
                        <td className="px-2 py-2 text-sm">
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
                        <td className="px-2 py-2 text-sm">
                          {victim.is_sec_regulated ? (
                            <div className="flex flex-col">
                              <span className="text-green-600" title="SEC Regulated">✓</span>
                              {victim.sec_cik && (
                                <span className="text-xs text-gray-500">{victim.sec_cik}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-sm">
                          {victim.confidence_score ? (
                            <span className={`badge ${
                              victim.confidence_score === 'high' ? 'badge-reviewed' :
                              victim.confidence_score === 'medium' ? 'badge-pending' : 'badge-unknown'
                            }`}>
                              {victim.confidence_score}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setSelectedVictim(victim)}
                            className="btn btn-secondary text-xs"
                            title="Edit details"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                      {/* Expanded Row */}
                      {expandedRows.has(victim.id) && (
                        <tr key={`${victim.id}-expanded`} className="bg-blue-50">
                          <td colSpan="11" className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              {/* Left Column */}
                              <div className="space-y-2">
                                <div>
                                  <span className="font-medium text-gray-700">Region: </span>
                                  <span className="text-gray-600">{victim.region || '-'}</span>
                                </div>
                                {victim.is_subsidiary && (
                                  <div>
                                    <span className="font-medium text-gray-700">Parent Company: </span>
                                    <span className="text-gray-600">{victim.parent_company || '-'}</span>
                                  </div>
                                )}
                                {victim.has_adr && (
                                  <div>
                                    <span className="font-medium text-gray-700">Has ADR: </span>
                                    <span className="text-green-600">Yes</span>
                                  </div>
                                )}
                                {victim.notes && (
                                  <div>
                                    <span className="font-medium text-gray-700">Notes: </span>
                                    <span className="text-gray-600">{victim.notes}</span>
                                  </div>
                                )}
                              </div>
                              {/* Right Column - AI Analysis */}
                              <div className="space-y-2">
                                {victim.ai_notes && (
                                  <div>
                                    <span className="font-medium text-gray-700">AI Analysis: </span>
                                    <p className="text-gray-600 mt-1 text-xs bg-white p-2 rounded border max-h-32 overflow-y-auto">
                                      {victim.ai_notes}
                                    </p>
                                  </div>
                                )}
                                {victim.news_summary && (
                                  <div>
                                    <span className="font-medium text-gray-700">News: </span>
                                    <p className="text-gray-600 mt-1 text-xs bg-white p-2 rounded border max-h-32 overflow-y-auto">
                                      {victim.news_summary}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Showing {filters.offset + 1} - {Math.min(filters.offset + filters.limit, totalCount)} of {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 1}
                  className="btn btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>

                {/* Page numbers */}
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-1 text-sm rounded ${
                          currentPage === pageNum
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={goToNextPage}
                  disabled={currentPage >= totalPages}
                  className="btn btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
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
