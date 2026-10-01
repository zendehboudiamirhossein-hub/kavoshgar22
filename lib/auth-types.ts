// تایپ‌های مشترک نشست — امن برای import در کامپوننت‌های کلاینت
export interface SessionUserInfo {
  uid: string;
  username: string;
  role: 'admin' | 'user';
}
