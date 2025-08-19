import type { APIRoute } from 'astro';
import { google } from 'googleapis';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const code = url.searchParams.get("code");

    if (!code) {
        return new Response("Code is required", { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
        import.meta.env.GOOGLE_CLIENT_ID,
        import.meta.env.GOOGLE_CLIENT_SECRET,
        "http://localhost:4321/api/callback" // Make sure path matches your route
    );

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        console.log('Setting cookies for user:', userInfo.email);

        cookies.set('user', JSON.stringify({
            id: userInfo.id,
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture
        }), {
            httpOnly: true,
            secure: false,
            sameSite: 'lax', // Changed from 'none' to 'lax'
            maxAge: 60 * 60 * 24 * 7,
            path: "/"
        });

        cookies.set('tokens', JSON.stringify(tokens), {
            httpOnly: true,
            secure: false,
            sameSite: 'lax', // Changed from 'none' to 'lax'
            maxAge: 60 * 60 * 24 * 7,
            path: "/"
        });

        console.log('Cookies set, redirecting...');
        return redirect("/"); // Use relative path

    } catch (error) {
        console.error('OAuth callback error:', error);
        return redirect("/?error=oauth_failed");
    }
};