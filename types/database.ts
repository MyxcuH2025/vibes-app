export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          bio: string | null;
          avatar_url: string | null;
          guild_id: string | null;
          explore_vibe: number;
          brain_vibe: number;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          bio?: string | null;
          avatar_url?: string | null;
          guild_id?: string | null;
          explore_vibe?: number;
          brain_vibe?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          caption: string | null;
          media_url: string | null;
          thumbnail_url: string | null;
          media_type: 'image' | 'video';
          dwell_time_score: number;
          tags: string[];
          guild_id: string | null;
          is_guild_post: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          caption?: string | null;
          media_url?: string | null;
          thumbnail_url?: string | null;
          media_type?: 'image' | 'video';
          dwell_time_score?: number;
          tags?: string[];
          guild_id?: string | null;
          is_guild_post?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['posts']['Insert']>;
      };
      guilds: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          member_count: number;
          vibe_tags: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          member_count?: number;
          vibe_tags?: string[];
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['guilds']['Insert']>;
      };
    };
  };
};
