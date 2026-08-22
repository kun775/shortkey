import { Env, LinkRecord } from '../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '15')));
  const keyword = url.searchParams.get('keyword')?.trim() || '';
  const status = url.searchParams.get('status'); // 'all', '1', '0'
  const offset = (page - 1) * limit;

  try {
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (keyword) {
      whereClauses.push('(slug LIKE ? OR url LIKE ? OR title LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (status === '1' || status === '0') {
      whereClauses.push('is_active = ?');
      params.push(parseInt(status));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const listQuery = `SELECT * FROM links ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const countQuery = `SELECT COUNT(*) as total FROM links ${whereSql}`;

    const [dataResult, countResult] = await Promise.all([
      env.DB.prepare(listQuery).bind(...params, limit, offset).all<LinkRecord>(),
      env.DB.prepare(countQuery).bind(...params).first<{ total: number }>(),
    ]);

    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return new Response(
      JSON.stringify({
        list: dataResult.results,
        total,
        page,
        limit,
        totalPages,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('Fetch links error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
