import { NextRequest, NextResponse } from 'next/server';

// Only Meta/Instagram CDN media is ever downloaded — restrict the proxy to
// those hosts so it can't be turned into an SSRF fetch-anything endpoint.
const ALLOWED_HOST = /(^|\.)(fbcdn\.net|facebook\.com|cdninstagram\.com|fbsbx\.com)$/i;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOST.test(parsed.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 });
  }

  try {
    const res = await fetch(url, { headers: { Referer: 'https://www.facebook.com/' } });
    if (!res.ok) return NextResponse.json({ error: 'fetch failed' }, { status: 502 });

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const ext = contentType.includes('video') ? '.mp4' : '.jpg';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="ad-creative${ext}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
