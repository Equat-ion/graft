import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    const sessionToken = request.cookies.get("better-auth.session_token")?.value;
    const { pathname } = request.nextUrl;

    const isPublicRoute =
        pathname === "/" ||
        pathname === "/login" ||
        pathname.startsWith("/oauth/");

    if (!sessionToken) {
        if (isPublicRoute) {
            return NextResponse.next();
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (pathname === "/login") {
        return NextResponse.redirect(new URL("/app", request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Skip middleware for: API routes, Next.js internals, static files
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).+)",
    ],
};
