import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/accounts(.*)",
  "/api/accounts(.*)",
  "/api/oauth/authorize(.*)",
]);

const isPublicApi = createRouteMatcher([
  "/api/mcp(.*)",
  "/api/oauth/token(.*)",
  "/api/oauth/register(.*)",
  "/api/oauth/revoke(.*)",
  "/.well-known/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return NextResponse.next();
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
