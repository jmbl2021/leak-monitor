import client from './client';

export const analysisApi = {
  // AI classify victims (single or array)
  classify: async (victimIds) => {
    // Convert single ID to array
    const ids = Array.isArray(victimIds) ? victimIds : [victimIds];
    const response = await client.post('/analyze/classify', {
      victim_ids: ids
    });
    return response.data;
  },

  // AI classify all pending victims
  classifyAllPending: async (limit = 50) => {
    const response = await client.post('/analyze/classify', { limit });
    return response.data;
  },

  // Search news for victim
  searchNews: async (victimId) => {
    const response = await client.post(`/analyze/news/${victimId}`);
    return response.data;
  },

  // Check 8-K filing for victim
  check8K: async (victimId) => {
    const response = await client.post(`/analyze/8k/${victimId}`);
    return response.data;
  },

  // Batch check 8-K filings
  check8KBatch: async (limit = 10) => {
    const response = await client.post('/analyze/8k/batch', null, {
      params: { limit }
    });
    return response.data;
  },
};
