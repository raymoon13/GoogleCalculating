import type { APIRoute } from "astro";
import { google } from "googleapis";

export const GET: APIRoute = async ({ cookies }) => {
    const userCookie = cookies.get("user")?.value;
    const tokensCookie = cookies.get("tokens")?.value;

    if (!userCookie || !tokensCookie) {
        console.log("Unauthorized: missing cookies");
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
        import.meta.env.GOOGLE_CLIENT_ID,
        import.meta.env.GOOGLE_CLIENT_SECRET,
        "http://localhost:4321/api/callback"
    );
    console.log(tokensCookie)
    try {
        oauth2Client.setCredentials(JSON.parse(tokensCookie));
        console.log("OAuth2 credentials set for Admin SDK");
    } catch (err) {
        console.error("Error parsing tokensCookie:", err);
        return new Response(JSON.stringify({ error: "Invalid token format" }), { status: 400 });
    }

    const admin = google.admin({ version: 'directory_v1', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    };

    const stream = new ReadableStream({
        async start(controller) {
            try {
                // Logic for streaming data goes here
                const response = await admin.users.list({
                    customer: 'my_customer',
                    maxResults: 100,
                    orderBy: 'email'
                });

                const users = response.data.users || [];
                const batchSize = 2;
                const totalBatches = Math.ceil(users.length / batchSize);

                controller.enqueue(`data: ${JSON.stringify({
                    type: 'init',
                    totalUsers: users.length,
                    totalBatches,
                    batchSize
                })}\n\n`);

                for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                    const startIndex = batchIndex * batchSize;
                    const endIndex = Math.min(startIndex + batchSize, users.length);
                    const batch = users.slice(startIndex, endIndex);

                    console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} users)`);
                    controller.enqueue(`data: ${JSON.stringify({
                        type: 'batch_start',
                        batchIndex: batchIndex + 1,
                        totalBatches,
                        usersInBatch: batch.length
                    })}\n\n`);

                    if (batchIndex < totalBatches - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }

                controller.enqueue(`data: ${JSON.stringify({
                    type: 'complete'
                })}\n\n`);

            } catch (error) {
                console.error("Error processing user batches:", error);
                controller.enqueue(`data: ${JSON.stringify({
                    type: 'error',
                    message: 'Failed to process user batches'
                })}\n\n`);
            }
        }
    });
    return new Response(stream, { headers });
}