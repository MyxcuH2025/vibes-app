export type ProfileTab = 'vibes' | 'saved';

export type ProfilePostGridItem = {
  id: string;
  media_url: string | null;
  thumbnail_url?: string | null;
  media_type: string;
  caption: string | null;
};
