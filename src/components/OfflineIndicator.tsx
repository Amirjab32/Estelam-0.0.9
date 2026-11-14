import React from 'react';
import { WifiOff, HardDrive } from 'lucide-react';
import { StorageMode } from '../types.ts';

interface OfflineIndicatorProps {
  isBrowserOnline: boolean;
  storageMode: StorageMode;
  isNativeAndroid: boolean;
  isElectronDesktop: boolean;
  cloudflareKvMissing?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isBrowserOnline,
  storageMode,
  isNativeAndroid,
  isElectronDesktop,
  cloudflareKvMissing = false,
}) => {
  if (isBrowserOnline && storageMode !== 'offline') return null;

  return (
    <div
      role="status"
      className="bg-amber-950/80 border-b border-amber-800/60 text-amber-100 px-4 py-2 text-xs"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isBrowserOnline ? (
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>
            {!isBrowserOnline
              ? 'اتصال اینترنت قطع است — برنامه با حافظه کش آفلاین کار می‌کند و تغییرات پس از وصل اینترنت همگام می‌شوند.'
              : cloudflareKvMissing
                ? 'حافظه Cloudflare KV در تنظیمات Bindings این آدرس متصل نیست — کالاهای جدید فعلاً فقط در همین مرورگر ذخیره می‌شوند و در صفحه ناشناس دیده نمی‌شوند. از منوی همبرگری راهنمای اتصال KV (برای Production و Preview) را ببینید.'
                : isNativeAndroid
                  ? 'حالت نت ملی / آفلاین ابری: استعلام قیمت مستقیماً از دیجی‌کالا داخل اپ اندروید انجام می‌شود و پس از بازگشت اینترنت به فایربیس و کلادفلر ادغام خواهد شد.'
                  : isElectronDesktop
                    ? 'حالت نت ملی / لوکال: استعلام مستقیم از دیجی‌کالا و زمان‌بند ۳ ساعته روی سرور داخلی ویندوز فعال است؛ پس از وصل اینترنت به ابر ادغام می‌شود.'
                    : 'حالت آفلاین محلی فعال است؛ می‌توانید استعلام بگیرید، با فایل JSON بین دستگاه‌ها تبادل کنید و پس از وصل اینترنت همگام‌سازی خودکار انجام می‌شود.'}
          </span>
        </div>
      </div>
    </div>
  );
};
