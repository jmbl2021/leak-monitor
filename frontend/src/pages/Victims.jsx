import { useState, useEffect, useCallback, useMemo } from 'react';
import { victimsApi, analysisApi, monitorsApi } from '../api';
import VictimModal from '../components/VictimModal';

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

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
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [totalCount, setTotalCount] = useState(0);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [filters, setFilters] = useState({
    review_status: '',
    company_type: '',
    group_name: '',
    limit: 50,
    offset: 0
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    company: true,
    group: true,
    type: true,
    country: true,
    ticker: true,
    parent: true,
    date: true,
    status: true,
    secReg: true,
    filing8k: true,
    aiConfidence: true
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

  const handleBulkClassify = async () => {
    if (selectedIds.length === 0) {
      alert('Please select victims to classify');
      return;
    }

    if (!confirm(`Classify ${selectedIds.length} selected victims? This will use API credits.`)) return;

    try {
      setLoading(true);
      await analysisApi.classify(selectedIds);
      alert(`Classified ${selectedIds.length} victims`);
      setSelectedIds([]);
      loadVictims();
    } catch (err) {
      alert('Bulk classify failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkFlag = async () => {
    if (selectedIds.length === 0) {
      alert('Please select victims to flag');
      return;
    }

    const reason = prompt('Reason for flagging (optional):');
    if (reason === null) return; // User cancelled

    try {
      setLoading(true);
      // Flag each victim individually (no bulk endpoint yet)
      await Promise.all(selectedIds.map(id => victimsApi.flag(id, reason || null)));
      alert(`Flagged ${selectedIds.length} victims`);
      setSelectedIds([]);
      loadVictims();
    } catch (err) {
      alert('Bulk flag failed: ' + err.message);
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
    setSelectedIds([]); // Clear selection when changing pages
  };

  const goToPrevPage = () => {
    if (currentPage > 1) goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) goToPage(currentPage + 1);
  };

  const handleJumpToPage = (e) => {
    e.preventDefault();
    const page = parseInt(e.target.elements.pageNumber.value);
    if (page >= 1 && page <= totalPages) {
      goToPage(page);
      e.target.reset();
    } else {
      alert(`Please enter a page number between 1 and ${totalPages}`);
    }
  };

  // Filter victims by search term (client-side for current page)
  // Use debounced search for better performance
  const filteredVictims = debouncedSearch
    ? victims.filter(v =>
        (v.company_name || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (v.victim_raw || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (v.stock_ticker || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (v.parent_company || '').toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : victims;

  // CSV Export handler
  const handleExportCSV = () => {
    try {
      // Prepare CSV data
      const headers = [
        'Company Name',
        'Victim Raw',
        'Group',
        'Type',
        'Country',
        'Ticker',
        'Parent Company',
        'Date',
        'Review Status',
        'SEC Regulated',
        '8-K Filed',
        'AI Confidence'
      ];

      const csvData = filteredVictims.map(v => [
        v.company_name || '',
        v.victim_raw || '',
        v.group_name || '',
        v.company_type || '',
        v.country || '',
        v.stock_ticker || '',
        v.parent_company || '',
        new Date(v.post_date).toLocaleDateString(),
        v.review_status || '',
        v.is_sec_regulated ? 'Yes' : 'No',
        v.has_8k_filing === true ? 'Yes' : v.has_8k_filing === false ? 'No' : 'Unknown',
        v.confidence_score || ''
      ]);

      // Build CSV string
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leak-monitor-victims-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('CSV export failed: ' + err.message);
    }
  };

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
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleClassifyAll}
            className="btn btn-secondary text-sm"
            disabled={loading}
          >
            🤖 Classify All Pending
          </button>
          <div className="relative">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className="btn btn-secondary text-sm"
            >
              ⚙️ Columns
            </button>
            {showColumnSettings && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-10">
                <h4 className="font-semibold text-sm mb-2">Show/Hide Columns</h4>
                {Object.keys(visibleColumns).map(col => (
                  <label key={col} className="flex items-center py-1">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={(e) => setVisibleColumns({...visibleColumns, [col]: e.target.checked})}
                      className="mr-2"
                    />
                    <span className="text-sm">{col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
            className="btn btn-secondary text-sm"
            title={`Switch to ${viewMode === 'table' ? 'card' : 'table'} view`}
          >
            {viewMode === 'table' ? '📱 Cards' : '📊 Table'}
          </button>
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary text-sm"
          >
            📄 CSV
          </button>
          <button
            onClick={handleExport}
            className="btn btn-primary text-sm"
          >
            📥 Excel
          </button>
        </div>
      </div>

      {/* Prominent Search Bar */}
      <div className="card bg-gradient-to-r from-primary-50 to-blue-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by company name, ticker, or parent company..."
            className="flex-1 border-2 border-primary-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-gray-500 hover:text-gray-700 text-xl px-3"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {debouncedSearch && (
          <p className="mt-2 text-sm text-gray-600">
            Searching for: <strong>{debouncedSearch}</strong> ({filteredVictims.length} results)
          </p>
        )}
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
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Results
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing <span className="font-semibold">{filters.offset + 1}</span> - <span className="font-semibold">{Math.min(filters.offset + filteredVictims.length, filters.offset + filters.limit)}</span> of <span className="font-semibold">{totalCount}</span> total
              {selectedIds.length > 0 && (
                <span className="text-primary-600 ml-2">
                  • {selectedIds.length} selected
                </span>
              )}
            </p>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleBulkClassify}
                className="btn btn-secondary text-sm"
              >
                🤖 Classify ({selectedIds.length})
              </button>
              <button
                onClick={handleBulkFlag}
                className="btn btn-secondary text-sm"
              >
                🚩 Flag ({selectedIds.length})
              </button>
              <button
                onClick={handleBulkDelete}
                className="btn btn-danger text-sm"
              >
                🗑️ Delete ({selectedIds.length})
              </button>
            </div>
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
            <p className="text-lg">No victims found matching your filters</p>
            {debouncedSearch && (
              <p className="text-sm mt-2">Try adjusting your search or filters</p>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          // Card View for Mobile/Tablet
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVictims.map((victim) => (
              <div key={victim.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-gray-900 text-sm">
                    {victim.company_name || victim.victim_raw}
                  </h4>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(victim.id)}
                    onChange={() => handleSelectVictim(victim.id)}
                    className="ml-2"
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <div><span className="text-gray-500">Group:</span> <span className="badge badge-secondary text-xs">{victim.group_name}</span></div>
                  {victim.company_type && <div><span className="text-gray-500">Type:</span> <span className={`badge badge-${victim.company_type} text-xs`}>{victim.company_type}</span></div>}
                  {victim.country && <div><span className="text-gray-500">Country:</span> {victim.country}</div>}
                  {victim.stock_ticker && <div><span className="text-gray-500">Ticker:</span> <span className="font-mono text-blue-600">{victim.stock_ticker}</span></div>}
                  {victim.parent_company && <div><span className="text-gray-500">Parent:</span> {victim.parent_company}</div>}
                  <div><span className="text-gray-500">Date:</span> {new Date(victim.post_date).toLocaleDateString()}</div>
                  <div className="flex items-center gap-1">
                    <span className={`badge ${victim.review_status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'} text-xs`}>
                      {victim.review_status === 'pending' ? '⏳ Pending' : '✓ Reviewed'}
                    </span>
                    {victim.lifecycle_status !== 'active' && (
                      <span className={`badge badge-${victim.lifecycle_status} text-xs`}>{victim.lifecycle_status}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedVictim(victim)}
                  className="btn btn-secondary text-xs w-full mt-3"
                >
                  View Details
                </button>
              </div>
            ))}
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
                        title={selectedIds.length === filteredVictims.length ? "Deselect all on this page" : "Select all on this page"}
                      />
                    </th>
                    <th className="px-2 py-2 text-left w-8"></th>
                    {visibleColumns.company && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Company Name
                      </th>
                    )}
                    {visibleColumns.group && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Ransomware Group
                      </th>
                    )}
                    {visibleColumns.type && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Company Type
                      </th>
                    )}
                    {visibleColumns.country && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Country
                      </th>
                    )}
                    {visibleColumns.ticker && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Stock Ticker
                      </th>
                    )}
                    {visibleColumns.parent && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Parent Company
                      </th>
                    )}
                    {visibleColumns.date && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Post Date
                      </th>
                    )}
                    {visibleColumns.status && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Review Status
                      </th>
                    )}
                    {visibleColumns.secReg && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        SEC Regulated
                      </th>
                    )}
                    {visibleColumns.filing8k && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        8-K Filing
                      </th>
                    )}
                    {visibleColumns.aiConfidence && (
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        AI Confidence
                      </th>
                    )}
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
                        {visibleColumns.company && (
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
                        )}
                        {visibleColumns.group && (
                          <td className="px-2 py-2">
                            <span className="badge badge-secondary text-xs">
                              {victim.group_name}
                            </span>
                          </td>
                        )}
                        {visibleColumns.type && (
                          <td className="px-2 py-2 text-sm">
                            {victim.company_type ? (
                              <span className={`badge badge-${victim.company_type} text-xs`}>
                                {victim.company_type}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.country && (
                          <td className="px-2 py-2 text-sm text-gray-600">
                            {victim.country || <span className="text-gray-300">—</span>}
                          </td>
                        )}
                        {visibleColumns.ticker && (
                          <td className="px-2 py-2 text-sm">
                            {victim.stock_ticker ? (
                              <span className="font-mono text-blue-600 font-semibold">
                                {victim.stock_ticker}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.parent && (
                          <td className="px-2 py-2 text-sm text-gray-600">
                            {victim.parent_company ? (
                              <span className="text-xs" title={victim.parent_company}>
                                {victim.parent_company.length > 20
                                  ? victim.parent_company.substring(0, 20) + '...'
                                  : victim.parent_company}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.date && (
                          <td className="px-2 py-2 text-sm text-gray-600">
                            {new Date(victim.post_date).toLocaleDateString()}
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className="px-2 py-2 text-sm">
                            <div className="flex flex-col gap-1">
                              <span className={`badge text-xs ${
                                victim.review_status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {victim.review_status === 'pending' ? '⏳ Pending' : '✓ Reviewed'}
                              </span>
                              {victim.lifecycle_status !== 'active' && (
                                <span className={`badge badge-${victim.lifecycle_status} text-xs`}>
                                  {victim.lifecycle_status}
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {visibleColumns.secReg && (
                          <td className="px-2 py-2 text-sm">
                            {victim.is_sec_regulated ? (
                              <div className="flex flex-col">
                                <span className="text-green-600 font-semibold" title="SEC Regulated">✓</span>
                                {victim.sec_cik && (
                                  <span className="text-xs text-gray-500">{victim.sec_cik}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.filing8k && (
                          <td className="px-2 py-2 text-sm">
                            {victim.has_8k_filing === true ? (
                              <div className="flex flex-col items-center">
                                <span className="text-green-600 font-semibold" title="8-K Filing Found">✓</span>
                                {victim.sec_8k_date && (
                                  <span className="text-xs text-gray-500">
                                    {new Date(victim.sec_8k_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ) : victim.has_8k_filing === false ? (
                              <span className="text-red-400 font-semibold" title="No 8-K Filing Found">✗</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.aiConfidence && (
                          <td className="px-2 py-2 text-sm">
                            {victim.confidence_score ? (
                              <span className={`badge text-xs ${
                                victim.confidence_score === 'high' ? 'bg-green-100 text-green-800' :
                                victim.confidence_score === 'medium' ? 'bg-amber-100 text-amber-800' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {victim.confidence_score === 'high' && '🎯 '}
                                {victim.confidence_score === 'medium' && '⚡ '}
                                {victim.confidence_score}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )}
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
                          <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 3} className="px-4 py-3">
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
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between flex-wrap gap-4">
                {/* Results info */}
                <div className="text-sm">
                  <span className="text-gray-600">Showing </span>
                  <span className="font-semibold text-gray-900">{filters.offset + 1}</span>
                  <span className="text-gray-600"> to </span>
                  <span className="font-semibold text-gray-900">{Math.min(filters.offset + filters.limit, totalCount)}</span>
                  <span className="text-gray-600"> of </span>
                  <span className="font-semibold text-gray-900">{totalCount}</span>
                  <span className="text-gray-600"> results</span>
                </div>

                {/* Pagination controls */}
                <div className="flex items-center gap-2 flex-wrap">
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
                          className={`px-3 py-1 text-sm rounded font-medium ${
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

                  {/* Jump to page */}
                  <form onSubmit={handleJumpToPage} className="flex items-center gap-2 ml-4">
                    <span className="text-sm text-gray-600">Go to:</span>
                    <input
                      type="number"
                      name="pageNumber"
                      min="1"
                      max={totalPages}
                      placeholder={currentPage.toString()}
                      className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary text-sm"
                    >
                      Go
                    </button>
                  </form>
                </div>
              </div>

              {/* Page info */}
              <div className="mt-2 text-xs text-gray-500 text-center">
                Page {currentPage} of {totalPages}
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
