import client from './client';

export const analysisApi = {
  // AI classify victims
  classify: async (victimIds) => {
    const response = await client.post('/analyze/classify', {
      victim_ids: victimIds
    });
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
