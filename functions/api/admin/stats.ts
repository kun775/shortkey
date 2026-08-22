import { Env, LinkRecord } from '../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  try {
    const [summaryResult, todayLinksResult, topLinksResult] = await Promise.all([
      env.DB.prepare(
        'SELECT COUNT(*) as total_links, SUM(clicks) as total_clicks, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_links FROM links'
      ).first<{ total_links: number; total_clicks: number | null; active_links: number }>(),
      
      env.DB.prepare(
        "SELECT COUNT(*) as today_links FROM links WHERE date(created_at) = date('now')"
      ).first<{ today_links: number }>(),

      env.DB.prepare(
        'SELECT slug, url, title, clicks, is_active, created_at FROM links ORDER BY clicks DESC LIMIT 5'
      ).all<LinkRecord>(),
    ]);

    return new Response(
      JSON.stringify({
        total_links: summaryResult?.total_links || 0,
        total_clicks: summaryResult?.total_clicks || 0,
        active_links: summaryResult?.active_links || 0,
        today_links: todayLinksResult?.today_links || 0,
        top_links: topLinksResult.results || [],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
