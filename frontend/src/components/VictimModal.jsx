import { useState, useEffect } from 'react';
import { victimsApi, analysisApi } from '../api';

function VictimModal({ victim, onClose, onUpdate }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    company_type: 'unknown',
    region: '',
    country: '',
    stock_ticker: '',
    is_sec_regulated: false,
    sec_cik: '',
    is_subsidiary: false,
    parent_company: '',
    has_adr: false,
    notes: ''
  });

  useEffect(() => {
    if (victim) {
      setFormData({
        company_name: victim.company_name || '',
        company_type: victim.company_type || 'unknown',
        region: victim.region || '',
        country: victim.country || '',
        stock_ticker: victim.stock_ticker || '',
        is_sec_regulated: victim.is_sec_regulated || false,
        sec_cik: victim.sec_cik || '',
        is_subsidiary: victim.is_subsidiary || false,
        parent_company: victim.parent_company || '',
        has_adr: victim.has_adr || false,
        notes: victim.notes || ''
      });
    }
  }, [victim]);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await victimsApi.update(victim.id, formData);
      alert('Victim updated successfully');
      setIsEditMode(false);
      onUpdate();
    } catch (err) {
      alert('Failed to update victim: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAIClassify = async () => {
    if (!confirm('Run AI classification on this victim? This will use API credits.')) return;

    try {
      setLoading(true);
      const result = await analysisApi.classify(victim.id);
      if (result[0]?.success) {
        alert('Classification completed: ' + (result[0].company_name || 'Unknown'));
      } else {
        alert('Classification failed: ' + (result[0]?.error || 'Unknown error'));
      }
      onUpdate();
    } catch (err) {
      alert('Failed to classify: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchNews = async () => {
    if (!confirm('Search news for this victim? This will use API credits.')) return;

    try {
      setLoading(true);
      const result = await analysisApi.searchNews(victim.id);
      if (result.success) {
        alert('News search completed: ' + (result.news_found ? 'Coverage found' : 'No coverage found'));
      } else {
        alert('News search failed: ' + (result.error || 'Unknown error'));
      }
      onUpdate();
    } catch (err) {
      alert('Failed to search news: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheck8K = async () => {
    try {
      setLoading(true);
      const result = await analysisApi.check8k(victim.id);
      if (result.success) {
        alert('8-K check completed: ' + (result.found ? 'Filing found' : 'No filing found'));
      } else {
        alert('8-K check failed: ' + (result.error || 'Unknown error'));
      }
      onUpdate();
    } catch (err) {
      alert('Failed to check 8-K: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFlag = async () => {
    const reason = prompt('Enter reason for flagging as junk (optional):');
    if (reason === null) return; // User cancelled

    try {
      setLoading(true);
      await victimsApi.flag(victim.id, reason);
      alert('Victim flagged as junk');
      onUpdate();
      onClose();
    } catch (err) {
      alert('Failed to flag victim: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this victim? It can be restored later.')) return;

    try {
      setLoading(true);
      await victimsApi.delete(victim.id);
      alert('Victim deleted');
      onUpdate();
      onClose();
    } catch (err) {
      alert('Failed to delete victim: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm('Restore this victim to active status?')) return;

    try {
      setLoading(true);
      await victimsApi.restore(victim.id);
      alert('Victim restored');
      onUpdate();
      onClose();
    } catch (err) {
      alert('Failed to restore victim: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!victim) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative" onClick={(e) => e.stopPropagation()}>
        {/* Header - Sticky */}
        <div className="sticky top-0 bg-white z-10 pb-4 mb-2 border-b border-gray-200 -mt-6 -mx-6 px-6 pt-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-gray-900">{victim.victim_raw}</h3>
              <div className="mt-2 flex gap-2 flex-wrap">
                <span className="badge badge-secondary">{victim.group_name}</span>
                <span className={`badge badge-${victim.review_status}`}>
                  {victim.review_status}
                </span>
                <span className={`badge badge-${victim.lifecycle_status}`}>
                  {victim.lifecycle_status}
                </span>
                {victim.post_date && (
                  <span className="text-sm text-gray-500">
                    Posted: {new Date(victim.post_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center text-3xl font-light flex-shrink-0 ml-4"
              title="Close (or click outside)"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Company Info Section */}
          <div className="card bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Company Information</h4>
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="btn btn-secondary text-sm"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Type
                </label>
                <select
                  value={formData.company_type}
                  onChange={(e) => setFormData({ ...formData, company_type: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                >
                  <option value="unknown">Unknown</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="government">Government</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Ticker
                </label>
                <input
                  type="text"
                  value={formData.stock_ticker}
                  onChange={(e) => setFormData({ ...formData, stock_ticker: e.target.value.toUpperCase() })}
                  disabled={!isEditMode}
                  placeholder="e.g., AAPL, MSFT"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Region
                </label>
                <input
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* SEC/Regulatory Section */}
          <div className="card bg-gray-50">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">SEC / Regulatory Info</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_sec_regulated}
                    onChange={(e) => setFormData({ ...formData, is_sec_regulated: e.target.checked })}
                    disabled={!isEditMode}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">SEC Regulated</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SEC CIK
                </label>
                <input
                  type="text"
                  value={formData.sec_cik}
                  onChange={(e) => setFormData({ ...formData, sec_cik: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_subsidiary}
                    onChange={(e) => setFormData({ ...formData, is_subsidiary: e.target.checked })}
                    disabled={!isEditMode}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Is Subsidiary</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parent Company
                </label>
                <input
                  type="text"
                  value={formData.parent_company}
                  onChange={(e) => setFormData({ ...formData, parent_company: e.target.value })}
                  disabled={!isEditMode}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_adr}
                    onChange={(e) => setFormData({ ...formData, has_adr: e.target.checked })}
                    disabled={!isEditMode}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Has ADR</span>
                </label>
              </div>
            </div>
          </div>

          {/* AI Analysis Section (Read-only) */}
          {(victim.confidence_score || victim.ai_notes || victim.news_summary) && (
            <div className="card bg-blue-50">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">AI Analysis</h4>
              <div className="space-y-3">
                {victim.confidence_score && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Confidence: </span>
                    <span className={`badge ${
                      victim.confidence_score === 'high' ? 'badge-reviewed' :
                      victim.confidence_score === 'medium' ? 'badge-pending' : 'badge-unknown'
                    }`}>
                      {victim.confidence_score}
                    </span>
                  </div>
                )}
                {victim.ai_notes && (
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-1">AI Notes:</span>
                    <p className="text-sm text-gray-600 bg-white p-2 rounded">{victim.ai_notes}</p>
                  </div>
                )}
                {victim.news_summary && (
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-1">News Summary:</span>
                    <p className="text-sm text-gray-600 bg-white p-2 rounded">{victim.news_summary}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={!isEditMode}
              rows="3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            {/* AI Actions */}
            <div className="flex-1 min-w-fit">
              <h5 className="text-sm font-medium text-gray-700 mb-2">AI Actions</h5>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleAIClassify}
                  disabled={loading}
                  className="btn btn-primary text-sm"
                >
                  AI Classify
                </button>
                <button
                  type="button"
                  onClick={handleSearchNews}
                  disabled={loading}
                  className="btn btn-secondary text-sm"
                >
                  Search News
                </button>
                <button
                  type="button"
                  onClick={handleCheck8K}
                  disabled={loading}
                  className="btn btn-secondary text-sm"
                >
                  Check 8-K
                </button>
              </div>
            </div>

            {/* Lifecycle Actions */}
            <div className="flex-1 min-w-fit">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Manage</h5>
              <div className="flex gap-2 flex-wrap">
                {isEditMode ? (
                  <>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary text-sm"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditMode(false)}
                      className="btn btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                  </>
                ) : victim.lifecycle_status !== 'active' ? (
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={loading}
                    className="btn btn-primary text-sm"
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleFlag}
                      disabled={loading}
                      className="btn btn-secondary text-sm"
                    >
                      Flag as Junk
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      className="btn btn-danger text-sm"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VictimModal;
