export interface ShortLink {
  slug: string;
  short_url: string;
  url: string;
  title?: string;
  created_at: string;
  clicks?: number;
}

export interface AdminLinkItem {
  slug: string;
  url: string;
  title: string;
  clicks: number;
  is_active: number;
  created_at: string;
  last_accessed_at: string | null;
  created_ip: string;
}

export interface AdminStats {
  total_links: number;
  total_clicks: number;
  active_links: number;
  today_links: number;
  top_links: AdminLinkItem[];
}
