import client from './client';

export const healthApi = {
  // Get health status
  check: async () => {
    const response = await client.get('/health');
    return response.data;
  },
};
