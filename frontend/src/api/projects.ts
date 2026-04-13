import client from './client';

export const apiProjects = {
  getCurrent: async () => {
    const { data } = await client.get<{ project: string | null }>('/projects/current');
    return data;
  },

  setCurrent: async (path: string) => {
    const { data } = await client.post<{ project: string }>('/projects/current', { path });
    return data;
  },

  closeCurrent: async () => {
    await client.delete('/projects/current');
  },

  getRecent: async () => {
    const { data } = await client.get<{ projects: string[] }>('/projects/recent');
    return data;
  },

  removeRecent: async (path: string) => {
    await client.delete('/projects/recent', { data: { path } });
  },

  browse: async (path?: string) => {
    const { data } = await client.post<{ path: string; isGitRepo: boolean; dirs: { name: string; path: string; isGitRepo: boolean }[] }>(
      '/projects/browse',
      { path }
    );
    return data;
  },

  mkdir: async (parentPath: string, name: string) => {
    const { data } = await client.post<{ path: string }>('/projects/mkdir', { path: parentPath, name });
    return data;
  },

  getDrives: async () => {
    const { data } = await client.get<{ drives: string[] }>('/projects/drives');
    return data;
  },
};
