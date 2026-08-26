-- =============================================================================
-- 旧短链服务 D1 `links` → sk.gs `links` 数据导入
-- =============================================================================
-- 旧表（截图）:
--   id INTEGER PK, url TEXT, slug TEXT, ua TEXT, ip TEXT,
--   status INT, create_time DATE
-- 本表 (schema.sql):
--   slug TEXT PK, url TEXT NOT NULL, title TEXT, clicks INTEGER,
--   is_active INTEGER, created_at DATETIME, last_accessed_at DATETIME,
--   created_ip TEXT
--
-- 字段映射:
--   slug        <- slug（去空白；空/重复则跳过，因本库 slug 是主键）
--   url         <- url（TRIM；空则跳过）
--   title       <- ''（不导入旧库 ua）
--   clicks      <- 0（旧库无点击量）
--   is_active   <- CASE status: 1 保持启用，其它（含 0/NULL）视为停用
--   created_at  <- create_time 转成 ISO（把「2024年08月26日」收成 2024-08-26；空则 CURRENT_TIMESTAMP）
--   created_ip  <- ip
--   last_accessed_at <- NULL
--
-- 用法（任选其一）:
--
-- A. 旧库与本库是两份独立 D1（推荐）:
--    1) 从旧库导出:
--       npx wrangler d1 export <旧库名> --remote --output=legacy.sql
--    2) 把本文件里「导入查询」拷到 Cloudflare D1 控制台 / wrangler execute
--       执行前先把源数据装进本库的临时表 legacy_links（见下方）
--
-- B. 已把旧表数据 COPY 进本库临时表 `legacy_links` 后，直接跑第三节。
--
-- C. 在【旧库】D1 控制台只跑下面这一段（必须整段一起提交，不要拆行当列名）：
--    SELECT 第一列必须起别名 sql，结果复制到本库执行。
--    日期统一写成 YYYY-MM-DD，避免 CSV/控制台把「年/月/日」导出成乱码。
-- =============================================================================

-- 旧库控制台生成 INSERT（日期去中文）:
-- SELECT
--   'INSERT OR IGNORE INTO links (slug, url, title, clicks, is_active, created_at, last_accessed_at, created_ip) VALUES ('
--   || quote(TRIM(slug)) || ', '
--   || quote(TRIM(url)) || ', '
--   || quote('') || ', 0, '
--   || CASE WHEN status = 1 THEN 1 ELSE 0 END || ', '
--   || quote(COALESCE(
--        CASE
--          WHEN create_time GLOB '*年*月*日*' THEN
--            REPLACE(REPLACE(REPLACE(TRIM(create_time), '年', '-'), '月', '-'), '日', '')
--          ELSE TRIM(create_time)
--        END,
--        CURRENT_TIMESTAMP
--      )) || ', NULL, '
--   || quote(COALESCE(TRIM(ip), '')) || ');'
--   AS sql
-- FROM links
-- WHERE TRIM(COALESCE(slug, '')) <> ''
--   AND TRIM(COALESCE(url, '')) <> '';

-- ---------------------------------------------------------------------------
-- 1. 临时表：结构与旧服务一致，用来承接导出数据
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legacy_links (
  id INTEGER,
  url TEXT,
  slug TEXT,
  ua TEXT,
  ip TEXT,
  status INT,
  create_time DATE
);

-- ---------------------------------------------------------------------------
-- 2. 把旧库数据装进 legacy_links
--    若你从旧 D1 控制台「Export」得到 INSERT 语句，把表名改成 legacy_links
--    再在本库执行即可。下面是形状示例（不要直接跑示例值）:
--
-- INSERT INTO legacy_links (id, url, slug, ua, ip, status, create_time) VALUES
--   (1, 'https://example.com', 'abc1', 'Mozilla/5.0', '1.2.3.4', 1, '2024-01-01');
-- ---------------------------------------------------------------------------

-- 导入前预览：会写入多少行、会因空 slug/空 url/本库已占用而被丢掉多少
-- SELECT
--   COUNT(*) AS legacy_total,
--   SUM(CASE WHEN TRIM(COALESCE(slug, '')) = '' THEN 1 ELSE 0 END) AS skip_empty_slug,
--   SUM(CASE WHEN TRIM(COALESCE(url,  '')) = '' THEN 1 ELSE 0 END) AS skip_empty_url
-- FROM legacy_links;

-- ---------------------------------------------------------------------------
-- 3. 正式导入（冲突 slug 跳过，不覆盖本库已有短链）
--    若旧库同一 slug 有多行，只保留 id 最大的那条。
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO links (
  slug,
  url,
  title,
  clicks,
  is_active,
  created_at,
  last_accessed_at,
  created_ip
)
SELECT
  TRIM(src.slug) AS slug,
  TRIM(src.url) AS url,
  '' AS title,
  0 AS clicks,
  CASE WHEN src.status = 1 THEN 1 ELSE 0 END AS is_active,
  COALESCE(
    CASE
      WHEN src.create_time GLOB '*年*月*日*' THEN
        REPLACE(REPLACE(REPLACE(TRIM(src.create_time), '年', '-'), '月', '-'), '日', '')
      ELSE TRIM(src.create_time)
    END,
    CURRENT_TIMESTAMP
  ) AS created_at,
  NULL AS last_accessed_at,
  COALESCE(TRIM(src.ip), '') AS created_ip
FROM legacy_links AS src
INNER JOIN (
  SELECT slug, MAX(id) AS max_id
  FROM legacy_links
  WHERE TRIM(COALESCE(slug, '')) <> ''
    AND TRIM(COALESCE(url, '')) <> ''
  GROUP BY slug
) AS uniq
  ON uniq.slug = src.slug AND uniq.max_id = src.id
WHERE TRIM(COALESCE(src.slug, '')) <> ''
  AND TRIM(COALESCE(src.url, '')) <> '';

-- ---------------------------------------------------------------------------
-- 4. 核对
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) AS imported FROM links;
-- SELECT COUNT(*) AS leftover FROM legacy_links
--   WHERE TRIM(COALESCE(slug, '')) <> ''
--     AND TRIM(slug) NOT IN (SELECT slug FROM links);

-- 确认无误后删掉临时表:
-- DROP TABLE IF EXISTS legacy_links;
