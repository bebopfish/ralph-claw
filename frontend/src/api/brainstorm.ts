import client from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StoryDraft {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

export const apiBrainstorm = {
  chat: async (messages: ChatMessage[]): Promise<{ content: string; stories: StoryDraft[] | null }> => {
    const { data } = await client.post('/brainstorm/chat', { messages });
    return data;
  },
};
