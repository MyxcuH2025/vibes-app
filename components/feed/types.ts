export type FeedItemData = {
  id: string;
  author: string;
  caption: string;
  tag: string;
  tags: string[];
  gradient: string[];
  accentColor: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: string;
  authorId?: string;
  avatarUrl?: string | null;
};
