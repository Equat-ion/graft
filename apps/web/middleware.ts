import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    const sessionToken = request.cookies.get("better-auth.session_token")?.value;
    const { pathname } = request.nextUrl;

    const isLoginPage = pathname === "/login";

    if (!sessionToken) {
        if (isLoginPage) {
            return NextResponse.next();
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (isLoginPage) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    // Skip middleware for: API routes, Next.js internals, static files
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).+)",
    ],
};
