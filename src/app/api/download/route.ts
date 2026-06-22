import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

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
