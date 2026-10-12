/**
 * A forwarded development server can run on a different filesystem from Chrome.
 * Do not advertise its local path as a browser workspace. Source maps still work.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
