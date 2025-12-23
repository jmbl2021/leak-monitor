import client from './client';

export const monitorsApi = {
  // List all monitors
  list: async () => {
    const response = await client.get('/monitors');
    return response.data;
  },

  // Create new monitor
  create: async (data) => {
    const response = await client.post('/monitors', data);
    return response.data;
  },

  // Delete monitor
  delete: async (id) => {
    const response = await client.delete(`/monitors/${id}`);
    return response.data;
  },

  // Poll monitor for new victims
  poll: async (id) => {
    const response = await client.post(`/monitors/${id}/poll`);
    return response.data;
  },

  // Get available ransomware groups
  getGroups: async () => {
    const response = await client.get('/monitors/groups/list');
    return response.data;
  },
};
