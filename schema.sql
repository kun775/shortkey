-- sk.gs D1 Database Schema
CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,                 -- 短链后缀 (如 swift, a8K2)
    url TEXT NOT NULL,                     -- 目标原始完整 URL
    title TEXT DEFAULT '',                 -- 备注/标题 (用于管理识别)
    clicks INTEGER DEFAULT 0,              -- 累计点击跳转次数
    is_active INTEGER DEFAULT 1,           -- 状态: 1=正常启用, 0=已停用
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- 创建时间 (UTC)
    last_accessed_at DATETIME,             -- 最后一次访问时间 (UTC)
    created_ip TEXT DEFAULT ''             -- 创建者客户端 IP
);

-- 常用查询索引
CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_active ON links(is_active);
CREATE INDEX IF NOT EXISTS idx_links_clicks ON links(clicks DESC);
