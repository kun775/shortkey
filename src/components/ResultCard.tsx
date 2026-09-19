import React, { useState } from 'react';
import { Copy, Check, QrCode, ExternalLink, Download, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ShortLink } from '../types';

interface ResultCardProps {
  link: ShortLink;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ link, showToast }) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link.short_url);
      setCopied(true);
      if (navigator.vibrate) navigator.vibrate(50);
      showToast('已复制短链接到剪贴板！', 'success');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast('复制失败，请手动复制', 'error');
    }
  };

  const handleDownloadQr = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20, 360, 360);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `sk_gs_${link.slug}_qrcode.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
        showToast('二维码已保存至本地', 'success');
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="w-full rounded-xl border border-brand-200/80 bg-white p-6 animate-slide-up sm:p-7 dark:border-brand-900/60 dark:bg-slate-900">
      <div className="flex flex-col gap-4">
        {/* Header indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              短链接已就绪
            </span>
          </div>
          {link.title && (
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              {link.title}
            </span>
          )}
        </div>

        {/* Short URL Banner */}
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-brand-200/70 bg-brand-50/50 p-4 sm:flex-row sm:items-center dark:border-brand-900/60 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Share2 className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <span className="truncate font-mono text-base font-semibold tracking-title text-slate-900 sm:text-lg dark:text-white">
              {link.short_url}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium transition-colors active:scale-95 sm:flex-initial ${
                copied
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                  : 'bg-brand-600 text-white hover:bg-brand-500'
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? '已复制！' : '复制短链'}</span>
            </button>

            <button
              onClick={() => setShowQr((prev) => !prev)}
              className="flex items-center justify-center rounded-md border border-slate-200/80 bg-white p-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="查看二维码"
            >
              <QrCode className="h-4 w-4" />
            </button>

            <a
              href={link.short_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-md border border-slate-200/80 bg-white p-2.5 text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              title="新窗口打开测试"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Target URL Destination */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="shrink-0 font-medium">目标网址:</span>
          <span className="truncate underline underline-offset-2 decoration-slate-300 dark:decoration-slate-700">
            {link.url}
          </span>
        </div>

        {/* QR Code Drawer / Section */}
        {showQr && (
          <div className="mt-2 flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-6 animate-fade-in dark:border-slate-800 dark:bg-slate-800/80">
            <div className="rounded-lg bg-white p-4">
              <QRCodeSVG
                id="qr-code-svg"
                value={link.short_url}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleDownloadQr}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                <Download className="h-3.5 w-3.5" />
                <span>下载二维码 (PNG)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
