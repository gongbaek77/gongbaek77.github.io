import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ANANTHEO',
    short_name: 'ANANTHEO',
    description: '나는 다시 피어난다.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0a0a0a',
    lang: 'ko',
    icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  }
}

