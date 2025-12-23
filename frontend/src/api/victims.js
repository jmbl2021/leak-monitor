import client from './client';

export const victimsApi = {
  // List victims with optional filters
  list: async (params = {}) => {
    const response = await client.get('/victims', { params });
    return response.data;
  },

  // Get single victim by ID
  get: async (id) => {
    const response = await client.get(`/victims/${id}`);
    return response.data;
  },

  // Update victim classification
  update: async (id, data) => {
    const response = await client.put(`/victims/${id}`, data);
    return response.data;
  },

  // Get pending victims for classification
  getPending: async (limit = 10) => {
    const response = await client.get('/victims/pending', {
      params: { limit }
    });
    return response.data;
  },

  // Get victim statistics
  getStats: async () => {
    const response = await client.get('/victims/stats');
    return response.data;
  },

  // Export victims to Excel
  exportToExcel: async (params = {}) => {
    const response = await client.post('/victims/export', params, {
      responseType: 'blob'
    });
    return response.data;
  },
};
