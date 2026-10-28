// De instellingen van de sessiecookie, op één plek voor de middleware en de server (review PR10-02).
//
// HttpOnly: er is bewust geen Supabase-client in de browser, dus JavaScript hoeft de sessie niet te kunnen lezen;
// een lek in de pagina kan het token dan ook niet stelen. Secure: alleen over https (lokaal in ontwikkeling niet,
// daar is het http). De standaard van @supabase/ssr zet beide uit.

export const cookieOpties = {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
} as const;
